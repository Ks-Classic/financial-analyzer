import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';

/**
 * コメント修正API（キャッシュ対応）
 * 生成済みコメントをユーザーの指示に基づいて修正する
 * imageCacheIdが指定されている場合は画像再送信不要で高速
 * 
 * POST /api/comment/refine
 */

interface RefineRequest {
    originalComment: string;        // 元のコメント
    refinementType: 'shorter' | 'longer' | 'concise' | 'numeric' | 'positive' | 'custom';
    customInstruction?: string;     // カスタム指示（typeがcustomの場合）
    pageTitle?: string;             // ページタイトル（コンテキスト用）
    previousComment?: string;       // 前月コメント（スタイル参考用）
    currentImage?: string;          // 今月データ画像（キャッシュがない場合のフォールバック）
    imageCacheId?: string;          // 今月画像のキャッシュID（高速モード）
    modelName?: string;
}

/**
 * Data URIを解析してMIMEタイプとBase64データを抽出
 */
function parseDataUri(dataUri: string): { mimeType: string; data: string } | null {
    if (!dataUri) return null;

    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
        return {
            mimeType: match[1],
            data: match[2],
        };
    }

    if (/^[A-Za-z0-9+/]+={0,2}$/.test(dataUri.slice(0, 100))) {
        return {
            mimeType: 'image/jpeg',
            data: dataUri,
        };
    }

    return null;
}

/**
 * 修正タイプごとのプリセットプロンプト
 * requiresImage: 画像データが必要かどうか（数値参照が必要な場合はtrue）
 */
const REFINEMENT_PROMPTS: Record<string, { prompt: string; requiresImage: boolean }> = {
    shorter: {
        prompt: `以下のコメントを、主要なポイントのみに絞って短くしてください。
元の内容の本質は維持しながら、文字数を約60%に削減してください。`,
        requiresImage: false,
    },

    longer: {
        prompt: `以下のコメントを、より詳細な説明を加えて長くしてください。
画像データを参照して、具体的な数値や要因分析を追加し、文字数を約150%に増やしてください。`,
        requiresImage: true,
    },

    concise: {
        prompt: `以下のコメントを、より簡潔でビジネスライクな表現に書き換えてください。
冗長な表現を削除し、要点を明確にしてください。`,
        requiresImage: false,
    },

    numeric: {
        prompt: `以下のコメントを、画像データから読み取れる具体的な数値を多く含むように書き換えてください。
・売上高、利益、前月比、前年比などの具体的な数値を追加
・パーセンテージや金額を明確に記載
・比較データを数値で示す
画像から読み取れる実際の数値を使用してください。`,
        requiresImage: true,
    },

    positive: {
        prompt: `以下のコメントを、よりポジティブなトーンで書き換えてください。
ネガティブな表現を避け、改善点や機会を強調してください。`,
        requiresImage: false,
    },
};

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
            originalComment,
            refinementType,
            customInstruction,
            pageTitle,
            previousComment,
            currentImage,
            imageCacheId,
            modelName = 'gemini-3-flash-preview'
        } = req.body as RefineRequest;

        if (!originalComment) {
            return res.status(400).json({
                success: false,
                error: 'originalComment is required'
            });
        }

        if (!refinementType) {
            return res.status(400).json({
                success: false,
                error: 'refinementType is required'
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
        const cacheManager = new GoogleAICacheManager(apiKey);

        const startTime = Date.now();

        // プロンプト構築
        let refinementPrompt = '';
        let needsImage = false;

        if (refinementType === 'custom' && customInstruction) {
            refinementPrompt = `以下のコメントを、次の指示に従って修正してください。
画像データがある場合は参照して、具体的な数値を含めてください。

【修正指示】
${customInstruction}`;
            needsImage = true;
        } else {
            const preset = REFINEMENT_PROMPTS[refinementType] || REFINEMENT_PROMPTS.concise;
            refinementPrompt = preset.prompt;
            needsImage = preset.requiresImage;
        }

        let model;
        let usedCache = false;

        // キャッシュIDが指定されていて、画像が必要な修正タイプの場合
        if (needsImage && imageCacheId) {
            try {
                const cache = await cacheManager.get(imageCacheId);
                model = genAI.getGenerativeModelFromCachedContent(cache);
                usedCache = true;
                console.log('Using cached image for refinement');
            } catch (e) {
                // キャッシュが期限切れの場合は通常モードにフォールバック
                console.warn('Cache not found or expired, falling back to normal mode');
                model = genAI.getGenerativeModel({ model: modelName });
            }
        } else {
            model = genAI.getGenerativeModel({ model: modelName });
        }

        // パーツ配列を構築
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        parts.push({
            text: `あなたは財務レポートのコメント編集アシスタントです。

${refinementPrompt}

${pageTitle ? `【対象ページ】${pageTitle}\n` : ''}
${previousComment ? `【前月コメント（スタイル参考）】\n${previousComment}\n` : ''}

【修正対象のコメント】
${originalComment}

【出力形式 - PowerPoint用プレーンテキスト】
・マークダウン記法は一切使用禁止です（#、**、__、-、*、> など全て禁止）
・太字、斜体、見出し記号などの装飾記法は絶対に使わないでください
・プレーンテキストのみで出力してください
・箇条書きを使う場合は「・」（中黒）を先頭に付けてください
・段落の先頭は全角スペース1つでインデントしてください
・強調したい部分は「」（かぎ括弧）で囲むか、文末に（重要）と付けてください
・修正後のコメントのみを出力してください（説明不要）`
        });

        // 画像が必要で、キャッシュを使用しない場合は画像を追加
        if (needsImage && !usedCache && currentImage) {
            const parsedImage = parseDataUri(currentImage);
            if (parsedImage) {
                parts.push({ text: '\n\n【参照画像データ】具体的な数値はこの画像を参照してください:' });
                parts.push({
                    inlineData: {
                        mimeType: parsedImage.mimeType,
                        data: parsedImage.data,
                    },
                });
            }
        }

        const result = await model.generateContent(parts);
        const response = await result.response;
        const refinedComment = response.text().trim();

        const processingTime = Date.now() - startTime;

        return res.status(200).json({
            success: true,
            refinedComment,
            processingTime,
            refinementType,
            modelUsed: modelName,
            usedCache, // キャッシュを使用したかどうか
            imageSkipped: !needsImage, // 画像が不要だったか
        });

    } catch (error) {
        console.error('Comment refinement error:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return res.status(500).json({
            success: false,
            error: `Failed to refine comment: ${errorMessage}`,
        });
    }
}
