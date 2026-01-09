// src/lib/api-client.ts
// Vercel Functions APIを呼び出すクライアント

/**
 * コメント抽出リクエスト
 */
interface ExtractCommentRequest {
    imageBase64: string;
    modelName?: string;
    debugInfo?: {
        pageNumber?: number;
        region?: { x: number; y: number; width: number; height: number };
        imageSize?: { width: number; height: number };
    };
}

/**
 * コメント抽出レスポンス
 */
interface ExtractCommentResponse {
    success: boolean;
    comment?: string;
    processingTime?: number;
    modelUsed?: string;
    error?: string;
}

/**
 * コメント生成リクエスト
 */
interface GenerateCommentRequest {
    targetPage: {
        pageNumber: number;
        pageTitle: string;
        currentImage: string;
        previousImage?: string;
        previousComment?: string;
    };
    contextPages?: {
        pageNumber: number;
        pageTitle: string;
        currentImage: string;
    }[];
    systemPrompt: string;
    pagePrompt?: string;
    modelName?: string;
}

/**
 * コメント生成レスポンス
 */
interface GenerateCommentResponse {
    success: boolean;
    generatedComment?: string;
    processingTime?: number;
    modelUsed?: string;
    pageNumber?: number;
    error?: string;
}


/**
 * APIのベースURL
 * - VITE_API_BASE_URL が設定されていればそれを使用
 * - 開発時（pnpm dev）で vercel dev が別ポートで動いている場合は localhost:3001 を使用
 * - 本番は空文字（相対パス）
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.DEV && window.location.port === '5173' ? 'http://localhost:3001' : '');

/**
 * 画像から指定範囲を切り出してBase64で返す
 * @returns mimeTypeとbase64データ
 */
export async function cropImageToBase64(
    imageDataUrl: string,
    region: { x: number; y: number; width: number; height: number }
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');

            const sx = Math.round(img.width * region.x);
            const sy = Math.round(img.height * region.y);
            const sw = Math.round(img.width * region.width);
            const sh = Math.round(img.height * region.height);

            console.log('[DEBUG] cropImageToBase64:', {
                imgSize: { width: img.width, height: img.height },
                region,
                cropPixels: { sx, sy, sw, sh },
            });

            // 最大サイズ制限（大きすぎると処理が遅い）
            const MAX_SIZE = 600;  // 高速化のため600pxに制限
            let targetWidth = Math.max(sw, 1);
            let targetHeight = Math.max(sh, 1);

            if (targetWidth > MAX_SIZE || targetHeight > MAX_SIZE) {
                const ratio = Math.min(MAX_SIZE / targetWidth, MAX_SIZE / targetHeight);
                targetWidth = Math.round(targetWidth * ratio);
                targetHeight = Math.round(targetHeight * ratio);
            }

            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas context not available'));
                return;
            }

            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

            // JPEG形式で圧縮（サイズを小さくして高速化）
            const dataUrl = canvas.toDataURL('image/jpeg', 0.70);  // 品質70%
            const base64 = dataUrl.split(',')[1];

            if (!base64) {
                reject(new Error('Failed to generate base64'));
                return;
            }

            console.log('[DEBUG] Cropped canvas size:', canvas.width, 'x', canvas.height, 'Base64 size:', base64.length);

            resolve(base64);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = imageDataUrl;
    });
}

/**
 * 画像DataURLからBase64部分のみを抽出
 */
export function extractBase64FromDataUrl(dataUrl: string): string {
    const parts = dataUrl.split(',');
    return parts.length > 1 ? parts[1] : dataUrl;
}

/**
 * コメント抽出API呼び出し
 */
export async function extractComment(
    imageBase64: string,
    modelName: string = 'gemini-3-flash-preview'
): Promise<ExtractCommentResponse> {
    try {
        console.log(`[DEBUG] extractComment: Calling ${API_BASE}/api/comment/extract`);

        const response = await fetch(`${API_BASE}/api/comment/extract`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                imageBase64,
                modelName,
            } as ExtractCommentRequest),
        });

        console.log(`[DEBUG] extractComment: Response status ${response.status}`);

        const data = await response.json();
        console.log(`[DEBUG] extractComment: Response data received`, { success: data.success, commentLength: data.comment?.length });

        return data as ExtractCommentResponse;

    } catch (error) {
        console.error('API call failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'API call failed',
        };
    }
}

/**
 * コメント生成API呼び出し
 */
export async function generateComment(
    request: GenerateCommentRequest
): Promise<GenerateCommentResponse> {
    try {
        const response = await fetch(`${API_BASE}/api/comment/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
        });

        const data = await response.json();
        return data as GenerateCommentResponse;

    } catch (error) {
        console.error('API call failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'API call failed',
        };
    }
}

export default {
    cropImageToBase64,
    extractBase64FromDataUrl,
    extractComment,
    generateComment,
};
