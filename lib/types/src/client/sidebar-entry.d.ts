/**
 * Sidebar entry injection — mirrors the family plugins' DOM-level pattern:
 * the shell exposes no external slot, so the entry row is injected after the
 * sibling plugin entries and self-heals via MutationObserver.
 */
import type { PanelController } from './panel/controller.ts';
/** Stable data attribute identifying the injected entry row. */
export declare const ENTRY_SELECTOR = "[data-dsh-novelforge-entry]";
/**
 * Mount the sidebar entry, waiting for the shell and self-healing on
 * re-renders.
 */
export declare function mountSidebarEntry(controller: PanelController): () => void;
