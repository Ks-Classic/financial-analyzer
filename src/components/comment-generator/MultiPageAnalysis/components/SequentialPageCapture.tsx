// src/components/comment-generator/MultiPageAnalysis/components/SequentialPageCapture.tsx
// ページごとに画像キャプチャ→コメント生成を行うコンポーネント（ストリーミング対応）

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PDFPage } from '../../../../lib/pdf-utils';
import { SinglePageGenerationState, PageCommentRegion } from '../../../../types/multi-page-analysis';
import { ImagePasteArea } from './ImagePasteArea';
import { CommentRefiner } from './CommentRefiner';
import { DEFAULT_SYSTEM_PROMPT } from '../../../../lib/prompts';

interface SequentialPageCaptureProps {
    pages: PDFPage[];
    pageRegions: PageCommentRegion[];
    systemPrompt: string;
    pagePrompts: Map<number, string>;
    /** @deprecated ストリーミングAPIを直接呼び出すため未使用 */
    onGenerateComment?: (pageNumber: number, imageData: string, customPrompt?: string) => Promise<string>;
    onAllComplete: (results: Map<number, string>) => void;
    /** ページプロンプト更新ハンドラ（編集内容を親に伝える） */
    onPagePromptChange?: (pageNumber: number, prompt: string) => void;
}

export const SequentialPageCapture: React.FC<SequentialPageCaptureProps> = ({
    pages,
    pageRegions,
    systemPrompt,
    pagePrompts,
    // onGenerateComment は未使用（ストリーミングAPIを直接呼び出し）
    onAllComplete,
    onPagePromptChange,
}) => {
    // 対象ページ（設定で有効になっているページのみ）
    const enabledPages = pages.filter(page => {
        const region = pageRegions.find(r => r.pageNumber === page.pageNumber);
        return region?.isEnabled !== false; // デフォルトは有効
    });

    // 各ページの状態
    const [pageStates, setPageStates] = useState<Map<number, SinglePageGenerationState>>(() => {
        const initial = new Map<number, SinglePageGenerationState>();
        enabledPages.forEach(page => {
            initial.set(page.pageNumber, {
                pageNumber: page.pageNumber,
                pageTitle: page.title,
                hasCurrentImage: false,
                hasComment: false,
                isGenerating: false,
            });
        });
        return initial;
    });

    // 現在のインデックス
    const [currentIndex, setCurrentIndex] = useState(0);

    // 画像データを保持
    const [imageDataMap, setImageDataMap] = useState<Map<number, string>>(new Map());

    // 生成されたコメント
    const [commentsMap, setCommentsMap] = useState<Map<number, string>>(new Map());

    // 画像キャッシュID（修正時に使用）
    const [imageCacheMap, setImageCacheMap] = useState<Map<number, string>>(new Map());

    // 拡大表示用
    const [expandedImage, setExpandedImage] = useState<string | null>(null);

    // プロンプト編集パネル表示状態
    const [isPromptPanelOpen, setIsPromptPanelOpen] = useState(false);

    // ローカルプロンプト編集用（このページ用のカスタムプロンプト）
    const [localPagePrompt, setLocalPagePrompt] = useState<string>('');

    // ストリーミング中のテキスト
    const [streamingText, setStreamingText] = useState<string>('');

    // ストリーミング用のAbortController
    const abortControllerRef = useRef<AbortController | null>(null);

    // 現在のページ
    const currentPage = enabledPages[currentIndex];
    const currentState = currentPage ? pageStates.get(currentPage.pageNumber) : null;

    // ページ変更時にローカルプロンプトを同期
    useEffect(() => {
        if (currentPage) {
            const savedPrompt = pagePrompts.get(currentPage.pageNumber) || '';
            setLocalPagePrompt(savedPrompt);
        }
    }, [currentPage?.pageNumber, pagePrompts]);

    // 完了ページ数
    const completedCount = Array.from(pageStates.values()).filter(s => s.hasComment).length;
    const progress = enabledPages.length > 0 ? (completedCount / enabledPages.length) * 100 : 0;

    // 画像をペースト
    const handleImagePaste = useCallback((imageData: string) => {
        if (!currentPage) return;

        setImageDataMap(prev => {
            const next = new Map(prev);
            next.set(currentPage.pageNumber, imageData);
            return next;
        });

        setPageStates(prev => {
            const next = new Map(prev);
            const state = next.get(currentPage.pageNumber);
            if (state) {
                next.set(currentPage.pageNumber, { ...state, hasCurrentImage: true });
            }
            return next;
        });

        // 新しい画像をペーストしたらキャッシュIDをクリア（再作成を促す）
        setImageCacheMap(prev => {
            const next = new Map(prev);
            next.delete(currentPage.pageNumber);
            return next;
        });
    }, [currentPage]);

    // 画像をクリア
    const handleImageClear = useCallback(() => {
        if (!currentPage) return;

        setImageDataMap(prev => {
            const next = new Map(prev);
            next.delete(currentPage.pageNumber);
            return next;
        });

        setPageStates(prev => {
            const next = new Map(prev);
            const state = next.get(currentPage.pageNumber);
            if (state) {
                next.set(currentPage.pageNumber, { ...state, hasCurrentImage: false });
            }
            return next;
        });

        // キャッシュIDもクリア
        setImageCacheMap(prev => {
            const next = new Map(prev);
            next.delete(currentPage.pageNumber);
            return next;
        });
    }, [currentPage]);

    // このページのコメントを生成（ストリーミング対応）
    const handleGenerateForCurrentPage = async () => {
        if (!currentPage) return;

        const imageData = imageDataMap.get(currentPage.pageNumber);
        if (!imageData) {
            alert('画像を先にペーストしてください');
            return;
        }

        // ローカルで編集したプロンプトを親に通知
        if (localPagePrompt && onPagePromptChange) {
            onPagePromptChange(currentPage.pageNumber, localPagePrompt);
        }

        // 前回のリクエストをキャンセル
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        // 生成中状態に更新 & ストリーミングテキストをリセット
        setStreamingText('');
        setPageStates(prev => {
            const next = new Map(prev);
            const state = next.get(currentPage.pageNumber);
            if (state) {
                next.set(currentPage.pageNumber, { ...state, isGenerating: true, error: undefined });
            }
            return next;
        });

        // 既存のキャッシュIDを取得（再生成時は新しいキャッシュを作成しない）
        const existingCacheId = imageCacheMap.get(currentPage.pageNumber);

        try {
            // ストリーミングAPIを呼び出し
            const response = await fetch('/api/comment/generate-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetPage: {
                        pageNumber: currentPage.pageNumber,
                        pageTitle: currentPage.title,
                        currentImage: imageData,
                        previousImage: currentPage.thumbnail || '',
                        previousComment: currentPage.extractedComment || '',
                        existingCacheId, // 既存キャッシュがあればスキップ
                    },
                    contextPages: [],
                    systemPrompt,
                    pagePrompt: localPagePrompt || pagePrompts.get(currentPage.pageNumber) || '',
                }),
                signal: abortControllerRef.current?.signal,
            });

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

            // ストリームを読み込み
            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // SSEメッセージを解析
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'chunk') {
                                fullText += data.text;
                                setStreamingText(fullText);
                            } else if (data.type === 'done') {
                                fullText = data.fullText;

                                // 成功
                                setCommentsMap(prev => {
                                    const next = new Map(prev);
                                    next.set(currentPage.pageNumber, fullText);
                                    return next;
                                });

                                // キャッシュIDを保存（修正時に使用）
                                if (data.imageCacheId) {
                                    setImageCacheMap(prev => {
                                        const next = new Map(prev);
                                        next.set(currentPage.pageNumber, data.imageCacheId);
                                        return next;
                                    });
                                }

                                setPageStates(prev => {
                                    const next = new Map(prev);
                                    const state = next.get(currentPage.pageNumber);
                                    if (state) {
                                        next.set(currentPage.pageNumber, {
                                            ...state,
                                            isGenerating: false,
                                            hasComment: true,
                                            comment: fullText,
                                        });
                                    }
                                    return next;
                                });

                                setStreamingText('');
                            } else if (data.type === 'error') {
                                throw new Error(data.error);
                            }
                        } catch (e) {
                            // JSONパースエラーは無視（不完全なデータの可能性）
                            if (e instanceof SyntaxError) continue;
                            throw e;
                        }
                    }
                }
            }

            // ストリームが正常終了したがdoneイベントがなかった場合
            if (fullText && !commentsMap.has(currentPage.pageNumber)) {
                setCommentsMap(prev => {
                    const next = new Map(prev);
                    next.set(currentPage.pageNumber, fullText);
                    return next;
                });

                setPageStates(prev => {
                    const next = new Map(prev);
                    const state = next.get(currentPage.pageNumber);
                    if (state) {
                        next.set(currentPage.pageNumber, {
                            ...state,
                            isGenerating: false,
                            hasComment: true,
                            comment: fullText,
                        });
                    }
                    return next;
                });

                setStreamingText('');
            }
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                // キャンセルされた場合は何もしない
                return;
            }

            // エラー
            setStreamingText('');
            setPageStates(prev => {
                const next = new Map(prev);
                const state = next.get(currentPage.pageNumber);
                if (state) {
                    next.set(currentPage.pageNumber, {
                        ...state,
                        isGenerating: false,
                        error: error instanceof Error ? error.message : '生成に失敗しました',
                    });
                }
                return next;
            });
        }
    };

    // 次のページへ
    const handleNextPage = () => {
        if (currentIndex < enabledPages.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            // 全完了
            onAllComplete(commentsMap);
        }
    };

    // 前のページへ
    const handlePrevPage = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    // スキップ
    const handleSkip = () => {
        handleNextPage();
    };

    // このページをコピー
    const handleCopyComment = () => {
        const comment = commentsMap.get(currentPage?.pageNumber || 0);
        if (comment) {
            navigator.clipboard.writeText(comment);
        }
    };

    if (!currentPage) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">対象のページがありません</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* 進捗バー */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-gray-800">
                        📷 ページごとにキャプチャ → コメント生成
                    </h3>
                    <span className="text-sm text-gray-500">
                        {completedCount}/{enabledPages.length} ページ完了
                    </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>
                {/* ページインジケーター */}
                <div className="flex gap-1 mt-3 flex-wrap">
                    {enabledPages.map((page, index) => {
                        const state = pageStates.get(page.pageNumber);
                        return (
                            <button
                                key={page.pageNumber}
                                onClick={() => setCurrentIndex(index)}
                                className={`
                                    w-8 h-8 rounded-lg text-xs font-medium transition-all
                                    ${index === currentIndex
                                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-300'
                                        : state?.hasComment
                                            ? 'bg-green-100 text-green-700'
                                            : state?.hasCurrentImage
                                                ? 'bg-yellow-100 text-yellow-700'
                                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }
                                `}
                                title={page.title}
                            >
                                {state?.hasComment ? '✓' : page.pageNumber}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 現在のページ */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>P{currentPage.pageNumber}</span>
                        <span className="text-gray-400">:</span>
                        <span>{currentPage.title}</span>
                    </h3>
                    <div className="flex items-center gap-2">
                        {currentState?.hasComment && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                                ✓ 生成済み
                            </span>
                        )}
                        {currentState?.isGenerating && (
                            <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full animate-pulse">
                                生成中...
                            </span>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 左: 前月レポート参照 */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="font-medium text-gray-700">【前月レポート参照】</h4>
                            {currentPage.thumbnail && (
                                <button
                                    onClick={() => setExpandedImage(currentPage.thumbnail || null)}
                                    className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 flex items-center gap-1"
                                >
                                    <span>🔍</span>
                                    <span>拡大表示</span>
                                </button>
                            )}
                        </div>
                        {currentPage.thumbnail && (
                            <div
                                className="bg-gray-100 rounded-lg overflow-hidden border border-gray-200 relative cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all"
                                onClick={() => setExpandedImage(currentPage.thumbnail || null)}
                                style={{ maxHeight: '400px' }}
                            >
                                <img
                                    src={currentPage.thumbnail}
                                    alt="前月レポート"
                                    className="w-full object-contain object-top"
                                    style={{ maxHeight: '400px' }}
                                />
                                {/* コメント範囲オーバーレイ */}
                                {(() => {
                                    const region = pageRegions.find(r => r.pageNumber === currentPage.pageNumber);
                                    if (region) {
                                        return (
                                            <div
                                                className="absolute bg-yellow-400 bg-opacity-30 border-2 border-yellow-500 border-dashed"
                                                style={{
                                                    left: `${region.region.x * 100}%`,
                                                    top: `${region.region.y * 100}%`,
                                                    width: `${region.region.width * 100}%`,
                                                    height: `${region.region.height * 100}%`,
                                                }}
                                            >
                                                <span className="absolute top-1 left-1 text-xs bg-yellow-500 text-white px-1 rounded">
                                                    コメント範囲
                                                </span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                                {/* 拡大アイコン */}
                                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 text-white text-xs rounded flex items-center gap-1">
                                    <span>🔍</span>
                                    <span>クリックで拡大</span>
                                </div>
                            </div>
                        )}
                        {currentPage.extractedComment && (
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-500 mb-1">前月コメント:</p>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                    {currentPage.extractedComment}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 右: 今月データ入力と生成結果 */}
                    <div className="space-y-4">
                        <div className="space-y-3">
                            <h4 className="font-medium text-gray-700">【今月データ】</h4>
                            <ImagePasteArea
                                imageData={imageDataMap.get(currentPage.pageNumber) || null}
                                onPaste={handleImagePaste}
                                onClear={handleImageClear}
                                placeholder={`P${currentPage.pageNumber}の今月データをペースト (Ctrl+V)`}
                                className="min-h-[200px]"
                            />
                        </div>

                        {/* プロンプト編集パネル */}
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <button
                                onClick={() => setIsPromptPanelOpen(!isPromptPanelOpen)}
                                className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                            >
                                <span className="font-medium text-gray-700 flex items-center gap-2">
                                    <span>⚙️</span> プロンプト設定
                                    {localPagePrompt && localPagePrompt !== (pagePrompts.get(currentPage.pageNumber) || '') && (
                                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">
                                            編集中
                                        </span>
                                    )}
                                </span>
                                <span className={`text-gray-400 transition-transform ${isPromptPanelOpen ? 'rotate-180' : ''}`}>
                                    ▼
                                </span>
                            </button>

                            {isPromptPanelOpen && (
                                <div className="p-4 space-y-4 bg-white">
                                    {/* システムプロンプト表示（読み取り専用） */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-gray-600">
                                                システムプロンプト（共通設定）
                                            </label>
                                            {systemPrompt !== DEFAULT_SYSTEM_PROMPT && (
                                                <span className="text-xs text-indigo-600">カスタマイズ済み</span>
                                            )}
                                        </div>
                                        <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600 max-h-24 overflow-y-auto font-mono">
                                            {systemPrompt.slice(0, 200)}{systemPrompt.length > 200 ? '...' : ''}
                                        </div>
                                        <p className="mt-1 text-xs text-gray-400">
                                            ※ 顧客設定画面で編集可能
                                        </p>
                                    </div>

                                    {/* ページ個別プロンプト編集 */}
                                    <div>
                                        <label className="text-sm font-medium text-gray-600 block mb-2">
                                            このページ専用の追加指示
                                        </label>
                                        <textarea
                                            value={localPagePrompt}
                                            onChange={(e) => setLocalPagePrompt(e.target.value)}
                                            className="w-full h-32 p-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
                                            placeholder="例：「売上高の増加要因について詳しく記載してください」「前年同月比と比較するコメントを追加」など..."
                                        />
                                        <div className="flex items-center justify-between mt-2">
                                            <span className="text-xs text-gray-400">
                                                {localPagePrompt.length} 文字
                                            </span>
                                            {localPagePrompt && (
                                                <button
                                                    onClick={() => setLocalPagePrompt('')}
                                                    className="text-xs text-gray-500 hover:text-gray-700"
                                                >
                                                    クリア
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-2 bg-blue-50 rounded-lg">
                                        <p className="text-xs text-blue-600">
                                            💡 このフィールドに記入した内容は、このページのコメント生成時のみ使用されます。
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 生成ボタン */}
                        <div className="flex gap-2">
                            <button
                                onClick={handleGenerateForCurrentPage}
                                disabled={!currentState?.hasCurrentImage || currentState?.isGenerating}
                                className={`
                                    flex-1 px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2
                                    ${currentState?.hasCurrentImage && !currentState?.isGenerating
                                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow-lg'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }
                                `}
                            >
                                {currentState?.isGenerating ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>生成中...</span>
                                    </>
                                ) : currentState?.hasComment ? (
                                    <>
                                        <span>🔄</span>
                                        <span>再生成</span>
                                    </>
                                ) : (
                                    <>
                                        <span>✨</span>
                                        <span>このページを生成</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* ストリーミング中の表示 */}
                        {currentState?.isGenerating && (
                            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                    <h5 className="font-medium text-indigo-800 text-sm">
                                        {streamingText ? 'リアルタイム生成中...' : 'AIが画像を分析中...'}
                                    </h5>
                                </div>
                                {streamingText ? (
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                        {streamingText}
                                        <span className="inline-block w-1 h-4 bg-indigo-500 animate-pulse ml-0.5" />
                                    </p>
                                ) : (
                                    <div className="flex items-center gap-1 text-sm text-gray-500">
                                        <span className="inline-block w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
                                        <span className="inline-block w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                                        <span className="inline-block w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                                        <span className="ml-2">コメントを生成しています...</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 生成結果 */}
                        {currentState?.hasComment && commentsMap.get(currentPage.pageNumber) && (
                            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <h5 className="font-medium text-green-800 flex items-center gap-1">
                                        <span>✓</span> 生成されたコメント
                                        <span className="text-xs text-green-600 font-normal ml-2">（直接編集可能）</span>
                                    </h5>
                                    <button
                                        onClick={handleCopyComment}
                                        className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                    >
                                        📋 コピー
                                    </button>
                                </div>
                                <textarea
                                    value={commentsMap.get(currentPage.pageNumber) || ''}
                                    onChange={(e) => {
                                        const newValue = e.target.value;
                                        setCommentsMap(prev => {
                                            const next = new Map(prev);
                                            next.set(currentPage.pageNumber, newValue);
                                            return next;
                                        });
                                    }}
                                    className="w-full min-h-[150px] p-3 text-sm text-gray-700 bg-white border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-y"
                                    placeholder="コメントを編集..."
                                />

                                {/* コメント修正パネル */}
                                <CommentRefiner
                                    originalComment={commentsMap.get(currentPage.pageNumber) || ''}
                                    pageTitle={currentPage.title}
                                    previousComment={currentPage.extractedComment}
                                    currentImage={imageDataMap.get(currentPage.pageNumber)}
                                    imageCacheId={imageCacheMap.get(currentPage.pageNumber)}
                                    onRefinedComment={(refinedComment) => {
                                        setCommentsMap(prev => {
                                            const next = new Map(prev);
                                            next.set(currentPage.pageNumber, refinedComment);
                                            return next;
                                        });
                                    }}
                                    disabled={currentState?.isGenerating}
                                />
                            </div>
                        )}

                        {/* エラー */}
                        {currentState?.error && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-red-700 text-sm">
                                    ❌ {currentState.error}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ナビゲーション */}
            <div className="flex justify-between items-center">
                <button
                    onClick={handlePrevPage}
                    disabled={currentIndex === 0}
                    className={`
                        px-4 py-2 rounded-lg font-medium flex items-center gap-2
                        ${currentIndex > 0
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        }
                    `}
                >
                    <span>←</span>
                    <span>前のページ</span>
                </button>

                <button
                    onClick={handleSkip}
                    className="px-4 py-2 text-gray-500 hover:text-gray-700"
                >
                    スキップ →
                </button>

                <button
                    onClick={handleNextPage}
                    className={`
                        px-6 py-2 rounded-lg font-medium flex items-center gap-2
                        ${currentIndex === enabledPages.length - 1
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }
                    `}
                >
                    {currentIndex === enabledPages.length - 1 ? (
                        <>
                            <span>🎉</span>
                            <span>完了</span>
                        </>
                    ) : (
                        <>
                            <span>次のページ</span>
                            <span>→</span>
                        </>
                    )}
                </button>
            </div>

            {/* 拡大表示モーダル */}
            {expandedImage && (
                <div
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                    onClick={() => setExpandedImage(null)}
                >
                    <div className="relative max-w-5xl max-h-[90vh] overflow-auto">
                        <button
                            onClick={() => setExpandedImage(null)}
                            className="absolute top-2 right-2 w-10 h-10 bg-white rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 shadow-lg z-10"
                        >
                            ✕
                        </button>
                        <img
                            src={expandedImage}
                            alt="拡大表示"
                            className="max-w-full max-h-[85vh] object-contain rounded-lg"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default SequentialPageCapture;
