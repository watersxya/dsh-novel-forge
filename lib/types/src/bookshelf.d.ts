/**
 * 书架（Bookshelf）— 多书管理：一本书记录一个独立输出目录。
 * 状态持久化到 ~/.dsh/dsh-novel-forge-bookshelf.json（跟随 dsh 配置惯例）。
 */
import type { BookEntry, BookshelfSnapshot } from './protocol.ts';
/** 书架配置文件路径。 */
export declare function bookshelfFile(): string;
interface BookshelfStore {
    books: BookEntry[];
    activeBookId: string | null;
}
/** 读取书架（无则返回空）。 */
export declare function loadBookshelf(): BookshelfStore;
/** 当前激活的书。 */
export declare function activeBook(store: BookshelfStore): BookEntry | undefined;
/** 书架快照（含每本书的进度摘要）。 */
export declare function bookshelfSnapshot(store: BookshelfStore): BookshelfSnapshot;
/** 新建一本书（自动成为当前书）。 */
export declare function createBook(bookName: string, outputDir: string): BookEntry;
/** 更新某本书的书名（开书向导导入大纲后书名以大纲首行为准）。 */
export declare function renameBook(id: string, bookName: string): boolean;
/**
 * 播种：书架为空时，把指定输出目录下已有的项目自动登记为第一本书。
 * 兼容升级场景 —— 旧版插件直接在输出目录写项目，从未登记书架。
 * @param outputDir - 候选输出目录（通常为 settings 的默认输出目录）。
 * @returns 是否发生了播种。
 */
export declare function seedBookshelfFromOutputDir(outputDir: string): boolean;
/** 导入已有项目目录到书架：校验 novel-project.json，已存在则直接激活。 */
export declare function importDir(outputDir: string): {
    book: BookEntry;
    existed: boolean;
};
/** 激活一本书。 */
export declare function activateBook(id: string): BookEntry | undefined;
/** 移除一本书。 */
export declare function removeBook(id: string): boolean;
/** 当前书输出目录（无书架则 undefined，回退 settings）。 */
export declare function activeBookOutputDir(): string | undefined;
/** 默认输出目录推断：~/.dsh/novels/书名。 */
export declare function defaultOutputDirFor(bookName: string): string;
export {};
