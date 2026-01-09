// src/hooks/useClipboardPaste.ts
// 画像ペースト機能のカスタムHook

import { useEffect, useCallback } from 'react';

export interface PastedImage {
    data: string;        // base64 data URL
    mimeType: string;    // image/png, image/jpeg など
    width?: number;
    height?: number;
    timestamp: number;
}

interface UseClipboardPasteOptions {
    /**
     * ペーストを有効にするかどうか
     */
    enabled?: boolean;

    /**
     * 対応する画像形式
     */
    acceptedTypes?: string[];

    /**
     * 最大ファイルサイズ（バイト）
     */
    maxSize?: number;

    /**
     * エラー時のコールバック
     */
    onError?: (error: string) => void;
}

const DEFAULT_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp'];
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * クリップボードからの画像ペーストを処理するカスタムHook
 * 
 * @param onPaste - 画像がペーストされたときのコールバック
 * @param options - オプション設定
 */
export function useClipboardPaste(
    onPaste: (image: PastedImage) => void,
    options: UseClipboardPasteOptions = {}
) {
    const {
        enabled = true,
        acceptedTypes = DEFAULT_ACCEPTED_TYPES,
        maxSize = DEFAULT_MAX_SIZE,
        onError,
    } = options;

    const handlePaste = useCallback((event: ClipboardEvent) => {
        if (!enabled) return;

        const items = event.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            // 画像形式のチェック
            if (!item.type.startsWith('image/')) continue;

            // 対応形式のチェック
            if (!acceptedTypes.includes(item.type)) {
                onError?.(`未対応の画像形式です: ${item.type}`);
                continue;
            }

            const file = item.getAsFile();
            if (!file) continue;

            // ファイルサイズチェック
            if (file.size > maxSize) {
                onError?.(`画像サイズが大きすぎます（最大${Math.round(maxSize / 1024 / 1024)}MB）`);
                continue;
            }

            event.preventDefault();

            const reader = new FileReader();

            reader.onload = (e) => {
                const imageData = e.target?.result as string;

                // 画像の寸法を取得するために Image オブジェクトを使用
                const img = new Image();
                img.onload = () => {
                    onPaste({
                        data: imageData,
                        mimeType: item.type,
                        width: img.width,
                        height: img.height,
                        timestamp: Date.now(),
                    });
                };
                img.onerror = () => {
                    // 寸法取得に失敗しても画像データは返す
                    onPaste({
                        data: imageData,
                        mimeType: item.type,
                        timestamp: Date.now(),
                    });
                };
                img.src = imageData;
            };

            reader.onerror = () => {
                onError?.('画像の読み込みに失敗しました');
            };

            reader.readAsDataURL(file);

            // 最初の画像のみ処理
            break;
        }
    }, [enabled, acceptedTypes, maxSize, onPaste, onError]);

    useEffect(() => {
        if (!enabled) return;

        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [enabled, handlePaste]);
}

/**
 * 特定の要素にフォーカスがあるときのみペーストを処理するHook
 */
export function useElementClipboardPaste(
    elementRef: React.RefObject<HTMLElement>,
    onPaste: (image: PastedImage) => void,
    options: UseClipboardPasteOptions = {}
) {
    const {
        enabled = true,
        acceptedTypes = DEFAULT_ACCEPTED_TYPES,
        maxSize = DEFAULT_MAX_SIZE,
        onError,
    } = options;

    const handlePaste = useCallback((event: ClipboardEvent) => {
        if (!enabled) return;
        if (!elementRef.current?.contains(document.activeElement)) return;

        const items = event.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
            if (!item.type.startsWith('image/')) continue;
            if (!acceptedTypes.includes(item.type)) {
                onError?.(`未対応の画像形式です: ${item.type}`);
                continue;
            }

            const file = item.getAsFile();
            if (!file) continue;

            if (file.size > maxSize) {
                onError?.(`画像サイズが大きすぎます（最大${Math.round(maxSize / 1024 / 1024)}MB）`);
                continue;
            }

            event.preventDefault();

            const reader = new FileReader();
            reader.onload = (e) => {
                const imageData = e.target?.result as string;
                const img = new Image();
                img.onload = () => {
                    onPaste({
                        data: imageData,
                        mimeType: item.type,
                        width: img.width,
                        height: img.height,
                        timestamp: Date.now(),
                    });
                };
                img.onerror = () => {
                    onPaste({
                        data: imageData,
                        mimeType: item.type,
                        timestamp: Date.now(),
                    });
                };
                img.src = imageData;
            };
            reader.onerror = () => {
                onError?.('画像の読み込みに失敗しました');
            };
            reader.readAsDataURL(file);
            break;
        }
    }, [enabled, elementRef, acceptedTypes, maxSize, onPaste, onError]);

    useEffect(() => {
        if (!enabled) return;

        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [enabled, handlePaste]);
}
