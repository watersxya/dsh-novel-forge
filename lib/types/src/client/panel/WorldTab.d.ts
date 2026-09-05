import type { NovelApi } from '../api.ts';
import type { WorldState } from '../../protocol.ts';
/** 大世界页签。 */
export declare function WorldTab({ api, world, onChanged, }: {
    api: NovelApi;
    /** 当前项目的大世界数据（可能为空）。 */
    world: WorldState | undefined;
    /** 保存/提炼成功后由父组件刷新项目状态。 */
    onChanged: (world: WorldState) => void;
}): any;
