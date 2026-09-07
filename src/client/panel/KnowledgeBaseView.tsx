/**
 * 书内知识库：添加/删除参考资料，生成/规划时自动检索注入。
 * T2 主从布局：左列文档列表 + 新建入口，右侧文档详情 / 新建表单。
 */
import { useEffect, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { KnowledgeDoc } from '../../protocol.ts'
import css from './panel.module.css'

export default function KnowledgeBaseView({ api }: { api: NovelApi }): JSX.Element {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  /** 左列选中的文档 id；null 且 addMode=false 时显示空态。 */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** 新建模式：右栏显示添加表单。 */
  const [addMode, setAddMode] = useState(false)

  const load = async (): Promise<void> => {
    try {
      const r = await api.knowledgeList()
      setDocs(r.docs)
    } catch (e) { setError((e as Error).message) }
  }
  useEffect(() => { void load() }, [])

  const add = async (): Promise<void> => {
    if (title.trim() === '') { setError('标题不能为空'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await api.knowledgeAdd({ title: title.trim(), content: content.trim() })
      setDocs(r.docs); setTitle(''); setContent(''); setNotice(' 已添加')
      setAddMode(false)
      const added = r.docs[r.docs.length - 1]
      if (added !== undefined) setSelectedId(added.id)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const remove = async (id: string): Promise<void> => {
    setBusy(true); setError('')
    try {
      const r = await api.knowledgeRemove(id)
      setDocs(r.docs)
      if (selectedId === id) setSelectedId(null)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const selected = docs.find(d => d.id === selectedId)

  return (
    <div className={css.authorPageBodyFlow}>
      <div className={css.card} style={{ padding: 0, overflow: 'hidden' }}>
        <div className={css.t2Master} style={{ minHeight: 420 }}>
          <aside className={css.t2Rail} aria-label="知识库文档">
            <div className={css.t2RailHead}> 书内知识库</div>
            <button
              type="button"
              className={css.t2RailBtn}
              data-active={addMode ? '' : undefined}
              onClick={() => { setAddMode(true); setSelectedId(null) }}
              title="添加一篇参考文档（生成时按章节检索注入）"
            >
              <span aria-hidden>＋</span><span>新建文档</span>
            </button>
            <div className={css.t2RailSep} />
            {docs.length === 0 ? (
              <div className={css.t2RailMeta}>暂无文档</div>
            ) : docs.map(d => (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={!addMode && selectedId === d.id}
                className={css.t2RailBtn}
                data-active={!addMode && selectedId === d.id ? '' : undefined}
                title={d.content.slice(0, 80)}
                onClick={() => { setAddMode(false); setSelectedId(d.id) }}
              >
                <span aria-hidden></span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
              </button>
            ))}
            <div className={css.t2RailSep} />
            <div className={css.t2RailMeta}>共 {docs.length} 篇 · 正文生成时按当前章节检索注入</div>
          </aside>
          <div className={css.t2Content}>
            {addMode ? (
              <>
                <span className={css.cardTitleLg}>＋ 新建文档</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', maxWidth: 'var(--nf-measure, 720px)' }}>
                  <input className={css.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="标题（如：天机锁设定 / 止水驿关系表）" />
                  <textarea className={css.input} style={{ minHeight: 160, resize: 'vertical' }} value={content} onChange={e => setContent(e.target.value)} placeholder="内容（将被检索注入生成提示）" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nf-space-8)' }}>
                    <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void add() }}>添加</button>
                    <button type="button" className={css.button} onClick={() => { setAddMode(false) }}>取消</button>
                    {notice !== '' && <span style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-success)' }}>{notice}</span>}
                  </div>
                </div>
              </>
            ) : selected !== undefined ? (
              <>
                <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span className={css.cardTitleLg}> {selected.title}</span>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void remove(selected.id) }}>删除</button>
                </div>
                <div className={`${css.planBeats} ${css.docsSurface}`}>
                  <div style={{ fontSize: 'var(--nf-fs-14)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selected.content !== '' ? selected.content : '（空文档）'}</div>
                </div>
              </>
            ) : (
              <div className={css.planDetailEmpty} style={{ minHeight: 300 }}>
                <span className={css.meta}>← 从左侧选择文档，或「＋ 新建文档」添加参考资料。</span>
              </div>
            )}
            {error !== '' && <div style={{ color: 'var(--nf-error)', fontSize: 'var(--nf-fs-14)' }}> {error}</div>}
          </div>
        </div>
      </div>
      <span className={css.meta}>自由参考文档：零散设定/资料/碎片放这里；结构化设定（世界观/角色/境界/红线）请放「本书设定」。</span>
    </div>
  )
}
