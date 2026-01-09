// src/components/comment-generator/MultiPageAnalysis/components/ImagePasteArea.tsx
// 画像ペーストエリアコンポーネント

import React, { useRef, useCallback, useState } from 'react';
import { useElementClipboardPaste, PastedImage } from '../../../../hooks/useClipboardPaste';

interface ImagePasteAreaProps {
    imageData: string | null;
    onPaste: (imageData: string) => void;
    onClear: () => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}

export const ImagePasteArea: React.FC<ImagePasteAreaProps> = ({
    imageData,
    onPaste,
    onClear,
    placeholder = 'Ctrl+V で画像をペースト',
    className = '',
    disabled = false,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePaste = useCallback((image: PastedImage) => {
        setError(null);
        onPaste(image.data);
    }, [onPaste]);

    const handleError = useCallback((errorMsg: string) => {
        setError(errorMsg);
        setTimeout(() => setError(null), 3000);
    }, []);

    useElementClipboardPaste(containerRef, handlePaste, {
        enabled: !disabled && isFocused,
        onError: handleError,
    });

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (disabled) return;

        const files = e.dataTransfer.files;
        if (files.length === 0) return;

        const file = files[0];
        if (!file.type.startsWith('image/')) {
            handleError('画像ファイルのみ対応しています');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target?.result as string;
            onPaste(data);
        };
        reader.readAsDataURL(file);
    }, [disabled, onPaste, handleError]);

    return (
        <div
            ref={containerRef}
            tabIndex={0}
            className={`
        relative rounded-xl border-2 border-dashed transition-all duration-200
        focus:outline-none cursor-pointer
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${imageData
                    ? 'border-green-400 bg-green-50'
                    : isFocused
                        ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                        : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50'
                }
        ${className}
      `}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {imageData ? (
                <div className="relative p-4">
                    {/* 画像プレビュー */}
                    <div className="relative aspect-video bg-white rounded-lg overflow-hidden shadow-sm">
                        <img
                            src={imageData}
                            alt="Pasted"
                            className="w-full h-full object-contain"
                        />
                    </div>

                    {/* アクションボタン */}
                    <div className="absolute top-2 right-2 flex gap-2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onClear();
                            }}
                            className="px-3 py-1.5 bg-red-500 text-white text-sm font-medium rounded-lg 
                       hover:bg-red-600 transition-colors shadow-md flex items-center gap-1"
                            disabled={disabled}
                        >
                            <span>🗑️</span>
                            <span>クリア</span>
                        </button>
                    </div>

                    {/* 成功インジケーター */}
                    <div className="absolute bottom-2 left-2 px-3 py-1 bg-green-500 text-white text-xs 
                        font-medium rounded-full flex items-center gap-1">
                        <span>✓</span>
                        <span>画像設定済み</span>
                    </div>
                </div>
            ) : (
                <div
                    className="p-8 text-center"
                    onClick={() => containerRef.current?.focus()}
                >
                    {/* アイコン */}
                    <div className={`text-5xl mb-4 transition-transform duration-200 ${isFocused ? 'scale-110' : ''}`}>
                        📋
                    </div>

                    {/* メインテキスト */}
                    <p className="text-gray-700 font-medium mb-2">
                        {placeholder}
                    </p>

                    {/* サブテキスト */}
                    <p className="text-sm text-gray-500">
                        {isFocused
                            ? '🎯 Ctrl+V でペーストしてください'
                            : 'クリックしてフォーカスを取得'}
                    </p>

                    {/* ドラッグ&ドロップのヒント */}
                    <p className="text-xs text-gray-400 mt-3">
                        または画像ファイルをドラッグ&ドロップ
                    </p>

                    {/* エラー表示 */}
                    {error && (
                        <div className="mt-4 px-4 py-2 bg-red-100 text-red-700 text-sm rounded-lg">
                            ⚠️ {error}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ImagePasteArea;
