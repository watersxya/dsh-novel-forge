/**
 * 热门题材雷达的界面状态规则。
 *
 * 职责边界：本文件只回答「界面上此刻能不能点」，不持有任何数据。抽成纯函数的
 * 理由是它可以离线测——组件渲染不好测，判定逻辑好测。
 *
 * 下面先用**独立表述的验收条件**写清楚要什么，再由两个函数实现；这样即使日后
 * 需求变化，改动方向也是照着条件走，而不是照着某个外部实现的形状走。
 *
 *  R1 扫榜或分析进行中，不得改动作品勾选（否则分析输入与界面不一致）；
 *  R2 未勾选任何作品时不能开始分析；
 *  R3 已经有报告之后，仍允许改选作品并**再次**分析 —— 不得退化成"只能查看"；
 *  R4 信号勾选只在确实换了一份报告时复位；同一份报告的重渲染不得冲掉作者手选。
 */

/** 雷达三个入口此刻的可用性，以及分析按钮该显示哪种文案。 */
export interface RadarControls {
  /** 扫榜按钮是否可点。 */
  canScan: boolean
  /** 作品勾选（含全选 / 清空）是否可改。 */
  canSelectCandidates: boolean
  /** 分析按钮是否可点。 */
  canAnalyze: boolean
  /**
   * 分析按钮的文案标识：
   *  - `wait`：还在扫榜，先等榜单；
   *  - `pick`：还没勾选作品；
   *  - `first`：首次分析；
   *  - `again`：已有报告，这次是再出一份。
   */
  analyzeLabel: 'wait' | 'pick' | 'first' | 'again'
}

/**
 * 实现 R1-R3：判定三个入口的可用性。
 * @param state - 当前界面状态。
 * @returns 各入口可用性与分析按钮文案标识。
 */
export function radarControls(state: {
  /** 正在抓榜单。 */
  scanning: boolean
  /** 正在做 AI 分析。 */
  analyzing: boolean
  /** 已勾选的作品数。 */
  pickedCount: number
  /** 界面上是否已有可查看的报告。 */
  hasReport: boolean
}): RadarControls {
  if (state.analyzing) {
    // 分析中：三个入口都锁住（R1），按钮文案沿用上一次的状态不必区分。
    return { canScan: false, canSelectCandidates: false, canAnalyze: false, analyzeLabel: 'first' }
  }
  if (state.scanning) {
    return { canScan: false, canSelectCandidates: false, canAnalyze: false, analyzeLabel: 'wait' }
  }
  if (state.pickedCount === 0) {
    return { canScan: true, canSelectCandidates: true, canAnalyze: false, analyzeLabel: 'pick' }
  }
  return {
    canScan: true,
    canSelectCandidates: true,
    canAnalyze: true,
    // R3：有报告也只是换个文案，**不禁用**再分析。
    analyzeLabel: state.hasReport ? 'again' : 'first',
  }
}

/**
 * 实现 R4：本次报告是否**不是**勾选当前所依据的那一份。
 *
 * 传入的是上一次已经据以复位过的报告标识：相同 → 不动作者勾选；不同 → 勾选所依据
 * 的信号集合已经变了，需要按新报告重新给出推荐勾选。
 * @param selectionBasis - 勾选当前依据的报告标识（空串表示尚未复位过）。
 * @param incoming - 本次拿到的报告标识（空串表示旧版产物没有该标识）。
 * @returns 需要按新报告重置勾选时为 true。
 */
export function isDifferentReport(selectionBasis: string, incoming: string): boolean {
  return selectionBasis !== incoming
}
