/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SHOW_ENGINE_CONTROL: string
  readonly VITE_SHOW_PROCESSING_MODE_SELECTION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 