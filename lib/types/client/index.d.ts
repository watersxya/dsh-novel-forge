/**
 * Browser-half entry for the dsh-novel-forge plugin — runs inside the dsh web
 * GUI. Registers the sidebar entry row and the workbench panel. DOM mounting
 * problems are logged, never thrown — the web shell fails the whole boot when
 * a plugin apply throws.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/** Required services (fiber inject waiting). */
export declare const inject: string[];
/**
 * Mount the novel-forge workbench.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
