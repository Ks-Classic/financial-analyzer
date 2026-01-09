// src/components/comment-generator/MultiPageAnalysis/components/ClientSettings.tsx
// 顧客選択とページ範囲設定コンポーネント（ビジュアル範囲選択対応）

import React, { useState } from 'react';
import { ClientSettings as ClientSettingsType, PageCommentRegion } from '../../../../types/multi-page-analysis';
import { PDFPage } from '../../../../lib/pdf-utils';
import { RegionSelector } from './RegionSelector';
import { DEFAULT_SYSTEM_PROMPT } from '../../../../lib/prompts';

interface ClientSettingsProps {
    clients: ClientSettingsType[];
    selectedClient: ClientSettingsType | null;
    pages: PDFPage[];
    onSelectClient: (clientId: string | null) => void;
    onAddClient: (name: string) => void;
    onUpdateClient: (settings: ClientSettingsType) => void;
    onDeleteClient: (clientId: string) => void;
    onRegionsChange: (regions: PageCommentRegion[]) => void;
    onApplySettings: () => void;
    isExtracting?: boolean;
    extractionProgress?: { current: number; total: number } | null;
    /** 現在のシステムプロンプト */
    systemPrompt?: string;
    /** システムプロンプト変更ハンドラ */
    onSystemPromptChange?: (prompt: string) => void;
}

export const ClientSettingsPanel: React.FC<ClientSettingsProps> = ({
    clients,
    selectedClient,
    pages,
    onSelectClient,
    onAddClient,
    onUpdateClient,
    onDeleteClient,
    onRegionsChange,
    onApplySettings,
    isExtracting = false,
    extractionProgress = null,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    onSystemPromptChange,
}) => {
    const [newClientName, setNewClientName] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingName, setEditingName] = useState('');

    // システムプロンプト編集用
    const [isPromptExpanded, setIsPromptExpanded] = useState(false);

    // 範囲選択モーダル用
    const [selectedPageForRegion, setSelectedPageForRegion] = useState<PDFPage | null>(null);

    // 新規顧客を追加
    const handleAddClient = () => {
        if (newClientName.trim()) {
            onAddClient(newClientName.trim());
            setNewClientName('');
            setIsAdding(false);
        }
    };

    // 顧客名を編集
    const handleEditName = () => {
        if (selectedClient && editingName.trim()) {
            onUpdateClient({
                ...selectedClient,
                clientName: editingName.trim(),
            });
            setIsEditing(false);
        }
    };

    // 範囲を保存
    const handleSaveRegion = (region: PageCommentRegion) => {
        if (!selectedClient) return;

        // 既存の範囲を更新または新規追加
        const existingIndex = selectedClient.pageRegions.findIndex(
            r => r.pageNumber === region.pageNumber
        );

        let newRegions: PageCommentRegion[];
        if (existingIndex >= 0) {
            newRegions = [...selectedClient.pageRegions];
            newRegions[existingIndex] = region;
        } else {
            newRegions = [...selectedClient.pageRegions, region];
        }

        onRegionsChange(newRegions);
        setSelectedPageForRegion(null);
    };

    // 範囲を削除
    const handleRemoveRegion = (pageNumber: number) => {
        if (!selectedClient) return;

        const newRegions = selectedClient.pageRegions.filter(
            r => r.pageNumber !== pageNumber
        );
        onRegionsChange(newRegions);
    };

    // ページの範囲設定状況を取得
    const getPageRegionStatus = (pageNumber: number) => {
        return selectedClient?.pageRegions.find(r => r.pageNumber === pageNumber);
    };

    return (
        <div className="space-y-6">
            {/* 顧客選択セクション */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
                    <span>👤</span> 顧客選択
                </h3>

                <div className="flex flex-wrap gap-2 mb-4">
                    {clients.map(client => (
                        <button
                            key={client.clientId}
                            onClick={() => onSelectClient(client.clientId)}
                            className={`
                                px-4 py-2 rounded-lg font-medium text-sm transition-all
                                ${selectedClient?.clientId === client.clientId
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }
                            `}
                        >
                            {client.clientName}
                        </button>
                    ))}

                    {!isAdding ? (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="px-4 py-2 rounded-lg font-medium text-sm border-2 border-dashed border-gray-300 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-all"
                        >
                            + 新規追加
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={newClientName}
                                onChange={(e) => setNewClientName(e.target.value)}
                                placeholder="顧客名を入力..."
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddClient();
                                    if (e.key === 'Escape') setIsAdding(false);
                                }}
                            />
                            <button
                                onClick={handleAddClient}
                                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                            >
                                追加
                            </button>
                            <button
                                onClick={() => setIsAdding(false)}
                                className="px-3 py-2 text-gray-500 hover:text-gray-700"
                            >
                                ✕
                            </button>
                        </div>
                    )}
                </div>

                {/* 選択中顧客の編集 */}
                {selectedClient && (
                    <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
                        {!isEditing ? (
                            <>
                                <span className="text-gray-600">選択中:</span>
                                <span className="font-bold text-gray-800">{selectedClient.clientName}</span>
                                <button
                                    onClick={() => {
                                        setEditingName(selectedClient.clientName);
                                        setIsEditing(true);
                                    }}
                                    className="text-indigo-600 hover:text-indigo-800 text-sm"
                                >
                                    ✏️ 編集
                                </button>
                                <button
                                    onClick={() => {
                                        if (confirm(`「${selectedClient.clientName}」を削除しますか？`)) {
                                            onDeleteClient(selectedClient.clientId);
                                        }
                                    }}
                                    className="text-red-500 hover:text-red-700 text-sm"
                                >
                                    🗑️ 削除
                                </button>
                            </>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleEditName();
                                        if (e.key === 'Escape') setIsEditing(false);
                                    }}
                                />
                                <button
                                    onClick={handleEditName}
                                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                                >
                                    保存
                                </button>
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className="text-gray-500 hover:text-gray-700"
                                >
                                    キャンセル
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ページ別コメント範囲設定（ビジュアル式） */}
            {selectedClient && pages.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <span>📐</span> ページ別コメント範囲設定
                        </h3>
                        <div className="flex gap-2 items-center">
                            <span className="text-sm text-gray-500">
                                {selectedClient.pageRegions.length}/{pages.length} ページ設定済み
                            </span>
                            <button
                                onClick={onApplySettings}
                                disabled={isExtracting}
                                className={`
                                    px-4 py-1.5 rounded-lg text-sm flex items-center gap-1 transition-colors
                                    ${isExtracting
                                        ? 'bg-indigo-400 text-white cursor-not-allowed'
                                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                    }
                                `}
                            >
                                {isExtracting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>
                                            抽出中...{extractionProgress ? ` (${extractionProgress.current}/${extractionProgress.total})` : ''}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span>✓</span>
                                        <span>設定を適用</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    <p className="text-gray-500 text-sm mb-4">
                        各ページをクリックして、コメントが表示されている範囲をドラッグで選択してください。
                    </p>

                    {/* ページグリッド */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {pages.map(page => {
                            const regionStatus = getPageRegionStatus(page.pageNumber);
                            const hasRegion = !!regionStatus;

                            return (
                                <div
                                    key={page.pageNumber}
                                    className="relative group"
                                >
                                    {/* サムネイル */}
                                    <div
                                        onClick={() => setSelectedPageForRegion(page)}
                                        className={`
                                            aspect-[3/4] rounded-xl overflow-hidden border-2 cursor-pointer transition-all
                                            ${hasRegion
                                                ? 'border-green-500 ring-2 ring-green-200'
                                                : 'border-gray-200 hover:border-indigo-400 hover:ring-2 hover:ring-indigo-200'
                                            }
                                        `}
                                    >
                                        {page.thumbnail ? (
                                            <div className="relative w-full h-full bg-gray-100">
                                                <img
                                                    src={page.thumbnail}
                                                    alt={`P${page.pageNumber}`}
                                                    className="w-full h-full object-cover object-top"
                                                />
                                                {/* 設定済み範囲のオーバーレイ */}
                                                {regionStatus && (
                                                    <div
                                                        className="absolute bg-green-500/30 border-2 border-green-500"
                                                        style={{
                                                            left: `${regionStatus.region.x * 100}%`,
                                                            top: `${regionStatus.region.y * 100}%`,
                                                            width: `${regionStatus.region.width * 100}%`,
                                                            height: `${regionStatus.region.height * 100}%`,
                                                        }}
                                                    />
                                                )}
                                                {/* ホバーオーバーレイ */}
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white font-medium bg-black/50 px-3 py-1 rounded-lg">
                                                        {hasRegion ? '範囲を編集' : '範囲を設定'}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400">
                                                No Image
                                            </div>
                                        )}
                                    </div>

                                    {/* ページ情報 */}
                                    <div className="mt-2 px-1">
                                        <p className="text-sm font-medium text-gray-800 truncate">
                                            P{page.pageNumber}: {page.title}
                                        </p>
                                        {hasRegion ? (
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-green-600 flex items-center gap-1">
                                                    <span>✓</span> 範囲設定済み
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveRegion(page.pageNumber);
                                                    }}
                                                    className="text-xs text-red-500 hover:text-red-700"
                                                >
                                                    削除
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-400">
                                                未設定
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* システムプロンプト設定セクション */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <button
                    onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                    className="w-full flex items-center justify-between"
                >
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <span>⚙️</span> システムプロンプト設定
                        {systemPrompt !== DEFAULT_SYSTEM_PROMPT && (
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                                カスタマイズ済み
                            </span>
                        )}
                    </h3>
                    <span className={`text-gray-400 transition-transform ${isPromptExpanded ? 'rotate-180' : ''}`}>
                        ▼
                    </span>
                </button>

                {isPromptExpanded && (
                    <div className="mt-4 space-y-4">
                        <p className="text-sm text-gray-500">
                            AIがコメントを生成する際の基本指示です。顧客ごとにカスタマイズできます。
                        </p>

                        <div className="relative">
                            <textarea
                                value={systemPrompt}
                                onChange={(e) => onSystemPromptChange?.(e.target.value)}
                                className="w-full h-64 p-4 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
                                placeholder="システムプロンプトを入力..."
                            />
                            <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                                {systemPrompt.length} 文字
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <button
                                onClick={() => onSystemPromptChange?.(DEFAULT_SYSTEM_PROMPT)}
                                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                            >
                                <span>↻</span> デフォルトに戻す
                            </button>

                            {selectedClient && (
                                <button
                                    onClick={() => {
                                        if (selectedClient) {
                                            onUpdateClient({
                                                ...selectedClient,
                                                systemPrompt: systemPrompt,
                                            });
                                            alert('この顧客のシステムプロンプトを保存しました');
                                        }
                                    }}
                                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1"
                                >
                                    <span>💾</span> この顧客に保存
                                </button>
                            )}
                        </div>

                        <div className="p-3 bg-gray-50 rounded-lg">
                            <p className="text-xs text-gray-500">
                                <strong>💡 ヒント:</strong>
                                顧客ごとの文体（敬体/常体）、注力すべき指標、避けるべき表現などを指定すると、より適切なコメントが生成されます。
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* ヒント */}
            <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 flex items-center gap-2 mb-2">
                    <span>💡</span> ヒント
                </h4>
                <ul className="text-sm text-blue-700 space-y-1">
                    <li>• ページをクリックすると範囲選択画面が開きます</li>
                    <li>• マウスでドラッグしてコメントの範囲を選択してください</li>
                    <li>• 範囲を設定したページから前月コメントが自動抽出されます</li>
                    <li>• 一度設定すれば、次回以降は同じ範囲が適用されます</li>
                </ul>
            </div>

            {/* 範囲選択モーダル */}
            {selectedPageForRegion && (
                <RegionSelector
                    page={selectedPageForRegion}
                    existingRegion={getPageRegionStatus(selectedPageForRegion.pageNumber)}
                    onSave={handleSaveRegion}
                    onCancel={() => setSelectedPageForRegion(null)}
                />
            )}
        </div>
    );
};

export default ClientSettingsPanel;
