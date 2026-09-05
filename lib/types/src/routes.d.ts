/**
 * The /api/dsh-novel-forge route family: status, docx outline loading, LLM
 * story-bible extraction, volume planning, chapter planning, streaming
 * generation / rewrite / polish (NDJSON frames), review, summaries,
 * foreshadows, export, chapter reading, config patching, and opening the
 * output folder. Every route carries the same loopback-only trust fence as
 * the family plugins — these endpoints invoke the LLM and write files on the
 * host machine.
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { Context } from '@deepseek-ai/cordis';
import { type BibleResponse, type ConfigPatch, type ExportResponse, type LoadOutlineResponse, type NovelConfig, type PlanResponse, type StatusResponse, type VolumesResponse } from './protocol.ts';
import { chapterFileName } from './engine.ts';
/** Route deps. */
export interface NovelRoutesDeps {
    ctx: Context;
    /** Resolve the live plugin config (settings-aware). */
    getConfig: () => NovelConfig;
    /** Persist a config patch through the settings seam. */
    patchConfig: (patch: ConfigPatch) => Promise<NovelConfig>;
}
/**
 * Build every /api/dsh-novel-forge route.
 * @param deps - context, config resolver, config patcher.
 * @returns the route list.
 */
export declare function makeRoutes(deps: NovelRoutesDeps): WebRoute[];
export type { ConfigPatch, NovelConfig, StatusResponse, PlanResponse, LoadOutlineResponse, BibleResponse, VolumesResponse, ExportResponse, };
export { chapterFileName };
