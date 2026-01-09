// src/components/comment-generator/MultiPageAnalysis/components/RegionSelector.tsx
// ドラッグで範囲選択するモーダルコンポーネント

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PDFPage } from '../../../../lib/pdf-utils';
import { PageCommentRegion } from '../../../../types/multi-page-analysis';

interface RegionSelectorProps {
    page: PDFPage;
    existingRegion?: PageCommentRegion;
    onSave: (region: PageCommentRegion) => void;
    onCancel: () => void;
}

interface SelectionBox {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

export const RegionSelector: React.FC<RegionSelectorProps> = ({
    page,
    existingRegion,
    onSave,
    onCancel,
}) => {
    // 画像要素に直接refを付けることで、正確な座標計算を実現
    const imageRef = useRef<HTMLImageElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [selection, setSelection] = useState<SelectionBox | null>(null);
    const [savedRegion, setSavedRegion] = useState<{
        x: number;
        y: number;
        width: number;
        height: number;
    } | null>(existingRegion?.region || null);

    // 既存の範囲があれば初期表示
    useEffect(() => {
        if (existingRegion?.region) {
            setSavedRegion(existingRegion.region);
        }
    }, [existingRegion]);

    // マウス座標を正規化座標(0-1)に変換（画像の実際の表示サイズを基準）
    const getRelativePosition = useCallback((e: React.MouseEvent) => {
        if (!imageRef.current) return { x: 0, y: 0 };

        const rect = imageRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

        return { x, y };
    }, []);

    // ドラッグ開始
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const pos = getRelativePosition(e);
        setIsDrawing(true);
        setSelection({
            startX: pos.x,
            startY: pos.y,
            endX: pos.x,
            endY: pos.y,
        });
        setSavedRegion(null); // 新しい描画を開始
    }, [getRelativePosition]);

    // ドラッグ中
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDrawing || !selection) return;

        const pos = getRelativePosition(e);
        setSelection(prev => prev ? {
            ...prev,
            endX: pos.x,
            endY: pos.y,
        } : null);
    }, [isDrawing, selection, getRelativePosition]);

    // ドラッグ終了
    const handleMouseUp = useCallback(() => {
        if (!isDrawing || !selection) return;

        setIsDrawing(false);

        // 選択範囲を正規化（左上が起点になるように）
        const x = Math.min(selection.startX, selection.endX);
        const y = Math.min(selection.startY, selection.endY);
        const width = Math.abs(selection.endX - selection.startX);
        const height = Math.abs(selection.endY - selection.startY);

        // 最小サイズチェック（小さすぎる選択は無視）
        if (width > 0.02 && height > 0.02) {
            setSavedRegion({ x, y, width, height });
        }

        setSelection(null);
    }, [isDrawing, selection]);

    // 保存
    const handleSave = () => {
        if (!savedRegion) {
            alert('範囲を選択してください');
            return;
        }

        onSave({
            pageNumber: page.pageNumber,
            pageTitle: page.title,
            region: savedRegion,
            isEnabled: true,
        });
    };

    // クリア
    const handleClear = () => {
        setSavedRegion(null);
        setSelection(null);
    };

    // 選択中のボックスのスタイルを計算
    const getSelectionStyle = () => {
        if (!selection) return {};

        const x = Math.min(selection.startX, selection.endX);
        const y = Math.min(selection.startY, selection.endY);
        const width = Math.abs(selection.endX - selection.startX);
        const height = Math.abs(selection.endY - selection.startY);

        return {
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            width: `${width * 100}%`,
            height: `${height * 100}%`,
        };
    };

    // 保存済み範囲のスタイル
    const getSavedRegionStyle = () => {
        if (!savedRegion) return {};

        return {
            left: `${savedRegion.x * 100}%`,
            top: `${savedRegion.y * 100}%`,
            width: `${savedRegion.width * 100}%`,
            height: `${savedRegion.height * 100}%`,
        };
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
                {/* ヘッダー */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <span>📐</span>
                            <span>コメント範囲を選択</span>
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">
                            P{page.pageNumber}: {page.title}
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* ガイド */}
                <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
                    <p className="text-sm text-blue-700 flex items-center gap-2">
                        <span>💡</span>
                        <span>マウスでドラッグして、コメントが表示されている範囲を選択してください</span>
                    </p>
                </div>

                {/* メインコンテンツ */}
                <div className="flex-1 overflow-auto p-6 bg-gray-50">
                    <div className="flex justify-center">
                        {/* 画像サイズに追従するラッパー */}
                        <div
                            className="relative inline-block bg-white shadow-lg rounded-lg overflow-hidden cursor-crosshair select-none"
                            style={{ maxWidth: '100%', maxHeight: 'calc(95vh - 250px)' }}
                        >
                            {/* ページ画像 - refとイベントハンドラを直接付与 */}
                            {page.thumbnail && (
                                <img
                                    ref={imageRef}
                                    src={page.thumbnail}
                                    alt={`P${page.pageNumber}`}
                                    className="block max-h-[calc(95vh-250px)] w-auto"
                                    draggable={false}
                                    onMouseDown={handleMouseDown}
                                    onMouseMove={handleMouseMove}
                                    onMouseUp={handleMouseUp}
                                    onMouseLeave={handleMouseUp}
                                />
                            )}

                            {/* 描画中の選択範囲 */}
                            {selection && (
                                <div
                                    className="absolute border-2 border-indigo-500 bg-indigo-500/20 pointer-events-none"
                                    style={getSelectionStyle()}
                                />
                            )}

                            {/* 保存済みの範囲 */}
                            {savedRegion && !selection && (
                                <div
                                    className="absolute border-2 border-green-500 bg-green-500/20 pointer-events-none"
                                    style={getSavedRegionStyle()}
                                >
                                    <div className="absolute -top-6 left-0 px-2 py-0.5 bg-green-500 text-white text-xs rounded">
                                        コメント範囲
                                    </div>
                                    {/* リサイズハンドル（将来の拡張用） */}
                                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full" />
                                </div>
                            )}

                            {/* 範囲未設定時のオーバーレイ */}
                            {!savedRegion && !selection && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
                                    <div className="px-6 py-4 bg-white/90 rounded-xl shadow-lg text-center">
                                        <p className="text-gray-700 font-medium">
                                            ドラッグで範囲を選択
                                        </p>
                                        <p className="text-gray-500 text-sm mt-1">
                                            コメントが表示されている領域を囲んでください
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* フッター */}
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-4">
                        {savedRegion && (
                            <>
                                <div className="text-sm text-gray-500">
                                    選択範囲:
                                    <span className="ml-2 font-mono text-gray-700">
                                        X: {Math.round(savedRegion.x * 100)}%
                                        Y: {Math.round(savedRegion.y * 100)}%
                                        W: {Math.round(savedRegion.width * 100)}%
                                        H: {Math.round(savedRegion.height * 100)}%
                                    </span>
                                </div>
                                <button
                                    onClick={handleClear}
                                    className="text-sm text-red-500 hover:text-red-700"
                                >
                                    クリア
                                </button>
                            </>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            キャンセル
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!savedRegion}
                            className={`
                                px-6 py-2 font-medium rounded-lg transition-colors flex items-center gap-2
                                ${savedRegion
                                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                }
                            `}
                        >
                            <span>✓</span>
                            <span>この範囲を保存</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RegionSelector;
