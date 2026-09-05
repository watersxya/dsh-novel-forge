import type { GenreNode, ProgressionMode } from './protocol.ts';
export declare function globalGenreLibrary(): GenreNode[];
export declare function globalProgressionLibrary(): ProgressionMode[];
/** 新增/已有则跳过；返回 true=新增。 */
export declare function addGlobalGenre(g: GenreNode): boolean;
export declare function addGlobalMode(m: ProgressionMode): boolean;
