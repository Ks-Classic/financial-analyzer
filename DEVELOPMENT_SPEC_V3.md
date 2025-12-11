### **開発仕様設計書：AI財務レポートアナライザー**
### **（改訂版 v3.0：PDF生成機能の安定化とGoogleネイティブ技術スタックへの移行）**

**改訂履歴**
| 版 | 日付 | 作成者 | 変更内容 |
| :--- | :--- | :--- | :--- |
| 3.0 | 2025/07/21 | Gemini | PDF生成Functionの技術スタックを、非互換性が確認されたPlaywrightからGoogle純正のPuppeteer (`@google-cloud/puppeteer`) へと最終変更。 |
| 2.0 | 2025/07/21 | Gemini | PDFエクスポート機能のアーキテクチャをマイクロサービス化し、CI/CDプロセスをBuildpacksによる自動化に移行する根本的改修 |
| 1.0 | (初期版) | - | (初期開発) |

---

### **1. プロジェクト概要**

#### **1.1. 目的と背景**
（変更なし）

#### **1.2. 全体アーキテクチャ図 (To-Be)**

**PDF Generator (Cloud Function)の技術スタックをPlaywrightからPuppeteerに変更。**

```
+----------------------------------+
|                                  |
|   ユーザー (Webブラウザ)         |
|                                  |
+----------------+-----------------+
                 | (HTTPS)
                 v
+----------------------------------+
| Frontend (Vercel)                |
| (React / Vite)                   |
| - UI/UXの提供                    |
| - バックエンドへのAPIリクエスト  |
+----------------+-----------------+
                 | (HTTPS API Call)
                 v
+----------------------------------+     (Secure HTTP Call)     +---------------------------------+
| Backend (Cloud Run)              | -------------------------> | PDF Generator (Cloud Function)  |
| (Node.js / Express)              |                            | (Node.js / Puppeteer)           |
| - PDFアップロード受付            |     (HTMLコンテンツ)       | - HTMLを受け取りPDFを生成         |
| - Document AI連携によるテキスト抽出|                            | - Google公式ラッパーを使用      |
| - Gemini API連携による財務分析   |     (生成されたPDF)        |                                 |
| - 分析結果のJSON提供             | <------------------------- |                                 |
| - PDF生成サービス呼び出し        |                            +---------------------------------+
+----------------------------------+

[CI/CDプロセス]
（変更なし）
```

---

### **2. 機能仕様**

#### **2.1. コア機能（変更なし）**
（変更なし）

#### **2.2. PDFエクスポート機能（本改修の対象）**
*   **PDF生成Cloud Functionの動作:**
    1.  HTTP POSTリクエストでHTML文字列を受け取る。
    2.  **`@google-cloud/puppeteer`** を使用して、環境に最適化されたPuppeteerとChromiumを起動する。
    3.  受け取ったHTMLをレンダリングし、A4サイズのPDFを生成する。
    4.  生成したPDFのバイナリデータをHTTPレスポンスとして返す。

---

### **3. 設計**

#### **3.1. サービス境界の再定義（変更なし）**
（変更なし）

#### **3.2. CI/CD設計（変更なし）**
（変更なし）

---

### **4. 実行計画 (Plan of Action)**

**フェーズ1：Cloud Functionの技術スタック変更**
1.  **依存関係の変更:**
    *   `apps/pdf-generator/package.json`を修正し、`playwright-core`, `@sparticuz/chromium`等を削除。
    *   `puppeteer`と`@google-cloud/puppeteer`を新たに追加する。
2.  **実装の変更:**
    *   `apps/pdf-generator/src/index.ts`を修正し、Playwrightベースの実装を、`@google-cloud/puppeteer`を使用するPuppeteerベースの実装に書き換える。
3.  **依存関係の再インストール:**
    *   `apps/pdf-generator`ディレクトリで`rm -rf node_modules pnpm-lock.yaml`を実行し、クリーンアップ後、`pnpm install`を実行する。

**フェーズ2：Cloud Functionの再デプロイ**
1.  **デプロイコマンドの実行:**
    *   `apps/pdf-generator`ディレクトリで`pnpm run deploy`を実行し、安定化された新しいバージョンをデプロイする。

**フェーズ3：最終動作確認**
1.  デプロイが成功したCloud RunのURLにアクセスし、フロントエンドからPDFエクスポート機能を実行する。
2.  エラーが発生せず、PDFファイルが正常にダウンロードされることを確認し、プロジェクトを完了する。
