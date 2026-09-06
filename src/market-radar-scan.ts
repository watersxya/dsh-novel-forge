/**
 * 热门题材雷达：真实榜单扫榜（聚合各平台榜单源，容错）。
 */
import { collectMarketSource, MARKET_RADAR_SOURCES, type CollectedRankingItem, type MarketRadarPlatform, type MarketRadarListSource } from './market-radar-sources.ts'

export interface MarketRadarGroup {
  platform: MarketRadarPlatform
  platformLabel: string
  listKey: string
  listLabel: string
  status: 'ok' | 'error'
  error?: string
  items: CollectedRankingItem[]
}

export interface MarketScanResult {
  scannedAt: string
  groups: MarketRadarGroup[]
}

let lastScan: MarketScanResult | null = null

export function getLastMarketScan(): MarketScanResult | null {
  return lastScan
}

export async function scanMarketRanking(platforms?: string[]): Promise<MarketScanResult> {
  const wanted = new Set<string>(platforms?.length ? platforms : ['fanqie', 'qidian', 'jinjiang'])
  const sources = MARKET_RADAR_SOURCES.filter(s => wanted.has(s.platform))
  const groups: MarketRadarGroup[] = []
  await Promise.all(sources.map(async (source: MarketRadarListSource) => {
    try {
      const items = await collectMarketSource(source)
      groups.push({ platform: source.platform, platformLabel: source.platformLabel, listKey: source.listKey, listLabel: source.listLabel, status: 'ok', items })
    } catch (error) {
      groups.push({ platform: source.platform, platformLabel: source.platformLabel, listKey: source.listKey, listLabel: source.listLabel, status: 'error', error: (error as Error).message, items: [] })
    }
  }))
  lastScan = { scannedAt: new Date().toISOString(), groups }
  return lastScan
}
