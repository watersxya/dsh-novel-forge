/**
 * 生产单（Production Run）：批量章节生产的标准执行器。
 * 职责：计划补足 → 逐章生成（完整质量门）→ 被拒分级处理（豁免/修订+验证/待人工）→ 断点续跑。
 * 与路由层解耦：只依赖 engine 导出函数与磁盘状态，自身不碰 HTTP。
 * 串行纪律：单例执行器 + working 锁；每章重新从磁盘加载，写前合并易变字段。
 */
import { existsSync, mkdirSync, readFileSync, copyFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ChapterPlan, NovelConfig, ProjectState, ReviewReport, RunState } from './protocol.ts'
import {
  loadProject,
  saveProject,
  mergeVolatileFromDisk,
  planChapters,
  generateChapterStream,
  summarizeAndExtractFacts,
  extractTimelineForChapter,
  markForeshadowPlanted,
  reviewChapter,
  reviewChapterText,
  authorReviewChapter,
  autoLinkPlotlines,
  readChapterFile,
  rewriteChapterStream,
  chapterFileName,
} from './engine.ts'
import { countHanzi } from './engine.ts'
import { loadBookshelf } from './bookshelf.ts'
import { buildRevisionPlan, describeRevisionPlan, MAX_REVISION_ROUNDS, revisionTodoText } from './revision.ts'

/** 生产单 checkpoint 文件名（放在书目录下）。 */
function runStateFile(outputDir: string): string {
  return join(outputDir, 'run-state.json')
}

/**
 * 解析某个输出目录的书名（用于旧 run-state.json 的兜底）。
 * 优先项目文件里的 bookName，其次目录名——两者都没有时返回空串。
 * @param outputDir - 该书输出目录。
 */
export function resolveRunBookName(outputDir: string): string {
  const fromProject = loadProject(outputDir)?.bookName
  if (typeof fromProject === 'string' && fromProject.trim() !== '') return fromProject.trim()
  const base = outputDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
  return base.trim()
}

/**
 * 一句话描述"正在跑的是哪本书的哪一章"。
 * 面板状态行与 409 报错共用，避免两处各写各的（也便于单测覆盖）。
 * @param state - 运行中的生产单状态。
 */
export function describeRunningBatch(state: RunState): string {
  const name = typeof state.bookName === 'string' && state.bookName.trim() !== ''
    ? `《${state.bookName.trim()}》`
    : '未标注书目'
  return `${name}第${state.currentNo}章`
}

export class ProductionRunner {
  private state: RunState | null = null
  private working = false
  private pauseRequested = false
  private stopRequested = false
  /** 生产单绑定目录（start 时快照；所有读写固定用它，防止运行中切书导致写错目录）。 */
  private bookDir: string | null = null

  constructor(private deps: { ctx: Context; getConfig: () => NovelConfig }) {}

  /** 当前生产单状态（内存优先；web 重启后从磁盘恢复）。 */
  status(): RunState | null {
    if (this.state !== null) return this.state
    // 重启恢复：先找当前激活书目录，再扫书架所有书目录（防切书后找不到）。
    const candidates: string[] = [this.deps.getConfig().outputDir]
    const bookshelf = loadBookshelf()
    for (const b of bookshelf.books) if (!candidates.includes(b.outputDir)) candidates.push(b.outputDir)
    for (const outputDir of candidates) {
      const file = runStateFile(outputDir)
      if (!existsSync(file)) continue
      try {
        const raw = readFileSync(file, 'utf8')
        const parsed = JSON.parse(raw) as RunState
        if (parsed?.runId === undefined) continue
        // 重启恢复：若之前 running，则视为可续跑（loop 未在跑）。
        if (parsed.status === 'running') parsed.status = 'paused'
        // 旧 run-state.json 没有 bookName：用该目录的项目名兜底，再退回目录名，
        // 保证"这是哪本书"永远有答案（否则芯片/面板会显示一个无法归属的状态）。
        if (parsed.bookName === undefined || parsed.bookName === '') {
          parsed.bookName = resolveRunBookName(outputDir)
        }
        this.state = parsed
        this.bookDir = outputDir
        return this.state
      } catch { /* 该目录 run-state 损坏则跳过 */ }
    }
    return null
  }

  private persist(): void {
    if (this.state === null) return
    const outputDir = this.bookDir ?? this.deps.getConfig().outputDir
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(runStateFile(outputDir), JSON.stringify(this.state, null, 2), 'utf8')
  }

  private log(text: string): void {
    if (this.state === null) return
    this.state.log.push({ at: new Date().toISOString(), text })
    if (this.state.log.length > 300) this.state.log = this.state.log.slice(-300)
    this.state.updatedAt = new Date().toISOString()
  }

  /** 启动/续跑生产单：startNo..endNo 区间，endNo 超出计划时先自动补计划。 */
  async start(startNo: number, endNo: number, runDir?: string): Promise<RunState> {
    const config = this.deps.getConfig()
    if (this.working) {
      // 报错要说清"在跑哪本书的哪一章"：全局单实例，含糊的提示会让多书用户无从下手。
      const running = this.state
      throw new Error(running === null
        ? '生产单正在运行中，请先暂停或停止'
        : `生产单正在运行中（${describeRunningBatch(running)}），请先暂停或停止`)
    }
    const outputDir = runDir ?? config.outputDir
    let project = loadProject(outputDir)
    if (project === undefined) throw new Error('输出目录中没有项目')

    // 计划补足：目标区间超出已有计划 → 续写规划追加。
    if (endNo > project.chapters.length) {
      const need = endNo - project.chapters.length
      this.log(`计划不足，追加 ${need} 章计划…`)
      const chapters = await planChapters(this.deps.ctx, config, project, need, undefined, outputDir)
      mergeVolatileFromDisk(outputDir, project)
      project.chapters.push(...chapters)
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      this.log(`计划已追加，全书 ${project.chapters.length} 章`)
    }

    this.state = {
      runId: `run-${Date.now().toString(36)}`,
      bookName: project.bookName,
      startNo,
      endNo,
      status: 'running',
      currentNo: startNo,
      stats: { generated: 0, revised: 0, exempted: 0, regenerated: 0, error: 0 },
      pendingManual: [],
      log: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.pauseRequested = false
    this.stopRequested = false
    // 绑定生产单目录（快照）：运行期间切书不影响本单的读写目标。
    this.bookDir = outputDir
    this.working = true
    this.persist()
    void this.loop()
    return this.state
  }

  pause(): void { this.pauseRequested = true }
  resume(): void {
    if (this.state === null || this.state.status !== 'paused') return
    this.state.status = 'running'
    this.working = true
    this.pauseRequested = false
    this.stopRequested = false
    this.persist()
    void this.loop()
  }
  stop(): void { this.stopRequested = true }

  /** 是否有生产单正在执行（目录迁移等磁盘级操作前须为 false）。 */
  isWorking(): boolean { return this.working }

  /** 主循环：从 currentNo 扫描到 endNo，逐章处理；支持暂停/停止。 */
  private async loop(): Promise<void> {
    // 全部读写固定使用生产单绑定目录（bookDir），绝不跟随当前激活书。
    const config = this.deps.getConfig()
    const outputDir = this.bookDir ?? config.outputDir
    try {
      while (this.state !== null) {
        if (this.stopRequested) {
          this.stopRequested = false
          this.state.status = 'stopped'
          this.log('生产单已停止')
          this.persist()
          break
        }
        if (this.pauseRequested) {
          this.pauseRequested = false
          this.state.status = 'paused'
          this.log('生产单已暂停（随时可继续）')
          this.persist()
          break
        }
        const project = loadProject(outputDir)
        if (project === undefined) {
          this.state.status = 'error'
          this.state.error = '项目丢失'
          this.persist()
          break
        }
        // 找下一个需要处理的章（approved 快进）。
        let next: ChapterPlan | undefined
        for (let no = this.state.currentNo; no <= this.state.endNo; no++) {
          const ch = project.chapters.find(c => c.no === no)
          if (ch === undefined) continue
          if (ch.status === 'approved') { this.state.currentNo = no; continue }
          next = ch
          break
        }
        if (next === undefined) {
          this.state.status = 'done'
          this.log(`生产单完成：${this.state.startNo}-${this.state.endNo} 章处理完毕`)
          this.persist()
          break
        }
        this.state.currentNo = next.no
        await this.processChapter(project, next)
        this.persist()
      }
    } catch (error) {
      if (this.state !== null) {
        this.state.status = 'error'
        this.state.error = (error as Error).message
        this.log(`生产单异常：${(error as Error).message}`)
        this.persist()
      }
    } finally {
      this.working = false
    }
  }

  private async processChapter(project: ProjectState, chapter: ChapterPlan): Promise<void> {
    if (chapter.status === 'pending' || chapter.status === 'error' || chapter.status === 'written') {
      await this.produce(project, chapter)
    } else if (chapter.status === 'rejected') {
      await this.handleRejected(project, chapter)
    } else if (chapter.status === 'generating') {
      // 中断残留：复位重生成。
      chapter.status = 'pending'
      await this.produce(project, chapter)
    }
    this.auditChapterAdvisories(chapter.no)
  }

  /**
   * 出章即核对曲线（建议性，不阻塞）：
   * 规则初筛得到的时间线矛盾 + 张力曲线偏差写进运行日志；本章已完结时再落成项目待办。
   * 默认**不**触发任何自动修订——要看/要改由作者在面板发起「一键按建议修订」；
   * 只有当本章因审稿 high 本来就要修订时，这些问题才搭同一轮车（见 handleRejected），
   * 因此不额外增加轮次，也不会出现「改完甲又违反乙」。
   */
  private auditChapterAdvisories(chapterNo: number): void {
    const config = this.deps.getConfig()
    const outputDir = this.bookDir ?? config.outputDir
    const project = loadProject(outputDir)
    if (project === undefined) return
    const chapter = project.chapters.find(c => c.no === chapterNo)
    if (chapter === undefined) return
    // reviewIssues 传空数组：这里只核对曲线/时间线，审稿意见走审稿通道。
    const plan = buildRevisionPlan(project, { chapterNo, reviewIssues: [], includeTimeline: true, includeTension: true })
    if (plan.items.length === 0) return
    this.log(`第${chapterNo}章 曲线/时间线核对：${describeRevisionPlan(plan)}——建议性提示，未自动改动`)
    if (chapter.status !== 'approved') return
    if (plan.counts.timeline === 0 && plan.counts.tension === 0) return
    const todos = (project.todos ??= [])
    const added: string[] = []
    for (const item of plan.items.slice(0, 3)) {
      const text = revisionTodoText(item)
      if (todos.some(t => t.text === text)) continue
      todos.unshift({ id: `td-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, text, source: 'risk', done: false, createdAt: new Date().toISOString() })
      added.push(text)
    }
    if (added.length > 0) {
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      this.log(`第${chapterNo}章 已登记 ${added.length} 条建议性待办（可在时间线/张力面板一键按建议修订）`)
    }
  }

  /** 完整质量门：生成 → 摘要+事实 → 伏笔标记 → 审稿 → 作者复盘。 */
  private async produce(project: ProjectState, chapter: ChapterPlan): Promise<void> {
    const { ctx, getConfig } = this.deps
    const config = getConfig()
    const outputDir = this.bookDir ?? config.outputDir
    const no = chapter.no
    const wasError = chapter.status === 'error'
    chapter.status = 'generating'
    chapter.error = undefined
    chapter.generatingAt = new Date().toISOString()
    mergeVolatileFromDisk(outputDir, project)
    saveProject(outputDir, project)
    this.log(`${wasError ? '重新生成' : '生成'} 第${no}章《${chapter.title}》…（模型 ${config.generateModel || config.model}）`)
    try {
      for await (const _step of generateChapterStream(ctx, config, project, outputDir, no)) { /* drain */ }
      try { await summarizeAndExtractFacts(ctx, config, project, outputDir, no) } catch (e) { console.warn('[dsh-novel-forge] run summary/facts:', (e as Error).message) }
      if (config.autoTimeline ?? true) {
        try { await extractTimelineForChapter(ctx, config, project, outputDir, no) } catch (e) { console.warn('[dsh-novel-forge] run timeline:', (e as Error).message) }
      }
      try { markForeshadowPlanted(project, outputDir, no) } catch (e) { console.warn('[dsh-novel-forge] run foreshadow:', (e as Error).message) }
      if (config.autoReview ?? true) {
        const report = await reviewChapter(ctx, config, project, outputDir, no)
        if (this.state !== null) this.state.stats[wasError ? 'regenerated' : 'generated']++
        this.log(`第${no}章 审稿 ${report.score}分 ${report.passed ? ' 通过' : ' 被拒'}（模型 ${config.reviewModel || config.model}）`)
      } else {
        chapter.status = 'approved'
        mergeVolatileFromDisk(outputDir, project)
        saveProject(outputDir, project)
      }
      if (config.autoAuthorReview ?? true) {
        try {
          const body = readChapterFile(outputDir, chapter)
          if (body !== undefined) {
            let prevTail = ''
            if (no > 1) {
              const prev = project.chapters.find(c => c.no === no - 1)
              if (prev !== undefined) prevTail = (readChapterFile(outputDir, prev) ?? '').replace(/^#.*$/m, '').trim().slice(-600)
            }
            const review = await authorReviewChapter(ctx, config, project, no, body, prevTail)
            chapter.authorReview = review
            if (review.advancedLines !== undefined) autoLinkPlotlines(project, no, review.advancedLines)
            // 结果回灌：把本章状态变化/新线索写进编年录事实库，供后续计划与整本控制用。
            const backfillFacts: string[] = [...(review.stateChanges ?? []), ...(review.clues ?? [])]
            if (backfillFacts.length > 0) {
              project.facts ??= []
              for (const text of backfillFacts) project.facts.push({ chapterNo: no, text })
            }
            mergeVolatileFromDisk(outputDir, project)
            saveProject(outputDir, project)
          }
        } catch (e) { console.warn('[dsh-novel-forge] run author review:', (e as Error).message) }
      }
    } catch (error) {
      chapter.status = 'error'
      chapter.error = (error as Error).message
      mergeVolatileFromDisk(outputDir, project)
      saveProject(outputDir, project)
      if (this.state !== null) this.state.stats.error++
      this.log(`第${no}章 失败：${(error as Error).message}`)
    }
  }

  /** 被拒分级处理：无 high 豁免；有 high 按意见修订（最多 2 轮）+ 验证模式；仍不过 → 待人工。 */
  private async handleRejected(project: ProjectState, chapter: ChapterPlan): Promise<void> {
    const { ctx, getConfig } = this.deps
    const config = getConfig()
    const outputDir = this.bookDir ?? config.outputDir
    const no = chapter.no
    const report = chapter.review
    const highs = (report?.issues ?? []).filter(i => i.severity === 'high')
    if (highs.length === 0) {
      chapter.status = 'approved'
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      if (this.state !== null) this.state.stats.exempted++
      this.log(`第${no}章 豁免通过（无 high）`)
      return
    }
    // 合并层：审稿 high + 时间线矛盾 + 张力偏差 → 一份指令，一轮改完。
    // 张力/时间线本身不触发修订（建议性），只在「反正要改」时搭车，避免多通道互相覆盖。
    let plan = buildRevisionPlan(project, { chapterNo: no, reviewIssues: highs, baseReport: report })
    this.log(`第${no}章 修订（${describeRevisionPlan(plan)}）…`)
    if (plan.omitted > 0) this.log(`第${no}章 修订指令已截断 ${plan.omitted} 条（超出单轮上限，优先级低者留待下一轮）`)
    for (let round = 1; round <= MAX_REVISION_ROUNDS; round++) {
      const instr = plan.instruction
      try {
        for await (const _step of rewriteChapterStream(ctx, config, project, outputDir, no, instr, undefined)) { /* drain */ }
      } catch (error) {
        this.log(`第${no}章 第${round}轮修订出错：${(error as Error).message}`)
        continue
      }
      // rewrite 已写盘（pendingDraft + saveProject），重载拿最新草稿。
      const fresh = loadProject(outputDir)
      const freshCh = fresh?.chapters.find(c => c.no === no)
      const draft = freshCh?.pendingDraft
      if (draft === undefined || draft.length < 50) {
        this.log(`第${no}章 第${round}轮草稿缺失，重试`)
        continue
      }
      // 验证基准 = 本轮实际下发的全部条目（审稿 + 时间线 + 张力）：复核核对的就是「要求改的东西」。
      const verify = await reviewChapterText(ctx, config, fresh!, draft, plan.baseline)
      const highs2 = (verify.issues ?? []).filter(i => i.severity === 'high')
      if (verify.passed || highs2.length === 0) {
        // 应用草稿（与 draft/apply 路由同逻辑）：备份原稿 → 落盘 → 定状态。
        this.applyDraft(fresh!, freshCh!, draft, verify)
        if (this.state !== null) this.state.stats.revised++
        this.log(`第${no}章 第${round}轮修订通过（${verify.score}分）`)
        return
      }
      this.log(`第${no}章 第${round}轮仍不过（${highs2.length} high）`)
      // 下一轮重新合并：以本轮仍未解决的 high 为审稿来源，并重新核对时间线/张力
      // （上一轮基线里已解决的条目不再下发，避免「越修越多」）。
      plan = buildRevisionPlan(fresh ?? project, { chapterNo: no, reviewIssues: highs2, baseReport: verify })
    }
    if (this.state !== null) this.state.pendingManual.push(no)
    this.log(`第${no}章  ${MAX_REVISION_ROUNDS} 轮修订仍不过 → 保留草稿待人工`)
  }

  private applyDraft(project: ProjectState, chapter: ChapterPlan, draft: string, report: ReviewReport): void {
    const config = this.deps.getConfig()
    const outputDir = this.bookDir ?? config.outputDir
    const fileName = chapterFileName(chapter)
    mkdirSync(outputDir, { recursive: true })
    const targetPath = join(outputDir, fileName)
    if (existsSync(targetPath)) {
      copyFileSync(targetPath, join(outputDir, `${fileName.replace(/\.md$/, '')}.bak.md`))
    }
    writeFileSync(targetPath, `# 第${chapter.no}章 ${chapter.title}\n\n${draft}\n`, 'utf8')
    chapter.pendingDraft = undefined
    chapter.chars = countHanzi(draft)
    chapter.file = fileName
    if (typeof report.score === 'number') {
      chapter.review = report
      chapter.status = report.passed === true ? 'approved' : 'rejected'
    } else {
      chapter.status = 'written'
      chapter.review = undefined
    }
    chapter.error = undefined
    project.updatedAt = new Date().toISOString()
    saveProject(outputDir, project)
  }
}
