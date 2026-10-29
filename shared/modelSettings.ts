export interface ModelProfile {
  name: string;
  provider: string;
  model: string;
  base_url: string;
  thinking_level: string;
  context_window: number;
  max_output_tokens: number | null;
  mode: string;
  has_api_key: boolean;
  default_max_output_tokens?: number;
}
export interface ModelSettings {
  defaults?: {context_window: number; max_output_tokens: number};
  revision: string;
  default_profile: string;
  profiles: ModelProfile[];
}
export interface ModelSettingsChange {
  revision: string;
  action: "create" | "save" | "delete" | "default";
  profile: ModelProfile;
  api_key?: string;
}
export interface ModelTestResult {
  ok: boolean;
  reason?: "authentication" | "quota" | "model" | "timeout" | "connection";
}

export function parseModelSettings(value: unknown): ModelSettings {
  if (!value || typeof value !== "object") throw new Error("Invalid model settings response");
  const data = value as ModelSettings;
  if (typeof data.revision !== "string" || typeof data.default_profile !== "string" || !Array.isArray(data.profiles)) throw new Error("Invalid model settings response");
  if (data.defaults && (!Number.isInteger(data.defaults.context_window) || data.defaults.context_window <= 0 || !Number.isInteger(data.defaults.max_output_tokens) || data.defaults.max_output_tokens <= 0)) throw new Error("Invalid model defaults");
  for (const p of data.profiles) {
    if (p?.default_max_output_tokens !== undefined && (!Number.isInteger(p.default_max_output_tokens) || p.default_max_output_tokens <= 0)) throw new Error("Invalid profile default");
    if (!p || [p.name,p.provider,p.model,p.base_url,p.thinking_level,p.mode].some(v => typeof v !== "string") || typeof p.has_api_key !== "boolean" || !Number.isInteger(p.context_window) || (p.max_output_tokens !== null && !Number.isInteger(p.max_output_tokens))) throw new Error("Invalid model profile response");
  }
  return data;
}

export function parseModelSettingsChange(value: unknown): ModelSettingsChange {
  if (!value || typeof value !== "object") throw new Error("Invalid model settings request");
  const data = value as ModelSettingsChange;
  parseModelSettings({revision:data.revision,default_profile:"",profiles:[data.profile]});
  if (!["create","save","delete","default"].includes(data.action) || (data.api_key !== undefined && typeof data.api_key !== "string")) throw new Error("Invalid model settings request");
  // Forward only declared fields; never accept arbitrary daemon configuration.
  const p=data.profile;
  return {revision:data.revision,action:data.action,profile:{name:p.name,provider:p.provider,model:p.model,base_url:p.base_url,thinking_level:p.thinking_level,context_window:p.context_window,max_output_tokens:p.max_output_tokens,mode:p.mode,has_api_key:p.has_api_key},...(data.api_key === undefined ? {} : {api_key:data.api_key})};
}
