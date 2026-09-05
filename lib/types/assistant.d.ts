/**
 * AI assistant engine — a conversational editor over the novel project.
 *
 * The user talks to the assistant about plot, characters, settings; the
 * assistant can reply in prose AND emit action directives that the host
 * executes (rewrite a paragraph, edit the bible, regenerate a chapter,
 * export the book, ...). Conversation history persists next to the project
 * as NDJSON, so a reload keeps the thread.
 *
 * Action protocol: the model emits a line of the form
 *   <dsh-action name="toolName">{jsonArgs}</dsh-action>
 * anywhere in its reply. The host strips it, executes the tool, appends the
 * result as a tool-role message, and continues the loop (bounded rounds).
 */
import type { Context } from '@deepseek-ai/cordis';
import type { AssistantMessage, NovelConfig, ProjectState } from './protocol.ts';
import { chapterFileName } from './engine.ts';
/** History file name inside the output dir. */
export declare const ASSISTANT_HISTORY_FILE = "novel-assistant.jsonl";
/** Load the persisted conversation (empty when none). */
export declare function loadAssistantHistory(outputDir: string): AssistantMessage[];
/** 清空助手对话记录（删除历史文件）。 */
export declare function clearAssistantHistory(outputDir: string): void;
/** Execute one action directive. Returns a text result (or throws). */
/**
 * Execute one action directive as an async generator: yields live progress
 * text (chapter text being generated/rewritten), then yields the final result
 * string. Throws on failure.
 */
export declare function executeAction(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, name: string, args: Record<string, unknown>): AsyncGenerator<string, string, unknown>;
/** Run one user turn. Yields stream frames; persists history. */
export declare function runAssistantTurn(ctx: Context, config: NovelConfig, project: ProjectState, outputDir: string, userMessage: string): AsyncGenerator<{
    frame: 'delta';
    text: string;
} | {
    frame: 'tool';
    name: string;
    status: 'start' | 'done' | 'error';
    detail?: string;
} | {
    frame: 'toolDelta';
    name: string;
    text: string;
} | {
    frame: 'toolResult';
    name: string;
    text: string;
}, void, unknown>;
export { chapterFileName };
