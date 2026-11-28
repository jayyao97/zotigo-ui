import type { HostHeaderInput } from "./hostHeaders";
export interface HostProfile { id: string; name: string; baseUrl: string; hasToken: boolean; headerNames?: string[]; }
export interface HostInput { id?: string; name: string; baseUrl: string; token?: string; headers?: HostHeaderInput[]; }
