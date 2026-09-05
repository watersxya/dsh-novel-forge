/**
 * Novel-forge panel controller: the single owner of the panel's open/closed
 * state (framework-free, mirroring the family plugins' controllers).
 */
/** Immutable controller snapshot for UI subscriptions. */
export interface PanelControllerSnapshot {
    panelOpen: boolean;
}
/** The panel state owner the sidebar entry toggles and the view renders from. */
export declare class PanelController {
    private panelOpen;
    private listeners;
    getSnapshot(): PanelControllerSnapshot;
    subscribe(fn: () => void): () => void;
    open(): void;
    close(): void;
    toggle(): void;
    private notify;
}
