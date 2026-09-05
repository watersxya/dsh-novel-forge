import type { NovelApi } from '../api.ts';
import type { ProjectState } from '../../protocol.ts';
export declare function ReaderView({ api, project, onBack, onOpenWorkspace, }: {
    api: NovelApi;
    project: ProjectState;
    onBack: () => void;
    onOpenWorkspace: () => void;
}): any;
