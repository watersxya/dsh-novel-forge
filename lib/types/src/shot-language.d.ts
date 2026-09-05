/**
 * 镜头语言词库（分镜规范化基准）。
 * 分镜表的 shot/camera/composition/light 字段统一从这里取值（英文 id），
 * 生成提示词时用 zh 中文词块；适配英文平台时用 en。
 * 目的：让"景别/运镜/构图/光效"有标准词表，避免 LLM 自由发挥导致漂移。
 */
/** 景别。 */
export type ShotSizeId = 'extreme_wide' | 'wide' | 'full' | 'medium' | 'medium_close' | 'close' | 'extreme_close' | 'big_extreme_close';
/** 运镜/机位。 */
export type CameraMoveId = 'static' | 'dolly_in' | 'dolly_out' | 'pan_left' | 'pan_right' | 'track_left' | 'track_right' | 'follow' | 'pedestal_up' | 'pedestal_down' | 'orbit' | 'handheld' | 'low_angle' | 'high_angle' | 'over_shoulder';
/** 构图。 */
export type CompositionId = 'rule_of_thirds' | 'center' | 'leading_line' | 'foreground' | 'low' | 'overhead' | 'symmetry';
/** 光效。 */
export type LightingId = 'front' | 'side' | 'back' | 'top' | 'rembrandt' | 'neon' | 'hard' | 'soft' | 'mood' | 'contrast';
export interface ShotLangEntry<T extends string> {
    id: T;
    /** 中文（提示词/展示用）。 */
    zh: string;
    /** 英文（英文平台适配用）。 */
    en: string;
    /** 一句话说明（下拉/卡片）。 */
    hint: string;
}
export declare const SHOT_SIZES: readonly ShotLangEntry<ShotSizeId>[];
export declare const CAMERA_MOVES: readonly ShotLangEntry<CameraMoveId>[];
export declare const COMPOSITIONS: readonly ShotLangEntry<CompositionId>[];
export declare const LIGHTINGS: readonly ShotLangEntry<LightingId>[];
export interface ShotLanguage {
    shot?: ShotSizeId;
    camera: CameraMoveId[];
    composition?: CompositionId;
    light: LightingId[];
}
/** 从中文文本归一化到景别（处理旧数据/LLM 口语）。未知回退 medium。 */
export declare function normalizeShotSize(text: string | undefined): ShotSizeId;
/** 从中文文本归一化到运镜列表。 */
export declare function normalizeCameras(text: string | undefined): CameraMoveId[];
/** 从中文文本归一化到构图（可选）。 */
export declare function normalizeComposition(text: string | undefined): CompositionId | undefined;
/** 从中文文本归一化到光效列表。 */
export declare function normalizeLightings(text: string | undefined): LightingId[];
/** 取词条中文（ZHs 合并句子）。 */
export declare function sizeZh(id: ShotSizeId | undefined): string;
export declare function cameraZh(ids: CameraMoveId[] | undefined): string;
export declare function compoZh(id: CompositionId | undefined): string;
export declare function lightZh(ids: LightingId[] | undefined): string;
