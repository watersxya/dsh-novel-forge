import type { NovelApi } from '../api.ts';
import type { ChapterPlan, ProjectState } from '../../protocol.ts';
export declare function StoryboardTab({ api, project, chapters, onProjectChanged, styleId, filterId, mode, onGoStep, onProgress, }: {
    api: NovelApi;
    project: ProjectState | null;
    chapters: ChapterPlan[];
    /** 生成成功且已持久化后触发（刷新项目，切章/重进可恢复）。 */
    onProjectChanged?: () => void | Promise<void>;
    /** 漫剧基底风格 id（画面措辞随风格）。 */
    styleId?: string;
    /** 可选滤镜风格 id。 */
    filterId?: string;
    /** 页面模式：auto=按本章实际进度显示；skeleton/table/prompts=固定显示该步骤（前置不足显示提示，不降级）。 */
    mode?: 'auto' | 'skeleton' | 'table' | 'prompts';
    /** 「下一步」按钮回调（1=骨架→2=分镜表→3=提示词），供外层切步骤页。 */
    onGoStep?: (n: 1 | 2 | 3) => void;
    /** 上报到「AI进度」控制台（分镜三步生成）。 */
    onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void;
}): any;
