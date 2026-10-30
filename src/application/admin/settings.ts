export const DEEPSEEK_MODELS = ["deepseek-flash", "deepseek-v4-pro"] as const;
export type DeepSeekModel = (typeof DEEPSEEK_MODELS)[number];
export const DEFAULT_DEEPSEEK_MODEL: DeepSeekModel = "deepseek-flash";

export interface AdminSettings {
  readonly model: DeepSeekModel;
}

export interface AdminSettingsStore {
  get(): Promise<AdminSettings>;
  set(settings: AdminSettings): Promise<AdminSettings>;
}
