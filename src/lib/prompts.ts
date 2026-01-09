// src/lib/prompts.ts
// プロンプト定義とデフォルト値

/**
 * デフォルトのシステムプロンプト
 */
export const DEFAULT_SYSTEM_PROMPT = `あなたは財務分析の専門家です。

【基本ルール】
・前月レポートのコメントのトーン・表現スタイルを踏襲してください
・当月の特徴的な変動やトピックがあれば言及してください
・他のページのデータも参照して要因分析してください
・コメントは前月レポートと同程度の文字数にしてください
・数ヶ月の推移を見て傾向が変化した場合は、その点も考察してください

【出力形式 - PowerPoint用プレーンテキスト】
・マークダウン記法は一切使用禁止です（#、**、__、-、*、> など全て禁止）
・太字、斜体、見出し記号などの装飾記法は絶対に使わないでください
・プレーンテキストのみで出力してください
・箇条書きを使う場合は「・」（中黒）を先頭に付けてください
・段落の先頭は全角スペース1つでインデントしてください
・段落間は1行空けてください
・強調したい部分は「」（かぎ括弧）で囲むか、文末に（重要）と付けてください
・前月コメントと同じフォーマットを維持してください`;

/**
 * ページ種別ごとの分析指示
 */
export const PAGE_TYPE_INSTRUCTIONS: Record<string, string> = {
    pl: '売上高の変動については、売上個数・単価・カテゴリ別のページデータを参照して具体的な要因を記載。原価率の変動、販管費の増減についても触れてください。',
    bs: '現預金、売掛金、在庫の変動理由を中心に記載。負債項目の増減についても言及してください。',
    cf: '営業CF、投資CF、財務CFそれぞれの主な増減要因を記載。フリーキャッシュフローの状況も触れてください。',
    sales_trend: 'トレンド変化、季節要因、異常値を中心に記載。移動平均での傾向分析も含めてください。',
    category: 'カテゴリ間の比較、構成比変化を中心に記載。主力カテゴリの動向を重点的に分析してください。',
    segment: 'セグメント別の売上・利益の変動を分析。成長セグメントと課題セグメントを明確にしてください。',
    comparison: '前年同月比、前月比の主な変動項目とその要因を記載。季節性の影響も考慮してください。',
    other: '主要な変動項目とその要因を分析して記載。特筆すべき変化があれば強調してください。',
};

/**
 * コメントスタイルの分析結果
 */
export interface CommentStyle {
    format: 'bullet' | 'paragraph' | 'mixed';
    averageCharCount: number;
    hasNumbers: boolean;
    hasSections: boolean;
    mentionedItems: string[];
    tone: 'formal' | 'casual' | 'neutral';
}

/**
 * 前月コメントのスタイルを分析
 */
export function analyzeCommentStyle(comment: string): CommentStyle {
    const lines = comment.split('\n').filter(line => line.trim());

    // 箇条書きチェック
    const bulletLines = lines.filter(line => /^[・\-●■▶→]/.test(line.trim()));
    const isBullet = bulletLines.length > lines.length * 0.5;
    const isParagraph = bulletLines.length < lines.length * 0.2;

    // セクション（■、【】など）のチェック
    const hasSections = /[■【】▼▲]/.test(comment);

    // 数値の有無
    const hasNumbers = /\d+[%百万億円]/.test(comment);

    // 言及項目の抽出
    const mentionedItems = extractMentionedItems(comment);

    // トーン分析（簡易）
    const formalMarkers = /ございます|いたします|存じます|おります/;
    const casualMarkers = /です(?!が)|ます(?!が)|でした|ました/;

    let tone: 'formal' | 'casual' | 'neutral' = 'neutral';
    if (formalMarkers.test(comment)) {
        tone = 'formal';
    } else if (casualMarkers.test(comment)) {
        tone = 'casual';
    }

    return {
        format: isBullet ? 'bullet' : isParagraph ? 'paragraph' : 'mixed',
        averageCharCount: comment.length,
        hasNumbers,
        hasSections,
        mentionedItems,
        tone,
    };
}

/**
 * 言及項目を抽出
 */
export function extractMentionedItems(comment: string): string[] {
    const items: string[] = [];

    const patterns: [RegExp, string][] = [
        [/売上高?/, '売上'],
        [/利益/, '利益'],
        [/原価/, '原価'],
        [/経費|費用|販管費/, '経費'],
        [/資産/, '資産'],
        [/負債/, '負債'],
        [/純資産|自己資本/, '純資産'],
        [/キャッシュ|現金|現預金/, '現金'],
        [/借入|借入金/, '借入'],
        [/在庫|棚卸/, '在庫'],
        [/売掛|売掛金/, '売掛金'],
        [/買掛|買掛金/, '買掛金'],
    ];

    for (const [pattern, item] of patterns) {
        if (pattern.test(comment) && !items.includes(item)) {
            items.push(item);
        }
    }

    return items;
}

/**
 * プロンプトテンプレート
 */
export interface PromptTemplate {
    id: string;
    name: string;
    systemPrompt: string;
    pagePrompts: Record<string, string>;
    createdAt: string;
    updatedAt: string;
}

/**
 * ローカルストレージからテンプレートを読み込み
 */
export function loadPromptTemplates(): PromptTemplate[] {
    try {
        const stored = localStorage.getItem('comment-generator-templates');
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

/**
 * ローカルストレージにテンプレートを保存
 */
export function savePromptTemplate(template: PromptTemplate): void {
    const templates = loadPromptTemplates();
    const existingIndex = templates.findIndex(t => t.id === template.id);

    if (existingIndex >= 0) {
        templates[existingIndex] = template;
    } else {
        templates.push(template);
    }

    localStorage.setItem('comment-generator-templates', JSON.stringify(templates));
}

/**
 * テンプレートを削除
 */
export function deletePromptTemplate(templateId: string): void {
    const templates = loadPromptTemplates().filter(t => t.id !== templateId);
    localStorage.setItem('comment-generator-templates', JSON.stringify(templates));
}
