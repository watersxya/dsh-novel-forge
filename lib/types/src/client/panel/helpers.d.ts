/**
 * Tiny translation helper for the panel: reads the zh dict with the en dict
 * as fallback (the family plugins use a full locale registry; the panel keeps
 * a dependency-free helper so the client bundle stays self-contained).
 */
import { type NovelKey } from '../locales.ts';
/** Translate one key with optional {placeholder} substitution. */
export declare function tt(key: NovelKey, params?: Record<string, string | number>): string;
/** 角色定位中文名（角色库/提炼候选共用，收敛自多份复制）。 */
export declare const ROLE_LABELS: Record<string, string>;
/** 角色定位徽章颜色。 */
export declare function roleColor(label: string): string;
/** 剧情线类型中文名（与 locale 对齐）。 */
export declare function kindLabel(kind: string): string;
/** 剧情线状态中文名。 */
export declare function plotlineStatusLabel(status: string): string;
/** 剧情线状态颜色。 */
export declare function plotlineStatusColor(status: string): string;
