import type { NovelApi } from './api.ts';
import type { PanelController } from './panel/controller.ts';
/** The injected panel container. */
export declare const PANEL_VIEW_SELECTOR = "[data-dsh-novelforge-view]";
/**
 * Mount the panel React tree into the center column and bind visibility to
 * the controller.
 */
export declare function mountPanel(controller: PanelController, api: NovelApi): () => void;
