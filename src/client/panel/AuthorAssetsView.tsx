/**
 * 作者资产库/总数据页：跨书可复用的笔法/红线/套路/角色模板/世界观模板。
 * 支持 新增 / 编辑 / 删除；数据持久化到 ~/.dsh/dsh-novel-forge-author-assets.json。
 */
import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import type { NovelApi } from '../api.ts'
import type { AuthorStyleAsset } from '../../protocol.ts'
import css from './panel.module.css'

const KIND_LABELS: Record<AuthorStyleAsset['kind'], string> = {
  style: '笔法',
  antiAi: '红线/反AI',
  progression: '推进模式',
  genre: '题材',
  roleTemplate: '角色模板',
  worldTemplate: '世界观模板',
  custom: '自定义',
}

const KIND_OPTIONS = Object.keys(KIND_LABELS) as AuthorStyleAsset['kind'][]

const KIND_COLORS: Record<AuthorStyleAsset['kind'], string> = {
  style: 'var(--nf-info)',
  antiAi: 'var(--nf-warn)',
  progression: 'var(--nf-accent)',
  genre: 'var(--nf-info)',
  roleTemplate: 'var(--nf-accent)',
  worldTemplate: 'var(--nf-warn)',
  custom: 'var(--nf-muted)',
}

/** 计算资产的分组（分类）：题材按顶层题材名（'/' 之前），其余按类型。 */
function assetCategory(a: AuthorStyleAsset): string {
  if (a.kind === 'genre') {
    const top = a.name.split('/')[0]?.trim()
    return top !== undefined && top !== '' ? top : '题材'
  }
  return KIND_LABELS[a.kind] ?? '其他'
}

interface EditorState {
  id?: string
  name: string; kind: AuthorStyleAsset['kind']; summary: string; content: string; tags: string; sourceBooks: string
}

function emptyEditor(): EditorState {
  return { name: '', kind: 'style', summary: '', content: '', tags: '', sourceBooks: '' }
}

export function AuthorAssetsView({ api }: { api: NovelApi }) {
  const [assets, setAssets] = useState<AuthorStyleAsset[]>([]);
  const [editing, setEditing] = useState<EditorState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kindFilter, setKindFilter] = useState<AuthorStyleAsset['kind'] | 'all'>('all');

  const load = async (): Promise<void> => {
    try { const res = await api.authorAssets(); setAssets(res.assets.items) } catch (err) { setError((err as Error).message) }
  };

  /** 导入默认：把书架书的写作资产/角色 + 内置全局库批量沉淀到作者资产库。 */
  const importDefaults = async (): Promise<void> => {
    setBusy(true); setError('');
    try { const res = await api.authorAssetsImportDefault(); setAssets(res.assets.items) } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  };

  // 打开即加载；若资产库为空，自动导入默认（书架资产 + 内置全局库）。
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await api.authorAssets()
        if (cancelled) return
        if (res.assets.items.length === 0) {
          const imp = await api.authorAssetsImportDefault()
          if (!cancelled) setAssets(imp.assets.items)
        } else {
          setAssets(res.assets.items)
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [api]);

  const startNew = (): void => { setEditing(emptyEditor()); setError('') };
  const startEdit = (a: AuthorStyleAsset): void => {
    setEditing({ id: a.id, name: a.name, kind: a.kind, summary: a.summary, content: a.content, tags: a.tags.join('、'), sourceBooks: a.sourceBooks.join('、') });
    setError('');
  };

  const save = async (): Promise<void> => {
    if (editing === null) return;
    if (editing.name.trim() === '') { setError('请填写资产名'); return }
    setBusy(true); setError('');
    try {
      const asset: AuthorStyleAsset = {
        id: editing.id ?? '', name: editing.name.trim(), kind: editing.kind, summary: editing.summary.trim(), content: editing.content.trim(),
        sourceBooks: editing.sourceBooks.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean),
        tags: editing.tags.split(/[、,，\s]+/).map(s => s.trim()).filter(Boolean),
        createdAt: '', updatedAt: '',
      };
      await api.authorAssetsUpsert(asset); setEditing(null); await load();
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  };

  const del = async (id: string): Promise<void> => {
    setBusy(true); setError('');
    try { await api.authorAssetsRemove(id); await load() } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  };

  const visible = useMemo(() => (kindFilter === 'all' ? assets : assets.filter(a => a.kind === kindFilter)), [assets, kindFilter]);

  /** 按分类分组展示（题材按顶层题材名，其余按类型）。 */
  const grouped = useMemo(() => {
    const map = new Map<string, AuthorStyleAsset[]>()
    for (const a of visible) {
      const cat = assetCategory(a)
      const arr = map.get(cat) ?? []
      arr.push(a)
      map.set(cat, arr)
    }
    return Array.from(map.entries()).sort((x, y) => x[0].localeCompare(y[0], 'zh'))
  }, [visible]);

  return (
    <div className={css.authorPageBody}>
      <div className={css.authorPageHero}>
        <div className={css.authorPageHeader}>
          <div>
            <h2 className={css.panelTitle} style={{ margin: 0 }}>🧬 作者资产库 · 总数据</h2>
            <span className={css.meta}>跨书可复用的笔法/红线/套路/角色模板/世界观模板。任意新书与改编都能调用。</span>
          </div>
          <div className={css.rowEnd}>
            <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { void importDefaults() }} disabled={busy} title="把书架里所有书的写作资产/角色 + 内置题材/反AI/风格模板/推进模式批量导入">导入默认资产</button>
            <button type="button" className={css.button + ' ' + css.buttonPrimary} onClick={startNew}><Plus size={14} style={{ verticalAlign: -2 }} /> 新增资产</button>
          </div>
        </div>
        <div className={css.assetFilterBar}>
          {KIND_OPTIONS.map(k => (
            <button key={k} type="button" className={css.assetFilterChip + (kindFilter === k ? ' ' + css.assetFilterChipActive : '')} onClick={() => setKindFilter(kindFilter === k ? 'all' : k)}>{KIND_LABELS[k]} {assets.filter(a => a.kind === k).length}</button>
          ))}
        </div>
      </div>

      {error !== '' && <div className={css.noticeError}>{error}</div>}

      {editing !== null ? (
        <div className={css.assetEditor}>
          <h3 style={{ margin: 0 }}>{editing.id !== '' && editing.id !== undefined ? '编辑资产' : '新增资产'}</h3>
          <div className={css.assetEditorRow}>
            <label className={css.assetLabel}>资产名 <input className={css.input} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="如：短句快节奏爽文风" /></label>
            <label className={css.assetLabel}>类型 <select className={css.input} value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as AuthorStyleAsset['kind'] })}>{KIND_OPTIONS.map(k => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select></label>
          </div>
          <label className={css.assetLabel}>一句话摘要 <input className={css.input} value={editing.summary} onChange={e => setEditing({ ...editing, summary: e.target.value })} placeholder="这个资产解决什么问题 / 有什么特点" /></label>
          <label className={css.assetLabel}>内容（按类型约定的描述 / 规则 / 结构化文本）
            <textarea className={`${css.input} ${css.assetTextarea}`} value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} placeholder={'角色模板示例：\n姓名：林越\n定位：痞坏型主角\n口头禅："有点意思"\n性格：表面懒散、内里狠辣\n成长弧线：从底层游街到一方枭雄'} />
          </label>
          <div className={css.assetEditorRow}>
            <label className={css.assetLabel}>标签（顿号分隔） <input className={css.input} value={editing.tags} onChange={e => setEditing({ ...editing, tags: e.target.value })} placeholder="扮猪吃虎、快节奏、冷面" /></label>
            <label className={css.assetLabel}>来源书（顿号分隔） <input className={css.input} value={editing.sourceBooks} onChange={e => setEditing({ ...editing, sourceBooks: e.target.value })} placeholder="《某某传》《某某录》" /></label>
          </div>
          <div className={css.rowEnd}><button type="button" className={`${css.button} ${css.buttonPrimary}`} onClick={save} disabled={busy}>{busy ? '保存中…' : '保存'}</button>{(editing.id !== '' && editing.id !== undefined) && <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => setEditing(null)}>取消</button>}</div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className={css.shelfEmpty} style={{ minHeight: 160 }}>
          <span className={css.shelfEmptyIcon}><Plus size={30} /></span>
          <span className={css.shelfEmptyTitle}>还没有资产</span>
          <span className={css.meta}>点「新增资产」收藏你的笔法/角色模板/套路，跨书调用。</span>
        </div>
      ) : (
        <div className={css.assetGroups}>
          {grouped.map(([cat, items]) => (
            <div key={cat} className={css.assetGroup}>
              <div className={css.assetGroupHeader}>{cat} <span className={css.meta}>{items.length}</span></div>
              <div className={css.assetGrid}>
                {items.map(a => (
                  <div key={a.id} className={css.assetCard}>
                    <div className={css.assetCardTop}>
                      <span className={css.assetKind} style={{ color: KIND_COLORS[a.kind] }}>{KIND_LABELS[a.kind]}</span>
                      <div className={css.rowEnd}>
                        <button type="button" className={css.iconBtn} title="编辑" onClick={() => startEdit(a)}><Pencil size={13} /></button>
                        <button type="button" className={css.iconBtn} title="删除" onClick={() => { void del(a.id) }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                    <div className={css.assetCardName}>{a.name}</div>
                    {a.summary !== '' && <div className={css.meta}>{a.summary}</div>}
                    <div className={css.assetCardContent}>{a.content}</div>
                    <div className={css.assetCardFooter}>
                      {a.tags.map(t => <span key={t} className={css.badge}>{t}</span>)}
                      {a.sourceBooks.length > 0 && <span className={css.meta}>来源：{a.sourceBooks.join(' / ')}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}