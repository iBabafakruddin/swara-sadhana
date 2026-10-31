/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RETENTION_HOURS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
