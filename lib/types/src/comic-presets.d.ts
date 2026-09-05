/** 漫画风格预设：每个预设对应一组出图提示词与排版偏好。 */
export interface ComicStylePreset {
    id: string;
    label: string;
    /** 注入 imagePrompt 的风格描述词。 */
    prompt: string;
    /** 可选：排版偏好说明。 */
    layoutHint?: string;
}
export declare const COMIC_STYLE_PRESETS: ComicStylePreset[];
export declare function getComicStylePrompt(styleId?: string): string;
export declare function getComicStyleLabel(styleId?: string): string;
