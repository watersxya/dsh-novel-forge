import type { Context } from '@deepseek-ai/cordis';
import type { NovelConfig, RunState } from './protocol.ts';
export declare class ProductionRunner {
    private deps;
    private state;
    private working;
    private pauseRequested;
    private stopRequested;
    /** 生产单绑定目录（start 时快照；所有读写固定用它，防止运行中切书导致写错目录）。 */
    private bookDir;
    constructor(deps: {
        ctx: Context;
        getConfig: () => NovelConfig;
    });
    /** 当前生产单状态（内存优先；web 重启后从磁盘恢复）。 */
    status(): RunState | null;
    private persist;
    private log;
    /** 启动/续跑生产单：startNo..endNo 区间，endNo 超出计划时先自动补计划。 */
    start(startNo: number, endNo: number, runDir?: string): Promise<RunState>;
    pause(): void;
    resume(): void;
    stop(): void;
    /** 主循环：从 currentNo 扫描到 endNo，逐章处理；支持暂停/停止。 */
    private loop;
    private processChapter;
    /** 完整质量门：生成 → 摘要+事实 → 伏笔标记 → 审稿 → 作者复盘。 */
    private produce;
    /** 被拒分级处理：无 high 豁免；有 high 按意见修订（最多 2 轮）+ 验证模式；仍不过 → 待人工。 */
    private handleRejected;
    private applyDraft;
}
