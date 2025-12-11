/**
 * 環境判定・設定ユーティリティ
 */

export interface EnvironmentConfig {
  name: string;
  showEngineControl: boolean;
  showProcessingModeSelection: boolean;
  defaultEngine: 'pdf-parse' | 'document-ai';
  allowEngineSelection: boolean;
}

/**
 * 現在の環境を判定
 */
export function getCurrentEnvironment(): EnvironmentConfig {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
  const showEngineControl = import.meta.env.VITE_SHOW_ENGINE_CONTROL === 'true';
  
  // URLベースでの環境判定
  if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
    return {
      name: 'development',
      showEngineControl: true, // 開発環境では常に表示
      showProcessingModeSelection: true, // 開発環境では処理モード選択可能
      defaultEngine: 'document-ai',
      allowEngineSelection: true
    };
  }
  
  // Staging環境（特定のドメインまたは環境変数で判定）
  if (apiUrl.includes('staging') || apiUrl.includes('test')) {
    return {
      name: 'staging',
      showEngineControl: false,
      showProcessingModeSelection: false, // ステージングでは処理モード選択なし
      defaultEngine: 'pdf-parse', // ステージングは通常モード
      allowEngineSelection: false
    };
  }
  
  // 本番環境（デフォルト）
  return {
    name: 'production',
    showEngineControl: showEngineControl, // 環境変数で制御
    showProcessingModeSelection: import.meta.env.VITE_SHOW_PROCESSING_MODE_SELECTION === 'true', // 環境変数で制御
    defaultEngine: 'pdf-parse', // 本番は通常モード
    allowEngineSelection: false
  };
}

/**
 * 開発環境かどうかを判定
 */
export function isDevelopment(): boolean {
  return getCurrentEnvironment().name === 'development';
}

/**
 * エンジン制御UIを表示するかどうか
 */
export function shouldShowEngineControl(): boolean {
  return getCurrentEnvironment().showEngineControl;
}

/**
 * エンジン選択を許可するかどうか
 */
export function allowEngineSelection(): boolean {
  return getCurrentEnvironment().allowEngineSelection;
}

/**
 * デフォルトエンジンを取得
 */
export function getDefaultEngine(): 'pdf-parse' | 'document-ai' {
  return getCurrentEnvironment().defaultEngine;
}

/**
 * 処理モード選択UIを表示するかどうか
 */
export function shouldShowProcessingModeSelection(): boolean {
  return getCurrentEnvironment().showProcessingModeSelection;
} 