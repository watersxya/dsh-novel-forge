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
    defaultAntiAiRuleKeys: ['禁止总结主题', '禁止段尾升华', '连续三段解释性叙事'],
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
    defaultAntiAiRuleKeys: ['禁止总结主题', '对话纯功能推进', 'AI 高频套话'],
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
    defaultAntiAiRuleKeys: ['禁止解释型心理描写', '禁止直接说教', '对话纯功能推进'],
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
    defaultAntiAiRuleKeys: ['禁止段尾升华', '禁止解释型心理描写', '鼓励无意义小动作'],
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
    defaultAntiAiRuleKeys: ['禁止总结主题', '连续三段解释性叙事', 'AI 高频套话'],
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
    defaultAntiAiRuleKeys: ['禁止段尾升华', '禁止直接说教', '鼓励无意义小动作'],
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
    defaultAntiAiRuleKeys: ['禁止解释型心理描写', '禁止总结主题', '段落长度过于整齐'],
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
    defaultAntiAiRuleKeys: ['禁止直接说教', '禁止总结主题', '连续三段解释性叙事'],
  },]

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
  {
    name: '禁止心中暗道/脑海浮现',
    avoid: '用"心中暗道""脑海中""心里想""暗自思忖"等句式直接暴露角色内心。',
    fix: '把内心活动改成动作、表情、语气或行为结果，让读者自己推断。',
    detectPatterns: ['心中暗道', '脑海中', '心里想', '暗自思忖', '心中暗想', '心里暗道'],
    builtin: true,
  },
  {
    name: '禁止仿佛/好像比喻滥用',
    avoid: '单章"仿佛""好像""犹如""宛如"等比喻词超过5次，产生AI套路感。',
    fix: '减少比喻频率，每个比喻必须是新造的、有具体画面的，不用陈词滥调。',
    detectPatterns: ['仿佛', '好像', '犹如', '宛如', '好似'],
    builtin: true,
  },
  {
    name: '禁止过度排比堆砌',
    avoid: '连续3句以上相同句式或排比结构，显得机械和刻意。',
    fix: '打散句式，用长短句交替，排比不超过2句。',
    detectPatterns: [],
    builtin: true,
  },
  {
    name: '禁止角色全知泄露',
    avoid: '角色说出或知道他/她不可能知道的信息，破坏视角一致性。',
    fix: '严格遵守视角限制，角色只能基于已有信息行动和判断。',
    detectPatterns: [],
    builtin: true,
  },
  {
    name: '鼓励环境细节锚定',
    avoid: '（鼓励类）情绪和氛围缺少具体环境物件锚定，全靠抽象形容词。',
    fix: '用具体物件、光线、声音、温度等环境细节承载情绪，不直接说"紧张""悲伤"。',
    detectPatterns: [],
    builtin: true,
  },
  {
    name: '鼓励角色语言差异化',
    avoid: '（鼓励类）所有角色说话风格雷同，没有口头禅、用词习惯或句式差异。',
    fix: '给每个主要角色设定独特的语言习惯（口头禅/用词偏好/句式长短），对话时严格区分。',
    detectPatterns: [],
    builtin: true,
  },]

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
  {
    name: '都市生活',
    description: '现代都市日常背景，无超能力或超能力为辅，读者期待身份反差、职场逆袭与生活烟火气。',
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
    children: [
      { name: '传统武侠', description: '金庸/古龙风格，江湖恩怨与侠义精神，强调武功描写与人情世故。', children: [] },
      { name: '江湖恩怨', description: '门派/家族/帮会争斗，主角在江湖中成长与抉择，强调义气与复仇。', children: [] },
      { name: '庙堂江湖', description: '朝堂与江湖交织，武侠与权谋结合，强调格局与抉择。', children: [] },
    ],
  },
  {
    name: '现实题材',
    description: '贴近现实生活的行业/职场故事，读者期待专业质感、人性刻画与现实共鸣。',
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

/** 把生效规则渲染成提示词块（禁止/鼓励分列，压缩省 token）。 */
export function renderAntiAiRules(assets: ProjectAssets | undefined): string {
  const rules = effectiveAntiAiRules(assets).filter(r => r.enabled !== false)
  if (rules.length === 0) return ''
  const clip = (value: string, max: number): string => value.length > max ? value.slice(0, max) + '…' : value
  const isEncourage = (r: AntiAiRule): boolean =>
    r.severity === 'encourage' || r.name.startsWith('鼓励') || r.avoid.startsWith('（鼓励类）')
  const forbidden = rules.filter(r => !isEncourage(r))
  const encourage = rules.filter(isEncourage)
  const lines: string[] = []
  lines.push('==================== 反 AI 规则（写作时必须遵守的表达边界） ====================')
  if (forbidden.length > 0) {
    lines.push('禁止类（命中即问题，审稿时列为 high/medium）：')
    for (const r of forbidden) {
      lines.push(`- ${r.name}：避免——${clip(r.avoid, 90)}${r.fix !== '' ? `；修正——${clip(r.fix, 50)}` : ''}`)
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
