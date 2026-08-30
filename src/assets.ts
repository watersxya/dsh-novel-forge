/**
 * Writing assets — 题材基底库 / 推进模式库 / 反 AI 规则 / 写法引擎.
 *
 * Ported from AI-Novel-Writing-Assistant (Apache-2.0) built-in seed data:
 * - 8 preset style templates (DEFAULT_STYLE_TEMPLATES)
 * - 12 anti-AI rules with concrete detect patterns (DEFAULT_ANTI_AI_RULES)
 * - genre tree + progression mode seeds
 * Assets persist with the project (novel-project.json) and are injected into
 * generation / planning / review prompts, and available to the AI assistant.
 */

import type { AntiAiRule, GenreNode, PlotBeatTemplate, ProgressionMode, ProjectAssets, StyleAsset, StyleTemplate } from './protocol.ts'

// ------------------------------------------------------ built-in style templates

/** 预置写法模板（来自 AI-Novel-Writing-Assistant 内置 DEFAULT_STYLE_TEMPLATES）。 */
export const BUILTIN_STYLE_TEMPLATES: StyleTemplate[] = [
  {
    key: 'power-up-escalation',
    name: '爽文递进推进流',
    description: '持续升级冲突和收益点，强化目标推进与爽点兑现。',
    category: '爽文流',
    applicableGenres: ['都市', '玄幻', '热血'],
    proseRules: [
      '围绕目标推进，尽快兑现局部收益；每段都要有目标推进或爽点兑现。',
      '保持明确因果和节奏抬升，场景单元按「目标→阻碍→压制→反转收益」推进。',
      '优先冲突和结果，少停留；段尾用钩子收束。',
    ],
    dialogueRules: [
      '角色表达直接，情绪跟随胜负切换。',
      '对话承担推进与信息功能，但保留角色自己的语气差异。',
    ],
    languageRules: [
      '句式清晰，减少无效分散信息。',
      '直接、明确，不做无谓铺垫。',
    ],
    rhythmRules: [
      '快节奏，段落密度中等，动作先于解释。',
      '尽快兑现局部收益，避免拖沓。',
    ],
    defaultAntiAiRuleKeys: ['禁止总结主题', '对话纯功能推进', '连续三段解释性叙事'],
  },
  {
    key: 'bottom-loop-reality',
    name: '底层循环现实流',
    description: '通过碎片化生活与反复落空表现人物困境。',
    category: '现实流',
    applicableGenres: ['都市', '现实', '成长'],
    proseRules: [
      '以时间推进和现实落差构成叙事张力，结尾不解决核心困境。',
      '场景单元按「行为→落差→自我合理化」推进。',
      '以碎片化生活推进，不做总括式回顾。',
    ],
    dialogueRules: [
      '人物情绪通过动作和嘴硬表达，允许短促口语化台词。',
      '对话保留生活杂音与无效信息。',
    ],
    languageRules: [
      '语言粗粝、口语化，允许生活杂音与不完整句。',
      '句子变化度高，允许无意义细节。',
    ],
    rhythmRules: [
      '段落密实，动作先于解释。',
      '中快节奏，允许碎片化流动。',
    ],
    defaultAntiAiRuleKeys: ['禁止解释型心理描写', '禁止段尾升华', '鼓励无意义小动作', '鼓励现实落差', '鼓励嘴硬补偿'],
  },
  {
    key: 'suspense-pressure',
    name: '悬疑压迫递增流',
    description: '通过信息遮蔽、细节异常和压力叠加制造不安感。',
    category: '悬疑流',
    applicableGenres: ['悬疑', '惊悚', '现实'],
    proseRules: [
      '以异常细节、信息差和节奏收束推动悬念层层加压。',
      '场景单元按「现场细节→异常→误判→新风险」推进。',
      '优先制造信息缺口和压迫氛围。',
    ],
    dialogueRules: [
      '角色反应克制，恐惧通过反应显现。',
      '对话保留克制感，不解释恐惧来源。',
    ],
    languageRules: [
      '细节精确，保留少量噪音增强现场感。',
      '克制、中等偏高句变化。',
    ],
    rhythmRules: [
      '通过节奏收束和信息延迟制造压力。',
      '中速，段落密度中等偏高。',
    ],
    defaultAntiAiRuleKeys: ['禁止解释型心理描写', '禁止总结主题', '段落长度过于整齐', '鼓励现实落差'],
  },
  {
    key: 'emotional-tension',
    name: '情绪拉扯流',
    description: '通过错位表达、停顿和误读制造关系张力。',
    category: '情感流',
    applicableGenres: ['言情', '都市', '群像'],
    proseRules: [
      '人物不直说核心情绪，靠误读、停顿和反应推动关系变化。',
      '场景单元按「动作→言外之意→误读→回避」推进。',
      '以关系错位推进，而非直接说明。',
    ],
    dialogueRules: [
      '情绪通过停顿、动作和言外之意体现。',
      '对话充满潜台词与试探。',
    ],
    languageRules: [
      '语言自然，允许留白与停顿。',
      '句子变化度高，允许无意义细节。',
    ],
    rhythmRules: [
      '给关系反应留空间，但避免空洞抒情。',
      '中慢节奏，段落密度中等。',
    ],
    defaultAntiAiRuleKeys: ['禁止直接说教', '禁止段尾升华', '对话纯功能推进', '鼓励无意义小动作'],
  },
  {
    key: 'ensemble-weave',
    name: '群像交织流',
    description: '以多人行动线和视角差异交织推进事件。',
    category: '群像流',
    applicableGenres: ['群像', '都市', '悬疑'],
    proseRules: [
      '多角色并行推进，但每个角色的表达和认知范围必须区分清楚。',
      '多线并进，但视角切换要受控。',
    ],
    dialogueRules: [
      '不同角色口吻必须拉开差异，避免所有人说话一样。',
    ],
    languageRules: [
      '保持角色差异，句式变化度高。',
      '减少无效分散信息。',
    ],
    rhythmRules: [
      '多线交织但节奏不乱，平衡推进。',
      '动作先于解释。',
    ],
    defaultAntiAiRuleKeys: ['对话纯功能推进', '句式重复率过高', '禁止总结主题'],
  },
  {
    key: 'immersive-daily',
    name: '日常浸没流',
    description: '通过生活细节和细微情绪变化建立持续沉浸感。',
    category: '日常流',
    applicableGenres: ['日常', '治愈', '都市'],
    proseRules: [
      '重场景体验和关系温度，核心情绪通过场景自然流出。',
      '允许保留生活性动作和无效信息。',
    ],
    dialogueRules: [
      '人物表达自然，不用高强度戏剧句。',
      '对话保留生活气息。',
    ],
    languageRules: [
      '保留生活细节和杂音，不追求工整。',
      '口语化，句子变化中等偏高。',
    ],
    rhythmRules: [
      '慢节奏沉浸，但避免空转。',
      '允许碎片化流动。',
    ],
    defaultAntiAiRuleKeys: ['禁止段尾升华', '段落长度过于整齐', '鼓励无意义小动作'],
  },
  {
    key: 'cold-professional',
    name: '冷峻专业流',
    description: '以专业事实和行业细节压住情绪，形成克制压力感。',
    category: '专业流',
    applicableGenres: ['职场', '现实', '悬疑'],
    proseRules: [
      '行业事实和程序细节优先，情绪不直说，信息密度高于抒情密度。',
      '场景单元按「事实→动作→专业判断→后果」推进。',
      '让专业事实承担叙事重量。',
    ],
    dialogueRules: [
      '情绪藏在专业动作和事实选择里。',
      '对话以信息性表达为主，克制。',
    ],
    languageRules: [
      '术语和事实优先，避免廉价金句。',
      '正式、克制的语言。',
    ],
    rhythmRules: [
      '信息密度高，但不铺张解释。',
      '平衡节奏，段落密度中等偏高。',
    ],
    defaultAntiAiRuleKeys: ['禁止直接说教', '禁止总结主题', '句式重复率过高'],
  },
  {
    key: 'absurd-dark-humor',
    name: '荒诞黑色幽默流',
    description: '通过反差、冷感观察和荒诞细节制造黑色幽默。',
    category: '黑色幽默',
    applicableGenres: ['都市', '黑色幽默', '现实'],
    proseRules: [
      '用反差和荒诞细节放大现实困境，笑点和压迫感同时存在。',
      '场景单元按「现实细节→荒诞偏差→冷反应」推进。',
      '依赖反差和冷感观察，而非热闹吐槽。',
    ],
    dialogueRules: [
      '情绪藏在冷反应和嘴硬里。',
      '台词冷面、口语化，允许自嘲与转移。',
    ],
    languageRules: [
      '允许夹带荒诞杂质和冷幽默节奏。',
      '口语化，句子变化度高。',
    ],
    rhythmRules: [
      '反差点要快落地，不要解释笑点。',
      '平衡节奏，段落密度中等偏高。',
    ],
    defaultAntiAiRuleKeys: ['禁止解释型心理描写', '禁止段尾升华', '鼓励现实落差', '鼓励嘴硬补偿'],
  },
]

// ---------------------------------------------------------- built-in rules

/** 内置全局反 AI 规则（来自 AI-Novel-Writing-Assistant 内置 DEFAULT_ANTI_AI_RULES）。 */
export const BUILTIN_ANTI_AI_RULES: AntiAiRule[] = [
  {
    name: '禁止解释型心理描写',
    avoid: '直接使用"他感到""他意识到""他明白了"等句式解释人物心理。',
    fix: '把心理解释改成动作、语气、停顿、环境反应或结果。',
    detectPatterns: ['他感到', '她感到', '他意识到', '她意识到', '他明白了', '她明白了'],
    builtin: true,
  },
  {
    name: '禁止段尾升华',
    avoid: '在段尾或收尾处用总结句升华主题（如"生活就是""命运总会""说到底"）。',
    fix: '删除升华句，回到具体动作、现场或悬而未决的处境。',
    detectPatterns: ['生活就是', '命运总会', '归根结底', '说到底', '这就是'],
    builtin: true,
  },
  {
    name: '禁止总结主题',
    avoid: '把段落写成总结中心思想或提炼人生道理（如"这说明""这意味着"）。',
    fix: '删掉主题总结，让信息通过事件和结果自然显现。',
    detectPatterns: ['这说明', '这意味着', '归根结底', '其实就是'],
    builtin: true,
  },
  {
    name: '禁止直接说教',
    avoid: '作者替角色或读者做直接价值判断和说教（如"我们都应该""人总要学会"）。',
    fix: '改成角色具体处境或对话，不做抽象说教。',
    detectPatterns: ['我们都应该', '人总要学会', '真正重要的是'],
    builtin: true,
  },
  {
    name: '段落长度过于整齐',
    avoid: '段落长度和节奏过于平均，产生 AI 作文感。',
    fix: '打破段落长度均衡，让句子和段落有自然起伏。',
    detectPatterns: [],
    builtin: true,
  },
  {
    name: '连续三段解释性叙事',
    avoid: '连续几段只有解释没有动作，削弱现场感。',
    fix: '插入动作、对话、环境反馈，减少连段说明。',
    detectPatterns: [],
    builtin: true,
  },
  {
    name: '对话纯功能推进',
    avoid: '对话只有信息推进，没有人物语气和生活噪音（如"告诉你""我们现在要"）。',
    fix: '补入停顿、绕弯、语气差异和无效信息。',
    detectPatterns: ['告诉你', '我们现在要', '接下来就'],
    builtin: true,
  },
  {
    name: '句式重复率过高',
    avoid: '连续句式过于整齐（如"首先""然后""接着""最后"），显得机械。',
    fix: '拉开句式长度和起句方式，打散结构。',
    detectPatterns: ['首先', '然后', '接着', '最后'],
    builtin: true,
  },
  {
    name: 'AI 高频套话',
    avoid: '滥用"不禁""仿佛""一时间""不由得""顿时""然而""缓缓""轻轻""微微""似乎""终于"等模式词及套路比喻。',
    fix: '用具体、有画面感的表达替换套话；每个比喻都应当是新造的。',
    detectPatterns: ['不禁', '仿佛', '一时间', '不由得', '顿时', '缓缓', '轻轻', '微微'],
    builtin: true,
  },
  {
    name: '鼓励无意义小动作',
    avoid: '（鼓励类）全篇缺少真实但不推动主线的小动作，人物显得空洞。',
    fix: '补入挠头、点烟、抠包装、挪椅子等小动作，增加人味与生活感。',
    detectPatterns: [],
    builtin: true,
  },
  {
    name: '鼓励现实落差',
    avoid: '（鼓励类）人物预期和现实结果完全一致，缺少落差。',
    fix: '补出人物预期与实际结果之间的差距，制造张力。',
    detectPatterns: [],
    builtin: true,
  },
  {
    name: '鼓励嘴硬补偿',
    avoid: '（鼓励类）人物吃瘪后没有维持体面的反应。',
    fix: '给角色补一句嘴硬找补或自我合理化，保持人设温度。',
    detectPatterns: [],
    builtin: true,
  },
]

/** 内置题材基底库（常用网文题材树，跨书复用）。 */
export const BUILTIN_GENRE_LIBRARY: GenreNode[] = [
  {
    name: '仙侠修真',
    description: '以修仙境界、宗门斗争、法宝丹药为核心，读者期待从凡人到强者的成长与长生问道。',
    children: [
      { name: '凡人流', description: '资质平凡、步步为营，靠资源积累与心机博弈逆袭，强调真实感与代入感。', children: [] },
      { name: '苟道流', description: '主角苟且发育、藏锋敛芒，坐收渔利，强调生存智慧与反差爽点。', children: [] },
      { name: '争霸流', description: '宗门、王朝或大陆争锋，主角由弱到强整合势力，强调格局与权谋。', children: [] },
    ],
  },
  {
    name: '都市异能',
    description: '现代都市背景叠加超能力，读者期待隐藏身份、扮猪吃虎与日常反差。',
    children: [
      { name: '异能升级', description: '觉醒超能力后不断变强，隐藏于都市，遇敌碾压。', children: [] },
      { name: '重生复仇', description: '重生回到过去，利用先知先觉改变命运、清算仇敌。', children: [] },
      { name: '商业经营', description: '以超能力或见识经商扩张，建立商业帝国，强调经营爽感。', children: [] },
    ],
  },
  {
    name: '悬疑推理',
    description: '以谜题、案件与真相揭露为核心，读者期待线索层层展开与反转。',
    children: [
      { name: '本格推理', description: '公平线索、逻辑推演，读者可与主角一同解谜。', children: [] },
      { name: '刑侦探案', description: '警察或侦探视角连续破案，案件串联主线，强调现实与人性。', children: [] },
      { name: '无限流', description: '主角穿梭于不同副本世界解谜求生，副本之间累积成长。', children: [] },
    ],
  },
  {
    name: '玄幻奇幻',
    description: '异世界或架空大陆的冒险成长，读者期待宏大世界观、奇遇与战力突破。',
    children: [
      { name: '学院流', description: '入学修炼、同窗竞争、大赛扬名，强调青春感与阶梯式打脸。', children: [] },
      { name: '废柴逆袭', description: '开局废柴受辱，觉醒金手指后一路逆袭打脸，强调反差与爽点。', children: [] },
      { name: '诸天万界', description: '穿越诸天世界收集资源与能力，强调世界多样性与成长曲线。', children: [] },
    ],
  },
  {
    name: '历史军事',
    description: '以历史时代为背景的争霸、谋略或军旅故事，读者期待权谋博弈与时代质感。',
    children: [
      { name: '王朝争霸', description: '乱世崛起、招贤纳士、逐鹿天下，强调战略与人心。', children: [] },
      { name: '穿越种田', description: '穿越古代发展生产、经营家族，强调建设感与生活细节。', children: [] },
    ],
  },
  {
    name: '末世科幻',
    description: '末世危机或科幻设定下的生存与重建，读者期待资源管理、危机升级与人性考验。',
    children: [
      { name: '基地经营', description: '建立基地、收集资源、抵御危机，强调建设与扩张。', children: [] },
      { name: '进化觉醒', description: '末世异变中觉醒能力不断进化，强调战力成长与危机求生。', children: [] },
    ],
  },
]

/** 内置常用推进模式。 */
export const BUILTIN_PROGRESSION_MODES: ProgressionMode[] = [
  {
    name: '升级变强',
    driver: '主角的实力、境界或能力持续增长，读者期待每次突破带来的碾压与认可。',
    readerExpectation: '每隔几章有一次明确的实力提升或打脸兑现；大境界突破要有仪式感。',
    payoffs: ['突破境界', '学会新技能', '越级战胜强敌', '当众打脸质疑者'],
    risks: ['升级重复套路', '战力膨胀失控', '无铺垫强行突破'],
    primary: false,
  },
  {
    name: '经营扩张',
    driver: '主角的产业、势力或领地不断扩张，资源复利滚雪球。',
    readerExpectation: '经营投入有可感知的回报，扩张遇到新挑战并解决。',
    payoffs: ['新产业上线', '规模翻倍', '吞并对手', '资源闭环成型'],
    risks: ['过程枯燥', '扩张无阻力', '数值失衡'],
    primary: false,
  },
  {
    name: '解谜揭露',
    driver: '主线谜团（身世、阴谋、世界观真相）持续牵引读者，每揭开一层又引出更深一层。',
    readerExpectation: '定期有真相碎片放出，回收旧伏笔、埋设新伏笔。',
    payoffs: ['伏笔回收', '身份揭露', '阴谋浮出水面', '反转打脸'],
    risks: ['谜题拖太久', '伏笔忘记回收', '反转生硬'],
    primary: false,
  },
  {
    name: '渔翁得利',
    driver: '强敌相互厮杀，主角躲在暗处观察、收割，风险由他人承担、果实由主角获取。',
    readerExpectation: '冲突升级时主角以最小代价获取最大收益，且不暴露自身。',
    payoffs: ['坐收渔利', '捡漏宝物', '敌人两败俱伤', '信息差获利'],
    risks: ['重复套路', '收割太轻易', '主角全程无风险'],
    primary: false,
  },
  {
    name: '关系拉扯',
    driver: '人物关系（知己、对手、师徒、情感线）的张力与变化持续推动剧情。',
    readerExpectation: '关系有进有退、有误会与和解，情绪起伏带动阅读欲。',
    payoffs: ['关系升温', '信任建立', '背叛与挽回', '并肩作战'],
    risks: ['情感线停滞', '工业糖精', '为虐而虐'],
    primary: false,
  },
]

// ------------------------------------------------------ built-in plot beats

/** 剧情桥段库：可复用情节套路（作者阅读经验沉淀，非某本书的剧情线）。 */
export const BUILTIN_PLOT_BEATS: PlotBeatTemplate[] = [
  { key: 'play-weak', name: '扮猪吃虎', category: '装逼打脸', summary: '主角示弱/隐藏实力，关键时刻亮出獠牙，反差打脸。', position: '前期/中期', preconditions: ['主角有远超表面的实力', '有旁观者低估他'], payoffSource: ['身份反差', '实力揭晓时众人错愕', '质疑者被打脸'], combos: ['打脸', '身份揭露'], taboos: ['示弱太久读者憋屈', '反转无铺垫'], applicableGenres: ['都市', '玄幻', '仙侠'] },
  { key: 'face-slap', name: '打脸', category: '装逼打脸', summary: '挑衅者趾高气扬，主角一击让其灰头土脸，情绪宣泄。', position: '任何', preconditions: ['挑衅者有明确的优越感', '主角有强出一截的底牌'], payoffSource: ['当众羞辱反杀', '围观者态度反转'], combos: ['扮猪吃虎', '大比'], taboos: ['连续无新意打脸', '羞辱过头读者不适'], applicableGenres: ['都市', '玄幻', '仙侠'] },
  { key: 'broken-engagement', name: '退婚/反悔', category: '身份逆袭', summary: '被退婚/被轻视→用实力打回，顺势立目标。', position: '开局/前期', preconditions: ['主角处于弱势', '退婚方势利'], payoffSource: ['被轻贱→反杀', '立下目标'], combos: ['打脸', '金手指亮相'], taboos: ['拖大几十章才洗', '女主误会太久'], applicableGenres: ['玄幻', '都市', '豪门'] },
  { key: 'auction-bargain', name: '拍卖会捡漏', category: '机缘', summary: '主角在拍卖会上用独到眼光/信息差捞到被低估的宝物。', position: '中期', preconditions: ['主角有识货能力/金手指', '现场有争夺者'], payoffSource: ['捡漏爽', '争夺者懊悔'], combos: ['渔翁得利', '宝物升级'], taboos: ['全程顺风顺水无波折', '宝物无后续用处'], applicableGenres: ['玄幻', '仙侠', '都市'] },
  { key: 'secret-realm', name: '秘境/夺宝', category: '机缘', summary: '秘境开启，主角入内夺宝/悟道，或遇强敌/阴谋。', position: '中期/后期', preconditions: ['秘境有明确利益', '竞争者众多'], payoffSource: ['机缘得宝', '危机中成长'], combos: ['夺宝', '绝境翻盘'], taboos: ['宝物白给', '危机虎头蛇尾'], applicableGenres: ['仙侠', '玄幻', '悬疑'] },
  { key: 'misunderstanding', name: '误会/解释不清', category: '情感拉扯', summary: '一方误解另一方的行为，情绪拉满后解开。', position: '任何', preconditions: ['信息不对称', '两方都在意关系'], payoffSource: ['误会造痛', '和解破冰'], combos: ['关系拉扯', '身份揭露'], taboos: ['误会拖太久', '为虐而虐'], applicableGenres: ['都市', '情感', '古言'] },
  { key: 'last-stand', name: '绝境翻盘', category: '战斗', summary: '主角被逼到绝境，借助底牌/意志完成反杀。', position: '高潮', preconditions: ['主角实力明显劣势', '有破局底牌'], payoffSource: ['绝处逢生', '反派嚣张后被打脸'], combos: ['金手指爆发', '打脸'], taboos: ['开挂太突兀', '翻盘无代价'], applicableGenres: ['玄幻', '武侠', '无限流'] },
  { key: 'tournament', name: '大比/比试', category: '升级打脸', summary: '宗门/势力大比，主角一路过关，暴露实力、收获名声。', position: '中期/后期', preconditions: ['有正式舞台', '有看客与对手'], payoffSource: ['连胜升级', '众目睽睽下打脸'], combos: ['打脸', '身份揭露'], taboos: ['比赛水太多', '对手全送脸'], applicableGenres: ['仙侠', '玄幻', '体育竞技'] },
  { key: 'identity-reveal', name: '身份揭露', category: '反转', summary: '主角/配角的隐藏身份在关键时点揭开，颠覆认知。', position: '中期/后期', preconditions: ['身份有可埋伏的线索', '揭开时机能引爆情绪'], payoffSource: ['认知颠覆', '立场反转'], combos: ['打脸', '误会解开'], taboos: ['毫无伏笔硬揭', '身份设定无意义'], applicableGenres: ['悬疑', '古言', '玄幻'] },
]

// ------------------------------------------------------------- persistence

/** 默认（空）项目写作资产。 */
export function emptyProjectAssets(): ProjectAssets {
  return {
    auxiliaryProgressions: [],
    antiAiRules: [],
    styleAssets: [],
  }
}

/** 合并项目资产与内置库：返回「生效的反 AI 规则」（内置全局 + 项目自定义）。 */
export function effectiveAntiAiRules(assets: ProjectAssets | undefined): AntiAiRule[] {
  const custom = assets?.antiAiRules ?? []
  const customNames = new Set(custom.map(r => r.name))
  return [...BUILTIN_ANTI_AI_RULES.filter(r => !customNames.has(r.name)), ...custom]
}

/** 把生效规则渲染成提示词块（压缩：avoid/fix 截断，省 token）。 */
export function renderAntiAiRules(assets: ProjectAssets | undefined): string {
  const rules = effectiveAntiAiRules(assets)
  if (rules.length === 0) return ''
  const clip = (value: string, max: number): string => value.length > max ? value.slice(0, max) + '…' : value
  return [
    '==================== 反 AI 规则（写作时必须遵守的表达边界） ====================',
    ...rules.map(r => `- ${r.name}：避免——${clip(r.avoid, 90)}${r.fix !== '' ? `；修正——${clip(r.fix, 50)}` : ''}`),
  ].join('\n')
}

/** 渲染题材与推进模式提示词块。 */
export function renderGenreAndProgression(assets: ProjectAssets | undefined): string {
  const sections: string[] = []
  if (assets?.genre !== undefined) {
    sections.push('==================== 题材基底（本书的题材定位与读者期待） ====================')
    sections.push(`题材：${assets.genre.name}`)
    if (assets.genre.description !== '') sections.push(`读者期待：${assets.genre.description}`)
    const walk = (node: GenreNode, depth: number): void => {
      for (const child of node.children) {
        sections.push(`${'  '.repeat(depth)}- ${child.name}：${child.description}`)
        walk(child, depth + 1)
      }
    }
    walk(assets.genre, 1)
  }
  const modes = [
    ...(assets?.primaryProgression !== undefined ? [assets.primaryProgression] : []),
    ...(assets?.auxiliaryProgressions ?? []),
  ]
  if (modes.length > 0) {
    sections.push('==================== 推进模式（读者为什么继续看） ====================')
    for (const mode of modes) {
      const tag = mode.primary ? '（主推进）' : '（辅助）'
      sections.push(`- 模式「${mode.name}」${tag}：驱动力——${mode.driver}`)
      sections.push(`  读者期待：${mode.readerExpectation}`)
      if (mode.payoffs.length > 0) sections.push(`  常见兑现：${mode.payoffs.join('、')}`)
      if (mode.risks.length > 0) sections.push(`  节奏风险（避免）：${mode.risks.join('、')}`)
    }
  }
  return sections.join('\n')
}

/** 渲染写法资产提示词块（规则去重，省 token）。 */
export function renderStyleAssets(assets: ProjectAssets | undefined): string {
  const styles = assets?.styleAssets ?? []
  if (styles.length === 0) return ''
  const sections: string[] = ['==================== 写法资产（本书的叙事风格约束） ====================']
  for (const style of styles) {
    sections.push(`【${style.name}】`)
    const unique = (rules: string[]): string[] => [...new Set(rules)]
    if (style.proseRules.length > 0) sections.push('叙述与节奏：\n' + unique(style.proseRules).map(r => `- ${r}`).join('\n'))
    if (style.dialogueRules.length > 0) sections.push('台词风格：\n' + unique(style.dialogueRules).map(r => `- ${r}`).join('\n'))
    if (style.descriptionRules.length > 0) sections.push('描写与情绪：\n' + unique(style.descriptionRules).map(r => `- ${r}`).join('\n'))
    if (style.boundaries.length > 0) sections.push('表达边界：\n' + unique(style.boundaries).map(r => `- ${r}`).join('\n'))
  }
  return sections.join('\n')
}

/** 渲染全部写作资产提示词（供生成/规划/审稿注入）。 */
export function renderAllAssets(assets: ProjectAssets | undefined): string {
  const parts = [
    renderGenreAndProgression(assets),
    renderStyleAssets(assets),
    renderAntiAiRules(assets),
  ].filter(part => part !== '')
  return parts.join('\n\n')
}

/** 预置写法模板 → 可直接绑定的 StyleAsset。 */
export function styleTemplateToAsset(template: StyleTemplate): StyleAsset {
  return {
    name: template.name,
    proseRules: [...template.proseRules, ...template.rhythmRules.map(r => `节奏：${r}`)],
    dialogueRules: template.dialogueRules,
    descriptionRules: template.languageRules,
    boundaries: [`模板「${template.name}」适用题材：${template.applicableGenres.join('、')}`, '不要违背模板的叙事单元结构与节奏约束'],
    createdAt: new Date().toISOString(),
  }
}

// ------------------------------------------------------- style extraction

/** 写法引擎：从样本文本提取风格资产的系统提示词。 */
export function styleEngineSystemPrompt(): string {
  return [
    '你是一位资深网文文风分析师。你会收到一段样本文本，请提炼出可复用的叙事风格规则，供后续章节保持同一种味道。',
    '要求：',
    '1. 从样本中归纳，不要泛泛而谈；每条规则都要能落到具体写法（句式、用词、视角、节奏、对话方式、描写密度）。',
    '2. 台词风格要说明角色说话的语气特征与常用表达方式。',
    '3. 表达边界要写明这段风格「不会怎么做」（如：不用华丽辞藻、不写长段心理独白、不用成语堆砌）。',
    '4. 输出必须是合法 JSON 对象，不要输出任何其他文字。',
    'JSON 结构：',
    '{"proseRules": ["叙述视角与句式节奏规则"], "dialogueRules": ["台词风格规则"], "descriptionRules": ["描写密度与情绪表达规则"], "boundaries": ["表达边界"]}',
  ].join('\n')
}
