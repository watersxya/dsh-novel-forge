import type { NovelApi } from '../api.ts';
import type { ImageModelConfig, ProjectState } from '../../protocol.ts';
export declare function MangaRoleLibrary({ api, project, refresh, styleId, filterId, focus, showCards, chapterNo: externalChapter, onProgress, }: {
    api: NovelApi;
    project: ProjectState | null;
    refresh: () => void | Promise<void>;
    styleId?: string;
    filterId?: string;
    /** 是否启用生图（豆包等出定妆图）。 */
    imageApiEnabled?: boolean;
    /** 生图模型库（出定妆图时可选择用哪条）。 */
    imageModels?: ImageModelConfig[];
    /** 步骤页聚焦：import=展开并滚动到导入区；cards=滚动到已建漫剧卡列表。 */
    focus?: 'import' | 'cards';
    /** 是否显示「已建漫剧卡」列表（第⑤步导入页可隐藏，只留导入区）。 */
    showCards?: boolean;
    /** 全局当前章节（从工作台顶部导航条传入）。 */
    chapterNo?: number | null;
    onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void;
}): any;
