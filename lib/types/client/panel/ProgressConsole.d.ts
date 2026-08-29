export interface ProgressLine {
    id: number;
    text: string;
    kind: 'info' | 'done' | 'error';
    live?: boolean;
    ratio?: number;
}
export declare function ProgressConsole({ progress, busy, busyLabel, liveBar, onClear }: {
    progress: ProgressLine[];
    busy: boolean;
    busyLabel: string;
    liveBar: {
        text: string;
        ratio?: number;
    } | null;
    onClear: () => void;
}): import("react").JSX.Element;
