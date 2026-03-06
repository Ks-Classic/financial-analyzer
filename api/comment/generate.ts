import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI, type ResponseSchema, SchemaType } from '@google/generative-ai';

/**
 * コメント生成API（構造化出力 + 自動バリデーション対応）
 * 今月の画像データと前月コメントを元に、新しいコメントを生成する
 * 
 * POST /api/comment/generate
 */

interface GenerateRequest {
    targetPage: {
        pageNumber: number;
        pageTitle: string;
        currentImage: string;      // 今月データ画像 (base64)
        previousImage?: string;    // 前月レポート画像 (base64)
        previousComment?: string;  // 抽出済み前月コメント
    };
    contextPages?: {
        pageNumber: number;
        pageTitle: string;
        currentImage: string;
    }[];
    systemPrompt: string;
    pagePrompt?: string;
    modelName?: string;
}

// ============================================================================
// 構造化出力スキーマ定義
// ============================================================================

const COMMENT_RESPONSE_SCHEMA: ResponseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        comment: {
            type: SchemaType.STRING,
            description: 'PowerPoint用プレーンテキストのコメント本文。マークダウン記法は一切使用しないこと。',
        },
        extracted_numbers: {
            type: SchemaType.ARRAY,
            description: '画像から読み取り、コメントで言及した数値の一覧',
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    label: { type: SchemaType.STRING, description: '数値の説明（例: 売上高 前月比）' },
                    value: { type: SchemaType.NUMBER, description: '数値' },
                    unit: { type: SchemaType.STRING, description: '単位（千円、%、個 等）' },
                    change_pct: { type: SchemaType.NUMBER, description: '変化率（%）。不明の場合は0', nullable: true },
                },
                required: ['label', 'value', 'unit'],
            },
        },
        variation_factors: {
            type: SchemaType.ARRAY,
            description: 'コメントで言及した変動要因の一覧',
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    factor: { type: SchemaType.STRING, description: '要因の説明' },
                    contribution_pct: { type: SchemaType.NUMBER, description: '全体変動に対する寄与度（%）' },
                    source: {
                        type: SchemaType.STRING,
                        description: '情報源。必ず image_data / previous_comment / context_page のいずれか。外部知識は使用禁止。',
                        enum: ['image_data', 'previous_comment', 'context_page', 'unknown'],
                    },
                },
                required: ['factor', 'contribution_pct', 'source'],
            },
        },
        confidence_score: {
            type: SchemaType.NUMBER,
            description: '出力全体の確信度。0.0〜1.0。画像が不鮮明・数値が読み取れない場合は低くなる。',
        },
        data_source: {
            type: SchemaType.STRING,
            description: 'コメント生成に使用したデータソース',
            enum: ['image_only', 'image_and_context', 'image_and_previous'],
        },
        speculative_flag: {
            type: SchemaType.BOOLEAN,
            description: 'コメントに推測的な内容が含まれる場合true。ソース限定制約に従い、trueになるべきではない。',
        },
    },
    required: ['comment', 'confidence_score', 'data_source', 'speculative_flag'],
};

// ============================================================================
// バリデーション
// ============================================================================

interface ValidationResult {
    valid: boolean;
    reason: string;
    severity: 'error' | 'warning';
}

/** 禁止表現チェック */
const BANNED_WORDS = [
    '著しく', '僅かに', 'おおむね', '概ね', '大幅に',
    '微増', '微減', '横ばい', 'やや', '若干',
    '顕著に', '急激に', '緩やかに', '堅調', '低調',
];

/** 推量表現パターン */
const SPECULATIVE_PATTERNS = [
    /と考えられ/,
    /と思われ/,
    /の影響と見られ/,
    /の可能性があ/,
    /ものと推測/,
    /ではないかと/,
    /と見込まれ/,
    /の影響もあり/,
    /季節的な/,
    /市場環境の/,
];

interface StructuredOutput {
    comment: string;
    extracted_numbers?: Array<{ label: string; value: number; unit: string; change_pct?: number | null }>;
    variation_factors?: Array<{ factor: string; contribution_pct: number; source: string }>;
    confidence_score: number;
    data_source: string;
    speculative_flag: boolean;
}

function validateOutput(output: StructuredOutput): ValidationResult[] {
    const results: ValidationResult[] = [];

    // 1. 禁止表現チェック
    const foundBanned = BANNED_WORDS.filter(w => output.comment.includes(w));
    if (foundBanned.length > 0) {
        results.push({
            valid: false,
            reason: `禁止表現を検出: ${foundBanned.join(', ')}`,
            severity: 'error',
        });
    }

    // 2. 推量表現チェック
    const foundSpeculative = SPECULATIVE_PATTERNS.filter(p => p.test(output.comment));
    if (foundSpeculative.length > 0) {
        results.push({
            valid: false,
            reason: `推量・推測表現を検出（${foundSpeculative.length}件）`,
            severity: 'error',
        });
    }

    // 3. AI自己申告の推測フラグ
    if (output.speculative_flag) {
        results.push({
            valid: false,
            reason: 'AI自身が推測的内容を含むと判定（speculative_flag: true）',
            severity: 'error',
        });
    }

    // 4. データソース違反チェック
    if (output.variation_factors && output.variation_factors.length > 0) {
        const externalSources = output.variation_factors.filter(
            f => !['image_data', 'previous_comment', 'context_page', 'unknown'].includes(f.source)
        );
        if (externalSources.length > 0) {
            results.push({
                valid: false,
                reason: `ソース限定制約違反: 外部知識を使用した要因分析を検出`,
                severity: 'error',
            });
        }
    }

    // 5. 80%カバールールチェック
    if (output.variation_factors && output.variation_factors.length > 0) {
        const sorted = [...output.variation_factors].sort((a, b) => b.contribution_pct - a.contribution_pct);
        let cumulative = 0;
        let factorsNeeded = 0;
        for (const f of sorted) {
            cumulative += f.contribution_pct;
            factorsNeeded++;
            if (cumulative >= 80) break;
        }
        const excessFactors = output.variation_factors.length - factorsNeeded;
        if (excessFactors > 1) { // 1個程度の超過は許容
            results.push({
                valid: false,
                reason: `80%カバールール超過: ${factorsNeeded}要因で80%達成だが${output.variation_factors.length}要因が列挙（${excessFactors}要因が過剰）`,
                severity: 'warning',
            });
        }
    }

    // 6. 確信度チェック
    if (output.confidence_score < 0.7) {
        results.push({
            valid: false,
            reason: `確信度が低い: ${(output.confidence_score * 100).toFixed(0)}%（閾値70%未満）`,
            severity: 'warning',
        });
    }

    // 7. マークダウン記法チェック
    if (/[#*_>]/.test(output.comment.replace(/[「」（）]/g, ''))) {
        // かぎ括弧と全角括弧を除外してからチェック
        const mdPatterns = [/^#+\s/m, /\*\*[^*]+\*\*/, /^[-*]\s/m, /^>\s/m];
        const foundMd = mdPatterns.filter(p => p.test(output.comment));
        if (foundMd.length > 0) {
            results.push({
                valid: false,
                reason: 'マークダウン記法を検出（PowerPointプレーンテキスト形式に違反）',
                severity: 'error',
            });
        }
    }

    return results;
}

// ============================================================================
// Data URI パーサー
// ============================================================================

function parseDataUri(dataUri: string): { mimeType: string; data: string } | null {
    if (!dataUri) return null;

    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
        return { mimeType: match[1], data: match[2] };
    }

    if (/^[A-Za-z0-9+/]+={0,2}$/.test(dataUri.slice(0, 100))) {
        return { mimeType: 'image/jpeg', data: dataUri };
    }

    return null;
}

// ============================================================================
// メインハンドラー
// ============================================================================

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    // CORSヘッダー
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const {
            targetPage,
            contextPages,
            systemPrompt,
            pagePrompt,
            modelName = 'gemini-3.1-pro-preview'
        } = req.body as GenerateRequest;

        if (!targetPage || !targetPage.currentImage) {
            return res.status(400).json({
                success: false,
                error: 'targetPage with currentImage is required'
            });
        }

        if (!systemPrompt) {
            return res.status(400).json({
                success: false,
                error: 'systemPrompt is required'
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error: 'GEMINI_API_KEY is not configured'
            });
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        // 構造化出力対応モデルの取得
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: COMMENT_RESPONSE_SCHEMA,
                temperature: 0.3, // 財務分析は低温で再現性重視
            },
        });

        const startTime = Date.now();

        // プロンプト構築
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        // システムプロンプト
        parts.push({ text: systemPrompt });

        // 構造化出力用の追加指示
        parts.push({
            text: `\n\n【構造化出力の注意事項】
・commentフィールドにPowerPoint用プレーンテキストのコメントを出力してください
・extracted_numbersには、コメントで言及した全ての数値を列挙してください
・variation_factorsには、変動要因を寄与度（%）付きで列挙してください
・sourceは必ず image_data / previous_comment / context_page のいずれかにしてください
・外部知識（季節要因、市場動向等）は source に含めないでください
・confidence_scoreは画像の読み取り精度に応じて0.0〜1.0で設定してください
・speculative_flagは推測的な内容を含む場合のみtrueにしてください（原則falseであるべき）`
        });

        // 対象ページ情報
        parts.push({
            text: `\n\n## 対象ページ: P${targetPage.pageNumber} - ${targetPage.pageTitle}\n`
        });

        // 前月コメントがあれば追加
        if (targetPage.previousComment) {
            parts.push({
                text: `\n### 前月コメント（参考）:\n${targetPage.previousComment}\n\n上記のコメントのトーン・文体を参考にしてください。\n`
            });
        }

        // 前月レポート画像があれば追加
        if (targetPage.previousImage) {
            const parsedPrevImage = parseDataUri(targetPage.previousImage);
            if (parsedPrevImage) {
                parts.push({ text: '\n### 前月レポート画像:' });
                parts.push({
                    inlineData: {
                        mimeType: parsedPrevImage.mimeType,
                        data: parsedPrevImage.data,
                    },
                });
            }
        }

        // 今月データ画像
        const parsedCurrentImage = parseDataUri(targetPage.currentImage);
        if (!parsedCurrentImage) {
            return res.status(400).json({
                success: false,
                error: 'Invalid currentImage format. Expected base64 or data URI.',
            });
        }
        parts.push({ text: '\n### 今月データ画像（これを分析してコメントを生成）:' });
        parts.push({
            inlineData: {
                mimeType: parsedCurrentImage.mimeType,
                data: parsedCurrentImage.data,
            },
        });

        // コンテキストページがあれば追加
        if (contextPages && contextPages.length > 0) {
            parts.push({ text: '\n\n## 参考: 他のページのデータ' });

            for (const ctx of contextPages.slice(0, 3)) {
                const parsedCtxImage = parseDataUri(ctx.currentImage);
                if (parsedCtxImage) {
                    parts.push({
                        text: `\n### P${ctx.pageNumber} - ${ctx.pageTitle}:`
                    });
                    parts.push({
                        inlineData: {
                            mimeType: parsedCtxImage.mimeType,
                            data: parsedCtxImage.data,
                        },
                    });
                }
            }
        }

        // ページ固有プロンプト
        if (pagePrompt) {
            parts.push({
                text: `\n\n## 追加指示:\n${pagePrompt}`
            });
        }

        // 最終指示
        parts.push({
            text: `\n\n---
上記を踏まえて、今月のコメントをJSON構造で生成してください。

【重要：commentフィールドの出力形式ルール】
・マークダウン記法は一切使用禁止です（#、**、__、-、*、> など全て禁止）
・太字・斜体・見出し記号などの装飾記法は絶対に使わないでください
・プレーンテキストのみで出力してください
・箇条書きを使う場合は「・」（中黒）を先頭に付けてください
・段落の先頭は全角スペース1つでインデントしてください
・強調したい部分は「」（かぎ括弧）で囲むか、文末に（重要）と付けてください`
        });

        // API呼び出し
        const result = await model.generateContent(parts);
        const response = await result.response;
        const rawText = response.text().trim();

        // 構造化出力のパース
        let structured: StructuredOutput;
        try {
            structured = JSON.parse(rawText) as StructuredOutput;
        } catch {
            // JSONパース失敗時はフォールバック（テキスト出力として扱う）
            console.warn('Structured output parse failed, falling back to plain text');
            return res.status(200).json({
                success: true,
                generatedComment: rawText,
                processingTime: Date.now() - startTime,
                modelUsed: modelName,
                pageNumber: targetPage.pageNumber,
                validation: {
                    passed: false,
                    issues: ['構造化出力のパースに失敗。テキスト出力として返却。'],
                },
            });
        }

        // バリデーション実行
        const validationResults = validateOutput(structured);
        const errors = validationResults.filter(v => v.severity === 'error');
        const warnings = validationResults.filter(v => v.severity === 'warning');

        const processingTime = Date.now() - startTime;

        return res.status(200).json({
            success: true,
            // UIとの後方互換性: generatedComment は今まで通り文字列
            generatedComment: structured.comment,
            processingTime,
            modelUsed: modelName,
            pageNumber: targetPage.pageNumber,
            // 構造化出力メタデータ（UIが対応した時に使える）
            metadata: {
                confidence: structured.confidence_score,
                dataSource: structured.data_source,
                speculativeFlag: structured.speculative_flag,
                extractedNumbers: structured.extracted_numbers || [],
                variationFactors: structured.variation_factors || [],
            },
            // バリデーション結果
            validation: {
                passed: errors.length === 0,
                errors: errors.map(e => e.reason),
                warnings: warnings.map(w => w.reason),
                totalChecks: 7,
                passedChecks: 7 - validationResults.length,
            },
        });

    } catch (error) {
        console.error('Comment generation error:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return res.status(500).json({
            success: false,
            error: `Failed to generate comment: ${errorMessage}`,
        });
    }
}
