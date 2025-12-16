# 財務コメント自動生成機能 - DB設計書

## 1. データストア概要

### 1.1 使用技術
- **Firestore** (Firebase Cloud Firestore)
- NoSQL ドキュメント指向データベース

### 1.2 Phase別の使用状況

| Phase | DB使用 | 説明 |
|-------|--------|------|
| Phase 1 | 最小限 | 分析ログのみ保存、テンプレートは使用しない |
| Phase 2 | 本格利用 | 顧客、テンプレート、履歴を保存 |
| Phase 3 | 拡張 | コメント履歴、学習データを追加 |

---

## 2. コレクション設計

### 2.1 customers コレクション (Phase 2)

顧客情報を管理する。

```typescript
interface Customer {
  // ドキュメントID: 自動生成
  id: string;
  
  // 顧客名
  name: string;
  
  // 業種（任意）
  industry?: string;
  
  // メモ（任意）
  notes?: string;
  
  // タイムスタンプ
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### インデックス
- `name` (昇順) - 顧客名検索用

#### 例
```json
{
  "id": "cust_abc123",
  "name": "ミラクルラボ",
  "industry": "歯科技工",
  "notes": "月次レポート20ページ",
  "createdAt": "2025-01-15T09:00:00Z",
  "updatedAt": "2025-12-16T10:30:00Z"
}
```

---

### 2.2 pageTemplates コレクション (Phase 2)

ページごとのテンプレート設定を管理する。

```typescript
interface PageTemplate {
  // ドキュメントID: 自動生成
  id: string;
  
  // 顧客ID（外部キー）
  customerId: string;
  
  // ページ番号
  pageNumber: number;
  
  // ページタイトル
  pageTitle: string;
  
  // ページタイプ
  pageType: 'income_statement' | 'balance_sheet' | 'cash_flow' | 
            'tax_schedule' | 'staff_sales' | 'forecast' | 'custom';
  
  // 対応するExcelシート名
  sourceSheet: string;
  
  // 範囲設定
  range: {
    startRow: number;
    endRow: number;
    headerRow: number;
    itemColumn: string;
  };
  
  // 月検出設定
  monthConfig: {
    format: 'YYMM' | 'YYYY/MM' | 'YYYY-MM' | 'M月' | 'custom';
    customPattern?: string;
    analysisTarget: 'latestMonth' | 'specified';
    compareWith: 'previousMonth' | 'sameMonthLastYear' | 'specified';
  };
  
  // コメント設定
  commentConfig: {
    maxLength: number;
    lineBreakStyle: 'bullet' | 'paragraph' | 'numbered';
    targetItems: string[];
    mode: 'auto' | 'specified';
  };
  
  // タイムスタンプ
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### インデックス
- `customerId` + `pageNumber` (複合) - 顧客別ページ一覧取得用

---

### 2.3 generatedComments コレクション (Phase 2)

生成したコメントの履歴を保存する。

```typescript
interface GeneratedComment {
  // ドキュメントID: 自動生成
  id: string;
  
  // 顧客ID
  customerId: string;
  
  // テンプレートID
  templateId: string;
  
  // レポート対象月 (YYMM)
  reportMonth: string;
  
  // 生成されたコメント
  comment: string;
  
  // 分析元データのスナップショット
  sourceData: {
    headers: string[];
    rows: { item: string; values: (number | null)[] }[];
  };
  
  // 検出した変動情報
  highlights: {
    item: string;
    changeRate: number;
    trend: 'up' | 'down' | 'flat';
  }[];
  
  // タイムスタンプ
  createdAt: Timestamp;
}
```

#### インデックス
- `customerId` + `reportMonth` (複合) - 顧客×月別履歴取得用

---

### 2.4 analysisLogs コレクション (Phase 1から使用)

分析ログを保存する（デバッグ・監視用）。

```typescript
interface AnalysisLog {
  // ドキュメントID: 自動生成
  id: string;
  
  // リクエスト情報
  request: {
    targetMonth: string;
    compareMonth: string;
    rowCount: number;
    targetItems?: string[];
  };
  
  // レスポンス情報
  response: {
    commentLength: number;
    highlightCount: number;
    tokenCount: number;
  };
  
  // 処理時間 (ms)
  processingTime: number;
  
  // エラー情報（エラー時のみ）
  error?: {
    code: string;
    message: string;
  };
  
  // タイムスタンプ
  createdAt: Timestamp;
}
```

---

## 3. データ関連図

```
┌─────────────────┐
│   customers     │
│                 │
│  id (PK)        │
│  name           │
│  industry       │
│  ...            │
└────────┬────────┘
         │ 1
         │
         │ N
┌────────┴────────┐          ┌─────────────────┐
│  pageTemplates  │          │ generatedComments│
│                 │          │                  │
│  id (PK)        │◄─────────│  id (PK)         │
│  customerId (FK)│    1   N │  customerId (FK) │
│  pageNumber     │          │  templateId (FK) │
│  pageTitle      │          │  reportMonth     │
│  range          │          │  comment         │
│  ...            │          │  ...             │
└─────────────────┘          └──────────────────┘
```

---

## 4. Firestoreルール

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // 顧客コレクション
    match /customers/{customerId} {
      allow read: if true;
      allow write: if true;  // Phase 2で認証追加
    }
    
    // テンプレートコレクション
    match /pageTemplates/{templateId} {
      allow read: if true;
      allow write: if true;
    }
    
    // コメント履歴
    match /generatedComments/{commentId} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if false;  // 履歴は更新・削除不可
    }
    
    // 分析ログ
    match /analysisLogs/{logId} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if false;
    }
  }
}
```

---

## 5. データ保持ポリシー

| コレクション | 保持期間 | 理由 |
|-------------|---------|------|
| customers | 永続 | マスタデータ |
| pageTemplates | 永続 | 設定データ |
| generatedComments | 12ヶ月 | 履歴参照用 |
| analysisLogs | 3ヶ月 | 監視・デバッグ用 |

---

*作成日: 2025-12-16*
