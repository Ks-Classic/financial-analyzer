// src/components/comment-generator/MultiPageAnalysis/components/PromptEditor.tsx
// プロンプト編集コンポーネント

import React, { useState, useEffect } from 'react';
import { PDFPage } from '../../../../lib/pdf-utils';
import { DEFAULT_SYSTEM_PROMPT, loadPromptTemplates, savePromptTemplate, deletePromptTemplate, PromptTemplate } from '../../../../lib/prompts';
import { generatePagePrompt, GeneratedPrompt } from '../../../../lib/prompt-generator';

interface PromptEditorProps {
    systemPrompt: string;
    onSystemPromptChange: (prompt: string) => void;
    pagePrompts: Map<number, string>;
    onPagePromptChange: (pageNumber: number, prompt: string) => void;
    pages: PDFPage[];
}

export const PromptEditor: React.FC<PromptEditorProps> = ({
    systemPrompt,
    onSystemPromptChange,
    pagePrompts,
    onPagePromptChange,
    pages,
}) => {
    const [isSystemExpanded, setIsSystemExpanded] = useState(false);
    const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
    const [templates, setTemplates] = useState<PromptTemplate[]>([]);
    const [templateName, setTemplateName] = useState('');
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [showLoadDialog, setShowLoadDialog] = useState(false);
    const [generatedPrompts, setGeneratedPrompts] = useState<Map<number, GeneratedPrompt>>(new Map());

    // テンプレート読み込み
    useEffect(() => {
        setTemplates(loadPromptTemplates());
    }, []);

    // ページプロンプトの自動生成
    useEffect(() => {
        const newGeneratedPrompts = new Map<number, GeneratedPrompt>();
        pages.forEach(page => {
            if (!pagePrompts.has(page.pageNumber)) {
                const generated = generatePagePrompt({
                    pageNumber: page.pageNumber,
                    pageTitle: page.title,
                    previousComment: page.extractedComment || '',
                });
                newGeneratedPrompts.set(page.pageNumber, generated);
            }
        });
        setGeneratedPrompts(newGeneratedPrompts);
    }, [pages, pagePrompts]);

    const togglePageExpand = (pageNumber: number) => {
        setExpandedPages(prev => {
            const next = new Set(prev);
            if (next.has(pageNumber)) {
                next.delete(pageNumber);
            } else {
                next.add(pageNumber);
            }
            return next;
        });
    };

    const handleResetSystem = () => {
        onSystemPromptChange(DEFAULT_SYSTEM_PROMPT);
    };

    const handleResetPage = (pageNumber: number) => {
        const generated = generatedPrompts.get(pageNumber);
        if (generated) {
            onPagePromptChange(pageNumber, generated.prompt);
        }
    };

    const handleSaveTemplate = () => {
        if (!templateName.trim()) return;

        const template: PromptTemplate = {
            id: Date.now().toString(),
            name: templateName.trim(),
            systemPrompt,
            pagePrompts: Object.fromEntries(pagePrompts),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        savePromptTemplate(template);
        setTemplates(loadPromptTemplates());
        setTemplateName('');
        setShowSaveDialog(false);
    };

    const handleLoadTemplate = (template: PromptTemplate) => {
        onSystemPromptChange(template.systemPrompt);
        Object.entries(template.pagePrompts).forEach(([pageNum, prompt]) => {
            onPagePromptChange(Number(pageNum), prompt);
        });
        setShowLoadDialog(false);
    };

    const handleDeleteTemplate = (templateId: string) => {
        deletePromptTemplate(templateId);
        setTemplates(loadPromptTemplates());
    };

    return (
        <div className="space-y-6">
            {/* ヘッダー */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span>⚙️</span> プロンプト設定
                    </h3>
                    <p className="text-gray-500 text-sm mt-1">
                        AIへの指示をカスタマイズできます（通常は変更不要）
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setShowLoadDialog(true)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 flex items-center gap-2"
                    >
                        <span>📂</span>
                        テンプレ読込
                    </button>
                    <button
                        onClick={() => setShowSaveDialog(true)}
                        className="px-4 py-2 bg-indigo-100 text-indigo-700 font-medium rounded-lg hover:bg-indigo-200 flex items-center gap-2"
                    >
                        <span>💾</span>
                        テンプレ保存
                    </button>
                </div>
            </div>

            {/* システムプロンプト */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                    onClick={() => setIsSystemExpanded(!isSystemExpanded)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <span className={`transition-transform ${isSystemExpanded ? 'rotate-90' : ''}`}>▶</span>
                        <h4 className="font-medium text-gray-800">システムプロンプト（全ページ共通）</h4>
                    </div>
                    <span className="text-sm text-gray-500">{systemPrompt.length}文字</span>
                </button>

                {isSystemExpanded && (
                    <div className="p-4 space-y-3">
                        <textarea
                            value={systemPrompt}
                            onChange={(e) => onSystemPromptChange(e.target.value)}
                            className="w-full h-64 p-3 border border-gray-200 rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">{systemPrompt.length}文字</span>
                            <button
                                onClick={handleResetSystem}
                                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                            >
                                デフォルトに戻す
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 個別プロンプト */}
            <div className="space-y-3">
                <h4 className="font-medium text-gray-700">個別プロンプト（自動生成済み - 編集可能）</h4>

                {pages.map(page => {
                    const isExpanded = expandedPages.has(page.pageNumber);
                    const customPrompt = pagePrompts.get(page.pageNumber);
                    const generatedPrompt = generatedPrompts.get(page.pageNumber);
                    const displayPrompt = customPrompt || generatedPrompt?.prompt || '';
                    const isCustomized = !!customPrompt;

                    return (
                        <div
                            key={page.pageNumber}
                            className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                        >
                            <div
                                className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                                onClick={() => togglePageExpand(page.pageNumber)}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                    <span className="font-medium text-gray-800">
                                        P{page.pageNumber}: {page.title}
                                    </span>
                                    {isCustomized && (
                                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                                            カスタマイズ済み
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    {!isExpanded && (
                                        <p className="text-sm text-gray-500 truncate max-w-xs hidden md:block">
                                            {displayPrompt.substring(0, 50)}...
                                        </p>
                                    )}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="px-4 pb-4 space-y-2">
                                    <textarea
                                        value={displayPrompt}
                                        onChange={(e) => onPagePromptChange(page.pageNumber, e.target.value)}
                                        className="w-full h-40 p-3 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                    />
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            {generatedPrompt && (
                                                <span className="text-xs text-gray-500">
                                                    スタイル: {generatedPrompt.style.format} / 約{generatedPrompt.style.averageCharCount}文字
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleResetPage(page.pageNumber)}
                                            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                                        >
                                            デフォルトに戻す
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* テンプレート保存ダイアログ */}
            {showSaveDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
                        <h4 className="text-lg font-bold text-gray-800 mb-4">テンプレートを保存</h4>
                        <input
                            type="text"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            placeholder="テンプレート名を入力..."
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowSaveDialog(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleSaveTemplate}
                                disabled={!templateName.trim()}
                                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* テンプレート読み込みダイアログ */}
            {showLoadDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
                        <h4 className="text-lg font-bold text-gray-800 mb-4">テンプレートを読み込み</h4>

                        {templates.length === 0 ? (
                            <p className="text-gray-500 text-center py-8">
                                保存されたテンプレートがありません
                            </p>
                        ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {templates.map(template => (
                                    <div
                                        key={template.id}
                                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                                    >
                                        <div className="flex-1 cursor-pointer" onClick={() => handleLoadTemplate(template)}>
                                            <p className="font-medium text-gray-800">{template.name}</p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(template.createdAt).toLocaleDateString('ja-JP')}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteTemplate(template.id)}
                                            className="p-1 text-gray-400 hover:text-red-500"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end mt-4">
                            <button
                                onClick={() => setShowLoadDialog(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                閉じる
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PromptEditor;
