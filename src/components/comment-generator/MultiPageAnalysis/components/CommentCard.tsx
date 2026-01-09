// src/components/comment-generator/MultiPageAnalysis/components/CommentCard.tsx
// コメント表示・編集カードコンポーネント - Lサイズ固定 + チャット修正

import React, { useState, useRef, useEffect } from 'react';
import { GeneratedCommentResult } from '../../../../types/multi-page-analysis';

interface CommentCardProps {
    pageNumber: number;
    pageTitle: string;
    previousComment?: string;
    generatedComment: GeneratedCommentResult;
    editedComment?: string;
    currentImage?: string;
    cacheId?: string;
    onEdit: (pageNumber: number, comment: string) => void;
    onRegenerate: (pageNumber: number) => void;
    onCopy: (comment: string) => void;
    onImageClick?: (image: string) => void;
    onChatRefine?: (pageNumber: number, instruction: string) => Promise<string>;
    isRegenerating?: boolean;
    showPreviousComment?: boolean;
}

export const CommentCard: React.FC<CommentCardProps> = ({
    pageNumber,
    pageTitle,
    previousComment,
    generatedComment,
    editedComment,
    currentImage,
    cacheId,
    onEdit,
    onRegenerate,
    onCopy,
    onImageClick,
    onChatRefine,
    isRegenerating = false,
    showPreviousComment = false,
}) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [localEdit, setLocalEdit] = useState(editedComment || generatedComment.comment);
    const [copied, setCopied] = useState(false);
    const [showPrev, setShowPrev] = useState(showPreviousComment);
    const [chatInput, setChatInput] = useState('');
    const [isRefining, setIsRefining] = useState(false);

    // 外部からのshowPreviousComment変更に追従
    useEffect(() => {
        setShowPrev(showPreviousComment);
    }, [showPreviousComment]);

    const displayComment = editedComment || generatedComment.comment;
    const isError = generatedComment.status === 'error';

    const handleSave = () => {
        onEdit(pageNumber, localEdit);
        setIsEditing(false);
    };

    const handleCopy = () => {
        onCopy(displayComment);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const handleChatRefine = async () => {
        if (!chatInput.trim() || !onChatRefine) return;

        setIsRefining(true);
        try {
            const refined = await onChatRefine(pageNumber, chatInput.trim());
            onEdit(pageNumber, refined);
            setChatInput('');
        } catch (e) {
            console.error('Chat refine error:', e);
        } finally {
            setIsRefining(false);
        }
    };

    if (isError) {
        return (
            <div
                ref={cardRef}
                id={`page-${pageNumber}`}
                className="flex items-center gap-4 p-3 bg-red-50 border border-red-200 rounded-lg"
            >
                <div className="w-10 h-10 rounded-lg bg-red-500 text-white flex items-center justify-center font-bold">
                    {pageNumber}
                </div>
                <div className="flex-1">
                    <span className="font-medium text-red-700">{pageTitle}</span>
                    <p className="text-red-600 text-sm">{generatedComment.error}</p>
                </div>
                <button
                    onClick={() => onRegenerate(pageNumber)}
                    disabled={isRegenerating}
                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                    {isRegenerating ? '再生成中...' : '🔄 再生成'}
                </button>
            </div>
        );
    }

    return (
        <div
            ref={cardRef}
            id={`page-${pageNumber}`}
            className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow"
        >
            {/* ヘッダー - シンプル */}
            <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-slate-50 to-white border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm">
                        {pageNumber}
                    </div>
                    <span className="font-semibold text-gray-800">{pageTitle}</span>
                    {editedComment && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">編集済</span>
                    )}
                    {cacheId && (
                        <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">⚡高速</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {previousComment && (
                        <button
                            onClick={() => setShowPrev(!showPrev)}
                            className={`px-2 py-1 text-xs rounded-lg transition-colors ${showPrev
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {showPrev ? '前月 ▼' : '前月 ▶'}
                        </button>
                    )}
                    <button
                        onClick={handleCopy}
                        className={`px-3 py-1 text-xs rounded-lg transition-all ${copied
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700'
                            }`}
                    >
                        {copied ? '✓ コピー済' : '📋 コピー'}
                    </button>
                    <button
                        onClick={() => onRegenerate(pageNumber)}
                        disabled={isRegenerating}
                        className="px-3 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 disabled:opacity-50"
                    >
                        {isRegenerating ? '...' : '🔄'}
                    </button>
                </div>
            </div>

            {/* メインコンテンツ - Lサイズ固定 */}
            <div className="flex min-h-[280px]">
                {/* 今月画像 - 大きめ固定 */}
                <div
                    className="flex-shrink-0 w-96 border-r border-gray-100 cursor-pointer group relative bg-gray-50 flex items-center justify-center"
                    onClick={() => currentImage && onImageClick?.(currentImage)}
                >
                    {currentImage ? (
                        <>
                            <img
                                src={currentImage}
                                alt={`P${pageNumber}`}
                                className="w-full h-full object-contain max-h-[280px]"
                            />
                            <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                🔍 拡大
                            </div>
                        </>
                    ) : (
                        <div className="text-gray-400 text-sm">画像なし</div>
                    )}
                </div>

                {/* 生成コメント + チャット修正 */}
                <div className={`flex-1 flex flex-col p-3 min-w-0 ${showPrev && previousComment ? 'border-r border-gray-100' : ''}`}>
                    {isEditing ? (
                        <div className="flex-1 flex flex-col">
                            <textarea
                                value={localEdit}
                                onChange={(e) => setLocalEdit(e.target.value)}
                                className="flex-1 w-full p-2 border border-indigo-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 min-h-[200px]"
                                autoFocus
                            />
                            <div className="flex gap-2 justify-end mt-2">
                                <button
                                    onClick={() => { setLocalEdit(displayComment); setIsEditing(false); }}
                                    className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
                                >
                                    キャンセル
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                >
                                    保存
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div
                                className="flex-1 text-sm text-gray-800 whitespace-pre-wrap cursor-text hover:bg-indigo-50/50 rounded-lg p-2 transition-colors overflow-y-auto max-h-[200px]"
                                onClick={() => setIsEditing(true)}
                                title="クリックで編集"
                            >
                                {displayComment || '（コメントなし）'}
                            </div>

                            {/* チャット修正エリア */}
                            <div className="mt-2 pt-2 border-t border-gray-100">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChatRefine()}
                                        placeholder="💬 修正指示（例: もっと簡潔に）"
                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                                        disabled={isRefining}
                                    />
                                    <button
                                        onClick={handleChatRefine}
                                        disabled={isRefining || !chatInput.trim()}
                                        className="px-4 py-1.5 text-sm bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                                    >
                                        {isRefining ? (
                                            <>
                                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                修正中
                                            </>
                                        ) : (
                                            '⚡修正'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* 前月コメント */}
                {showPrev && previousComment && (
                    <div className="flex-shrink-0 w-72 p-3 bg-amber-50/50 overflow-y-auto max-h-[280px]">
                        <div className="text-xs text-amber-600 font-medium mb-1">前月コメント</div>
                        <div className="text-sm text-gray-600 whitespace-pre-wrap">
                            {previousComment}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommentCard;
