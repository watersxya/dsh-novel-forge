/**
 * 审稿规则注册表
 *
 * 生成用 compact 模式（核心规则），审稿用 full 模式（全部规则），
 * 消除 reviewSystemPrompt 内嵌规则与 renderAllAssets() 两套打架的问题。
 */
/** 通用写作资产规则（兼容 ProjectAssets 中的各类规则） */
export interface WritingRule {
    name: string;
    description: string;
    type?: string;
    enabled?: boolean;
}
export interface ReviewRule {
    id: string;
    /** 规则维度 */
    dimension: 'character' | 'setting' | 'redline' | 'writing' | 'pacing' | 'logic' | 'anti-ai' | 'presentation' | 'compliance';
    /** 严重度 */
    severity: 'high' | 'medium' | 'low';
    /** 规则类型：forbidden=禁止类（命中即问题），encourage=鼓励类（不命中不算错） */
    type: 'forbidden' | 'encourage';
    /** 规则描述 */
    description: string;
    /** 是否启用 */
    enabled: boolean;
    /** 作用域 */
    scope: Array<'writing' | 'review' | 'polish' | 'all'>;
}
/** 内置审稿维度（结构化评分用） */
export declare const REVIEW_DIMENSIONS: readonly [{
    readonly id: "character";
    readonly name: "人设一致性";
    readonly weight: 0.2;
}, {
    readonly id: "setting";
    readonly name: "设定一致性";
    readonly weight: 0.15;
}, {
    readonly id: "redline";
    readonly name: "红线检查";
    readonly weight: 0.15;
}, {
    readonly id: "writing";
    readonly name: "文笔质量";
    readonly weight: 0.15;
}, {
    readonly id: "pacing";
    readonly name: "节奏与爽点";
    readonly weight: 0.1;
}, {
    readonly id: "logic";
    readonly name: "逻辑漏洞";
    readonly weight: 0.1;
}, {
    readonly id: "anti-ai";
    readonly name: "反 AI 规则";
    readonly weight: 0.05;
}, {
    readonly id: "presentation";
    readonly name: "呈现方式";
    readonly weight: 0.05;
}, {
    readonly id: "compliance";
    readonly name: "内容合规";
    readonly weight: 0.05;
}];
export type ReviewDimensionId = typeof REVIEW_DIMENSIONS[number]['id'];
/** 维度结构化评分 */
export interface DimensionScore {
    dimension: ReviewDimensionId;
    score: number;
    note: string;
}
/**
 * 渲染审稿规则（compact 或 full 模式）
 *
 * compact: 只渲染禁止类 + high 严重度（用于生成时的约束）
 * full: 渲染全部启用规则（用于审稿时的检查清单）
 */
export declare function renderReviewRules(assets: WritingRule[] | undefined, mode?: 'compact' | 'full'): string;
/**
 * 从审稿 issues 中按维度统计
 * 用于结构化评分和 UI 展示。
 */
export declare function groupIssuesByDimension(issues: Array<{
    severity: string;
    item: string;
    dimension?: string;
}>): Record<string, Array<{
    severity: string;
    item: string;
}>>;
/**
 * 计算维度加权总分
 * 用于审稿报告的结构化评分。
 */
export declare function calculateWeightedScore(dimensions: DimensionScore[]): number;
