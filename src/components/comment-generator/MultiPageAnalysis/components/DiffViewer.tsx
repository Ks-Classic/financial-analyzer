// src/components/comment-generator/MultiPageAnalysis/components/DiffViewer.tsx
// テキスト差分を視覚的に表示するコンポーネント

import React, { useEffect, useState } from 'react';
import { DiffFragment } from '../../../../lib/diff-utils';

interface DiffViewerProps {
    fragments: DiffFragment[];
    autoHide?: boolean; // 指定秒数後に自動で差分ハイライトを消す
    autoHideDuration?: number; // 自動非表示までの秒数（デフォルト3秒）
    className?: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
    fragments,
    autoHide = false,
    autoHideDuration = 3,
    className = '',
}) => {
    const [showDiff, setShowDiff] = useState(true);
    const [isAnimating, setIsAnimating] = useState(true);

    useEffect(() => {
        if (autoHide) {
            // アニメーションフラグをリセット
            setIsAnimating(true);
            setShowDiff(true);

            // 指定秒数後にハイライトをフェードアウト
            const timer = setTimeout(() => {
                setShowDiff(false);
                setIsAnimating(false);
            }, autoHideDuration * 1000);

            return () => clearTimeout(timer);
        }
    }, [autoHide, autoHideDuration, fragments]);

    return (
        <div className={`text-sm text-gray-800 whitespace-pre-wrap leading-relaxed ${className}`}>
            {fragments.map((frag, idx) => {
                // 差分非表示モードまたは共通部分
                if (!showDiff || frag.type === 'common') {
                    return <span key={idx}>{frag.text}</span>;
                }

                // 追加部分（緑ハイライト）
                if (frag.type === 'added') {
                    return (
                        <span
                            key={idx}
                            className={`bg-green-100 text-green-900 px-0.5 rounded transition-all duration-700 ${isAnimating ? 'animate-pulse-subtle' : ''
                                }`}
                            style={{
                                boxShadow: isAnimating ? '0 0 0 2px rgba(34, 197, 94, 0.2)' : 'none',
                            }}
                        >
                            {frag.text}
                        </span>
                    );
                }

                // 削除部分（赤ハイライト・取り消し線）
                if (frag.type === 'removed') {
                    return (
                        <span
                            key={idx}
                            className={`bg-red-50 text-red-700 line-through px-0.5 rounded opacity-80 transition-all duration-700 ${isAnimating ? 'animate-pulse-subtle' : ''
                                }`}
                            style={{
                                boxShadow: isAnimating ? '0 0 0 2px rgba(239, 68, 68, 0.2)' : 'none',
                            }}
                        >
                            {frag.text}
                        </span>
                    );
                }

                return null;
            })}
        </div>
    );
};

/**
 * 差分統計バッジ
 */
interface DiffStatsBadgeProps {
    oldLength: number;
    newLength: number;
    className?: string;
}

export const DiffStatsBadge: React.FC<DiffStatsBadgeProps> = ({
    oldLength,
    newLength,
    className = '',
}) => {
    const diff = newLength - oldLength;
    const isExpanded = diff > 0;

    if (diff === 0) return null;

    return (
        <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${isExpanded
                ? 'bg-blue-50 text-blue-700'
                : 'bg-purple-50 text-purple-700'
                } ${className}`}
        >
            {isExpanded ? '📈' : '📉'}
            {isExpanded ? '+' : ''}
            {diff}文字
        </span>
    );
};

export default DiffViewer;
