import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * コメント生成API
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

/**
 * Data URIを解析してMIMEタイプとBase64データを抽出
 */
function parseDataUri(dataUri: string): { mimeType: string; data: string } | null {
    if (!dataUri) return null;

    // Data URI形式: data:image/jpeg;base64,/9j/4AAQ...
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
        return {
            mimeType: match[1],
            data: match[2],
        };
    }

    // すでに純粋なBase64（プレフィックスなし）の場合
    // 簡易的な判定: base64文字列っぽいかどうか
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(dataUri.slice(0, 100))) {
        return {
            mimeType: 'image/jpeg', // デフォルト
            data: dataUri,
        };
    }

    return null;
}

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
            modelName = 'gemini-3-flash-preview'
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
        const model = genAI.getGenerativeModel({ model: modelName });

        const startTime = Date.now();

        // プロンプト構築
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        // システムプロンプト
        parts.push({ text: systemPrompt });

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

            for (const ctx of contextPages.slice(0, 3)) { // 最大3ページまで
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
上記を踏まえて、今月のコメントを生成してください。

【重要：出力形式ルール】
・マークダウン記法は一切使用禁止です（#、**、__、-、*、> など全て禁止）
・太字・斜体・見出し記号などの装飾記法は絶対に使わないでください
・プレーンテキストのみで出力してください
・箇条書きを使う場合は「・」（中黒）を先頭に付けてください
・段落の先頭は全角スペース1つでインデントしてください
・強調したい部分は「」（かぎ括弧）で囲むか、文末に（重要）と付けてください`
        });

        const result = await model.generateContent(parts);
        const response = await result.response;
        const generatedComment = response.text().trim();

        const processingTime = Date.now() - startTime;

        return res.status(200).json({
            success: true,
            generatedComment,
            processingTime,
            modelUsed: modelName,
            pageNumber: targetPage.pageNumber,
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
