import type { NovelApi } from '../api.ts';
import type { BookshelfSnapshot } from '../../protocol.ts';
/** Props. */
export interface BookshelfBarProps {
    api: NovelApi;
    shelf: BookshelfSnapshot;
    /** 刷新整个面板（切换书后重新拉状态）。 */
    onSwitch: () => void;
}
/** 书架条。 */
export declare function BookshelfBar({ api, shelf, onSwitch }: BookshelfBarProps): any;
