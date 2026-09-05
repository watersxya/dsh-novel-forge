import type { NovelApi } from '../api.ts';
/** 开书向导页。 */
export declare function CreateBookView({ api, onBack, onCreated, }: {
    api: NovelApi;
    /** 返回书架。 */
    onBack: () => void;
    /** 开书成功：进入新书工作台。 */
    onCreated: (id: string) => void;
}): any;
