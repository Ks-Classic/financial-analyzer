// src/hooks/useStreamingGeneration.ts
// ストリーミングコメント生成のカスタムHook

import { useState, useCallback, useRef } from 'react';
import { MultiPageGenerateRequest } from '../types/multi-page-analysis';

interface StreamingState {
    isGenerating: boolean;
    currentText: string;
    isComplete: boolean;
    error: string | null;
    processingTime: number | null;
}

interface UseStreamingGenerationResult {
    generateStream: (request: MultiPageGenerateRequest) => Promise<string>;
    cancelStream: () => void;
    state: StreamingState;
    resetState: () => void;
}

/**
 * ストリーミングコメント生成のカスタムHook
 * リアルタイムでテキストを受信し、状態を更新
 */
export function useStreamingGeneration(): UseStreamingGenerationResult {
    const [state, setState] = useState<StreamingState>({
        isGenerating: false,
        currentText: '',
        isComplete: false,
        error: null,
        processingTime: null,
    });

    const abortControllerRef = useRef<AbortController | null>(null);

    /**
     * ストリーミング生成を開始
     */
    const generateStream = useCallback(async (
        request: MultiPageGenerateRequest
    ): Promise<string> => {
        // 前回のリクエストをキャンセル
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        setState({
            isGenerating: true,
            currentText: '',
            isComplete: false,
            error: null,
            processingTime: null,
        });

        return new Promise((resolve, reject) => {
            const eventSource = new EventSource(
                `/api/comment/generate-stream?request=${encodeURIComponent(JSON.stringify(request))}`
            );

            // POSTリクエストはEventSourceでは使えないため、fetch + ReadableStreamを使用
            fetch('/api/comment/generate-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
                signal: abortControllerRef.current?.signal,
            })
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(`HTTP error: ${response.status}`);
                    }

                    const reader = response.body?.getReader();
                    if (!reader) {
                        throw new Error('Response body is not readable');
                    }

                    const decoder = new TextDecoder();
                    let fullText = '';
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();

                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });

                        // SSEメッセージを解析
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || ''; // 不完全な行は保持

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                try {
                                    const data = JSON.parse(line.slice(6));

                                    if (data.type === 'start') {
                                        // 開始イベント
                                        setState(prev => ({ ...prev, isGenerating: true }));
                                    } else if (data.type === 'chunk') {
                                        // チャンク受信
                                        fullText += data.text;
                                        setState(prev => ({
                                            ...prev,
                                            currentText: fullText,
                                        }));
                                    } else if (data.type === 'done') {
                                        // 完了
                                        setState({
                                            isGenerating: false,
                                            currentText: data.fullText,
                                            isComplete: true,
                                            error: null,
                                            processingTime: data.processingTime,
                                        });
                                        resolve(data.fullText);
                                    } else if (data.type === 'error') {
                                        // エラー
                                        setState(prev => ({
                                            ...prev,
                                            isGenerating: false,
                                            error: data.error,
                                        }));
                                        reject(new Error(data.error));
                                    }
                                } catch (e) {
                                    // JSONパースエラーは無視
                                }
                            }
                        }
                    }

                    // ストリームが終わった場合（doneイベントなし）
                    if (!state.isComplete && fullText) {
                        setState({
                            isGenerating: false,
                            currentText: fullText,
                            isComplete: true,
                            error: null,
                            processingTime: null,
                        });
                        resolve(fullText);
                    }
                })
                .catch((error) => {
                    if (error.name === 'AbortError') {
                        // キャンセル
                        setState(prev => ({
                            ...prev,
                            isGenerating: false,
                        }));
                        reject(new Error('Generation cancelled'));
                    } else {
                        setState(prev => ({
                            ...prev,
                            isGenerating: false,
                            error: error.message,
                        }));
                        reject(error);
                    }
                });

            // EventSourceのクリーンアップ（未使用）
            eventSource.close();
        });
    }, []);

    /**
     * ストリーミングをキャンセル
     */
    const cancelStream = useCallback(() => {
        abortControllerRef.current?.abort();
        setState(prev => ({
            ...prev,
            isGenerating: false,
        }));
    }, []);

    /**
     * 状態をリセット
     */
    const resetState = useCallback(() => {
        setState({
            isGenerating: false,
            currentText: '',
            isComplete: false,
            error: null,
            processingTime: null,
        });
    }, []);

    return {
        generateStream,
        cancelStream,
        state,
        resetState,
    };
}
