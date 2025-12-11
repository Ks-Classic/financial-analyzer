### **開発仕様設計書：AI財務レポートアナライザー**
### **（改訂版 v4.0：Puppeteer実行環境の確立と安定化）**

**改訂履歴**
| 版 | 日付 | 作成者 | 変更内容 |
| :--- | :--- | :--- | :--- |
| 4.0 | 2025/07/22 | Gemini | Cloud Functions環境でChromeが見つからない問題を、`.puppeteerrc.cjs`でキャッシュパスを構成することで解決。PDF生成機能を完全に安定化。 |
| 3.0 | 2025/07/21 | Gemini | PDF生成Functionの技術スタックを、非互換性が確認されたPlaywrightからGoogle純正のPuppeteer (`@google-cloud/puppeteer`) へと最終変更。（後にこのアプローチは非推奨と判明） |
| 2.0 | 2025/07/21 | Gemini | PDFエクスポート機能のアーキテクチャをマイクロサービス化し、CI/CDプロセスをBuildpacksによる自動化に移行する根本的改修 |
| 1.0 | (初期版) | - | (初期開発) |

---

### **1. プロジェクト概要**

#### **1.1. 目的と背景**
（変更なし）

#### **1.2. 全体アーキテクチャ図 (To-Be)**

**PDF Generator (Cloud Function)は、標準の`puppeteer`パッケージを利用してPDFを生成する。**

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
| - Document AI連携によるテキスト抽出|                            | - 標準Puppeteerで安定動作       |
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
    2.  **標準の`puppeteer`** を使用して、デプロイパッケージに含まれるChromiumを起動する。
    3.  受け取ったHTMLをレンダリングし、A4サイズのPDFを生成する。
    4.  生成したPDFのバイナリデータをHTTPレスポンスとして返す。

---

### **3. 設計**

#### **3.1. Cloud FunctionsにおけるPuppeteerの構成**
*   **課題:** Cloud Functionsのようなステートレスな環境では、Puppeteerがデフォルトで期待する場所にChromeブラウザが存在せず、`Could not find Chrome`エラーが発生する。
*   **解決策:** プロジェクト内にPuppeteerの設定ファイル (`.puppeteerrc.cjs`) を配置する。
    *   このファイル内で、Puppeteerがブラウザをダウンロード・保存する`cacheDirectory`を、プロジェクトルートの`.puppeteer_cache`ディレクトリに指定する。
    *   これにより、`pnpm install`時に開発環境の所定の場所にブラウザがダウンロードされる。
    *   デプロイ時、この`.puppeteer_cache`ディレクトリがCloud Functionsのデプロイパッケージに同梱されるため、実行環境でもPuppeteerは確実にブラウザを見つけることができる。

---

### **4. 実行計画 (Plan of Action)**

**フェーズ1：Puppeteerの構成**
1.  **設定ファイルの作成:**
    *   `apps/pdf-generator`ディレクトリに`.puppeteerrc.cjs`を作成し、キャッシュディレクトリをプロジェクトルートの`.puppeteer_cache`に設定する。
2.  **依存関係の再インストール:**
    *   `apps/pdf-generator`ディレクトリで`pnpm install`を実行し、設定を適用してブラウザをダウンロードさせる。

**フェーズ2：Cloud Functionの再デプロイ**
1.  **デプロイコマンドの実行:**
    *   `apps/pdf-generator`ディレクトリで`pnpm run deploy`を実行し、安定化された新しいバージョンをデプロイする。

**フェーズ3：最終動作確認**
1.  デプロイが成功したCloud RunのURLにアクセスし、フロントエンドからPDFエクスポート機能を実行する。
2.  エラーが発生せず、PDFファイルが正常にダウンロードされることを確認し、プロジェクトを完了する。
