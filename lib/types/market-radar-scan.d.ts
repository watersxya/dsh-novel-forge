/**
 * 热门题材雷达：真实榜单扫榜（聚合各平台榜单源，容错）。
 */
import { type CollectedRankingItem, type MarketRadarPlatform } from './market-radar-sources.ts';
export interface MarketRadarGroup {
    platform: MarketRadarPlatform;
    platformLabel: string;
    listKey: string;
    listLabel: string;
    status: 'ok' | 'error';
    error?: string;
    items: CollectedRankingItem[];
}
export interface MarketScanResult {
    scannedAt: string;
    groups: MarketRadarGroup[];
}
export declare function getLastMarketScan(): MarketScanResult | null;
export declare function scanMarketRanking(platforms?: string[]): Promise<MarketScanResult>;
