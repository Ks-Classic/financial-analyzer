import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * コメント抽出API
 * PDFページから切り出した画像を受け取り、Gemini Vision APIでテキストを抽出する
 * 
 * POST /api/comment/extract
 * Body: { imageBase64: string, modelName?: string }
 */

const EXTRACTION_PROMPT = `この画像は財務レポートのコメント部分です。
画像に含まれるすべてのテキストを正確に読み取り、そのまま出力してください。

【重要な指示】
- 箇条書きがあればその形式を保持してください（・、-、●などの記号も含めて）
- 段落の区切りは改行で表現してください
- 数値や固有名詞は正確に読み取ってください
- レイアウト上の装飾（罫線など）は無視してください
- コメント以外の要素（表や図の一部など）が含まれていても、テキスト部分のみを抽出してください

テキストのみを出力し、余計な説明は不要です。`;

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    console.log(`[${requestId}] /api/comment/extract - ${req.method}`);

    // CORSヘッダー
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        console.log(`[${requestId}] Method not allowed: ${req.method}`);
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { imageBase64, modelName = 'gemini-3-flash-preview' } = req.body;

        // 画像データの詳細をログ出力
        const base64Preview = imageBase64?.substring(0, 50) || 'N/A';
        console.log(`[${requestId}] Model: ${modelName}`);
        console.log(`[${requestId}] Image size: ${imageBase64?.length || 0} chars`);
        console.log(`[${requestId}] Base64 preview: ${base64Preview}...`);

        if (!imageBase64) {
            console.log(`[${requestId}] Error: imageBase64 is required`);
            return res.status(400).json({
                success: false,
                error: 'imageBase64 is required'
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.log(`[${requestId}] Error: GEMINI_API_KEY is not configured`);
            return res.status(500).json({
                success: false,
                error: 'GEMINI_API_KEY is not configured'
            });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName });

        const startTime = Date.now();
        console.log(`[${requestId}] Calling Gemini API...`);

        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: 'image/jpeg',  // JPEG形式（クライアント側と一致）
                    data: imageBase64,
                },
            },
            EXTRACTION_PROMPT,
        ]);

        const response = await result.response;
        const extractedComment = response.text().trim();

        const processingTime = Date.now() - startTime;
        console.log(`[${requestId}] Success! Time: ${processingTime}ms, Comment length: ${extractedComment.length}`);

        return res.status(200).json({
            success: true,
            comment: extractedComment,
            processingTime,
            modelUsed: modelName,
        });

    } catch (error) {
        console.error(`[${requestId}] Comment extraction error:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return res.status(500).json({
            success: false,
            error: `Failed to extract comment: ${errorMessage}`,
        });
    }
}
