// src/lib/pdf-utils.ts
// PDF処理共通関数

import * as pdfjsLib from 'pdfjs-dist';
import type { PDFPageProxy, TextItem as PDFTextItem } from 'pdfjs-dist/types/src/display/api';

// PDF.js worker設定
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * テキストアイテムの型定義
 */
export interface TextItem {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize?: number;
}

/**
 * PDFページの型定義
 */
export interface PDFPage {
    pageNumber: number;
    title: string;
    thumbnail?: string;
    isSelected: boolean;
    extractedComment?: string;  // 抽出されたコメント
    commentConfidence?: number;  // 抽出の信頼度 (0-1)
    textItems?: TextItem[];      // 抽出されたテキストアイテム
    viewportWidth?: number;      // PDFビューポートの幅（scale=1.0）
    viewportHeight?: number;     // PDFビューポートの高さ（scale=1.0）
}

/**
 * 抽出結果の型定義
 */
export interface ExtractedPageData {
    pageNumber: number;
    title: string;
    comment: string;
    thumbnail: string;
    textItems: TextItem[];
}

/**
 * PDFページからテキストを抽出
 */
export async function extractTextFromPage(
    page: PDFPageProxy
): Promise<TextItem[]> {
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });

    return textContent.items
        .filter((item): item is PDFTextItem => 'str' in item)
        .map(item => ({
            text: item.str,
            x: item.transform[4],
            y: viewport.height - item.transform[5], // Y座標を反転（PDFは下から上）
            width: item.width || 0,
            height: item.height || 10,
            fontSize: item.height || undefined,
        }));
}

/**
 * タイトルを推定（ページ上部の大きいテキスト）
 */
export function extractTitle(textItems: TextItem[], pageHeight: number): string {
    // 上部20%以内のテキストをタイトル候補とする
    const titleThreshold = pageHeight * 0.2;

    const topItems = textItems
        .filter(item => item.y < titleThreshold)
        .filter(item => item.text.trim().length > 0)
        .sort((a, b) => a.y - b.y);

    if (topItems.length > 0) {
        // 最も大きいフォントサイズのテキストを優先
        const largestItem = topItems.reduce((prev, curr) =>
            (curr.fontSize || 0) > (prev.fontSize || 0) ? curr : prev
            , topItems[0]);

        // 同じ行の連続するテキストを結合
        const sameLine = topItems.filter(item =>
            Math.abs(item.y - largestItem.y) < 5
        );

        return sameLine.map(item => item.text).join('').trim();
    }

    return '';
}

/**
 * 数値のみかどうかを判定
 */
function isNumericValue(text: string): boolean {
    // 数値、カンマ、パーセント、円マークなどを含む場合は数値と判定
    return /^[\d,.\-%¥$₩€£]+$/.test(text.trim());
}

/**
 * コメントを推定（ページ下部のテキストブロック）
 */
export function extractComment(
    textItems: TextItem[],
    pageHeight: number
): { comment: string; confidence: number } {
    // 下部40%をコメント領域と推定
    const commentThreshold = pageHeight * 0.6;

    const commentCandidates = textItems
        .filter(item => item.y > commentThreshold)
        .filter(item => item.text.trim().length > 5) // 短すぎるテキストを除外
        .filter(item => !isNumericValue(item.text))  // 数値のみを除外
        .sort((a, b) => a.y - b.y);

    if (commentCandidates.length === 0) {
        return { comment: '', confidence: 0 };
    }

    // テキストを結合（改行を考慮）
    let comment = '';
    let lastY = 0;
    let lastX = 0;

    for (const item of commentCandidates) {
        const yDiff = Math.abs(item.y - lastY);
        const xDiff = item.x - lastX;

        if (lastY > 0) {
            if (yDiff > 15) {
                // 別の行の場合
                comment += '\n';
            } else if (xDiff > 10) {
                // 同じ行だが離れている場合
                comment += ' ';
            }
        }

        comment += item.text;
        lastY = item.y;
        lastX = item.x + item.width;
    }

    const trimmedComment = comment.trim();

    // 信頼度の計算
    // - 文字数が適切（50文字以上、500文字以下）
    // - 文章らしい構造（句読点を含む）
    let confidence = 0.5;

    if (trimmedComment.length >= 50 && trimmedComment.length <= 500) {
        confidence += 0.2;
    }

    if (/[。、．，]/.test(trimmedComment)) {
        confidence += 0.2;
    }

    if (/[・\-●]/.test(trimmedComment)) {
        // 箇条書きスタイル
        confidence += 0.1;
    }

    return {
        comment: trimmedComment,
        confidence: Math.min(confidence, 1),
    };
}

/**
 * コメント範囲の型定義（正規化座標 0-1）
 */
export interface CommentRegion {
    x: number;      // 左端 (0-1)
    y: number;      // 上端 (0-1)
    width: number;  // 幅 (0-1)
    height: number; // 高さ (0-1)
}

/**
 * 指定範囲からコメントを抽出
 * @param textItems テキストアイテム配列
 * @param pageHeight ページの高さ
 * @param pageWidth ページの幅
 * @param region 抽出範囲（正規化座標 0-1）
 */
export function extractCommentFromRegion(
    textItems: TextItem[],
    pageHeight: number,
    pageWidth: number,
    region: CommentRegion
): { comment: string; confidence: number } {
    // 正規化座標を実座標に変換
    const regionTop = pageHeight * region.y;
    const regionBottom = pageHeight * (region.y + region.height);
    const regionLeft = pageWidth * region.x;
    const regionRight = pageWidth * (region.x + region.width);

    console.log(`[DEBUG] Region conversion:`, {
        input: region,
        converted: { top: regionTop, bottom: regionBottom, left: regionLeft, right: regionRight },
        pageSize: { pageWidth, pageHeight },
    });

    // 指定範囲内のテキストをフィルタ
    const regionItems = textItems
        .filter(item => {
            const itemCenterY = item.y + (item.height / 2);
            const itemCenterX = item.x + (item.width / 2);
            return (
                itemCenterY >= regionTop &&
                itemCenterY <= regionBottom &&
                itemCenterX >= regionLeft &&
                itemCenterX <= regionRight
            );
        })
        .filter(item => item.text.trim().length > 0)
        .filter(item => !isNumericValue(item.text))
        .sort((a, b) => a.y - b.y || a.x - b.x);

    console.log(`[DEBUG] Filtered items: ${regionItems.length} of ${textItems.length}`);

    if (regionItems.length === 0) {
        return { comment: '', confidence: 0 };
    }

    // テキストを結合
    let comment = '';
    let lastY = 0;
    let lastX = 0;

    for (const item of regionItems) {
        const yDiff = Math.abs(item.y - lastY);
        const xDiff = item.x - lastX;

        if (lastY > 0) {
            if (yDiff > 15) {
                comment += '\n';
            } else if (xDiff > 10) {
                comment += ' ';
            }
        }

        comment += item.text;
        lastY = item.y;
        lastX = item.x + item.width;
    }

    const trimmedComment = comment.trim();

    // 信頼度計算（範囲指定の場合は高め）
    let confidence = 0.7;

    if (trimmedComment.length >= 30 && trimmedComment.length <= 800) {
        confidence += 0.2;
    }

    if (/[。、．，]/.test(trimmedComment)) {
        confidence += 0.1;
    }

    return {
        comment: trimmedComment,
        confidence: Math.min(confidence, 1),
    };
}

/**
 * 指定された範囲でコメントを再抽出する
 * @param pages 既存のページ配列
 * @param regions ページごとのコメント範囲設定
 */
export function reExtractCommentsWithRegions(
    pages: PDFPage[],
    regions: { pageNumber: number; region: CommentRegion }[]
): PDFPage[] {
    return pages.map(page => {
        const regionConfig = regions.find(r => r.pageNumber === page.pageNumber);

        if (!regionConfig || !page.textItems) {
            // 範囲設定がないページはそのまま
            return page;
        }

        // 保存されたビューポートサイズを使用（なければテキストから推定）
        const pageHeight = page.viewportHeight || Math.max(...page.textItems.map(item => item.y + item.height), 800);
        const pageWidth = page.viewportWidth || Math.max(...page.textItems.map(item => item.x + item.width), 600);

        console.log(`[DEBUG] Page ${page.pageNumber} extraction:`, {
            pageHeight,
            pageWidth,
            viewportStored: !!(page.viewportWidth && page.viewportHeight),
            region: regionConfig.region,
            textItemCount: page.textItems.length,
        });

        const { comment, confidence } = extractCommentFromRegion(
            page.textItems,
            pageHeight,
            pageWidth,
            regionConfig.region
        );

        console.log(`[DEBUG] Extracted comment for page ${page.pageNumber}:`, {
            commentLength: comment.length,
            confidence,
            preview: comment.substring(0, 50),
        });

        return {
            ...page,
            extractedComment: comment,
            commentConfidence: confidence,
        };
    });
}

/**
 * PDFドキュメントを読み込んでページ情報を抽出
 */
export async function loadPDFDocument(
    file: File
): Promise<{ pages: PDFPage[]; pdf: pdfjsLib.PDFDocumentProxy }> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pages: PDFPage[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });

        // サムネイル生成
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
        }

        const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

        // テキスト抽出
        const textItems = await extractTextFromPage(page);
        const originalViewport = page.getViewport({ scale: 1.0 });

        // タイトル推定
        const title = extractTitle(textItems, originalViewport.height) || `ページ ${i}`;

        // コメント抽出
        const { comment, confidence } = extractComment(textItems, originalViewport.height);

        pages.push({
            pageNumber: i,
            title,
            thumbnail,
            isSelected: true, // デフォルトで選択状態
            extractedComment: comment,
            commentConfidence: confidence,
            textItems,
            viewportWidth: originalViewport.width,
            viewportHeight: originalViewport.height,
        });
    }

    return { pages, pdf };
}

/**
 * ページタイプを推定
 */
export function estimatePageType(title: string): string {
    const patterns: [RegExp, string][] = [
        [/損益|PL|P\/L|profit|loss/i, 'pl'],
        [/貸借|BS|B\/S|balance/i, 'bs'],
        [/キャッシュ|CF|cash.*flow/i, 'cf'],
        [/売上.*推移/i, 'sales_trend'],
        [/カテゴリ|商品|製品/i, 'category'],
        [/セグメント/i, 'segment'],
        [/前年|比較/i, 'comparison'],
    ];

    for (const [pattern, type] of patterns) {
        if (pattern.test(title)) {
            return type;
        }
    }

    return 'other';
}
