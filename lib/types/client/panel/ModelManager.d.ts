import type { NovelApi } from '../api.ts';
import type { SavedModel } from '../../protocol.ts';
/** 目录不可用时回退的内置预设（历史行为）。 */
export declare const FALLBACK_MODEL_PRESETS: readonly ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"];
export interface ModelManagerProps {
    api: NovelApi;
    provider: string;
    model: string;
    savedModels: SavedModel[];
    onProvider: (provider: string) => void;
    onModel: (model: string) => void;
    onSavedModels: (models: SavedModel[]) => void;
}
export declare function ModelManager({ api, provider, model, onProvider, onModel }: ModelManagerProps): JSX.Element;
