import type { NovelApi } from '../api.ts';
/** 目录不可用时回退的内置预设（历史行为）。 */
export declare const FALLBACK_MODEL_PRESETS: readonly ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"];
export interface ModelPickerProps {
    api: NovelApi;
    provider: string;
    model: string;
    onProvider: (provider: string) => void;
    onModel: (model: string) => void;
}
export declare function ModelPicker({ api, provider, model, onProvider, onModel }: ModelPickerProps): JSX.Element;
