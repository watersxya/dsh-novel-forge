/**
 * Writing assets — 题材基底库 / 推进模式库 / 反 AI 规则 / 写法引擎.
 *
 * 内置种子数据（本项目自研表述；结构参考了同类工具的功能划分）：
 * - 8 套预置叙事风格模板
 * - 12 条带命中模式的反 AI 规则
 * - 题材树 + 推进模式种子
 * Assets persist with the project (novel-project.json) and are injected into
 * generation / planning / review prompts, and available to the AI assistant.
 */

import type { AntiAiRule, GenreNode, PlotBeatTemplate, ProgressionMode, ProjectAssets, StarterStyleProfile, StyleAsset, StyleTemplate } from './protocol.ts'

// ------------------------------------------------------ built-in style templates

/** 预置叙事风格模板（8 套，一键绑定无需样本文本）。 */
export const BUILTIN_STYLE_TEMPLATES: StyleTemplate[] = [
  {
    key: 'power-up-escalation',
    name: '目标推进爽文流',
    description: '冲突与收益逐级抬升，每章都要有可指认的目标推进与爽点兑现。',
    category: '爽文流',
    applicableGenres: [
      '都市',
      '玄幻',
      '热血',
    ],
    tags: ["推进感", "收益点", "冲突升级"],
    analysisMarkdown: "每一段都要落在「推进」或「兑现」上：因果清楚，节奏逐段抬升。",
    narrative: { progressionMode: "goal_driven", sceneUnitPattern: ["目标", "阻碍", "压制", "反转收益"], multiPov: false, looping: false, endingStyle: "hook", summary: "围绕本章目标滚进，尽快给出局部收益。" },
    character: { allowSelfReflection: true, emotionExpression: "dialogue_and_action", defenseMechanisms: [], facePriority: false, dialogueStyle: "direct", summary: "表达直接，情绪跟着胜负走。" },
    language: { register: "direct", roughness: 0.55, allowIncompleteSentences: false, allowSwearing: false, sentenceVariation: "medium", allowUselessDetails: false, summary: "句子利落，删掉不承担信息的枝节。" },
    rhythm: { pace: "fast", paragraphDensity: "medium", allowFragmentedFlow: false, actionOverExplanation: true, summary: "先冲突后解释，不做停顿式铺垫。" },
    proseRules: [
      '每段都要有可指认的推进或兑现，不允许只做情绪铺垫。',
      '场景按「立目标 → 遇阻 → 被压 → 反转收利」组织，节奏逐段抬升。',
      '结尾用钩子收束，不写总结式段落。',
    ],
    dialogueRules: [
      '台词直来直去，情绪随胜负切换。',
      '对话承担推进与信息交换，同时保留各角色的语气差别。',
    ],
    languageRules: [
      '句子清晰，删掉不承载信息的修饰。',
      '表达明确，不做无谓铺垫。',
    ],
    rhythmRules: [
      '快节奏、段落密度中等，动作先于解释。',
      '尽快兑现局部收益，避免拖沓。',
    ],
    defaultAntiAiRuleKeys: ['forbid-theme-summary', 'risk-dialogue-too-functional', 'risk-three-paragraphs-exposition'],
  },
  {
    key: 'bottom-loop-reality',
    name: '底层循环写实流',
    description: '用碎片化的日常和反复落空写人物困境，不给廉价出路。',
    category: '现实流',
    applicableGenres: [
      '都市',
      '现实',
      '成长',
    ],
    tags: ["第一人称", "口语化", "碎片叙事"],
    analysisMarkdown: "靠时间推移与现实落差形成张力，结尾不解决核心困境。",
    narrative: { progressionMode: "time_sequence", sceneUnitPattern: ["行为", "落差", "自我合理化"], multiPov: false, looping: true, endingStyle: "unresolved", summary: "碎片化推进，不做总括式回顾。" },
    character: { allowSelfReflection: false, emotionExpression: "behavior_only", defenseMechanisms: ["嘴硬", "转移", "自我合理化"], facePriority: true, dialogueStyle: "short_colloquial", summary: "情绪靠动作和嘴硬，不做内心解说。" },
    language: { register: "colloquial", roughness: 0.8, allowIncompleteSentences: true, allowSwearing: true, sentenceVariation: "high", allowUselessDetails: true, summary: "口语、粗粝，允许生活杂音。" },
    rhythm: { pace: "medium_fast", paragraphDensity: "high", allowFragmentedFlow: true, actionOverExplanation: true, summary: "段落写实，先给动作再给解释。" },
    proseRules: [
      '用时间推移与现实落差构成张力，结尾不解决核心困境。',
      '场景按「行为 → 落差 → 自我合理化」组织。',
      '碎片化推进，不做总括式回顾。',
    ],
    dialogueRules: [
      '情绪通过动作与嘴硬体现，台词短促口语化。',
      '对话保留生活杂音与无效信息。',
    ],
    languageRules: [
      '语言粗粝口语化，允许不完整句。',
      '句长变化大，允许无意义细节。',
    ],
    rhythmRules: [
      '段落写实，先给动作再给解释。',
      '中快节奏，允许碎片化流动。',
    ],
    defaultAntiAiRuleKeys: ['forbid-explicit-psychology', 'forbid-ending-elevation', 'encourage-useless-action', 'encourage-reality-gap', 'encourage-hard-mouth-compensation'],
  },
  {
    key: 'suspense-pressure',
    name: '信息遮蔽压迫流',
    description: '用信息遮蔽、细节异常与压力叠加制造不安。',
    category: '悬疑流',
    applicableGenres: [
      '悬疑',
      '惊悚',
      '现实',
    ],
    tags: ["压迫感", "信息差", "异常细节"],
    analysisMarkdown: "异常细节、信息差与节奏收束一起给悬念加压。",
    narrative: { progressionMode: "mystery_escalation", sceneUnitPattern: ["现场细节", "异常", "误判", "新风险"], multiPov: false, looping: false, endingStyle: "suspense", summary: "优先制造信息缺口与压迫氛围。" },
    character: { allowSelfReflection: true, emotionExpression: "reaction_only", defenseMechanisms: ["压抑"], facePriority: false, dialogueStyle: "restrained", summary: "反应克制，恐惧从反应里透出来。" },
    language: { register: "restrained", roughness: 0.45, allowIncompleteSentences: true, allowSwearing: false, sentenceVariation: "medium_high", allowUselessDetails: true, summary: "细节精确，留少量噪音增强现场感。" },
    rhythm: { pace: "medium", paragraphDensity: "medium_high", allowFragmentedFlow: true, actionOverExplanation: true, summary: "用节奏收束与信息延迟制造压力。" },
    proseRules: [
      '以异常细节、信息差与节奏收束给悬念加压。',
      '场景按「现场细节 → 异常 → 误判 → 新风险」组织。',
      '优先制造信息缺口与压迫氛围。',
    ],
    dialogueRules: [
      '反应克制，恐惧从反应里透出来。',
      '台词保持克制，不解释恐惧来源。',
    ],
    languageRules: [
      '细节写准，留一点杂音换现场感。',
      '克制，句长变化中等偏高。',
    ],
    rhythmRules: [
      '用节奏收束与信息延迟制造压力。',
      '中速，段落密度中等偏高。',
    ],
    defaultAntiAiRuleKeys: ['forbid-explicit-psychology', 'forbid-theme-summary', 'risk-even-paragraph-length', 'encourage-reality-gap'],
  },
  {
    key: 'emotional-tension',
    name: '关系错位拉扯流',
    description: '用错位表达、停顿与误读制造关系张力。',
    category: '情感流',
    applicableGenres: [
      '言情',
      '都市',
      '群像',
    ],
    tags: ["误读", "拉扯", "停顿感"],
    analysisMarkdown: "核心情绪不直说，靠误读、停顿与反应推动关系变化。",
    narrative: { progressionMode: "relationship_push_pull", sceneUnitPattern: ["动作", "言外之意", "误读", "回避"], multiPov: false, looping: false, endingStyle: "emotional_hook", summary: "靠关系错位推进，不直接说明。" },
    character: { allowSelfReflection: true, emotionExpression: "subtext", defenseMechanisms: ["回避", "试探", "嘴硬"], facePriority: true, dialogueStyle: "subtext_heavy", summary: "情绪落在停顿、动作与言外之意上。" },
    language: { register: "natural", roughness: 0.35, allowIncompleteSentences: true, allowSwearing: false, sentenceVariation: "high", allowUselessDetails: true, summary: "语言自然，允许停顿和留白。" },
    rhythm: { pace: "medium_slow", paragraphDensity: "medium", allowFragmentedFlow: true, actionOverExplanation: false, summary: "给关系反应留空间，但不写空洞抒情。" },
    proseRules: [
      '核心情绪不直说，靠误读、停顿与反应推动关系。',
      '场景按「动作 → 言外之意 → 误读 → 回避」组织。',
      '靠关系错位推进，不靠旁白说明。',
    ],
    dialogueRules: [
      '情绪通过停顿、动作与言外之意体现。',
      '台词充满潜台词与试探。',
    ],
    languageRules: [
      '语言自然，允许停顿和留白。',
      '句长变化大，允许无意义细节。',
    ],
    rhythmRules: [
      '给关系反应留白，但不写空泛抒情。',
      '中慢节奏，段落密度中等。',
    ],
    defaultAntiAiRuleKeys: ['forbid-direct-preaching', 'forbid-ending-elevation', 'risk-dialogue-too-functional', 'encourage-useless-action'],
  },
  {
    key: 'ensemble-weave',
    name: '群像交叉推进流',
    description: '多条人物行动线交叉推进，视角差异清晰可控。',
    category: '群像流',
    applicableGenres: [
      '群像',
      '都市',
      '悬疑',
    ],
    tags: ["多角色", "交织", "信息流动"],
    analysisMarkdown: "多角色并行推进，但每人的表达与认知边界必须分清。",
    narrative: { progressionMode: "multi_thread", sceneUnitPattern: ["角色动作", "局部信息", "交叉影响"], multiPov: true, looping: false, endingStyle: "cross_hook", summary: "多线并进，视角切换要有控制。" },
    character: { allowSelfReflection: true, emotionExpression: "mixed", defenseMechanisms: [], facePriority: false, dialogueStyle: "distinct_by_role", summary: "不同角色的口吻必须拉开差距。" },
    language: { register: "flexible", roughness: 0.45, allowIncompleteSentences: true, allowSwearing: false, sentenceVariation: "high", allowUselessDetails: false, summary: "保持角色差异，避免千人一腔。" },
    rhythm: { pace: "balanced", paragraphDensity: "medium", allowFragmentedFlow: false, actionOverExplanation: true, summary: "几条线同时走，节奏别散。" },
    proseRules: [
      '多角色并行推进，各人的表达与认知边界必须分清。',
      '多线并进，切视角要有节制。',
    ],
    dialogueRules: [
      '不同角色的口吻要拉开差距，避免所有人说话一样。',
    ],
    languageRules: [
      '保持角色差异，句长变化大。',
      '砍掉不推进剧情的枝节信息。',
    ],
    rhythmRules: [
      '多线交织但节奏不乱，平衡推进。',
      '动作先于解释。',
    ],
    defaultAntiAiRuleKeys: ['risk-dialogue-too-functional', 'risk-repeated-sentence-structure', 'forbid-theme-summary'],
  },
  {
    key: 'immersive-daily',
    name: '日常浸没流',
    description: '用生活细节与细微情绪变化建立持续沉浸。',
    category: '日常流',
    applicableGenres: [
      '日常',
      '治愈',
      '都市',
    ],
    tags: ["生活感", "沉浸", "细碎细节"],
    analysisMarkdown: "允许生活性动作与无效信息，但核心情绪仍要从场景里自然流出。",
    narrative: { progressionMode: "scene_immersion", sceneUnitPattern: ["动作", "环境", "关系反应"], multiPov: false, looping: false, endingStyle: "soft_open", summary: "重场景体验与关系温度。" },
    character: { allowSelfReflection: true, emotionExpression: "light_behavior", defenseMechanisms: [], facePriority: false, dialogueStyle: "daily_natural", summary: "说话像日常，不端戏剧腔。" },
    language: { register: "colloquial", roughness: 0.25, allowIncompleteSentences: true, allowSwearing: false, sentenceVariation: "medium_high", allowUselessDetails: true, summary: "保留生活细节与杂音，不追求工整。" },
    rhythm: { pace: "slow", paragraphDensity: "medium", allowFragmentedFlow: true, actionOverExplanation: false, summary: "慢节奏沉浸，但不空转。" },
    proseRules: [
      '重场景体验与关系温度，核心情绪从场景自然流出。',
      '允许保留生活性动作与无效信息。',
    ],
    dialogueRules: [
      '台词贴近日常说话，不端戏剧腔。',
      '对话保留生活气息。',
    ],
    languageRules: [
      '保留生活细节与杂音，不追求工整。',
      '口语化，句长变化中等偏高。',
    ],
    rhythmRules: [
      '节奏放慢，但不许原地打转。',
      '允许碎片化流动。',
    ],
    defaultAntiAiRuleKeys: ['forbid-ending-elevation', 'risk-even-paragraph-length', 'encourage-useless-action'],
  },
  {
    key: 'cold-professional',
    name: '专业事实压情绪流',
    description: '用行业事实与程序细节压住情绪，形成克制的压力感。',
    category: '专业流',
    applicableGenres: [
      '职场',
      '现实',
      '悬疑',
    ],
    tags: ["专业细节", "克制", "事实压情绪"],
    analysisMarkdown: "行业事实与程序细节优先；情绪不直说，信息密度高于抒情密度。",
    narrative: { progressionMode: "fact_driven", sceneUnitPattern: ["事实", "动作", "专业判断", "后果"], multiPov: false, looping: false, endingStyle: "pressure_continue", summary: "让事实与程序细节扛住叙事重量。" },
    character: { allowSelfReflection: false, emotionExpression: "suppressed", defenseMechanisms: ["克制"], facePriority: false, dialogueStyle: "informational", summary: "情绪藏在专业动作与事实选择里。" },
    language: { register: "professional", roughness: 0.2, allowIncompleteSentences: false, allowSwearing: false, sentenceVariation: "medium", allowUselessDetails: false, summary: "术语与事实优先，避免廉价金句。" },
    rhythm: { pace: "balanced", paragraphDensity: "medium_high", allowFragmentedFlow: false, actionOverExplanation: true, summary: "信息给得密，却不铺开解释。" },
    proseRules: [
      '行业事实与程序细节优先，情绪不直说，信息密度高于抒情密度。',
      '场景按「事实 → 动作 → 专业判断 → 后果」组织。',
      '让事实与程序细节扛住叙事重量。',
    ],
    dialogueRules: [
      '情绪藏在专业动作与事实选择里。',
      '对话以信息性表达为主，克制。',
    ],
    languageRules: [
      '术语与事实优先，避免廉价金句。',
      '语言正式、克制。',
    ],
    rhythmRules: [
      '信息给得密，却不铺开解释。',
      '节奏平衡，段落密度中等偏高。',
    ],
    defaultAntiAiRuleKeys: ['forbid-direct-preaching', 'forbid-theme-summary', 'risk-repeated-sentence-structure'],
  },
  {
    key: 'absurd-dark-humor',
    name: '反差黑色幽默流',
    description: '用反差、冷感观察与荒诞细节制造黑色幽默。',
    category: '黑色幽默',
    applicableGenres: [
      '都市',
      '黑色幽默',
      '现实',
    ],
    tags: ["荒诞", "反差", "冷感"],
    analysisMarkdown: "用反差与荒诞细节放大现实困境，笑点与压迫感并存。",
    narrative: { progressionMode: "contrast_driven", sceneUnitPattern: ["现实细节", "荒诞偏差", "冷反应"], multiPov: false, looping: false, endingStyle: "bitter_aftertaste", summary: "靠反差与冷感观察，不靠热闹吐槽。" },
    character: { allowSelfReflection: false, emotionExpression: "deadpan", defenseMechanisms: ["自嘲", "转移"], facePriority: true, dialogueStyle: "deadpan_colloquial", summary: "情绪藏在冷反应与嘴硬里。" },
    language: { register: "colloquial", roughness: 0.5, allowIncompleteSentences: true, allowSwearing: true, sentenceVariation: "high", allowUselessDetails: true, summary: "允许夹带荒诞杂质与冷幽默节奏。" },
    rhythm: { pace: "balanced", paragraphDensity: "medium_high", allowFragmentedFlow: true, actionOverExplanation: true, summary: "反差点要快落地，不解释笑点。" },
    proseRules: [
      '用反差与荒诞细节放大现实困境，笑点与压迫感并存。',
      '场景按「现实细节 → 荒诞偏差 → 冷反应」组织。',
      '靠反差与冷感观察，不靠热闹吐槽。',
    ],
    dialogueRules: [
      '情绪藏在冷反应与嘴硬里。',
      '台词冷面口语化，允许自嘲与转移。',
    ],
    languageRules: [
      '允许夹带荒诞杂质与冷幽默节奏。',
      '口语化，句长变化大。',
    ],
    rhythmRules: [
      '反差立刻见效，笑点不解释。',
      '节奏平衡，段落密度中等偏高。',
    ],
    defaultAntiAiRuleKeys: ['forbid-explicit-psychology', 'forbid-ending-elevation', 'encourage-reality-gap', 'encourage-hard-mouth-compensation'],
  },
  {
    key: 'cultivation-breakthrough',
    name: '修炼突破流',
    description: '以境界突破、战力碾压和资源争夺为核心，强调突破前后的反差与爽感。',
    category: '修炼流',
    applicableGenres: ['仙侠', '玄幻', '都市异能'],
    proseRules: [
      '突破前铺垫压抑与困境，突破时释放能量与威压，突破后立即兑现碾压收益。',
      '场景单元按「困境→闭关/机缘→突破→碾压→新目标」推进。',
      '战力体系严格遵守道藏设定，不随意膨胀；每次突破有明确代价或限制。',
    ],
    dialogueRules: [
      '突破前角色隐忍克制，突破后语气自信但不浮夸。',
      '对手从轻视到震惊的反应通过对话和动作体现，不直接解说。',
    ],
    languageRules: [
      '战斗场景用短句和动作词，突破场景用感官描写（光/声/压力）。',
      '减少修炼过程的流水账，聚焦关键节点和突破瞬间。',
    ],
    rhythmRules: [
      '突破节奏先抑后扬，压抑段不超过3段，突破段要快且有冲击力。',
      '每章至少一个战力或境界的明确进展点。',
    ],
    defaultAntiAiRuleKeys: ['forbid-theme-summary', 'forbid-ending-elevation', 'risk-three-paragraphs-exposition'],
  },
  {
    key: 'face-slapping',
    name: '装逼打脸流',
    description: '身份隐藏→被轻视→展露实力→全场震惊，强调反差爽感与节奏控制。',
    category: '爽文流',
    applicableGenres: ['都市', '玄幻', '仙侠', '重生'],
    proseRules: [
      '打脸前三段内必须建立轻视/挑衅，打脸过程不超过两段，震惊反应要充分。',
      '场景单元按「隐藏→挑衅→展露→震惊→新挑衅」循环推进。',
      '主角实力展露要有铺垫和依据，不凭空开挂。',
    ],
    dialogueRules: [
      '挑衅者台词要具体且有针对性，避免泛泛的"你也配"。',
      '主角话少而精准，用行动和结果说话，不嘴炮解释。',
      '围观者反应分层：先不信→再震惊→最后讨好/畏惧。',
    ],
    languageRules: [
      '打脸场景用短句和动作，震惊场景用群像反应。',
      '避免"全场寂静""众人哗然"等套话，用具体人物反应代替。',
    ],
    rhythmRules: [
      '快节奏，打脸间隔不超过3章，每章至少一个小反转。',
      '装逼要克制，主角不主动炫耀，被动展露更有爽感。',
    ],
    defaultAntiAiRuleKeys: ['forbid-theme-summary', 'risk-dialogue-too-functional', 'risk-ai-cliche-high'],
  },
  {
    key: 'power-struggle',
    name: '权谋博弈流',
    description: '以信息差、布局和反制为核心，强调对话潜台词与多方博弈。',
    category: '权谋流',
    applicableGenres: ['历史', '宫斗', '官场', '仙侠争霸'],
    proseRules: [
      '每章至少一次信息不对称的利用或破解，布局要有伏笔和回收。',
      '场景单元按「情报→布局→试探→反制→结果」推进。',
      '多方势力各有目标和底线，不做纯粹的工具人反派。',
    ],
    dialogueRules: [
      '对话充满潜台词，表面客气实则交锋，关键信息藏在半句和停顿里。',
      '不同势力角色的语言风格和立场要明确区分。',
      '避免角色直接说出计划和意图，通过行动和结果揭示。',
    ],
    languageRules: [
      '正式、克制的语言，避免口语化和现代网络用语。',
      '用细节（眼神/手势/器物）暗示人物真实想法。',
    ],
    rhythmRules: [
      '中慢节奏，布局段可以慢，但反转和收网段要快。',
      '每3-5章一个小高潮（布局见效或反制成功）。',
    ],
    defaultAntiAiRuleKeys: ['forbid-explicit-psychology', 'forbid-direct-preaching', 'risk-dialogue-too-functional'],
  },
  {
    key: 'sweet-romance',
    name: '甜宠撒糖流',
    description: '高糖互动+宠溺细节+情感升温，少虐多甜，强调心动瞬间。',
    category: '言情流',
    applicableGenres: ['现言', '古言', '甜宠', '校园'],
    proseRules: [
      '每章至少一个心动或撒糖细节，情感进展要有明确节点。',
      '场景单元按「日常互动→心动瞬间→关系推进→新暧昧」推进。',
      '误会不超过2章，冲突要小而温馨，不搞虐恋。',
    ],
    dialogueRules: [
      '对话自然亲昵，有专属称呼和互动习惯，避免书面化表白。',
      '男主台词宠溺但不油腻，女主可以害羞但不傻白甜。',
      '用对话中的停顿、转移话题暗示心动，不直接说"我喜欢你"。',
    ],
    languageRules: [
      '温暖、细腻的语言，多用感官细节（温度/气味/触感）。',
      '避免"心如鹿撞""脸红心跳"等套话，用具体动作代替。',
    ],
    rhythmRules: [
      '中慢节奏，日常段可以慢，但心动瞬间要聚焦和放大。',
      '每5章一个关系突破（牵手/拥抱/表白等）。',
    ],
    defaultAntiAiRuleKeys: ['forbid-ending-elevation', 'forbid-explicit-psychology', 'encourage-useless-action'],
  },
  {
    key: 'competitive-blood',
    name: '竞技热血流',
    description: '操作细节+战术博弈+赛事逆转，强调燃点密集与成长曲线。',
    category: '竞技流',
    applicableGenres: ['电竞', '体育', '网游', '卡牌'],
    proseRules: [
      '比赛场景要有具体操作/战术细节，不写"他很强"而是写"他怎么强"。',
      '场景单元按「训练/准备→劣势→战术调整→逆转→赛后成长」推进。',
      '对手要有实力和特点，不做纯粹的经验包。',
    ],
    dialogueRules: [
      '队友对话有战术讨论和互相鼓励，对手台词有挑衅和认可。',
      '解说/旁白可以有，但不能代替比赛过程本身。',
      '角色在高压下的语言要简短有力，避免长篇大论。',
    ],
    languageRules: [
      '比赛场景用短句和动作词，节奏快，有画面感。',
      '操作描述要专业且准确，避免外行话。',
    ],
    rhythmRules: [
      '快节奏，比赛段要紧凑，日常训练段可以稍缓。',
      '每场比赛至少一个逆转或高光时刻，每章一个小燃点。',
    ],
    defaultAntiAiRuleKeys: ['forbid-theme-summary', 'risk-three-paragraphs-exposition', 'risk-ai-cliche-high'],
  },
  {
    key: 'comedy-roast',
    name: '吐槽搞笑流',
    description: '旁白吐槽+角色反差+无厘头，节奏轻快，强调笑点密度。',
    category: '搞笑流',
    applicableGenres: ['轻小说', '二次元', '都市', '无限流'],
    proseRules: [
      '每章至少3个笑点，笑点来自反差、误解或吐槽，不依赖网络梗。',
      '场景单元按「正常展开→反差/误解→吐槽→意外结果」推进。',
      '搞笑不影响主线推进，笑点服务于剧情和人物。',
    ],
    dialogueRules: [
      '主角吐槽要精准且有个人风格，其他角色负责一本正经地制造槽点。',
      '对话节奏快，有来有回，避免冷场。',
      '允许打破第四面墙的吐槽，但不能滥用。',
    ],
    languageRules: [
      '口语化、轻快的语言，允许夸张和无厘头。',
      '吐槽用括号或单独段落，不与叙事混淆。',
    ],
    rhythmRules: [
      '快节奏，笑点密集，不拖沓。',
      '每段不超过3句，长段落要拆。',
    ],
    defaultAntiAiRuleKeys: ['forbid-ending-elevation', 'forbid-direct-preaching', 'encourage-useless-action'],
  },
  {
    key: 'atmosphere-horror',
    name: '氛围惊悚流',
    description: '环境细节+心理暗示+信息延迟，恐惧不直说，靠氛围营造。',
    category: '恐怖流',
    applicableGenres: ['灵异', '惊悚', '克苏鲁', '无限恐怖'],
    proseRules: [
      '恐惧来自未知和异常，不直接描写怪物/鬼魂，用反应和痕迹暗示。',
      '场景单元按「日常→异常细节→误解/忽视→危机爆发→余悸」推进。',
      '信息延迟：读者和主角同时发现异常，不提前剧透。',
    ],
    dialogueRules: [
      '角色对话克制，恐惧通过停顿、重复、语无伦次体现。',
      '避免角色直接说"好可怕""有鬼"，用行动和反应代替。',
      '关键信息藏在半句和打断里。',
    ],
    languageRules: [
      '冷色调、精确的环境描写，多用听觉和触觉（视觉反而少）。',
      '句子短而碎，制造紧张感；长句用于压抑和拖延。',
      '避免"毛骨悚然""不寒而栗"等套话，用具体感官代替。',
    ],
    rhythmRules: [
      '慢节奏铺垫，快节奏爆发，爆发后留余悸。',
      '每3章一个小高潮（异常确认或危机爆发）。',
    ],
    defaultAntiAiRuleKeys: ['forbid-explicit-psychology', 'forbid-theme-summary', 'risk-even-paragraph-length'],
  },
  {
    key: 'hard-scifi',
    name: '硬核科技流',
    description: '技术细节+逻辑推演+文明思辨，信息密度高，强调设定自洽。',
    category: '科幻流',
    applicableGenres: ['科幻', '星际', '赛博朋克', '机甲'],
    proseRules: [
      '科技设定要有逻辑自洽的原理，不做"黑箱"解释。',
      '场景单元按「问题→技术分析→方案→实施→后果」推进。',
      '技术服务于剧情和人物，不为炫技而炫技。',
    ],
    dialogueRules: [
      '专业对话有术语和逻辑，但要让非专业读者能理解核心。',
      '角色争论要有技术依据，不做情绪化争吵。',
      '避免角色直接解说设定，通过问题和讨论揭示。',
    ],
    languageRules: [
      '精确、理性的语言，避免模糊和情绪化表达。',
      '技术描述要具体且可想象，不堆砌名词。',
    ],
    rhythmRules: [
      '中慢节奏，技术推演段可以慢，但行动段要快。',
      '每5章一个技术突破或危机解决。',
    ],
    defaultAntiAiRuleKeys: ['forbid-direct-preaching', 'forbid-theme-summary', 'risk-three-paragraphs-exposition'],
  },]

// ---------------------------------------------------------- built-in rules

/** 内置全局反 AI 规则（12 条，随插件发布；项目可叠加自定义规则）。 */
export const BUILTIN_ANTI_AI_RULES: AntiAiRule[] = [
  {
    name: '不许直接解说心理',
    avoid: '用「他感到」「他意识到」这类句式替读者总结人物内心。',
    fix: '改成动作、语气、停顿、环境反馈或结果来呈现。',
    detectPatterns: ['他感到', '她感到', '他意识到', '她意识到', '他明白了', '她明白了'],
    builtin: true,
    key: 'forbid-explicit-psychology',
    severity: 'forbidden',
    riskLevel: 'high',
    autoRewrite: true,
    globalBaselineEnabled: true,
  },
  {
    name: '不许段尾拔高',
    avoid: '在段落或章节收尾处放一句总结式升华（「生活就是…」「说到底…」）。',
    fix: '删掉升华句，把收尾落回具体动作、现场或悬而未决的处境。',
    detectPatterns: ['生活就是', '命运总会', '归根结底', '说到底', '这就是'],
    builtin: true,
    key: 'forbid-ending-elevation',
    severity: 'forbidden',
    riskLevel: 'high',
    autoRewrite: true,
    globalBaselineEnabled: true,
  },
  {
    name: '不许概括主题',
    avoid: '把段落写成中心思想总结或人生道理（「这说明…」「这意味着…」）。',
    fix: '删掉概括，让信息从事态与结果里自然显出来。',
    detectPatterns: ['这说明', '这意味着', '归根结底', '其实就是'],
    builtin: true,
    key: 'forbid-theme-summary',
    severity: 'forbidden',
    riskLevel: 'high',
    autoRewrite: true,
    globalBaselineEnabled: true,
  },
  {
    name: '不许作者说教',
    avoid: '作者替角色或读者下价值判断（「我们都应该…」「人总要学会…」）。',
    fix: '换成角色的具体处境或台词，不做抽象说教。',
    detectPatterns: ['我们都应该', '人总要学会', '真正重要的是'],
    builtin: true,
    key: 'forbid-direct-preaching',
    severity: 'forbidden',
    riskLevel: 'medium',
    autoRewrite: true,
    globalBaselineEnabled: true,
  },
  {
    name: '段落长短过于均匀',
    avoid: '段落长度与节奏过于平均，读起来像范文。',
    fix: '打散段落长短，让句子与段落有自然起伏。',
    detectPatterns: [],
    builtin: true,
    key: 'risk-even-paragraph-length',
    severity: 'risk',
    riskLevel: 'medium',
    autoRewrite: false,
    globalBaselineEnabled: true,
  },
  {
    name: '连段交代没有动作',
    avoid: '连续几段只在交代背景，没有动作与现场感。',
    fix: '插入动作、对话、环境反馈，把连段说明拆开。',
    detectPatterns: [],
    builtin: true,
    key: 'risk-three-paragraphs-exposition',
    severity: 'risk',
    riskLevel: 'high',
    autoRewrite: false,
    globalBaselineEnabled: true,
  },
  {
    name: '对话只剩功能',
    avoid: '对话只推进信息，没有语气差异与生活噪音（「告诉你…」「我们现在要…」）。',
    fix: '补入停顿、绕弯、语气差异与无效信息。',
    detectPatterns: ['告诉你', '我们现在要', '接下来就'],
    builtin: true,
    key: 'risk-dialogue-too-functional',
    severity: 'forbidden',
    riskLevel: 'high',
    autoRewrite: true,
    globalBaselineEnabled: true,
  },
  {
    name: '句式重复率偏高',
    avoid: '连续使用同构句式（「首先…然后…接着…最后…」），读起来机械。',
    fix: '拉开句长与起句方式，打散结构。',
    detectPatterns: ['首先', '然后', '接着', '最后'],
    builtin: true,
    key: 'risk-repeated-sentence-structure',
    severity: 'forbidden',
    riskLevel: 'high',
    autoRewrite: true,
    globalBaselineEnabled: true,
  },
  {
    name: 'AI 高频套话',
    avoid: '滥用"不禁""仿佛""一时间""不由得""顿时""然而""缓缓""轻轻""微微""似乎""终于"等模式词及套路比喻。',
    fix: '用具体、有画面感的表达替换套话；每个比喻都应当是新造的。',
    detectPatterns: ['不禁', '仿佛', '一时间', '不由得', '顿时', '缓缓', '轻轻', '微微'],
    builtin: true,
    key: 'risk-ai-cliche-high',
    severity: 'forbidden',
    riskLevel: 'high',
    autoRewrite: true,
    globalBaselineEnabled: true,
  },
  {
    name: '多点无用小动作',
    avoid: '（鼓励类）通篇没有真实但不推动剧情的小动作，人物显得空。',
    fix: '补入挠头、点烟、抠包装、挪椅子之类的小动作，添人味与生活感。',
    detectPatterns: [],
    builtin: true,
    key: 'encourage-useless-action',
    severity: 'encourage',
    riskLevel: 'low',
    autoRewrite: false,
    globalBaselineEnabled: false,
  },
  {
    name: '多点预期落差',
    avoid: '（鼓励类）人物预期与现实结果完全一致，没有落差。',
    fix: '把预期与实际结果之间的差距写出来，制造张力。',
    detectPatterns: [],
    builtin: true,
    key: 'encourage-reality-gap',
    severity: 'encourage',
    riskLevel: 'low',
    autoRewrite: false,
    globalBaselineEnabled: false,
  },
  {
    name: '多点嘴硬找补',
    avoid: '（鼓励类）人物吃瘪后没有任何维持体面的反应。',
    fix: '补一句嘴硬找补或自我合理化，保住人设温度。',
    detectPatterns: [],
    builtin: true,
    key: 'encourage-hard-mouth-compensation',
    severity: 'encourage',
    riskLevel: 'low',
    autoRewrite: false,
    globalBaselineEnabled: false,
  },
  {
    name: '禁止心中暗道/脑海浮现',
    avoid: '用"心中暗道""脑海中""心里想""暗自思忖"等句式直接暴露角色内心。',
    fix: '把内心活动改成动作、表情、语气或行为结果，让读者自己推断。',
    detectPatterns: ['心中暗道', '脑海中', '心里想', '暗自思忖', '心中暗想', '心里暗道'],
    builtin: true,
    key: 'forbid-inner-voice',
    severity: 'forbidden',
    riskLevel: 'high',
    autoRewrite: true,
    globalBaselineEnabled: true,
  },
  {
    name: '禁止仿佛/好像比喻滥用',
    avoid: '单章"仿佛""好像""犹如""宛如"等比喻词超过5次，产生AI套路感。',
    fix: '减少比喻频率，每个比喻必须是新造的、有具体画面的，不用陈词滥调。',
    detectPatterns: ['仿佛', '好像', '犹如', '宛如', '好似'],
    builtin: true,
    key: 'forbid-simile-overuse',
    severity: 'forbidden',
    riskLevel: 'high',
    autoRewrite: true,
    globalBaselineEnabled: true,
  },
  {
    name: '禁止过度排比堆砌',
    avoid: '连续3句以上相同句式或排比结构，显得机械和刻意。',
    fix: '打散句式，用长短句交替，排比不超过2句。',
    detectPatterns: [],
    builtin: true,
    key: 'forbid-over-parallelism',
    severity: 'forbidden',
    riskLevel: 'high',
    autoRewrite: true,
    globalBaselineEnabled: true,
  },
  {
    name: '禁止角色全知泄露',
    avoid: '角色说出或知道他/她不可能知道的信息，破坏视角一致性。',
    fix: '严格遵守视角限制，角色只能基于已有信息行动和判断。',
    detectPatterns: [],
    builtin: true,
    key: 'forbid-omniscient-leak',
    severity: 'forbidden',
    riskLevel: 'high',
    autoRewrite: true,
    globalBaselineEnabled: true,
  },
  {
    name: '鼓励环境细节锚定',
    avoid: '（鼓励类）情绪和氛围缺少具体环境物件锚定，全靠抽象形容词。',
    fix: '用具体物件、光线、声音、温度等环境细节承载情绪，不直接说"紧张""悲伤"。',
    detectPatterns: [],
    builtin: true,
    key: 'encourage-env-anchor',
    severity: 'encourage',
    riskLevel: 'low',
    autoRewrite: false,
    globalBaselineEnabled: false,
  },
  {
    name: '鼓励角色语言差异化',
    avoid: '（鼓励类）所有角色说话风格雷同，没有口头禅、用词习惯或句式差异。',
    fix: '给每个主要角色设定独特的语言习惯（口头禅/用词偏好/句式长短），对话时严格区分。',
    detectPatterns: [],
    builtin: true,
    key: 'encourage-voice-diff',
    severity: 'encourage',
    riskLevel: 'low',
    autoRewrite: false,
    globalBaselineEnabled: false,
  },]

/** 内置题材基底库（常用网文题材树，跨书复用）。 */
export const BUILTIN_GENRE_LIBRARY: GenreNode[] = [
  {
    name: '仙侠修真',
    description: '以修仙境界、宗门斗争、法宝丹药为核心，读者期待从凡人到强者的成长与长生问道。',
    id: 'genre_xianxia',
    template: '落笔在修行路径、因果代价与宗门抉择上。',
    children: [
      { name: '凡人流', description: '资质平凡、步步为营，靠资源积累与心机博弈逆袭，强调真实感与代入感。', children: [] },
      { name: '苟道流', description: '主角苟且发育、藏锋敛芒，坐收渔利，强调生存智慧与反差爽点。', children: [] },
      { name: '争霸流', description: '宗门、王朝或大陆争锋，主角由弱到强整合势力，强调格局与权谋。', children: [] },
    ],
  },
  {
    name: '都市异能',
    description: '现代都市背景叠加超能力，读者期待隐藏身份、扮猪吃虎与日常反差。',
    id: 'genre_urban_power',
    template: '强调异能觉醒后的能力增长、都市隐藏与碾压打脸。',
    children: [
      { name: '异能升级', description: '觉醒超能力后不断变强，隐藏于都市，遇敌碾压。', children: [] },
      { name: '重生复仇', description: '重生回到过去，利用先知先觉改变命运、清算仇敌。', children: [] },
      { name: '商业经营', description: '以超能力或见识经商扩张，建立商业帝国，强调经营爽感。', children: [] },
    ],
  },
  {
    name: '悬疑推理',
    description: '以谜题、案件与真相揭露为核心，读者期待线索层层展开与反转。',
    id: 'genre_mystery',
    template: '强调公平线索、逻辑推演与谜局层层递进、回收。',
    children: [
      { name: '本格推理', description: '公平线索、逻辑推演，读者可与主角一同解谜。', children: [] },
      { name: '刑侦探案', description: '警察或侦探视角连续破案，案件串联主线，强调现实与人性。', children: [] },
      { name: '无限流', description: '主角穿梭于不同副本世界解谜求生，副本之间累积成长。', children: [] },
    ],
  },
  {
    name: '玄幻奇幻',
    description: '异世界或架空大陆的冒险成长，读者期待宏大世界观、奇遇与战力突破。',
    id: 'genre_fantasy',
    template: '强调金手指、打脸逆袭与世界/境界阶梯式扩展。',
    children: [
      { name: '学院流', description: '入学修炼、同窗竞争、大赛扬名，强调青春感与阶梯式打脸。', children: [] },
      { name: '废柴逆袭', description: '开局废柴受辱，觉醒金手指后一路逆袭打脸，强调反差与爽点。', children: [] },
      { name: '诸天万界', description: '穿越诸天世界收集资源与能力，强调世界多样性与成长曲线。', children: [] },
    ],
  },
  {
    name: '历史军事',
    description: '以历史时代为背景的争霸、谋略或军旅故事，读者期待权谋博弈与时代质感。',
    id: 'genre_history',
    template: '强调乱世崛起、战略人心与时代质感。',
    children: [
      { name: '王朝争霸', description: '乱世崛起、招贤纳士、逐鹿天下，强调战略与人心。', children: [] },
      { name: '穿越种田', description: '穿越古代发展生产、经营家族，强调建设感与生活细节。', children: [] },
    ],
  },
  {
    name: '末世科幻',
    description: '末世危机或科幻设定下的生存与重建，读者期待资源管理、危机升级与人性考验。',
    id: 'genre_apocalypse',
    template: '强调末世压力、基地建设与能力进化中的危机求生。',
    children: [
      { name: '基地经营', description: '建立基地、收集资源、抵御危机，强调建设与扩张。', children: [] },
      { name: '进化觉醒', description: '末世异变中觉醒能力不断进化，强调战力成长与危机求生。', children: [] },
    ],
  },
  {
    name: '都市生活',
    description: '现代都市日常背景，无超能力或超能力为辅，读者期待身份反差、职场逆袭与生活烟火气。',
    id: 'genre_urban_life',
    template: '强调性格反差、生活细节与烟火气中的人情与反转。',
    children: [
      { name: '赘婿逆袭', description: '开局隐忍赘婿，展露真实身份后一路打脸，强调身份反差与爽感。', children: [] },
      { name: '神医归来', description: '医术高超的主角回归都市，治病救人积累人脉，强调专业碾压与感恩回馈。', children: [] },
      { name: '兵王归隐', description: '退役兵王/特工回归都市，低调行事却屡被招惹，强调武力碾压与守护。', children: [] },
      { name: '奶爸日常', description: '主角带娃生活，温馨治愈与成长并行，强调亲子互动与生活细节。', children: [] },
      { name: '校园青春', description: '校园背景的成长与恋爱，强调青涩感、友情与梦想。', children: [] },
      { name: '鉴宝捡漏', description: '古玩/收藏/拍卖背景，主角凭眼力捡漏暴富，强调专业知识与反差爽感。', children: [] },
    ],
  },
  {
    name: '言情',
    description: '以情感关系为核心，读者期待心动、拉扯、甜虐交织与情感归宿。',
    id: 'genre_romance',
    template: '强调情感拉扯、关系升温与情绪节拍。',
    children: [
      { name: '现言甜宠', description: '现代背景甜蜜恋爱，男主强势专一，强调撒糖与日常互动。', children: [] },
      { name: '古言宫斗', description: '古代后宫/宅斗背景，女主在权谋中求生与上位，强调心机与反转。', children: [] },
      { name: '虐恋重生', description: '前世被虐重生后改写命运，爱恨交织，强调复仇与情感救赎。', children: [] },
      { name: '快穿女配', description: '穿梭不同世界完成任务，女主逆袭原剧情，强调多变设定与成长。', children: [] },
      { name: '年代文', description: '七八十年代背景，家长里短与发家致富，强调时代质感与生活细节。', children: [] },
    ],
  },
  {
    name: '游戏竞技',
    description: '以游戏或体育竞技为舞台，读者期待操作碾压、战术博弈与冠军荣耀。',
    id: 'genre_esports',
    template: '强调操作细节、团队配合与赛事热血、逆转。',
    children: [
      { name: '电竞荣耀', description: '职业电竞选手成长，强调操作细节、团队配合与赛事热血。', children: [] },
      { name: '网游重生', description: '重生回游戏开服前，凭先知优势抢占资源，强调攻略与碾压。', children: [] },
      { name: '体育竞技', description: '篮球/足球/赛车等体育项目，强调训练成长、比赛逆转与体育精神。', children: [] },
      { name: '卡牌桌游', description: '卡牌/桌游/战棋背景，强调策略构筑与阵容搭配。', children: [] },
    ],
  },
  {
    name: '二次元轻小说',
    description: 'ACG风格叙事，节奏轻快，设定新奇，读者期待脑洞展开与角色萌点。',
    id: 'genre_light_novel',
    template: '强调新奇设定、角色个性与轻松反套路的喜剧节奏。',
    children: [
      { name: '异世界穿越', description: '穿越到异世界获得能力/身份，强调新奇设定与冒险展开。', children: [] },
      { name: '系统流', description: '主角获得系统辅助成长，任务/奖励驱动剧情，强调数值与反馈。', children: [] },
      { name: '搞笑日常', description: '以吐槽和反差制造笑点，角色个性鲜明，强调轻松愉快。', children: [] },
      { name: '反派转生', description: '转生成游戏/小说中的反派角色，利用剧情认知规避死亡结局，强调反转与谋略。', children: [] },
    ],
  },
  {
    name: '武侠',
    description: '江湖侠义背景，武功秘籍、门派恩怨、家国情怀，读者期待侠气与江湖质感。',
    id: 'genre_wuxia',
    template: '强调江湖恩怨、武功描写与侠义气的抉择。',
    children: [
      { name: '传统武侠', description: '金庸/古龙风格，江湖恩怨与侠义精神，强调武功描写与人情世故。', children: [] },
      { name: '江湖恩怨', description: '门派/家族/帮会争斗，主角在江湖中成长与抉择，强调义气与复仇。', children: [] },
      { name: '庙堂江湖', description: '朝堂与江湖交织，武侠与权谋结合，强调格局与抉择。', children: [] },
    ],
  },
  {
    name: '现实题材',
    description: '贴近现实生活的行业/职场故事，读者期待专业质感、人性刻画与现实共鸣。',
    id: 'genre_realistic',
    template: '强调行业专业、人性博弈与现实质感。',
    children: [
      { name: '职场商战', description: '商场/职场博弈，主角从底层崛起，强调商业谋略与人际周旋。', children: [] },
      { name: '官场沉浮', description: '体制内升迁与抉择，强调政治智慧与现实质感。', children: [] },
      { name: '医疗行业', description: '医院/医生视角，治病救人与行业生态，强调专业与人性。', children: [] },
      { name: '法律政律', description: '律师/法官视角，案件辩护与司法博弈，强调逻辑与正义。', children: [] },
    ],
  },
  {
    name: '恐怖灵异',
    description: '超自然/惊悚背景，读者期待氛围营造、悬念反转与心理恐惧。',
    id: 'genre_horror',
    template: '强调氛围营造、心理恐惧与规则/文化诡异。',
    children: [
      { name: '灵异惊悚', description: '鬼魂/诅咒/灵异事件，强调氛围营造与心理恐惧。', children: [] },
      { name: '克苏鲁', description: '不可名状的未知存在与疯狂，强调悬疑与绝望感。', children: [] },
      { name: '民俗诡异', description: '中国民间习俗/禁忌/传说，强调地域文化与诡异氛围。', children: [] },
      { name: '无限恐怖', description: '穿梭恐怖副本求生，强调规则破解与团队协作。', children: [] },
    ],
  },
  {
    name: '科幻',
    description: '未来/太空/科技背景，读者期待宏大设定、技术想象与文明思辨。',
    id: 'genre_sci_fi',
    template: '强调科技想象、宇宙尺度与文明/命运抉择。',
    children: [
      { name: '星际文明', description: '太空探索与文明碰撞，强调宇宙尺度与科技发展。', children: [] },
      { name: '机甲战争', description: '机甲驾驶与星际战争，强调战斗场面与军人成长。', children: [] },
      { name: '赛博朋克', description: '高科技低生活的近未来，义体/黑客/大企业，强调反差与反叛。', children: [] },
      { name: '时间穿梭', description: '时间旅行/平行世界，强调因果逻辑与命运抉择。', children: [] },
    ],
  },]

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
  {
    key: "story_mode_power_root",
    name: "爽感推进",
    template: "强调优势展示、局势翻转和清晰的读者爽点兑现。",
    driver: "通过主角优势兑现、认知反差和局势翻转持续制造爽感。",
    readerExpectation: "读者持续看到压制、立威、反转和规则被改写的满足感。",
    payoffs: ["立威", "打破质疑", "扩大影响力", "阶段性碾压"],
    risks: ["主角长期被动", "爽点迟迟不兑现"],
    primary: true,
    progressionUnits: ["立威", "打破质疑", "扩大影响力", "阶段性碾压"],
    allowedConflictForms: ["身份压制", "认知偏差", "权力挑战", "规则重写"],
    forbiddenConflictForms: ["长期弱势求生", "持续吃瘪不反击"],
    conflictCeiling: "high",
    chapterUnit: "每章推进一次压制、反转或立威结果。",
    volumeReward: "卷末形成更大范围的承认、恐惧、臣服或秩序改写。",
    mandatorySignals: ["优势感", "反差感", "立威场面"],
    antiSignals: ["主角长期被动", "爽点迟迟不兑现"],
    resolutionStyle: "尽快兑现主角优势，让冲突成为展示力量与地位的舞台。",
  },
  {
    key: "story_mode_build_root",
    name: "建设经营",
    template: "让世界随着主角行动而变得更丰富、更稳固、更有回报。",
    driver: "通过积累、扩张、经营和建设成果持续制造成就感。",
    readerExpectation: "读者能看到资源变多、地盘变稳、系统变完整的满足感。",
    payoffs: ["积累资源", "建设节点", "经营升级", "阶段性收成"],
    risks: ["主驱动变成纯战斗文", "长期看不到收成"],
    primary: true,
    progressionUnits: ["积累资源", "建设节点", "经营升级", "阶段性收成"],
    allowedConflictForms: ["资源压力", "经营竞争", "发展阻碍"],
    forbiddenConflictForms: ["反派长期压过建设主线", "全靠大战推进"],
    conflictCeiling: "medium",
    chapterUnit: "每章推进一个可见的经营或建设单位。",
    volumeReward: "卷末给出一个更稳、更大、更丰富的成果面貌。",
    mandatorySignals: ["积累", "建设过程", "成果展示"],
    antiSignals: ["主驱动变成纯战斗文", "长期看不到收成"],
    resolutionStyle: "优先用经营、组织、建设和资源调度化解问题。",
  },
  {
    key: "story_mode_healing_root",
    name: "日常治愈",
    template: "矛盾可以有，但不能破坏回暖感和陪伴感。",
    driver: "通过陪伴、修复、生活细节和关系回暖持续吸引读者。",
    readerExpectation: "读者反复获得安稳、温柔、回暖和情绪落地的满足感。",
    payoffs: ["生活日常", "陪伴修复", "小问题解决", "关系回温"],
    risks: ["高压主线喧宾夺主", "治愈感被反复打断"],
    primary: true,
    progressionUnits: ["生活日常", "陪伴修复", "小问题解决", "关系回温"],
    allowedConflictForms: ["低到中烈度困境", "关系误差", "生活压力"],
    forbiddenConflictForms: ["持续高压对抗", "黑化式推进", "无休止背刺"],
    conflictCeiling: "low",
    chapterUnit: "每章围绕一个生活片段或情绪修复点展开。",
    volumeReward: "卷末让读者感到人物状态更稳、更暖、更愿意继续生活。",
    mandatorySignals: ["生活感", "安抚点", "关系回暖"],
    antiSignals: ["高压主线喧宾夺主", "治愈感被反复打断"],
    resolutionStyle: "用陪伴、理解与日常小修补把问题化掉。",
  },
  {
    key: "story_mode_comedy_root",
    name: "喜剧整活",
    template: "轻松不是语气标签，而是章节结构里持续兑现的笑点机制。",
    driver: "通过反差、包袱、误会和整活节奏持续制造轻松爽快感。",
    readerExpectation: "读者频繁获得笑点、反套路和情绪减压体验。",
    payoffs: ["设包袱", "误会升级", "反差回收", "局面失控"],
    risks: ["长时间严肃无包袱", "笑点全靠口癖与段子堆"],
    primary: true,
    progressionUnits: ["设包袱", "误会升级", "反差回收", "局面失控"],
    allowedConflictForms: ["误会", "反差", "社死", "整活翻车"],
    forbiddenConflictForms: ["长篇沉重压抑线长期占主导", "笑点没有回收"],
    conflictCeiling: "medium",
    chapterUnit: "每章至少要推进一个有效笑点结构。",
    volumeReward: "卷末形成更大的整活名场面或误会共同体。",
    mandatorySignals: ["反差", "回收", "轻松释放"],
    antiSignals: ["长时间严肃无包袱", "笑点全靠口癖与段子堆"],
    resolutionStyle: "用包袱回收与失控场面完成释放。",
  },
  {
    key: "story_mode_mystery_root",
    name: "悬念博弈",
    template: "读者要持续感觉自己在往更深的真相推进。",
    driver: "通过信息差、推演和博弈升级持续制造想追下去的欲望。",
    readerExpectation: "读者不断获得谜面推进、推理快感和布局回收的满足。",
    payoffs: ["抛出疑点", "收集线索", "推演验证", "局势反转"],
    risks: ["谜团只堆不解", "答案靠天降"],
    primary: true,
    progressionUnits: ["抛出疑点", "收集线索", "推演验证", "局势反转"],
    allowedConflictForms: ["信息差", "隐藏动机", "智性对抗"],
    forbiddenConflictForms: ["为了保密故意不讲理", "纯拼体力，推演感被吃掉"],
    conflictCeiling: "high",
    chapterUnit: "每章推进一个新疑点或一个旧疑点的验证。",
    volumeReward: "卷末揭开一层更大的真相或完成一次关键博弈。",
    mandatorySignals: ["线索", "推演", "反制"],
    antiSignals: ["谜团只堆不解", "答案靠天降"],
    resolutionStyle: "通过证据链、推演和布局完成反制。",
  },
  {
    key: "story_mode_relationship_root",
    name: "关系情感",
    template: "重点不是单纯堆冲突，而是让关系状态持续变化并兑现读者期待。",
    driver: "通过人物关系的靠近、拉扯、错位与回收，持续制造追读动力。",
    readerExpectation: "读者不断获得关系变化、情感张力和关键情绪兑现。",
    payoffs: ["关系建立", "情绪拉扯", "信任变化", "节点兑现"],
    risks: ["关系原地踏步", "设定堆在那儿，互动没有"],
    primary: true,
    progressionUnits: ["关系建立", "情绪拉扯", "信任变化", "节点兑现"],
    allowedConflictForms: ["关系误差", "情感错位", "现实阻力", "价值观摩擦"],
    forbiddenConflictForms: ["关系线长期停滞", "无意义狗血来回打转", "情感推进长期被别的线吃掉"],
    conflictCeiling: "medium",
    chapterUnit: "每章推进一个关系节点、情绪变化或彼此认知变化。",
    volumeReward: "卷末让关键关系发生明确变化或完成一次高价值情感兑现。",
    mandatorySignals: ["关系张力", "情绪节点", "兑现感"],
    antiSignals: ["关系原地踏步", "设定堆在那儿，互动没有"],
    resolutionStyle: "靠情绪交流、关系行动与关键选择推进或修复。",
  },
  {
    key: "story_mode_growth_root",
    name: "成长冒险",
    template: "读者需要持续感知到人物能力、认知或世界边界在扩展。",
    driver: "通过成长曲线、探索推进和阶段突破持续制造前进感。",
    readerExpectation: "读者反复获得变强、解锁新区域和达成新门槛的满足。",
    payoffs: ["获得目标", "挑战升级", "突破瓶颈", "进入新区域"],
    risks: ["升级口头化", "冒险线停摆"],
    primary: true,
    progressionUnits: ["获得目标", "挑战升级", "突破瓶颈", "进入新区域"],
    allowedConflictForms: ["试炼", "探索风险", "阶段门槛", "成长阵痛"],
    forbiddenConflictForms: ["长期停滞不成长", "只见数值上涨，体验没有变化", "探索线长期缺席"],
    conflictCeiling: "high",
    chapterUnit: "每章推进一个成长动作、一次探索发现或一段闯关反馈。",
    volumeReward: "卷末让人物到达更高阶段，或打开一片更大的冒险空间。",
    mandatorySignals: ["成长感", "突破感", "世界扩展"],
    antiSignals: ["升级口头化", "冒险线停摆"],
    resolutionStyle: "通过训练、实践、探索和阶段性突破完成破局。",
  },
  {
    key: "story_mode_invincible",
    name: "无敌流",
    template: "尽快立住主角上限，重点写压制、破局、立威和改规则。",
    driver: "让主角以明显优势碾压阻力，并不断刷新他人认知。",
    readerExpectation: "读者每隔几章都能看到一次明确的压制和地位确立。",
    payoffs: ["展示底牌", "压制对手", "扩大威慑", "重写规则"],
    risks: ["主角像普通升级文一样长期弱势", "核心优势被硬生生封住"],
    primary: false,
    progressionUnits: ["展示底牌", "压制对手", "扩大威慑", "重写规则"],
    allowedConflictForms: ["身份误判", "势力挑衅", "高手试探"],
    forbiddenConflictForms: ["长期躲藏发育", "长时间挨打却无法反击"],
    conflictCeiling: "high",
    chapterUnit: "单章围绕一次压制、试探或立威展开。",
    volumeReward: "卷末形成新的权力格局或更大范围的承认。",
    mandatorySignals: ["强者气场", "围观震撼", "越级压制"],
    antiSignals: ["主角像普通升级文一样长期弱势", "核心优势被硬生生封住"],
    resolutionStyle: "用迅速反制与高位碾压把冲突收掉。",
  },
  {
    key: "story_mode_face_slap",
    name: "打脸流",
    template: "先蓄势误判，再精准反转，打脸要及时回收。",
    driver: "通过他人误判和后续反转持续兑现高频打脸快感。",
    readerExpectation: "读者不断看到轻视者被现场回收和反噬。",
    payoffs: ["误判铺垫", "身份反转", "公开回收", "舆论发酵"],
    risks: ["只挨打不回收", "回收力度太轻，爽不起来"],
    primary: false,
    progressionUnits: ["误判铺垫", "身份反转", "公开回收", "舆论发酵"],
    allowedConflictForms: ["轻视", "公开羞辱", "资源争夺"],
    forbiddenConflictForms: ["铺垫过长却没有回收", "打脸之后没有任何实际影响"],
    conflictCeiling: "medium",
    chapterUnit: "单章重点制造一次误判与回收闭环。",
    volumeReward: "卷末主角从被看轻者转为不可忽视的中心人物。",
    mandatorySignals: ["误判", "反转", "当场回收"],
    antiSignals: ["只挨打不回收", "回收力度太轻，爽不起来"],
    resolutionStyle: "在最需要证明的场合完成反转与回收。",
  },
  {
    key: "story_mode_misread",
    name: "迪化流",
    template: "误会要层层放大，并不断变成对主角有利的局面。",
    driver: "利用他人对主角的过度解读制造持续失控的优势局面。",
    readerExpectation: "读者反复获得‘别人自己脑补过头’的反差快感。",
    payoffs: ["误读", "脑补升级", "群体扩散", "误会兑现"],
    risks: ["误会强行", "所有人一眼就看穿"],
    primary: false,
    progressionUnits: ["误读", "脑补升级", "群体扩散", "误会兑现"],
    allowedConflictForms: ["信息不对称", "误会连锁", "群体解读偏差"],
    forbiddenConflictForms: ["直接解释清楚", "误会只演一次就收"],
    conflictCeiling: "medium",
    chapterUnit: "单章围绕一次误解升级和意外收益展开。",
    volumeReward: "卷末误读体系形成稳定共识或传奇形象。",
    mandatorySignals: ["脑补", "失控传播", "主角被动受益"],
    antiSignals: ["误会强行", "所有人一眼就看穿"],
    resolutionStyle: "让误会自然滚大，最后变成主角的资源或声望。",
  },
  {
    key: "story_mode_secret_identity",
    name: "马甲流",
    template: "马甲要各有功能，掉马风险要形成持续钩子。",
    driver: "通过多重身份切换、隐藏与掉马风险制造连续张力。",
    readerExpectation: "读者不断看到身份差、信息差和掉马边缘的刺激感。",
    payoffs: ["建立马甲", "切换身份", "险些掉马", "掉马兑现"],
    risks: ["身份线长期静止", "马甲只是换个名字，没有实际用途"],
    primary: false,
    progressionUnits: ["建立马甲", "切换身份", "险些掉马", "掉马兑现"],
    allowedConflictForms: ["身份隐藏", "关系错位", "能力来源误判"],
    forbiddenConflictForms: ["所有马甲功能重复", "掉马没有后果"],
    conflictCeiling: "medium",
    chapterUnit: "单章至少推进一次身份利用或风险逼近。",
    volumeReward: "卷末形成关键掉马或更复杂的身份网。",
    mandatorySignals: ["信息差", "身份切换", "掉马钩子"],
    antiSignals: ["身份线长期静止", "马甲只是换个名字，没有实际用途"],
    resolutionStyle: "用身份切换解局，再把压力推到下一层露馅风险上。",
  },
  {
    key: "story_mode_farming",
    name: "种田流",
    template: "重点写资源循环、土地或据点经营、关系熟化和阶段性收成。",
    driver: "通过一点点把生活与生产盘活，给读者稳定的回暖和积累感。",
    readerExpectation: "读者持续获得‘日子越来越好’和‘家底越来越厚’的满足感。",
    payoffs: ["播种准备", "生产积累", "邻里互动", "收成兑现"],
    risks: ["只剩打怪和阴谋", "看不到生活改善"],
    primary: false,
    progressionUnits: ["播种准备", "生产积累", "邻里互动", "收成兑现"],
    allowedConflictForms: ["资源短缺", "天气与环境压力", "小范围利益摩擦"],
    forbiddenConflictForms: ["长期高压生死线", "大反派主线永远收不掉"],
    conflictCeiling: "low",
    chapterUnit: "单章围绕一项劳作、一项建设或一段生活改善展开。",
    volumeReward: "卷末形成一个明显更稳定、更温暖的生活阶段。",
    mandatorySignals: ["生活感", "劳作细节", "阶段收成"],
    antiSignals: ["只剩打怪和阴谋", "看不到生活改善"],
    resolutionStyle: "通过勤劳、组织、互助和经营慢慢解决问题。",
  },
  {
    key: "story_mode_management",
    name: "经营流",
    template: "强调决策、运营、扩张、口碑和阶段性经营结果。",
    driver: "通过经营决策和组织扩张持续制造上升感。",
    readerExpectation: "读者反复看到业务跑起来、组织成型和口碑增长。",
    payoffs: ["找到突破口", "搭建流程", "扩大规模", "赢得市场"],
    risks: ["只讲结果不讲过程", "经营主线被反派线吞掉"],
    primary: false,
    progressionUnits: ["找到突破口", "搭建流程", "扩大规模", "赢得市场"],
    allowedConflictForms: ["经营竞争", "资源调配", "团队磨合"],
    forbiddenConflictForms: ["无关的恋爱狗血长期抢戏", "经营过程一笔带过"],
    conflictCeiling: "medium",
    chapterUnit: "单章推进一个经营动作或组织问题。",
    volumeReward: "卷末形成业务升级、品牌确立或组织跃迁。",
    mandatorySignals: ["策略感", "经营动作", "结果反馈"],
    antiSignals: ["只讲结果不讲过程", "经营主线被反派线吞掉"],
    resolutionStyle: "用策略、运营、分工与节奏管理解决问题。",
  },
  {
    key: "story_mode_territory_building",
    name: "领地建设",
    template: "重点写领地升级、人口汇聚、规则建立和防线稳固。",
    driver: "通过把一块地、一座城或一个据点逐步经营成型，持续制造扩张与稳固的成就感。",
    readerExpectation: "读者不断看到领地变强、秩序成型和安全感提升。",
    payoffs: ["招募与安置", "设施建设", "规则落地", "外部试探回击"],
    risks: ["只有战争没有建设", "领地越来越没存在感"],
    primary: false,
    progressionUnits: ["招募与安置", "设施建设", "规则落地", "外部试探回击"],
    allowedConflictForms: ["资源紧张", "边界摩擦", "管理压力", "治安危机"],
    forbiddenConflictForms: ["领地长期形同虚设", "主线被私人恩怨整个带偏"],
    conflictCeiling: "medium",
    chapterUnit: "单章推进一个领地建设动作、治理问题或外部试探应对。",
    volumeReward: "卷末让领地规模、秩序或影响力出现清晰跃升。",
    mandatorySignals: ["据点成长", "治理动作", "秩序成型"],
    antiSignals: ["只有战争没有建设", "领地越来越没存在感"],
    resolutionStyle: "用建设、治理、组织与局部反制先把局面稳住。",
  },
  {
    key: "story_mode_family_management",
    name: "家族经营",
    template: "把资源经营、家族分工和内部关系变化一起写活。",
    driver: "通过家业扩张、家族关系重组和责任传承维持故事推进。",
    readerExpectation: "读者既能看到家底变厚，也能看到家族成员关系越来越成体系。",
    payoffs: ["家业调整", "成员磨合", "资源积累", "家族地位提升"],
    risks: ["只剩吵架不见经营", "家族线缺少传承味道"],
    primary: false,
    progressionUnits: ["家业调整", "成员磨合", "资源积累", "家族地位提升"],
    allowedConflictForms: ["家务分歧", "利益分配", "外部竞争", "代际观念冲突"],
    forbiddenConflictForms: ["狗血撕裂长期压倒经营线", "家族人只剩功能位，关系毫无变化"],
    conflictCeiling: "medium",
    chapterUnit: "单章推进一次家业动作、一场家族互动或一项责任兑现。",
    volumeReward: "卷末让家族更稳固、更有凝聚力，或完成一次地位跃升。",
    mandatorySignals: ["家族协作", "家业动作", "关系重组"],
    antiSignals: ["只剩吵架不见经营", "家族线缺少传承味道"],
    resolutionStyle: "用协商、分工、经营成果与共同扛危机完成修复。",
  },
  {
    key: "story_mode_healing_daily",
    name: "治愈日常",
    template: "保持低烈度困境和高密度安抚点，让读者愿意停留。",
    driver: "靠日常陪伴和细小修复慢慢把人物带回稳定状态。",
    readerExpectation: "读者每几章都获得一次情绪被抚平的体验。",
    payoffs: ["日常互动", "情绪安抚", "关系熟化", "生活改善"],
    risks: ["冲突升级成高压大戏", "一章读完只剩焦虑"],
    primary: false,
    progressionUnits: ["日常互动", "情绪安抚", "关系熟化", "生活改善"],
    allowedConflictForms: ["生活小挫折", "关系别扭", "旧伤回响"],
    forbiddenConflictForms: ["大反派压顶", "极端痛苦长期不回收"],
    conflictCeiling: "low",
    chapterUnit: "每章围绕一个情绪节点和一个安抚点展开。",
    volumeReward: "卷末让角色和读者都感到状态明显回暖。",
    mandatorySignals: ["安抚感", "生活细节", "温柔互动"],
    antiSignals: ["冲突升级成高压大戏", "一章读完只剩焦虑"],
    resolutionStyle: "让人物在陪伴、倾听与具体行动里一点点被治好。",
  },
  {
    key: "story_mode_shop_daily",
    name: "小店日常",
    template: "顾客、邻里和经营琐事都应成为温柔推进器。",
    driver: "通过店铺经营、来客故事和社区互动形成持续新鲜感。",
    readerExpectation: "读者既能看到经营变化，也能得到温暖的陌生人故事。",
    payoffs: ["来客事件", "经营调整", "社区互动", "日常收束"],
    risks: ["只剩经营数据没有人情味", "店铺越来越没存在感"],
    primary: false,
    progressionUnits: ["来客事件", "经营调整", "社区互动", "日常收束"],
    allowedConflictForms: ["小店经营压力", "人情摩擦", "生活琐事"],
    forbiddenConflictForms: ["连续恶性打压", "悬疑过重或阴谋高压主导"],
    conflictCeiling: "medium",
    chapterUnit: "每章推进一次来客互动或经营小事件。",
    volumeReward: "卷末让小店更有人气、更有归属感。",
    mandatorySignals: ["小店空间感", "来客故事", "社区温度"],
    antiSignals: ["只剩经营数据没有人情味", "店铺越来越没存在感"],
    resolutionStyle: "靠待人接物、经营调整与社区互助自然化解。",
  },
  {
    key: "story_mode_slow_life",
    name: "慢生活",
    template: "让风景、劳作、饮食和相处方式都成为安稳体验的一部分。",
    driver: "通过缓慢但持续的生活改善与身心安定感推动读者停留。",
    readerExpectation: "读者反复获得放松、沉浸和‘终于缓下来’的满足感。",
    payoffs: ["日常作息", "环境熟悉", "生活改善", "情绪回稳"],
    risks: ["为了刺激频繁硬拗大冲突", "越写越躁，没有呼吸"],
    primary: false,
    progressionUnits: ["日常作息", "环境熟悉", "生活改善", "情绪回稳"],
    allowedConflictForms: ["轻微不适应", "生活小困扰", "疏远之后的重新磨合"],
    forbiddenConflictForms: ["持续高压倒计时", "强反派长期追杀，或阴谋压顶"],
    conflictCeiling: "low",
    chapterUnit: "单章围绕一个生活片段、一项微小改善或一次情绪缓冲展开。",
    volumeReward: "卷末让人物真正拥有一个更稳、更舒服的生活状态。",
    mandatorySignals: ["生活秩序", "松弛感", "细节沉浸"],
    antiSignals: ["为了刺激频繁硬拗大冲突", "越写越躁，没有呼吸"],
    resolutionStyle: "用时间、陪伴、规律生活与小步修补慢慢化解。",
  },
  {
    key: "story_mode_companion_healing",
    name: "陪伴疗愈",
    template: "矛盾要服务于靠近、信任和修复，而不是不断撕裂。",
    driver: "通过陪伴关系逐步建立、安全感逐步累积来带动情绪兑现。",
    readerExpectation: "读者不断获得被理解、被陪着走过低谷的温柔满足。",
    payoffs: ["接近与试探", "日常照料", "情绪松动", "关系确认"],
    risks: ["治愈线突然变虐恋拉扯", "陪伴关系没有实质进展"],
    primary: false,
    progressionUnits: ["接近与试探", "日常照料", "情绪松动", "关系确认"],
    allowedConflictForms: ["旧伤回避", "沟通迟滞", "生活压力", "短暂误解"],
    forbiddenConflictForms: ["反复背刺", "虐点长期不回收", "拉扯过火到失去控制"],
    conflictCeiling: "low",
    chapterUnit: "单章推进一次陪伴动作、一次关系松动或一次情绪落地。",
    volumeReward: "卷末让关键关系显著升温，人物更愿意相信他人和生活。",
    mandatorySignals: ["陪伴感", "信任增长", "修复落地"],
    antiSignals: ["治愈线突然变虐恋拉扯", "陪伴关系没有实质进展"],
    resolutionStyle: "靠耐心、陪伴与实际行动把关系一点点修回来。",
  },
  {
    key: "story_mode_comedy",
    name: "搞笑流",
    template: "笑点必须结构化出现，不能只靠零散金句。",
    driver: "靠高频包袱、反差和失控场面维持阅读快乐。",
    readerExpectation: "读者每章都能收获明确的轻松和好笑点。",
    payoffs: ["包袱铺设", "反差升级", "笑点回收", "场面翻车"],
    risks: ["整段都很严肃", "光有吐槽，没有结构"],
    primary: false,
    progressionUnits: ["包袱铺设", "反差升级", "笑点回收", "场面翻车"],
    allowedConflictForms: ["误会", "社死", "身份反差", "认知错位"],
    forbiddenConflictForms: ["长时间沉重苦情线", "笑点稀少，剧情也不动"],
    conflictCeiling: "medium",
    chapterUnit: "每章围绕至少一个有效包袱闭环展开。",
    volumeReward: "卷末形成标志性名场面或持续流传的笑料。",
    mandatorySignals: ["包袱", "回收", "场面感"],
    antiSignals: ["整段都很严肃", "光有吐槽，没有结构"],
    resolutionStyle: "靠回收与升级继续加码笑点，而不是转向沉重。",
  },
  {
    key: "story_mode_misunderstanding_comedy",
    name: "误会喜剧",
    template: "误会要层层放大，但每次都要带来新的局面。",
    driver: "通过多方信息差导致的误会扩散维持喜剧节奏。",
    readerExpectation: "读者不断看到误会越滚越大却越有趣的效果。",
    payoffs: ["误会建立", "多方误读", "失控扩散", "喜剧回收"],
    risks: ["误会无后劲", "澄清太快，节奏直接熄火"],
    primary: false,
    progressionUnits: ["误会建立", "多方误读", "失控扩散", "喜剧回收"],
    allowedConflictForms: ["误会", "错位沟通", "集体误读"],
    forbiddenConflictForms: ["误会太快澄清", "误会反复用同一个梗"],
    conflictCeiling: "medium",
    chapterUnit: "每章推进一层新的误解或回收节点。",
    volumeReward: "卷末形成一场大型误会名场面。",
    mandatorySignals: ["信息差", "误读", "扩散"],
    antiSignals: ["误会无后劲", "澄清太快，节奏直接熄火"],
    resolutionStyle: "把误会放在最好笑的位置回收，或升级成更大的笑点。",
  },
  {
    key: "story_mode_absurd_subversion",
    name: "沙雕反套路",
    template: "反套路不只是拆预期，还要持续给出更好玩的新局面。",
    driver: "通过不断拆解常规预期，再给出更离谱但更成立的结果维持新鲜感。",
    readerExpectation: "读者持续获得‘居然还能这么来’的惊喜和轻松感。",
    payoffs: ["建立预期", "突然拧转", "离谱升级", "反套路回收"],
    risks: ["为了搞怪牺牲可读性", "段子堆叠，故事不往前"],
    primary: false,
    progressionUnits: ["建立预期", "突然拧转", "离谱升级", "反套路回收"],
    allowedConflictForms: ["反差", "错位", "整活失控", "设定玩梗"],
    forbiddenConflictForms: ["只剩无意义发疯", "够离谱，却找不到逻辑支点", "连续沉重正剧化"],
    conflictCeiling: "medium",
    chapterUnit: "每章至少推进一个预期建立与反套路回收闭环。",
    volumeReward: "卷末形成高传播度的离谱名场面或反套路高潮。",
    mandatorySignals: ["意外感", "反套路", "回收闭环"],
    antiSignals: ["为了搞怪牺牲可读性", "段子堆叠，故事不往前"],
    resolutionStyle: "用更高一层的反套路把局面收回来，而不是跌回沉重正统冲突。",
  },
  {
    key: "story_mode_mystery_inference",
    name: "悬疑推演",
    template: "每段推演都要建立在清晰线索上，不要纯作者强解。",
    driver: "让读者跟着线索与推演不断靠近真相。",
    readerExpectation: "读者持续获得‘拼图正在成型’的智性满足。",
    payoffs: ["提出疑点", "补充线索", "推演收束", "揭开真相"],
    risks: ["故弄玄虚", "结论和线索脱节"],
    primary: false,
    progressionUnits: ["提出疑点", "补充线索", "推演收束", "揭开真相"],
    allowedConflictForms: ["线索冲突", "证词矛盾", "隐藏动机"],
    forbiddenConflictForms: ["关键证据凭空出现", "该说明的地方故意含糊拖节奏"],
    conflictCeiling: "medium",
    chapterUnit: "每章推进一个关键疑点的认知变化。",
    volumeReward: "卷末揭穿核心谜面或打开更大的悬念入口。",
    mandatorySignals: ["线索感", "逻辑链", "真相逼近"],
    antiSignals: ["故弄玄虚", "结论和线索脱节"],
    resolutionStyle: "通过线索联动和逻辑推演完成局面突破。",
  },
  {
    key: "story_mode_mind_game",
    name: "智斗流",
    template: "对手必须像对手，博弈必须可感知。",
    driver: "通过多轮布局和拆招形成高黏性的智斗快感。",
    readerExpectation: "读者不断看到算计、反算和预判回收。",
    payoffs: ["布局", "试探", "反制", "收网"],
    risks: ["胜负没有博弈过程", "对手工具化"],
    primary: false,
    progressionUnits: ["布局", "试探", "反制", "收网"],
    allowedConflictForms: ["策略对抗", "心理博弈", "资源算计"],
    forbiddenConflictForms: ["对手太蠢", "每次赢都靠主角的信息外挂"],
    conflictCeiling: "medium",
    chapterUnit: "每章推进一轮试探、布子或拆招。",
    volumeReward: "卷末完成一次大局收网或更高阶对手登场。",
    mandatorySignals: ["布局感", "对手压迫", "反制回收"],
    antiSignals: ["胜负没有博弈过程", "对手工具化"],
    resolutionStyle: "通过提前布局和关键反制赢下局面。",
  },
  {
    key: "story_mode_survival_game",
    name: "生存博弈",
    template: "高压可以存在，但必须服务于规则推演、抉择代价和局势反制。",
    driver: "通过资源稀缺、环境压力和规则对抗持续制造必须做出选择的张力。",
    readerExpectation: "读者反复获得局势求解、代价权衡和绝境翻盘的紧绷满足。",
    payoffs: ["压力逼近", "规则试探", "资源争夺", "短线反制"],
    risks: ["危机廉价化", "困境反复在同一类里打转"],
    primary: false,
    progressionUnits: ["压力逼近", "规则试探", "资源争夺", "短线反制"],
    allowedConflictForms: ["资源稀缺", "规则压迫", "环境威胁", "群体博弈"],
    forbiddenConflictForms: ["纯靠运气通关", "全是硬碰硬，没有策略", "同一种危机反复来"],
    conflictCeiling: "high",
    chapterUnit: "单章推进一轮生存压力、规则发现或关键抉择。",
    volumeReward: "卷末完成一次阶段求生成功、规则突破或阵营格局改写。",
    mandatorySignals: ["资源压力", "选择代价", "规则利用"],
    antiSignals: ["危机廉价化", "困境反复在同一类里打转"],
    resolutionStyle: "靠吃透规则、判断局势与有限资源调度破局。",
  },
  {
    key: "story_mode_romantic_tension",
    name: "恋爱拉扯",
    template: "拉扯要有温差和推进，不能只靠误会拖延。",
    driver: "通过双向吸引与现实阻力之间的反复拉扯维持情感张力。",
    readerExpectation: "读者不断看到关系升温、试探失控和情绪回收。",
    payoffs: ["试探靠近", "边界碰撞", "情绪失衡", "关系推进"],
    risks: ["只有误会拖延", "关系没有实质变化"],
    primary: false,
    progressionUnits: ["试探靠近", "边界碰撞", "情绪失衡", "关系推进"],
    allowedConflictForms: ["暧昧错位", "表达失败", "现实阻力", "价值观差异"],
    forbiddenConflictForms: ["故意降智不说人话", "拖太久不推进", "关系线被主线彻底盖住"],
    conflictCeiling: "medium",
    chapterUnit: "单章推进一个情感试探、认知变化或关系边界松动。",
    volumeReward: "卷末让关系进入新阶段，或完成一次高浓度情绪确认。",
    mandatorySignals: ["暧昧感", "双向张力", "靠近兑现"],
    antiSignals: ["只有误会拖延", "关系没有实质变化"],
    resolutionStyle: "靠互动升级、情绪承认与行动选择推进关系。",
  },
  {
    key: "story_mode_chasing_wife",
    name: "追妻火葬场",
    template: "核心是追偿和重建，不是单方面反复伤害。",
    driver: "通过失去后的追偿、悔改和关系重建制造强烈情绪牵引。",
    readerExpectation: "读者持续获得‘该追的在追、该还的在还、该痛的有回应’的满足。",
    payoffs: ["后悔显现", "追偿行动", "关系试炼", "重建兑现"],
    risks: ["只会口头道歉", "修复关系毫无代价"],
    primary: false,
    progressionUnits: ["后悔显现", "追偿行动", "关系试炼", "重建兑现"],
    allowedConflictForms: ["信任断裂", "旧伤反扑", "补偿落差", "现实阻碍"],
    forbiddenConflictForms: ["追偿只停留在嘴上", "反复受伤却始终没有出口", "被追的一方彻底失去主动权"],
    conflictCeiling: "medium",
    chapterUnit: "单章推进一次追偿动作、一次旧伤碰撞或一次关系松动。",
    volumeReward: "卷末形成清晰的关系修复阶段或强力情绪回收。",
    mandatorySignals: ["悔意落地", "行动补偿", "边界重建"],
    antiSignals: ["只会口头道歉", "修复关系毫无代价"],
    resolutionStyle: "用持续行动、承担代价与尊重边界推进关系重建。",
  },
  {
    key: "story_mode_ensemble_bond",
    name: "群像羁绊",
    template: "群像不是名单堆砌，而是每个角色都要在关系网里发挥作用。",
    driver: "通过多人互动和羁绊变化让故事始终有新的关系火花。",
    readerExpectation: "读者不断获得角色之间的新连接、站队变化和情感共振。",
    payoffs: ["关系串联", "群体事件", "立场变化", "羁绊加深"],
    risks: ["角色只报名字不干活", "群像散架，成了独角戏"],
    primary: false,
    progressionUnits: ["关系串联", "群体事件", "立场变化", "羁绊加深"],
    allowedConflictForms: ["立场差异", "责任分歧", "情感错位", "团队压力"],
    forbiddenConflictForms: ["群像角色长期工具化", "只剩主角独走", "人物关系始终原样不动"],
    conflictCeiling: "medium",
    chapterUnit: "单章推进一个群体互动节点或关键角色对之间的关系变化。",
    volumeReward: "卷末让群像结构更稳，或让队伍/关系网进入新阶段。",
    mandatorySignals: ["群体互动", "关系联动", "角色互相成就"],
    antiSignals: ["角色只报名字不干活", "群像散架，成了独角戏"],
    resolutionStyle: "靠团队互动、共同经历与角色选择推动关系演化。",
  },
  {
    key: "story_mode_growth_leveling",
    name: "升级成长",
    template: "升级不只写结果，还要写门槛、代价和兑现。",
    driver: "通过清晰可感的成长曲线和阶段突破持续拉动阅读。",
    readerExpectation: "读者不断看到能力、地位或认知层级获得实质提升。",
    payoffs: ["积累条件", "卡点受阻", "完成突破", "展示提升"],
    risks: ["升级像流水账", "能力提升不带来剧情后果"],
    primary: false,
    progressionUnits: ["积累条件", "卡点受阻", "完成突破", "展示提升"],
    allowedConflictForms: ["瓶颈", "试炼", "资源不足", "同层竞争"],
    forbiddenConflictForms: ["成长全靠旁白略过", "突破既无代价也无铺垫", "升级之后拿不到任何兑现"],
    conflictCeiling: "high",
    chapterUnit: "单章推进一次积累、一次卡点试探或一次成长兑现。",
    volumeReward: "卷末完成一个清晰等级、境界或阶段跃迁。",
    mandatorySignals: ["成长门槛", "突破反馈", "阶段变化"],
    antiSignals: ["升级像流水账", "能力提升不带来剧情后果"],
    resolutionStyle: "靠积累、训练、实战与关键顿悟完成成长突破。",
  },
  {
    key: "story_mode_adventure_exploration",
    name: "探索冒险",
    template: "探索要带来真正的新信息、新选择和新危险。",
    driver: "通过不断进入未知区域、接触新规则和发现新秘密保持阅读新鲜感。",
    readerExpectation: "读者持续获得开图、发现与未知感兑现。",
    payoffs: ["进入新区域", "发现新规则", "遭遇风险", "带出新认知"],
    risks: ["探索空转", "新区域没有存在的必要"],
    primary: false,
    progressionUnits: ["进入新区域", "发现新规则", "遭遇风险", "带出新认知"],
    allowedConflictForms: ["环境威胁", "未知规则", "探索竞争", "文明差异"],
    forbiddenConflictForms: ["场景只是换皮", "探索不产出新信息", "一直原地打转，世界边界不动"],
    conflictCeiling: "high",
    chapterUnit: "单章推进一次新发现、一次环境应对或一次地图探索。",
    volumeReward: "卷末打开新的区域层级、秘密入口或冒险目标。",
    mandatorySignals: ["未知感", "发现感", "地图扩展"],
    antiSignals: ["探索空转", "新区域没有存在的必要"],
    resolutionStyle: "靠观察、应对、适应与局部突破打开更深探索。",
  },
  {
    key: "story_mode_dungeon_challenge",
    name: "副本闯关",
    template: "副本不是重复打怪，要写清目标、机制、风险和通关奖励。",
    driver: "通过阶段性关卡挑战和规则破解形成连续的推进快感。",
    readerExpectation: "读者不断获得过关、破局和奖励兑现的满足。",
    payoffs: ["进入副本", "识别机制", "破解难点", "通关结算"],
    risks: ["关卡同质化", "只有数值叠加，没有机制可言"],
    primary: false,
    progressionUnits: ["进入副本", "识别机制", "破解难点", "通关结算"],
    allowedConflictForms: ["关卡机制", "时间压力", "队伍配合", "资源限制"],
    forbiddenConflictForms: ["副本机制全靠硬抗", "通关后拿不到奖励反馈", "关卡反复刷到失去新意"],
    conflictCeiling: "high",
    chapterUnit: "单章推进一个关卡节点、一个机制破解或一次通关反馈。",
    volumeReward: "卷末完成一段完整副本征程，获得显著奖励或更高阶入口。",
    mandatorySignals: ["机制感", "闯关反馈", "奖励兑现"],
    antiSignals: ["关卡同质化", "只有数值叠加，没有机制可言"],
    resolutionStyle: "靠识别规则、团队配合与关键执行完成通关。",
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
  const keyOf = (r: AntiAiRule): string => r.key ?? r.name
  const customKeys = new Set(custom.filter(r => keyOf(r) !== '').map(keyOf))
  return [...BUILTIN_ANTI_AI_RULES.filter(r => !customKeys.has(keyOf(r))), ...custom]
}

/** 安定 key：内置规则全局基线（globalBaselineEnabled）在新书/旧书一律生效。 */
export function ensureGlobalBaseline(assets: ProjectAssets | undefined): ProjectAssets {
  return ensureBuiltinAssets(assets, 'missing_only')
}

/** 内置库种子化 upsert（对齐上游 SystemResourceBootstrapService 精神）。
 *  missing_only 仅补齐缺失的全局基线规则；sync_existing 还会按 key 刷新已内置规则的结构化字段。 */
export function ensureBuiltinAssets(assets: ProjectAssets | undefined, mode: 'missing_only' | 'sync_existing' = 'missing_only'): ProjectAssets {
  const base = assets ?? emptyProjectAssets()
  const keyOf = (r: AntiAiRule): string => r.key ?? r.name
  const existing = base.antiAiRules ?? []
  const byKey = new Map(existing.map(r => [keyOf(r), r]))
  const out: AntiAiRule[] = []
  let changed = false
  for (const r of existing) {
    const builtin = BUILTIN_ANTI_AI_RULES.find(b => (b.key ?? b.name) === keyOf(r))
    if (mode === 'sync_existing' && builtin !== undefined) {
      const refreshed: AntiAiRule = {
        ...builtin,
        name: r.name,
        avoid: r.avoid,
        fix: r.fix,
        detectPatterns: r.detectPatterns ?? builtin.detectPatterns,
        enabled: r.enabled ?? builtin.enabled,
        scope: r.scope,
      }
      out.push(refreshed)
      if (JSON.stringify(refreshed) !== JSON.stringify(r)) changed = true
      byKey.set(keyOf(r), refreshed)
    } else {
      out.push(r)
    }
  }
  for (const b of BUILTIN_ANTI_AI_RULES) {
    if (b.globalBaselineEnabled === true && !byKey.has(b.key ?? b.name)) {
      out.push(b)
      byKey.set(b.key ?? b.name, b)
      changed = true
    }
  }
  if (!changed) return base
  return { ...base, antiAiRules: out }
}

/** 把生效规则渲染成提示词块（禁止/风险/鼓励三档分列，压缩省 token）。 */
export function renderAntiAiRules(assets: ProjectAssets | undefined): string {
  const rules = effectiveAntiAiRules(assets).filter(r => r.enabled !== false)
  if (rules.length === 0) return ''
  const clip = (value: string, max: number): string => value.length > max ? value.slice(0, max) + '…' : value
  const category = (r: AntiAiRule): 'forbidden' | 'risk' | 'encourage' => {
    if (r.severity === 'encourage' || r.name.startsWith('鼓励') || r.avoid.startsWith('（鼓励类）')) return 'encourage'
    if (r.severity === 'risk') return 'risk'
    return 'forbidden'
  }
  const instruction = (r: AntiAiRule): string =>
    (r.promptInstruction !== undefined && r.promptInstruction !== '') ? r.promptInstruction : r.avoid
  const forbidden = rules.filter(r => category(r) === 'forbidden')
  const risk = rules.filter(r => category(r) === 'risk')
  const encourage = rules.filter(r => category(r) === 'encourage')
  const editLine = (r: AntiAiRule): string => r.fix !== '' ? `；修正——${clip(r.fix, 50)}` : ''
  const lines: string[] = []
  lines.push('==================== 反 AI 规则（写作时必须遵守的表达边界） ====================')
  if (forbidden.length > 0) {
    lines.push('禁止类（命中即问题，审稿时列为 high/medium）：')
    for (const r of forbidden) {
      lines.push(`- ${r.name}：${clip(instruction(r), 90)}${editLine(r)}${r.riskLevel !== undefined && r.riskLevel !== 'high' ? `（严重度 ${r.riskLevel}）` : ''}`)
    }
  }
  if (risk.length > 0) {
    lines.push('风险类（可能扣分，审稿按风险等级提示，不硬性阻塞）：')
    for (const r of risk) {
      lines.push(`- ${r.name}：${clip(instruction(r), 90)}（${r.riskLevel ?? 'medium'}${r.autoRewrite === false ? ' · 不自动改写' : ''}）${editLine(r)}`)
    }
  }
  if (encourage.length > 0) {
    lines.push('鼓励类（希望出现，不命中不算错，审稿时只作低优先级建议、不阻塞通过）：')
    for (const r of encourage) {
      lines.push(`- ${r.name}：${clip(r.fix !== '' ? r.fix : r.avoid, 90)}`)
    }
  }
  return lines.join('\n')
}

/** 渲染题材与推进模式提示词块。 */
export function renderGenreAndProgression(assets: ProjectAssets | undefined): string {
  const sections: string[] = []
  if (assets?.genre !== undefined) {
    sections.push('==================== 题材基底（本书的题材定位与读者期待） ====================')
    sections.push(`题材：${assets.genre.name}`)
    if (assets.genre.description !== '') sections.push(`读者期待：${assets.genre.description}`)
    if (assets.genre.template !== undefined && assets.genre.template !== '') sections.push(`写法指引：${assets.genre.template}`)
    const walk = (node: GenreNode, depth: number): void => {
      for (const child of node.children) {
        sections.push(`${'  '.repeat(depth)}- ${child.name}：${child.description}`)
        if (child.template !== undefined && child.template !== '') sections.push(`${'  '.repeat(depth + 1)}写法指引：${child.template}`)
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
      const progressionUnits = mode.progressionUnits ?? []
      const allowedConflictForms = mode.allowedConflictForms ?? []
      const forbiddenConflictForms = mode.forbiddenConflictForms ?? []
      const mandatorySignals = mode.mandatorySignals ?? []
      const antiSignals = mode.antiSignals ?? []
      sections.push(`- 模式「${mode.name}」${tag}：驱动力——${mode.driver}`)
      sections.push(`  读者期待：${mode.readerExpectation}`)
      if (mode.template !== undefined && mode.template !== '') sections.push(`  写法指引：${mode.template}`)
      if (progressionUnits.length > 0) sections.push(`  推进单位：${progressionUnits.join(' → ')}`)
      if (mode.conflictCeiling !== undefined) sections.push(`  冲突上限：${mode.conflictCeiling}`)
      if (allowedConflictForms.length > 0) sections.push(`  允许冲突：${allowedConflictForms.join('、')}`)
      if (forbiddenConflictForms.length > 0) sections.push(`  避免冲突：${forbiddenConflictForms.join('、')}`)
      if (mode.chapterUnit !== undefined && mode.chapterUnit !== '') sections.push(`  单章单位：${mode.chapterUnit}`)
      if (mode.volumeReward !== undefined && mode.volumeReward !== '') sections.push(`  卷末回报：${mode.volumeReward}`)
      if (mandatorySignals.length > 0) sections.push(`  必达信号：${mandatorySignals.join('、')}`)
      if (antiSignals.length > 0) sections.push(`  跑偏信号：${antiSignals.join('、')}`)
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
  const proseRules = [...template.proseRules, ...template.rhythmRules.map(r => `节奏：${r}`)]
  const dialogueRules = [...template.dialogueRules]
  const descriptionRules = [...template.languageRules]
  const boundaries = [`模板「${template.name}」适用题材：${template.applicableGenres.join('、')}`, '不要违背模板的叙事单元结构与节奏约束']
  // 结构化子规则 → 扁平可执行规则（上游 StyleTemplate 的结构化字段在此落地）
  if (template.narrative?.progressionMode !== undefined) proseRules.push(`推进模式：${template.narrative.progressionMode}`)
  if ((template.narrative?.sceneUnitPattern?.length ?? 0) > 0) proseRules.push(`场景单元：${template.narrative!.sceneUnitPattern!.join(' → ')}`)
  if (template.narrative?.multiPov === false) proseRules.push('视角：单一视角')
  if (template.narrative?.endingStyle !== undefined) proseRules.push(`结尾风格：${template.narrative.endingStyle}`)
  if (template.narrative?.summary !== undefined) proseRules.push(`叙述要点：${template.narrative.summary}`)
  if (template.character?.dialogueStyle !== undefined) dialogueRules.push(`台词风格：${template.character.dialogueStyle}`)
  if ((template.character?.defenseMechanisms?.length ?? 0) > 0) dialogueRules.push(`嘴硬/防御方式：${template.character!.defenseMechanisms!.join('、')}`)
  if (template.character?.emotionExpression !== undefined) dialogueRules.push(`情绪表达：${template.character.emotionExpression}`)
  if (template.language?.register !== undefined) descriptionRules.push(`语言：${template.language.register}`)
  if (template.language?.roughness !== undefined) descriptionRules.push(`通俗度：${template.language.roughness}`)
  if (template.language?.sentenceVariation !== undefined) descriptionRules.push(`句式变化：${template.language.sentenceVariation}`)
  if (template.rhythm?.pace !== undefined) boundaries.push(`节奏：${template.rhythm.pace}`)
  if (template.rhythm?.pace === 'fast' || template.rhythm?.pace === 'medium_fast') boundaries.push('节奏偏快，动作先于解释')
  if (template.analysisMarkdown !== undefined && template.analysisMarkdown !== '') proseRules.push(`模板定位：${template.analysisMarkdown}`)
  return {
    name: template.name,
    proseRules,
    dialogueRules,
    descriptionRules,
    boundaries,
    createdAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------- starter profiles

/** 起始风格画像库：无样本文本也能快速绑定一套写法（4 档起步写法）。 */
export const BUILTIN_STARTER_STYLE_PROFILES: StarterStyleProfile[] = [
  { key: 'starter-power-up', templateKey: 'power-up-escalation', name: '开书快跑·目标推进型', description: '第一次开书想先把推进感与爽点兑现跑顺，可以直接拿它起手，之后在这个底子上改。' },
  { key: 'starter-suspense', templateKey: 'suspense-pressure', name: '开书快跑·信息遮蔽型', description: '写给异常、规则、调查、危险逼近这类故事：先把压迫感与信息差立起来。' },
  { key: 'starter-emotional', templateKey: 'emotional-tension', name: '开书快跑·关系拉扯型', description: '写给关系推进、误读拉扯类故事：先拿一套能直接开写的关系表达底子。' },
  { key: 'starter-daily', templateKey: 'immersive-daily', name: '开书快跑·日常浸没型', description: '写给治愈、陪伴、生活经营、轻缓成长类故事：优先保证生活感与沉浸感。' },
]

/** 起始风格画像 → 可直接绑定的 StyleAsset（绑定对应模板，名称用画像名）。 */
export function starterProfileToAsset(profile: StarterStyleProfile): StyleAsset | null {
  const template = BUILTIN_STYLE_TEMPLATES.find(t => t.key === profile.templateKey)
  if (template === undefined) return null
  return { ...styleTemplateToAsset(template), name: profile.name }
}

/** 根据指纹风险推荐仿写预设：low→imitate / medium→balanced / high→transfer。 */
export function recommendStylePreset(fingerprintRisk?: 'low' | 'medium' | 'high'): 'imitate' | 'balanced' | 'transfer' {
  if (fingerprintRisk === 'low') return 'imitate'
  if (fingerprintRisk === 'high') return 'transfer'
  return 'balanced'
}

// ------------------------------------------------------- style extraction

/** 写法引擎：从样本文本提取风格资产的系统提示词（含 preset / 指纹 / 净化管线）。 */
export function styleEngineSystemPrompt(): string {
  return [
    '你是一位资深网文文风分析师。你会收到一段样本文本，请提炼出可复用的叙事风格规则，供后续章节保持同一种味道，同时给出「仿写预设」与「净化」建议。',
    '要求：',
    '1. 从样本中归纳，不要泛泛而谈；每条规则都要能落到具体写法（句式、用词、视角、节奏、对话方式、描写密度）。',
    '2. 台词风格要说明角色说话的语气特征与常用表达方式。',
    '3. 表达边界要写明这段风格「不会怎么做」（如：不用华丽辞藻、不写长段心理独白、不用成语堆砌）。',
    '4. 给出 writingGuidance：净化后的写作指引，即把规则改写成可安全用于生成的具体指导（去掉会暴露来源的具体人名/地名/独特句式）。',
    '5. 给出 forbiddenEntities：样本文本里不可照搬的原作特有实体与标志性表达（人名、地名、核心设定句、独特口头禅等）。',
    '6. 判断预设 preset：imitate=高保真仿写（保留全部特征），balanced=平衡（保留可迁移特征、降指纹），transfer=迁移（只取骨架、彻底去指纹）。',
    '7. 判断 fingerprintRisk：low/medium/high，表示照搬本样本会被识别为抄原作的风险。',
    '8. 输出必须是合法 JSON 对象，不要输出任何其他文字。',
    '输出结构：',
    '{"proseRules": ["叙述视角与句式节奏规则"], "dialogueRules": ["台词风格规则"], "descriptionRules": ["描写密度与情绪表达规则"], "boundaries": ["表达边界"], "preset": "imitate|balanced|transfer", "fingerprintRisk": "low|medium|high", "writingGuidance": ["净化后的写作指引"], "forbiddenEntities": ["不可照搬的原作特有实体"]}',
  ].join('\n')
}

/** 写作公式提取系统提示词（分层：basic 骨架 / standard 完整 / deep 逐句细化）。 */
export function styleFormulaSystemPrompt(depth: 'basic' | 'standard' | 'deep'): string {
  const depthLine = depth === 'basic'
    ? '只提取最核心的叙事骨架与推进公式（1 段即可）。'
    : depth === 'deep'
      ? '逐句/逐段细化：开场如何起、对话如何写、节奏如何控、爽点如何递进（分小节列出）。'
      : '提取完整可复用的写法公式（含结构、句式、节奏、对话、爽点密度）。'
  return [
    '你是一位网文写作公式提炼师。你会收到一段样本文本，请把它浓缩成"这套文怎么写"的写作公式。',
    depthLine,
    '要求：',
    '1. 聚焦 focusAreas 指定的重点（如 开场/对话/节奏/爽点密度/段落结构）。',
    '2. formula 用 Markdown 分小节；applyGuidance 说明生成/改写时如何套用（1-3 句）。',
    '3. 只输出合法 JSON 对象，不要任何其他文字。',
    '输出结构：',
    '{"name": "公式名", "focusAreas": ["重点域"], "formula": "Markdown 公式正文", "applyGuidance": "套用指引"}',
  ].join('\n')
}
