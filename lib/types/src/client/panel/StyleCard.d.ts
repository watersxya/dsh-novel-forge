import type { ArtStyle } from '../../style-library.ts';
export declare function StyleCard({ style, selected, onClick, }: {
    style: ArtStyle;
    /** 选中态（高亮边框）。 */
    selected?: boolean;
    /** 点击卡片（选风格）。 */
    onClick?: () => void;
}): any;
