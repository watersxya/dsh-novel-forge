/**
 * 官方提示模板注册表（对齐上游 officialTemplates.ts 的轻量版）。
 *
 * 目标：把高频提示词从内联字符串升级为「可定位、可版本化、可诊断缺组」的资产，
 * 同时保留 writeSystemPrompt 的现有大段上下文注入（道藏/世界观/大纲/资产/伏笔/剧情线），
 * 只在其基础上补充「官方渲染骨架」的必达/禁止/自查块。
 */
export interface OfficialTemplate {
    id: string;
    version: string;
    /** 需要的 slot 变量（跨层注入点）。 */
    slots: string[];
    /** 需要的上下文分组（缺组时可诊断）。 */
    contextGroups: string[];
    /** system 提示模板（可用 {{slot.*}} 占位，运行时替换）。 */
    system: string[];
    /** human 提示模板（可用 {{context.*}} / {{input.*}} 占位）。 */
    human: string[];
}
export declare const OFFICIAL_TEMPLATES: Record<string, OfficialTemplate>;
export declare function getOfficialPromptTemplate(id: string): OfficialTemplate | null;
export declare function getOfficialPromptTemplateVersion(id: string): string | null;
/** 轻量稳定哈希（与上游 sha1 对齐精神：内容变化→版本变化）。 */
export declare function hashPromptTemplate(id: string): string;
export declare function getRequiredTemplateContextGroups(id: string): string[];
/** 把官方 writer 骨架渲染成可附加到现有系统提示词末尾的约束/自查块。 */
export declare function renderOfficialChapterWriterSkeleton(meta: {
    targetChars: number;
    minChars: number;
    maxChars: number;
    pov?: string;
    tonePreference?: string;
    endingHookPreference?: string;
    antiAiRules?: string;
}): string;
