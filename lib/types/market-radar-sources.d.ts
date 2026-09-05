/**
 * 「热门题材雷达」真实榜单抓取源（移植自 AI-Novel-Writing-Assistant marketRadarSources）。
 * 用全局 fetch 抓取公开榜单移动版页面，正则抽取元数据；无第三方依赖。
 */
export type MarketRadarPlatform = 'fanqie' | 'qidian' | 'jinjiang';
export interface MarketRadarListSource {
    platform: MarketRadarPlatform;
    platformLabel: string;
    listKey: string;
    listLabel: string;
    channel: string;
    sourceUrl: string;
}
export interface CollectedRankingItem {
    rank: number;
    title: string;
    author?: string;
    category?: string;
    tags: string[];
    synopsis?: string;
    heatLabel?: string;
    serialStatus?: string;
    sourceUrl: string;
}
export declare const MARKET_RADAR_SOURCES: MarketRadarListSource[];
export declare function hasPrivateUseCharacters(value: string | null | undefined): boolean;
export declare function parseFanqieRanking(html: string, source: MarketRadarListSource): CollectedRankingItem[];
export declare function parseFanqieDetail(html: string, item: CollectedRankingItem): CollectedRankingItem;
export declare function parseQidianRanking(html: string, source: MarketRadarListSource): CollectedRankingItem[];
export declare function parseJinjiangRanking(html: string, source: MarketRadarListSource): CollectedRankingItem[];
export declare function collectMarketSource(source: MarketRadarListSource): Promise<CollectedRankingItem[]>;
