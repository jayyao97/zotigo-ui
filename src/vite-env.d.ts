/// <reference types="vite/client" />

import type { ClientApi } from "../shared/clientTypes";

declare global {
  interface Window {
    zotigo?: ClientApi;
  }
}
