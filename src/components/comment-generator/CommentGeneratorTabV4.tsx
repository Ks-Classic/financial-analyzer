// src/components/comment-generator/CommentGeneratorTabV4.tsx
// 複数図表総合分析機能とV3の切り替え

import React, { useState } from 'react';
import CommentGeneratorTabV3 from './CommentGeneratorTabV3';
import MultiPageAnalysis from './MultiPageAnalysis';

type TabMode = 'simple' | 'multi';

const CommentGeneratorTabV4: React.FC = () => {
    const [mode, setMode] = useState<TabMode>('multi');

    return (
        <div className="h-full flex flex-col">
            {/* モード切替タブ */}
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>✨</span> コメント生成
                    </h2>

                    <div className="flex bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => setMode('simple')}
                            className={`
                px-4 py-2 rounded-lg font-medium text-sm transition-all
                ${mode === 'simple'
                                    ? 'bg-white text-gray-800 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                }
              `}
                        >
                            📊 シンプル（従来版）
                        </button>
                        <button
                            onClick={() => setMode('multi')}
                            className={`
                px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2
                ${mode === 'multi'
                                    ? 'bg-white text-gray-800 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                }
              `}
                        >
                            <span>📄</span>
                            <span>総合分析（新機能）</span>
                            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                                NEW
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* コンテンツ */}
            <div className="flex-1 min-h-0 overflow-auto">
                {mode === 'simple' ? (
                    <CommentGeneratorTabV3 />
                ) : (
                    <MultiPageAnalysis />
                )}
            </div>
        </div>
    );
};

export default CommentGeneratorTabV4;
