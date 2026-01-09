// src/components/comment-generator/MultiPageAnalysis/components/CommentRefiner.tsx
// コメント修正コンポーネント - クイックボタン + フリーテキスト入力（キャッシュ対応）

import React, { useState, useCallback } from 'react';

interface CommentRefinerProps {
    originalComment: string;
    pageTitle?: string;
    previousComment?: string;
    currentImage?: string;          // 今月データ画像（キャッシュがない場合のフォールバック）
    imageCacheId?: string;          // 今月画像のキャッシュID（高速モード）
    onRefinedComment: (comment: string) => void;
    disabled?: boolean;
}

type RefinementType = 'shorter' | 'longer' | 'concise' | 'numeric' | 'positive' | 'custom';

interface QuickButton {
    type: RefinementType;
    label: string;
    icon: string;
    description: string;
}

const QUICK_BUTTONS: QuickButton[] = [
    { type: 'shorter', label: '短く', icon: '📏', description: '約60%に圧縮' },
    { type: 'longer', label: '長く', icon: '📝', description: '約150%に拡張（キャッシュ使用）' },
    { type: 'concise', label: '簡潔に', icon: '✂️', description: 'ビジネスライクに' },
    { type: 'numeric', label: '数値強調', icon: '📊', description: '数値追加（キャッシュ使用）' },
    { type: 'positive', label: 'ポジティブ', icon: '😊', description: '前向きなトーン' },
];

export const CommentRefiner: React.FC<CommentRefinerProps> = ({
    originalComment,
    pageTitle,
    previousComment,
    currentImage,
    imageCacheId,
    onRefinedComment,
    disabled = false,
}) => {
    const [isRefining, setIsRefining] = useState(false);
    const [customInstruction, setCustomInstruction] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    // 修正履歴（undo用）
    const [history, setHistory] = useState<string[]>([]);
    const [currentVersion, setCurrentVersion] = useState(0);

    /**
     * コメントを修正
     */
    const handleRefine = useCallback(async (type: RefinementType, instruction?: string) => {
        if (!originalComment || isRefining) return;

        setIsRefining(true);
        setError(null);

        try {
            const response = await fetch('/api/comment/refine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    originalComment,
                    refinementType: type,
                    customInstruction: type === 'custom' ? instruction : undefined,
                    pageTitle,
                    previousComment,
                    currentImage, // フォールバック用（キャッシュがない場合）
                    imageCacheId, // キャッシュID（高速モード）
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error: ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.refinedComment) {
                // 履歴に追加
                setHistory(prev => [...prev.slice(0, currentVersion + 1), result.refinedComment]);
                setCurrentVersion(prev => prev + 1);

                onRefinedComment(result.refinedComment);
                setCustomInstruction('');

                // キャッシュ使用状況をログ（デバッグ用）
                if (result.usedCache) {
                    console.log('Refinement used cached image (fast mode)');
                }
            } else {
                throw new Error(result.error || '修正に失敗しました');
            }
        } catch (err) {
            console.error('Refinement error:', err);
            setError(err instanceof Error ? err.message : '修正に失敗しました');
        } finally {
            setIsRefining(false);
        }
    }, [originalComment, pageTitle, previousComment, currentImage, imageCacheId, onRefinedComment, isRefining, currentVersion]);

    /**
     * カスタム指示で修正
     */
    const handleCustomRefine = useCallback(() => {
        if (customInstruction.trim()) {
            handleRefine('custom', customInstruction.trim());
        }
    }, [customInstruction, handleRefine]);

    /**
     * 元に戻す
     */
    const handleUndo = useCallback(() => {
        if (currentVersion > 0 && history.length > 0) {
            const prevVersion = currentVersion - 1;
            setCurrentVersion(prevVersion);
            onRefinedComment(prevVersion === 0 ? originalComment : history[prevVersion - 1]);
        }
    }, [currentVersion, history, originalComment, onRefinedComment]);

    if (!originalComment) return null;

    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden mt-3">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full px-4 py-2 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                disabled={disabled}
            >
                <span className="font-medium text-gray-700 flex items-center gap-2 text-sm">
                    <span>🔧</span> コメントを調整
                </span>
                <span className={`text-gray-400 transition-transform text-xs ${isExpanded ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </button>

            {isExpanded && (
                <div className="p-4 space-y-4 bg-white">
                    {/* クイックボタン */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 block mb-2">
                            クイック調整
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {QUICK_BUTTONS.map(button => (
                                <button
                                    key={button.type}
                                    onClick={() => handleRefine(button.type)}
                                    disabled={isRefining || disabled}
                                    className={`
                                        px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1
                                        ${isRefining || disabled
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:shadow-sm'
                                        }
                                    `}
                                    title={button.description}
                                >
                                    <span>{button.icon}</span>
                                    <span>{button.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* フリーテキスト入力 */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 block mb-2">
                            追加指示（自由入力）
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={customInstruction}
                                onChange={(e) => setCustomInstruction(e.target.value)}
                                placeholder="例：在庫の増加理由をもっと詳しく..."
                                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                disabled={isRefining || disabled}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && customInstruction.trim()) {
                                        handleCustomRefine();
                                    }
                                }}
                            />
                            <button
                                onClick={handleCustomRefine}
                                disabled={!customInstruction.trim() || isRefining || disabled}
                                className={`
                                    px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1
                                    ${!customInstruction.trim() || isRefining || disabled
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }
                                `}
                            >
                                {isRefining ? (
                                    <>
                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>修正中</span>
                                    </>
                                ) : (
                                    <>
                                        <span>🔄</span>
                                        <span>適用</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* 元に戻すボタン */}
                    {currentVersion > 0 && (
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                            <span className="text-xs text-gray-400">
                                修正 {currentVersion} 回適用済み
                            </span>
                            <button
                                onClick={handleUndo}
                                disabled={isRefining || disabled}
                                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                            >
                                <span>↩️</span>
                                <span>元に戻す</span>
                            </button>
                        </div>
                    )}

                    {/* エラー表示 */}
                    {error && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-xs text-red-600">❌ {error}</p>
                        </div>
                    )}

                    {/* ローディング表示 */}
                    {isRefining && (
                        <div className="flex items-center justify-center py-2 text-indigo-600">
                            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
                            <span className="text-sm">コメントを修正中...</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CommentRefiner;
