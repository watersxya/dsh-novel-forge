import type { NovelApi } from '../api.ts';
import type { BookshelfSnapshot } from '../../protocol.ts';
export declare function AuthorHome({ api, shelf, onOpenBook, onReadBook, onAddBook, onImportBook, onOpenSettings, onTheme, onBackground, onOpacity, adaptEnabled }: {
    api: NovelApi;
    shelf: BookshelfSnapshot;
    onOpenBook: (id: string) => void;
    onReadBook: (id: string) => void;
    onAddBook: () => void;
    onImportBook: () => void;
    /** 兼容旧入口：首页设置现为独立设置页，此回调保留但不再使用。 */
    onOpenSettings?: () => void;
    /** 主题/模式/密度变化回调（供面板根容器实时生效）。 */
    onTheme?: (theme: 'liquid' | 'neumorph' | 'macos' | 'clay', mode: 'system' | 'light' | 'dark', density: 'comfort' | 'compact' | 'spacious') => void;
    /** 自定义背景变化回调。 */
    onBackground?: (bg: string | undefined, blur: number) => void;
    /** 玻璃透明度变化回调。 */
    onOpacity?: (n: number) => void;
    /** 是否启用改编模式（默认 false=隐藏入口）。 */
    adaptEnabled?: boolean;
}): import("react").JSX.Element;
