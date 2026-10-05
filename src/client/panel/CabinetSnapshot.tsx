/**
 * 资料侧柜内容（2.1.7）：本书此刻的生成上下文。
 *
 * 从 demo 的资料侧柜取**内容组织**：四张「此刻事实 + 新鲜度」卡 ——
 *   编年录最近锚点 / 人物志当前状态 / 剧情线最近推进 / 写作资产当前绑定。
 * 与 demo 的差别：数据全部取自真实存档（timeline / roleStatus / plotlines /
 * assets.styleAssets），缺数据时给**可执行的空态**而不是留空；
 * 「剧情线进度 42%」这类没有数据源的百分比不编（改用「推进章节 · 第 N 章」）。
 *
 * 形态由调用方决定：宿主里是**面板内的右滑抽屉**（demo 的 fixed 全屏遮罩层
 * 放进宿主会话列会盖住整个窗口）。
 */
import type { ProjectState } from '../../protocol.ts'
import css from './panel.module.css'

export function CabinetSnapshot({ project }: { project: ProjectState | null }): JSX.Element {
  const anchors = (project?.timeline ?? []).slice().sort((a, b) => (a.order ?? a.chapterNo) - (b.order ?? b.chapterNo))
  const lastAnchor = anchors[anchors.length - 1]
  const roleCard = (project?.roleStatus ?? [])[0]
  const activeLine = (project?.plotlines ?? []).find(l => l.status === 'active')
  const bound = project?.assets?.styleAssets ?? []

  return (
    <div className={css.cabinetSnapshot}>
      <div className={css.cabinetCard}>
        <div className={css.cabinetCardHead}><b>编年录 · 最近锚点</b><span>共 {anchors.length} 条</span></div>
        {lastAnchor !== undefined ? (
          <>
            <div className={css.cabinetCardBody}>
              {'第 ' + String(lastAnchor.chapterNo) + ' 章'}
              {lastAnchor.time !== '' ? '，' + lastAnchor.time : ''}
              {lastAnchor.place !== '' ? '；' + lastAnchor.place : ''}
              {lastAnchor.characters.length > 0 ? '；' + lastAnchor.characters.join('、') + '在场' : ''}
              {lastAnchor.event !== '' ? '；' + lastAnchor.event : ''}
            </div>
            <div className={css.cabinetCardMeta}><span>可注入后续生成</span><span data-tone="ok">已同步</span></div>
          </>
        ) : (
          <div className={css.cabinetCardEmpty}>尚未抽取编年录 —— 生成正文后自动抽取，用于保持后续章节的时间与地点衔接。</div>
        )}
      </div>

      <div className={css.cabinetCard}>
        <div className={css.cabinetCardHead}><b>人物志 · 当前状态</b><span>共 {(project?.roleStatus ?? []).length} 人</span></div>
        {roleCard !== undefined ? (
          <>
            <div className={css.cabinetCardBody}>{roleCard.name}：{roleCard.status}</div>
            <div className={css.cabinetCardMeta}>
              <span>最近出场 · 第 {roleCard.lastChapter} 章</span>
              <span>出场 {roleCard.appearances} 次</span>
            </div>
          </>
        ) : (
          <div className={css.cabinetCardEmpty}>还没有人物志快照 —— 到「角色库」从编年录刷新一次即可。</div>
        )}
      </div>

      <div className={css.cabinetCard}>
        <div className={css.cabinetCardHead}>
          <b>剧情线 · 最近推进</b>
          <span>{(project?.plotlines ?? []).filter(l => l.status === 'active').length} 条进行中</span>
        </div>
        {activeLine !== undefined ? (
          <>
            <div className={css.cabinetCardBody}>
              {activeLine.name}：{activeLine.progress !== '' ? activeLine.progress : activeLine.goal}
            </div>
            <div className={css.cabinetCardMeta}>
              <span>推进章节</span>
              <span>{activeLine.chapters.length > 0 ? '第 ' + String(activeLine.chapters[activeLine.chapters.length - 1]) + ' 章' : '尚未绑定章节'}</span>
            </div>
          </>
        ) : (
          <div className={css.cabinetCardEmpty}>没有进行中的剧情线 —— 可在「剧情线」页建一条主线。</div>
        )}
      </div>

      <div className={css.cabinetCard}>
        <div className={css.cabinetCardHead}><b>写作资产 · 当前绑定</b><span>共 {bound.length} 项</span></div>
        {bound.length > 0 ? (
          <>
            <div className={css.cabinetCardBody}>{bound.map(a => a.name).join(' / ')}</div>
            <div className={css.cabinetCardMeta}><span>生成与润色时注入</span><span data-tone="ok">已生效</span></div>
          </>
        ) : (
          <div className={css.cabinetCardEmpty}>尚未绑定写法资产 —— 到「资产」页绑定后，生成与润色都会带上它。</div>
        )}
      </div>
    </div>
  )
}
