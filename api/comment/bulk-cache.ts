import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleAICacheManager } from '@google/generative-ai/server';

/**
 * 全ページ一括キャッシュAPI
 * 全ページの今月画像を一度にキャッシュし、以降の生成で再利用
 * 
 * POST /api/comment/bulk-cache
 */

interface PageImage {
    pageNumber: number;
    pageTitle: string;
    imageData: string;      // 今月画像（base64 or data URI）
    previousComment?: string; // 前月コメント
}

interface BulkCacheRequest {
    pages: PageImage[];
    systemPrompt: string;
    ttlSeconds?: number;    // デフォルト1時間
}

/**
 * Data URIを解析
 */
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

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
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
            pages,
            systemPrompt,
            ttlSeconds = 3600,
        } = req.body as BulkCacheRequest;

        if (!pages || pages.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'pages array is required'
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error: 'GEMINI_API_KEY is not configured'
            });
        }

        const cacheManager = new GoogleAICacheManager(apiKey);

        // 全ページの画像とコメントをパーツとして構築
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

        // システムプロンプト
        parts.push({ text: systemPrompt });

        // 全ページ一覧
        parts.push({
            text: `\n\n## 今月レポート全ページデータ（${pages.length}ページ）\n以下の全ページを参照して、各ページのコメントを生成する際に関連する要因があれば考慮してください。`
        });

        // 各ページの画像と前月コメントを追加
        for (const page of pages) {
            const parsed = parseDataUri(page.imageData);
            if (!parsed) {
                console.warn(`Invalid image for page ${page.pageNumber}, skipping`);
                continue;
            }

            parts.push({
                text: `\n\n### P${page.pageNumber} - ${page.pageTitle}`
            });

            // 前月コメントがあれば追加
            if (page.previousComment) {
                parts.push({
                    text: `\n【前月コメント】\n${page.previousComment}`
                });
            }

            parts.push({
                text: `\n【今月データ画像】`
            });
            parts.push({
                inlineData: {
                    mimeType: parsed.mimeType,
                    data: parsed.data,
                },
            });
        }

        console.log(`Creating bulk cache for ${pages.length} pages...`);

        // キャッシュ作成
        const cache = await cacheManager.create({
            model: 'models/gemini-3-flash-preview',
            displayName: `bulk_report_${pages.length}pages_${Date.now()}`,
            contents: [
                {
                    role: 'user',
                    parts,
                },
            ],
            ttlSeconds,
        });

        console.log(`Bulk cache created: ${cache.name}`);

        return res.status(200).json({
            success: true,
            cacheId: cache.name,
            pageCount: pages.length,
            expireTime: cache.expireTime,
            displayName: cache.displayName,
        });

    } catch (error) {
        console.error('Bulk cache creation error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return res.status(500).json({
            success: false,
            error: `Failed to create bulk cache: ${errorMessage}`,
        });
    }
}
