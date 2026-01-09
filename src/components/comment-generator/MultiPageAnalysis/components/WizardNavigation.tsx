// src/components/comment-generator/MultiPageAnalysis/components/WizardNavigation.tsx
// ウィザードナビゲーションコンポーネント

import React from 'react';

interface WizardNavigationProps {
    currentIndex: number;
    totalPages: number;
    onPrev: () => void;
    onNext: () => void;
    onSkip?: () => void;
    canPrev: boolean;
    canNext: boolean;
    nextLabel?: string;
    prevLabel?: string;
    showSkip?: boolean;
    isLoading?: boolean;
}

export const WizardNavigation: React.FC<WizardNavigationProps> = ({
    currentIndex,
    totalPages,
    onPrev,
    onNext,
    onSkip,
    canPrev,
    canNext,
    nextLabel = '次へ',
    prevLabel = '戻る',
    showSkip = true,
    isLoading = false,
}) => {
    return (
        <div className="flex flex-col gap-4 mt-6">
            {/* 進捗ドット */}
            <div className="flex items-center justify-center gap-1">
                {Array.from({ length: totalPages }).map((_, index) => (
                    <div
                        key={index}
                        className={`
              w-3 h-3 rounded-full transition-all duration-200
              ${index < currentIndex
                                ? 'bg-indigo-500'
                                : index === currentIndex
                                    ? 'bg-indigo-600 ring-2 ring-indigo-200 scale-110'
                                    : 'bg-gray-300'
                            }
            `}
                    />
                ))}
            </div>

            {/* 進捗テキスト */}
            <div className="text-center text-sm text-gray-500">
                {currentIndex + 1} / {totalPages} ページ完了
            </div>

            {/* ナビゲーションボタン */}
            <div className="flex items-center justify-between">
                <button
                    onClick={onPrev}
                    disabled={!canPrev || isLoading}
                    className={`
            px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2
            ${canPrev && !isLoading
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        }
          `}
                >
                    <span>←</span>
                    <span>{prevLabel}</span>
                </button>

                <div className="flex items-center gap-2">
                    {showSkip && onSkip && (
                        <button
                            onClick={onSkip}
                            disabled={isLoading}
                            className="px-4 py-2 text-gray-500 hover:text-gray-700 font-medium transition-colors"
                        >
                            スキップ
                        </button>
                    )}

                    <button
                        onClick={onNext}
                        disabled={!canNext || isLoading}
                        className={`
              px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2
              ${canNext && !isLoading
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'
                                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                            }
            `}
                    >
                        {isLoading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>処理中...</span>
                            </>
                        ) : (
                            <>
                                <span>{nextLabel}</span>
                                <span>→</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WizardNavigation;
