/**
 * dsh-novel-forge — host half. Mounts the AI novel-forge workbench: docx
 * outline import, LLM chapter planning, chapter-by-chapter generation
 * (3000-4000 chars each), Markdown output into your chosen folder, and the
 * /api/dsh-novel-forge route family. The browser half (./client) renders the
 * workbench panel. Everything rides official NPM SDK packages — no dsh source
 * changes.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from 'schemastery';
import type { ImageModelConfig, NovelConfig } from './protocol.ts';
/** Stable cordis plugin name. */
export declare const name = "novel-forge";
/** Services required before the novel-forge surfaces can mount. */
export declare const inject: string[];
/**
 * Settings namespace of the novel-forge capability — the section the web
 * settings surface edits. Spelled here rather than imported: the browser half
 * spells the same value and must not depend on a Host package.
 */
export declare const NOVEL_SETTINGS_NAMESPACE: "dsh-novel-forge";
/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
    /** When true (default), a system-prompt section announces the plugin to every agent. */
    announceToAgent?: boolean;
    /** Master switch for the plugin (routes, prompt section). */
    enabled?: boolean;
    /** Absolute path of the default docx outline to load. */
    outlinePath?: string;
    /** Absolute output directory for chapters + project state. */
    outputDir?: string;
    /** LLM provider route. */
    provider?: string;
    /** LLM model id. */
    model?: string;
    /** 任务级模型路由：正文生成模型（留空则跟随 model）。 */
    generateModel?: string;
    /** 任务级模型路由：审稿模型（留空则跟随 model）。 */
    reviewModel?: string;
    /** 任务级模型路由：AI 复核/质检模型（留空则跟随 model）。 */
    auditModel?: string;
    /** LLM reasoning effort (off/low/high/max). */
    reasoningEffort?: 'off' | 'low' | 'high' | 'max';
    /** 分析类任务（提炼/拆书/反推大纲等）的推理档位；默认 low。 */
    analysisReasoning?: 'off' | 'low' | 'high' | 'max';
    /** Target characters per chapter. */
    chapterChars?: number;
    /** Max output tokens per chapter call. */
    maxTokens?: number;
    /** Review pass threshold (0-100). */
    reviewPassScore?: number;
    /** Whether generation auto-runs review after writing. */
    autoReview?: boolean;
    /** Whether generation auto-runs the author review (hook/continuity/trend). */
    autoAuthorReview?: boolean;
    /** 修订/润色产出草稿后自动附带一次 AI 审查（默认开，可在设置页关闭省 token）。 */
    autoReviewAfterRevise?: boolean;
    /** 生图模型库（多套并存，启用一条生效）。 */
    imageModels?: ImageModelConfig[];
    /** 豆包/Seedream 生图 API Key（旧字段，兼容迁移用）。 */
    imageApiKey?: string;
    /** 豆包/Seedream 生图模型 ID（旧字段，兼容迁移用）。 */
    imageApiModel?: string;
    /** 是否启用豆包生图（旧字段，兼容迁移用）。 */
    imageApiEnabled?: boolean;
    /** 自定义背景图（URL / dataURL / 服务端路径引用）。 */
    themeBackground?: string;
    /** 自定义背景遮罩/模糊强度 0-80。 */
    themeBackgroundBlur?: number;
    /** 玻璃透明度 0-100（100=当前原样）。 */
    themeOpacity?: number;
    /** 是否启用改编模式（默认关闭）。 */
    enableAdaptMode?: boolean;
}
export declare const Config: z<Config>;
/** Model-facing announcement: plugin presence, capabilities, and limits. */
export declare const NOVEL_GUIDANCE = "\u672C\u673A\u5DF2\u5B89\u88C5 dsh-novel-forge \u63D2\u4EF6\uFF08AI \u7F16\u8BD1\u5C0F\u8BF4\u5DE5\u4F5C\u53F0\uFF09\uFF1A\u4FA7\u8FB9\u680F\u300C\u5C0F\u8BF4\u5DE5\u574A\u300D\u5165\u53E3\u3002\u80FD\u529B\uFF1A\u8BFB\u53D6 docx \u5927\u7EB2\u6216\u7C98\u8D34\u5927\u7EB2\u6587\u672C\uFF1B\u7528 LLM \u63D0\u70BC\u9053\u85CF\uFF08\u4EBA\u8BBE/\u4E16\u754C\u89C2/\u91D1\u624B\u6307\u89C4\u5219/\u5199\u4F5C\u7EA2\u7EBF\uFF09\uFF1B\u751F\u6210\u5377\u8BA1\u5212\u4E0E\u7AE0\u8282\u8BA1\u5212\uFF1B\u9010\u7AE0\u8C03\u7528 LLM \u751F\u6210 3000-4000 \u5B57\u6B63\u6587\u5E76\u4FDD\u5B58\u4E3A Markdown\uFF08\u9ED8\u8BA4\u8F93\u51FA\u5230\u7528\u6237\u4E3B\u76EE\u5F55 ~/.dsh/novels\uFF09\uFF1B\u6BCF\u7AE0\u81EA\u52A8\u751F\u6210\u6458\u8981\uFF08\u53D9\u4E8B\u8BB0\u5FC6\uFF09\u3001\u81EA\u52A8 AI \u5BA1\u7A3F\uFF08\u4EBA\u8BBE/\u8BBE\u5B9A/\u7EA2\u7EBF/\u6587\u7B14/\u723D\u70B9/\u903B\u8F91\uFF09\uFF0C\u652F\u6301\u6309\u5BA1\u7A3F\u610F\u89C1\u91CD\u5199\u3001\u53BB AI \u5473\u6DA6\u8272\u3001\u6697\u7EBF\uFF08\u4F0F\u7B14\uFF09\u7BA1\u7406\u3001\u6279\u91CF\u8FDE\u5199\u4E0E\u5168\u672C\u5BFC\u51FA\uFF08txt/md\uFF09\u3002\u9650\u5236\uFF1A\u751F\u6210\u6D88\u8017 LLM API \u989D\u5EA6\uFF1B\u8F93\u51FA\u76EE\u5F55\u4E0E\u6A21\u578B\u53EF\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u4FEE\u6539\uFF1B\u7AE0\u8282\u6B63\u6587\u8D28\u91CF\u53D6\u51B3\u4E8E\u5927\u7EB2\u5B8C\u6574\u5EA6\u3002\u7528\u6237\u63D0\u5230\u300C\u5C0F\u8BF4 / \u5927\u7EB2 / \u5199\u5C0F\u8BF4 / \u7AE0\u8282 / \u5BA1\u7A3F / \u6DA6\u8272\u300D\u65F6\u5373\u6307\u672C\u63D2\u4EF6\uFF0C\u8BF7\u636E\u6B64\u534F\u4F5C\u3002";
/** Resolve a config-like value into the full runtime config. */
export declare function resolveConfig(value: Partial<Config> | undefined): NovelConfig;
/**
 * Mount the routes and announcement.
 * @param ctx - host plugin context carrying webServer/llm/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export declare function apply(ctx: Context, config?: Config): void;
