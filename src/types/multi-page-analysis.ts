// src/types/multi-page-analysis.ts
// 複数図表総合分析機能の型定義

import { PDFPage } from '../lib/pdf-utils';

/**
 * ページごとの画像状態
 */
export interface PageImageState {
    pageNumber: number;
    imageData: string | null;
    isPasted: boolean;
    isSkipped: boolean;
    timestamp?: number;
}

/**
 * マルチページ分析の全体状態
 */
export interface MultiPageState {
    // Step 1: PDFアップロード
    pdfFile: File | null;
    pages: PDFPage[];

    // Step 2: ページ選択
    selectedPages: number[];

    // Step 3: 画像入力
    pageImages: Map<number, PageImageState>;
    currentImageIndex: number;

    // Step 4: プロンプト設定
    systemPrompt: string;
    pagePrompts: Map<number, string>;
    isSystemPromptCustomized: boolean;

    // Step 5: コメント生成
    generatedComments: Map<number, GeneratedCommentResult>;
    editedComments: Map<number, string>;
    generationProgress: BatchProgress;
}

/**
 * 生成されたコメント結果
 */
export interface GeneratedCommentResult {
    pageNumber: number;
    comment: string;
    processingTime: number;
    status: 'pending' | 'generating' | 'completed' | 'error';
    error?: string;
    timestamp?: string;
}

/**
 * 一括生成の進捗
 */
export interface BatchProgress {
    total: number;
    completed: number;
    currentPage: number;
    status: 'idle' | 'generating' | 'paused' | 'completed' | 'error';
    error?: string;
}

/**
 * API リクエスト: マルチページ生成
 */
export interface MultiPageGenerateRequest {
    targetPage: {
        pageNumber: number;
        pageTitle: string;
        currentImage: string;  // base64
        previousImage: string;  // base64
        previousComment: string;
    };
    contextPages: {
        pageNumber: number;
        pageTitle: string;
        currentImage: string;
    }[];
    systemPrompt: string;
    pagePrompt: string;
}

/**
 * API レスポンス: マルチページ生成
 */
export interface MultiPageGenerateResponse {
    pageNumber: number;
    generatedComment: string;
    processingTime: number;
    error?: string;
}

/**
 * ウィザードのステップ
 */
export type WizardStep =
    | 'pdf-upload'
    | 'client-settings'  // 顧客選択・コメント範囲設定
    | 'page-select'
    | 'image-paste'
    | 'prompt-edit'
    | 'generate'
    | 'review';

/**
 * ウィザードステップの定義
 */
export interface WizardStepDefinition {
    id: WizardStep;
    name: string;
    description: string;
    icon: string;
}

/**
 * ウィザードのステップ一覧
 */
/**
 * ページごとのコメント抽出範囲設定
 */
export interface PageCommentRegion {
    pageNumber: number;
    /** コメント領域の座標（PDF座標系、0-1正規化） */
    region: {
        x: number;      // 左端 (0-1)
        y: number;      // 上端 (0-1)
        width: number;  // 幅 (0-1)
        height: number; // 高さ (0-1)
    };
    /** ページタイトル（識別用） */
    pageTitle?: string;
    /** このページをコメント対象にするか */
    isEnabled: boolean;
}

/**
 * 顧客別設定
 */
export interface ClientSettings {
    /** 顧客ID（一意識別子） */
    clientId: string;
    /** 顧客名 */
    clientName: string;
    /** ページ別のコメント範囲設定 */
    pageRegions: PageCommentRegion[];
    /** システムプロンプト（顧客固有のカスタマイズ） */
    systemPrompt?: string;
    /** ページ別プロンプトテンプレート */
    pagePromptTemplates?: Map<number, string>;
    /** 作成日時 */
    createdAt: string;
    /** 更新日時 */
    updatedAt: string;
}

/**
 * ページ画像登録モード
 */
export type ImageCaptureMode =
    | 'batch'      // 全ページ一括でキャプチャ画像を用意してから生成
    | 'sequential' // ページごとにキャプチャ→生成を繰り返す

/**
 * ページ単体のコメント生成状態
 */
export interface SinglePageGenerationState {
    pageNumber: number;
    pageTitle: string;
    /** 今月画像がキャプチャ済みか */
    hasCurrentImage: boolean;
    /** コメント生成済みか */
    hasComment: boolean;
    /** 現在生成中か */
    isGenerating: boolean;
    /** 生成されたコメント */
    comment?: string;
    /** エラーがあれば */
    error?: string;
}

export const WIZARD_STEPS: WizardStepDefinition[] = [
    {
        id: 'pdf-upload',
        name: 'PDFアップロード',
        description: '前月レポートPDFをアップロード',
        icon: '📄',
    },
    {
        id: 'client-settings',
        name: '顧客・範囲設定',
        description: '顧客を選択し、コメント範囲を設定',
        icon: '👤',
    },
    {
        id: 'page-select',
        name: 'ページ選択',
        description: 'コメント生成対象のページを選択',
        icon: '✅',
    },
    {
        id: 'image-paste',
        name: '画像入力',
        description: '今月データの画像をペースト',
        icon: '📋',
    },
    {
        id: 'prompt-edit',
        name: 'プロンプト設定',
        description: 'AI指示をカスタマイズ（任意）',
        icon: '⚙️',
    },
    {
        id: 'generate',
        name: 'コメント生成',
        description: 'AIがコメントを生成',
        icon: '✨',
    },
    {
        id: 'review',
        name: '確認・編集',
        description: '生成結果を確認・編集',
        icon: '📝',
    },
];
