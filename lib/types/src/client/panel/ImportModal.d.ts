import type { NovelApi } from '../api.ts';
export declare function ImportModal({ api, onClose, onImported, }: {
    api: NovelApi;
    onClose: () => void;
    /** 导入成功并已激活该书后回调（刷新书架）。 */
    onImported: () => void | Promise<void>;
}): any;
