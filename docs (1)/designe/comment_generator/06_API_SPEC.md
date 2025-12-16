# 財務コメント自動生成機能 - API仕様書

## 1. API 概要

| 項目 | 値 |
|------|-----|
| ベースURL (開発) | `http://localhost:3001/api` |
| ベースURL (本番) | `https://api.financial-analyzer.example.com/api` |
| プロトコル | HTTPS |
| 認証 | なし (Phase 1) |
| コンテンツタイプ | `application/json` |

---

## 2. POST /api/generate-comment

財務データからAI分析コメントを生成する。

### リクエスト

```json
{
  "tableData": {
    "headers": ["項目", "2501", "2502", "2503", "2504", "2505", "2506"],
    "rows": [
      { "item": "売上高", "values": [19990, 17983, 18487, 19091, 18009, 21080] },
      { "item": "ラボ", "values": [11526, 17256, 18331, 18952, 17806, 20634] }
    ]
  },
  "targetMonth": "2506",
  "compareMonth": "2505",
  "targetItems": ["売上高", "売上原価"],
  "commentStyle": {
    "maxLength": 500,
    "format": "bullet"
  }
}
```

### レスポンス (200 OK)

```json
{
  "success": true,
  "data": {
    "comment": "・売上高\n  2506月の売上高は21,080千円となり、前月比+17.1%の増加。",
    "highlights": [
      {
        "item": "売上高",
        "currentValue": 21080,
        "previousValue": 18009,
        "changeRate": 17.05,
        "trend": "up"
      }
    ],
    "suggestedItems": ["入会金収入", "売上高", "年会費収入"]
  }
}
```

### エラーレスポンス

| コード | HTTPステータス | 説明 |
|--------|---------------|------|
| VALIDATION_ERROR | 400 | 入力パラメータ不正 |
| RATE_LIMIT | 429 | レート制限超過 |
| AI_SERVICE_ERROR | 500 | AI サービスエラー |

---

## 3. 顧客管理 API (Phase 2)

### GET /api/customers
顧客一覧を取得

### POST /api/customers
顧客を新規登録

### GET /api/customers/:customerId/templates
顧客のテンプレート一覧を取得

### POST /api/customers/:customerId/templates
テンプレートを新規作成

---

*作成日: 2025-12-16*
