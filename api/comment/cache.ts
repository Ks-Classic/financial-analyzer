import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI, CachedContent } from '@google/generative-ai';
import { GoogleAICacheManager, GoogleAIFileManager } from '@google/generative-ai/server';

/**
 * コンテキストキャッシュ管理API
 * 前月PDFや今月画像をキャッシュして再利用可能にする
 * 
 * POST /api/comment/cache
 *   - action: 'create' | 'get' | 'delete'
 */

interface CreateCacheRequest {
    action: 'create';
    displayName: string;
    systemPrompt: string;
    images: Array<{
        pageNumber: number;
        pageTitle: string;
        imageData: string;  // base64 or data URI
    }>;
    ttlSeconds?: number;  // デフォルト: 3600 (1時間)
}

interface GetCacheRequest {
    action: 'get';
    cacheId: string;
}

interface DeleteCacheRequest {
    action: 'delete';
    cacheId: string;
}

type CacheRequest = CreateCacheRequest | GetCacheRequest | DeleteCacheRequest;

interface CacheResponse {
    success: boolean;
    cacheId?: string;
    displayName?: string;
    expireTime?: string;
    error?: string;
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({
            success: false,
            error: 'GEMINI_API_KEY is not configured'
        });
    }

    try {
        const request = req.body as CacheRequest;
        const cacheManager = new GoogleAICacheManager(apiKey);

        switch (request.action) {
            case 'create': {
                const { displayName, systemPrompt, images, ttlSeconds = 3600 } = request;

                if (!displayName || !systemPrompt || !images || images.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'displayName, systemPrompt, and images are required'
                    });
                }

                // コンテンツを構築
                const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

                // システムプロンプト
                parts.push({ text: systemPrompt });

                // 各ページの画像
                for (const img of images) {
                    const parsed = parseDataUri(img.imageData);
                    if (parsed) {
                        parts.push({ text: `\n\n## P${img.pageNumber} - ${img.pageTitle}` });
                        parts.push({
                            inlineData: {
                                mimeType: parsed.mimeType,
                                data: parsed.data,
                            },
                        });
                    }
                }

                // キャッシュを作成
                const cache = await cacheManager.create({
                    model: 'models/gemini-3-flash-preview',
                    displayName,
                    contents: [
                        {
                            role: 'user',
                            parts,
                        },
                    ],
                    ttlSeconds,
                });

                return res.status(200).json({
                    success: true,
                    cacheId: cache.name,
                    displayName: cache.displayName,
                    expireTime: cache.expireTime,
                } as CacheResponse);
            }

            case 'get': {
                const { cacheId } = request;

                if (!cacheId) {
                    return res.status(400).json({
                        success: false,
                        error: 'cacheId is required'
                    });
                }

                try {
                    const cache = await cacheManager.get(cacheId);
                    return res.status(200).json({
                        success: true,
                        cacheId: cache.name,
                        displayName: cache.displayName,
                        expireTime: cache.expireTime,
                    } as CacheResponse);
                } catch {
                    return res.status(404).json({
                        success: false,
                        error: 'Cache not found or expired'
                    });
                }
            }

            case 'delete': {
                const { cacheId } = request;

                if (!cacheId) {
                    return res.status(400).json({
                        success: false,
                        error: 'cacheId is required'
                    });
                }

                try {
                    await cacheManager.delete(cacheId);
                    return res.status(200).json({
                        success: true,
                    } as CacheResponse);
                } catch {
                    return res.status(404).json({
                        success: false,
                        error: 'Cache not found'
                    });
                }
            }

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid action. Use "create", "get", or "delete"'
                });
        }

    } catch (error) {
        console.error('Cache operation error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return res.status(500).json({
            success: false,
            error: `Cache operation failed: ${errorMessage}`,
        });
    }
}
