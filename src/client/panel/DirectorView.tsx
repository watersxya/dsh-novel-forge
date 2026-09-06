/**
 * 自动编辑：基于全书上下文，给出下一卷/阶段编排建议 + 修复再平衡。
 * 生成后提供「傻瓜式」后续：一条条采纳 → 加入剧情线 / 加入待办，一键复制。
 */
import { useEffect, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { DirectorAdvice, DirectorTodo } from '../../protocol.ts'
import css from './panel.module.css'

export default function DirectorView({ api, todos, onTodosChange }: { api: NovelApi; todos: DirectorTodo[]; onTodosChange?: (todos: DirectorTodo[]) => void }): JSX.Element {
  const [focus, setFocus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<DirectorAdvice | null>(null)
  const [adopted, setAdopted] = useState<Set<string>>(new Set())
  const [todosBusy, setTodosBusy] = useState(false)

  const refreshTodos = async (): Promise<void> => {
    try {
      const r = await api.directorTodosList()
      onTodosChange?.(r.todos)
    } catch { /* ignore */ }
  }

  useEffect(() => { void refreshTodos() }, [])

  const markAdopted = (key: string): void => {
    setAdopted(prev => new Set(prev).add(key))
  }

  const run = async (): Promise<void> => {
    setBusy(true); setError('')
    try {
      const r = await api.director(focus.trim())
      setResult(r.result)
      void refreshTodos()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const adoptArc = async (s: string): Promise<void> => {
    try {
      await api.plotlines({ op: 'add', line: { id: '', name: s.slice(0, 16), kind: 'branch', goal: s, progress: '', status: 'active', chapters: [], createdAt: '' } })
      markAdopted('arc:' + s)
    } catch (e) { setError('加入剧情线失败：' + ((e as Error).message)) }
  }

  const adoptTodo = async (s: string, source: 'risk' | 'fix'): Promise<void> => {
    try {
      const r = await api.directorTodosAdd(s, source)
      onTodosChange?.(r.todos)
      markAdopted('todo:' + source + ':' + s)
    } catch (e) { setError('加入待办失败：' + ((e as Error).message)) }
  }

  const toggleTodo = async (id: string): Promise<void> => {
    setTodosBusy(true)
    try {
      const r = await api.directorTodosToggle(id)
      onTodosChange?.(r.todos)
    } catch (e) { setError((e as Error).message) } finally { setTodosBusy(false) }
  }

  const removeTodo = async (id: string): Promise<void> => {
    setTodosBusy(true)
    try {
      const r = await api.directorTodosRemove(id)
      onTodosChange?.(r.todos)
    } catch (e) { setError((e as Error).message) } finally { setTodosBusy(false) }
  }

  const copyAll = async (): Promise<void> => {
    if (result === null) return
    const text = [
      '【自动编辑】',
      `总体判断：${result.summary}`,
      '',
      '下一阶段节点：',
      ...(result.nextArc ?? []).map(s => `- ${s}`),
      '',
      `节奏板：${result.pacing}`,
      '',
      '风险提示：',
      ...(result.risks ?? []).map(s => `- ${s}`),
      '',
      '需要修复/再平衡：',
      ...(result.fixes ?? []).map(s => `- ${s}`),
    ].join('\n')
    try { await navigator.clipboard.writeText(text); setError('') } catch (e) { setError('复制失败：' + ((e as Error).message)) }
  }

  return (
    <div className={css.authorPageBody}>
      <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-10)' }}>
        <span className={css.cardTitle}>🎬 自动编辑</span>
        <span className={css.meta}>结合本书分卷/剧情线/伏笔/最近事实，给出下一阶段编排 + 修复再平衡。可什么都不填直接生成。</span>
        <textarea className={css.input} style={{ minHeight: 90, resize: 'vertical' }} value={focus} onChange={e => setFocus(e.target.value)} placeholder="可选：聚焦某个方向，如「主角成长节奏」「反派压迫感」「感情线处理」「下一卷转折」…" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void run() }}>
            {busy ? '编排中…' : '生成编排建议'}
          </button>
          {result !== null && (
            <button type="button" className={css.button} onClick={() => { void copyAll() }}>📋 一键复制</button>
          )}
        </div>
      </div>

      {error !== '' && <div style={{ color: 'var(--nf-error)', fontSize: 13 }}>⚠ {error}</div>}

      {/* 傻瓜式指引：生成后置顶 */}
      {result !== null && (
        <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-6)' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>🧭 这份建议怎么用（三步）</div>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13 }}>
            <li>先看「风险 / 修复」，点每条旁的 <b>加入待办</b>，记下来逐个处理。</li>
            <li>「下一阶段节点」每条可 <b>加入剧情线</b>，直接把下一步方向写进本书。</li>
            <li>「节奏板」对照你当前写到的地方，看该加快还是放慢；不确定就点 <b>一键复制</b> 保存。</li>
          </ol>
        </div>
      )}

      {result !== null && (
        <div style={{ display: 'grid', gap: 'var(--nf-space-10)' }}>
          <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-6)' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>总体判断</div>
            <div style={{ fontSize: 13 }}>{result.summary}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--nf-space-10)' }}>
            <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-6)' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>下一阶段剧情节点</div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }}>
                {(result.nextArc ?? []).map((s, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 160 }}>{s}</span>
                    <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={adopted.has('arc:' + s)} onClick={() => { void adoptArc(s) }}>
                      {adopted.has('arc:' + s) ? '已加入' : '采纳 → 加入剧情线'}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-6)' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>节奏板</div>
              <div style={{ fontSize: 13 }}>{result.pacing}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--nf-space-10)' }}>
            <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-6)' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>风险提示</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }}>
                {(result.risks ?? []).map((s, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 160 }}>{s}</span>
                    <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={adopted.has('todo:risk:' + s)} onClick={() => { void adoptTodo(s, 'risk') }}>
                      {adopted.has('todo:risk:' + s) ? '已加入' : '采纳 → 加入待办'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-6)' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>需要修复/再平衡</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }}>
                {(result.fixes ?? []).map((s, i) => (
                  <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, minWidth: 160 }}>{s}</span>
                    <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={adopted.has('todo:fix:' + s)} onClick={() => { void adoptTodo(s, 'fix') }}>
                      {adopted.has('todo:fix:' + s) ? '已加入' : '采纳 → 加入待办'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 已采纳待办清单（傻瓜式：勾选处理，做完删掉） */}
          <div className={`${css.card} ${css.settingsCard}`} style={{ gap: 'var(--nf-space-6)' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>🎬 编辑待办（已采纳）</div>
            {todos.length === 0 ? (
              <span className={css.meta}>还没有。点上面「加入待办」，把风险/修复记到这里，做完勾掉。这些也会出现在工作流主页的「待办队列」。</span>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6, fontSize: 13 }}>
                {todos.map(t => (
                  <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, cursor: 'pointer' }}>
                      <input type="checkbox" checked={t.done} disabled={todosBusy} onChange={() => { void toggleTodo(t.id) }} />
                      <span style={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--nf-text-2)' : undefined }}>{t.text}</span>
                    </label>
                    <button type="button" className={`${css.button} ${css.buttonSmall}`} title="删除" onClick={() => { void removeTodo(t.id) }}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
