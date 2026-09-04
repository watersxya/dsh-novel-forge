/**
 * 本地 AI 味扫描器（不调 LLM，确定性检测）
 *
 * 用途：生成/润色后自动扫描，结果作为「事实锚点」注入审稿提示词，
 * 让 LLM 做判断而非机械统计。也可用于 UI 展示 AI 味指标。
 */
export interface AiScanResult {
    /** 总评分 0-100，越高越像 AI 写的 */
    aiScore: number;
    /** 命中的套话及次数 */
    clicheHits: Array<{
        word: string;
        count: number;
    }>;
    /** 段落长度方差（过高=段落过于整齐） */
    paragraphLengthVariance: number;
    /** 连续解释性叙事段数（≥3 视为问题） */
    consecutiveExpositoryParagraphs: number;
    /** 句式重复率（相同开头句式占比） */
    sentenceRepetitionRate: number;
    /** 过长段落数（>300字） */
    longParagraphCount: number;
    /** 过短段落数（<20字） */
    shortParagraphCount: number;
    /** 对话占比（0-1） */
    dialogueRatio: number;
    /** 问题摘要，可直接注入审稿提示词 */
    summary: string;
}
export declare function scanAiFlavor(text: string): AiScanResult;
/** 扫描前后对比（润色时用） */
export declare function compareAiScan(before: AiScanResult, after: AiScanResult): {
    improved: boolean;
    deltaScore: number;
    details: string[];
};
