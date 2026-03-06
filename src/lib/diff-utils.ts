// src/lib/diff-utils.ts
// テキスト差分計算ユーティリティ

export interface DiffFragment {
    type: 'common' | 'added' | 'removed';
    text: string;
}

/**
 * 2つのテキストを比較して差分を計算
 * シンプルな単語ベースの差分アルゴリズム
 */
export function computeTextDiff(oldText: string, newText: string): DiffFragment[] {
    if (!oldText && !newText) return [];
    if (!oldText) return [{ type: 'added', text: newText }];
    if (!newText) return [{ type: 'removed', text: oldText }];

    // 単語（スペース・改行含む）で分割
    const oldWords = oldText.split(/(\s+)/);
    const newWords = newText.split(/(\s+)/);

    const fragments: DiffFragment[] = [];
    let i = 0;
    let j = 0;

    while (i < oldWords.length || j < newWords.length) {
        if (i < oldWords.length && j < newWords.length && oldWords[i] === newWords[j]) {
            // 共通部分
            fragments.push({ type: 'common', text: oldWords[i] });
            i++;
            j++;
        } else if (j < newWords.length && (i >= oldWords.length || !oldWords.slice(i).includes(newWords[j]))) {
            // 追加部分
            fragments.push({ type: 'added', text: newWords[j] });
            j++;
        } else {
            // 削除部分
            fragments.push({ type: 'removed', text: oldWords[i] });
            i++;
        }
    }

    // 連続する同じタイプの断片を結合
    return mergeFragments(fragments);
}

/**
 * 連続する同じタイプの断片を結合して読みやすくする
 */
function mergeFragments(fragments: DiffFragment[]): DiffFragment[] {
    const merged: DiffFragment[] = [];
    let current: DiffFragment | null = null;

    for (const fragment of fragments) {
        if (!current || current.type !== fragment.type) {
            if (current) merged.push(current);
            current = { ...fragment };
        } else {
            current.text += fragment.text;
        }
    }

    if (current) merged.push(current);
    return merged;
}

/**
 * 差分統計を計算
 */
export function computeDiffStats(oldText: string, newText: string) {
    const oldLength = oldText.length;
    const newLength = newText.length;
    const diff = newLength - oldLength;

    return {
        oldLength,
        newLength,
        diff,
        isExpanded: diff > 0,
        isReduced: diff < 0,
        percentChange: oldLength > 0 ? Math.round((diff / oldLength) * 100) : 0,
    };
}
