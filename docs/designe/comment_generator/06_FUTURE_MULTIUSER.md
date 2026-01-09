# 06. 複数人共有機能（将来対応予定）

**ステータス**: 未実装
**優先度**: 中
**想定工数**: 3.5-4.5日

---

## 概要

複数ユーザーが同じ顧客設定（コメント範囲、プロンプト、画像など）を共有できる機能。

---

## 現状の問題

| 項目 | 現状 | 問題 |
|------|------|------|
| 保存場所 | localStorage | 端末固有、他ユーザーと共有不可 |
| 画像 | セッション内のみ | ブラウザを閉じると消失 |
| 同期 | なし | 複数人で設定共有不可 |
| バックアップ | なし | データ消失リスク |

---

## 目標アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────┐
│                         フロントエンド                               │
│  ├── ユーザー認証（Supabase Auth / Google OAuth）                  │
│  └── データ取得・保存（Supabase Client）                           │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Supabase                                    │
│  ├── PostgreSQL Database                                           │
│  │   ├── users              （ユーザー）                           │
│  │   ├── organizations      （組織/チーム）                        │
│  │   ├── customers          （顧客マスタ）                         │
│  │   ├── customer_page_regions （コメント範囲設定）                │
│  │   ├── customer_prompts   （プロンプト設定）                     │
│  │   └── comment_generations（生成履歴）                           │
│  ├── Storage                                                       │
│  │   └── customer-images/   （顧客別画像保存）                     │
│  └── RLS (Row Level Security)                                      │
│      └── 組織単位でのアクセス制御                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## データベース設計

### ERD

```
┌─────────────────┐     ┌─────────────────────┐
│     users       │     │     organizations   │
├─────────────────┤     ├─────────────────────┤
│ id (PK)         │────→│ id (PK)             │
│ email           │     │ name                │
│ organization_id │←────│                     │
└─────────────────┘     └─────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │       customers         │
                    ├─────────────────────────┤
                    │ id (PK)                 │
                    │ organization_id (FK)    │
                    │ name                    │
                    └─────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  customer_page_regions  │
                    ├─────────────────────────┤
                    │ id (PK)                 │
                    │ customer_id (FK)        │
                    │ page_number             │
                    │ region_x, y, w, h       │
                    └─────────────────────────┘
```

### SQL スキーマ

```sql
-- 組織
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ユーザー
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    organization_id UUID REFERENCES organizations(id),
    role TEXT DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 顧客マスタ
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    industry TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- コメント範囲設定
CREATE TABLE customer_page_regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    page_title TEXT,
    region_x DECIMAL DEFAULT 0,
    region_y DECIMAL DEFAULT 0.7,
    region_width DECIMAL DEFAULT 1,
    region_height DECIMAL DEFAULT 0.3,
    is_enabled BOOLEAN DEFAULT TRUE,
    UNIQUE(customer_id, page_number)
);

-- プロンプト設定
CREATE TABLE customer_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    system_prompt TEXT,
    page_prompts JSONB DEFAULT '{}',
    UNIQUE(customer_id)
);
```

### RLS ポリシー

```sql
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization's customers"
    ON customers FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );
```

---

## Storage設計

### フォルダ構成

```
customer-images/
├── {organization_id}/
│   ├── {customer_id}/
│   │   ├── pages/
│   │   │   ├── page_1.png
│   │   │   ├── page_2.png
│   │   │   └── ...
│   │   └── pdf/
│   │       └── report.pdf
```

---

## API設計

| エンドポイント | メソッド | 説明 |
|---------------|---------|------|
| `/api/customers` | GET | 顧客一覧 |
| `/api/customers` | POST | 顧客作成 |
| `/api/customers/[id]` | GET/PUT/DELETE | 顧客詳細 |
| `/api/customers/[id]/regions` | GET/PUT | コメント範囲 |
| `/api/customers/[id]/prompts` | GET/PUT | プロンプト |
| `/api/customers/[id]/images` | POST | 画像アップロード |

---

## 実装ステップ

| Phase | 内容 | 工数 |
|-------|------|------|
| 1 | Supabaseプロジェクト作成、DBスキーマ | 1-2日 |
| 2 | 認証（Google OAuth）、AuthProvider | 0.5日 |
| 3 | 顧客API、useClientSettings書き換え | 1日 |
| 4 | 画像永続化、Storage連携 | 0.5日 |
| 5 | テスト、パフォーマンス調整 | 0.5日 |
| **合計** | | **3.5-4.5日** |

---

## 暫定対応: JSON Export/Import

Supabase導入前の代替として、設定のエクスポート/インポート機能。

```typescript
// エクスポート
const exportSettings = () => {
    const settings = loadClientsFromStorage();
    const blob = new Blob([JSON.stringify(settings, null, 2)], 
        { type: 'application/json' });
    // ダウンロード処理
};

// インポート
const importSettings = async (file: File) => {
    const text = await file.text();
    const settings = JSON.parse(text);
    saveClientsToStorage(settings);
};
```

**メリット**: 実装1時間程度
**デメリット**: 手動ファイル共有、リアルタイム同期なし

---

## 注意事項

1. **個人情報保護**: 顧客情報を扱うため適切なアクセス制御必須
2. **データ移行**: 既存localStorage→Supabase移行パスを用意
3. **オフライン対応**: 接続エラー時のフォールバック
4. **コスト**: Supabase Free Tier制限確認（Storage 1GB, DB 500MB）
