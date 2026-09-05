import type { NovelApi } from '../api.ts';
/** 开书向导页。 */
export declare function CreateBookView({ api, onBack, onCreated, initialIdea, initialName, }: {
    api: NovelApi;
    /** 返回书架。 */
    onBack: () => void;
    /** 开书成功：进入新书工作台。 */
    onCreated: (id: string) => void;
    /** 从「创意灵感」带过来的起步想法（预填到「一句话想法」输入框）。 */
    initialIdea?: string;
    /** 从「创意灵感」带过来的初始书名。 */
    initialName?: string;
}): any;
