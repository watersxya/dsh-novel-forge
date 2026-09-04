/**
 * 题材规则库（可插拔）—— 漫剧分镜/提示词生成的「题材专用规则」。
 * 参考短剧工业导演规范：不同题材用不同的视觉语言 / 打斗 / 特效规则，
 * 按漫剧方案的 genre 注入 generateStoryboardPrompts，避免「一套模板跑所有题材」。
 * 每个题材给一组「生成提示词时必须遵守的题材规则」；未选题材则不注入（走通用规则）。
 */
export interface GenreRule {
    /** 题材 id。 */
    id: string;
    /** 题材名（展示）。 */
    label: string;
    /** 该题材的生成提示词核心规则（每行一条，注入生成时）。 */
    rules: string[];
}
/** 内置题材（通用题材 default 为空规则）。 */
export declare const GENRES: GenreRule[];
/** 通用题材（空规则，走通用生成）。 */
export declare const DEFAULT_GENRE: GenreRule;
/** 按题材 id 取规则（未找到返回通用）。 */
export declare function getGenreRules(id?: string): string[];
/** 取题材 label（展示用）。 */
export declare function getGenreLabel(id?: string): string;
