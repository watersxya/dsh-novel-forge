/**
 * Writing assets — 题材基底库 / 推进模式库 / 反 AI 规则 / 写法引擎.
 *
 * Ported from AI-Novel-Writing-Assistant (Apache-2.0) built-in seed data:
 * - 8 preset style templates (DEFAULT_STYLE_TEMPLATES)
 * - 12 anti-AI rules with concrete detect patterns (DEFAULT_ANTI_AI_RULES)
 * - genre tree + progression mode seeds
 * Assets persist with the project (novel-project.json) and are injected into
 * generation / planning / review prompts, and available to the AI assistant.
 */
import type { AntiAiRule, GenreNode, PlotBeatTemplate, ProgressionMode, ProjectAssets, StyleAsset, StyleTemplate } from './protocol.ts';
/** 预置写法模板（来自 AI-Novel-Writing-Assistant 内置 DEFAULT_STYLE_TEMPLATES）。 */
export declare const BUILTIN_STYLE_TEMPLATES: StyleTemplate[];
/** 内置全局反 AI 规则（来自 AI-Novel-Writing-Assistant 内置 DEFAULT_ANTI_AI_RULES）。 */
export declare const BUILTIN_ANTI_AI_RULES: AntiAiRule[];
/** 内置题材基底库（常用网文题材树，跨书复用）。 */
export declare const BUILTIN_GENRE_LIBRARY: GenreNode[];
/** 内置常用推进模式。 */
export declare const BUILTIN_PROGRESSION_MODES: ProgressionMode[];
/** 剧情桥段库：可复用情节套路（作者阅读经验沉淀，非某本书的剧情线）。 */
export declare const BUILTIN_PLOT_BEATS: PlotBeatTemplate[];
/** 默认（空）项目写作资产。 */
export declare function emptyProjectAssets(): ProjectAssets;
/** 合并项目资产与内置库：返回「生效的反 AI 规则」（内置全局 + 项目自定义）。 */
export declare function effectiveAntiAiRules(assets: ProjectAssets | undefined): AntiAiRule[];
/** 把生效规则渲染成提示词块（压缩：avoid/fix 截断，省 token）。 */
export declare function renderAntiAiRules(assets: ProjectAssets | undefined): string;
/** 渲染题材与推进模式提示词块。 */
export declare function renderGenreAndProgression(assets: ProjectAssets | undefined): string;
/** 渲染写法资产提示词块（规则去重，省 token）。 */
export declare function renderStyleAssets(assets: ProjectAssets | undefined): string;
/** 渲染全部写作资产提示词（供生成/规划/审稿注入）。 */
export declare function renderAllAssets(assets: ProjectAssets | undefined): string;
/** 预置写法模板 → 可直接绑定的 StyleAsset。 */
export declare function styleTemplateToAsset(template: StyleTemplate): StyleAsset;
/** 写法引擎：从样本文本提取风格资产的系统提示词。 */
export declare function styleEngineSystemPrompt(): string;
