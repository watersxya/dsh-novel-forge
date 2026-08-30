/**
 * 全局写作资产库：只读浏览插件内置的公共资产（题材/反AI规则/风格模板/推进模式）。
 * 内置库为固定内容；实际绑定到某本书在「创作资产」页。
 */
import { useEffect, useState } from 'react'
import { Info, BookOpen } from 'lucide-react'
import type { NovelApi } from '../api.ts'
import type { AssetsResponse, GenreNode, AntiAiRule, StyleTemplate, ProgressionMode, PlotBeatTemplate } from '../../protocol.ts'
import css from './panel.module.css'

type Tab = 'genre' | 'antiAi' | 'style' | 'progression' | 'plotBeat'

export function GlobalAssetLibraryView({ api }: { api: NovelApi }) {
  const [data, setData] = useState<AssetsResponse | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('genre');

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await api.assets()
        if (!cancelled) setData(res)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [api]);

  const renderGenreDescendants = (children: GenreNode[], depth: number): JSX.Element[] =>
    children.map(c => (
      <div key={c.name} style={{ paddingLeft: depth * 12, marginTop: 2 }}>
        <span className={css.meta}><b>{c.name}</b>：{c.description}</span>
        {(c.children ?? []).length > 0 && renderGenreDescendants(c.children ?? [], depth + 1)}
      </div>
    ));

  const renderGenre = (nodes: GenreNode[]): JSX.Element[] =>
    nodes.map(n => (
      <div key={n.name} className={css.assetCard}>
        <div className={css.assetCardName}>{n.name}</div>
        <div className={css.meta}>{n.description}</div>
        {(n.children ?? []).length > 0 && (
          <div style={{ marginTop: 6 }}>{renderGenreDescendants(n.children ?? [], 0)}</div>
        )}
      </div>
    ));

  const renderAntiAi = (rules: AntiAiRule[]): JSX.Element[] =>
    rules.map(r => (
      <div key={r.name} className={css.assetCard}>
        <div className={css.assetCardTop}><span className={css.assetKind} style={{ color: 'var(--nf-warn)' }}>反AI</span></div>
        <div className={css.assetCardName}>{r.name}</div>
        <div className={css.assetCardContent}>避免：{r.avoid}{r.fix !== '' ? '\n修正：' + r.fix : ''}</div>
        {(r.detectPatterns ?? []).length > 0 && <div className={css.meta}>命中模式：{(r.detectPatterns ?? []).join('、')}</div>}
      </div>
    ));

  const renderStyle = (templates: StyleTemplate[]): JSX.Element[] =>
    templates.map(t => (
      <div key={t.key} className={css.assetCard}>
        <div className={css.assetCardTop}><span className={css.assetKind} style={{ color: 'var(--nf-info)' }}>{t.category}</span></div>
        <div className={css.assetCardName}>{t.name}</div>
        <div className={css.meta}>{t.description}</div>
        <div className={css.assetCardContent}>
          适用：{(t.applicableGenres ?? []).join('、')}
          {t.proseRules.length > 0 ? '\n叙述：' + t.proseRules.join('；') : ''}
          {t.dialogueRules.length > 0 ? '\n台词：' + t.dialogueRules.join('；') : ''}
          {t.languageRules.length > 0 ? '\n语言：' + t.languageRules.join('；') : ''}
          {t.rhythmRules.length > 0 ? '\n节奏：' + t.rhythmRules.join('；') : ''}
        </div>
      </div>
    ));

  const renderProgression = (modes: ProgressionMode[]): JSX.Element[] =>
    modes.map(m => (
      <div key={m.name} className={css.assetCard}>
        <div className={css.assetCardTop}><span className={css.assetKind} style={{ color: 'var(--nf-accent)' }}>{m.primary ? '主模式' : '辅助'}</span></div>
        <div className={css.assetCardName}>{m.name}</div>
        <div className={css.meta}>驱动：{m.driver}</div>
        <div className={css.assetCardContent}>
          期待：{m.readerExpectation}
          {m.payoffs.length > 0 ? '\n兑现：' + m.payoffs.join('；') : ''}
          {m.risks.length > 0 ? '\n风险：' + m.risks.join('；') : ''}
        </div>
      </div>
    ));

  const renderPlotBeat = (beats: PlotBeatTemplate[]): JSX.Element[] =>
    beats.map(b => (
      <div key={b.key} className={css.assetCard}>
        <div className={css.assetCardTop}><span className={css.assetKind} style={{ color: 'var(--nf-accent)' }}>{b.category}</span></div>
        <div className={css.assetCardName}>{b.name}</div>
        <div className={css.meta}>{b.summary}</div>
        <div className={css.assetCardContent}>
          位置：{b.position}
          {(b.preconditions ?? []).length > 0 ? '\n前置：' + b.preconditions.join('；') : ''}
          {(b.payoffSource ?? []).length > 0 ? '\n爽点：' + b.payoffSource.join('；') : ''}
          {(b.combos ?? []).length > 0 ? '\n组合：' + b.combos.join('；') : ''}
          {(b.taboos ?? []).length > 0 ? '\n禁忌：' + b.taboos.join('；') : ''}
        </div>
      </div>
    ));

  return (
    <div className={css.authorPageBody}>
      <div className={css.authorPageHero}>
        <div className={css.authorPageHeader}>
          <div>
            <h2 className={css.panelTitle} style={{ margin: 0 }}>🎨 全局写作资产库</h2>
            <span className={css.meta}>内置题材基底库 / 反AI规则库 / 风格模板 / 推进模式 / 剧情桥段库（跨书）——插件自带、只读。</span>
          </div>
        </div>
        <div className={css.assetFilterBar}>
          <button type="button" className={css.assetFilterChip + (tab === 'genre' ? ' ' + css.assetFilterChipActive : '')} onClick={() => setTab('genre')}>题材 {(data?.genreLibrary ?? []).length}</button>
          <button type="button" className={css.assetFilterChip + (tab === 'antiAi' ? ' ' + css.assetFilterChipActive : '')} onClick={() => setTab('antiAi')}>反AI规则 {(data?.antiAiLibrary ?? []).length}</button>
          <button type="button" className={css.assetFilterChip + (tab === 'style' ? ' ' + css.assetFilterChipActive : '')} onClick={() => setTab('style')}>风格模板 {(data?.styleTemplates ?? []).length}</button>
          <button type="button" className={css.assetFilterChip + (tab === 'progression' ? ' ' + css.assetFilterChipActive : '')} onClick={() => setTab('progression')}>推进模式 {(data?.progressionLibrary ?? []).length}</button>
          <button type="button" className={css.assetFilterChip + (tab === 'plotBeat' ? ' ' + css.assetFilterChipActive : '')} onClick={() => setTab('plotBeat')}>剧情桥段 {(data?.plotBeatLibrary ?? []).length}</button>
        </div>
      </div>

      {error !== '' && <div className={css.noticeError}>{error}</div>}

      {data === null ? (
        <div className={css.shelfEmpty} style={{ minHeight: 160 }}>
          <span className={css.shelfEmptyIcon}><Info size={30} /></span>
          <span className={css.shelfEmptyTitle}>加载中…</span>
          <span className={css.meta}>正在读取全局内置资产库。</span>
        </div>
      ) : (
        <div className={css.assetGroups}>
          {tab === 'genre' && (
            <div className={css.assetGroup}>
              <div className={css.assetGroupHeader}>题材基底库 <span className={css.meta}>树形 / 只读</span></div>
              <div className={css.assetGrid}>{renderGenre(data.genreLibrary)}</div>
            </div>
          )}
          {tab === 'antiAi' && (
            <div className={css.assetGroup}>
              <div className={css.assetGroupHeader}>反AI规则库 <span className={css.meta}>只读 / 可在书内复制为自定义</span></div>
              <div className={css.assetGrid}>{renderAntiAi(data.antiAiLibrary)}</div>
            </div>
          )}
          {tab === 'style' && (
            <div className={css.assetGroup}>
              <div className={css.assetGroupHeader}>风格模板 <span className={css.meta}>只读 / 可在书内一键绑定</span></div>
              <div className={css.assetGrid}>{renderStyle(data.styleTemplates)}</div>
            </div>
          )}
          {tab === 'progression' && (
            <div className={css.assetGroup}>
              <div className={css.assetGroupHeader}>推进模式 <span className={css.meta}>只读</span></div>
              <div className={css.assetGrid}>{renderProgression(data.progressionLibrary)}</div>
            </div>
          )}
          {tab === 'plotBeat' && (
            <div className={css.assetGroup}>
              <div className={css.assetGroupHeader}>剧情桥段库 <span className={css.meta}>只读 / 可收藏或导入作者库</span></div>
              <div className={css.assetGrid}>{renderPlotBeat(data.plotBeatLibrary)}</div>
            </div>
          )}
        </div>
      )}

      <div className={css.meta} style={{ marginTop: 10 }}>
        提示：内置库为插件自带、只读。想要在书里使用，请进入某本书的「创作资产」页绑定为项目资产，或在「作者资产库」里「导入默认资产」沉淀成可复用的个人条目。
      </div>
    </div>
  );
}
