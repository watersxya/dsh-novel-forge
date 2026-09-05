/**
 * 浏览器端「AI 创作实况」钩子：连接 /llm-live/stream (SSE)，按 LLM 调用分组会话。
 * 轻量实现，不持久化缓存（对齐上游 useLlmLiveFeed 的核心行为）。
 */
export interface LlmLiveFrame {
    type: 'session_started' | 'output_delta' | 'reasoning_delta' | 'phase_changed' | 'session_completed';
    sessionId: string;
    label?: string;
    model?: string;
    at: string;
    content?: string;
    totalChars?: number;
    totalReasoningChars?: number;
    phase?: 'requesting' | 'streaming' | 'completed' | 'failed';
    phaseMessage?: string;
    preview?: string;
    error?: string;
}
export interface LlmLiveSession {
    sessionId: string;
    label: string;
    model?: string;
    phase: 'requesting' | 'streaming' | 'completed' | 'failed';
    phaseMessage: string;
    preview: string;
    totalChars: number;
    startedAt: string;
    updatedAt: string;
}
export declare function useLlmLiveFeed(enabled?: boolean): {
    connected: boolean;
    sessions: LlmLiveSession[];
};
