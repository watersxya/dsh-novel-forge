import type { NovelApi } from '../api.ts';
import type { ProjectState } from '../../protocol.ts';
export declare function PropLibrary({ api, project, refresh, onProgress, }: {
    api: NovelApi;
    project: ProjectState | null;
    refresh: () => void | Promise<void>;
    onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void;
}): any;
