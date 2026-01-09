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
     * 2. 並列で生成（3-4同時）
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
            // Phase 2: 並列生成（3ページ同時）
            // ==============================
            console.log('Phase 2: Generating comments in parallel...');
            const PARALLEL_COUNT = 3;

            for (let i = 0; i < pages.length; i += PARALLEL_COUNT) {
                // キャンセルチェック
                if (abortControllerRef.current?.signal.aborted) {
                    setProgress(prev => ({ ...prev, status: 'paused' }));
                    break;
                }

                const batch = pages.slice(i, i + PARALLEL_COUNT);

                // 並列で生成
                const promises = batch.map(async (page) => {
                    const pagePrompt = prompts.pagePrompts.get(page.pageNumber) || '';

                    try {
                        const response = await fetch('/api/comment/generate-fast', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                cacheId,
                                pageNumber: page.pageNumber,
                                pageTitle: page.pageTitle,
                                pagePrompt,
                            }),
                        });

                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({}));
                            throw new Error(errorData.error || `P${page.pageNumber}の生成に失敗`);
                        }

                        const result = await response.json();
                        return {
                            pageNumber: page.pageNumber,
                            comment: result.generatedComment,
                            processingTime: result.processingTime,
                            status: 'completed' as const,
                            timestamp: new Date().toISOString(),
                        };
                    } catch (err) {
                        console.error(`Error generating P${page.pageNumber}:`, err);
                        return {
                            pageNumber: page.pageNumber,
                            comment: '',
                            processingTime: 0,
                            status: 'error' as const,
                            error: err instanceof Error ? err.message : '生成に失敗しました',
                        };
                    }
                });

                const batchResults = await Promise.all(promises);

                // 結果を更新
                for (const result of batchResults) {
                    newResults.set(result.pageNumber, result);
                }
                setResults(new Map(newResults));

                // 進捗更新
                const completedSoFar = Math.min(i + PARALLEL_COUNT, pages.length);
                setProgress(prev => ({
                    ...prev,
                    completed: completedSoFar,
                    currentPage: batch[batch.length - 1]?.pageNumber || 0,
                }));

                // レート制限対策（バッチ間のみ）
                if (i + PARALLEL_COUNT < pages.length) {
                    await delay(500);
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
