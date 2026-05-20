/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CMS_PROVIDER?: string;
  readonly VITE_CMS_URL?: string;
  readonly VITE_CMS_TOKEN?: string;
  readonly VITE_CMS_CACHE_TTL_MS?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_ENABLE_LOCAL_ADMIN_API?: string;
  readonly VITE_ADMIN_API_BASE?: string;
  readonly VITE_ADMIN_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
