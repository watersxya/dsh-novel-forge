import type { NovelApi } from '../api.ts';
type SettingsTab = 'model' | 'writing' | 'image' | 'files' | 'appearance';
type ThemeMode = 'system' | 'light' | 'dark';
type ThemeName = 'liquid' | 'neumorph' | 'macos' | 'clay' | 'endfield';
type EndfieldAccent = 'valley' | 'wuling';
type ThemeDensity = 'comfort' | 'compact' | 'spacious';
export declare function SettingsView({ api, onTheme, onSettingsTab, onEditorFontSize, onBackground, onOpacity, onEndfieldAccent }: {
    api: NovelApi;
    onTheme?: (theme: ThemeName, mode: ThemeMode, density: ThemeDensity) => void;
    onSettingsTab?: (tab: SettingsTab) => void;
    onEditorFontSize?: (n: number) => void;
    onBackground?: (bg: string | undefined, blur: number) => void;
    onOpacity?: (n: number) => void;
    onEndfieldAccent?: (accent: EndfieldAccent) => void;
}): any;
export {};
