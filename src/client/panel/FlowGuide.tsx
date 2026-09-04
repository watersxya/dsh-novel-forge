/**
 * 漫剧工作台·全流程步骤条（唯一导航，方案X）：
 * ①创建方案 → ②一键生成 → ③分镜 → ④角色定妆 → ⑤场景底图 → ⑥导出使用。
 * 每个步骤对应一个独立页面主体；完成度自动判定（读 project 现有字段）。
 */
import type { ProjectState } from '../../protocol.ts'
import css from './panel.module.css'

/** 步骤 → 页面主体的一一对应目标。 */
export type FlowTarget =
  | 'plan'      // ① 创建方案页
  | 'rules'     // ② 视觉规则页
  | 'skeleton'  // ③ 剧情骨架页（分镜·骨架）
  | 'table'     // ④ 分镜表页（分镜·分镜表）
  | 'import'    // ⑤ 导入角色页（角色·导入）
  | 'makeup'    // ⑥ 角色定妆页（角色·卡片）
  | 'prompts'   // ⑦ 视频提示词页（分镜·提示词）
  | 'scenes'    // ⑧ 场景库页
  | 'props'     // ⑨ 道具库页
  | 'export'    // ⑩ 导出使用页

export interface FlowStep {
  no: number
  label: string
  hint: string
  done: boolean
  target: FlowTarget
}

/** 依据 project 数据计算 6 步完成度（与存储顺序无关，按生产顺序排列）。 */
export function computeFlowSteps(project: ProjectState | null, exported?: boolean): FlowStep[] {
  const plans = project?.mangaPlans ?? []
  const rules = project?.visualRules ?? []
  const sbs = project?.storyboards ?? []
  const manga = project?.mangaRoles ?? []
  const scenes = project?.scenes ?? []
  const props = project?.props ?? []
  const hasSkeleton = sbs.some(e => e.skeleton !== undefined)
  const hasTable = sbs.some(e => e.table !== undefined)
  const hasPrompts = sbs.some(e => (e.prompts ?? []).length > 0)
  return [
    { no: 1, label: '创建方案', hint: '选基底风格+题材并命名；此后所有提示词按此风格生成', done: plans.length > 0, target: 'plan' },
    { no: 2, label: '一键生成', hint: '选章节后自动做 剧情骨架→分镜表→角色导入；视频提示词留到⑤', done: hasTable, target: 'import' },
    { no: 3, label: '角色库', hint: '主要角色定妆图提示词→去即梦出图→建智能角色', done: manga.some(c => c.status === 'anchored'), target: 'makeup' },
    { no: 4, label: '场景库', hint: '（选做）从正文提炼场景卡并出场景参考图，提示词自动引用', done: scenes.length > 0, target: 'scenes' },
    { no: 5, label: '道具库', hint: '（选做）从正文提炼常驻道具，提示词里道具外观跨镜头统一', done: props.length > 0, target: 'props' },
    { no: 6, label: '分镜·提示词', hint: '生成逐镜即梦提示词（可粘贴）→复制去即梦；含导出存档', done: hasPrompts, target: 'prompts' },
  ]
}

export function FlowGuide({
  project,
  onNavigate,
  exported,
}: {
  project: ProjectState | null
  onNavigate: (target: FlowTarget) => void
  exported?: boolean
}) {
  const steps = computeFlowSteps(project, exported)
  const doneCount = steps.filter(s => s.done).length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-6)', marginTop: 'var(--nf-space-8)' }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={css.meta}>🧭 全流程（{doneCount}/{steps.length}）：每步一个页面，完成自动打勾</span>
        <span className={css.meta}>点击步骤打开对应页面</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
        {steps.map(s => (
          <button
            key={s.no}
            type="button"
            title={s.hint}
            className={css.button + ' ' + css.buttonSmall + (s.done ? ' ' + css.buttonPrimary : '')}
            style={{ minWidth: 0 }}
            onClick={() => { onNavigate(s.target) }}
          >
            {s.done ? '✓ ' : s.no + '. '}{s.label}
          </button>
        ))}
      </div>
    </div>
  )
}
