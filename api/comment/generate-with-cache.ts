import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';

/**
 * キャッシュを使用したコメント生成API（ストリーミング対応）
 * キャッシュIDを指定すると、前月PDF等の再送信が不要になり高速化
 * 
 * POST /api/comment/generate-with-cache
 */

interface GenerateWithCacheRequest {
    cacheId?: string;           // キャッシュID（指定時は高速）
    targetPage: {
        pageNumber: number;
        pageTitle: string;
        currentImage: string;   // 今月画像（必須）
        imageCacheId?: string;  // 今月画像のキャッシュID（修正時に使用）
    };
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
            cacheId,
            targetPage,
            pagePrompt,
            modelName = 'gemini-3-flash-preview'
        } = req.body as GenerateWithCacheRequest;

        if (!targetPage || !targetPage.currentImage) {
            return res.status(400).json({
                success: false,
                error: 'targetPage with currentImage is required'
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

        // SSEヘッダー設定
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const startTime = Date.now();

        let model;
        let usedCache = false;

        // キャッシュIDが指定されている場合
        if (cacheId) {
            try {
                const cache = await cacheManager.get(cacheId);
                model = genAI.getGenerativeModelFromCachedContent(cache);
                usedCache = true;

                res.write(`data: ${JSON.stringify({
                    type: 'info',
                    message: 'Using cached context for faster generation',
                    cacheId
                })}\n\n`);
                // @ts-ignore
                if (typeof res.flush === 'function') res.flush();
            } catch (e) {
                // キャッシュが見つからない場合は通常モードにフォールバック
                console.warn('Cache not found, falling back to normal mode:', e);
                model = genAI.getGenerativeModel({ model: modelName });

                res.write(`data: ${JSON.stringify({
                    type: 'info',
                    message: 'Cache expired or not found, using normal mode'
                })}\n\n`);
                // @ts-ignore
                if (typeof res.flush === 'function') res.flush();
            }
        } else {
            model = genAI.getGenerativeModel({ model: modelName });
        }

        // プロンプト構築
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        // 今月画像を追加
        const parsedCurrentImage = parseDataUri(targetPage.currentImage);
        if (!parsedCurrentImage) {
            res.write(`data: ${JSON.stringify({ type: 'error', error: 'Invalid currentImage format' })}\n\n`);
            return res.end();
        }

        parts.push({
            text: `\n\n## 今月データ: P${targetPage.pageNumber} - ${targetPage.pageTitle}\n以下の画像を分析してコメントを生成してください:`
        });
        parts.push({
            inlineData: {
                mimeType: parsedCurrentImage.mimeType,
                data: parsedCurrentImage.data,
            },
        });

        // ページ固有プロンプト
        if (pagePrompt) {
            parts.push({
                text: `\n\n## 追加指示:\n${pagePrompt}`
            });
        }

        // 出力形式指示
        parts.push({
            text: `\n\n【重要：出力形式ルール】
・マークダウン記法は一切使用禁止です（#、**、__、-、*、> など全て禁止）
・太字・斜体・見出し記号などの装飾記法は絶対に使わないでください
・プレーンテキストのみで出力してください
・箇条書きを使う場合は「・」（中黒）を先頭に付けてください
・段落の先頭は全角スペース1つでインデントしてください
・強調したい部分は「」（かぎ括弧）で囲むか、文末に（重要）と付けてください`
        });

        // ストリーミング生成開始
        res.write(`data: ${JSON.stringify({
            type: 'start',
            pageNumber: targetPage.pageNumber,
            usedCache
        })}\n\n`);
        // @ts-ignore
        if (typeof res.flush === 'function') res.flush();

        const result = await model.generateContentStream(parts);

        let fullText = '';

        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
                fullText += chunkText;
                res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunkText })}\n\n`);
                // @ts-ignore
                if (typeof res.flush === 'function') res.flush();
            }
        }

        const processingTime = Date.now() - startTime;

        // 完了イベント
        res.write(`data: ${JSON.stringify({
            type: 'done',
            fullText: fullText.trim(),
            processingTime,
            modelUsed: modelName,
            pageNumber: targetPage.pageNumber,
            usedCache,
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
