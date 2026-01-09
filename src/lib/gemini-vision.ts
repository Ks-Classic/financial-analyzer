// src/lib/gemini-vision.ts
// Gemini Vision APIを使ったコメント抽出

import { GoogleGenerativeAI } from '@google/generative-ai';

// APIキーはVite経由で環境変数から取得
const API_KEY = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || '';

/**
 * 範囲情報
 */
interface Region {
    x: number;      // 0-1
    y: number;      // 0-1
    width: number;  // 0-1
    height: number; // 0-1
}

/**
 * 画像から指定範囲を切り出してBase64で返す
 */
export async function cropImageRegion(
    imageDataUrl: string,
    region: Region
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');

            // 切り出し範囲を計算
            const sx = Math.round(img.width * region.x);
            const sy = Math.round(img.height * region.y);
            const sw = Math.round(img.width * region.width);
            const sh = Math.round(img.height * region.height);

            canvas.width = sw;
            canvas.height = sh;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas context not available'));
                return;
            }

            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

            // Base64で返す（data:image/... のプレフィックスを除去）
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageDataUrl;
    });
}

/**
 * Gemini Vision APIでコメントを抽出
 */
export async function extractCommentWithGemini(
    imageBase64: string,
    modelName: string = 'gemini-3-flash-preview'
): Promise<string> {
    if (!API_KEY) {
        console.warn('GEMINI_API_KEY is not set, returning demo comment');
        return generateDemoExtractedComment();
    }

    try {
        const genAI = new GoogleGenerativeAI(API_KEY);
        const model = genAI.getGenerativeModel({ model: modelName });

        const prompt = `この画像は財務レポートのコメント部分です。
画像に含まれるすべてのテキストを正確に読み取り、そのまま出力してください。

【重要な指示】
- 箇条書きがあればその形式を保持してください（・、-、●などの記号も含めて）
- 段落の区切りは改行で表現してください
- 数値や固有名詞は正確に読み取ってください
- レイアウト上の装飾（罫線など）は無視してください
- コメント以外の要素（表や図の一部など）が含まれていても、テキスト部分のみを抽出してください

テキストのみを出力し、余計な説明は不要です。`;

        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: imageBase64,
                },
            },
            prompt,
        ]);

        const response = await result.response;
        const text = response.text();

        return text.trim();
    } catch (error) {
        console.error('Gemini API error:', error);
        throw error;
    }
}

/**
 * ページ画像から指定範囲のコメントを抽出
 */
export async function extractCommentFromPageRegion(
    pageImageDataUrl: string,
    region: Region,
    modelName: string = 'gemini-3-flash-preview'
): Promise<string> {
    // 1. 範囲を切り出し
    const croppedBase64 = await cropImageRegion(pageImageDataUrl, region);

    // 2. Geminiで抽出
    const comment = await extractCommentWithGemini(croppedBase64, modelName);

    return comment;
}

/**
 * デモ用のサンプルコメント
 */
function generateDemoExtractedComment(): string {
    const samples = [
        `【損益計算書】
• 売上高：ミラクルフィットI（片側）やミラクルフィットV（コバルト）等の販売個数が減少したことにより、売上高は対前月比で減少している。

【売上高】
• ラボ：歯科技工物であるミラクルデンチャーに係る売上高である。
• 月は単価が増加したものの、月の季節的な需要回復要因がなくなった影響で、ミラクルフィットI（片側）やミラクルフィットV（コバルト）等の販売個数が減少しており、対前月比でラボ売上高は減少している。`,

        `• 入会金収入：MD会員からの入会金である。2月の10万円はグレードアップ会員の入会金のうち、ミラクルラボの取り分（20%）である。
• 年会費収入：MD会員からの年会費である。1月に前受金の収益認識を行っている。2025年度の年会費収入は19,024千円を見込んでいる。`,

        `その他売上高：MD会員向けに販売する健康食品・機器（はちみつや吸器など）に係る売上高である。5月は、はちみつの販売数量が増加した影響である。

売上原価：義歯の材料や健康食品・機器などの仕入高より構成されている。義歯の売上総利益率は90%〜95%に対し、健康食品・機器は20%程度である。`,
    ];

    return samples[Math.floor(Math.random() * samples.length)];
}

export default {
    cropImageRegion,
    extractCommentWithGemini,
    extractCommentFromPageRegion,
};
