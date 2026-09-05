import type { NovelApi } from '../api.ts';
import type { BookshelfSnapshot } from '../../protocol.ts';
import { type ProgressLine } from './ProgressConsole.tsx';
export declare function AuthorHome({ api, shelf, onOpenBook, onReadBook, onAddBook, onImportBook, onOpenSettings, onTheme, onBackground, onOpacity, onEndfieldAccent, adaptEnabled, progress, busy, busyLabel, liveBar, onClearProgress, onUseIdea }: {
    api: NovelApi;
    shelf: BookshelfSnapshot;
    onOpenBook: (id: string) => void;
    onReadBook: (id: string) => void;
    onAddBook: () => void;
    onImportBook: () => void;
    /** 创意灵感 → 采纳某个灵感带入开书向导。 */
    onUseIdea?: (idea: import('../../protocol.ts').IdeaInspirationResult['ideas'][number]) => void;
    /** 兼容旧入口：首页设置现为独立设置页，此回调保留但不再使用。 */
    onOpenSettings?: () => void;
    /** 主题/模式/密度变化回调（供面板根容器实时生效）。 */
    onTheme?: (theme: 'liquid' | 'neumorph' | 'macos' | 'clay' | 'endfield', mode: 'system' | 'light' | 'dark', density: 'comfort' | 'compact' | 'spacious') => void;
    /** 自定义背景变化回调。 */
    onBackground?: (bg: string | undefined, blur: number) => void;
    /** 玻璃透明度变化回调。 */
    onOpacity?: (n: number) => void;
    /** 终末地强调色变化回调。 */
    onEndfieldAccent?: (accent: 'valley' | 'wuling') => void;
    /** 是否启用改编模式（默认 false=隐藏入口）。 */
    adaptEnabled?: boolean;
    /** AI 进度实时状态（与书内共享同一份）。 */
    progress?: ProgressLine[];
    busy?: boolean;
    busyLabel?: string;
    liveBar?: {
        text: string;
        ratio?: number;
    } | null;
    onClearProgress?: () => void;
}): any;
