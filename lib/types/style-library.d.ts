/**
 * 风格库（内置模板）：漫剧方案的视觉基底 + 可叠加滤镜。
 * 关键词针对即梦 Seedream 优化：画风定义 + 质感描述 + 光影色彩 + 即梦质量词（8K/五官清晰/真实材质）。
 */
export type StyleCategory = '3d' | 'game' | '2d' | 'craft' | 'film';
export interface ArtStyle {
    id: string;
    /** 风格名（用户可见）。 */
    name: string;
    category: StyleCategory;
    /** 特点一句话（卡片展示）。 */
    traits: string;
    /** 风格关键词/前缀（生成角色图/视频提示词时套用）。 */
    keywords: string;
    /** 是否可作为滤镜叠加在基底风格之上（影视实验类；缺省 false）。 */
    stackable?: boolean;
    /** 默认推荐排序权重（0-1，推荐池排序参考）。 */
    weight?: number;
}
export declare const STYLE_CATEGORIES: ReadonlyArray<{
    id: StyleCategory;
    label: string;
    icon: string;
    desc: string;
}>;
/** 内置风格模板（基底 21 个 + 滤镜 3 个）。 */
export declare const STYLE_LIBRARY: ArtStyle[];
/** 按分类取风格。 */
export declare function stylesByCategory(category: StyleCategory): ArtStyle[];
/** 取单个风格（未找到返回 undefined）。 */
export declare function findStyle(id: string): ArtStyle | undefined;
/** 按基底 + 滤镜拼接风格关键词（角色图/分镜/视频提示词共用；缺省回退 3D 动漫）。 */
export declare function styleKeywords(styleId?: string, filterId?: string): string;
