/**
 * 漫剧工作台·全流程步骤条（唯一导航，方案X）：
 * ①创建方案 → ②一键生成 → ③分镜 → ④角色定妆 → ⑤场景底图 → ⑥导出使用。
 * 每个步骤对应一个独立页面主体；完成度自动判定（读 project 现有字段）。
 */
import type { ProjectState } from '../../protocol.ts';
/** 步骤 → 页面主体的一一对应目标。 */
export type FlowTarget = 'plan' | 'rules' | 'skeleton' | 'table' | 'import' | 'makeup' | 'prompts' | 'scenes' | 'props' | 'export';
export interface FlowStep {
    no: number;
    label: string;
    hint: string;
    done: boolean;
    target: FlowTarget;
}
/** 依据 project 数据计算 6 步完成度（与存储顺序无关，按生产顺序排列）。 */
export declare function computeFlowSteps(project: ProjectState | null, exported?: boolean): FlowStep[];
export declare function FlowGuide({ project, onNavigate, exported, }: {
    project: ProjectState | null;
    onNavigate: (target: FlowTarget) => void;
    exported?: boolean;
}): any;
