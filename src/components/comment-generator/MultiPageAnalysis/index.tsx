// src/components/comment-generator/MultiPageAnalysis/index.tsx
// 複数図表総合分析機能のメインコンポーネント（V2: 顧客設定・シーケンシャルモード対応）

import React, { useState, useCallback, useRef } from 'react';
import { WizardStep, PageImageState, PageCommentRegion, ImageCaptureMode } from '../../../types/multi-page-analysis';
import { PDFPage, loadPDFDocument, reExtractCommentsWithRegions, CommentRegion } from '../../../lib/pdf-utils';
import { DEFAULT_SYSTEM_PROMPT } from '../../../lib/prompts';
import { generatePagePrompt } from '../../../lib/prompt-generator';
import { useCommentGeneration } from '../../../hooks/useCommentGeneration';
import { useClientSettings } from '../../../hooks/useClientSettings';

// コンポーネント
import { ProgressIndicator } from './components/ProgressIndicator';
import { ImagePasteArea } from './components/ImagePasteArea';
import { WizardNavigation } from './components/WizardNavigation';
import { PromptEditor } from './components/PromptEditor';
import { CommentCard } from './components/CommentCard';
import { ClientSettingsPanel } from './components/ClientSettings';
import { SequentialPageCapture } from './components/SequentialPageCapture';

export const MultiPageAnalysis: React.FC = () => {
    // ウィザードステップ
    const [currentStep, setCurrentStep] = useState<WizardStep>('pdf-upload');
    const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([]);

    // Step 1: PDF関連
    const [, setPdfFile] = useState<File | null>(null);
    const [pages, setPages] = useState<PDFPage[]>([]);
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 顧客設定 Hook
    const {
        clients,
        selectedClient,
        selectClient,
        addClient,
        updateClient,
        deleteClient,
        setPageRegions,
    } = useClientSettings();

    // 画像キャプチャモード
    const [captureMode, setCaptureMode] = useState<ImageCaptureMode>('batch');

    // Step 2: ページ選択
    const [selectedPages, setSelectedPages] = useState<number[]>([]);

    // Step 3: 画像入力
    const [pageImages, setPageImages] = useState<Map<number, PageImageState>>(new Map());
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // Step 4: プロンプト
    const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
    const [pagePrompts, setPagePrompts] = useState<Map<number, string>>(new Map());

    // 拡大表示
    const [expandedImage, setExpandedImage] = useState<string | null>(null);

    // Step 5-6: コメント生成
    const [editedComments, setEditedComments] = useState<Map<number, string>>(new Map());
    const [showAllPreviousComments, setShowAllPreviousComments] = useState(false);
    const [bulkCacheId, setBulkCacheId] = useState<string | null>(null);
    const {
        generateAll,
        generate,
        results: generatedComments,
        progress,
        isGenerating,
        cancelGeneration,
    } = useCommentGeneration();

    // 完了ステップを更新するヘルパー
    const markStepCompleted = (step: WizardStep) => {
        if (!completedSteps.includes(step)) {
            setCompletedSteps(prev => [...prev, step]);
        }
    };

    // ============================================================
    // Step 1: PDFアップロード
    // ============================================================
    const handlePdfUpload = useCallback(async (file: File) => {
        setIsLoadingPdf(true);
        setPdfFile(file);

        try {
            const { pages: extractedPages } = await loadPDFDocument(file);
            setPages(extractedPages);
            setSelectedPages(extractedPages.map(p => p.pageNumber));
            markStepCompleted('pdf-upload');
            setCurrentStep('client-settings');
        } catch (error) {
            console.error('PDF parsing error:', error);
            alert('PDFの読み込みに失敗しました');
        } finally {
            setIsLoadingPdf(false);
        }
    }, [completedSteps]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type === 'application/pdf') {
            handlePdfUpload(file);
        }
    }, [handlePdfUpload]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            handlePdfUpload(file);
        }
    }, [handlePdfUpload]);

    // ============================================================
    // Step 1.5: 顧客設定
    // ============================================================
    const [isExtractingComments, setIsExtractingComments] = useState(false);

    const handleClientSettingsApply = () => {
        // 顧客のページ範囲設定に基づいてページを選択
        if (selectedClient?.pageRegions.length) {
            const enabledPages = selectedClient.pageRegions
                .filter(r => r.isEnabled)
                .map(r => r.pageNumber);

            if (enabledPages.length > 0) {
                setSelectedPages(enabledPages);
            }

            // pdf.jsで範囲指定コメント抽出（高速・ローカル処理）
            const regionsForExtraction = selectedClient.pageRegions
                .filter(r => r.isEnabled && r.region)
                .map(r => ({
                    pageNumber: r.pageNumber,
                    region: r.region as CommentRegion,
                }));

            if (regionsForExtraction.length > 0) {
                setIsExtractingComments(true);
                console.log('[DEBUG] Extracting comments with pdf.js:', regionsForExtraction.length, 'pages');

                // pdf.jsで範囲内テキストを抽出（瞬時）
                const updatedPages = reExtractCommentsWithRegions(pages, regionsForExtraction);

                console.log('[DEBUG] Extraction completed');
                setPages(updatedPages);
                setIsExtractingComments(false);
            }
        }

        // 顧客のシステムプロンプトがあれば適用
        if (selectedClient?.systemPrompt) {
            setSystemPrompt(selectedClient.systemPrompt);
        }

        console.log('[DEBUG] Moving to next step: page-select');
        markStepCompleted('client-settings');
        setCurrentStep('page-select');
    };

    const handleRegionsChange = (regions: PageCommentRegion[]) => {
        if (selectedClient) {
            setPageRegions(selectedClient.clientId, regions);
        }
    };

    // ============================================================
    // Step 2: ページ選択
    // ============================================================
    const togglePageSelection = (pageNumber: number) => {
        setSelectedPages(prev =>
            prev.includes(pageNumber)
                ? prev.filter(p => p !== pageNumber)
                : [...prev, pageNumber].sort((a, b) => a - b)
        );
    };

    const handlePageSelectComplete = () => {
        if (selectedPages.length === 0) {
            alert('少なくとも1ページ選択してください');
            return;
        }

        // 画像状態を初期化
        const initialImages = new Map<number, PageImageState>();
        selectedPages.forEach(pageNum => {
            initialImages.set(pageNum, {
                pageNumber: pageNum,
                imageData: null,
                isPasted: false,
                isSkipped: false,
            });
        });
        setPageImages(initialImages);
        setCurrentImageIndex(0);

        // プロンプトを自動生成
        const newPrompts = new Map<number, string>();
        selectedPages.forEach(pageNum => {
            const page = pages.find(p => p.pageNumber === pageNum);
            if (page) {
                const generated = generatePagePrompt({
                    pageNumber: page.pageNumber,
                    pageTitle: page.title,
                    previousComment: page.extractedComment || '',
                });
                newPrompts.set(pageNum, generated.prompt);
            }
        });
        setPagePrompts(newPrompts);

        markStepCompleted('page-select');

        // キャプチャモードに応じて次のステップを決定
        if (captureMode === 'sequential') {
            setCurrentStep('generate');
        } else {
            setCurrentStep('image-paste');
        }
    };

    // ============================================================
    // Step 3: 画像入力
    // ============================================================
    const currentPageNumber = selectedPages[currentImageIndex];
    const currentPage = pages.find(p => p.pageNumber === currentPageNumber);
    const currentImageState = pageImages.get(currentPageNumber);

    const handleImagePaste = (imageData: string) => {
        if (!currentPageNumber) return;

        setPageImages(prev => {
            const next = new Map(prev);
            next.set(currentPageNumber, {
                pageNumber: currentPageNumber,
                imageData,
                isPasted: true,
                isSkipped: false,
                timestamp: Date.now(),
            });
            return next;
        });
    };

    const handleImageClear = () => {
        if (!currentPageNumber) return;

        setPageImages(prev => {
            const next = new Map(prev);
            next.set(currentPageNumber, {
                pageNumber: currentPageNumber,
                imageData: null,
                isPasted: false,
                isSkipped: false,
            });
            return next;
        });
    };

    const handleSkipPage = () => {
        if (!currentPageNumber) return;

        setPageImages(prev => {
            const next = new Map(prev);
            next.set(currentPageNumber, {
                ...prev.get(currentPageNumber)!,
                isSkipped: true,
            });
            return next;
        });

        if (currentImageIndex < selectedPages.length - 1) {
            setCurrentImageIndex(prev => prev + 1);
        }
    };

    const handleImageComplete = () => {
        // 画像が1枚以上入力されているかチェック
        const pastedCount = Array.from(pageImages.values()).filter(s => s.isPasted).length;
        if (pastedCount === 0) {
            alert('少なくとも1ページの画像を入力してください');
            return;
        }

        markStepCompleted('image-paste');
        setCurrentStep('prompt-edit');
    };

    // ============================================================
    // Step 4: プロンプト編集
    // ============================================================
    const handlePagePromptChange = (pageNumber: number, prompt: string) => {
        setPagePrompts(prev => {
            const next = new Map(prev);
            next.set(pageNumber, prompt);
            return next;
        });
    };

    const handlePromptComplete = () => {
        markStepCompleted('prompt-edit');
        setCurrentStep('generate');
    };

    // ============================================================
    // Step 5: コメント生成
    // ============================================================
    const handleGenerateAll = async () => {
        const pageData = selectedPages
            .filter(pageNum => {
                const imageState = pageImages.get(pageNum);
                return imageState?.isPasted && imageState.imageData;
            })
            .map(pageNum => {
                const page = pages.find(p => p.pageNumber === pageNum)!;
                const imageState = pageImages.get(pageNum)!;

                return {
                    pageNumber: pageNum,
                    pageTitle: page.title,
                    currentImage: imageState.imageData!,
                    previousImage: page.thumbnail || '',
                    previousComment: page.extractedComment || '',
                };
            });

        const { cacheId } = await generateAll(
            pageData,
            pageData,
            {
                systemPrompt,
                pagePrompts,
            }
        );

        // キャッシュIDを保存（後のチャット修正で使用）
        setBulkCacheId(cacheId);

        markStepCompleted('generate');
        setCurrentStep('review');
    };

    // シーケンシャルモード用のコメント生成
    const handleSinglePageGenerate = async (pageNumber: number, imageData: string, customPrompt?: string): Promise<string> => {
        const page = pages.find(p => p.pageNumber === pageNumber);
        if (!page) throw new Error('ページが見つかりません');

        const contextPages = selectedPages
            .filter(pNum => pNum !== pageNumber)
            .slice(0, 5)
            .map(pNum => {
                const p = pages.find(pg => pg.pageNumber === pNum)!;
                return {
                    pageNumber: pNum,
                    pageTitle: p.title,
                    currentImage: '',
                };
            });

        // カスタムプロンプトが指定されていればそちらを優先
        const effectivePagePrompt = customPrompt || pagePrompts.get(pageNumber) || '';

        const response = await generate({
            targetPage: {
                pageNumber,
                pageTitle: page.title,
                currentImage: imageData,
                previousImage: page.thumbnail || '',
                previousComment: page.extractedComment || '',
            },
            contextPages,
            systemPrompt,
            pagePrompt: effectivePagePrompt,
        });

        return response.generatedComment;
    };

    // シーケンシャルモード完了時
    const handleSequentialComplete = (results: Map<number, string>) => {
        // 結果をeditedCommentsに反映
        setEditedComments(results);
        markStepCompleted('generate');
        setCurrentStep('review');
    };

    // ============================================================
    // Step 6: レビュー
    // ============================================================
    const handleEditComment = (pageNumber: number, comment: string) => {
        setEditedComments(prev => {
            const next = new Map(prev);
            next.set(pageNumber, comment);
            return next;
        });
    };

    const handleRegenerate = async (pageNumber: number) => {
        const page = pages.find(p => p.pageNumber === pageNumber);
        const imageState = pageImages.get(pageNumber);
        if (!page || !imageState?.imageData) return;

        const contextPages = selectedPages
            .filter(pNum => pNum !== pageNumber && pageImages.get(pNum)?.isPasted)
            .slice(0, 5)
            .map(pNum => {
                const p = pages.find(pg => pg.pageNumber === pNum)!;
                const img = pageImages.get(pNum)!;
                return {
                    pageNumber: pNum,
                    pageTitle: p.title,
                    currentImage: img.imageData!,
                };
            });

        await generate({
            targetPage: {
                pageNumber,
                pageTitle: page.title,
                currentImage: imageState.imageData,
                previousImage: page.thumbnail || '',
                previousComment: page.extractedComment || '',
            },
            contextPages,
            systemPrompt,
            pagePrompt: pagePrompts.get(pageNumber) || '',
        });
    };

    // チャット指示によるコメント修正（キャッシュ使用で高速）
    const handleChatRefine = async (pageNumber: number, instruction: string): Promise<string> => {
        const page = pages.find(p => p.pageNumber === pageNumber);
        const currentComment = editedComments.get(pageNumber) || generatedComments.get(pageNumber)?.comment || '';

        if (!page) throw new Error('ページが見つかりません');

        // キャッシュIDをログ出力
        console.log('Chat refine - bulkCacheId:', bulkCacheId);

        // キャッシュがあれば使用（高速）
        const endpoint = bulkCacheId ? '/api/comment/generate-fast' : '/api/comment/refine';
        console.log('Using endpoint:', endpoint);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bulkCacheId ? {
                cacheId: bulkCacheId,
                pageNumber: page.pageNumber,
                pageTitle: page.title,
                pagePrompt: `【現在のコメント】\n${currentComment}\n\n【修正指示】\n${instruction}\n\n上記の指示に従って、現在のコメントを修正してください。`,
            } : {
                originalComment: currentComment,
                refinementType: 'custom',
                customInstruction: instruction,
                pageTitle: page.title,
                previousComment: page.extractedComment,
                currentImage: pageImages.get(pageNumber)?.imageData,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || '修正に失敗しました');
        }

        const result = await response.json();
        return result.generatedComment || result.refinedComment;
    };

    const handleCopyAll = () => {
        const allComments = Array.from(generatedComments.entries())
            .filter(([_, result]) => result.status === 'completed')
            .map(([pageNum, result]) => {
                const page = pages.find(p => p.pageNumber === pageNum);
                const comment = editedComments.get(pageNum) || result.comment;
                return `【${page?.title || `P${pageNum}`}】\n${comment}`;
            })
            .join('\n\n' + '='.repeat(50) + '\n\n');

        navigator.clipboard.writeText(allComments);
    };

    // ============================================================
    // レンダリング
    // ============================================================
    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-indigo-50">
            {/* 進捗インジケーター */}
            <ProgressIndicator
                currentStep={currentStep}
                completedSteps={completedSteps}
                onStepClick={(step) => {
                    if (completedSteps.includes(step)) {
                        setCurrentStep(step);
                    }
                }}
            />

            {/* メインコンテンツ */}
            <div className="flex-1 min-h-0 p-6 overflow-auto">
                {/* Step 1: PDFアップロード */}
                {currentStep === 'pdf-upload' && (
                    <div className="h-full flex items-center justify-center">
                        <div className="w-full max-w-2xl">
                            <div
                                className={`
                  p-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer
                  ${isLoadingPdf
                                        ? 'border-indigo-300 bg-indigo-50'
                                        : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/50'
                                    }
                `}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <div className="text-center">
                                    {isLoadingPdf ? (
                                        <>
                                            <div className="w-16 h-16 mx-auto mb-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                            <h3 className="text-xl font-bold text-gray-800 mb-2">
                                                PDFを読み込み中...
                                            </h3>
                                            <p className="text-gray-500">
                                                ページ抽出とコメント分析を行っています
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-6xl mb-6">📄</div>
                                            <h3 className="text-xl font-bold text-gray-800 mb-2">
                                                前月レポートPDFをアップロード
                                            </h3>
                                            <p className="text-gray-500 mb-6">
                                                ドラッグ&ドロップ または クリックしてファイルを選択
                                            </p>
                                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg">
                                                <span>📂</span>
                                                <span className="font-medium">ファイルを選択</span>
                                            </div>
                                            <p className="text-sm text-gray-400 mt-4">
                                                対応形式: PDF（最大50ページ、100MB）
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 1.5: 顧客・範囲設定 */}
                {currentStep === 'client-settings' && (
                    <div className="max-w-6xl mx-auto space-y-6">
                        <ClientSettingsPanel
                            clients={clients}
                            selectedClient={selectedClient}
                            pages={pages}
                            onSelectClient={selectClient}
                            onAddClient={addClient}
                            onUpdateClient={updateClient}
                            onDeleteClient={deleteClient}
                            onRegionsChange={handleRegionsChange}
                            onApplySettings={handleClientSettingsApply}
                            isExtracting={isExtractingComments}
                            extractionProgress={null}
                            systemPrompt={systemPrompt}
                            onSystemPromptChange={setSystemPrompt}
                        />

                        {/* キャプチャモード選択 */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
                                <span>📷</span> 画像キャプチャモード
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button
                                    onClick={() => setCaptureMode('batch')}
                                    className={`
                                        p-4 rounded-lg border-2 text-left transition-all
                                        ${captureMode === 'batch'
                                            ? 'border-indigo-500 bg-indigo-50'
                                            : 'border-gray-200 hover:border-indigo-300'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-2xl">📦</span>
                                        <span className="font-bold text-gray-800">一括キャプチャモード</span>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        全ページの画像を先にキャプチャしてから、まとめてコメントを生成します。
                                        効率的に作業を進められます。
                                    </p>
                                </button>
                                <button
                                    onClick={() => setCaptureMode('sequential')}
                                    className={`
                                        p-4 rounded-lg border-2 text-left transition-all
                                        ${captureMode === 'sequential'
                                            ? 'border-indigo-500 bg-indigo-50'
                                            : 'border-gray-200 hover:border-indigo-300'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-2xl">🔄</span>
                                        <span className="font-bold text-gray-800">ページごとモード</span>
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        1ページずつ画像をキャプチャし、すぐにコメントを生成します。
                                        結果を確認しながら進められます。
                                    </p>
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-between">
                            <button
                                onClick={() => setCurrentStep('pdf-upload')}
                                className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 flex items-center gap-2"
                            >
                                <span>←</span>
                                <span>戻る</span>
                            </button>
                            <button
                                onClick={handleClientSettingsApply}
                                className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                            >
                                <span>次へ: ページ選択</span>
                                <span>→</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 2: ページ選択 */}
                {currentStep === 'page-select' && (
                    <div className="max-w-6xl mx-auto space-y-6">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                        <span>✅</span> コメント生成対象ページを選択
                                    </h3>
                                    <p className="text-gray-500 text-sm mt-1">
                                        {selectedPages.length}/{pages.length} ページ選択中
                                        {selectedClient && (
                                            <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                                                顧客: {selectedClient.clientName}
                                            </span>
                                        )}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setSelectedPages(pages.map(p => p.pageNumber))}
                                        className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
                                    >
                                        全選択
                                    </button>
                                    <button
                                        onClick={() => setSelectedPages([])}
                                        className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
                                    >
                                        全解除
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {pages.map(page => {
                                    const region = selectedClient?.pageRegions.find(r => r.pageNumber === page.pageNumber);
                                    return (
                                        <div
                                            key={page.pageNumber}
                                            onClick={() => togglePageSelection(page.pageNumber)}
                                            className={`
                      relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all
                      ${selectedPages.includes(page.pageNumber)
                                                    ? 'border-indigo-500 ring-2 ring-indigo-200'
                                                    : 'border-gray-200 hover:border-indigo-300'
                                                }
                    `}
                                        >
                                            {/* サムネイル */}
                                            {page.thumbnail && (
                                                <div className="aspect-[3/4] bg-gray-100 overflow-hidden relative">
                                                    <img
                                                        src={page.thumbnail}
                                                        alt={`P${page.pageNumber}`}
                                                        className="w-full h-full object-cover"
                                                    />
                                                    {/* コメント範囲オーバーレイ */}
                                                    {region && (
                                                        <div
                                                            className="absolute bg-yellow-400/30 border-2 border-yellow-500"
                                                            style={{
                                                                left: `${region.region.x * 100}%`,
                                                                top: `${region.region.y * 100}%`,
                                                                width: `${region.region.width * 100}%`,
                                                                height: `${region.region.height * 100}%`,
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            )}

                                            {/* 情報 */}
                                            <div className="p-3 bg-white">
                                                <p className="font-medium text-gray-800 text-sm truncate">
                                                    P{page.pageNumber}: {page.title}
                                                </p>
                                                {page.commentConfidence && page.commentConfidence > 0.5 && (
                                                    <p className="text-xs text-green-600 mt-1">
                                                        ✓ コメント抽出済み
                                                    </p>
                                                )}
                                            </div>

                                            {/* チェックマーク */}
                                            {selectedPages.includes(page.pageNumber) && (
                                                <div className="absolute top-2 right-2 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm">
                                                    ✓
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex justify-between">
                            <button
                                onClick={() => setCurrentStep('client-settings')}
                                className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 flex items-center gap-2"
                            >
                                <span>←</span>
                                <span>戻る</span>
                            </button>
                            <button
                                onClick={handlePageSelectComplete}
                                disabled={selectedPages.length === 0}
                                className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                <span>次へ: {captureMode === 'sequential' ? 'コメント生成' : '画像入力'}</span>
                                <span>→</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: 画像入力 (一括モード) */}
                {currentStep === 'image-paste' && captureMode === 'batch' && currentPage && (
                    <div className="max-w-6xl mx-auto space-y-6">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                    <span>📋</span>
                                    P{currentPage.pageNumber}: {currentPage.title}
                                </h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSkipPage}
                                        className="px-4 py-2 text-gray-500 hover:text-gray-700 font-medium"
                                    >
                                        スキップ
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* 前月レポート参照 */}
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
                                                const region = selectedClient?.pageRegions.find(r => r.pageNumber === currentPage.pageNumber);
                                                if (region) {
                                                    return (
                                                        <div
                                                            className="absolute bg-yellow-400/30 border-2 border-yellow-500 border-dashed"
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

                                {/* 今月データ入力 */}
                                <div className="space-y-3">
                                    <h4 className="font-medium text-gray-700">【今月データ】</h4>
                                    <ImagePasteArea
                                        imageData={currentImageState?.imageData || null}
                                        onPaste={handleImagePaste}
                                        onClear={handleImageClear}
                                        placeholder={`P${currentPage.pageNumber}の今月データ画像をペースト`}
                                        className="min-h-[300px]"
                                    />
                                </div>
                            </div>
                        </div>

                        <WizardNavigation
                            currentIndex={currentImageIndex}
                            totalPages={selectedPages.length}
                            onPrev={() => setCurrentImageIndex(prev => Math.max(0, prev - 1))}
                            onNext={() => {
                                if (currentImageIndex < selectedPages.length - 1) {
                                    setCurrentImageIndex(prev => prev + 1);
                                } else {
                                    handleImageComplete();
                                }
                            }}
                            onSkip={handleSkipPage}
                            canPrev={currentImageIndex > 0}
                            canNext={true}
                            nextLabel={currentImageIndex === selectedPages.length - 1 ? 'プロンプト設定へ' : '次のページへ'}
                        />
                    </div>
                )}

                {/* Step 3: シーケンシャルモード */}
                {currentStep === 'generate' && captureMode === 'sequential' && (
                    <div className="max-w-6xl mx-auto">
                        <SequentialPageCapture
                            pages={pages.filter(p => selectedPages.includes(p.pageNumber))}
                            pageRegions={selectedClient?.pageRegions || []}
                            systemPrompt={systemPrompt}
                            pagePrompts={pagePrompts}
                            onGenerateComment={handleSinglePageGenerate}
                            onAllComplete={handleSequentialComplete}
                            onPagePromptChange={handlePagePromptChange}
                        />
                    </div>
                )}

                {/* Step 4: プロンプト設定 */}
                {currentStep === 'prompt-edit' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <PromptEditor
                                systemPrompt={systemPrompt}
                                onSystemPromptChange={setSystemPrompt}
                                pagePrompts={pagePrompts}
                                onPagePromptChange={handlePagePromptChange}
                                pages={pages.filter(p => selectedPages.includes(p.pageNumber))}
                            />
                        </div>

                        <div className="flex justify-between">
                            <button
                                onClick={() => setCurrentStep('image-paste')}
                                className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 flex items-center gap-2"
                            >
                                <span>←</span>
                                <span>戻る</span>
                            </button>
                            <button
                                onClick={handlePromptComplete}
                                className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                            >
                                <span>✨</span>
                                <span>コメント生成へ</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 5: コメント生成 (一括モード) */}
                {currentStep === 'generate' && captureMode === 'batch' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-gray-800 mb-4">
                                    ✨ AIコメント生成
                                </h3>

                                {!isGenerating && progress.status === 'idle' && (
                                    <>
                                        <p className="text-gray-500 mb-6">
                                            {Array.from(pageImages.values()).filter(s => s.isPasted).length}ページのコメントを一括生成します
                                        </p>
                                        <button
                                            onClick={handleGenerateAll}
                                            className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-lg flex items-center gap-3 mx-auto"
                                        >
                                            <span className="text-2xl">🚀</span>
                                            <span>一括生成開始</span>
                                        </button>
                                    </>
                                )}

                                {isGenerating && (
                                    <>
                                        <div className="w-20 h-20 mx-auto mb-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />

                                        {progress.currentPage === -1 ? (
                                            <>
                                                <p className="text-gray-800 font-medium mb-2">
                                                    ⚡ 全ページをキャッシュ中...
                                                </p>
                                                <p className="text-gray-500 text-sm mb-4">
                                                    高速並列処理の準備をしています
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-gray-800 font-medium mb-2">
                                                    {progress.completed}/{progress.total} ページ生成完了
                                                </p>
                                                <p className="text-gray-500 text-sm mb-4">
                                                    並列処理中（3ページ同時）
                                                </p>
                                            </>
                                        )}

                                        <div className="w-full max-w-md mx-auto h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-600 transition-all duration-500"
                                                style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                                            />
                                        </div>
                                        <button
                                            onClick={cancelGeneration}
                                            className="mt-6 px-4 py-2 text-gray-500 hover:text-gray-700"
                                        >
                                            キャンセル
                                        </button>
                                    </>
                                )}

                                {progress.status === 'completed' && (
                                    <>
                                        <div className="text-6xl mb-4">🎉</div>
                                        <p className="text-gray-800 font-medium mb-6">
                                            生成完了！{progress.completed}件のコメントが生成されました
                                        </p>
                                        <button
                                            onClick={() => setCurrentStep('review')}
                                            className="px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 flex items-center gap-2 mx-auto"
                                        >
                                            <span>📝</span>
                                            <span>結果を確認</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 6: 確認・編集 - フルワイド */}
                {currentStep === 'review' && (
                    <div className="w-full max-w-none px-4">
                        <div className="bg-white rounded-xl shadow-sm p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                        📝 コメント確認・編集
                                    </h3>
                                    <p className="text-gray-500 text-sm">
                                        画像をクリックで拡大 / コメントをクリックで編集
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={showAllPreviousComments}
                                            onChange={(e) => setShowAllPreviousComments(e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        前月コメント表示
                                    </label>
                                    <button
                                        onClick={handleCopyAll}
                                        className="px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
                                    >
                                        📋 全てコピー
                                    </button>
                                    <button
                                        onClick={() => {
                                            setCurrentStep('pdf-upload');
                                            setPdfFile(null);
                                            setPages([]);
                                            setSelectedPages([]);
                                            setPageImages(new Map());
                                            setCompletedSteps([]);
                                        }}
                                        className="px-3 py-1.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm"
                                    >
                                        🔄 新規作成
                                    </button>
                                </div>
                            </div>

                            {/* ページナビゲーション - 横並び目次 */}
                            <div className="flex flex-wrap gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
                                {selectedPages
                                    .filter(pageNum => generatedComments.has(pageNum) || editedComments.has(pageNum))
                                    .map(pageNum => {
                                        const page = pages.find(p => p.pageNumber === pageNum);
                                        const result = generatedComments.get(pageNum);
                                        const hasEdit = editedComments.has(pageNum);
                                        const isError = result?.status === 'error';

                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => {
                                                    document.getElementById(`page-${pageNum}`)?.scrollIntoView({
                                                        behavior: 'smooth',
                                                        block: 'start'
                                                    });
                                                }}
                                                className={`
                                                    px-3 py-1.5 text-sm font-medium rounded-lg transition-all
                                                    flex items-center gap-1.5 hover:shadow-md
                                                    ${isError
                                                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                                        : hasEdit
                                                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                                            : 'bg-white text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 border border-gray-200'
                                                    }
                                                `}
                                            >
                                                <span className="w-5 h-5 rounded bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs flex items-center justify-center">
                                                    {pageNum}
                                                </span>
                                                <span className="truncate max-w-[120px]">{page?.title || `P${pageNum}`}</span>
                                                {hasEdit && <span className="text-xs">✎</span>}
                                                {isError && <span className="text-xs">⚠</span>}
                                            </button>
                                        );
                                    })}
                            </div>

                            <div className="space-y-3">
                                {selectedPages
                                    .filter(pageNum => generatedComments.has(pageNum) || editedComments.has(pageNum))
                                    .map(pageNum => {
                                        const page = pages.find(p => p.pageNumber === pageNum);
                                        const result = generatedComments.get(pageNum);

                                        // シーケンシャルモードの場合、editedCommentsから結果を取得
                                        const finalResult = result || {
                                            pageNumber: pageNum,
                                            comment: editedComments.get(pageNum) || '',
                                            processingTime: 0,
                                            status: 'completed' as const,
                                        };

                                        return (
                                            <CommentCard
                                                key={pageNum}
                                                pageNumber={pageNum}
                                                pageTitle={page?.title || `ページ ${pageNum}`}
                                                previousComment={page?.extractedComment}
                                                generatedComment={finalResult}
                                                editedComment={editedComments.get(pageNum)}
                                                currentImage={pageImages.get(pageNum)?.imageData}
                                                cacheId={bulkCacheId || undefined}
                                                onEdit={handleEditComment}
                                                onRegenerate={handleRegenerate}
                                                onCopy={(comment) => navigator.clipboard.writeText(comment)}
                                                onImageClick={(image) => setExpandedImage(image)}
                                                onChatRefine={handleChatRefine}
                                                showPreviousComment={showAllPreviousComments}
                                            />
                                        );
                                    })}
                            </div>
                        </div>
                    </div>
                )}
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

export default MultiPageAnalysis;
