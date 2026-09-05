import type { NovelApi } from '../api.ts';
/** Props. */
export interface AssetsTabProps {
    api: NovelApi;
    /** 初始子页（左侧导航直达对应资产分类）。 */
    initialTab?: AssetSubTab;
}
/** 写作资产子页签。 */
type AssetSubTab = 'genre' | 'progression' | 'templates' | 'rules' | 'style';
/** 写作资产页签。 */
export declare function AssetsTab({ api, initialTab }: AssetsTabProps): any;
export {};
