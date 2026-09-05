/**
 * 提示词共享常量与工具
 *
 * 所有 JSON 输出规则、通用约束集中在此，避免各阶段重复定义、互相打架。
 */
/** JSON 输出规则（所有要求模型输出 JSON 的地方共用） */
export declare const JSON_OUTPUT_RULES: string[];
/** JSON 输出规则的紧凑版（适合放在提示词末尾） */
export declare const JSON_OUTPUT_RULES_COMPACT: string;
/**
 * 估算 prompt 的 token 数（粗略估算，用于上下文预算控制）
 * 中文约 1.7 字/token，英文约 4 字符/token
 */
export declare function estimateTokens(text: string): number;
/**
 * 按 token 预算截断文本（保留开头，末尾加省略标记）
 * 用于控制单块上下文不超预算。
 */
export declare function truncateByTokens(text: string, maxTokens: number, marker?: string): string;
/** 通用「只改表达不改情节」约束（润色/局部修订共用） */
export declare const EXPRESSION_ONLY_RULE: string[];
/** 章节上下文各阶段的 token 预算（粗略，用于控制注入量） */
export declare const CONTEXT_BUDGET: {
    /** 章节生成：道藏+角色+大纲+事实+伏笔 */
    readonly writing: 12000;
    /** AI 审稿：道藏+角色+事实+正文 */
    readonly review: 10000;
    /** 修订：原意见+相关事实+目标正文 */
    readonly revise: 8000;
    /** 润色：风格资产+原正文 */
    readonly polish: 6000;
    /** 分章规划：大纲+道藏+角色+近期事实 */
    readonly plan: 15000;
};
export type ContextStage = keyof typeof CONTEXT_BUDGET;
