/**
 * 作者资产库/总数据（跨书）— 按作者维度聚合的可复用资产。
 * 与书架同惯例持久化到 ~/.dsh/dsh-novel-forge-author-assets.json。
 * 提供读取/持久化/新增或更新/删除，以及「导入默认」：把书架书的写作资产/角色 +
 * 内置全局库（题材/反AI规则/风格模板/推进模式）批量沉淀成资产条目（默认库）。
 */
import type { AuthorAssetLibrary, AuthorStyleAsset } from './protocol.ts';
/** 作者资产库配置文件路径。 */
export declare function authorAssetsFile(): string;
/** 读取作者资产库（不存在/损坏则返回空库，不抛错）。 */
export declare function loadAuthorAssets(): AuthorAssetLibrary;
/** 持久化作者资产库。 */
export declare function saveAuthorAssets(library: AuthorAssetLibrary): void;
/** 新建一条资产（自动生成 id 与时间戳）。 */
export declare function createAuthorAsset(input: Omit<AuthorStyleAsset, 'id' | 'createdAt' | 'updatedAt'>): AuthorStyleAsset;
/** 按 id 更新一条资产；不存在则追加。 */
export declare function upsertAuthorAsset(input: AuthorStyleAsset): AuthorAssetLibrary;
/** 删除一条资产；返回更新后的资产库。 */
export declare function removeAuthorAsset(id: string): AuthorAssetLibrary;
/**
 * 导入默认：把书架所有书的写作资产/角色 + 内置全局库批量沉淀到作者资产库。
 * 按 `kind:name` 去重（已存在则跳过），不覆盖用户已有条目。
 * @returns 更新后的资产库。
 */
export declare function importDefaultAuthorAssets(): AuthorAssetLibrary;
