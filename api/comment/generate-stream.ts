import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';

/**
 * コメント生成API（ストリーミング対応 + 自動キャッシュ）
 * 今月の画像データと前月コメントを元に、新しいコメントを生成する
 * 生成完了時に今月画像をキャッシュし、cacheIdを返す（修正時に再利用）
 * 
 * POST /api/comment/generate-stream
 */

interface GenerateRequest {
    targetPage: {
        pageNumber: number;
        pageTitle: string;
        currentImage: string;
        previousImage?: string;
        previousComment?: string;
        existingCacheId?: string;  // 既存のキャッシュID（再生成時はスキップ）
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
 * 今月画像のキャッシュを作成（バックグラウンド）
 */
async function createImageCache(
    cacheManager: GoogleAICacheManager,
    pageNumber: number,
    pageTitle: string,
    imageData: string,
    systemPrompt: string
): Promise<string | null> {
    try {
        const parsed = parseDataUri(imageData);
        if (!parsed) return null;

        const cache = await cacheManager.create({
            model: 'models/gemini-3-flash-preview',
            displayName: `page_${pageNumber}_${Date.now()}`,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: systemPrompt },
                        { text: `\n\n## 今月データ: P${pageNumber} - ${pageTitle}` },
                        {
                            inlineData: {
                                mimeType: parsed.mimeType,
                                data: parsed.data,
                            },
                        },
                    ],
                },
            ],
            ttlSeconds: 1800, // 30分
        });

        return cache.name;
    } catch (e) {
        console.error('Failed to create image cache:', e);
        return null;
    }
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
        const cacheManager = new GoogleAICacheManager(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        // SSEヘッダー設定
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const startTime = Date.now();

        // プロンプト構築
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        parts.push({ text: systemPrompt });
        parts.push({
            text: `\n\n## 対象ページ: P${targetPage.pageNumber} - ${targetPage.pageTitle}\n`
        });

        if (targetPage.previousComment) {
            parts.push({
                text: `\n### 前月コメント（参考）:\n${targetPage.previousComment}\n\n上記のコメントのトーン・文体を参考にしてください。\n`
            });
        }

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

        const parsedCurrentImage = parseDataUri(targetPage.currentImage);
        if (!parsedCurrentImage) {
            res.write(`data: ${JSON.stringify({ type: 'error', error: 'Invalid currentImage format' })}\n\n`);
            return res.end();
        }

        parts.push({ text: '\n### 今月データ画像（これを分析してコメントを生成）:' });
        parts.push({
            inlineData: {
                mimeType: parsedCurrentImage.mimeType,
                data: parsedCurrentImage.data,
            },
        });

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

        if (pagePrompt) {
            parts.push({
                text: `\n\n## 追加指示:\n${pagePrompt}`
            });
        }

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

        // ストリーミング生成開始
        res.write(`data: ${JSON.stringify({ type: 'start', pageNumber: targetPage.pageNumber })}\n\n`);
        // @ts-ignore - Vercel環境ではflushが利用可能
        if (typeof res.flush === 'function') res.flush();

        // 既存キャッシュがなければ新規作成（再生成時はスキップ）
        let cachePromise: Promise<string | null>;
        if (targetPage.existingCacheId) {
            // 既存キャッシュを再利用
            cachePromise = Promise.resolve(targetPage.existingCacheId);
        } else {
            // 新規キャッシュ作成（バックグラウンド）
            cachePromise = createImageCache(
                cacheManager,
                targetPage.pageNumber,
                targetPage.pageTitle,
                targetPage.currentImage,
                systemPrompt
            );
        }

        const result = await model.generateContentStream(parts);

        let fullText = '';

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
                fullText += chunkText;
                // チャンクを送信
                res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunkText })}\n\n`);
                // バッファをフラッシュしてクライアントに即座に送信
                // @ts-ignore - Vercel環境ではflushが利用可能
                if (typeof res.flush === 'function') res.flush();
            }
        }

        const processingTime = Date.now() - startTime;

        // キャッシュ作成の結果を取得
        const imageCacheId = await cachePromise;

        // 完了イベント（cacheIdを含む）
        res.write(`data: ${JSON.stringify({
            type: 'done',
            fullText: fullText.trim(),
            processingTime,
            modelUsed: modelName,
            pageNumber: targetPage.pageNumber,
            imageCacheId, // 修正時に使用するキャッシュID
        })}\n\n`);
        // @ts-ignore
        if (typeof res.flush === 'function') res.flush();

        res.end();

    } catch (error) {
        console.error('Comment generation error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
        res.end();
    }
}
