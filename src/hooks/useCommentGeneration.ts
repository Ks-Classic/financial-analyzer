// src/hooks/useCommentGeneration.ts
// コメント生成のカスタムHook

import { useState, useCallback, useRef } from 'react';
import {
    MultiPageGenerateRequest,
    MultiPageGenerateResponse,
    BatchProgress,
    GeneratedCommentResult
} from '../types/multi-page-analysis';

interface PageData {
    pageNumber: number;
    pageTitle: string;
    currentImage: string;
    previousImage: string;
    previousComment: string;
}

interface PromptData {
    systemPrompt: string;
    pagePrompts: Map<number, string>;
}

interface GenerateAllResult {
    results: Map<number, GeneratedCommentResult>;
    cacheId: string | null;
}

interface UseCommentGenerationResult {
    generate: (request: MultiPageGenerateRequest) => Promise<MultiPageGenerateResponse>;
    generateAll: (pages: PageData[], contextPages: PageData[], prompts: PromptData) => Promise<GenerateAllResult>;
    cancelGeneration: () => void;
    results: Map<number, GeneratedCommentResult>;
    progress: BatchProgress;
    isGenerating: boolean;
    error: string | null;
}

/**
 * API呼び出しの遅延
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * コメント生成のカスタムHook
 */
export function useCommentGeneration(): UseCommentGenerationResult {
    const [results, setResults] = useState<Map<number, GeneratedCommentResult>>(new Map());
    const [progress, setProgress] = useState<BatchProgress>({
        total: 0,
        completed: 0,
        currentPage: 0,
        status: 'idle',
    });
    const [error, setError] = useState<string | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    /**
     * 単一ページのコメント生成
     */
    const generate = useCallback(async (
        request: MultiPageGenerateRequest
    ): Promise<MultiPageGenerateResponse> => {
        const startTime = Date.now();

        try {
            // タイムアウト付きfetch (60秒)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            const response = await fetch('/api/comment/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('API error response:', errorData);
                throw new Error(errorData.error || `HTTP error: ${response.status}`);
            }

            const result = await response.json();

            return {
                pageNumber: request.targetPage.pageNumber,
                generatedComment: result.generatedComment || result.comment,
                processingTime: Date.now() - startTime,
            };
        } catch (err) {
            // エラーの詳細をログ出力
            console.error('API call failed for page', request.targetPage.pageNumber, ':', err);

            // タイムアウトの場合は明示的にエラーを投げる
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error('API呼び出しがタイムアウトしました（60秒）');
            }

            // デモモードにはフォールバックしない - エラーを再スロー
            throw err;
        }
    }, []);

    /**
     * 全ページのコメントを一括生成（高速版）
     * 1. 全ページを一括キャッシュ
     * 2. 順次生成（レート制限回避のため直列処理 + リトライ）
     */
    const generateAll = useCallback(async (
        pages: PageData[],
        _contextPages: PageData[], // 使用しない（全ページがキャッシュされる）
        prompts: PromptData
    ): Promise<GenerateAllResult> => {
        const newResults = new Map<number, GeneratedCommentResult>();
        let cacheId: string | null = null;

        abortControllerRef.current = new AbortController();

        setError(null);
        setProgress({
            total: pages.length,
            completed: 0,
            currentPage: 0,
            status: 'generating',
        });

        try {
            // ==============================
            // Phase 1: 全ページ一括キャッシュ
            // ==============================
            console.log('Phase 1: Creating bulk cache for all pages...');
            setProgress(prev => ({ ...prev, currentPage: -1 })); // -1 = キャッシュ作成中

            const cacheResponse = await fetch('/api/comment/bulk-cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pages: pages.map(p => ({
                        pageNumber: p.pageNumber,
                        pageTitle: p.pageTitle,
                        imageData: p.currentImage,
                        previousComment: p.previousComment,
                    })),
                    systemPrompt: prompts.systemPrompt,
                }),
            });

            if (!cacheResponse.ok) {
                const errorData = await cacheResponse.json().catch(() => ({}));
                throw new Error(errorData.error || 'キャッシュ作成に失敗しました');
            }

            const cacheResult = await cacheResponse.json();
            cacheId = cacheResult.cacheId;
            console.log('Bulk cache created:', cacheId);

            // ==============================
            // Phase 2: 順次生成（レート制限回避のため直列処理）
            // ==============================
            console.log('Phase 2: Generating comments sequentially...');
            const MAX_RETRIES = 2;
            const REQUEST_TIMEOUT_MS = 55000; // Vercel 60s制限の手前

            for (let i = 0; i < pages.length; i++) {
                // キャンセルチェック
                if (abortControllerRef.current?.signal.aborted) {
                    setProgress(prev => ({ ...prev, status: 'paused' }));
                    break;
                }

                const page = pages[i];
                const pagePrompt = prompts.pagePrompts.get(page.pageNumber) || '';
                let lastError: Error | null = null;

                for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        if (attempt > 0) {
                            console.log(`Retrying P${page.pageNumber} (attempt ${attempt + 1})...`);
                            await delay(2000 * attempt); // リトライ間隔を徐々に増やす
                        }

                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

                        const response = await fetch('/api/comment/generate-fast', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                cacheId,
                                pageNumber: page.pageNumber,
                                pageTitle: page.pageTitle,
                                pagePrompt,
                            }),
                            signal: controller.signal,
                        });

                        clearTimeout(timeoutId);

                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({}));
                            throw new Error(errorData.error || `P${page.pageNumber}: HTTP ${response.status}`);
                        }

                        const result = await response.json();
                        newResults.set(page.pageNumber, {
                            pageNumber: page.pageNumber,
                            comment: result.generatedComment,
                            processingTime: result.processingTime,
                            status: 'completed' as const,
                            timestamp: new Date().toISOString(),
                        });
                        lastError = null;
                        break; // 成功したらリトライループ脱出
                    } catch (err) {
                        lastError = err instanceof Error ? err : new Error('生成に失敗しました');
                        if (lastError.name === 'AbortError') {
                            lastError = new Error(`P${page.pageNumber}: タイムアウト（55秒）`);
                        }
                        console.error(`Error generating P${page.pageNumber} (attempt ${attempt + 1}):`, lastError.message);
                    }
                }

                // リトライ全て失敗した場合
                if (lastError) {
                    newResults.set(page.pageNumber, {
                        pageNumber: page.pageNumber,
                        comment: '',
                        processingTime: 0,
                        status: 'error' as const,
                        error: lastError.message,
                    });
                }

                setResults(new Map(newResults));

                // 進捗更新
                setProgress(prev => ({
                    ...prev,
                    completed: i + 1,
                    currentPage: page.pageNumber,
                }));

                // レート制限対策（ページ間の間隔）
                if (i < pages.length - 1) {
                    await delay(1000);
                }
            }

            // 最終進捗更新
            const completedCount = Array.from(newResults.values())
                .filter(r => r.status === 'completed').length;

            setProgress({
                total: pages.length,
                completed: completedCount,
                currentPage: 0,
                status: 'completed',
            });

        } catch (err) {
            console.error('Bulk generation error:', err);
            setError(err instanceof Error ? err.message : 'エラーが発生しました');
            setProgress(prev => ({ ...prev, status: 'error', error: String(err) }));
        }

        return { results: newResults, cacheId };
    }, []);

    /**
     * 生成をキャンセル
     */
    const cancelGeneration = useCallback(() => {
        abortControllerRef.current?.abort();
        setProgress(prev => ({ ...prev, status: 'paused' }));
    }, []);

    return {
        generate,
        generateAll,
        cancelGeneration,
        results,
        progress,
        isGenerating: progress.status === 'generating',
        error,
    };
}
