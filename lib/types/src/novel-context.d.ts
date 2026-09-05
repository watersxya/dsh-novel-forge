/**
 * 统一上下文组装与相关设定检索
 *
 * 取代各阶段各自拼装 prompt，消除「生成看得到、审稿看不到」的断层。
 * 所有阶段通过 buildChapterContext 获取同一来源的事实与设定。
 */
import type { ProjectState, ChapterPlan, StoryBible, RoleRecord, ChapterFact, Foreshadow, Plotline } from './protocol';
export interface ChapterContext {
    /** 平台合规红线（永远全量） */
    complianceRedLines: string[];
    /** 本书写作红线（永远全量） */
    bookRedLines: string[];
    /** 当前章相关角色卡（全量信息） */
    relevantRoles: Array<{
        name: string;
        role: string;
        traits: string[];
        goals?: string;
        knowledge?: string[];
    }>;
    /** 当前章相关道藏规则 */
    relevantWorldRules: string[];
    /** 活跃剧情线 */
    activePlotlines: Plotline[];
    /** 未回收伏笔 */
    activeForeshadows: Foreshadow[];
    /** 上一章结尾原文 */
    prevChapterTail: string;
    /** 上一章摘要 */
    prevChapterSummary?: string;
    /** 最近事实（近因记忆，top20） */
    recentFacts: string[];
    /** 相关旧事实（按本章 beats 检索，top15） */
    relatedFacts: string[];
    /** 当前卷大纲 */
    currentVolumeOutline: string;
    /** 本章 beats */
    beats: string;
    /** 本章标题 */
    chapterTitle: string;
}
export interface ContextBuildOptions {
    /** 阶段：writing/review/revise/polish/plan */
    stage?: 'writing' | 'review' | 'revise' | 'polish' | 'plan';
    /** 是否注入完整角色卡（false 时只注入角色名+定位） */
    fullRoleCards?: boolean;
    /** 相关事实检索上限 */
    relatedFactsLimit?: number;
    /** 最近事实数量 */
    recentFactsLimit?: number;
}
/**
 * 相关事实检索：trigram 重合度 + 角色名命中加权 + 近因加权
 * 从 generateChapterStream 抽取，扩展为通用函数。
 */
export declare function retrieveRelatedFacts(facts: ChapterFact[], beatsText: string, roleNames: string[], limit?: number): string[];
/**
 * 相关角色检索：beats 中出现的角色 + 主角/主要反派永远全量
 */
export declare function retrieveRelevantRoles(bible: StoryBible | undefined, roles: RoleRecord[] | undefined, beatsText: string): ChapterContext['relevantRoles'];
/**
 * 构建章节统一上下文
 *
 * 各阶段调用此函数获取同一来源的事实与设定，消除上下文断层。
 * 检索结果不足时自动回退全量，保证不丢失关键信息。
 */
export declare function buildChapterContext(project: ProjectState, chapter: ChapterPlan, outputDir: string, options?: ContextBuildOptions): ChapterContext;
/**
 * 将上下文渲染为 prompt 文本块
 * 各阶段可按需选择注入哪些块。
 */
export declare function renderContextBlocks(ctx: ChapterContext): {
    rolesBlock: string;
    worldRulesBlock: string;
    factsBlock: string;
    plotlinesBlock: string;
    foreshadowsBlock: string;
    continuityBlock: string;
    redLinesBlock: string;
};
