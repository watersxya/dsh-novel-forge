/**
 * 书内知识库：添加/删除参考资料，生成/规划时自动检索注入。
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
      setDocs(r.docs); setTitle(''); setContent(''); setNotice('✅ 已添加')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const remove = async (id: string): Promise<void> => {
    setBusy(true); setError('')
    try {
      const r = await api.knowledgeRemove(id)
      setDocs(r.docs)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className={css.authorPageBody}>
      <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-10)' }}>
        <span className={css.cardTitle}>📚 书内知识库</span>
        <span className={css.meta}>自由参考文档：把零散设定/资料/参考放这里，正文生成会按当前章节检索注入。结构化设定（世界观/角色/境界/红线）请放「本书设定」，这里是补充/碎片资料。</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)' }}>
          <input className={css.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="标题（如：天机锁设定 / 止水驿关系表）" />
          <textarea className={css.input} style={{ minHeight: 100, resize: 'vertical' }} value={content} onChange={e => setContent(e.target.value)} placeholder="内容（将被检索注入生成提示）" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void add() }}>添加</button>
          {notice !== '' && <span style={{ fontSize: 12, color: 'var(--nf-success)' }}>{notice}</span>}
        </div>
      </div>

      {error !== '' && <div style={{ color: 'var(--nf-error)', fontSize: 13 }}>⚠ {error}</div>}

      <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-8)' }}>
        <span className={css.cardTitle}>已有文档（{docs.length}）</span>
        {docs.length === 0 ? <div style={{ color: 'var(--nf-text-2)', fontSize: 13 }}>暂无知识库文档。</div> : docs.map(d => (
          <div key={d.id} style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: 'var(--nf-space-8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ flex: 1 }}>{d.title}</b>
              <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { void remove(d.id) }}>删除</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--nf-text-2)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{d.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
