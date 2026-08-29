import type { BookshelfSnapshot } from '../../protocol.ts';
export declare function ProgressHomeView({ shelf, onOpenBook }: {
    shelf: BookshelfSnapshot;
    onOpenBook: (id: string) => void;
}): import("react").JSX.Element;
