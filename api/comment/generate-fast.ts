import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';

/**
 * 高速コメント生成API（キャッシュ使用）
 * 事前にキャッシュされた全ページデータを使用して高速生成
 * 
 * POST /api/comment/generate-fast
 */

interface GenerateFastRequest {
    cacheId: string;           // bulk-cacheで作成したキャッシュID
    pageNumber: number;        // 生成対象のページ番号
    pageTitle: string;         // ページタイトル
    pagePrompt?: string;       // ページ固有の追加指示
}

export default async function handler(
    req: VercelRequest,
    res: VercelResponse
) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const {
            cacheId,
            pageNumber,
            pageTitle,
            pagePrompt,
        } = req.body as GenerateFastRequest;

        if (!cacheId) {
            return res.status(400).json({
                success: false,
                error: 'cacheId is required'
            });
        }

        if (!pageNumber) {
            return res.status(400).json({
                success: false,
                error: 'pageNumber is required'
            });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error: 'GEMINI_API_KEY is not configured'
            });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const cacheManager = new GoogleAICacheManager(apiKey);

        const startTime = Date.now();

        // キャッシュからモデルを取得
        let model;
        try {
            const cache = await cacheManager.get(cacheId);
            model = genAI.getGenerativeModelFromCachedContent(cache);
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Cache not found or expired. Please create a new cache.',
            });
        }

        // 生成プロンプト
        const prompt = `
## 生成対象: P${pageNumber} - ${pageTitle}

上記のキャッシュされた全ページデータを参照して、P${pageNumber}のコメントを生成してください。

【生成ルール】
1. P${pageNumber}の今月データ画像を主に分析してください
2. 他ページのデータと関連する要因があれば考慮してください（必須ではありません）
3. 前月コメントがある場合は、変更すべき点を判定して反映してください
4. 前月コメントのトーン・文体を参考にしてください

${pagePrompt ? `【追加指示】\n${pagePrompt}\n` : ''}

【重要：出力形式ルール】
・マークダウン記法は一切使用禁止です（#、**、__、-、*、> など全て禁止）
・太字・斜体・見出し記号などの装飾記法は絶対に使わないでください
・プレーンテキストのみで出力してください
・箇条書きを使う場合は「・」（中黒）を先頭に付けてください
・段落の先頭は全角スペース1つでインデントしてください
・強調したい部分は「」（かぎ括弧）で囲むか、文末に（重要）と付けてください
・コメントのみを出力してください（説明不要）
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const generatedComment = response.text().trim();

        const processingTime = Date.now() - startTime;

        return res.status(200).json({
            success: true,
            pageNumber,
            pageTitle,
            generatedComment,
            processingTime,
            usedCache: true,
        });

    } catch (error) {
        console.error('Fast generation error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        return res.status(500).json({
            success: false,
            error: `Failed to generate comment: ${errorMessage}`,
        });
    }
}
