// src/hooks/useContextCache.ts
// コンテキストキャッシュ管理のカスタムHook

import { useState, useCallback, useRef } from 'react';

interface CacheInfo {
    cacheId: string;
    displayName: string;
    expireTime: string;
    createdAt: Date;
}

interface PageImage {
    pageNumber: number;
    pageTitle: string;
    imageData: string;
}

interface UseContextCacheResult {
    // 前月PDF用キャッシュ
    previousMonthCache: CacheInfo | null;
    createPreviousMonthCache: (
        clientName: string,
        systemPrompt: string,
        images: PageImage[]
    ) => Promise<CacheInfo | null>;

    // 今月画像用キャッシュ（ページごと）
    currentImageCaches: Map<number, CacheInfo>;
    createCurrentImageCache: (
        pageNumber: number,
        pageTitle: string,
        imageData: string,
        systemPrompt: string
    ) => Promise<CacheInfo | null>;

    // キャッシュ操作
    getCacheInfo: (cacheId: string) => Promise<CacheInfo | null>;
    deleteCache: (cacheId: string) => Promise<boolean>;
    clearAllCaches: () => Promise<void>;

    // 状態
    isCreating: boolean;
    error: string | null;
}

/**
 * コンテキストキャッシュ管理のカスタムHook
 */
export function useContextCache(): UseContextCacheResult {
    const [previousMonthCache, setPreviousMonthCache] = useState<CacheInfo | null>(null);
    const [currentImageCaches, setCurrentImageCaches] = useState<Map<number, CacheInfo>>(new Map());
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * 前月PDFのキャッシュを作成
     */
    const createPreviousMonthCache = useCallback(async (
        clientName: string,
        systemPrompt: string,
        images: PageImage[]
    ): Promise<CacheInfo | null> => {
        setIsCreating(true);
        setError(null);

        try {
            const response = await fetch('/api/comment/cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create',
                    displayName: `前月レポート_${clientName}_${new Date().toISOString().slice(0, 10)}`,
                    systemPrompt,
                    images,
                    ttlSeconds: 3600, // 1時間
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error: ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.cacheId) {
                const cacheInfo: CacheInfo = {
                    cacheId: result.cacheId,
                    displayName: result.displayName,
                    expireTime: result.expireTime,
                    createdAt: new Date(),
                };
                setPreviousMonthCache(cacheInfo);
                return cacheInfo;
            } else {
                throw new Error(result.error || 'キャッシュ作成に失敗しました');
            }
        } catch (err) {
            console.error('Cache creation error:', err);
            setError(err instanceof Error ? err.message : 'キャッシュ作成に失敗しました');
            return null;
        } finally {
            setIsCreating(false);
        }
    }, []);

    /**
     * 今月画像のキャッシュを作成（ページごと）
     */
    const createCurrentImageCache = useCallback(async (
        pageNumber: number,
        pageTitle: string,
        imageData: string,
        systemPrompt: string
    ): Promise<CacheInfo | null> => {
        setIsCreating(true);
        setError(null);

        try {
            const response = await fetch('/api/comment/cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create',
                    displayName: `今月画像_P${pageNumber}_${new Date().toISOString().slice(0, 16)}`,
                    systemPrompt,
                    images: [{ pageNumber, pageTitle, imageData }],
                    ttlSeconds: 1800, // 30分（今月画像は短めに）
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error: ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.cacheId) {
                const cacheInfo: CacheInfo = {
                    cacheId: result.cacheId,
                    displayName: result.displayName,
                    expireTime: result.expireTime,
                    createdAt: new Date(),
                };
                setCurrentImageCaches(prev => {
                    const next = new Map(prev);
                    next.set(pageNumber, cacheInfo);
                    return next;
                });
                return cacheInfo;
            } else {
                throw new Error(result.error || 'キャッシュ作成に失敗しました');
            }
        } catch (err) {
            console.error('Cache creation error:', err);
            setError(err instanceof Error ? err.message : 'キャッシュ作成に失敗しました');
            return null;
        } finally {
            setIsCreating(false);
        }
    }, []);

    /**
     * キャッシュ情報を取得
     */
    const getCacheInfo = useCallback(async (cacheId: string): Promise<CacheInfo | null> => {
        try {
            const response = await fetch('/api/comment/cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'get',
                    cacheId,
                }),
            });

            if (!response.ok) {
                return null;
            }

            const result = await response.json();

            if (result.success) {
                return {
                    cacheId: result.cacheId,
                    displayName: result.displayName,
                    expireTime: result.expireTime,
                    createdAt: new Date(),
                };
            }
            return null;
        } catch {
            return null;
        }
    }, []);

    /**
     * キャッシュを削除
     */
    const deleteCache = useCallback(async (cacheId: string): Promise<boolean> => {
        try {
            const response = await fetch('/api/comment/cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete',
                    cacheId,
                }),
            });

            const result = await response.json();

            // ローカル状態も更新
            if (result.success) {
                if (previousMonthCache?.cacheId === cacheId) {
                    setPreviousMonthCache(null);
                }
                setCurrentImageCaches(prev => {
                    const next = new Map(prev);
                    for (const [key, value] of next) {
                        if (value.cacheId === cacheId) {
                            next.delete(key);
                            break;
                        }
                    }
                    return next;
                });
            }

            return result.success;
        } catch {
            return false;
        }
    }, [previousMonthCache]);

    /**
     * すべてのキャッシュをクリア
     */
    const clearAllCaches = useCallback(async (): Promise<void> => {
        // 前月キャッシュを削除
        if (previousMonthCache) {
            await deleteCache(previousMonthCache.cacheId);
        }

        // 今月画像キャッシュをすべて削除
        for (const cache of currentImageCaches.values()) {
            await deleteCache(cache.cacheId);
        }

        setPreviousMonthCache(null);
        setCurrentImageCaches(new Map());
    }, [previousMonthCache, currentImageCaches, deleteCache]);

    return {
        previousMonthCache,
        createPreviousMonthCache,
        currentImageCaches,
        createCurrentImageCache,
        getCacheInfo,
        deleteCache,
        clearAllCaches,
        isCreating,
        error,
    };
}
