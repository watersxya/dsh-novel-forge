/**
 * 编剧词库（剧情骨架规范化基准）。
 * 骨架的 function（叙事功能）与 emotion（情绪走向）统一从这里取值（英文 id），
 * 生成提示词/展示时用 zh 中文。
 * 目的：让"叙事功能/情绪"有标准词表，避免 LLM 自由发挥导致情绪链漂移。
 */
/** 叙事功能（对应节拍在剧情中的作用）。 */
export type StoryFunctionId = 'exposition' | 'conflict' | 'turn' | 'climax' | 'resolve' | 'foreshadow' | 'character';
/** 情绪词（低→高能量的情绪阶，角色在节拍中的主要情绪点）。 */
export type EmotionId = 'calm' | 'indifferent' | 'expectant' | 'curious' | 'alert' | 'suppressed' | 'enduring' | 'worried' | 'irritable' | 'uneasy' | 'terrified' | 'angry' | 'collapsing' | 'resolute' | 'grieved' | 'relieved' | 'bittersweet' | 'triumphant' | 'reborn' | 'numb';
export interface BeatLangEntry<T extends string> {
    id: T;
    /** 中文（展示用）。 */
    zh: string;
    /** 英文（英文平台适配用）。 */
    en: string;
    /** 一句话说明。 */
    hint: string;
}
/** 叙事功能词表。 */
export declare const STORY_FUNCTIONS: readonly BeatLangEntry<StoryFunctionId>[];
/** 情绪词表（按能量/阶段排序）。 */
export declare const EMOTIONS: readonly BeatLangEntry<EmotionId>[];
export interface StoryBeatLanguage {
    function: StoryFunctionId;
    emotion: EmotionId[];
}
/** 从中文归一化叙事功能（未知回退 exposition）。 */
export declare function normalizeStoryFunction(text: string | undefined): StoryFunctionId;
/** 从中文文本归一化情绪词列表（可含→箭头链）。 */
export declare function normalizeEmotions(text: string | undefined): EmotionId[];
/** 叙事功能中文。 */
export declare function functionZh(id: StoryFunctionId | undefined): string;
/** 情绪中文（箭头连接）。 */
export declare function emotionZh(ids: EmotionId[] | undefined): string;
