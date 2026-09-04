import type { NovelApi } from '../api.ts';
import type { ProjectState } from '../../protocol.ts';
export declare function SceneLibrary({ api, project, refresh, styleId, filterId, chapterNo: externalChapter, onProgress, }: {
    api: NovelApi;
    project: ProjectState | null;
    /** 场景库变更已持久化后触发（刷新项目）。 */
    refresh: () => void | Promise<void>;
    /** 提炼场景时的漫剧基底风格 id（提示词按方案风格措辞）。 */
    styleId?: string;
    /** 可选滤镜风格 id。 */
    filterId?: string;
    /** 全局当前章节（从工作台顶部导航条传入）。 */
    chapterNo?: number | null;
    /** 上报到「AI进度」控制台。 */
    onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void;
}): import("react").JSX.Element;
