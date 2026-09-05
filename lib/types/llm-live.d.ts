/**
 * LLM 实况 feed（对齐上游「AI 创作实况 / LIVE LOG」的轻量实现）。
 *
 * 以「每次 LLM 调用」为粒度，把生命周期事件（开始/流式正文/阶段变化/完成）推给订阅者，
 * 并提供环形缓冲供新连上的客户端重放。不持久化（与上游缓存不同，如需成 cache 再扩展）。
 */
export type LlmLivePhase = 'requesting' | 'streaming' | 'completed' | 'failed';
export interface LlmLiveFrame {
    type: 'session_started' | 'output_delta' | 'reasoning_delta' | 'phase_changed' | 'session_completed';
    /** 由服务端生成，形如 ll-<n>。 */
    sessionId: string;
    /** 本次调用用途（如 正文生成/审稿/章节规划）。 */
    label?: string;
    /** 使用模型（用于展示）。 */
    model?: string;
    /** 事件时间（ISO）。 */
    at: string;
    /** session_started / 部分帧：交互上下文。 */
    context?: {
        taskId?: string;
        interactionId: string;
    };
    /** output_delta / reasoning_delta：本次增量文本。 */
    content?: string;
    /** session 累计字符数。 */
    totalChars?: number;
    /** reasoning 累计字符数。 */
    totalReasoningChars?: number;
    /** phase_changed：新阶段。 */
    phase?: LlmLivePhase;
    /** phase_changed：阶段描述。 */
    phaseMessage?: string;
    /** session_completed：最终预览（截断）。 */
    preview?: string;
    /** session_completed：失败信息。 */
    error?: string;
}
type Listener = (frame: LlmLiveFrame) => void;
export declare function nextSessionId(): string;
export declare function subscribeLiveFeed(listener: Listener): () => void;
export declare function emitLive(frame: LlmLiveFrame): void;
export declare function liveLatest(): LlmLiveFrame[];
export declare function clearLiveFeed(): void;
export {};
