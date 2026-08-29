import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
import { spawn } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { BlockAssembler, ReasoningEffortId, createAssistantMessage, createUserMessage } from "@deepseek-ai/dsh-llm";
import { strFromU8, unzipSync } from "fflate";
//#region src/assets.ts
/** 预置写法模板（来自 AI-Novel-Writing-Assistant 内置 DEFAULT_STYLE_TEMPLATES）。 */
const BUILTIN_STYLE_TEMPLATES = [
	{
		key: "power-up-escalation",
		name: "爽文递进推进流",
		description: "持续升级冲突和收益点，强化目标推进与爽点兑现。",
		category: "爽文流",
		applicableGenres: [
			"都市",
			"玄幻",
			"热血"
		],
		proseRules: [
			"围绕目标推进，尽快兑现局部收益；每段都要有目标推进或爽点兑现。",
			"保持明确因果和节奏抬升，场景单元按「目标→阻碍→压制→反转收益」推进。",
			"优先冲突和结果，少停留；段尾用钩子收束。"
		],
		dialogueRules: ["角色表达直接，情绪跟随胜负切换。", "对话承担推进与信息功能，但保留角色自己的语气差异。"],
		languageRules: ["句式清晰，减少无效分散信息。", "直接、明确，不做无谓铺垫。"],
		rhythmRules: ["快节奏，段落密度中等，动作先于解释。", "尽快兑现局部收益，避免拖沓。"],
		defaultAntiAiRuleKeys: [
			"禁止总结主题",
			"对话纯功能推进",
			"连续三段解释性叙事"
		]
	},
	{
		key: "bottom-loop-reality",
		name: "底层循环现实流",
		description: "通过碎片化生活与反复落空表现人物困境。",
		category: "现实流",
		applicableGenres: [
			"都市",
			"现实",
			"成长"
		],
		proseRules: [
			"以时间推进和现实落差构成叙事张力，结尾不解决核心困境。",
			"场景单元按「行为→落差→自我合理化」推进。",
			"以碎片化生活推进，不做总括式回顾。"
		],
		dialogueRules: ["人物情绪通过动作和嘴硬表达，允许短促口语化台词。", "对话保留生活杂音与无效信息。"],
		languageRules: ["语言粗粝、口语化，允许生活杂音与不完整句。", "句子变化度高，允许无意义细节。"],
		rhythmRules: ["段落密实，动作先于解释。", "中快节奏，允许碎片化流动。"],
		defaultAntiAiRuleKeys: [
			"禁止解释型心理描写",
			"禁止段尾升华",
			"鼓励无意义小动作",
			"鼓励现实落差",
			"鼓励嘴硬补偿"
		]
	},
	{
		key: "suspense-pressure",
		name: "悬疑压迫递增流",
		description: "通过信息遮蔽、细节异常和压力叠加制造不安感。",
		category: "悬疑流",
		applicableGenres: [
			"悬疑",
			"惊悚",
			"现实"
		],
		proseRules: [
			"以异常细节、信息差和节奏收束推动悬念层层加压。",
			"场景单元按「现场细节→异常→误判→新风险」推进。",
			"优先制造信息缺口和压迫氛围。"
		],
		dialogueRules: ["角色反应克制，恐惧通过反应显现。", "对话保留克制感，不解释恐惧来源。"],
		languageRules: ["细节精确，保留少量噪音增强现场感。", "克制、中等偏高句变化。"],
		rhythmRules: ["通过节奏收束和信息延迟制造压力。", "中速，段落密度中等偏高。"],
		defaultAntiAiRuleKeys: [
			"禁止解释型心理描写",
			"禁止总结主题",
			"段落长度过于整齐",
			"鼓励现实落差"
		]
	},
	{
		key: "emotional-tension",
		name: "情绪拉扯流",
		description: "通过错位表达、停顿和误读制造关系张力。",
		category: "情感流",
		applicableGenres: [
			"言情",
			"都市",
			"群像"
		],
		proseRules: [
			"人物不直说核心情绪，靠误读、停顿和反应推动关系变化。",
			"场景单元按「动作→言外之意→误读→回避」推进。",
			"以关系错位推进，而非直接说明。"
		],
		dialogueRules: ["情绪通过停顿、动作和言外之意体现。", "对话充满潜台词与试探。"],
		languageRules: ["语言自然，允许留白与停顿。", "句子变化度高，允许无意义细节。"],
		rhythmRules: ["给关系反应留空间，但避免空洞抒情。", "中慢节奏，段落密度中等。"],
		defaultAntiAiRuleKeys: [
			"禁止直接说教",
			"禁止段尾升华",
			"对话纯功能推进",
			"鼓励无意义小动作"
		]
	},
	{
		key: "ensemble-weave",
		name: "群像交织流",
		description: "以多人行动线和视角差异交织推进事件。",
		category: "群像流",
		applicableGenres: [
			"群像",
			"都市",
			"悬疑"
		],
		proseRules: ["多角色并行推进，但每个角色的表达和认知范围必须区分清楚。", "多线并进，但视角切换要受控。"],
		dialogueRules: ["不同角色口吻必须拉开差异，避免所有人说话一样。"],
		languageRules: ["保持角色差异，句式变化度高。", "减少无效分散信息。"],
		rhythmRules: ["多线交织但节奏不乱，平衡推进。", "动作先于解释。"],
		defaultAntiAiRuleKeys: [
			"对话纯功能推进",
			"句式重复率过高",
			"禁止总结主题"
		]
	},
	{
		key: "immersive-daily",
		name: "日常浸没流",
		description: "通过生活细节和细微情绪变化建立持续沉浸感。",
		category: "日常流",
		applicableGenres: [
			"日常",
			"治愈",
			"都市"
		],
		proseRules: ["重场景体验和关系温度，核心情绪通过场景自然流出。", "允许保留生活性动作和无效信息。"],
		dialogueRules: ["人物表达自然，不用高强度戏剧句。", "对话保留生活气息。"],
		languageRules: ["保留生活细节和杂音，不追求工整。", "口语化，句子变化中等偏高。"],
		rhythmRules: ["慢节奏沉浸，但避免空转。", "允许碎片化流动。"],
		defaultAntiAiRuleKeys: [
			"禁止段尾升华",
			"段落长度过于整齐",
			"鼓励无意义小动作"
		]
	},
	{
		key: "cold-professional",
		name: "冷峻专业流",
		description: "以专业事实和行业细节压住情绪，形成克制压力感。",
		category: "专业流",
		applicableGenres: [
			"职场",
			"现实",
			"悬疑"
		],
		proseRules: [
			"行业事实和程序细节优先，情绪不直说，信息密度高于抒情密度。",
			"场景单元按「事实→动作→专业判断→后果」推进。",
			"让专业事实承担叙事重量。"
		],
		dialogueRules: ["情绪藏在专业动作和事实选择里。", "对话以信息性表达为主，克制。"],
		languageRules: ["术语和事实优先，避免廉价金句。", "正式、克制的语言。"],
		rhythmRules: ["信息密度高，但不铺张解释。", "平衡节奏，段落密度中等偏高。"],
		defaultAntiAiRuleKeys: [
			"禁止直接说教",
			"禁止总结主题",
			"句式重复率过高"
		]
	},
	{
		key: "absurd-dark-humor",
		name: "荒诞黑色幽默流",
		description: "通过反差、冷感观察和荒诞细节制造黑色幽默。",
		category: "黑色幽默",
		applicableGenres: [
			"都市",
			"黑色幽默",
			"现实"
		],
		proseRules: [
			"用反差和荒诞细节放大现实困境，笑点和压迫感同时存在。",
			"场景单元按「现实细节→荒诞偏差→冷反应」推进。",
			"依赖反差和冷感观察，而非热闹吐槽。"
		],
		dialogueRules: ["情绪藏在冷反应和嘴硬里。", "台词冷面、口语化，允许自嘲与转移。"],
		languageRules: ["允许夹带荒诞杂质和冷幽默节奏。", "口语化，句子变化度高。"],
		rhythmRules: ["反差点要快落地，不要解释笑点。", "平衡节奏，段落密度中等偏高。"],
		defaultAntiAiRuleKeys: [
			"禁止解释型心理描写",
			"禁止段尾升华",
			"鼓励现实落差",
			"鼓励嘴硬补偿"
		]
	}
];
/** 内置全局反 AI 规则（来自 AI-Novel-Writing-Assistant 内置 DEFAULT_ANTI_AI_RULES）。 */
const BUILTIN_ANTI_AI_RULES = [
	{
		name: "禁止解释型心理描写",
		avoid: "直接使用\"他感到\"\"他意识到\"\"他明白了\"等句式解释人物心理。",
		fix: "把心理解释改成动作、语气、停顿、环境反应或结果。",
		detectPatterns: [
			"他感到",
			"她感到",
			"他意识到",
			"她意识到",
			"他明白了",
			"她明白了"
		],
		builtin: true
	},
	{
		name: "禁止段尾升华",
		avoid: "在段尾或收尾处用总结句升华主题（如\"生活就是\"\"命运总会\"\"说到底\"）。",
		fix: "删除升华句，回到具体动作、现场或悬而未决的处境。",
		detectPatterns: [
			"生活就是",
			"命运总会",
			"归根结底",
			"说到底",
			"这就是"
		],
		builtin: true
	},
	{
		name: "禁止总结主题",
		avoid: "把段落写成总结中心思想或提炼人生道理（如\"这说明\"\"这意味着\"）。",
		fix: "删掉主题总结，让信息通过事件和结果自然显现。",
		detectPatterns: [
			"这说明",
			"这意味着",
			"归根结底",
			"其实就是"
		],
		builtin: true
	},
	{
		name: "禁止直接说教",
		avoid: "作者替角色或读者做直接价值判断和说教（如\"我们都应该\"\"人总要学会\"）。",
		fix: "改成角色具体处境或对话，不做抽象说教。",
		detectPatterns: [
			"我们都应该",
			"人总要学会",
			"真正重要的是"
		],
		builtin: true
	},
	{
		name: "段落长度过于整齐",
		avoid: "段落长度和节奏过于平均，产生 AI 作文感。",
		fix: "打破段落长度均衡，让句子和段落有自然起伏。",
		detectPatterns: [],
		builtin: true
	},
	{
		name: "连续三段解释性叙事",
		avoid: "连续几段只有解释没有动作，削弱现场感。",
		fix: "插入动作、对话、环境反馈，减少连段说明。",
		detectPatterns: [],
		builtin: true
	},
	{
		name: "对话纯功能推进",
		avoid: "对话只有信息推进，没有人物语气和生活噪音（如\"告诉你\"\"我们现在要\"）。",
		fix: "补入停顿、绕弯、语气差异和无效信息。",
		detectPatterns: [
			"告诉你",
			"我们现在要",
			"接下来就"
		],
		builtin: true
	},
	{
		name: "句式重复率过高",
		avoid: "连续句式过于整齐（如\"首先\"\"然后\"\"接着\"\"最后\"），显得机械。",
		fix: "拉开句式长度和起句方式，打散结构。",
		detectPatterns: [
			"首先",
			"然后",
			"接着",
			"最后"
		],
		builtin: true
	},
	{
		name: "AI 高频套话",
		avoid: "滥用\"不禁\"\"仿佛\"\"一时间\"\"不由得\"\"顿时\"\"然而\"\"缓缓\"\"轻轻\"\"微微\"\"似乎\"\"终于\"等模式词及套路比喻。",
		fix: "用具体、有画面感的表达替换套话；每个比喻都应当是新造的。",
		detectPatterns: [
			"不禁",
			"仿佛",
			"一时间",
			"不由得",
			"顿时",
			"缓缓",
			"轻轻",
			"微微"
		],
		builtin: true
	},
	{
		name: "鼓励无意义小动作",
		avoid: "（鼓励类）全篇缺少真实但不推动主线的小动作，人物显得空洞。",
		fix: "补入挠头、点烟、抠包装、挪椅子等小动作，增加人味与生活感。",
		detectPatterns: [],
		builtin: true
	},
	{
		name: "鼓励现实落差",
		avoid: "（鼓励类）人物预期和现实结果完全一致，缺少落差。",
		fix: "补出人物预期与实际结果之间的差距，制造张力。",
		detectPatterns: [],
		builtin: true
	},
	{
		name: "鼓励嘴硬补偿",
		avoid: "（鼓励类）人物吃瘪后没有维持体面的反应。",
		fix: "给角色补一句嘴硬找补或自我合理化，保持人设温度。",
		detectPatterns: [],
		builtin: true
	}
];
/** 内置题材基底库（常用网文题材树，跨书复用）。 */
const BUILTIN_GENRE_LIBRARY = [
	{
		name: "仙侠修真",
		description: "以修仙境界、宗门斗争、法宝丹药为核心，读者期待从凡人到强者的成长与长生问道。",
		children: [
			{
				name: "凡人流",
				description: "资质平凡、步步为营，靠资源积累与心机博弈逆袭，强调真实感与代入感。",
				children: []
			},
			{
				name: "苟道流",
				description: "主角苟且发育、藏锋敛芒，坐收渔利，强调生存智慧与反差爽点。",
				children: []
			},
			{
				name: "争霸流",
				description: "宗门、王朝或大陆争锋，主角由弱到强整合势力，强调格局与权谋。",
				children: []
			}
		]
	},
	{
		name: "都市异能",
		description: "现代都市背景叠加超能力，读者期待隐藏身份、扮猪吃虎与日常反差。",
		children: [
			{
				name: "异能升级",
				description: "觉醒超能力后不断变强，隐藏于都市，遇敌碾压。",
				children: []
			},
			{
				name: "重生复仇",
				description: "重生回到过去，利用先知先觉改变命运、清算仇敌。",
				children: []
			},
			{
				name: "商业经营",
				description: "以超能力或见识经商扩张，建立商业帝国，强调经营爽感。",
				children: []
			}
		]
	},
	{
		name: "悬疑推理",
		description: "以谜题、案件与真相揭露为核心，读者期待线索层层展开与反转。",
		children: [
			{
				name: "本格推理",
				description: "公平线索、逻辑推演，读者可与主角一同解谜。",
				children: []
			},
			{
				name: "刑侦探案",
				description: "警察或侦探视角连续破案，案件串联主线，强调现实与人性。",
				children: []
			},
			{
				name: "无限流",
				description: "主角穿梭于不同副本世界解谜求生，副本之间累积成长。",
				children: []
			}
		]
	},
	{
		name: "玄幻奇幻",
		description: "异世界或架空大陆的冒险成长，读者期待宏大世界观、奇遇与战力突破。",
		children: [
			{
				name: "学院流",
				description: "入学修炼、同窗竞争、大赛扬名，强调青春感与阶梯式打脸。",
				children: []
			},
			{
				name: "废柴逆袭",
				description: "开局废柴受辱，觉醒金手指后一路逆袭打脸，强调反差与爽点。",
				children: []
			},
			{
				name: "诸天万界",
				description: "穿越诸天世界收集资源与能力，强调世界多样性与成长曲线。",
				children: []
			}
		]
	},
	{
		name: "历史军事",
		description: "以历史时代为背景的争霸、谋略或军旅故事，读者期待权谋博弈与时代质感。",
		children: [{
			name: "王朝争霸",
			description: "乱世崛起、招贤纳士、逐鹿天下，强调战略与人心。",
			children: []
		}, {
			name: "穿越种田",
			description: "穿越古代发展生产、经营家族，强调建设感与生活细节。",
			children: []
		}]
	},
	{
		name: "末世科幻",
		description: "末世危机或科幻设定下的生存与重建，读者期待资源管理、危机升级与人性考验。",
		children: [{
			name: "基地经营",
			description: "建立基地、收集资源、抵御危机，强调建设与扩张。",
			children: []
		}, {
			name: "进化觉醒",
			description: "末世异变中觉醒能力不断进化，强调战力成长与危机求生。",
			children: []
		}]
	}
];
/** 内置常用推进模式。 */
const BUILTIN_PROGRESSION_MODES = [
	{
		name: "升级变强",
		driver: "主角的实力、境界或能力持续增长，读者期待每次突破带来的碾压与认可。",
		readerExpectation: "每隔几章有一次明确的实力提升或打脸兑现；大境界突破要有仪式感。",
		payoffs: [
			"突破境界",
			"学会新技能",
			"越级战胜强敌",
			"当众打脸质疑者"
		],
		risks: [
			"升级重复套路",
			"战力膨胀失控",
			"无铺垫强行突破"
		],
		primary: false
	},
	{
		name: "经营扩张",
		driver: "主角的产业、势力或领地不断扩张，资源复利滚雪球。",
		readerExpectation: "经营投入有可感知的回报，扩张遇到新挑战并解决。",
		payoffs: [
			"新产业上线",
			"规模翻倍",
			"吞并对手",
			"资源闭环成型"
		],
		risks: [
			"过程枯燥",
			"扩张无阻力",
			"数值失衡"
		],
		primary: false
	},
	{
		name: "解谜揭露",
		driver: "主线谜团（身世、阴谋、世界观真相）持续牵引读者，每揭开一层又引出更深一层。",
		readerExpectation: "定期有真相碎片放出，回收旧伏笔、埋设新伏笔。",
		payoffs: [
			"伏笔回收",
			"身份揭露",
			"阴谋浮出水面",
			"反转打脸"
		],
		risks: [
			"谜题拖太久",
			"伏笔忘记回收",
			"反转生硬"
		],
		primary: false
	},
	{
		name: "渔翁得利",
		driver: "强敌相互厮杀，主角躲在暗处观察、收割，风险由他人承担、果实由主角获取。",
		readerExpectation: "冲突升级时主角以最小代价获取最大收益，且不暴露自身。",
		payoffs: [
			"坐收渔利",
			"捡漏宝物",
			"敌人两败俱伤",
			"信息差获利"
		],
		risks: [
			"重复套路",
			"收割太轻易",
			"主角全程无风险"
		],
		primary: false
	},
	{
		name: "关系拉扯",
		driver: "人物关系（知己、对手、师徒、情感线）的张力与变化持续推动剧情。",
		readerExpectation: "关系有进有退、有误会与和解，情绪起伏带动阅读欲。",
		payoffs: [
			"关系升温",
			"信任建立",
			"背叛与挽回",
			"并肩作战"
		],
		risks: [
			"情感线停滞",
			"工业糖精",
			"为虐而虐"
		],
		primary: false
	}
];
/** 默认（空）项目写作资产。 */
function emptyProjectAssets() {
	return {
		auxiliaryProgressions: [],
		antiAiRules: [],
		styleAssets: []
	};
}
/** 合并项目资产与内置库：返回「生效的反 AI 规则」（内置全局 + 项目自定义）。 */
function effectiveAntiAiRules(assets) {
	const custom = assets?.antiAiRules ?? [];
	const customNames = new Set(custom.map((r) => r.name));
	return [...BUILTIN_ANTI_AI_RULES.filter((r) => !customNames.has(r.name)), ...custom];
}
/** 把生效规则渲染成提示词块（压缩：avoid/fix 截断，省 token）。 */
function renderAntiAiRules(assets) {
	const rules = effectiveAntiAiRules(assets);
	if (rules.length === 0) return "";
	const clip = (value, max) => value.length > max ? value.slice(0, max) + "…" : value;
	return ["==================== 反 AI 规则（写作时必须遵守的表达边界） ====================", ...rules.map((r) => `- ${r.name}：避免——${clip(r.avoid, 90)}${r.fix !== "" ? `；修正——${clip(r.fix, 50)}` : ""}`)].join("\n");
}
/** 渲染题材与推进模式提示词块。 */
function renderGenreAndProgression(assets) {
	const sections = [];
	if (assets?.genre !== void 0) {
		sections.push("==================== 题材基底（本书的题材定位与读者期待） ====================");
		sections.push(`题材：${assets.genre.name}`);
		if (assets.genre.description !== "") sections.push(`读者期待：${assets.genre.description}`);
		const walk = (node, depth) => {
			for (const child of node.children) {
				sections.push(`${"  ".repeat(depth)}- ${child.name}：${child.description}`);
				walk(child, depth + 1);
			}
		};
		walk(assets.genre, 1);
	}
	const modes = [...assets?.primaryProgression !== void 0 ? [assets.primaryProgression] : [], ...assets?.auxiliaryProgressions ?? []];
	if (modes.length > 0) {
		sections.push("==================== 推进模式（读者为什么继续看） ====================");
		for (const mode of modes) {
			const tag = mode.primary ? "（主推进）" : "（辅助）";
			sections.push(`- 模式「${mode.name}」${tag}：驱动力——${mode.driver}`);
			sections.push(`  读者期待：${mode.readerExpectation}`);
			if (mode.payoffs.length > 0) sections.push(`  常见兑现：${mode.payoffs.join("、")}`);
			if (mode.risks.length > 0) sections.push(`  节奏风险（避免）：${mode.risks.join("、")}`);
		}
	}
	return sections.join("\n");
}
/** 渲染写法资产提示词块（规则去重，省 token）。 */
function renderStyleAssets(assets) {
	const styles = assets?.styleAssets ?? [];
	if (styles.length === 0) return "";
	const sections = ["==================== 写法资产（本书的叙事风格约束） ===================="];
	for (const style of styles) {
		sections.push(`【${style.name}】`);
		const unique = (rules) => [...new Set(rules)];
		if (style.proseRules.length > 0) sections.push("叙述与节奏：\n" + unique(style.proseRules).map((r) => `- ${r}`).join("\n"));
		if (style.dialogueRules.length > 0) sections.push("台词风格：\n" + unique(style.dialogueRules).map((r) => `- ${r}`).join("\n"));
		if (style.descriptionRules.length > 0) sections.push("描写与情绪：\n" + unique(style.descriptionRules).map((r) => `- ${r}`).join("\n"));
		if (style.boundaries.length > 0) sections.push("表达边界：\n" + unique(style.boundaries).map((r) => `- ${r}`).join("\n"));
	}
	return sections.join("\n");
}
/** 渲染全部写作资产提示词（供生成/规划/审稿注入）。 */
function renderAllAssets(assets) {
	return [
		renderGenreAndProgression(assets),
		renderStyleAssets(assets),
		renderAntiAiRules(assets)
	].filter((part) => part !== "").join("\n\n");
}
/** 写法引擎：从样本文本提取风格资产的系统提示词。 */
function styleEngineSystemPrompt() {
	return [
		"你是一位资深网文文风分析师。你会收到一段样本文本，请提炼出可复用的叙事风格规则，供后续章节保持同一种味道。",
		"要求：",
		"1. 从样本中归纳，不要泛泛而谈；每条规则都要能落到具体写法（句式、用词、视角、节奏、对话方式、描写密度）。",
		"2. 台词风格要说明角色说话的语气特征与常用表达方式。",
		"3. 表达边界要写明这段风格「不会怎么做」（如：不用华丽辞藻、不写长段心理独白、不用成语堆砌）。",
		"4. 输出必须是合法 JSON 对象，不要输出任何其他文字。",
		"JSON 结构：",
		"{\"proseRules\": [\"叙述视角与句式节奏规则\"], \"dialogueRules\": [\"台词风格规则\"], \"descriptionRules\": [\"描写密度与情绪表达规则\"], \"boundaries\": [\"表达边界\"]}"
	].join("\n");
}
//#endregion
//#region src/comic-presets.ts
const COMIC_STYLE_PRESETS = [
	{
		id: "japan",
		label: "日漫 / 黑白",
		prompt: "manga style, screentone, bold ink lines, high contrast, black and white, cel shading",
		layoutHint: "页漫优先"
	},
	{
		id: "korea",
		label: "韩漫 / 条漫",
		prompt: "manhwa style, soft cel shading, vibrant colors, clean lineart, webtoon vertical composition, glossy highlights",
		layoutHint: "条漫优先"
	},
	{
		id: "china",
		label: "国漫 / 古风",
		prompt: "chinese ink painting style, flowing brush strokes, traditional palette, ethereal atmosphere, xianxia aesthetic",
		layoutHint: "页漫/条漫均可"
	},
	{
		id: "america",
		label: "美漫 / 超级英雄",
		prompt: "american comic style, bold outlines, dramatic lighting, dynamic poses, vibrant colors, halftone shading",
		layoutHint: "页漫优先"
	},
	{
		id: "chibi",
		label: "Q版 / 搞笑",
		prompt: "chibi style, cute proportions, big head, exaggerated expressions, simple background, bright colors",
		layoutHint: "条漫/四格优先"
	},
	{
		id: "realistic",
		label: "写实 / 电影感",
		prompt: "realistic cinematic style, detailed textures, natural lighting, film grain, high detail",
		layoutHint: "页漫/全彩"
	},
	{
		id: "cyber",
		label: "赛博 / 暗黑",
		prompt: "cyberpunk style, neon lights, dark atmosphere, high contrast, futuristic city, cool tones",
		layoutHint: "页漫/全彩"
	}
];
function getComicStylePrompt(styleId) {
	if (!styleId) return "";
	return COMIC_STYLE_PRESETS.find((s) => s.id === styleId)?.prompt ?? "";
}
//#endregion
//#region src/style-library.ts
/** 内置风格模板（18 个）。 */
const STYLE_LIBRARY = [
	{
		id: "pixar-adult-3d",
		name: "成人向皮克斯 3D",
		category: "3d",
		traits: "CG 三维渲染，材质细腻，微表情表现力强；需压制 Q 版可爱感",
		keywords: "3D皮克斯动画，成人写实CGI，电影光影，拒绝Q版",
		weight: 1
	},
	{
		id: "arcane-thick-3d",
		name: "双城之战美漫厚涂 3D",
		category: "3d",
		traits: "粗重轮廓线，高对比硬阴影，材质粗粝，悲剧、压抑、科幻题材适配高",
		keywords: "双城之战美术，3D美漫厚涂，强轮廓光影，暗调粗粝渲染",
		weight: .95
	},
	{
		id: "nextgen-cg",
		name: "次世代游戏 CG",
		category: "3d",
		traits: "接近真人的三维渲染，照片级布料、皮肤材质，冷峻写实",
		keywords: "次世代游戏CG渲染，超写实3D，真实物理材质，电影布光",
		weight: .9
	},
	{
		id: "low-cyberpunk-3d",
		name: "底层赛博朋克 3D",
		category: "3d",
		traits: "锈蚀工业、破碎霓虹、屏幕噪点；避开华丽高楼，偏向破败底层",
		keywords: "底层赛博朋克3D，废土工业，破碎霓虹，画面噪点色散",
		weight: .85
	},
	{
		id: "vaporwave-3d",
		name: "复古蒸汽波 3D",
		category: "3d",
		traits: "粉-蓝-紫霓虹轮廓、90 年代复古网格、胶片色散颗粒，颓废疏离",
		keywords: "3D复古蒸汽波，90年代三维渲染，霓虹轮廓光，胶片颗粒",
		weight: .8
	},
	{
		id: "dark-gothic-3d",
		name: "暗黑哥特 3D",
		category: "3d",
		traits: "大面积阴影、冷青色调、衰败破败质感，适合幽暗密闭空间",
		keywords: "3D暗黑哥特，冷青暗光，衰败质感，大面积阴影",
		weight: .8
	},
	{
		id: "clay-stopmotion-3d",
		name: "黏土 / 定格 3D",
		category: "3d",
		traits: "捏塑颗粒肌理，手工定格质感；可做压抑向，不局限可爱风",
		keywords: "3D黏土定格渲染，泥塑肌理，电影打光",
		weight: .7
	},
	{
		id: "openworld-survival",
		name: "开放世界生存游戏风",
		category: "game",
		traits: "场景破败感强，货架、仓库、管线、灰尘、锈蚀明显；人物带一点“生存者”气质；适合探索感、逃亡感、世界观展示",
		keywords: "开放世界生存游戏风格，废土场景，破败仓库，锈蚀金属货架，灰尘粒子，冷色写实光影",
		weight: .8
	},
	{
		id: "horror-game-3d",
		name: "恐怖游戏 3D",
		category: "game",
		traits: "大面积阴影，荧光灯频闪，空间压抑；适合悬疑、压迫、精神异常段落",
		keywords: "恐怖游戏 3D 风格，昏暗仓库，老旧荧光灯，硬阴影，压迫空间，冷灰蓝调，低饱和",
		weight: .75
	},
	{
		id: "tactical-stealth",
		name: "战术潜行游戏风",
		category: "game",
		traits: "低视角、第三人称镜头感；人物在货架之间移动，光影克制；适合紧张剧情",
		keywords: "战术潜行游戏视角，第三人称镜头，货架通道，冷色暗光，真实3D渲染，紧张压迫氛围",
		weight: .7
	},
	{
		id: "korean-webtoon",
		name: "韩漫条漫风",
		category: "2d",
		traits: "修长人物，低饱和高级灰，氛围感强，都市向漫剧爆款画风",
		keywords: "韩漫2D绘画，精致人物，低饱和灰调，氛围感插画",
		weight: 1
	},
	{
		id: "japan-cel-dark",
		name: "日系赛璐璐动画",
		category: "2d",
		traits: "干净勾线，硬阴影；分明亮版、暗调悲剧版（边缘行者质感）",
		keywords: "日系赛璐璐动画，清晰轮廓线，硬阴影，暗调都市动画",
		weight: .9
	},
	{
		id: "shinkai-anime",
		name: "新海诚动画风",
		category: "2d",
		traits: "极致环境光影、丁达尔、空气中尘埃粒子，擅长雨夜、夜景外景",
		keywords: "新海诚动画渲染，细腻环境光，漂浮尘埃粒子",
		weight: .85
	},
	{
		id: "pop-marvel-2d",
		name: "波普美漫",
		category: "2d",
		traits: "网点半调、强撞色，线条张扬，节奏冲击力强",
		keywords: "平行宇宙波普美漫，网点半调，漫画粗线条",
		weight: .8
	},
	{
		id: "dark-ghibli",
		name: "暗黑吉卜力手绘",
		category: "2d",
		traits: "手绘水彩肌理；强制关闭温暖治愈，做残酷冷调版本",
		keywords: "吉卜力手绘动画，暗黑写实，水彩肌理，拒绝暖光治愈",
		weight: .75
	},
	{
		id: "noir-film",
		name: "黑色电影 Noir",
		category: "film",
		traits: "高反差黑白，只保留少量色彩作为视觉锚点，张力极强",
		keywords: "黑色电影，大部分黑白，局部保留色彩，硬侧光，胶片颗粒",
		stackable: true,
		weight: 1
	},
	{
		id: "vhs90",
		name: "VHS 90 录像带复古",
		category: "film",
		traits: "扫描线、色彩偏移、磁带噪点，模拟老旧档案录像",
		keywords: "VHS录像带质感，扫描线，色彩偏移，磁带噪点",
		stackable: true,
		weight: .9
	},
	{
		id: "film-photo",
		name: "胶片电影写真",
		category: "film",
		traits: "电影机拍摄质感，轻微颗粒，景深虚化，无夸张特效",
		keywords: "电影写真质感，35mm胶片，胶片颗粒，浅景深",
		stackable: true,
		weight: .85
	},
	{
		id: "chinese-ink",
		name: "新中式水墨动画",
		category: "craft",
		traits: "水墨晕染，留白写意",
		keywords: "水墨动画渲染，写意晕染，国风2D",
		weight: 1
	},
	{
		id: "paper-cut-3d",
		name: "纸雕定格",
		category: "craft",
		traits: "多层纸张镂空叠层，光影穿透纸面",
		keywords: "立体纸雕定格，纸张肌理，层叠镂空光影",
		weight: .9
	},
	{
		id: "guofeng-heavy",
		name: "工笔重彩国风",
		category: "craft",
		traits: "精细线条，矿物颜料质感，古典华美",
		keywords: "工笔重彩，国风2D绘画，矿物颜料质感，精细勾线",
		weight: .8
	}
];
/** 取单个风格（未找到返回 undefined）。 */
function findStyle(id) {
	return STYLE_LIBRARY.find((s) => s.id === id);
}
/** 按基底 + 滤镜拼接风格关键词（角色图/分镜/视频提示词共用；缺省回退 3D 动漫）。 */
function styleKeywords(styleId, filterId) {
	const parts = [];
	const base = styleId !== void 0 ? findStyle(styleId) : void 0;
	if (base !== void 0) parts.push(base.keywords);
	const filter = filterId !== void 0 ? findStyle(filterId) : void 0;
	if (filter !== void 0) parts.push(filter.keywords);
	return parts.join("，") || "3D动漫，超精细建模，电影光影";
}
//#endregion
//#region src/shot-language.ts
const SHOT_SIZES = [
	{
		id: "extreme_wide",
		zh: "大远景",
		en: "extreme wide shot",
		hint: "环境为主，人物很小"
	},
	{
		id: "wide",
		zh: "远景",
		en: "wide shot",
		hint: "人在景中，交代环境"
	},
	{
		id: "full",
		zh: "全景",
		en: "full shot",
		hint: "全身』人物整体"
	},
	{
		id: "medium",
		zh: "中景",
		en: "medium shot",
		hint: "膝部以上，叙事主力"
	},
	{
		id: "medium_close",
		zh: "中近景",
		en: "medium close-up",
		hint: "胸以上，表情+动作"
	},
	{
		id: "close",
		zh: "近景",
		en: "close-up",
		hint: "肩以上，突出表情"
	},
	{
		id: "extreme_close",
		zh: "特写",
		en: "extreme close-up",
		hint: "脸/物细节"
	},
	{
		id: "big_extreme_close",
		zh: "大特写",
		en: "big close-up",
		hint: "局部（眼/手/标志物）"
	}
];
const CAMERA_MOVES = [
	{
		id: "static",
		zh: "固定机位",
		en: "static camera",
		hint: "机位不动"
	},
	{
		id: "dolly_in",
		zh: "推近",
		en: "dolly in",
		hint: "镜头向主体逼近"
	},
	{
		id: "dolly_out",
		zh: "拉远",
		en: "dolly out",
		hint: "镜头远离主体"
	},
	{
		id: "pan_left",
		zh: "左摇",
		en: "pan left",
		hint: "机位不动，镜头左转"
	},
	{
		id: "pan_right",
		zh: "右摇",
		en: "pan right",
		hint: "机位不动，镜头右转"
	},
	{
		id: "track_left",
		zh: "左横移",
		en: "track left",
		hint: "机位随主体左移"
	},
	{
		id: "track_right",
		zh: "右横移",
		en: "track right",
		hint: "机位随主体右移"
	},
	{
		id: "follow",
		zh: "跟随",
		en: "follow shot",
		hint: "镜头跟着主体运动"
	},
	{
		id: "pedestal_up",
		zh: "升镜",
		en: "pedestal up",
		hint: "机位抬高"
	},
	{
		id: "pedestal_down",
		zh: "降镜",
		en: "pedestal down",
		hint: "机位降低"
	},
	{
		id: "orbit",
		zh: "环绕",
		en: "orbit shot",
		hint: "镜头绕主体转"
	},
	{
		id: "handheld",
		zh: "手持晃动",
		en: "handheld",
		hint: "真实感/紧张感"
	},
	{
		id: "low_angle",
		zh: "低机位仰拍",
		en: "low angle",
		hint: "突出威严/压迫"
	},
	{
		id: "high_angle",
		zh: "高机位俯拍",
		en: "high angle",
		hint: "突出渺小/全知"
	},
	{
		id: "over_shoulder",
		zh: "过肩镜头",
		en: "over-the-shoulder",
		hint: "对话常用"
	}
];
const LIGHTINGS = [
	{
		id: "front",
		zh: "顺光",
		en: "front light",
		hint: "正面均匀照明"
	},
	{
		id: "side",
		zh: "侧光",
		en: "side light",
		hint: "明暗对比强"
	},
	{
		id: "back",
		zh: "逆光",
		en: "back light",
		hint: "轮廓光/剪影"
	},
	{
		id: "top",
		zh: "顶光",
		en: "top light",
		hint: "俯照硬朗"
	},
	{
		id: "rembrandt",
		zh: "伦勃朗光",
		en: "rembrandt lighting",
		hint: "侧逆光，经典人像"
	},
	{
		id: "neon",
		zh: "霓虹光",
		en: "neon lighting",
		hint: "赛博/夜景"
	},
	{
		id: "hard",
		zh: "硬光",
		en: "hard light",
		hint: "犀利阴影"
	},
	{
		id: "soft",
		zh: "柔光",
		en: "soft light",
		hint: "柔和过渡"
	},
	{
		id: "mood",
		zh: "氛围光",
		en: "mood lighting",
		hint: "情绪化色温"
	},
	{
		id: "contrast",
		zh: "高反差",
		en: "high contrast",
		hint: "黑白/强明暗"
	}
];
/** 从中文文本归一化到景别（处理旧数据/LLM 口语）。未知回退 medium。 */
function normalizeShotSize(text) {
	if (text === void 0 || text === "") return "medium";
	const t = text.trim();
	if (t.includes("大远景")) return "extreme_wide";
	if (t.includes("远景")) return "wide";
	if (t.includes("全景")) return "full";
	if (t.includes("中近景") || t.includes("中景")) return "medium";
	if (t.includes("近景") || t.includes("胸")) return "close";
	if (t.includes("大特写")) return "big_extreme_close";
	if (t.includes("特写")) return "extreme_close";
	return "medium";
}
/** 从中文文本归一化到运镜列表。 */
function normalizeCameras(text) {
	if (text === void 0 || text === "") return ["static"];
	const t = text.trim();
	const out = [];
	const push = (id) => {
		if (!out.includes(id)) out.push(id);
	};
	if (t.includes("推近") || t.includes("推进")) push("dolly_in");
	if (t.includes("拉远") || t.includes("拉出")) push("dolly_out");
	if (t.includes("左摇")) push("pan_left");
	if (t.includes("右摇")) push("pan_right");
	if (t.includes("横移")) push(t.includes("左") ? "track_left" : "track_right");
	if (t.includes("跟随") || t.includes("跟拍")) push("follow");
	if (t.includes("升降") || t.includes("升") || t.includes("降")) push("pedestal_up");
	if (t.includes("环绕")) push("orbit");
	if (t.includes("手持") || t.includes("晃动")) push("handheld");
	if (t.includes("低机位") || t.includes("仰拍") || t.includes("仰")) push("low_angle");
	if (t.includes("高机位") || t.includes("俯拍") || t.includes("俯")) push("high_angle");
	if (t.includes("过肩")) push("over_shoulder");
	if (out.length === 0) push("static");
	return out;
}
/** 从中文文本归一化到构图（可选）。 */
function normalizeComposition(text) {
	if (text === void 0 || text === "") return void 0;
	const t = text.trim();
	if (t.includes("三分")) return "rule_of_thirds";
	if (t.includes("中心") || t.includes("居中")) return "center";
	if (t.includes("引导")) return "leading_line";
	if (t.includes("前景")) return "foreground";
	if (t.includes("低机位")) return "low";
	if (t.includes("俯拍") || t.includes("俯视")) return "overhead";
	if (t.includes("对称")) return "symmetry";
}
/** 从中文文本归一化到光效列表。 */
function normalizeLightings(text) {
	if (text === void 0 || text === "") return ["soft"];
	const t = text.trim();
	const out = [];
	const push = (id) => {
		if (!out.includes(id)) out.push(id);
	};
	if (t.includes("顺光")) push("front");
	if (t.includes("侧光") || t.includes("伦勃朗")) push(t.includes("伦勃朗") ? "rembrandt" : "side");
	if (t.includes("逆光")) push("back");
	if (t.includes("顶光")) push("top");
	if (t.includes("霓虹")) push("neon");
	if (t.includes("硬光")) push("hard");
	if (t.includes("柔光")) push("soft");
	if (t.includes("氛围") || t.includes("情绪")) push("mood");
	if (t.includes("高反差")) push("contrast");
	if (out.length === 0) push("soft");
	return out;
}
/** 取词条中文（ZHs 合并句子）。 */
function sizeZh(id) {
	return SHOT_SIZES.find((e) => e.id === id)?.zh ?? "中景";
}
function cameraZh(ids) {
	if (ids === void 0 || ids.length === 0) return "固定机位";
	return CAMERA_MOVES.filter((e) => ids.includes(e.id)).map((e) => e.zh).join(" + ");
}
function lightZh(ids) {
	if (ids === void 0 || ids.length === 0) return "柔光";
	return LIGHTINGS.filter((e) => ids.includes(e.id)).map((e) => e.zh).join(" + ");
}
//#endregion
//#region src/story-beat-language.ts
/** 从中文归一化叙事功能（未知回退 exposition）。 */
function normalizeStoryFunction(text) {
	if (text === void 0 || text === "") return "exposition";
	const t = text.trim();
	if (t.includes("铺垫")) return "exposition";
	if (t.includes("冲突")) return "conflict";
	if (t.includes("转折")) return "turn";
	if (t.includes("高潮")) return "climax";
	if (t.includes("收束")) return "resolve";
	if (t.includes("伏笔")) return "foreshadow";
	if (t.includes("人物塑造")) return "character";
	return "exposition";
}
/** 从中文文本归一化情绪词列表（可含→箭头链）。 */
function normalizeEmotions(text) {
	if (text === void 0 || text === "") return ["calm"];
	const t = text.trim();
	const out = [];
	const push = (id) => {
		if (!out.includes(id)) out.push(id);
	};
	if (t.includes("平静")) push("calm");
	if (t.includes("淡然")) push("indifferent");
	if (t.includes("期待")) push("expectant");
	if (t.includes("好奇")) push("curious");
	if (t.includes("警觉")) push("alert");
	if (t.includes("压抑")) push("suppressed");
	if (t.includes("隐忍")) push("enduring");
	if (t.includes("担忧")) push("worried");
	if (t.includes("焦躁")) push("irritable");
	if (t.includes("不安")) push("uneasy");
	if (t.includes("惊惧")) push("terrified");
	if (t.includes("愤怒")) push("angry");
	if (t.includes("崩溃")) push("collapsing");
	if (t.includes("决绝")) push("resolute");
	if (t.includes("痛心")) push("grieved");
	if (t.includes("释然")) push("relieved");
	if (t.includes("悲凉")) push("bittersweet");
	if (t.includes("得意")) push("triumphant");
	if (t.includes("重生")) push("reborn");
	if (t.includes("麻木")) push("numb");
	if (out.length === 0) push("calm");
	return out;
}
//#endregion
//#region src/engine.ts
/**
* Novel engine — the host half's core: LLM-driven story-bible extraction,
* volume planning, chapter planning, chapter-by-chapter writing with
* auto-review + rewrite, polish (de-AI-ify), narrative summaries, foreshadow
* tracking, project persistence, and whole-book export. Pure Node (no
* web-server dependencies), so routes stay thin and logic is testable.
*/
/**
* 内容合规红线（平台硬性要求）：所有书籍、所有章节无条件生效，
* 优先级高于单书大纲/圣经中的任何设定与作者自定义红线。
* 注入点：章节生成系统提示 + 审稿系统提示（命中即 high）。
*/
const COMPLIANCE_REDLINES = [
	"1. 不得出现反对宪法所确定的基本原则的内容。",
	"2. 不得出现危害国家安全、泄露国家秘密、颠覆国家政权、破坏国家统一的内容。",
	"3. 不得出现危害国家荣誉和利益的内容。",
	"4. 不得出现煽动民族仇恨、民族歧视、破坏民族团结的内容。",
	"5. 不得出现破坏国家宗教政策、宣扬邪教和愚昧迷信的内容（不得以真实宗教、邪教或迷信活动为背景进行宣扬）。",
	"6. 不得出现散布谣言、扰乱社会秩序、破坏社会稳定的内容。",
	"7. 不得出现淫秽色情、赌博、暴力、凶杀、恐怖或教唆犯罪的内容（网文语境：禁止露骨性描写、血腥暴力渲染、赌博教唆、犯罪手法详细教学）。",
	"8. 不得出现侮辱或者诽谤他人、侵害他人合法权益的内容（不得以真实人物、组织为原型进行侮辱或影射攻击）。",
	"9. 不得出现法律法规禁止的其他内容。"
];
/** Project state file name inside the output dir. */
const PROJECT_FILE = "novel-project.json";
/** 智能解码文本文件：UTF-8 BOM / UTF-16 BOM / UTF-8（严格校验）/ GB18030 回退。 */
function decodeTextSmart(buf) {
	if (buf.length >= 3 && buf[0] === 239 && buf[1] === 187 && buf[2] === 191) return buf.subarray(3).toString("utf8");
	if (buf.length >= 2 && buf[0] === 255 && buf[1] === 254) return buf.subarray(2).toString("utf16le");
	const utf8 = buf.toString("utf8");
	const bad = countReplacementChars(utf8);
	if (bad === 0) return utf8;
	try {
		const gbk = new TextDecoder("gb18030").decode(buf);
		if (countReplacementChars(gbk) < bad) return gbk;
	} catch {}
	return utf8;
}
/** 统计替换字符 U+FFFD 数量（UTF-8 乱码检测）。 */
function countReplacementChars(s) {
	let n = 0;
	for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 65533) n++;
	return n;
}
/** Sanitize a file name: keep CJK/alphanumerics/space/dash/underscore. */
function safeFileName(name) {
	return name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}
/** Chapter output file name, e.g. 第001章_开篇.md */
function chapterFileName(chapter) {
	const title = safeFileName(chapter.title) || `第${chapter.no}章`;
	return `第${String(chapter.no).padStart(3, "0")}章_${title}.md`;
}
/** Infer a book name from the outline's first non-empty line. */
function inferBookName(outline) {
	return (outline.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "未命名小说").replace(/^《/, "").replace(/》.*$/, "").slice(0, 40);
}
/** Read the persisted project from the output dir (undefined when absent). */
function loadProject(outputDir) {
	const file = join(outputDir, PROJECT_FILE);
	if (!existsSync(file)) return void 0;
	try {
		let rawText = readFileSync(file, "utf8");
		if (rawText.charCodeAt(0) === 65279) rawText = rawText.slice(1);
		const raw = JSON.parse(rawText);
		if (typeof raw.outline !== "string" || !Array.isArray(raw.chapters)) return void 0;
		if (!Array.isArray(raw.foreshadows)) raw.foreshadows = [];
		if (raw.assets === void 0 || typeof raw.assets !== "object") raw.assets = emptyProjectAssets();
		if (!Array.isArray(raw.assets.antiAiRules)) raw.assets.antiAiRules = [];
		if (!Array.isArray(raw.assets.auxiliaryProgressions)) raw.assets.auxiliaryProgressions = [];
		if (!Array.isArray(raw.assets.styleAssets)) raw.assets.styleAssets = [];
		if (!Array.isArray(raw.facts)) raw.facts = [];
		if (!Array.isArray(raw.plotlines)) raw.plotlines = [];
		return raw;
	} catch {
		return;
	}
}
/** Persist the project state next to the chapters. */
function saveProject(outputDir, project) {
	mkdirSync(outputDir, { recursive: true });
	writeFileSync(join(outputDir, PROJECT_FILE), JSON.stringify(project, null, 2), "utf8");
}
/**
* 并发保护：长任务（章节计划生成/正文生成）在内存中持有旧快照，
* 期间其他请求可能修改了「易变字段」（道藏/角色库/剧情线/人物志存档/简介/封面）。
* 保存前用磁盘最新版本合并这些字段，避免旧快照覆盖新修改（曾导致角色卡丢失）。
* 注意：调用方若自己修改了这些字段，不要使用本函数。
*/
function mergeVolatileFromDisk(outputDir, project) {
	try {
		const disk = loadProject(outputDir);
		if (disk === void 0) return;
		project.bible = disk.bible;
		project.roles = disk.roles;
		project.mangaRoles = disk.mangaRoles;
		project.plotlines = disk.plotlines;
		project.roleStatus = disk.roleStatus;
		project.blurb = disk.blurb;
		project.coverPath = disk.coverPath;
		project.facts = disk.facts;
		project.assets = disk.assets;
		project.world = disk.world;
		project.volumes = disk.volumes;
	} catch {}
}
/**
* 内置违禁词库（网文平台常见审查类别）。只做硬匹配提示，不代替人工判断。
* 词语刻意保持常见写法；作者可自行判断是否修改。
*/
const SENSITIVE_WORDS = [
	{
		word: "共匪",
		category: "政治"
	},
	{
		word: "独裁",
		category: "政治"
	},
	{
		word: "法轮",
		category: "政治"
	},
	{
		word: "六四",
		category: "政治"
	},
	{
		word: "天安门事件",
		category: "政治"
	},
	{
		word: "翻墙",
		category: "政治"
	},
	{
		word: "政治敏感",
		category: "政治"
	},
	{
		word: "乳沟",
		category: "擦边"
	},
	{
		word: "酥胸",
		category: "擦边"
	},
	{
		word: "淫荡",
		category: "擦边"
	},
	{
		word: "做爱",
		category: "擦边"
	},
	{
		word: "上床",
		category: "擦边"
	},
	{
		word: "裸体",
		category: "擦边"
	},
	{
		word: "一丝不挂",
		category: "擦边"
	},
	{
		word: "胴体",
		category: "擦边"
	},
	{
		word: "春药",
		category: "擦边"
	},
	{
		word: "催情",
		category: "擦边"
	},
	{
		word: "迷奸",
		category: "擦边"
	},
	{
		word: "强暴",
		category: "擦边"
	},
	{
		word: "轮奸",
		category: "擦边"
	},
	{
		word: "援交",
		category: "擦边"
	},
	{
		word: "嫖娼",
		category: "擦边"
	},
	{
		word: "卖淫",
		category: "擦边"
	},
	{
		word: "色情",
		category: "擦边"
	},
	{
		word: "情色",
		category: "擦边"
	},
	{
		word: "撸管",
		category: "擦边"
	},
	{
		word: "自慰",
		category: "擦边"
	},
	{
		word: "口交",
		category: "擦边"
	},
	{
		word: "打炮",
		category: "擦边"
	},
	{
		word: "约炮",
		category: "擦边"
	},
	{
		word: "一夜情",
		category: "擦边"
	},
	{
		word: "碎尸",
		category: "暴力"
	},
	{
		word: "分尸",
		category: "暴力"
	},
	{
		word: "凌迟",
		category: "暴力"
	},
	{
		word: "剥皮",
		category: "暴力"
	},
	{
		word: "开膛",
		category: "暴力"
	},
	{
		word: "剖腹",
		category: "暴力"
	},
	{
		word: "挖心",
		category: "暴力"
	},
	{
		word: "虐杀",
		category: "暴力"
	},
	{
		word: "凌辱",
		category: "暴力"
	},
	{
		word: "血腥",
		category: "暴力"
	},
	{
		word: "大屠杀",
		category: "暴力"
	},
	{
		word: "灭门",
		category: "暴力"
	},
	{
		word: "满门抄斩",
		category: "暴力"
	},
	{
		word: "腰斩",
		category: "暴力"
	},
	{
		word: "活埋",
		category: "暴力"
	},
	{
		word: "点天灯",
		category: "暴力"
	},
	{
		word: "傻逼",
		category: "辱骂"
	},
	{
		word: "傻B",
		category: "辱骂"
	},
	{
		word: "草泥马",
		category: "辱骂"
	},
	{
		word: "妈的",
		category: "辱骂"
	},
	{
		word: "尼玛",
		category: "辱骂"
	},
	{
		word: "去死",
		category: "辱骂"
	},
	{
		word: "废物",
		category: "辱骂"
	},
	{
		word: "垃圾",
		category: "辱骂"
	},
	{
		word: "人渣",
		category: "辱骂"
	},
	{
		word: "贱人",
		category: "辱骂"
	},
	{
		word: "婊子",
		category: "辱骂"
	},
	{
		word: "狗日的",
		category: "辱骂"
	},
	{
		word: "加微信",
		category: "广告"
	},
	{
		word: "加QQ",
		category: "广告"
	},
	{
		word: "微信公众号",
		category: "广告"
	},
	{
		word: "淘宝",
		category: "广告"
	},
	{
		word: "拼多多",
		category: "广告"
	},
	{
		word: "刷单",
		category: "广告"
	},
	{
		word: "充值返利",
		category: "广告"
	},
	{
		word: "扫码领",
		category: "广告"
	},
	{
		word: "加群领",
		category: "广告"
	},
	{
		word: "vx",
		category: "广告"
	},
	{
		word: "扣扣",
		category: "广告"
	},
	{
		word: "赌博",
		category: "其他"
	},
	{
		word: "赌场",
		category: "其他"
	},
	{
		word: "毒品",
		category: "其他"
	},
	{
		word: "冰毒",
		category: "其他"
	},
	{
		word: "摇头丸",
		category: "其他"
	},
	{
		word: "自杀方法",
		category: "其他"
	},
	{
		word: "邪教",
		category: "其他"
	},
	{
		word: "传销",
		category: "其他"
	},
	{
		word: "军火",
		category: "其他"
	},
	{
		word: "枪支",
		category: "其他"
	},
	{
		word: "管制刀具",
		category: "其他"
	}
];
/** 对一段文本做违禁词硬匹配，返回命中（词/类别/次数）。 */
function checkSensitiveText(text) {
	const hits = [];
	for (const entry of SENSITIVE_WORDS) {
		let count = 0;
		let idx = text.indexOf(entry.word);
		while (idx !== -1) {
			count++;
			idx = text.indexOf(entry.word, idx + entry.word.length);
		}
		if (count > 0) hits.push({
			word: entry.word,
			category: entry.category,
			count
		});
	}
	return hits;
}
/** List generated chapter files in the output dir (sorted). */
function listChapterFiles(outputDir) {
	if (!existsSync(outputDir)) return [];
	try {
		return readdirSync(outputDir).filter((name) => /^第\d+章_.*\.md$/.test(name) && !name.endsWith(".bak.md")).sort((a, b) => {
			return Number(/^第(\d+)章/.exec(a)?.[1] ?? 0) - Number(/^第(\d+)章/.exec(b)?.[1] ?? 0);
		});
	} catch {
		return [];
	}
}
/** Re-sync chapter status against files on disk (a file may exist without state). */
function syncProjectWithDisk(project, outputDir) {
	const files = /* @__PURE__ */ new Map();
	for (const file of listChapterFiles(outputDir)) {
		const no = Number(/^第(\d+)章/.exec(file)?.[1] ?? 0);
		if (no > 0) files.set(String(no), file);
	}
	for (const chapter of project.chapters) {
		const file = files.get(String(chapter.no));
		if (file !== void 0 && (chapter.status === "pending" || chapter.status === "generating")) {
			chapter.status = "written";
			chapter.file = file;
		}
	}
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
}
/** Read a chapter's markdown body from disk (undefined when missing). */
function readChapterFile(outputDir, chapter) {
	if (chapter.file === void 0) return void 0;
	const path = join(outputDir, chapter.file);
	if (!existsSync(path)) return void 0;
	return readFileSync(path, "utf8");
}
/** Create a fresh project from an outline. */
function createProject(outline, outlinePath) {
	const now = (/* @__PURE__ */ new Date()).toISOString();
	return {
		bookName: inferBookName(outline),
		outline,
		outlinePath,
		chapters: [],
		foreshadows: [],
		assets: emptyProjectAssets(),
		facts: [],
		createdAt: now,
		updatedAt: now
	};
}
/** One complete non-streaming LLM call. */
async function complete(ctx, config, options) {
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: options.user
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-novel-forge"
		}
	})];
	const request = {
		provider: config.provider,
		model: config.model,
		messages,
		system: options.system,
		maxTokens: options.maxTokens ?? config.maxTokens,
		temperature: options.temperature ?? .7,
		reasoningEffort: ReasoningEffortId(options.reasoning ?? config.reasoningEffort ?? "off")
	};
	const assembler = new BlockAssembler();
	for await (const chunk of ctx.llm.stream(request)) assembler.push(chunk);
	const finish = assembler.finish;
	if (finish.kind === "error" || finish.kind === "aborted") throw new Error(`LLM 调用失败（${finish.kind}）: ${finish.failure.message}`);
	if (finish.kind === "max-tokens") throw new Error("LLM 输出达到 maxTokens 上限，请增大配置后重试");
	const blocks = assembler.blocks();
	if (process.env.DSH_NOVEL_DEBUG === "1") console.error("[dsh-novel-forge] complete: finish=%j blocks=%j", JSON.stringify(finish), blocks.map((b) => `${b.type}:${"text" in b ? b.text.length : "?"}`));
	let text = blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (text === "") {
		const reasoning = blocks.filter((block) => block.type === "reasoning").map((block) => block.text).join("\n").trim();
		if (reasoning !== "") text = reasoning;
	}
	return text;
}
/**
* Parse a JSON value out of a model response. Multi-level tolerance because
* models are sloppy: prose around the JSON, ```json fences, a truncated tail,
* or raw newlines inside string values all defeat a single JSON.parse. We
* walk candidates from strictest to loosest.
*/
function parseJson(text, wantArray) {
	const candidates = [];
	const push = (value) => {
		if (value !== void 0 && value.trim() !== "") candidates.push(value.trim());
	};
	push(text);
	push(/```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1]);
	const opener = wantArray ? "[" : "{";
	const closer = wantArray ? "]" : "}";
	const start = text.indexOf(opener);
	const end = text.lastIndexOf(closer);
	if (start !== -1 && end > start) push(text.slice(start, end + 1));
	const trimmed = text.replace(new RegExp(`${closer}[\\s\\S]*$`), closer);
	push(trimmed);
	const start2 = trimmed.indexOf(opener);
	if (start2 !== -1) push(trimmed.slice(start2));
	const repair = (value) => {
		let out = "";
		let inString = false;
		for (let i = 0; i < value.length; i++) {
			const ch = value[i];
			if (inString) {
				if (ch === "\\") {
					out += ch + (value[i + 1] ?? "");
					i++;
					continue;
				}
				if (ch === "\"") {
					inString = false;
					out += ch;
					continue;
				}
				if (ch === "\n" || ch === "\r") {
					out += "\\n";
					continue;
				}
				out += ch;
			} else {
				if (ch === "\"") inString = true;
				out += ch;
			}
		}
		return out;
	};
	for (const candidate of candidates) for (const attempt of [candidate, repair(candidate)]) try {
		const value = JSON.parse(attempt);
		if (!wantArray || Array.isArray(value)) return value;
		if (typeof value === "object" && value !== null) for (const key of Object.keys(value)) {
			const inner = value[key];
			if (Array.isArray(inner)) return inner;
		}
	} catch {}
	const preview = text.length > 300 ? text.slice(0, 300) + "…" : text;
	throw new Error(`模型输出中未找到 JSON 数据。模型原始输出：${preview}`);
}
/** Parse a JSON array (chapters, volumes, issues...). */
function parseJsonArray(text) {
	const value = parseJson(text, true);
	return Array.isArray(value) ? value : [];
}
/** Parse a JSON object. */
function parseJsonObject(text) {
	const value = parseJson(text, false);
	if (typeof value !== "object" || value === null) throw new Error("模型输出不是 JSON 对象");
	return value;
}
/** System prompt for story-bible extraction. */
function bibleSystemPrompt() {
	return [
		"你是一位资深网文编辑兼设定架构师。你会收到一份小说大纲，请把它提炼成结构化的「设定圣经」(Story Bible)，供后续写作时严格引用。",
		"要求：",
		"1. 忠于大纲，不自行发明大纲之外的设定。",
		"2. 角色卡覆盖大纲明确出现的角色（主角必含），每个角色给出性格标签、目标、关键关系。",
		"3. 世界规则覆盖力量体系、金手指机制、势力、地理等所有硬性规则，逐条列出。",
		"4. 红线列出大纲中明确禁止的内容（如无后宫、不圣母、无无脑碾压等）。",
		"5. 风格列出叙事基调、节奏、POV 等写作风格要点。",
		"6. 角色名必须用正文/编年录中的真实姓名；若大纲只写「主角」未点名，而已写章节或编年录中有名字，则用该真实姓名；禁止输出「主角（描述）」这类把身份塞进名字的占位名。",
		"输出必须是合法 JSON 对象，不要输出任何其他文字或 Markdown 代码块标记。",
		"重要：所有字符串值内部不得包含换行符（不要用多行字符串），JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。",
		"JSON 结构：",
		"{\"genre\": \"题材与基调一句话\", \"worldRules\": [\"规则1\", \"规则2\", ...], \"characters\": [{\"name\": \"角色名\", \"role\": \"protagonist|supporting|antagonist|other\", \"traits\": [\"标签1\", ...], \"goals\": \"目标与动机\", \"relations\": \"关键关系\"}], \"redLines\": [\"红线1\", ...], \"style\": [\"风格1\", ...]}"
	].join("\n");
}
/** Extract the story bible from an outline. */
async function extractBible(ctx, config, outline, project) {
	const written = (project?.chapters ?? []).filter((c) => c.status !== "pending" && c.status !== "generating" && c.file !== void 0);
	const excerpts = [];
	for (const chapter of written.slice(0, 3)) {
		const body = readChapterFile(config.outputDir, chapter);
		if (body === void 0) continue;
		const text = body.replace(/^#.*$/gm, "").trim();
		if (text.length > 0) excerpts.push(`第${chapter.no}章《${chapter.title}》\n${text.slice(0, 2200)}`);
	}
	const facts = (project?.facts ?? []).slice(-40);
	const user = [
		`请为下面这部小说提炼设定圣经：\n\n${outline}`,
		facts.length > 0 ? `\n\n【已写章节事实（编年录）】用于确认真实角色姓名与已确立设定；忠于大纲，不要新增大纲外设定：\n${facts.map((f) => `[第${f.chapterNo}章] ${f.text.slice(0, 100)}`).join("\n")}` : "",
		excerpts.length > 0 ? `\n\n【已写章节正文摘录】角色姓名、身份以正文为准（大纲未点名时用正文里的真实姓名，禁止用「主角（描述）」占位名）：\n${excerpts.join("\n\n")}` : ""
	].filter((s) => s !== "").join("\n");
	const raw = parseJsonObject(await complete(ctx, config, {
		system: bibleSystemPrompt(),
		user,
		temperature: .4,
		maxTokens: Math.max(config.maxTokens, 16e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const strArray = (value) => Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim() !== "") : [];
	const characters = Array.isArray(raw.characters) ? raw.characters.filter((v) => typeof v === "object" && v !== null).map((entry) => ({
		name: typeof entry.name === "string" ? entry.name.trim() : "未命名",
		role: [
			"protagonist",
			"supporting",
			"antagonist",
			"other"
		].includes(entry.role) ? entry.role : "other",
		traits: strArray(entry.traits),
		goals: typeof entry.goals === "string" ? entry.goals : "",
		relations: typeof entry.relations === "string" ? entry.relations : "",
		knowledge: strArray(entry.knowledge)
	})).filter((card) => card.name !== "") : [];
	const realProtagonist = (project?.roles ?? []).find((r) => r.roleLabel === "protagonist")?.name?.trim();
	if (realProtagonist !== void 0 && realProtagonist !== "") {
		for (const card of characters) if (card.role === "protagonist" && /^(主角|未命名)/.test(card.name)) card.name = realProtagonist;
	}
	const bible = {
		genre: typeof raw.genre === "string" ? raw.genre : "",
		worldRules: strArray(raw.worldRules),
		characters,
		redLines: strArray(raw.redLines),
		style: strArray(raw.style),
		generatedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	if (bible.worldRules.length === 0 && bible.characters.length === 0 && bible.redLines.length === 0) throw new Error("道藏生成失败：模型没有返回有效内容");
	return bible;
}
/** System prompt for volume planning. */
function volumeSystemPrompt() {
	return [
		"你是一位资深网文总编。你会收到一份小说大纲，请把全书划分为若干「卷」（分卷），每卷有明确的剧情定位与起止章节。",
		"要求：",
		"1. 大纲已有分卷时，严格遵循大纲的分卷结构；没有时按剧情弧线合理划分（3-8 卷）。",
		"2. 卷定位一句话说明该卷的剧情重心。",
		"3. chapterStart/chapterEnd 给出该卷覆盖的章节区间（从 1 开始连续编号）。",
		"输出必须是合法 JSON 数组，不要输出任何其他文字：",
		"[{\"no\": 1, \"title\": \"卷名\", \"summary\": \"卷定位与剧情重心\", \"chapterStart\": 1, \"chapterEnd\": 80}]",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。"
	].join("\n");
}
/** Plan volumes from an outline. */
async function planVolumes(ctx, config, outline) {
	const user = `请为下面这部小说划分卷：\n\n${outline}`;
	const parsed = parseJsonArray(await complete(ctx, config, {
		system: volumeSystemPrompt(),
		user,
		temperature: .4,
		maxTokens: Math.max(config.maxTokens, 12e3)
	}));
	const volumes = [];
	for (let i = 0; i < parsed.length; i++) {
		const entry = parsed[i];
		if (typeof entry !== "object" || entry === null) continue;
		const no = typeof entry.no === "number" ? entry.no : i + 1;
		const title = typeof entry.title === "string" ? entry.title.trim() : `第${no}卷`;
		const summary = typeof entry.summary === "string" ? entry.summary.trim() : "";
		const start = typeof entry.chapterStart === "number" ? entry.chapterStart : void 0;
		const end = typeof entry.chapterEnd === "number" ? entry.chapterEnd : void 0;
		volumes.push({
			no,
			title: title.slice(0, 40),
			summary: summary.slice(0, 300),
			chapterStart: start ?? 1,
			chapterEnd: end ?? 1
		});
	}
	if (volumes.length === 0) throw new Error("卷计划生成失败：模型没有返回有效卷");
	return volumes;
}
/** Assign a chapter to its volume by number. */
function volumeOf(chapterNo, volumes) {
	if (volumes === void 0 || volumes.length === 0) return 0;
	for (const volume of volumes) if (chapterNo >= volume.chapterStart && chapterNo <= volume.chapterEnd) return volume.no;
	return volumes[volumes.length - 1]?.no ?? 0;
}
/** The chapter-planning prompt template. */
function planSystemPrompt(volumes) {
	return [
		"你是一位资深中文网文策划编辑，擅长把小说大纲拆解为可执行的章节计划。",
		"你会收到一份小说大纲。请根据大纲的设定、主线与节奏，规划出一份章节计划。",
		"要求：",
		"1. 每章必须有明确的核心剧情推进（不能只是过渡或凑字数）。",
		"2. 章节之间要衔接自然，前章结尾为后章埋下钩子。",
		"3. 严格遵循大纲的人设、金手指规则、战力体系与世界观设定，不得自行发明冲突设定。",
		"4. 输出必须是合法的 JSON 数组，不要输出任何其他文字或 Markdown 代码块标记。",
		"5. 数组每个元素格式：{\"title\": \"章节标题（10字以内，有网文感）\", \"beats\": \"结构化剧情要点（150-250字，必须包含四段，段间用换行分隔）：\\n本章目标：本章要完成的核心推进；\\n剧情要点：主要情节的起承转合（2-4 句）；\\n爽点/钩子：本章的爽点兑现或情绪钩子；\\n结尾钩子：本章结尾为下一章埋下的悬念\"}",
		"重要：beats 字段内部必须使用 \\n 转义表示换行（JSON 字符串内不得有真实换行符），其余字符串值也不得包含真实换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。",
		volumes !== void 0 && volumes.length > 0 ? ["\n全书分卷结构（规划章节时需落在对应卷内）："].concat(volumes.map((v) => `第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`)).join("\n") : ""
	].join("\n");
}
/** Build the writing system prompt (bible + outline + active foreshadows). */
function writeSystemPrompt(project) {
	const bible = project.bible;
	const sections = [];
	if (bible !== void 0) {
		sections.push("==================== 设定圣经（写作时严格遵守） ====================");
		if (bible.genre !== "") sections.push(`题材基调：${bible.genre}`);
		if (bible.worldRules.length > 0) sections.push("世界规则：\n" + bible.worldRules.map((r) => `- ${r}`).join("\n"));
		if (bible.characters.length > 0) {
			sections.push("角色卡：");
			for (const card of bible.characters) {
				const roleName = {
					protagonist: "主角",
					supporting: "配角",
					antagonist: "反派",
					other: "其他"
				}[card.role];
				sections.push(`- ${card.name}（${roleName}）：${card.traits.join("、")}${card.goals !== "" ? `；目标：${card.goals}` : ""}${card.relations !== "" ? `；关系：${card.relations}` : ""}`);
				if (Array.isArray(card.knowledge) && card.knowledge.length > 0) sections.push(`  已知信息（该角色知道的：${card.knowledge.join("；")}；未列出的信息该角色一律不知道，不得写其知晓或提及）`);
			}
		}
		const roleLib = project.roles ?? [];
		if (roleLib.length > 0) {
			const labelName = {
				protagonist: "主角",
				female_lead: "女主",
				female_support: "女配",
				support: "配角",
				antagonist: "反派",
				extra: "路人"
			};
			sections.push("角色库（出场角色按定位规格刻画互动）：");
			for (const r of roleLib) sections.push(`- ${r.name}（${labelName[r.roleLabel]}）：${r.identity}${r.relations.length > 0 ? `；关系：${r.relations.join("、")}` : ""}`);
		}
		if (bible.redLines.length > 0) sections.push("写作红线（违反即失败）：\n" + bible.redLines.map((r) => `- ${r}`).join("\n"));
		if (bible.style.length > 0) sections.push("风格要求：\n" + bible.style.map((r) => `- ${r}`).join("\n"));
	}
	const worldBlock = renderWorld(project.world);
	if (worldBlock !== "") sections.push(worldBlock);
	sections.push("==================== 全书大纲 ====================");
	const outlineBlock = project.outline.length > 6e3 ? project.outline.slice(0, 6e3) + "\n…（大纲过长已节选，完整内容见总纲页）" : project.outline;
	sections.push(outlineBlock);
	sections.push("==================== 大纲结束 ====================");
	const assetsBlock = renderAllAssets(project.assets);
	if (assetsBlock !== "") sections.push(assetsBlock);
	const active = project.foreshadows.filter((f) => f.status === "planted" || f.status === "progressing");
	if (active.length > 0) {
		sections.push("==================== 活跃伏笔（近期需推进或回收的线索） ====================");
		for (const f of active) sections.push(`- [${f.status === "planted" ? "已埋设" : "推进中"}] ${f.description}${f.targetChapter !== void 0 ? `（预计 ${f.targetChapter} 章回收）` : ""}`);
	}
	const lines = (project.plotlines ?? []).filter((l) => l.status === "active" || l.status === "paused");
	if (lines.length > 0) {
		const kindName = {
			main: "主线",
			branch: "支线",
			character: "人物线",
			mystery: "悬念线"
		};
		sections.push("==================== 剧情线（本章应推进至少一条活跃线） ====================");
		for (const l of lines) sections.push(`- [${kindName[l.kind]}${l.status === "paused" ? "·暂停中" : ""}] ${l.name}：${l.goal}${l.progress !== "" ? `（当前进度：${l.progress}）` : ""}`);
	}
	sections.push("");
	sections.push("写作硬性要求：");
	sections.push("1. 每章 3000-4000 字（按中文字符计），只输出章节正文，不要输出标题、章回名、作者的话或任何 Markdown 标记。");
	sections.push("2. 以主角视角展开，动作、对话、心理描写交替推进，禁止大段设定说明。");
	sections.push("3. 尊重大纲与设定圣经：人设不崩、金手指规则不自相矛盾、战力不随意膨胀。");
	sections.push("4. 章末留一个钩子（悬念、反转或新线索），吸引读者读下一章。");
	sections.push("5. 语言流畅自然，符合中文网文语感，避免翻译腔与病句。");
	sections.push("6. 对话与冲突密度：每章至少 1 处实质对话或正面对抗/交锋场面；推理与心理活动必须用动作、环境细节、微表情、对话呈现，禁止整章纯内心独白铺陈（禁止\"解说式\"交代线索）。");
	sections.push("7. 反派与对手的行动力：本章出现的反派/对手必须有其行动、反制或压迫感（布局、试探、追索、交锋至少占其一），不得作为纯背景板存在。");
	sections.push("8. 配角辨识度：重要新登场配角应给姓名或可辨识的独有特征；禁止通篇用\"瘦高个/灰衣人/戴面具者\"等身形标签代称同一角色。");
	sections.push("9. 信息呈现方式：关键线索、设定、局势通过对话、动作、发现物呈现，禁止主角内心\"讲解\"给读者听。");
	sections.push("");
	sections.push("==================== 内容合规红线（平台硬性要求，最高优先级，违反即失败） ====================");
	sections.push(COMPLIANCE_REDLINES.join("\n"));
	sections.push("以上九条为硬性底线，任何情况下不得以任何形式出现或影射；若剧情确需涉及（如批判、反讽），只能以明确否定、揭露、批判的立场呈现，且不得展开细节。");
	return sections.join("\n");
}
/**
* Plan chapters from an outline (optionally for one volume).
*/
async function planChapters(ctx, config, project, chapterCount, volumeNo, outputDir) {
	const volume = project.volumes?.find((v) => v.no === volumeNo);
	const existing = project.chapters;
	const startNo = existing.length === 0 ? 1 : Math.max(...existing.map((c) => c.no)) + 1;
	const continuation = existing.length > 0;
	const latestFacts = continuation && Array.isArray(project.facts) ? project.facts.slice(-15).map((f) => `[第${f.chapterNo}章] ${f.text.slice(0, 150)}`).join("\n") : "";
	let prevTail = "";
	if (continuation) {
		const written = existing.filter((c) => c.status !== "pending");
		const last = written[written.length - 1];
		if (last !== void 0 && last.file !== void 0 && outputDir !== void 0) try {
			prevTail = readFileSync(join(outputDir, last.file), "utf8").replace(/^#.*$/m, "").trim().slice(-600);
		} catch {}
	}
	const outlineBlock = continuation ? (() => {
		if (project.outline.length <= 2e4) return project.outline;
		const cut = project.outline.indexOf("十、全书核心弹幕记忆梗");
		if (cut > 1500) return project.outline.slice(0, cut).trimEnd() + "\n（大纲过长，末尾记忆梗从略）";
		return project.outline.slice(0, 8e3) + "\n…（大纲过长已节选）";
	})() : project.outline;
	const user = [
		"请为下面这部小说规划章节。",
		volume !== void 0 ? `本次只规划第 ${volume.no} 卷《${volume.title}》的章节：\n${volume.summary}` : continuation ? `本书已有 ${existing.length} 章已规划/已写作（见下方「已有章节」）。请规划**后续**章节：从第 ${startNo} 章开始。` : "请规划全书开篇章节。",
		continuation ? "【续写硬性要求】已有章节的剧情不得重写或重复，章节标题也不得与已有章节重复。以下情节均已在已有章节中发生过，后续章节**绝对不得再次出现**：穿越、暴雨送餐、滴血认主/古玉认主、首次进入墟境、用废铁淬炼首件法器、绝境肉身入鼎洗炼（该机缘已用尽）、杀死白袍弟子与灰衣随从、藏尸水沟。\n若本次规划已进入大纲的收尾区间（接近全书规划总章数），最后 5-10 章必须按大纲推进到大结局（终极抉择/清算/双结局等），**禁止以悬念、逃离、未解之谜收尾**——收尾区间按大纲卷定位判断，不以当前剧情是否“感觉像结尾”为准。" : "",
		prevTail !== "" ? `【上一章（第 ${startNo - 1} 章）结尾原文】第 ${startNo} 章必须紧接此状态继续，从新的事件写起，不得回顾重述：\n${prevTail}` : "",
		latestFacts !== "" ? `【最新剧情状态（本书编年录，第 ${startNo - 1} 章结尾的事实）】规划续写时必须以此为起点，时间线、人物状态与地点衔接一致：\n${latestFacts}` : "",
		continuation ? "已有章节（共 " + existing.length + " 章；仅列最近 80 章，更早的以标题计数为准，剧情以「编年录」为权威）：\n" + existing.slice(-80).map((c) => {
			const sm = c.summary !== void 0 && c.summary !== "" ? `（${c.summary.slice(0, 120)}）` : "";
			return `第${c.no}章《${c.title}》${sm}`;
		}).join("\n") : "",
		`全书大纲（设定参考，续写剧情不得与设定冲突）：\n${outlineBlock}`,
		"",
		`请规划 ${chapterCount} 章。输出 JSON 数组（不要输出其他文字）：`
	].join("\n");
	const parsed = parseJsonArray(await complete(ctx, config, {
		system: planSystemPrompt(project.volumes) + (continuation ? "\n重要：本次是**续写规划**——已有章节的剧情不得重写或重复，新章节标题不得与已有章节标题相同，新章节的剧情必须从上一章结尾自然接续（人物状态、时间线、地点衔接一致）。" : ""),
		user,
		temperature: .7,
		maxTokens: Math.max(config.maxTokens, 4e4)
	}));
	const chapters = [];
	const existingNos = new Set(existing.map((c) => c.no));
	const existingTitles = new Set(existing.map((c) => c.title));
	let cursor = startNo;
	for (const item of parsed) {
		if (chapters.length >= chapterCount) break;
		if (typeof item !== "object" || item === null) continue;
		const entry = item;
		const title = typeof entry.title === "string" ? entry.title.trim().slice(0, 30) : "";
		const beats = typeof entry.beats === "string" ? entry.beats.trim() : "";
		if (title === "" && beats === "") continue;
		if (title !== "" && existingTitles.has(title)) continue;
		while (existingNos.has(cursor)) cursor++;
		const no = cursor++;
		chapters.push({
			no,
			volume: volumeOf(no, project.volumes),
			title: title || `第${no}章`,
			beats,
			targetChars: config.chapterChars,
			status: "pending"
		});
	}
	if (chapters.length === 0) throw new Error("章节计划生成失败：模型没有返回有效章节");
	return chapters;
}
/** The review system prompt. */
function reviewSystemPrompt(project) {
	const bible = project.bible;
	const sections = [
		"你是一位严格的网文审稿编辑。你会收到一章正文以及本书的设定圣经与红线。",
		"请从以下维度审查本章：",
		"1. 人设一致性：角色行为是否符合角色卡（主角不圣母、不无脑、痞坏有分寸等）。",
		"2. 设定一致性：金手指规则、战力体系、世界观是否与设定圣经冲突。",
		"3. 红线检查：是否触犯写作红线（无后宫、无擦边、无无脑碾压等）。",
		"4. 文笔质量：语病、翻译腔、AI 套话（\"不禁\"\"仿佛\"\"一时间\"等高频词滥用）、流水账。",
		"5. 节奏与爽点：本章是否有推进、有钩子，是否拖沓灌水。",
		"6. 逻辑漏洞：前后矛盾、时间线错误、对话失真。",
		"7. 反 AI 规则：逐条核对下方「反 AI 规则」清单，命中即列为问题。",
		"8. 呈现方式：整章是否纯内心推理铺陈（无对话/无对抗，推理全靠解说）；反派是否纯背景板无行动；重要配角是否无名标签化（瘦高个/灰衣人全程代称）——命中即列为问题。",
		"9. 内容合规（最高优先级）：逐条核对下方「内容合规红线」，任何一条命中（含影射、暗示、详细描写）必须列为 high，并给出改写建议。",
		"输出必须是合法 JSON 对象，不要输出任何其他文字：",
		"{\"score\": 0-100的整数, \"verdict\": \"一句话总评\", \"issues\": [{\"severity\": \"high|medium|low\", \"item\": \"问题描述\", \"suggestion\": \"修改建议\"}]}",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	];
	const assetsBlock = renderAllAssets(project.assets);
	if (assetsBlock !== "") sections.push("\n" + assetsBlock);
	if (bible !== void 0) {
		sections.push("\n==================== 设定圣经 ====================");
		if (bible.worldRules.length > 0) sections.push("世界规则：\n" + bible.worldRules.map((r) => `- ${r}`).join("\n"));
		if (bible.characters.length > 0) {
			sections.push("角色卡：");
			for (const card of bible.characters) {
				sections.push(`- ${card.name}（${card.role}）：${card.traits.join("、")}`);
				if (Array.isArray(card.knowledge) && card.knowledge.length > 0) sections.push(`  该角色知道：${card.knowledge.join("；")}（未列出的信息该角色不知道）`);
			}
		}
		if (bible.redLines.length > 0) sections.push("红线：\n" + bible.redLines.map((r) => `- ${r}`).join("\n"));
	}
	sections.push("\n==================== 内容合规红线（平台硬性要求，最高优先级） ====================");
	sections.push(COMPLIANCE_REDLINES.join("\n"));
	sections.push("以上九条为硬性底线：正文中任何一条命中（含影射、暗示、详细展开）都必须列为 high，并给出改写建议；作者自定义红线不得豁免这九条。");
	return sections.join("\n");
}
/** Run the AI review on one chapter. */
async function reviewChapter(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) throw new Error(`章节 ${chapterNo} 的正文文件不存在`);
	const user = [
		`本章标题：《${chapter.title}》`,
		`本章剧情要点：${chapter.beats}`,
		"==================== 章节正文 ====================",
		body.replace(/^#\s+.*$/m, "").trim()
	].join("\n");
	const raw = parseJsonObject(await complete(ctx, config, {
		system: reviewSystemPrompt(project),
		user,
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 16e3)
	}));
	const issues = Array.isArray(raw.issues) ? raw.issues.filter((v) => typeof v === "object" && v !== null).map((entry) => ({
		severity: [
			"high",
			"medium",
			"low"
		].includes(entry.severity) ? entry.severity : "medium",
		item: typeof entry.item === "string" ? entry.item : "",
		suggestion: typeof entry.suggestion === "string" ? entry.suggestion : ""
	})).filter((issue) => issue.item !== "") : [];
	const score = typeof raw.score === "number" ? Math.max(0, Math.min(100, Math.round(raw.score))) : 60;
	const report = {
		score,
		passed: score >= config.reviewPassScore || issues.every((i) => i.severity !== "high") && score >= 60,
		verdict: typeof raw.verdict === "string" ? raw.verdict.slice(0, 200) : "",
		issues,
		reviewedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	chapter.review = report;
	chapter.status = report.passed ? "approved" : "rejected";
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	return report;
}
/**
* 审查「任意正文文本」（作者手动编辑后的草稿，不落盘）。
* 复用审稿提示词与红线/道藏/反AI规则；仅返回报告，不改文件不改状态。
*/
async function reviewChapterText(ctx, config, project, text, previousReport) {
	const user = [
		`书名：《${project.bookName}》`,
		previousReport !== void 0 ? "==================== 上一轮审稿意见（逐条核对是否已解决） ====================\n" + previousReport.issues.map((it, i) => `${i + 1}. [${it.severity}] ${it.item}${it.suggestion !== "" ? ` → ${it.suggestion}` : ""}`).join("\n") : "",
		previousReport !== void 0 ? "==================== 修订稿（上一轮审稿后按意见修订的正文） ====================" : "==================== 待审查正文 ====================",
		text.slice(0, 2e4)
	].join("\n");
	const raw = parseJsonObject(await complete(ctx, config, {
		system: previousReport !== void 0 ? verifySystemPrompt(project) : reviewSystemPrompt(project),
		user,
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 16e3)
	}));
	const issues = Array.isArray(raw.issues) ? raw.issues.filter((v) => typeof v === "object" && v !== null).map((entry) => ({
		severity: [
			"high",
			"medium",
			"low"
		].includes(entry.severity) ? entry.severity : "medium",
		item: typeof entry.item === "string" ? entry.item : "",
		suggestion: typeof entry.suggestion === "string" ? entry.suggestion : ""
	})).filter((issue) => issue.item !== "") : [];
	const score = typeof raw.score === "number" ? Math.max(0, Math.min(100, Math.round(raw.score))) : 60;
	let passed = score >= config.reviewPassScore || issues.every((i) => i.severity !== "high") && score >= 60;
	if (previousReport !== void 0) {
		const hasHigh = issues.some((i) => i.severity === "high");
		const prevHighResolved = previousReport.issues.filter((i) => i.severity === "high").every((p) => !issues.some((i) => i.item.includes(p.item.slice(0, 12))));
		passed = !hasHigh && prevHighResolved;
	}
	return {
		score,
		passed,
		verdict: typeof raw.verdict === "string" ? raw.verdict.slice(0, 200) : "",
		issues,
		reviewedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
/** 验证模式系统提示：修订后逐条核对原意见是否解决，只挑新增 high，不重复挑剔主观项。 */
function verifySystemPrompt(project) {
	return [
		"你是一位网文审稿验证员。作者已按上一轮审稿意见修订了本章，你需要验证修订效果。",
		"你的任务（严格按此执行）：",
		"1. 逐条核对「上一轮意见」中的每一条是否已在修订稿中解决——已解决的不再列出；未解决或部分解决的，按原严重度列出（item 需注明\"未解决：原意见 xxx\"）。",
		"2. 只挑修订【新引入】的 high 级问题（设定矛盾/逻辑硬伤/事实错误）——新引入的 medium/low 主观项（文笔/套话/节奏）不要列。",
		"3. 禁止重复挑剔上一轮已指出且本次已解决的主观项（如\"缓缓/微微\"等套话、错别字）——即使换个说法再提也不行。",
		"4. 严禁为了显得专业而新增\"换一批毛病\"式的意见；如果修订稿已解决全部 high 且无新增 high，输出 issues 为空数组。",
		"score 评分：按修订稿整体质量给 50-90 分（解决全部 high 且无新增 high 时给 70 以上）。",
		"verdict：一句话结论（如\"原 high 已解决，无新增高风险问题\"或\"仍有未解决的 high\"）。",
		"输出必须是合法 JSON 对象：{\"score\": 数字, \"verdict\": \"一句话\", \"issues\": [{\"severity\": \"high|medium|low\", \"item\": \"问题\", \"suggestion\": \"建议\"}]}",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。",
		`本书设定圣经（核对设定冲突用）：\n${project.bible !== void 0 ? JSON.stringify(project.bible).slice(0, 3e3) : "（无）"}`
	].join("\n");
}
/** Build the author-review system prompt (narrative structure, not prose). */
function authorReviewSystemPrompt() {
	return [
		"你是一位网文作者复盘助手。你会收到：本章正文、上一章结尾（钩子）、上一章作者复盘（如有）、活跃剧情线与编年录近期事实。",
		"请从叙事结构层面复盘本章（不评文笔，那是审稿的事）：",
		"1. hookHonored：上一章结尾的钩子/悬念是否在本章兑现或推进（true/false）。",
		"2. hookNote：钩子兑现情况一句话；未兑现时说明并给出\"建议在第几章补\"的建议。",
		"3. endingHook：本章结尾钩子强度，0-10 的整数（低于 6 说明结尾平淡，读者可能不想看下一章）。",
		"4. plotlineProgress：本章推进了哪条剧情线（主线/支线名），或\"无实质推进\"（连续无推进要提醒）。",
		"5. advancedLines：本章实际推进的剧情线名称数组——从「活跃剧情线」清单中选出推进了的线（名称必须与清单中的线名一字不差；没推进任何线则输出空数组）。",
		"6. continuity：与上一章结尾的衔接检查（人物位置/时间/伤势/资源/对话状态），发现问题要指出。",
		"7. trend：结合上一章复盘看近期节奏趋势（是否连续拖沓、爽点密度是否下降、是否需要调整）。",
		"输出必须是合法 JSON 对象，不要输出任何其他文字：",
		"{\"hookHonored\": true或false, \"hookNote\": \"一句话\", \"endingHook\": 0-10整数, \"plotlineProgress\": \"一句话\", \"advancedLines\": [\"线名\"], \"continuity\": \"一句话\", \"trend\": \"一句话\"}",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	].join("\n");
}
/** 作者复盘：对一章做叙事结构复盘（钩子兑现/结尾钩子/推进/连续性/趋势）。 */
async function authorReviewChapter(ctx, config, project, chapterNo, body, prevTail) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	const prevChapter = chapterNo > 1 ? project.chapters.find((c) => c.no === chapterNo - 1) : void 0;
	const lines = (project.plotlines ?? []).filter((l) => l.status === "active" || l.status === "paused");
	const facts = (project.facts ?? []).slice(-10);
	const user = [
		`书名：《${project.bookName}》`,
		chapter !== void 0 ? `本章：第 ${chapter.no} 章《${chapter.title}》` : `本章：第 ${chapterNo} 章`,
		prevTail !== "" ? `==================== 上一章（第 ${chapterNo - 1} 章）结尾（钩子） ====================\n${prevTail}` : "（本书第一章，无上一章钩子；hookHonored 视为 true，hookNote 写\"开篇无前置钩子\"）",
		prevChapter?.authorReview !== void 0 ? `==================== 上一章作者复盘 ====================\n${JSON.stringify(prevChapter.authorReview)}` : "",
		lines.length > 0 ? `==================== 活跃剧情线 ====================\n${lines.map((l) => `- [${l.kind}] ${l.name}：${l.goal}${l.progress !== "" ? `（${l.progress}）` : ""}`).join("\n")}` : "",
		facts.length > 0 ? `==================== 编年录近期事实 ====================\n${facts.map((f) => `[第${f.chapterNo}章] ${f.text}`).join("\n")}` : "",
		"==================== 本章正文 ====================",
		body.slice(0, 16e3),
		"",
		"只输出 JSON 对象。"
	].join("\n");
	const raw = parseJsonObject(await complete(ctx, config, {
		system: authorReviewSystemPrompt(),
		user,
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 4e3)
	}));
	const knownLineNames = new Set((project.plotlines ?? []).map((l) => l.name));
	const advancedLines = Array.isArray(raw.advancedLines) ? raw.advancedLines.filter((n) => typeof n === "string" && n.trim() !== "" && knownLineNames.has(n.trim())).map((n) => n.trim()) : [];
	return {
		hookHonored: raw.hookHonored === true,
		hookNote: typeof raw.hookNote === "string" ? raw.hookNote.slice(0, 200) : "",
		endingHook: typeof raw.endingHook === "number" ? Math.max(0, Math.min(10, Math.round(raw.endingHook))) : 5,
		plotlineProgress: typeof raw.plotlineProgress === "string" ? raw.plotlineProgress.slice(0, 200) : "",
		advancedLines,
		continuity: typeof raw.continuity === "string" ? raw.continuity.slice(0, 200) : "",
		trend: typeof raw.trend === "string" ? raw.trend.slice(0, 200) : "",
		reviewedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
/** 复盘后自动关联：把本章号写入复盘标记推进的剧情线（按名称匹配，去重）。 */
function autoLinkPlotlines(project, chapterNo, advancedLines) {
	if (!Array.isArray(project.plotlines) || advancedLines.length === 0) return;
	for (const line of project.plotlines) if (advancedLines.includes(line.name) && !line.chapters.includes(chapterNo)) line.chapters.push(chapterNo);
}
/** AI 建议剧情线：基于大纲/卷计划/已写章节/编年录，提炼候选线。 */
async function suggestPlotlines(ctx, config, project) {
	const system = [
		"你是一位网文剧情架构师。根据本书的大纲、卷计划、已写章节标题与编年录，为作者提炼建议的剧情线（主线/支线/人物线/悬念线）。",
		"每条线要：名称简洁有力；目标写清楚这条线最终要完成什么；progress 写当前推进到哪（没有就空字符串）。",
		"建议 4-8 条，覆盖：1 条主线、1-2 条人物线、1-2 条悬念线、1-3 条支线。避免与大纲明显重复的废话线。",
		"输出必须是合法 JSON 数组，格式：[{\"name\": \"线名\", \"kind\": \"main|branch|character|mystery\", \"goal\": \"目标\", \"progress\": \"\"}]",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending");
	const raw = parseJsonArray(await complete(ctx, config, {
		system,
		user: [
			`书名：《${project.bookName}》`,
			`大纲（节选前 4000 字）：\n${project.outline.slice(0, 4e3)}`,
			project.volumes !== void 0 && project.volumes.length > 0 ? `卷计划：\n${project.volumes.map((v) => `第${v.no}卷《${v.title}》：${v.summary}`).join("\n")}` : "",
			written.length > 0 ? `已写章节：\n${written.map((c) => `第${c.no}章《${c.title}》${c.summary !== void 0 && c.summary !== "" ? `：${c.summary.slice(0, 80)}` : ""}`).join("\n")}` : "",
			(project.facts ?? []).length > 0 ? `编年录近期事实（最近 15 条）：\n${(project.facts ?? []).slice(-15).map((f) => `[第${f.chapterNo}章] ${f.text.slice(0, 100)}`).join("\n")}` : "",
			"只输出 JSON 数组。"
		].join("\n\n"),
		temperature: .6,
		maxTokens: Math.max(config.maxTokens, 4e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const lines = [];
	const kinds = /* @__PURE__ */ new Set([
		"main",
		"branch",
		"character",
		"mystery"
	]);
	for (const entry of raw) {
		if (typeof entry !== "object" || entry === null) continue;
		const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 40) : "";
		if (name === "") continue;
		lines.push({
			id: "",
			name,
			kind: kinds.has(entry.kind) ? entry.kind : "branch",
			goal: typeof entry.goal === "string" ? entry.goal.trim().slice(0, 300) : "",
			progress: typeof entry.progress === "string" ? entry.progress.trim().slice(0, 300) : "",
			status: "active",
			chapters: [],
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		});
	}
	return lines;
}
/** AI 刷新单条剧情线的进度：结合编年录与各章摘要分析该线推进到哪。 */
async function refreshPlotlineProgress(ctx, config, project, line) {
	const system = [
		"你是一位网文剧情线管理员。请根据「剧情线信息」与「本书已写章节摘要/编年录」，判断这条线目前推进到了哪一步。",
		"输出一句话（30-60 字）：这条线当前的状态、最近一次推进发生在第几章、下一步可能的方向。如果这条线还没开始推进，明确说\"尚未推进\"。",
		"输出必须是合法 JSON 对象：{\"progress\": \"一句话\"}",
		"重要：不要输出任何其他文字。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending" && c.summary !== void 0 && c.summary !== "");
	const raw = parseJsonObject(await complete(ctx, config, {
		system,
		user: [
			`剧情线：${line.name}（${line.kind}）`,
			`目标：${line.goal}`,
			`已知进度：${line.progress !== "" ? line.progress : "（无）"}`,
			`已关联章节：${line.chapters.length > 0 ? line.chapters.map((n) => `第${n}章`).join("、") : "（无）"}`,
			`章节摘要（最近 8 章）：\n${written.slice(-8).map((c) => `第${c.no}章《${c.title}》：${c.summary.slice(0, 120)}`).join("\n")}`,
			(project.facts ?? []).length > 0 ? `编年录近期事实（最近 15 条）：\n${(project.facts ?? []).slice(-15).map((f) => `[第${f.chapterNo}章] ${f.text.slice(0, 100)}`).join("\n")}` : "",
			"只输出 JSON 对象。"
		].join("\n\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 2e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	return typeof raw.progress === "string" ? raw.progress.trim().slice(0, 300) : "";
}
/** ✨ AI 从全书提炼角色库：大纲 + 道藏 + 编年录 + 章节摘要 → 结构化角色清单。 */
async function extractRoles(ctx, config, project) {
	const system = [
		"你是一位网文角色库管理员。请根据本书的大纲、设定、编年录与章节摘要，提炼完整的角色库。",
		"覆盖原则：所有在编年录/章节中实际出场或有名有姓的角色都应收录；无名的功能性人物（如\"矮胖姑娘\"）用其身份简称收录并标注；反复出现且有剧情作用的身份型角色（站长、律师、警察、法官、店主等）必须收录。",
		"数量控制：最多输出 10 个角色；覆盖优先——主角、主要反派、重要配角（女主/关键配角）必须全收，所有有名有姓者必收；只有真正一次性路人（无名字、无剧情作用）才可省略。",
		"重要：正常一部完整故事应提炼 6-10 个角色；若少于 4 个通常说明漏提炼，必须重新核对正文摘录。",
		"重要：正文中若有明确的主角与主要反派，必须分别以 protagonist / antagonist 收录，禁止遗漏；反派确实未出场时才可省略。",
		"输出优先级：主角（protagonist）与主要反派（antagonist）必须优先输出并完整刻画，其次女主/重要配角；判断不出名字时用正文中的身份称呼。",
		"每个角色输出：",
		"1. name：角色名（或身份简称）。主角/有名配角必须用正文中实际出现的人名（如「沈放」），禁止用「主角（38岁超市理货员）」这类把身份塞进名字的占位名；正文确实没点名时才可用身份简称（如「富商」「灰衣老人」）。",
		"2. roleLabel：定位——protagonist=主角；female_lead=女主（唯一知己/感情线核心，无后宫前提下只此一位）；female_support=重要女配；support=普通配角；antagonist=反派；extra=路人/背景。",
		"3. identity：身份一句话（宗门/势力/血脉/职业）。",
		"4. traits：3-6 个性格标签。",
		"5. goals：目标与动机一句话。",
		"6. relations：关系网数组，格式[\"角色名（关系）\", ...]。",
		"7. arc：成长线数组，格式[\"阶段：说明\", ...]（如\"出场：祭品身份\"/\"转折：祭祀被中断脱身\"）。",
		"8. knowledge：该角色已经知道的关键信息（3-8 条），不知道的信息不要写进去。",
		"精简要求：identity 控制在 30 字内；traits 3-6 个短标签；goals 60 字内；relations 2-5 条；arc 2-4 条；knowledge 每条 40 字内。整体输出量要紧凑，避免冗长。",
		"重要：用户消息里列出的「已收录角色」绝不要再次输出——这些角色已经在角色库里，跳过它们，只提炼未收录的。",
		"输出必须是合法 JSON 数组，不要输出其他文字：[{\"name\":\"...\", \"roleLabel\":\"...\", \"identity\":\"...\", \"traits\":[...], \"goals\":\"...\", \"relations\":[...], \"arc\":[...], \"knowledge\":[...]}]",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating");
	const existingRoles = project.roles ?? [];
	const sampleChapters = written.length <= 6 ? written : (() => {
		const picked = /* @__PURE__ */ new Set();
		for (let i = 0; i < 3 && i < written.length; i++) picked.add(i);
		const step = Math.max(1, Math.floor(written.length / 4));
		for (let i = step; i < written.length - 2; i += step) picked.add(i);
		for (let i = Math.max(0, written.length - 2); i < written.length; i++) picked.add(i);
		return [...picked].sort((a, b) => a - b).map((i) => written[i]);
	})();
	const excerptParts = [];
	for (const chapter of sampleChapters) {
		const body = readChapterFile(config.outputDir, chapter);
		if (body === void 0) continue;
		const text = body.replace(/^#.*$/gm, "").trim();
		if (text.length > 0) excerptParts.push(`第${chapter.no}章《${chapter.title}》\n${text.slice(0, 1500)}`);
	}
	const user = [
		`书名：《${project.bookName}》`,
		existingRoles.length > 0 ? `已收录角色（跳过，不要输出）：${existingRoles.map((r) => r.name).join("、")}` : "",
		`大纲（节选前 3000 字）：\n${project.outline.slice(0, 3e3)}`,
		excerptParts.length > 0 ? `已写正文摘录（角色姓名/身份/关系以正文为准）：\n${excerptParts.join("\n\n")}` : "",
		project.bible !== void 0 && project.bible.characters.length > 0 ? `已有角色卡（补充信息）：\n${project.bible.characters.map((c) => `- ${c.name}（${c.role}）：${c.traits.join("、")}${c.goals !== "" ? `；目标：${c.goals}` : ""}`).join("\n")}` : "",
		(project.facts ?? []).length > 0 ? `编年录（最近 30 条）：\n${(project.facts ?? []).slice(-30).map((f) => `[第${f.chapterNo}章] ${f.text.slice(0, 60)}`).join("\n")}` : "",
		written.length > 0 ? `已写章节标题（${written.length} 章）：\n${written.map((c) => `第${c.no}章《${c.title}》`).join("、")}` : "",
		"只输出 JSON 数组。"
	].join("\n\n");
	let text = await complete(ctx, config, {
		system,
		user,
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 24e3),
		reasoning: config.analysisReasoning ?? "low"
	});
	let raw = parseJsonArray(text);
	const hasProtagonist = raw.some((e) => typeof e === "object" && e !== null && e.roleLabel === "protagonist");
	const tooFew = raw.length > 0 && raw.length < 4;
	if (raw.length === 0 || !hasProtagonist || tooFew) {
		text = await complete(ctx, config, {
			system: system + (raw.length === 0 ? "\n上一次输出为空或格式不正确。请直接输出 JSON 数组（即使只有一个角色也要输出），不要输出其他文字。" : tooFew ? "\n上一次输出角色过少（不足 4 个）。这是一部完整故事，请重新核对正文摘录：主角、主要反派、重要配角与所有有名有姓的角色都要收录（宁多勿漏），输出 6-10 个。" : "\n上一次输出中缺少主角（roleLabel 为 protagonist 的角色）。请重新输出完整 JSON 数组，务必包含正文中的主角。"),
			user,
			temperature: .3,
			maxTokens: Math.max(config.maxTokens, 24e3),
			reasoning: config.analysisReasoning ?? "low"
		});
		raw = parseJsonArray(text);
	}
	const labels = /* @__PURE__ */ new Set([
		"protagonist",
		"female_lead",
		"female_support",
		"support",
		"antagonist",
		"extra"
	]);
	const strArr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim() !== "") : [];
	const toRole = (entry) => {
		if (typeof entry !== "object" || entry === null) return void 0;
		const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 30) : "";
		if (name === "") return void 0;
		return {
			name,
			roleLabel: labels.has(entry.roleLabel) ? entry.roleLabel : "support",
			identity: typeof entry.identity === "string" ? entry.identity.slice(0, 100) : "",
			traits: strArr(entry.traits).map((t) => t.slice(0, 20)).slice(0, 8),
			goals: typeof entry.goals === "string" ? entry.goals.slice(0, 200) : "",
			relations: strArr(entry.relations).map((r) => r.slice(0, 60)).slice(0, 10),
			arc: strArr(entry.arc).map((a) => a.slice(0, 120)).slice(0, 10),
			knowledge: strArr(entry.knowledge).map((k) => k.slice(0, 120)).slice(0, 12)
		};
	};
	const roles = [];
	for (const entry of raw) {
		const role = toRole(entry);
		if (role !== void 0) roles.push(role);
	}
	if (roles.length > 0) {
		const names = roles.map((r) => r.name).join("、");
		const patchSystem = system + "\n上一次已提炼角色：" + names + "。\n现在只输出「遗漏的角色」JSON 数组：检查正文摘录中反复出现、有固定身份称呼（如站长、律师、警察、法官、店主、老师）且对剧情有作用的角色；一次性路人不要输出。没有遗漏就输出 []。字段与上面相同。";
		try {
			const patchRaw = parseJsonArray(await complete(ctx, config, {
				system: patchSystem,
				user,
				temperature: .3,
				maxTokens: Math.max(config.maxTokens, 12e3),
				reasoning: config.analysisReasoning ?? "low"
			}));
			const existing = new Set(roles.map((r) => r.name));
			for (const entry of patchRaw) {
				const role = toRole(entry);
				if (role === void 0 || existing.has(role.name)) continue;
				existing.add(role.name);
				roles.push(role);
				if (roles.length >= 10) break;
			}
		} catch {}
	}
	const ROLE_TITLE_HINTS = [
		"站长",
		"律师",
		"检察官",
		"法官",
		"警察",
		"店主",
		"老板",
		"经理",
		"局长",
		"医生",
		"老师",
		"护士",
		"房东",
		"司机",
		"保安",
		"主管",
		"队长",
		"厂长",
		"董事长",
		"总裁",
		"市长",
		"道长",
		"掌门",
		"师父",
		"师傅",
		"管家"
	];
	const existingNames = new Set(roles.map((r) => r.name));
	const titleCount = /* @__PURE__ */ new Map();
	for (const chapter of written) {
		const body = readChapterFile(config.outputDir, chapter);
		if (body === void 0) continue;
		for (const t of ROLE_TITLE_HINTS) {
			let idx = 0;
			let n = 0;
			while ((idx = body.indexOf(t, idx)) !== -1) {
				n++;
				idx += t.length;
			}
			titleCount.set(t, (titleCount.get(t) ?? 0) + n);
		}
	}
	for (const t of ROLE_TITLE_HINTS) {
		if (roles.length >= 10) break;
		if (!(existingNames.has(t) || [...existingNames].some((n) => n.includes(t))) && (titleCount.get(t) ?? 0) >= 3) {
			existingNames.add(t);
			roles.push({
				name: t,
				roleLabel: "support",
				identity: "身份型角色（正文反复出现）",
				traits: [],
				goals: "",
				relations: [],
				arc: [],
				knowledge: []
			});
		}
	}
	return roles;
}
/** ✨ AI 从全书提炼场景库：正文/编年录 → 高频重要场景的结构化视觉锚点。 */
async function extractScenes(ctx, config, project, styleId, filterId) {
	const styleWords = styleKeywords(styleId, filterId);
	const system = [
		"你是一位网文漫剧场景导演。根据本书的大纲、编年录与已写章节摘录，提炼「镜头场景」——漫剧分镜/生图时每个镜头要知道\"在哪、什么时间光态、拍什么情节、人物什么状态\"。",
		"按五幕结构覆盖全书核心场景（短篇 10 章内可少于五幕，按实际剧情组织）：第一幕后场/核心主场、第二幕对外卖场/营业区、第三幕禁忌区域/地下深仓、第四幕外部人间世界（短暂出逃）、第五幕回归与抉择。",
		"【当前视觉风格】（moment/palette/moods/zh/en 必须按此风格措辞，不能写中性描述）：" + styleWords,
		"重要：每个场景的 zh 提示词段首必须原样嵌入【当前视觉风格】词块原文；en 提示词末尾追加风格标签。不得省略或改写。",
		"每个场景必须是「镜头场景」而非仅场地：给出该场景的关键情节镜头（人物动作+情绪+镜头推进）。",
		"数量控制：最多输出 8 个场景；每个场景必须能对应到正文实际出现过的地点与情节，不得凭空虚构。",
		"每个场景输出：",
		"1. name：场景名（地点+光态，如「后场通道·装卸口（雨夜）」）。",
		"2. act：幕归属（第一幕后场/第二幕卖场/第三幕深仓/第四幕外界/第五幕抉择）。",
		"3. moment：时间光态（夜间闭店后/雨夜/凌晨/频闪灯…）。",
		"4. summary：一句话定位（空间类型/功能/氛围）。",
		"5. beats：关键情节镜头 1-3 条（人物动作+情绪+镜头推进，如\"沈放佝偻站在货架过道，镜头推近，情绪从漠然过渡到压抑悲伤\"）。",
		"6. characterState：主角/关键角色在该场景的状态一句话（含标志物细节如标签磨损、手腕红痕）。",
		"7. elements：环境构成数组 3-6 项（空间结构/陈设/标志物）。",
		"8. palette：色调与光影数组 2-4 项（颜色词，可附 HEX）。",
		"9. moods：氛围关键词 2-4 个（压抑/神秘/空旷/悲凉…）。",
		"10. zh：中文生图提示词（连贯一段，写实电影感，含环境/光线/氛围/人物状态）。",
		"11. en：英文生图提示词（booru 风格逗号分隔，含 photorealistic/cinematic）。",
		"12. tags：3-6 个关键标签。",
		"13. source：依据来源说明（哪几章哪些描写）。",
		"若故事存在结局抉择（如双分支），最后 1-2 个场景应为「抉择场景」，zh 里写明分支 A/B 两种画面。",
		"输出必须是合法 JSON 数组，不要输出其他文字：[{\"name\":\"...\", \"act\":\"...\", \"moment\":\"...\", \"summary\":\"...\", \"beats\":[...], \"characterState\":\"...\", \"elements\":[...], \"palette\":[...], \"moods\":[...], \"zh\":\"...\", \"en\":\"...\", \"tags\":[...], \"source\":\"...\"}]",
		"重要：所有字符串值内部不得包含换行符；直接输出 JSON 结果本身。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating");
	const excerptParts = [];
	for (const chapter of written.slice(0, 4)) {
		const body = readChapterFile(config.outputDir, chapter);
		if (body === void 0) continue;
		const text = body.replace(/^#.*$/gm, "").trim();
		if (text.length > 0) excerptParts.push("第" + chapter.no + "章《" + chapter.title + "》\n" + text.slice(0, 1800));
	}
	const raw = parseJsonArray(await complete(ctx, config, {
		system,
		user: [
			"书名：《" + project.bookName + "》",
			(project.facts ?? []).length > 0 ? "编年录（最近 80 条，场景地点以这里为准）：\n" + (project.facts ?? []).slice(-80).map((f) => "[第" + f.chapterNo + "章] " + f.text.slice(0, 80)).join("\n") : "",
			excerptParts.length > 0 ? "已写正文摘录（场景描写以正文为准）：\n" + excerptParts.join("\n") : "",
			"只输出 JSON 数组。"
		].filter((s) => s !== "").join("\n"),
		temperature: .4,
		maxTokens: Math.max(config.maxTokens, 12e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const strArr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim() !== "") : [];
	const str = (v) => typeof v === "string" ? v.trim() : "";
	const scenes = [];
	for (const entry of raw) {
		if (typeof entry !== "object" || entry === null) continue;
		const name = str(entry.name).slice(0, 40);
		if (name === "") continue;
		scenes.push({
			name,
			act: str(entry.act).slice(0, 40),
			moment: str(entry.moment).slice(0, 60),
			summary: str(entry.summary).slice(0, 120),
			beats: strArr(entry.beats).map((t) => t.slice(0, 120)).slice(0, 3),
			characterState: str(entry.characterState).slice(0, 160),
			elements: strArr(entry.elements).map((t) => t.slice(0, 60)).slice(0, 6),
			palette: strArr(entry.palette).map((t) => t.slice(0, 40)).slice(0, 4),
			moods: strArr(entry.moods).map((t) => t.slice(0, 20)).slice(0, 4),
			zh: ensureStyleEmbedded(str(entry.zh).slice(0, 800), styleWords, "zh"),
			en: ensureStyleEmbedded(str(entry.en).slice(0, 600), styleWords, "en"),
			tags: strArr(entry.tags).map((t) => t.slice(0, 24)).slice(0, 6),
			source: str(entry.source).slice(0, 120),
			styleId
		});
	}
	return scenes;
}
/** 从 txt/md 全本文本拆章（纯逻辑，不落盘）：识别章节头、剥离重复标题、去重、排序并统一重新编号。 */
function splitBookText(raw) {
	const lines = raw.split(/\r?\n/);
	const chapterHead = /^\s*(?:#\s*)?第\s*(\d+|[一二三四五六七八九十百千]+)\s*[章回节卷]\s*(.*?)\s*$/;
	const cnOnlyHead = /^\s*(?:#\s*)?([一二三四五六七八九十百千万零〇]{1,6})(?:[、.．:：]\s*(.*?)\s*)?$/;
	const specialHead = /^\s*(?:#\s*)?(序章|序言|楔子|引子|前言|开篇|尾声|终章|大结局|番外(?:篇|章)?|后记|完结感言|上架感言|作者的话)\s*[：:、.\s]*(.*?)\s*$/;
	const enHead = /^\s*(?:#\s*)?chapter\s+(\d+)\s*[.:：、\-\s]*(.*?)\s*$/i;
	const cnNum = {
		一: 1,
		二: 2,
		三: 3,
		四: 4,
		五: 5,
		六: 6,
		七: 7,
		八: 8,
		九: 9,
		十: 10,
		百: 100,
		千: 1e3
	};
	const parseCn = (s) => {
		if (/^\d+$/.test(s)) return Number(s);
		let total = 0;
		let section = 0;
		for (const ch of s) {
			const v = cnNum[ch];
			if (v === void 0) return 0;
			if (v >= 10) {
				total += (section > 0 ? section : 1) * v;
				section = 0;
			} else section = v;
		}
		return total + section;
	};
	const chunks = [];
	let current = null;
	let specialSeq = 0;
	for (const line of lines) {
		const m = chapterHead.exec(line);
		if (m !== null) {
			const no = parseCn(m[1]);
			if (current !== null) chunks.push(current);
			current = {
				sortKey: no > 0 ? no : chunks.length + 1,
				title: (m[2] ?? "").trim(),
				body: []
			};
			continue;
		}
		const mc = cnOnlyHead.exec(line);
		if (mc !== null) {
			const no = parseCn(mc[1]);
			if (current !== null) chunks.push(current);
			const t = (mc[2] ?? "").trim();
			current = {
				sortKey: no > 0 ? no : chunks.length + 1,
				title: t !== "" ? t : "第" + mc[1] + "章",
				body: []
			};
			continue;
		}
		const ms = specialHead.exec(line);
		if (ms !== null) {
			specialSeq++;
			const name = ms[1];
			const front = /序章|序言|楔子|引子|前言|开篇/.test(name);
			const title = (ms[2] ?? "").trim();
			if (current !== null) chunks.push(current);
			current = {
				sortKey: front ? specialSeq * .001 : 999999 + specialSeq * .001,
				title: title !== "" ? title : name,
				body: []
			};
			continue;
		}
		const me = enHead.exec(line);
		if (me !== null) {
			if (current !== null) chunks.push(current);
			current = {
				sortKey: Number(me[1]),
				title: (me[2] ?? "").trim(),
				body: []
			};
			continue;
		}
		if (current !== null) current.body.push(line);
	}
	if (current !== null) chunks.push(current);
	if (chunks.length === 0) throw new Error("未识别到章节（需要\"第X章\"格式、中文数字章节（一、二、三…）、序章/楔子/尾声等章节标题、英文 Chapter N，或带 # 的章节标题）");
	const stripHead = (b) => {
		let i = 0;
		while (i < b.length) {
			const t = b[i].trim();
			if (t === "" || chapterHead.test(t) || cnOnlyHead.test(t) || specialHead.test(t) || enHead.test(t)) i++;
			else break;
		}
		return b.slice(i).join("\n").trim();
	};
	const byKey = /* @__PURE__ */ new Map();
	for (const c of chunks) {
		const len = stripHead(c.body).length;
		const ex = byKey.get(c.sortKey);
		if (ex === void 0 || len > stripHead(ex.body).length) byKey.set(c.sortKey, c);
	}
	return [...byKey.values()].sort((a, b) => a.sortKey - b.sortKey).map((c, i) => ({
		no: i + 1,
		title: c.title,
		body: stripHead(c.body)
	}));
}
/** 拆章预览（不落盘）：章节编号/标题/字数 + 跳过清单。 */
function previewBookText(raw) {
	const chapters = [];
	const skipped = [];
	for (const c of splitBookText(raw)) {
		if (c.body.length < 50) {
			skipped.push("第" + c.no + "章" + (c.title !== "" ? "「" + c.title + "」" : "") + "（内容过短，已跳过）");
			continue;
		}
		chapters.push({
			no: c.no,
			title: c.title !== "" ? c.title : "第" + c.no + "章",
			chars: c.body.length
		});
	}
	return {
		chapters,
		skipped
	};
}
/** 从全本文本导入（浏览器上传 / 服务器文件共用）：建项目、写章节文件、保存。 */
function importBookTextFromText(raw, outputDir, bookName) {
	const project = createProject(bookName);
	mkdirSync(outputDir, { recursive: true });
	const skipped = [];
	for (const c of splitBookText(raw)) {
		const body = c.body;
		if (body.length < 50) {
			skipped.push("第" + c.no + "章" + (c.title !== "" ? "「" + c.title + "」" : "") + "（内容过短，已跳过）");
			continue;
		}
		const chapter = {
			no: c.no,
			volume: 0,
			title: c.title !== "" ? c.title : "第" + c.no + "章",
			beats: "",
			targetChars: 0,
			status: "written",
			file: "",
			chars: 0
		};
		chapter.file = chapterFileName(chapter);
		writeFileSync(join(outputDir, chapter.file), "# 第" + c.no + "章 " + chapter.title + "\n\n" + body + "\n", "utf8");
		chapter.chars = body.length;
		project.chapters.push(chapter);
	}
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	return {
		bookName,
		chapters: project.chapters.length,
		skipped
	};
}
/** 从 txt/md 全本文件导入：编码自适应读取后拆章建项目，status=written（待审稿）。 */
function importBookText(filePath, outputDir) {
	return importBookTextFromText(decodeTextSmart(readFileSync(filePath)), outputDir, basename(filePath, extname(filePath)).slice(0, 40) || "导入小说");
}
/** 常见职业/身份尾缀：角色名如「周野律师」正文可能只写「周野」或「周野的律师」。 */
const ROLE_NAME_SUFFIXES = [
	"律师",
	"辩护律师",
	"医生",
	"老师",
	"教授",
	"先生",
	"女士",
	"小姐",
	"警官",
	"警察",
	"局长",
	"总经理",
	"经理",
	"老板",
	"师父",
	"师傅",
	"道长",
	"老祖",
	"长老",
	"掌门",
	"少主",
	"公主",
	"王子",
	"王妃",
	"皇后",
	"皇帝",
	"王爷",
	"公子",
	"姑娘",
	"夫人",
	"太太",
	"大人",
	"将军",
	"丞相",
	"尚书",
	"员外"
];
/**
* 从角色名/身份拆出正文可能使用的检索词：
* - specific：具体称谓（含职业尾缀或 3 字以上身份片段），如「周野的律师」「辩护律师」「律师」——优先用，避免误抓到同名主干（周野）的段落；
* - stems：名字主干（如「周野」），最后兜底。
*/
function roleFallbackTokens(name, identity) {
	const specific = /* @__PURE__ */ new Set();
	const stems = /* @__PURE__ */ new Set();
	const addName = (s) => {
		const t = s.trim();
		if (t.length < 2) return;
		specific.add(t);
		for (const q of [
			"辩护",
			"助理",
			"高级",
			"首席",
			"御用",
			"御前",
			"专职"
		]) if (t.includes(q)) specific.add(t.replace(q, ""));
		for (const suf of ROLE_NAME_SUFFIXES) if (t.endsWith(suf) && t.length > suf.length + 1) {
			const stem = t.slice(0, -suf.length);
			specific.add(stem + "的" + suf);
			specific.add(suf);
			if (stem.length >= 2) stems.add(stem);
		}
	};
	addName(name);
	for (const part of (identity ?? "").split(/[的，,。\s]+/)) {
		const p = part.trim();
		if (p.length < 2) continue;
		if (p.length >= 3 || ROLE_NAME_SUFFIXES.some((s) => p.endsWith(s))) {
			specific.add(p);
			for (const suf of ROLE_NAME_SUFFIXES) if (p.endsWith(suf) && p.length > suf.length + 1) {
				specific.add(suf);
				stems.add(p.slice(0, -suf.length));
			}
		} else stems.add(p);
	}
	return {
		specific: [...specific].filter((t) => t.length >= 2),
		stems: [...stems].filter((t) => t.length >= 2)
	};
}
/** 保证风格词块已内嵌（LLM 偶发漏嵌时兜底）：zh 段首前缀，en 末尾追加。 */
function ensureStyleEmbedded(text, styleWords, lang) {
	const t = text.trim();
	if (styleWords === "" || t === "") return t;
	if (t.includes(styleWords)) return t;
	return lang === "zh" ? styleWords + "，" + t : t + "，" + styleWords;
}
/** 对 zh/en 一对提示词统一补风格词块。 */
function withStyle(pair, styleWords) {
	return {
		zh: ensureStyleEmbedded(pair.zh, styleWords, "zh"),
		en: ensureStyleEmbedded(pair.en, styleWords, "en")
	};
}
/**
* 底层实现：为任意角色源提炼「动漫形象描述词」（不写库，写库由上层调用方负责）。
* 扫描该角色出场的已写章节正文，截取含外貌描写的段落，交给 LLM 提炼中文描述 + 英文绘图标签。
*/
async function extractRoleVisualFrom(ctx, config, project, outputDir, role, styleId, filterId, shortDrama = false) {
	const roleName = role.name;
	const appearanceHints = /(发|眉|眼|眸|脸|肤|唇|身材|身高|衣|袍|裙|衫|靴|腰带|气质|模样|长相|容貌|披|束|扎|戴|佩|挂|绣|青|白|黑|红|蓝|紫|灰|银|金|少年|青年|少女|汉子|老者|中年|纤细|挺拔|瘦削|壮实|清秀|俊朗|英气|阴鸷|慈眉)/;
	const roleText = `${role.name} ${role.identity ?? ""}`;
	const colorWords = [
		"深灰",
		"灰蓝",
		"灰",
		"蓝",
		"白",
		"黑",
		"红",
		"青",
		"紫",
		"银",
		"金",
		"黄",
		"绿",
		"粉",
		"棕"
	];
	const garmentWords = [
		"工装",
		"西装",
		"定制西装",
		"袍",
		"裙",
		"衫",
		"衣",
		"裤",
		"靴",
		"鞋",
		"帽",
		"腰带",
		"制服",
		"外套",
		"马甲",
		"夹克"
	];
	const roleWords = [
		"女人",
		"男人",
		"老者",
		"老人",
		"中年",
		"青年",
		"少女",
		"姑娘",
		"男子",
		"女子",
		"工人",
		"路人",
		"购买者"
	];
	const locationWords = [
		"别墅",
		"小区",
		"街区"
	];
	const identityTokens = (role.identity ?? "").split(/[，,。\s]+/).filter((t) => t.length >= 2);
	const searchTokens = Array.from(/* @__PURE__ */ new Set([
		roleName,
		...identityTokens,
		...colorWords.filter((w) => roleText.includes(w)),
		...garmentWords.filter((w) => roleText.includes(w)),
		...roleWords.filter((w) => roleText.includes(w)),
		...locationWords.filter((w) => roleText.includes(w))
	])).filter((t) => t.length >= 2);
	const matchesRole = (para, tokens) => para.includes(roleName) || tokens.some((tok) => para.includes(tok));
	const excerpts = [];
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating" && c.file !== void 0);
	/** 扫描一批章节，收集该角色出场且可能含外貌描写的段落（每章最多 2 段，共 12 段）。 */
	const scanChapters = (list, tokens) => {
		for (const chapter of list) {
			if (excerpts.length >= 12) break;
			const body = readChapterFile(outputDir, chapter);
			if (body === void 0) continue;
			const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);
			let perChapter = 0;
			for (const para of paras) {
				if (perChapter >= 2 || excerpts.length >= 12) break;
				if (!matchesRole(para, tokens)) continue;
				if (appearanceHints.test(para) || excerpts.length < 4) {
					excerpts.push({
						no: chapter.no,
						text: para.slice(0, 220)
					});
					perChapter++;
				}
			}
		}
	};
	scanChapters(written.slice(-60), searchTokens);
	if (excerpts.length === 0) scanChapters(written, searchTokens);
	if (excerpts.length === 0) {
		const fb = roleFallbackTokens(role.name, role.identity);
		if (fb.specific.length > 0) scanChapters(written, fb.specific);
	}
	if (excerpts.length === 0) {
		const fb = roleFallbackTokens(role.name, role.identity);
		if (fb.stems.length > 0) scanChapters(written, fb.stems);
	}
	if (excerpts.length === 0) throw new Error(`正文中未找到「${roleName}」的出场描写（已扫描全书及角色名拆分词），请确认角色名与正文一致，或该角色尚未在正文出场`);
	const rules = project.visualRules ?? [];
	const styleWords = styleKeywords(styleId, filterId);
	const raw = parseJsonObject(await complete(ctx, config, {
		system: [
			"你是一位动漫角色设定师与 AI 绘图提示词工程师。根据网文正文中该角色的实际外貌描写，输出「形象锚点」与「四类生图提示词」——一次完成，用于 AI 绘图（NovelAI / Stable Diffusion / Midjourney / 豆包等）生成一致的角色立绘。",
			"【当前视觉风格】（portrait 立绘的「风格」字段必须原样使用，sheet/expressions/details 同样内嵌）：" + styleWords,
			"重要：每段 zh 提示词的段首必须原样嵌入【当前视觉风格】词块原文；en 提示词末尾追加风格标签。不得省略或改写。",
			"硬性要求（依据优先）：",
			"1. 发色/发型/瞳色/服装/气质/标志物必须来自提供的正文段落，不得凭空发明。",
			"2. 正文未明确写到的项目（如瞳色没写、身高没写），用「未定」标注或直接不写，不要编造数值。",
			"3. 服装优先取正文明确出现的（颜色+款式），多次出现取最常穿的组合；服装按分件组织（上身/下身/鞋/配饰）。",
			"4. 标志物（标签/印记/饰品）必须出现在每段提示词中——它们是一致性的命根子。",
			"5. 立绘/四视图/细节是「角色设定稿」：禁止写瞬间动作与道具使用状态（握手机、看屏幕、未接来电、走路、回头等），禁止写剧情状态与场景背景；只保留可长期存在的外貌、服装与常驻标志物（工牌、饰品等）。",
			...shortDrama ? ["6. 短剧精简模式·人设极致化：性格标签必须极致化（如「极端偏执」「绝对冷血」，单一维度拉到最满）；外貌只保留 1-2 个最强辨识度点，弱化平凡细节；服装/标志物更夸张醒目。"] : [],
			"【本书视觉规则】（必须内嵌进每段提示词，保证设定不跑偏）：",
			...rules.map((r) => "- " + r),
			"输出六部分：",
			"- zh：中文形象锚点，一段连贯文字（60-150 字）：发色发型、瞳色、脸型气质、服装（颜色款式）、身材、标志性物件。",
			"- en：英文形象锚点，booru 风格、逗号分隔、小写，30-50 个标签：含性别（1boy/1girl）、发色、发型、瞳色、服装、气质、标志物。不要输出负面提示词。",
			"- tags：中文关键标签数组，5-10 个（如 [\"黑发\",\"束发\",\"青色道袍\",\"清秀\",\"腰悬古玉\"]）。",
			"- source：说明依据（如\"第1章/第8章外貌描写；瞳色未明确\"）。",
			"- expressions：该角色在本书剧情中需要的情绪表情清单数组，6-12 个（如 [\"疲惫\",\"麻木\",\"压抑悲伤\",\"皱眉\",\"紧绷\",\"放空\"]），依据正文情绪描写与角色处境推断。",
			"- promptKit：四类精修提示词（字段化+出图约束，参考示例结构）：",
			"  · portrait 立绘：严格按字段顺序写（参考示例结构）：开头构图定位（正面站立全身人像）→ 风格（3D动漫，超精细建模）→ 背景（纯白纯色背景）→ 身份（男子，{角色名}，外表{年龄}，男性）→ 发型发色 → 胡茬 → 眼眸 → 面部 → 气质 → 上身服装分件（颜色款式+磨损细节）→ 下身 → 鞋 → 标志物（标签/印记，含细节如洇暗翘边）→ 收尾（角色设计稿，细节完整展示，无多余杂物，全身完整无裁切）。",
			"  · sheet 四视图：同一角色的 正面/左侧面/右侧面/背面 四视图设定表（character sheet），纯白背景，全身完整，四个视角分别描述，服装与标志物细节完整展示。",
			"  · expressions 表情：每个表情一段，脸部特写（头部到锁骨），纯白背景，五官与角色定稿完全一致，只换情绪表达（眼神/嘴角/眉），皮肤纹理细节完整，无多余杂物。",
			"  · details 细节：多组局部细节集合参考图（一张图多个局部框），纯白背景；把该角色全部标志物逐项列出（如标签/印记/工牌/袖口磨损/鞋），每项一句特写描述；细节清晰锐利，角色细节参考稿，无多余杂物。",
			"promptKit 每段 zh：连贯中文 60-150 字；en：booru 标签 30-50 个。",
			"输出必须是合法 JSON 对象：{\"zh\": \"...\", \"en\": \"...\", \"tags\": [...], \"source\": \"...\", \"expressions\": [...], \"promptKit\": {\"portrait\": {\"zh\":\"...\", \"en\":\"...\"}, \"sheet\": {\"zh\":\"...\", \"en\":\"...\"}, \"expressions\": [{\"name\":\"疲惫\",\"zh\":\"...\",\"en\":\"...\"}], \"details\": {\"zh\":\"...\", \"en\":\"...\"}}}",
			"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
			"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
		].join("\n"),
		user: [
			`书名：《${project.bookName}》`,
			`目标角色：${role.name}（${role.identity}）`,
			(role.traits ?? []).length > 0 ? `性格标签：${role.traits.join("、")}` : "",
			`正文出场描写（含外貌线索的段落）：`,
			...excerpts.map((e) => `[第${e.no}章] ${e.text}`),
			"只输出 JSON 对象。"
		].join("\n\n"),
		temperature: .4,
		maxTokens: Math.max(config.maxTokens, 12e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	let zh = typeof raw.zh === "string" ? raw.zh.trim().slice(0, 500) : "";
	let en = typeof raw.en === "string" ? raw.en.trim().slice(0, 1500) : "";
	const tags = Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === "string" && t.trim() !== "").map((t) => t.trim().slice(0, 20)).slice(0, 12) : [];
	const source = typeof raw.source === "string" ? raw.source.trim().slice(0, 300) : "";
	const expressions = Array.isArray(raw.expressions) ? raw.expressions.filter((e) => typeof e === "string" && e.trim() !== "").map((e) => e.trim().slice(0, 12)).slice(0, 12) : [];
	const str = (v) => typeof v === "string" ? v.trim() : "";
	const pair = (v) => {
		const o = typeof v === "object" && v !== null ? v : {};
		return {
			zh: str(o.zh).slice(0, 800),
			en: str(o.en).slice(0, 1200)
		};
	};
	const kitRaw = typeof raw.promptKit === "object" && raw.promptKit !== null ? raw.promptKit : {};
	const kitExpr = Array.isArray(kitRaw.expressions) ? kitRaw.expressions.filter((e) => typeof e === "object" && e !== null) : [];
	let promptKit;
	try {
		promptKit = {
			portrait: pair(kitRaw.portrait),
			sheet: pair(kitRaw.sheet),
			expressions: kitExpr.map((e) => ({
				name: str(e.name).slice(0, 12) || "表情",
				zh: str(e.zh).slice(0, 800),
				en: str(e.en).slice(0, 1200)
			})).slice(0, 12),
			details: pair(kitRaw.details)
		};
	} catch {
		promptKit = void 0;
	}
	if (zh === "" || en === "") throw new Error("形象描述提炼失败：LLM 未返回有效 JSON");
	zh = ensureStyleEmbedded(zh, styleWords, "zh");
	en = ensureStyleEmbedded(en, styleWords, "en");
	if (promptKit !== void 0) promptKit = {
		portrait: withStyle(promptKit.portrait, styleWords),
		sheet: withStyle(promptKit.sheet, styleWords),
		expressions: promptKit.expressions.map((e) => ({
			...e,
			...withStyle(e, styleWords)
		})),
		details: withStyle(promptKit.details, styleWords)
	};
	return {
		zh,
		en,
		tags,
		source,
		expressions,
		promptKit
	};
}
/** 小说角色库：提炼单个角色的形象锚点并写回角色卡。 */
async function extractRoleVisual(ctx, config, project, outputDir, roleName, styleId, filterId) {
	const role = (project.roles ?? []).find((r) => r.name === roleName);
	if (role === void 0) throw new Error(`角色「${roleName}」不在角色库中`);
	role.promptStyleId = styleId;
	return extractRoleVisualFrom(ctx, config, project, outputDir, role, styleId, filterId);
}
/** 漫剧角色卡：提炼形象锚点并写回漫剧卡（status → anchored）。 */
async function extractMangaRoleVisual(ctx, config, project, outputDir, cardId, styleId, filterId) {
	const card = (project.mangaRoles ?? []).find((c) => c.id === cardId);
	if (card === void 0) throw new Error(`漫剧角色卡 ${cardId} 不存在`);
	const visual = await extractRoleVisualFrom(ctx, config, project, outputDir, {
		name: card.name,
		identity: card.identity,
		traits: card.traits
	}, styleId, filterId, project.shortDramaMode === true);
	card.promptStyleId = styleId;
	card.imagePrompt = visual;
	if ((visual.expressions ?? []).length > 0) card.expressions = visual.expressions;
	if (visual.promptKit !== void 0) card.promptKit = visual.promptKit;
	if (card.status === "imported" || card.status === "pending_confirm") card.status = "anchored";
	card.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	return visual;
}
/**
* 底层实现：基于角色源的形象锚点 + 表情清单 + 视觉规则产出四类生图提示词（不写库）。
*/
async function generateRolePromptKitFrom(ctx, config, project, role, styleId, filterId, shortDrama = false) {
	role.name;
	const rules = project.visualRules ?? [];
	const styleWords = styleKeywords(styleId, filterId);
	const raw = parseJsonObject(await complete(ctx, config, {
		system: [
			"你是一位 AI 绘图提示词工程师。基于给定角色的形象锚点、表情清单与本书视觉规则，输出四类生图提示词（每类 zh+en 各一段）。",
			"【当前视觉风格】（每类提示词必须内嵌）：" + styleWords,
			"重要：每段 zh 提示词的段首必须原样嵌入【当前视觉风格】词块原文；en 提示词末尾追加风格标签。不得省略或改写。",
			"四类：",
			"1. portrait 立绘：正面站立全身人像，3D动漫超精细建模，纯白纯色背景；按字段流组织：身份（男子，角色名，外表年龄）→ 发型发色 → 胡茬 → 眼眸 → 面部 → 气质 → 上身服装分件（含磨损）→ 下身 → 鞋 → 标志物（含细节）→ 收尾（角色设计稿，细节完整展示，无多余杂物，全身完整无裁切）。",
			"2. sheet 四视图：同一角色的 正面/左侧面/右侧面/背面 四视图设定表（character sheet），纯白背景，四个视角分别描述。",
			"3. expressions 表情：每个表情一段，脸部特写（头部到锁骨），纯白背景，五官与角色定稿完全一致，只换情绪表达（眼神/嘴角/眉），皮肤纹理细节完整，无多余杂物。",
			"4. details 细节：多组局部细节集合参考图（一张图多个局部框），纯白背景；把该角色全部标志物逐项列出，每项一句特写描述；细节清晰锐利，角色细节参考稿，无多余杂物。",
			"5. 立绘/四视图/细节为「角色设定稿」：禁止瞬间动作、道具使用状态与剧情状态（握手机、看屏幕、未接来电等），只保留可长期存在的外貌、服装与常驻标志物（工牌、饰品等）。",
			...shortDrama ? ["6. 短剧精简模式·人设极致化：性格标签必须极致化（单一维度拉到最满）；外貌只保留 1-2 个最强辨识度点；服装/标志物更夸张醒目，一眼可认。"] : [],
			"【本书视觉规则】（必须内嵌进每段提示词，保证设定不跑偏）：",
			...rules.map((r) => "- " + r),
			"zh 要求：连贯中文，写实电影感，60-150 字/段；en 要求：booru 风格逗号分隔标签，30-50 个/段。",
			"输出必须是合法 JSON 对象：{\"portrait\": {\"zh\": \"...\", \"en\": \"...\"}, \"sheet\": {\"zh\": \"...\", \"en\": \"...\"}, \"expressions\": [{\"name\": \"疲惫\", \"zh\": \"...\", \"en\": \"...\"}], \"details\": {\"zh\": \"...\", \"en\": \"...\"}}",
			"重要：所有字符串值内部不得包含换行符；直接输出 JSON 结果本身。"
		].join("\n"),
		user: [
			`角色：${role.name}（${role.identity ?? ""}）`,
			`中文锚点：${role.imagePrompt.zh}`,
			`英文锚点：${role.imagePrompt.en}`,
			`关键标签：${role.imagePrompt.tags.join("、")}`,
			`表情清单：${(role.expressions ?? []).join("、") || "（未提供，按角色气质推断 6 个）"}`,
			"只输出 JSON 对象。"
		].join("\n\n"),
		temperature: .4,
		maxTokens: Math.max(config.maxTokens, 12e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const str = (v) => typeof v === "string" ? v.trim() : "";
	const pair = (v) => {
		const o = typeof v === "object" && v !== null ? v : {};
		return {
			zh: str(o.zh).slice(0, 800),
			en: str(o.en).slice(0, 1200)
		};
	};
	const expressionsRaw = Array.isArray(raw.expressions) ? raw.expressions.filter((e) => typeof e === "object" && e !== null) : [];
	const kit = {
		portrait: withStyle(pair(raw.portrait), styleWords),
		sheet: withStyle(pair(raw.sheet), styleWords),
		expressions: expressionsRaw.map((e) => ({
			name: str(e.name).slice(0, 12) || "表情",
			...withStyle({
				zh: str(e.zh).slice(0, 800),
				en: str(e.en).slice(0, 1200)
			}, styleWords)
		})).slice(0, 12),
		details: withStyle(pair(raw.details), styleWords)
	};
	if (kit.portrait.zh === "" || kit.portrait.en === "") throw new Error("提示词精修失败：LLM 未返回有效 JSON");
	return kit;
}
/** 小说角色库：角色四类生图提示词精修包（写回角色卡）。 */
async function generateRolePromptKit(ctx, config, project, roleName, styleId, filterId) {
	const role = (project.roles ?? []).find((r) => r.name === roleName);
	if (role === void 0) throw new Error(`角色「${roleName}」不在角色库中`);
	if (role.imagePrompt === void 0) throw new Error(`角色「${roleName}」还没有形象锚点，请先生成锚点`);
	role.promptStyleId = styleId;
	return generateRolePromptKitFrom(ctx, config, project, {
		name: role.name,
		identity: role.identity,
		imagePrompt: role.imagePrompt,
		expressions: role.expressions
	}, styleId, filterId);
}
/** 漫剧角色卡：四类生图提示词精修包（写回漫剧卡，status → anchored）。 */
async function generateMangaRolePromptKit(ctx, config, project, cardId, styleId, filterId) {
	const card = (project.mangaRoles ?? []).find((c) => c.id === cardId);
	if (card === void 0) throw new Error(`漫剧角色卡 ${cardId} 不存在`);
	if (card.imagePrompt === void 0) throw new Error(`「${card.name}」还没有形象锚点，请先生成锚点`);
	const kit = await generateRolePromptKitFrom(ctx, config, project, {
		name: card.name,
		identity: card.identity,
		imagePrompt: card.imagePrompt,
		expressions: card.expressions
	}, styleId, filterId, project.shortDramaMode === true);
	card.promptStyleId = styleId;
	card.promptKit = kit;
	if (card.status === "imported" || card.status === "pending_confirm") card.status = "anchored";
	card.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	return kit;
}
/**
* 漫剧角色库·提名（两段式）：从某章分镜的 characters 提名候选角色名 →
* 规则过滤（精确名 + 身份/简称匹配，短名单 ≤5）→ LLM 确认（是/否 + 选哪个，不做开放检索）→
* 返回带漫剧卡建议的候选（未匹配时给出「回小说库补提炼 / 漫剧直接创建」判定）。
*/
async function nominateMangaRoles(ctx, config, project, outputDir, chapterNo) {
	const entry = (project.storyboards ?? []).find((e) => e.chapterNo === chapterNo);
	if (entry === void 0) throw new Error(`第 ${chapterNo} 章还没有分镜产出，请先在「分镜」页生成剧情骨架/分镜表`);
	const names = [];
	const pushNames = (list) => {
		for (const n of list ?? []) {
			const t = n.trim().slice(0, 20);
			if (t !== "" && !names.includes(t)) names.push(t);
		}
	};
	pushNames(entry.skeleton?.characters);
	pushNames(entry.table?.characters);
	for (const s of entry.table?.shots ?? []) pushNames(s.characters);
	if (names.length === 0) throw new Error(`第 ${chapterNo} 章的分镜还没有结构化角色（characters 为空），请重新生成剧情骨架/分镜表`);
	const imported = /* @__PURE__ */ new Set();
	for (const c of project.mangaRoles ?? []) {
		imported.add(c.name);
		if (c.sourceRoleName !== void 0 && c.sourceRoleName !== "") imported.add(c.sourceRoleName);
	}
	const already = names.filter((n) => imported.has(n)).map((n) => ({
		rawName: n,
		verdict: "already_imported",
		matches: [],
		suggested: emptyCandidateSuggestion(n)
	}));
	const fresh = names.filter((n) => !imported.has(n));
	if (fresh.length === 0) return already;
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	const body = chapter !== void 0 ? readChapterFile(outputDir, chapter) : void 0;
	const roles = project.roles ?? [];
	const shortlists = fresh.map((rawName) => {
		const shortlist = [];
		const push = (n) => {
			if (!shortlist.includes(n)) shortlist.push(n);
		};
		for (const r of roles) {
			if (shortlist.length >= 5) break;
			const n = r.name;
			if (n === rawName) {
				push(n);
				continue;
			}
			if (n.includes(rawName) || rawName.includes(n)) {
				push(n);
				continue;
			}
			const ident = r.identity ?? "";
			if (ident !== "" && (ident === rawName || ident.includes(rawName) || rawName.includes(ident))) push(n);
		}
		return {
			rawName,
			roleNames: shortlist
		};
	});
	const beats = (entry.skeleton?.beats ?? []).map((b) => `[${b.id}] ${b.event}`).join("\n");
	const raw = parseJsonArray(await complete(ctx, config, {
		system: [
			"你是一位漫剧选角导演。下面给出「分镜角色提名」与「小说角色库候选名单」。",
			"任务：为每个提名判定它对应小说角色库中的哪一个候选（或判定小说库没有对应角色），并预填一张「漫剧角色卡」的建议信息。",
			"规则：",
			"1. roleName 只能从该提名的候选名单中选，禁止输出名单之外的名字（不做开放检索）。",
			"2. verdict：matched=候选名单里确实有对应角色（选最像的那个）；ambiguous=名单里有多个候选且无法确定（此时 roleName 可留空或选最可能的一个）；not_in_library=候选名单为空或都不对应。",
			"3. matched/ambiguous 时给出漫剧卡建议：name（漫剧用名，默认与角色名一致）、identity（身份一句话，30 字内）、coreFunction（protagonist=主角/mentor=导师/love_interest=感情线/antagonist=反派/sidekick=搭档/informant=线人/functional=功能性）、protagonistRelation（enemy/friend/mentor/lover/exploit=利用/neutral）、speechStyle（口头禅或说话方式）、traits（不超过 3 个极致性格标签）、appearance（1-2 个辨识度外貌点）、keyScenes（本章该角色 1-2 个关键剧情节点，格式「第N章 xxx」）。",
			"4. 身份型提名（如「持枪者」「围观群众」）：候选名单有则匹配；名单没有且正文确有该称谓 → not_in_library；正文也没有 → not_in_library。",
			...project.shortDramaMode === true ? ["5. 短剧精简模式（本书已开启）：只保留 5-8 个上镜角色——主角/反派/感情线/关键配角；功能性路人不上卡（此类提名直接 not_in_library）。每个角色必须给出明确的 coreFunction 与 protagonistRelation；性格标签极致化；候选超过 8 个时按戏份重要性裁剪到最核心 8 个。"] : [],
			"输出必须是合法 JSON 数组：[{\"rawName\": \"...\", \"verdict\": \"...\", \"roleName\": \"...或省略\", \"suggested\": {...}}]，每个提名都要有，数组长度必须等于提名数。",
			"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
		].join("\n"),
		user: [
			`章节：第 ${chapterNo} 章《${chapter?.title ?? ""}》`,
			"==== 剧情骨架（节拍） ====",
			beats !== "" ? beats : "（无骨架节拍）",
			"==== 角色提名与候选名单 ====",
			shortlists.map((s) => s.roleNames.length > 0 ? `[提名] ${s.rawName} → 候选：${s.roleNames.join("、")}` : `[提名] ${s.rawName} → 候选：（无）`).join("\n"),
			body !== void 0 ? "==== 章节正文（前 2500 字，判断称谓归属用） ====\n" + body.replace(/^#.*$/gm, "").trim().slice(0, 2500) : "",
			"只输出 JSON 数组。"
		].filter((x) => x !== "").join("\n\n"),
		temperature: .2,
		maxTokens: Math.max(config.maxTokens, 8e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const verdicts = /* @__PURE__ */ new Set([
		"matched",
		"ambiguous",
		"not_in_library"
	]);
	const fnMap = {
		protagonist: "protagonist",
		mentor: "mentor",
		love_interest: "love_interest",
		antagonist: "antagonist",
		sidekick: "sidekick",
		informant: "informant",
		functional: "functional"
	};
	const relMap = {
		enemy: "enemy",
		friend: "friend",
		mentor: "mentor",
		lover: "lover",
		exploit: "exploit",
		neutral: "neutral"
	};
	const byName = /* @__PURE__ */ new Map();
	for (const e of raw) if (typeof e === "object" && e !== null && typeof e.rawName === "string") byName.set(e.rawName.trim(), e);
	const str = (v) => typeof v === "string" ? v.trim().slice(0, 100) : "";
	const strArr = (v, n) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, 20)).slice(0, n) : [];
	const out = [];
	for (const item of shortlists) {
		const judge = byName.get(item.rawName);
		const judgeVerdict = judge !== void 0 ? str(judge.verdict) : "";
		const verdict = verdicts.has(judgeVerdict) ? judgeVerdict : item.roleNames.length > 0 ? "ambiguous" : "not_in_library";
		let roleName;
		if (judge !== void 0) {
			const chosen = str(judge.roleName);
			if (chosen !== "" && item.roleNames.includes(chosen)) roleName = chosen;
		}
		if (verdict === "matched" && roleName === void 0 && item.roleNames.length === 1) roleName = item.roleNames[0];
		const sug = typeof judge?.suggested === "object" && judge?.suggested !== null ? judge.suggested : {};
		const novelHint = verdict === "not_in_library" && body !== void 0 ? body.includes(item.rawName) ? "backfill" : "manga_new" : void 0;
		const suggested = {
			name: (str(sug.name) !== "" ? str(sug.name) : roleName ?? item.rawName).slice(0, 30),
			identity: str(sug.identity).slice(0, 60),
			coreFunction: fnMap[str(sug.coreFunction)] ?? "functional",
			protagonistRelation: relMap[str(sug.protagonistRelation)] ?? "neutral",
			speechStyle: str(sug.speechStyle).slice(0, 60),
			traits: strArr(sug.traits, 3),
			appearance: str(sug.appearance).slice(0, 100),
			keyScenes: strArr(sug.keyScenes, 3)
		};
		out.push({
			rawName: item.rawName,
			verdict,
			matches: item.roleNames.map((n) => ({
				roleName: n,
				reason: roleName === n ? "LLM 确认" : "规则候选"
			})),
			matchedRoleName: roleName,
			novelHint,
			suggested
		});
	}
	return [...already, ...out];
}
/** 空建议（already_imported 等无需 LLM 的候选用）。 */
function emptyCandidateSuggestion(name) {
	return {
		name,
		identity: "",
		coreFunction: "functional",
		protagonistRelation: "neutral",
		speechStyle: "",
		traits: [],
		appearance: "",
		keyScenes: []
	};
}
/** ✨ 从道藏/红线提炼「视觉世界观规则」：生图/生视频必须遵守的设定纠偏（如"商品=人，禁止常规超市商品"）。 */
async function extractVisualRules(ctx, config, project) {
	const system = [
		"你是一位 AI 绘图的视觉规则设计师。本书的设定是\"反常识\"的，生图/生视频模型默认会画成现实世界的样子，你需要提炼 3-6 条「视觉规则」钉住本书的视觉世界观。",
		"规则要求：",
		"1. 每条必须可执行：明确\"画面里必须出现什么/禁止出现什么\"（如\"货架上的一切商品都是活人，禁止画成罐头/饮料/日用品\"）。",
		"2. 覆盖本书最容易被模型画错的 2-4 个核心反常识点。",
		"3. 每条 40 字内，禁止泛泛而谈。",
		"输出必须是合法 JSON 数组：[\"规则1\", \"规则2\", ...]，不要输出其他文字。"
	].join("\n");
	const bible = project.bible;
	return parseJsonArray(await complete(ctx, config, {
		system,
		user: [
			`书名：《${project.bookName}》`,
			`题材：${bible?.genre ?? ""}`,
			bible !== void 0 && bible.worldRules.length > 0 ? `世界规则：\n${bible.worldRules.map((r) => "- " + r).join("\n")}` : "",
			bible !== void 0 && bible.redLines.length > 0 ? `红线：\n${bible.redLines.map((r) => "- " + r).join("\n")}` : "",
			"只输出 JSON 数组。"
		].filter((s) => s !== "").join("\n\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 4e3),
		reasoning: config.analysisReasoning ?? "low"
	})).map((r) => typeof r === "string" ? r.trim().slice(0, 80) : "").filter((r) => r !== "").slice(0, 8);
}
/**
* 开书想法 → AI 大纲：输入一句话想法，生成 2-3 个方向不同、可直接开书的完整大纲方案。
* @param count 本次生成几个（默认 3，最多 3）
* @param exclude 已暂留方案的剧情方向/卖点摘要（换批时避开，防止重复）
*/
async function suggestOutlines(ctx, config, idea, count = 3, exclude = []) {
	const n = Math.max(1, Math.min(3, Math.floor(count)));
	const parsed = parseJsonArray(await complete(ctx, config, {
		system: [
			"你是一位资深网文策划。作者只给了一句「想法」，你需要把它扩展成 2-3 个【方向差异明显】的完整小说大纲方案，供作者挑选。",
			"每个方案必须满足：",
			"1. bookName：书名（6 字以内，抓眼球、点题）。",
			"2. genre：题材（如 仙侠修真 / 都市异能 / 玄幻 / 悬疑）。",
			"3. sellingPoint：核心卖点一句话（金手指/爽点/差异化，40 字内）。",
			"4. outline：完整大纲文本（至少 800 字，可直接作为开书大纲），结构包含：书名与题材、金手指/核心设定、主角人设与动机、主线剧情走向（至少 5 个阶段）、关键配角与势力、卖点与爽点设计、预计分卷（3-5 卷）。",
			"方向差异要求：",
			"- 方案之间的金手指/剧情走向必须明显不同（如：苟道发育流 vs 随身老爷爷流 vs 群像争霸流），不能只是换书名。",
			"- 忠实于作者想法的核心要素，但允许在不同方向上进行合理演绎。",
			"- 不输出任何与已列「需避开的方向」雷同的方案。",
			"输出必须是合法 JSON 数组，只输出数组本身：",
			"[{\"id\": \"唯一id\", \"bookName\": \"...\", \"genre\": \"...\", \"sellingPoint\": \"...\", \"outline\": \"...\"}]",
			`本次只输出 ${n} 个方案。`,
			"重要：所有字符串值内部不得包含换行符（大纲内部分段请用「。\n」或「；」自然断句），JSON 必须在一段内完整结束。",
			"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
		].join("\n"),
		user: [
			`作者的想法：${idea}`,
			idea.trim().length < 40 ? "作者的想法非常简短（可能只有一句）。请基于通用网文套路合理扩展补全：为每个方案自洽地设计金手指/核心设定、主角人设与动机、主线走向，使其成为完整可开书的大纲；不同方案的方向仍须明显差异。" : "",
			exclude.length > 0 ? `需避开的已暂留方案方向（新方案不得与之雷同）：\n${exclude.map((e, i) => `${i + 1}. ${e}`).join("\n")}` : "",
			`请生成 ${n} 个大纲方案。`,
			"只输出 JSON 数组。"
		].join("\n\n"),
		temperature: .85,
		maxTokens: Math.max(config.maxTokens, 12e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const candidates = [];
	for (const entry of parsed) {
		if (typeof entry !== "object" || entry === null) continue;
		const bookName = typeof entry.bookName === "string" ? entry.bookName.trim().slice(0, 30) : "";
		const outline = typeof entry.outline === "string" ? entry.outline.trim() : "";
		if (bookName === "" || outline.length < 300) continue;
		candidates.push({
			id: typeof entry.id === "string" && entry.id !== "" ? entry.id : `oc-${Date.now().toString(36)}-${candidates.length}`,
			bookName,
			genre: typeof entry.genre === "string" ? entry.genre.trim().slice(0, 20) : "",
			sellingPoint: typeof entry.sellingPoint === "string" ? entry.sellingPoint.trim().slice(0, 120) : "",
			outline
		});
	}
	if (candidates.length === 0) throw new Error("大纲方案生成失败：LLM 未返回有效 JSON（可重试）");
	return candidates.slice(0, n);
}
/** 拆书分析：对已写章节做结构/人物/文风/卖点四维体检。
*  两阶段管道（借鉴 AI-Novel-Writing-Assistant）：
*  ① 源片段笔记：每章抽取结构化笔记（剧情/人物/设定/写法/卖点/短板信号）
*  ② 分节分析：按维度各跑一次 LLM，输出可读分析稿 + 结构化数据 + 证据链。
*  @param scope 'recent'(默认最近20章) | 'volume:N' | 'all'
*  @param preset 'quick'(总览/剧情/人物/文风) | 'standard'(+卖点)
*  @param budgetTokens token 预算上限（超过即截断章节取样）。
*/
async function breakdownBook(ctx, config, project, outputDir, scope = "recent", preset = "quick", budgetTokens = 5e4) {
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating" && c.summary !== void 0 && c.summary !== "");
	let selected = written;
	if (scope === "recent") selected = written.slice(-20);
	else if (/^volume:\d+$/.test(scope)) {
		const v = Number(scope.slice(7));
		selected = written.filter((c) => c.volume === v);
	}
	if (selected.length === 0) throw new Error("没有可分析的已写章节（需要已生成并带摘要）");
	let budget = budgetTokens;
	const chunks = [];
	for (const c of selected.slice().reverse()) {
		const bodySlice = (readChapterFile(outputDir, c) ?? "").replace(/^#\s+.*$/m, "").trim().slice(0, 4e3);
		const est = Math.ceil((bodySlice.length + (c.summary?.length ?? 0)) / 4) + 400;
		if (est > budget && chunks.length > 0) break;
		chunks.unshift({
			no: c.no,
			title: c.title,
			summary: c.summary ?? "",
			body: bodySlice
		});
		budget -= est;
	}
	const notes = [];
	let usedTokens = 0;
	const noteSystem = [
		"你是中文网文拆书助手。把单章正文整理成结构化笔记，供后续章节级分析复用。",
		"只输出 JSON 对象：",
		"{\"summary\": \"1-2句\", \"plotPoints\": [\"...\"], \"characters\": [\"...\"], \"worldbuilding\": [\"...\"], \"styleTechniques\": [\"...\"], \"marketHighlights\": [\"...\"], \"weaknessSignals\": [\"...\"]}",
		"硬规则：只提取正文明确出现的信息；每数组最多 4 项；不要补写原文外的动机/意图；evidence 不在此阶段输出。",
		"重要：直接输出 JSON，不要输出其他文字；字符串内不含换行。"
	].join("\n");
	for (const ch of chunks) {
		const noteUser = [
			`第${ch.no}章《${ch.title}》`,
			"正文：",
			ch.body.slice(0, 3e3)
		].join("\n");
		try {
			const raw = parseJsonObject(await complete(ctx, config, {
				system: noteSystem,
				user: noteUser,
				temperature: .2,
				maxTokens: Math.max(config.maxTokens, 3e3),
				reasoning: config.analysisReasoning ?? "low"
			}));
			const pick = (k) => Array.isArray(raw[k]) ? raw[k].filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, 120)).slice(0, 4) : [];
			notes.push(`【第${ch.no}章《${ch.title}》】\n摘要：${typeof raw.summary === "string" ? raw.summary.slice(0, 200) : ""}\n剧情：${pick("plotPoints").join("；")}\n人物：${pick("characters").join("；")}\n设定：${pick("worldbuilding").join("；")}\n写法：${pick("styleTechniques").join("；")}\n卖点：${pick("marketHighlights").join("；")}\n短板信号：${pick("weaknessSignals").join("；") || "（无明显短板信号）"}`);
			usedTokens += 800;
		} catch {}
	}
	const sectionsConfig = [
		{
			key: "overview",
			title: "拆书总览",
			focus: "一句话定位、题材标签、整体优势与短板",
			system: [
				"你是资深中文网文拆书分析师，负责《拆书总览》小节。",
				"基于给定章节笔记做低风险综合判断，输出 JSON：{\"markdown\": \"可直接展示的分析稿（简体中文，先给结论再说明体现在哪、为何成立）\", \"structured\": {\"oneLinePositioning\": \"一句话定位\", \"genreTags\": [\"题材标签\"], \"sellingPointTags\": [\"卖点标签\"], \"strengths\": [\"整体优势\"], \"weaknesses\": [\"整体短板\"]}}",
				"硬规则：只基于笔记归纳；推断用「更偏向/可能」等谨慎措辞；证据不足写「材料不足」；不虚构原文细节。",
				"重要：直接输出 JSON，字符串内不含换行。"
			].join("\n")
		},
		{
			key: "plot",
			title: "剧情结构",
			focus: "主线梗概、阶段推进、冲突升级、节奏风险",
			system: [
				"你是资深中文网文拆书分析师，负责《剧情结构》小节。",
				"基于给定章节笔记分析，输出 JSON：{\"markdown\": \"分析稿（简体中文，先结论后依据）\", \"structured\": {\"mainlineSummary\": \"主线梗概\", \"phaseProgressions\": [\"阶段推进\"], \"escalationDesigns\": [\"冲突升级\"], \"paceRisks\": [\"节奏风险\"], \"reusablePatterns\": [\"可复用套路\"]}}",
				"硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。",
				"重要：直接输出 JSON，字符串内不含换行。"
			].join("\n")
		},
		{
			key: "character",
			title: "人物系统",
			focus: "主角定位、配角功能、关系网络、成长弧线、辨识度风险",
			system: [
				"你是资深中文网文拆书分析师，负责《人物系统》小节。",
				"基于给定章节笔记分析，输出 JSON：{\"markdown\": \"分析稿（简体中文，先结论后依据）\", \"structured\": {\"protagonistPositioning\": \"主角定位\", \"supportingFunctions\": [\"配角功能\"], \"relationshipNetwork\": [\"关系网络\"], \"growthArcs\": [\"成长弧线\"], \"clarityRisks\": [\"辨识度风险\"]}}",
				"硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。",
				"重要：直接输出 JSON，字符串内不含换行。"
			].join("\n")
		},
		{
			key: "style",
			title: "文风与技法",
			focus: "叙事视角、语言风格、描写方式、节奏控制、钩子设计、可复用写法",
			system: [
				"你是资深中文网文拆书分析师，负责《文风与技法》小节。",
				"基于给定章节笔记分析，输出 JSON：{\"markdown\": \"分析稿（简体中文，先结论后依据）\", \"structured\": {\"narrativePov\": \"叙事视角\", \"languageStyle\": \"语言风格\", \"dialoguePatterns\": [\"对话特征\"], \"rhythmControl\": [\"节奏控制\"], \"hookDesigns\": [\"钩子设计\"], \"reusableTechniques\": [\"可复用写法\"]}}",
				"硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。",
				"重要：直接输出 JSON，字符串内不含换行。"
			].join("\n")
		}
	];
	if (preset === "standard") sectionsConfig.push({
		key: "market",
		title: "商业化卖点",
		focus: "读者爽点、点击驱动、人物/题材卖点、商业化风险",
		system: [
			"你是资深中文网文拆书分析师，负责《商业化卖点》小节。",
			"基于给定章节笔记分析，输出 JSON：{\"markdown\": \"分析稿（简体中文，先结论后依据）\", \"structured\": {\"hookPoints\": [\"读者爽点\"], \"clickDrivers\": [\"点击驱动\"], \"characterSellingPoints\": [\"人物卖点\"], \"genreSellingPoints\": [\"题材卖点\"], \"commercialRisks\": [\"商业化风险\"]}}",
			"硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。",
			"重要：直接输出 JSON，字符串内不含换行。"
		].join("\n")
	});
	const notesText = notes.join("\n\n");
	const sections = [];
	const evidence = [];
	for (const sec of sectionsConfig) try {
		const raw = parseJsonObject(await complete(ctx, config, {
			system: sec.system,
			user: `分析范围：${selected.length} 章（${scope === "all" ? "全书" : scope === "recent" ? "最近 20 章" : "指定卷"}）。\n\n章节笔记：\n${notesText}`,
			temperature: .3,
			maxTokens: Math.max(config.maxTokens, 6e3),
			reasoning: config.analysisReasoning ?? "low"
		}));
		sections.push({
			key: sec.key,
			title: sec.title,
			markdown: typeof raw.markdown === "string" ? raw.markdown.trim() : "（生成失败）",
			structured: typeof raw.structured === "object" && raw.structured !== null ? raw.structured : {}
		});
		usedTokens += 2e3;
	} catch {
		sections.push({
			key: sec.key,
			title: sec.title,
			markdown: "（本节生成失败，可重试）",
			structured: {}
		});
	}
	return {
		sections,
		evidence,
		chaptersScanned: chunks.length,
		usedTokens
	};
}
/** 生图接口连通性测试（设置页模型条目用）：GET {baseURL}/models，计时返回延迟。 */
async function testImageEndpoint(baseURL, apiKey, model) {
	const trimmed = baseURL.trim();
	if (trimmed === "") return {
		ok: false,
		ms: 0,
		message: "接口地址不能为空"
	};
	const url = trimmed.replace(/\/+$/, "") + "/models";
	const start = Date.now();
	try {
		const res = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: "Bearer " + apiKey,
				"Content-Type": "application/json"
			}
		});
		const ms = Date.now() - start;
		if (!res.ok) {
			const text = (await res.text().catch(() => "")).slice(0, 200);
			return {
				ok: false,
				ms,
				message: "HTTP " + res.status + (text !== "" ? "：" + text : "")
			};
		}
		let modelFound;
		if (model !== void 0 && model !== "") {
			const list = (await res.json().catch(() => null))?.data;
			if (Array.isArray(list)) modelFound = list.some((m) => {
				if (typeof m !== "object" || m === null) return false;
				const o = m;
				return o.id === model || o.model === model;
			});
		}
		return {
			ok: true,
			ms,
			modelFound
		};
	} catch (err) {
		return {
			ok: false,
			ms: Date.now() - start,
			message: err.message
		};
	}
}
/** 底层：按形象锚点调用生图接口生成定妆图（不写库；写库由上层调用方负责）。 */
async function generateReferenceImageFrom(config, anchor, style = "", modelId) {
	if (config.imageApiEnabled !== true) throw new Error("生图未启用，请在设置中启用一个生图模型");
	const activeImage = (modelId !== void 0 && modelId !== "" ? (config.imageModels ?? []).find((m) => m.id === modelId) : void 0) ?? (config.imageModels ?? []).find((m) => m.enabled) ?? (config.imageModels ?? [])[0];
	const apiKey = activeImage?.apiKey ?? config.imageApiKey;
	const model = activeImage?.model ?? config.imageApiModel;
	const baseURL = (activeImage?.baseURL ?? config.imageBaseUrl ?? "").replace(/\/+$/, "");
	if (baseURL === "") throw new Error("请先在设置中填写生图接口地址");
	if (apiKey === void 0 || apiKey === "" || model === void 0 || model === "") throw new Error("请先在设置中配置生图模型的 API Key 和模型 id");
	const stylePrompt = getComicStylePrompt(style);
	const prompt = [
		anchor.zh,
		anchor.en,
		anchor.tags.join(", "),
		stylePrompt,
		"character reference sheet, front view, clean background, consistent design"
	].filter(Boolean).join(", ");
	const res = await fetch(baseURL + "/images/generations", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			prompt,
			response_format: "url",
			size: "2K",
			stream: false,
			watermark: false
		})
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`生图失败（${res.status}）：${text}`);
	}
	const url = (await res.json()).data?.[0]?.url;
	if (url === void 0 || url === "") throw new Error("生图接口未返回图片 URL");
	const imgRes = await fetch(url);
	if (!imgRes.ok) throw new Error("下载生图结果失败");
	const buf = Buffer.from(await imgRes.arrayBuffer());
	return `data:${imgRes.headers.get("content-type") || "image/jpeg"};base64,${buf.toString("base64")}`;
}
/** 小说角色库：生成角色定妆图并写回角色卡（imageUrl）。 */
async function generateRoleReferenceImage(ctx, config, project, outputDir, name, style = "", modelId) {
	const role = project.roles?.find((r) => r.name === name);
	if (role === void 0) throw new Error(`角色 ${name} 不存在`);
	if (role.imagePrompt === void 0) throw new Error(`角色 ${name} 还没有形象锚点，请先生成锚点`);
	const dataUrl = await generateReferenceImageFrom(config, role.imagePrompt, style, modelId);
	role.imageUrl = dataUrl;
	return dataUrl;
}
/** 漫剧角色卡：生成定妆图并写回漫剧卡（imageUrl）。 */
async function generateMangaRoleReferenceImage(ctx, config, project, outputDir, cardId, style = "", modelId) {
	const card = (project.mangaRoles ?? []).find((c) => c.id === cardId);
	if (card === void 0) throw new Error(`漫剧角色卡 ${cardId} 不存在`);
	if (card.imagePrompt === void 0) throw new Error(`「${card.name}」还没有形象锚点，请先生成锚点`);
	const dataUrl = await generateReferenceImageFrom(config, card.imagePrompt, style, modelId);
	card.imageUrl = dataUrl;
	card.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	return dataUrl;
}
/** 🩺 剧情健康检查：基于已写章节数/各线状态/编年录，判断是否需要新线及添加时机。 */
async function analyzePlotlineHealth(ctx, config, project) {
	const system = [
		"你是一位网文剧情架构师。请对本书的「剧情线体系」做健康检查，判断当前是否需要新增剧情线、应在多少章后添加。",
		"评估维度：各线最近推进到第几章（已写章节与关联章节的差值越大越危险）、各线状态、已写章节总数、卷计划当前进度、编年录近期事实。",
		"输出规则：",
		"1. verdict：一句话结论——\"需要新增线\" / \"暂不需要\" / \"再写 N 章后需要\"（N 给出具体章数）。",
		"2. timing：说明建议添加的时机（如：第 25 章前引入新支线，因为主线预计第 22 章告一段落）。",
		"3. reasons：3-5 条依据（引用具体数据：哪条线多少章没推进、已写章节数、卷进度等）。",
		"4. lines：对每条线给健康度——ok（近期推进过）/ warning（超过 5 章未推进）/ stale（超过 10 章未推进或悬置过久）。",
		"输出必须是合法 JSON 对象：{\"verdict\": \"...\", \"timing\": \"...\", \"reasons\": [\"...\"], \"lines\": [{\"name\": \"线名\", \"health\": \"ok|warning|stale\", \"note\": \"一句说明\"}]}",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating");
	const lines = (project.plotlines ?? []).filter((l) => l.status === "active" || l.status === "paused");
	const raw = parseJsonObject(await complete(ctx, config, {
		system,
		user: [
			`书名：《${project.bookName}》`,
			`已写章节数：${written.length}（最新章号 ${written.length > 0 ? written[written.length - 1].no : 0}）`,
			project.volumes !== void 0 && project.volumes.length > 0 ? `卷计划：\n${project.volumes.map((v) => `第${v.no}卷《${v.title}》（${v.chapterStart}-${v.chapterEnd}）：${v.summary.slice(0, 60)}`).join("\n")}` : "",
			`剧情线（${lines.length} 条）：\n${lines.length > 0 ? lines.map((l) => `- [${l.kind}] ${l.name}｜目标：${l.goal}｜进度：${l.progress !== "" ? l.progress : "未推进"}｜最近关联章节：${l.chapters.length > 0 ? "第" + Math.max(...l.chapters) + "章" : "无"}`).join("\n") : "（暂无剧情线）"}`,
			(project.facts ?? []).length > 0 ? `编年录近期事实（最近 10 条）：\n${(project.facts ?? []).slice(-10).map((f) => `[第${f.chapterNo}章] ${f.text.slice(0, 80)}`).join("\n")}` : "",
			"只输出 JSON 对象。"
		].join("\n\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 3e3)
	}));
	const strArr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim() !== "") : [];
	const lineArr = Array.isArray(raw.lines) ? raw.lines.filter((v) => typeof v === "object" && v !== null).map((entry) => ({
		name: typeof entry.name === "string" ? entry.name.slice(0, 40) : "",
		health: [
			"ok",
			"warning",
			"stale"
		].includes(entry.health) ? entry.health : "ok",
		note: typeof entry.note === "string" ? entry.note.slice(0, 150) : ""
	})).filter((x) => x.name !== "") : [];
	return {
		verdict: typeof raw.verdict === "string" ? raw.verdict.slice(0, 100) : "",
		timing: typeof raw.timing === "string" ? raw.timing.slice(0, 200) : "",
		reasons: strArr(raw.reasons).map((r) => r.slice(0, 200)),
		lines: lineArr
	};
}
/** ✨ AI 剧情方案：基于健康检查结果设计下一阶段方向与建议新线。 */
async function designPlotlinePlan(ctx, config, project, health) {
	const system = [
		"你是一位网文剧情架构师。请为本书设计「下一阶段的剧情方案」：给出未来 5-10 章的剧情方向，并建议 2-3 条值得新增的剧情线。",
		"要求：方向必须结合本书大纲/卷计划/现有线/编年录；新线要能落地（和当前主角处境、已有伏笔、下一阶段舞台相关），不得重复已有线。",
		"输出必须是合法 JSON 对象：{\"direction\": \"下一阶段方向 60-120 字\", \"suggestions\": [{\"name\": \"线名\", \"kind\": \"main|branch|character|mystery\", \"goal\": \"目标\", \"progress\": \"初始进度（可空）\"}]}",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating");
	const raw = parseJsonObject(await complete(ctx, config, {
		system,
		user: [
			`书名：《${project.bookName}》`,
			health !== void 0 ? `健康检查结论：\n判定：${health.verdict}\n时机：${health.timing}\n依据：${health.reasons.join("；")}` : "",
			`大纲（节选前 3000 字）：\n${project.outline.slice(0, 3e3)}`,
			project.volumes !== void 0 && project.volumes.length > 0 ? `卷计划：\n${project.volumes.map((v) => `第${v.no}卷《${v.title}》：${v.summary.slice(0, 60)}`).join("\n")}` : "",
			`现有剧情线：\n${(project.plotlines ?? []).map((l) => `- [${l.kind}${l.status === "resolved" ? "·已完结" : ""}] ${l.name}：${l.goal}`).join("\n") || "（无）"}`,
			written.length > 0 ? `最近写的章节：\n${written.slice(-5).map((c) => `第${c.no}章《${c.title}》`).join("、")}` : "",
			"只输出 JSON 对象。"
		].join("\n\n"),
		temperature: .6,
		maxTokens: Math.max(config.maxTokens, 3e3)
	}));
	const suggestions = [];
	const kinds = /* @__PURE__ */ new Set([
		"main",
		"branch",
		"character",
		"mystery"
	]);
	if (Array.isArray(raw.suggestions)) for (const entry of raw.suggestions) {
		if (typeof entry !== "object" || entry === null) continue;
		const e = entry;
		const name = typeof e.name === "string" ? e.name.trim().slice(0, 40) : "";
		if (name === "") continue;
		suggestions.push({
			id: "",
			name,
			kind: kinds.has(e.kind) ? e.kind : "branch",
			goal: typeof e.goal === "string" ? e.goal.trim().slice(0, 300) : "",
			progress: typeof e.progress === "string" ? e.progress.trim().slice(0, 300) : "",
			status: "active",
			chapters: [],
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		});
	}
	return {
		direction: typeof raw.direction === "string" ? raw.direction.slice(0, 300) : "",
		suggestions
	};
}
/** Build the rewrite system prompt (fix review issues / instructions). */
function rewriteSystemPrompt(project) {
	return writeSystemPrompt(project) + "\n\n额外要求：你正在【修订】一章已写好的正文。保留原文中好的部分，只修改需要修改的地方，输出完整的新正文（不要只输出修改片段），字数与原文相当。";
}
/**
* Stream a chapter rewrite. With `target` (a passage of the body), only that
* passage's paragraph is rewritten and spliced back — everything else stays
* untouched (local revision). Without `target`, the whole chapter is
* rewritten. Yields delta text; persists when done.
*/
async function* rewriteChapterStream(ctx, config, project, outputDir, chapterNo, instructions, target) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) throw new Error(`章节 ${chapterNo} 的正文文件不存在`);
	const reviewBlock = chapter.review !== void 0 ? "审稿意见：\n" + chapter.review.issues.map((i) => `[${i.severity}] ${i.item} → ${i.suggestion}`).join("\n") : "";
	const bodyText = body.replace(/^#\s+.*$/m, "").trim();
	let localTarget;
	if (target !== void 0 && target.trim() !== "") {
		const wanted = target.trim();
		const normalize = (value) => value.replace(/\s+/g, " ").replace(/[“”"'‘’]/g, "");
		const wantedFlat = normalize(wanted);
		const paragraphs = bodyText.split(/\n{2,}/);
		const idx = paragraphs.findIndex((p) => normalize(p).includes(wantedFlat));
		if (idx === -1) throw new Error(`在正文中未找到要修改的片段：「${wanted.slice(0, 40)}…」。请从正文中复制原文片段（无需整段，取片段即可）。`);
		localTarget = {
			paragraph: paragraphs[idx],
			before: paragraphs.slice(0, idx).join("\n\n"),
			after: paragraphs.slice(idx + 1).join("\n\n")
		};
	}
	const user = localTarget === void 0 ? [
		`请修订第 ${chapter.no} 章《${chapter.title}》。`,
		reviewBlock,
		instructions !== "" ? `本次修订重点：${instructions}` : "",
		"==================== 原正文 ====================",
		bodyText
	].filter((line) => line !== "").join("\n") : [
		`请修订第 ${chapter.no} 章《${chapter.title}》中的一个自然段。`,
		instructions !== "" ? `修改要求：${instructions}` : "",
		"==================== 需要修改的原文段落 ====================",
		localTarget.paragraph,
		"",
		"要求：",
		"1. 只输出修改后的【这一个段落】的完整新文本，不要输出任何说明、标题或 Markdown 标记。",
		"2. 保留该段的情节走向与角色口吻，只按修改要求调整。",
		"3. 段落长度与原文相当。"
	].filter((line) => line !== "").join("\n");
	const system = localTarget === void 0 ? rewriteSystemPrompt(project) : "你是一位中文网文润色师。你会收到一章中的一个段落，请按修改要求重写该段。只输出新段落文本。";
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: user
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-novel-forge"
		}
	})];
	const request = {
		provider: config.provider,
		model: config.model,
		messages,
		system,
		maxTokens: Math.max(config.maxTokens, 2e4),
		temperature: .7,
		reasoningEffort: ReasoningEffortId("off")
	};
	yield { frame: "start" };
	const assembler = new BlockAssembler();
	let streamError;
	for await (const chunk of ctx.llm.stream(request)) {
		assembler.push(chunk);
		if (chunk.type === "text-delta") yield {
			frame: "delta",
			text: chunk.text
		};
	}
	const finish = assembler.finish;
	if (finish.kind === "error" || finish.kind === "aborted") streamError = /* @__PURE__ */ new Error(`修订失败（${finish.kind}）: ${finish.failure.message}`);
	else if (finish.kind === "max-tokens") streamError = /* @__PURE__ */ new Error("修订输出达到 maxTokens 上限，请增大配置后重试");
	const rewritten = assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (streamError !== void 0) throw streamError;
	if (rewritten.length < 20) throw new Error("修订结果过短，可能失败，请重试");
	let newBody;
	if (localTarget !== void 0) newBody = [
		localTarget.before,
		rewritten,
		localTarget.after
	].filter((part) => part !== "").join("\n\n");
	else newBody = rewritten;
	if (newBody.length < 100) throw new Error("修订结果过短，可能失败，请重试");
	chapter.pendingDraft = newBody;
	chapter.error = void 0;
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	yield {
		frame: "drafted",
		chars: newBody.length,
		draft: newBody
	};
}
/** The de-AI-ify polish system prompt (with project writing assets injected). */
function polishSystemPrompt(project) {
	const assetsBlock = renderAllAssets(project.assets);
	return [
		"你是一位中文网文润色师。你会收到一章正文，请做「去 AI 味」润色：",
		"1. 删除/替换 AI 高频套话与模式词：如\"不禁\"\"仿佛\"\"一时间\"\"不由得\"\"顿时\"\"然而\"\"缓缓\"\"轻轻\"\"微微\"\"默默\"\"似乎\"\"终于\"等滥用。",
		"2. 把书面翻译腔改成口语化的中文网文语感。",
		"3. 拆分过长的排比句与堆砌的修饰语。",
		"4. 保留全部情节、人物、对话内容不变，只改表达。",
		"5. 输出完整的新正文，不要输出任何说明文字或 Markdown 标记。",
		"6. 必须遵守下方「反 AI 规则」与「写法资产」的表达边界；写法资产要求保留的风格特征（句式、台词、节奏）不得在润色中丢失。",
		assetsBlock !== "" ? assetsBlock : ""
	].join("\n");
}
/** Stream a chapter polish (de-AI-ify). Draft-mode: the polished body lands
*  in `chapter.pendingDraft` and is only applied on draft/apply. */
async function* polishChapterStream(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) throw new Error(`章节 ${chapterNo} 的正文文件不存在`);
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: body.replace(/^#\s+.*$/m, "").trim()
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-novel-forge"
		}
	})];
	const request = {
		provider: config.provider,
		model: config.model,
		messages,
		system: polishSystemPrompt(project),
		maxTokens: Math.max(config.maxTokens, 2e4),
		temperature: .5,
		reasoningEffort: ReasoningEffortId("off")
	};
	yield { frame: "start" };
	const assembler = new BlockAssembler();
	let streamError;
	for await (const chunk of ctx.llm.stream(request)) {
		assembler.push(chunk);
		if (chunk.type === "text-delta") yield {
			frame: "delta",
			text: chunk.text
		};
	}
	const finish = assembler.finish;
	if (finish.kind === "error" || finish.kind === "aborted") streamError = /* @__PURE__ */ new Error(`润色失败（${finish.kind}）: ${finish.failure.message}`);
	else if (finish.kind === "max-tokens") streamError = /* @__PURE__ */ new Error("润色输出达到 maxTokens 上限");
	const newBody = assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (streamError !== void 0) throw streamError;
	if (newBody.length < 100) throw new Error("润色结果过短，可能失败，请重试");
	chapter.pendingDraft = newBody;
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	yield {
		frame: "drafted",
		chars: newBody.length,
		draft: newBody
	};
}
/** Generate one chapter (streaming). Yields progress frames; persists when done. */
async function* generateChapterStream(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	let continuity = "";
	const prev = project.chapters.find((c) => c.no === chapterNo - 1);
	if (prev?.file !== void 0) {
		const prevPath = join(outputDir, prev.file);
		if (existsSync(prevPath)) continuity = readFileSync(prevPath, "utf8").slice(-900);
	}
	const prevSummary = prev?.summary;
	const allFacts = project.facts ?? [];
	const recentFacts = allFacts.slice(-20).map((f) => f.text);
	const recentSet = new Set(recentFacts);
	const beatsText = chapter.beats;
	const roleNames = (project.roles ?? []).map((r) => r.name).filter((n) => typeof n === "string" && n !== "");
	const trigrams = (s) => {
		const out = /* @__PURE__ */ new Set();
		for (let i = 0; i + 3 <= s.length; i++) {
			const tri = s.slice(i, i + 3);
			if (tri.trim() !== "") out.add(tri);
		}
		return out;
	};
	const beatsTri = trigrams(beatsText);
	const beatRoles = roleNames.filter((n) => beatsText.includes(n));
	const relatedFacts = allFacts.map((f, idx) => {
		const head = f.text.slice(0, 80);
		let score = 0;
		for (const tri of trigrams(head)) if (beatsTri.has(tri)) score += 1;
		if (beatRoles.length > 0) {
			for (const n of beatRoles) if (head.includes(n)) score += 8;
		}
		score += Math.min(idx, 40) / 10;
		return {
			f,
			score
		};
	}).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 15).map((x) => `[第${x.f.chapterNo}章] ${x.f.text}`).filter((t) => !recentSet.has(t.slice(t.indexOf("]") + 2)));
	const foreshadowHints = (project.foreshadows ?? []).filter((f) => f.status === "planned" && f.targetChapter !== void 0 && f.targetChapter > 0).filter((f) => Math.abs(f.targetChapter - chapterNo) <= 12).map((f) => `- ${f.description.slice(0, 120)}${f.targetChapter !== void 0 ? `（计划回收于第 ${f.targetChapter} 章）` : ""}`);
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: [
				`现在写第 ${chapter.no} 章，标题《${chapter.title}》。`,
				`本章剧情要点：${chapter.beats}`,
				"",
				foreshadowHints.length > 0 ? `本章附近需顺势埋下以下暗线（自然带过，不喧宾夺主，1-2 句即可，但细节要可辨识、与描述吻合）：\n${foreshadowHints.join("\n")}` : "",
				recentFacts.length > 0 ? `本书已确立的事实（新写内容不得与之矛盾）：\n${recentFacts.join("\n")}` : "",
				relatedFacts.length > 0 ? `本章相关的既往事实（同样不得违背）：\n${relatedFacts.join("\n")}` : "",
				prevSummary !== void 0 && prevSummary !== "" ? `上一章摘要：${prevSummary}` : "",
				continuity !== "" ? `上一章结尾（用于衔接，不要复述）：\n${continuity}` : "这是第一章，注意开篇要有吸引力。",
				"",
				`请写 ${chapter.targetChars} 字左右的正文，只输出正文。`
			].filter((line) => line !== "").join("\n")
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-novel-forge"
		}
	})];
	const request = {
		provider: config.provider,
		model: config.model,
		messages,
		system: writeSystemPrompt(project),
		maxTokens: Math.max(config.maxTokens, 2e4),
		temperature: .85
	};
	yield { frame: "start" };
	const assembler = new BlockAssembler();
	let streamError;
	for await (const chunk of ctx.llm.stream(request)) {
		assembler.push(chunk);
		if (chunk.type === "text-delta") yield {
			frame: "delta",
			text: chunk.text
		};
	}
	const finish = assembler.finish;
	if (finish.kind === "error" || finish.kind === "aborted") streamError = /* @__PURE__ */ new Error(`生成失败（${finish.kind}）: ${finish.failure.message}`);
	else if (finish.kind === "max-tokens") streamError = /* @__PURE__ */ new Error("达到 maxTokens 上限，正文可能不完整，请增大 maxTokens 后重试");
	const body = assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (streamError !== void 0) throw streamError;
	if (body.length < 100) throw new Error("生成内容过短，可能失败，请重试");
	const fileName = chapterFileName(chapter);
	mkdirSync(outputDir, { recursive: true });
	writeFileSync(join(outputDir, fileName), `# 第${chapter.no}章 ${chapter.title}\n\n${body}\n`, "utf8");
	chapter.status = "written";
	chapter.chars = body.length;
	chapter.file = fileName;
	chapter.error = void 0;
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	yield {
		frame: "done",
		file: fileName,
		chars: body.length
	};
}
/** Generate a chapter summary (narrative memory). */
async function summarizeChapter(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) throw new Error(`章节 ${chapterNo} 的正文文件不存在`);
	chapter.summary = (await complete(ctx, config, {
		system: [
			"你是一位网文编辑。请为下面一章写一段 120-200 字的摘要，供后续章节写作时保持连贯性。",
			"摘要必须包含：本章发生的关键事件、主角状态变化（境界/资源/伤势/心境）、新增的伏笔或线索、角色关系变化。",
			"用客观陈述句，不要评价，不要剧透式感叹。只输出摘要正文。"
		].join("\n"),
		user: body.replace(/^#\s+.*$/m, "").trim(),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 4e3)
	})).slice(0, 500);
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	return chapter.summary;
}
/** 把分镜产出写入项目持久化（按章 upsert）。重新生成上游时级联清掉下游旧产物：
* 新骨架 → 清分镜表+提示词；新分镜表 → 清提示词；新提示词不动上游。 */
function saveChapterStoryboard(project, outputDir, entry) {
	if (project.storyboards === void 0) project.storyboards = [];
	const idx = project.storyboards.findIndex((e) => e.chapterNo === entry.chapterNo);
	const next = {
		...(idx === -1 ? void 0 : project.storyboards[idx]) ?? {},
		...entry
	};
	if (entry.skeleton !== void 0) {
		next.table = void 0;
		next.prompts = void 0;
	}
	if (entry.table !== void 0) next.prompts = void 0;
	if (idx === -1) project.storyboards.push(next);
	else project.storyboards[idx] = next;
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
}
/** 确定性兜底：正文中出现的角色库角色名（LLM 漏填 characters 时使用）。 */
function guessCharactersFromRoles(project, body, limit = 12) {
	const out = [];
	for (const r of project.roles ?? []) {
		if (out.length >= limit) break;
		if (r.name !== "" && !out.includes(r.name) && body.includes(r.name)) out.push(r.name);
	}
	return out;
}
/** 清洗 LLM 输出的角色名数组：去空 / 去重 / 限长 / 限字数。 */
function sanitizeCharacters(raw, limit) {
	if (!Array.isArray(raw)) return [];
	const out = [];
	for (const v of raw) {
		if (typeof v !== "string") continue;
		const name = v.trim().slice(0, 20);
		if (name === "" || out.includes(name)) continue;
		out.push(name);
		if (out.length >= limit) break;
	}
	return out;
}
function buildMangaRoleBindings(project) {
	const cards = project.mangaRoles ?? [];
	const byName = /* @__PURE__ */ new Map();
	for (const c of cards) {
		if (c.name !== "") byName.set(c.name, c);
		if (c.sourceRoleName !== void 0 && c.sourceRoleName !== "") byName.set(c.sourceRoleName, c);
	}
	return {
		byId: new Map(cards.map((c) => [c.id, c])),
		resolve: (name) => {
			const exact = byName.get(name);
			if (exact !== void 0) return exact;
			for (const c of cards) {
				if (c.name !== "" && (c.name.includes(name) || name.includes(c.name))) return c;
				if (c.sourceRoleName !== void 0 && c.sourceRoleName !== "" && (c.sourceRoleName.includes(name) || name.includes(c.sourceRoleName))) return c;
			}
		}
	};
}
/**
* 分镜·导演级：剧情骨架 → 分镜表（镜头级）。
* 只做画面层：景别/机位运镜/时长/画面/台词/音效/光效 + 状态连续；禁止改剧情（骨架只读）。
*/
async function generateStoryboardTable(ctx, config, project, outputDir, chapterNo, skeleton, styleId, filterId) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) throw new Error(`章节 ${chapterNo} 的正文文件不存在`);
	if ((skeleton.beats ?? []).length === 0) throw new Error("骨架为空，请先生成剧情骨架");
	const roles = (project.roles ?? []).filter((r) => body.includes(r.name)).slice(0, 8).map((r) => `${r.name}（${r.roleLabel === "protagonist" ? "主角" : r.roleLabel === "antagonist" ? "反派" : r.roleLabel === "female_lead" ? "女主" : "配角"}）：${r.identity ?? ""}`);
	const usedScenes = (project.scenes ?? []).filter((s) => body.includes(s.name)).slice(0, 6);
	const scenes = usedScenes.map((s) => `${s.name}：${s.summary ?? ""}`);
	const bindings = buildMangaRoleBindings(project);
	const mangaLines = (bindings.byId.size > 0 ? [...bindings.byId.values()].filter((c) => body.includes(c.name) || c.sourceRoleName !== void 0 && body.includes(c.sourceRoleName)).slice(0, 8) : []).map((c) => {
		const anchor = c.imagePrompt !== void 0 ? c.imagePrompt.zh.slice(0, 90) : c.appearance !== "" ? c.appearance : "";
		const ref = c.imageUrl !== void 0 ? "；参考图：有" : (c.gallery ?? []).some((g) => g.label.includes("立绘")) ? "；参考图：有（立绘）" : "";
		return `${c.name}（${c.identity ?? ""}）：定妆${anchor !== "" ? "「" + anchor + "」" : "（锚点未生成）"}${ref}`;
	});
	const rules = (project.visualRules ?? []).map((r) => "- " + r);
	const baseStyle = styleId !== void 0 ? findStyle(styleId) : void 0;
	const filterStyle = filterId !== void 0 ? findStyle(filterId) : void 0;
	const styleLines = [];
	if (baseStyle !== void 0) styleLines.push("- 基底风格「" + baseStyle.name + "」：" + baseStyle.keywords);
	if (filterStyle !== void 0) styleLines.push("- 叠加滤镜「" + filterStyle.name + "」：" + filterStyle.keywords);
	if (styleLines.length === 0) styleLines.push("- （未选择风格，默认 3D 动漫超精细建模质感）");
	const raw = parseJsonObject(await complete(ctx, config, {
		system: [
			"你是一位从业 10 年的电影导演兼分镜师，专长网文改编影视化。",
			"任务：把「剧情骨架」的每一个节拍展开为 1-3 个电影镜头，输出分镜表——只做画面层，禁止新增或改变剧情（骨架是只读输入）。",
			"输出合法 JSON 对象：{\"shots\": [{\"beatId\": \"骨架节拍id\", \"shot\": \"景别\", \"camera\": \"机位与运镜\", \"composition\": \"构图\", \"duration\": 秒数, \"visual\": \"画面内容\", \"line\": \"台词/旁白\", \"sound\": \"音效\", \"light\": \"光效\", \"prevState\": \"承接上一镜头结尾状态\", \"nextState\": \"本镜头结束状态\", \"characters\": [\"出镜角色名\"]}]}",
			"景别取值（只能从这些词中选一）：大远景/远景/全景/中景/中近景/近景/特写/大特写。",
			"运镜取值（可组合，用加号连接）：固定机位/推近/拉远/左摇/右摇/左横移/右横移/跟随/升镜/降镜/环绕/手持晃动/低机位仰拍/高机位俯拍/过肩镜头。",
			"光效取值（可组合，用加号连接）：顺光/侧光/逆光/顶光/伦勃朗光/霓虹光/硬光/柔光/氛围光/高反差。",
			"构图取值（可选，只能从这些词中选一）：三分法/中心对称/引导线/前景遮挡/低机位/俯拍/对称构图。",
			"硬性要求：",
			"【视觉风格】（必须内嵌进 visual/light 的画面措辞与光效描述）：",
			...styleLines,
			"1. 按骨架节拍顺序输出镜头，每个节拍至少 1 个镜头，总镜头数 8-25。",
			"2. 镜头间连续：下一镜头的 prevState 必须与上一镜头的 nextState 一致（人物位置/动作/情绪/服装），禁止瞬移、服装消失、情绪跳变。",
			"3. visual 必须写明：角色动作 + 表情 + 服装/标志物（标志物来自下方视觉规则与角色锚点，逐镜头保持）。",
			"4. 台词/音效/光效无则空字符串，不要编造。",
			"5. duration 1-12 秒。",
			"6. 所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束，不要输出其他文字。",
			"7. 每个镜头必须输出 characters：本镜头出镜角色名数组（1-4 个），从「出场角色锚点」或正文中选取，使用正文里的确切称谓（如「周野」「周野的律师」），禁止自造名/缩写；路人或群像可用身份词（如「围观群众」）。",
			"8. 人物外观/服装/标志物必须遵守「漫剧定妆卡」与「出场角色锚点」：同一角色逐镜头保持完全一致（服装、发色、标志物禁止更换）；定妆卡未覆盖的路人可用通用描述。"
		].join("\n"),
		user: [
			`章节《${chapter.title}》（第 ${chapter.no} 章）`,
			"==== 剧情骨架（只读，禁止改动） ====",
			`弧线：${skeleton.arc}`,
			skeleton.beats.map((b) => `[${b.id}] [${b.function}] ${b.event}（情绪：${b.emotion}${b.cause !== void 0 ? "；承接：" + b.cause : ""}）`).join("\n"),
			roles.length > 0 ? "==== 出场角色锚点 ====\n" + roles.join("\n") : "",
			mangaLines.length > 0 ? "==== 漫剧定妆卡（角色外观以此为准，禁止改换服装/发色/标志物） ====\n" + mangaLines.join("\n") : "",
			scenes.length > 0 ? "==== 相关场景 ====\n" + scenes.join("\n") : "",
			rules.length > 0 ? "==== 本书视觉规则（必须内嵌进 visual） ====\n" + rules.join("\n") : "",
			"==== 章节正文（画面细节以此为准） ====",
			body.replace(/^#\s+.*$/m, "").trim().slice(0, 3e3)
		].filter((s) => s !== "").join("\n\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 16e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const beatIds = new Set(skeleton.beats.map((b) => b.id));
	const shots = Array.isArray(raw.shots) ? raw.shots.filter((v) => typeof v === "object" && v !== null).map((entry, i) => ({
		id: "s" + (i + 1),
		beatId: beatIds.has(entry.beatId) ? entry.beatId : skeleton.beats[0].id,
		shot: normalizeShotSize(entry.shot),
		camera: normalizeCameras(entry.camera),
		composition: normalizeComposition(entry.composition),
		duration: typeof entry.duration === "number" && entry.duration >= 1 && entry.duration <= 12 ? Math.round(entry.duration) : 4,
		visual: typeof entry.visual === "string" ? entry.visual.trim().slice(0, 300) : "",
		line: typeof entry.line === "string" ? entry.line.trim().slice(0, 120) : "",
		sound: typeof entry.sound === "string" ? entry.sound.trim().slice(0, 80) : "",
		light: normalizeLightings(entry.light),
		prevState: typeof entry.prevState === "string" ? entry.prevState.trim().slice(0, 150) : "",
		nextState: typeof entry.nextState === "string" ? entry.nextState.trim().slice(0, 150) : "",
		characters: sanitizeCharacters(entry.characters, 4)
	})).filter((s) => s.visual !== "") : [];
	if (shots.length === 0) throw new Error("模型未输出有效镜头，请重试");
	const covered = new Set(shots.map((s) => s.beatId));
	const missing = skeleton.beats.filter((b) => !covered.has(b.id)).map((b) => b.id);
	if (missing.length > 0) console.warn(`[dsh-novel-forge] storyboard: beat ${missing.join(",")} 无镜头覆盖`);
	const tableChars = [];
	const tableRoleIds = [];
	for (const s of shots) {
		const ids = [];
		for (const n of s.characters ?? []) {
			const card = bindings.resolve(n);
			if (card !== void 0 && !ids.includes(card.id)) ids.push(card.id);
		}
		s.mangaRoleIds = ids.length > 0 ? ids : void 0;
		for (const c of s.characters ?? []) {
			if (!tableChars.includes(c)) tableChars.push(c);
			if (tableChars.length >= 12) break;
		}
		for (const id of ids) if (!tableRoleIds.includes(id)) tableRoleIds.push(id);
	}
	const fallbackChars = (skeleton.characters ?? guessCharactersFromRoles(project, body, 12)).slice(0, 12);
	const table = {
		chapterNo,
		shots,
		usedScenes: usedScenes.map((s) => s.name),
		characters: tableChars.length > 0 ? tableChars : fallbackChars,
		mangaRoleIds: tableRoleIds.length > 0 ? tableRoleIds : void 0
	};
	saveChapterStoryboard(project, outputDir, {
		chapterNo,
		table,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	});
	return table;
}
/**
* 分镜·提示词级：分镜表 → 即梦可粘贴视频提示词。
* 每镜头一段：风格词块（基底+滤镜）+ 画面内容（角色动作/服装标志物）+ 机位运镜 + 光效。
* 提示词聚焦画面与镜头（视频模型无音频，台词/音效不注入）。
*/
async function generateStoryboardPrompts(ctx, config, project, outputDir, chapterNo, table, styleId, filterId) {
	if ((table.shots ?? []).length === 0) throw new Error("分镜表为空，请先生成分镜表");
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	const baseStyle = styleId !== void 0 ? findStyle(styleId) : void 0;
	const filterStyle = filterId !== void 0 ? findStyle(filterId) : void 0;
	const stylePrefix = [baseStyle?.keywords, filterStyle?.keywords].filter((v) => v !== void 0 && v !== "").join("，") || "3D动漫，超精细建模，电影光影";
	const rules = (project.visualRules ?? []).map((r) => "- " + r);
	const bindings = buildMangaRoleBindings(project);
	const shotLines = table.shots.map((s) => {
		const makeUp = (s.characters ?? []).map((n) => bindings.resolve(n)).filter((c) => c !== void 0).map((c) => {
			const anchor = c.imagePrompt !== void 0 ? c.imagePrompt.zh.slice(0, 60) : c.appearance !== "" ? c.appearance : "";
			const ref = c.imageUrl !== void 0 ? "（参考图）" : "";
			return c.name + "：" + anchor + ref;
		}).join("；");
		return `[${s.id}] 节拍${s.beatId} · ${sizeZh(s.shot)} · ${cameraZh(s.camera)} · ${s.duration}s
出场：${s.characters !== void 0 && s.characters.length > 0 ? s.characters.join("、") : "（未标注）"}
定妆：${makeUp !== "" ? makeUp : "（未绑定漫剧卡）"}
画面：${s.visual}
台词：${s.line !== "" ? s.line : "（无）"}
光效：${lightZh(s.light) !== "" ? lightZh(s.light) : "（无）"}
承接：${s.prevState} → ${s.nextState}`;
	}).join("\n\n");
	const raw = parseJsonObject(await complete(ctx, config, {
		system: [
			"你是一位资深影视分镜提示词工程师，熟悉即梦 AI / Seedance 等视频生成模型的中文提示词写法。",
			"任务：把分镜表的每个镜头写成一段可直接粘贴进视频生成工具的提示词。",
			"提示词结构（按顺序）：风格词块 → 画面主体（人物动作+表情+服装标志物）→ 机位运镜（含时长感）→ 光效氛围。单段中文 60-140 字，逗号分隔，流畅自然。",
			"风格词块（必须原样放在每段开头）：" + stylePrefix,
			"重要：每段提示词开头必须原样嵌入风格词块原文，不得省略、不得改写。",
			"硬性要求：",
			"1. 只写画面与镜头，禁止写音频/台词配音说明（视频模型无音频）。",
			"2. 服装/发色/标志物必须沿用镜头表、定妆卡与视觉规则，禁止自行更换（同一角色跨镜头保持一致）。",
			"3. 运镜用通俗电影词（推近/拉远/跟随/低机位仰拍/过肩/手持晃动/固定机位），不要用分镜术语缩写。",
			"4. 输出合法 JSON 对象：{\"prompts\": [{\"shotId\": \"s1\", \"text\": \"...\"}]}，所有镜头都要有，顺序一致。",
			"5. 字符串内不得包含换行符，JSON 必须在一段内完整结束。"
		].join("\n"),
		user: [
			`章节《${chapter?.title ?? ""}》（第 ${chapterNo} 章）`,
			rules.length > 0 ? "本书视觉规则（必须遵守）：\n" + rules.join("\n") : "",
			"==== 分镜表 ====",
			shotLines,
			"只输出 JSON 对象。"
		].filter((x) => x !== "").join("\n\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 16e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const shotIds = new Set(table.shots.map((s) => s.id));
	const shotBinding = new Map(table.shots.map((s) => [s.id, s.mangaRoleIds ?? []]));
	const prompts = Array.isArray(raw.prompts) ? raw.prompts.filter((v) => typeof v === "object" && v !== null).map((entry) => {
		const shotId = shotIds.has(entry.shotId) ? entry.shotId : "";
		const ids = shotBinding.get(shotId) ?? [];
		return {
			shotId,
			text: ensureStyleEmbedded(typeof entry.text === "string" ? entry.text.trim().slice(0, 400) : "", stylePrefix, "zh"),
			mangaRoleIds: ids.length > 0 ? ids : void 0
		};
	}).filter((x) => x.shotId !== "" && x.text !== "") : [];
	if (prompts.length === 0) throw new Error("模型未输出有效提示词，请重试");
	saveChapterStoryboard(project, outputDir, {
		chapterNo,
		prompts,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	});
	return prompts;
}
/**
* 分镜·编剧级：单章 → 剧情骨架（节拍链）。
* 只做故事层（事件/情绪/功能/因果），不做画面；导演级分镜在其上展开。
*/
async function generateStoryboardSkeleton(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) throw new Error(`章节 ${chapterNo} 的正文文件不存在`);
	const raw = parseJsonObject(await complete(ctx, config, {
		system: [
			"你是一位从业 15 年的电影编剧，专长网文改编影视化，深谙三幕结构与节拍（beat）写作。",
			"任务：把这一章改编成影视化「剧情骨架」——只做故事层，不做画面。",
			"输出合法 JSON 对象：{\"arc\": \"本章弧线一句话（起承转合，20-60字）\", \"beats\": [{\"event\": \"事件一句话（发生了什么）\", \"emotion\": \"人物情绪走向（情绪词数组）\", \"function\": \"铺垫|冲突|转折|高潮|收束|伏笔|人物塑造\", \"cause\": \"承接上一节拍的原因（可省略）\"}], \"characters\": [\"出镜角色名1\", \"出镜角色名2\"]}",
			"情绪词取值（从这些词中选 1-3 个，用数组输出，按情绪发展顺序）：平静/淡然/期待/好奇/警觉/压抑/隐忍/担忧/焦躁/不安/惊惧/愤怒/崩溃/决绝/痛心/释然/悲凉/得意/重生/麻木。",
			"功能取值（只能从这些词中选一）：铺垫/冲突/转折/高潮/收束/伏笔/人物塑造。",
			"硬性要求：",
			"1. beats 数量 4-9 个，严格按时间顺序，因果链完整：前一个 beat 的结果是后一个 beat 的原因。",
			"2. 必须覆盖本章全部剧情要点与正文关键事件，遗漏关键事件视为失败。",
			"3. 只输出剧情骨架，禁止写画面描写、机位运镜、台词细节、音效（那是导演阶段的事）。",
			"4. 所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
			"5. 直接输出 JSON 本身，不要输出思考过程或其他文字。",
			"6. 额外输出 characters：本章真正出镜（说话/行动/被正面描写）的角色名数组，全部使用正文中的确切称谓（如「周野」「周野的律师」，不要改名或拼接），去重，3-10 个；路人或群像可用身份词（如「围观群众」）。"
		].join("\n"),
		user: [
			`章节《${chapter.title}》（第 ${chapter.no} 章）`,
			`剧情要点：${chapter.beats !== void 0 && chapter.beats !== "" ? chapter.beats : "（未填写）"}`,
			"==================== 章节正文 ====================",
			body.replace(/^#\s+.*$/m, "").trim()
		].join("\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 4e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const arc = typeof raw.arc === "string" ? raw.arc.trim().slice(0, 200) : "";
	const beats = Array.isArray(raw.beats) ? raw.beats.filter((v) => typeof v === "object" && v !== null).map((entry, i) => ({
		id: "b" + (i + 1),
		event: typeof entry.event === "string" ? entry.event.trim().slice(0, 200) : "",
		emotion: Array.isArray(entry.emotion) ? normalizeEmotions(entry.emotion.filter((x) => typeof x === "string").join("→")) : normalizeEmotions(typeof entry.emotion === "string" ? entry.emotion : void 0),
		function: normalizeStoryFunction(typeof entry.function === "string" ? entry.function : void 0),
		cause: typeof entry.cause === "string" && entry.cause.trim() !== "" ? entry.cause.trim().slice(0, 150) : void 0
	})).filter((b) => b.event !== "") : [];
	if (beats.length === 0) throw new Error("模型未输出有效节拍链，请重试");
	const skeletonChars = sanitizeCharacters(raw.characters, 12);
	const chars = skeletonChars.length > 0 ? skeletonChars : guessCharactersFromRoles(project, body, 12);
	const skeleton = {
		chapterNo,
		arc: arc !== "" ? arc : "（本章弧线未生成）",
		beats,
		characters: chars.length > 0 ? chars : void 0
	};
	saveChapterStoryboard(project, outputDir, {
		chapterNo,
		skeleton,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	});
	return skeleton;
}
/**
* 反向推大纲：从已写章节正文反推出全书总纲（分卷 + 章节要点 + 主线/人物弧线/伏笔清单）。
* 两阶段：分批提取章节事件摘要 → 汇总生成大纲。不修改章节/设定，只返回大纲文本。
*/
async function reverseOutlineFromChapters(ctx, config, project, outputDir, onProgress) {
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating" && c.status !== "error").filter((c) => readChapterFile(outputDir, c) !== void 0).sort((a, b) => a.no - b.no);
	if (written.length === 0) throw new Error("本书还没有已写章节，无法反推大纲");
	const BATCH = 10;
	const notes = [];
	const total = written.length;
	for (let i = 0; i < written.length; i += BATCH) {
		const note = await complete(ctx, config, {
			system: "你是一位网文编辑。下面是一本书若干章正文的节选。请为每一章输出一行「事件摘要」，格式严格为：第N章《标题》：关键事件+主角状态变化+新增伏笔或线索。每章恰好一行，不要空行，不要评价，不要输出其他内容。",
			user: written.slice(i, i + BATCH).map((c) => {
				const body = readChapterFile(outputDir, c) ?? "";
				return "第" + c.no + "章《" + (c.title || "无题") + "》\n" + body.replace(/^#\s+.*$/m, "").trim().slice(0, 1e3);
			}).join("\n\n---\n\n"),
			temperature: .2,
			maxTokens: Math.max(config.maxTokens, 3e3),
			reasoning: config.analysisReasoning ?? "low"
		});
		notes.push(note.trim());
		onProgress?.(Math.min(i + BATCH, total), total, "章节摘要");
	}
	onProgress?.(total, total, "生成大纲");
	const outline = await complete(ctx, config, {
		system: [
			"你是一位经验丰富的小说主编。根据下面全书各章事件摘要，反推出这本书的总纲（大纲），可直接作为后续写作依据。要求：",
			"1. 第一行写《书名》（从摘要中的书名或内容推断，若无则用《未命名》）。",
			"2. 按故事弧线划分卷/部分：每卷给出卷名与主旨（标注覆盖章节范围）。",
			"3. 每一章列出：章节号 + 标题 + 一句话核心情节（若原章无标题可自拟）。",
			"4. 最后给出：全书主线、主要人物弧线、已埋设待回收的伏笔清单。",
			"5. 输出为纯文本 Markdown 结构（# 一级标题、## 二级标题、- 列表），不要多余寒暄。"
		].join("\n"),
		user: notes.join("\n\n"),
		temperature: .4,
		maxTokens: Math.max(config.maxTokens, 6e3),
		reasoning: config.analysisReasoning ?? "low"
	});
	onProgress?.(total, total, "完成");
	return outline.trim();
}
/**
* 改编模式 P0：全文分析 → 原文设定卡片 / 可改范围矩阵。
* 拆章统计 + 取样正文，让 LLM 一次输出结构化 JSON：
* { bookName, outline, dimensions: [{key,title,mutability,current,evidence,candidates,impact,risk}] }。
*/
async function analyzeAdaptation(ctx, config, text) {
	const chapters = splitBookText(text).filter((c) => c.body.length >= 50);
	if (chapters.length === 0) throw new Error("未能从全文拆出章节（内容过短或无章节结构）");
	const sampleBodies = [];
	const n = chapters.length;
	const pick = (i) => {
		const c = chapters[i];
		if (c !== void 0) sampleBodies.push("第" + c.no + "章《" + (c.title || "无题") + "》\n" + c.body.slice(0, 1200));
	};
	pick(0);
	if (n > 3) {
		pick(Math.floor(n / 3));
		pick(Math.floor(2 * n / 3));
	}
	if (n > 1) pick(n - 1);
	const raw = parseJsonObject(await complete(ctx, config, {
		system: "你是改编策划分析助手。",
		user: [
			"你是一位资深网文编辑兼改编策划。下面给你一部已完结/连载小说的若干章正文节选。请通读并输出该书的「原文设定卡片」与「可改范围矩阵」。",
			"输出合法 JSON 对象：",
			"{\"bookName\": \"书名\", \"outline\": \"一句话主线梗概（100字内）\", \"dimensions\": [{\"key\":\"realm\",\"title\":\"大世界\",\"mutability\":\"big|small|free|locked|visual\",\"current\":\"当前值\",\"evidence\":\"证据（出现章节/频次）\",\"candidates\":[\"候选1\",\"候选2\"],\"impact\":\"改了会影响什么\",\"risk\":\"high|medium|low\"}]}",
			"dimensions 至少覆盖以下维度（key/title）：realm 大世界、cultivation 修为体系、protagonist 主角、goldenFinger 金手指、supporting 配角与势力人物名、faction 势力/组织、style 文风与叙事、ending 结局走向、timeline 时间线/编年、foreshadow 伏笔/暗线。",
			"mutability 取值：locked=建议保留、big=可改影响大、small=可改影响小、free=可自由改、visual=仅视觉包装。",
			"每个 dimension.current 必须忠于文本，能引用原文就用原文（尤其角色名/境界名/势力名/金手指名）。",
			"重要：所有字符串值内部不得包含换行符；JSON 必须在一段内完整结束；直接输出 JSON，不要 Markdown 代码块。"
		].join("\n") + "\n\n" + sampleBodies.join("\n\n---\n\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 6e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const bookName = typeof raw.bookName === "string" ? raw.bookName.trim() : "未命名";
	const dims = Array.isArray(raw.dimensions) ? raw.dimensions.filter((d) => typeof d === "object" && d !== null).map((d) => normalizeAdaptationDimension(d)).filter((d) => d !== null) : [];
	let outline;
	try {
		outline = await reverseOutlineFromAdaptationText(ctx, config, chapters);
	} catch {
		outline = typeof raw.outline === "string" && raw.outline.trim() !== "" ? raw.outline.trim() : void 0;
	}
	return {
		bookName,
		chapters: chapters.length,
		outline,
		dimensions: dims,
		note: "基于节选分析（首/中/末取样）+ 反推大纲。如需逐章全文级深度分析请后续启用全文流式入口。"
	};
}
/** 校验并归一化一行的改编维度数据（来自 LLM）。 */
function normalizeAdaptationDimension(d) {
	const key = typeof d.key === "string" ? d.key : "";
	const title = typeof d.title === "string" ? d.title : "";
	if (key === "" || title === "") return null;
	const mutability = [
		"locked",
		"big",
		"small",
		"free",
		"visual"
	].includes(d.mutability) ? d.mutability : "small";
	const risk = [
		"high",
		"medium",
		"low"
	].includes(d.risk) ? d.risk : "medium";
	return {
		key,
		title,
		mutability,
		current: typeof d.current === "string" ? d.current : "",
		evidence: typeof d.evidence === "string" ? d.evidence : void 0,
		candidates: Array.isArray(d.candidates) ? d.candidates.filter((x) => typeof x === "string") : [],
		impact: typeof d.impact === "string" ? d.impact : "",
		risk
	};
}
/** 从全文拆出的章节节选反推全书总纲（Markdown），用于改编 P0 的「反推大纲」。 */
async function reverseOutlineFromAdaptationText(ctx, config, chapters) {
	const n = chapters.length;
	const sample = [];
	const count = Math.min(n, 20);
	for (let i = 0; i < count; i++) {
		const c = chapters[Math.floor(i * n / count)];
		if (c === void 0) continue;
		sample.push("第" + c.no + "章《" + (c.title || "无题") + "》\n" + c.body.slice(0, 600));
	}
	return (await complete(ctx, config, {
		system: [
			"你是一位经验丰富的小说主编。根据下面若干章节的正文节选，反推出这本书的总纲（可作为后续改编与章节续写的骨架）。",
			"要求：",
			"1. 第一行写《书名》（可从正文推断，否则《未命名》）。",
			"2. 按故事弧线划分卷/部分：每卷给卷名与主旨（标注覆盖章节范围）。",
			"3. 对每章列出：章节号 + 标题 + 一句话核心情节。",
			"4. 最后给出：全书主线、主要人物弧线、已埋设待回收的伏笔清单。",
			"5. 输出纯文本 Markdown 结构（# 一级标题、## 二级标题、- 列表），不要寒暄，不要其他输出。"
		].join("\n"),
		user: sample.join("\n\n---\n\n"),
		temperature: .4,
		maxTokens: Math.max(config.maxTokens, 6e3),
		reasoning: config.analysisReasoning ?? "low"
	})).trim();
}
/** 改编方案：由用户勾选的维度与新值，生成 LLM 映射表/规则/影响清单。 */
async function proposeAdaptation(ctx, config, text, selections, dimensions) {
	const raw = parseJsonObject(await complete(ctx, config, {
		system: "你是改编策划。",
		user: [
			"下面给出改编决策：用户想改哪些维度、改成什么值。请生成一份可执行的「改编方案」。",
			"要求输出合法 JSON 对象：",
			"{\"mappings\": [{\"source\":\"原值\",\"target\":\"新值\",\"scope\":\"name|realm|faction|term|other\",\"note\":\"说明\"}], \"rules\": {\"preserve\":[\"必须保留的要素\"],\"change\":[\"允许改变的要素\"],\"constraints\":[\"改编红线/一致性要求\"]}, \"impacts\": [{\"item\":\"受影响项\",\"detail\":\"说明\",\"risk\":\"high|medium|low\",\"chapters\":[章号]}]}",
			"mappings 需把用户确认的新值展开为「原→新」条目（如主角名/境界名/势力名/术语），并补充用户未填但关联的必改项（如改了修为体系名，相关的境界名一并列映射）。",
			"rules.preserve 至少包含：故事骨架、人物动机、伏笔逻辑、爽点结构。",
			"impacts 列出每个改动会影响的内容（术语/角色/章节/伏笔），能定位章号尽量定位；无法定位则给章节区间提示。",
			"重要：所有字符串值内部不得包含换行符；JSON 必须在一段内完整结束；直接输出 JSON，不要 Markdown 代码块。",
			"",
			"用户要改：",
			selections.map((s) => "- " + s.title + "（" + s.key + "）：" + s.current + " → " + s.target).join("\n"),
			"",
			"原文可改矩阵（已分析）：",
			(dimensions ?? []).map((d) => "- " + d.title + "：" + d.current + "（可改度：" + d.mutability + "，风险：" + d.risk + "）").join("\n")
		].join("\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 6e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	return { proposal: {
		mappings: Array.isArray(raw.mappings) ? raw.mappings.filter((m) => typeof m === "object" && m !== null).map((m) => normalizeAdaptationMapping(m)).filter((m) => m !== null) : [],
		rules: normalizeAdaptationRules(raw.rules),
		impacts: Array.isArray(raw.impacts) ? raw.impacts.filter((i) => typeof i === "object" && i !== null).map((i) => normalizeAdaptationImpact(i)) : []
	} };
}
/** 剧本术语替换执行：按映射表做精确替换并统计命中。 */
function applyAdaptationReplacements(text, mappings) {
	const seen = /* @__PURE__ */ new Set();
	const unique = mappings.filter((m) => {
		const s = m.source.trim();
		if (s === "" || s === m.target.trim()) return false;
		if (seen.has(s)) return false;
		seen.add(s);
		return true;
	}).sort((a, b) => b.source.length - a.source.length);
	let adapted = text;
	const hits = [];
	for (const m of unique) {
		const count = adapted.split(m.source).length - 1;
		if (count > 0) adapted = adapted.split(m.source).join(m.target);
		hits.push({
			source: m.source,
			target: m.target,
			count
		});
	}
	return {
		adaptedText: adapted,
		hits
	};
}
/** 校验归一化一条映射（来自 LLM）。 */
function normalizeAdaptationMapping(m) {
	const source = typeof m.source === "string" ? m.source.trim() : "";
	const target = typeof m.target === "string" ? m.target.trim() : "";
	if (source === "" || target === "") return null;
	return {
		source,
		target,
		scope: [
			"name",
			"realm",
			"faction",
			"term",
			"other"
		].includes(m.scope) ? m.scope : "other",
		note: typeof m.note === "string" ? m.note : void 0
	};
}
/** 校验归一化改编规则（来自 LLM）。 */
function normalizeAdaptationRules(r) {
	const obj = typeof r === "object" && r !== null ? r : {};
	const arr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
	return {
		preserve: arr(obj.preserve),
		change: arr(obj.change),
		constraints: arr(obj.constraints)
	};
}
/** 校验归一化一条影响项（来自 LLM）。 */
function normalizeAdaptationImpact(i) {
	const risk = [
		"high",
		"medium",
		"low"
	].includes(i.risk) ? i.risk : "medium";
	const chapters = Array.isArray(i.chapters) ? i.chapters.filter((x) => typeof x === "number") : void 0;
	return {
		item: typeof i.item === "string" ? i.item : "",
		detail: typeof i.detail === "string" ? i.detail : "",
		risk,
		chapters: chapters !== void 0 && chapters.length > 0 ? chapters : void 0
	};
}
/**
* 摘要 + 事实抽取合并为一次 LLM 调用（省一次调用与一次正文输入，
* 批量生成时整体开销约省 25%）。
* @returns 摘要与新增事实条数（失败返回空，调用方 best-effort）。
*/
async function summarizeAndExtractFacts(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) return {
		summary: "",
		factCount: 0
	};
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) return {
		summary: "",
		factCount: 0
	};
	const raw = parseJsonObject(await complete(ctx, config, {
		system: [
			"你是一位网文编辑。请为下面一章做两件事，输出合法 JSON 对象：",
			"{\"summary\": \"120-200字摘要，含关键事件/主角状态变化（境界资源伤势心境）/新增伏笔线索/角色关系变化，客观陈述不评价\", \"facts\": [\"已确立事实1\", \"…3-6条\"]}",
			"facts 指：本章明确写出的、对后续有约束力的事实——人物当前状态、重要关系变化、地点与时间线、已落地或新增的伏笔线索、关键道具去向。",
			"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
		].join("\n"),
		user: body.replace(/^#\s+.*$/m, "").trim(),
		temperature: .2,
		maxTokens: Math.max(config.maxTokens, 5e3)
	}));
	const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 500) : "";
	const factLines = Array.isArray(raw.facts) ? raw.facts.filter((v) => typeof v === "string" && v.trim().length > 8).map((v) => v.trim().slice(0, 140)) : [];
	if (summary !== "") chapter.summary = summary;
	const list = project.facts ?? [];
	for (const line of factLines.slice(0, 8)) list.push({
		chapterNo,
		text: line
	});
	project.facts = list.slice(-300);
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	return {
		summary,
		factCount: factLines.length
	};
}
/**
* 伏笔落地标记：检查刚生成的章节正文是否埋下了 planned 伏笔（关键词匹配），
* 命中则将该伏笔标记为 planted 并记录 plantedChapter——保证暗线管理页与正文同步。
* 纯关键词粗匹配，宁缺毋滥：仅处理「描述含可辨识关键词」的伏笔，无把握则不标。
*/
function markForeshadowPlanted(project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) return 0;
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) return 0;
	let marked = 0;
	for (const f of project.foreshadows ?? []) {
		if (f.status !== "planned") continue;
		if (f.plantedChapter !== void 0) continue;
		const quoted = f.description.match(/[「“『《]([^」”』》]{2,12})[」”』》]/g);
		const keywords = (quoted !== null ? quoted : []).map((q) => q.slice(1, -1)).filter((k) => k.length >= 2);
		const nearTarget = f.targetChapter !== void 0 && Math.abs(f.targetChapter - chapterNo) <= 12;
		if (keywords.length === 0 && !nearTarget) continue;
		const hit = keywords.length === 0 ? false : keywords.some((k) => body.includes(k));
		if (hit || keywords.length === 0 && nearTarget) {
			if (hit) {
				f.status = "planted";
				f.plantedChapter = chapterNo;
				marked++;
			}
		}
	}
	if (marked > 0) {
		project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		saveProject(outputDir, project);
	}
	return marked;
}
/**
* 抽取本章「已确立事实」追加到事实库/时间线（最多 300 条，最新优先）。
* 事实注入后续章节生成提示词，保证人物状态/境界/资源/关系长期一致。
* @returns 新增事实条数（失败返回 0，调用方 best-effort）。
*/
async function extractFacts(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) return 0;
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) return 0;
	const lines = (await complete(ctx, config, {
		system: [
			"你是一位网文编辑。请从本章正文中抽取「已确立事实」，供后续章节保持一致。",
			"事实指：人物当前状态（境界/修为/伤势/资源/心境）、重要关系变化、地点与时间线、已落地或新增的伏笔线索、关键道具去向。",
			"要求：",
			"1. 只抽取本章明确写出的、对后续有约束力的内容；纯心理活动与无关细节不要。",
			"2. 每行一条事实，用客观陈述句，不含主观评价。",
			"3. 输出 3-6 条，每行一条，不要编号、不要前缀、不要解释。"
		].join("\n"),
		user: body.replace(/^#\s+.*$/m, "").trim(),
		temperature: .2,
		maxTokens: Math.max(config.maxTokens, 4e3)
	})).split("\n").map((line) => line.replace(/^[-*\d.\s]+/, "").trim()).filter((line) => line.length > 8).slice(0, 8);
	if (lines.length === 0) return 0;
	const facts = project.facts ?? [];
	for (const line of lines) facts.push({
		chapterNo,
		text: line.slice(0, 140)
	});
	project.facts = facts.slice(-300);
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	return lines.length;
}
const AUDIT_BATCH_SIZE = 10;
/** 单批质检：设定 + 事实库 + 该批章节节选 → 矛盾清单。 */
async function auditBatch(ctx, config, project, outputDir, batch) {
	const system = [
		"你是一位严谨的网文连续性审校编辑。你会收到一本小说的设定圣经、事实库和一批章节正文节选。",
		"请找出这批章节中的一致性矛盾，例如：",
		"- 人物状态冲突：境界/修为/伤势/资源在同一章内或跨章前后矛盾。",
		"- 设定违背：正文与世界观规则、金手指规则、写作红线冲突。",
		"- 时间线错乱：事件顺序、时间跨度、地点移动不合逻辑。",
		"- 细节穿帮：人名/地名/物品/数字前后不一致。",
		"要求：",
		"1. 只报告有实质证据的矛盾，不要泛泛而谈写作质量问题。",
		"2. 每条必须定位到具体章节号。",
		"3. 输出必须是合法 JSON 数组，格式：[{\"chapterNo\": 章节号, \"severity\": \"high|medium|low\", \"item\": \"矛盾描述\", \"suggestion\": \"修改建议\"}]",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
	].join("\n");
	const factsBlock = (project.facts ?? []).slice(-60).map((f) => `[第${f.chapterNo}章] ${f.text}`).join("\n");
	const chapterBlocks = batch.map((c) => {
		const excerpt = (readChapterFile(outputDir, c) ?? "").replace(/^#\s+.*$/m, "").trim().slice(0, 700);
		return `【第${c.no}章《${c.title}》】\n${excerpt}`;
	}).join("\n\n");
	const parsed = parseJsonArray(await complete(ctx, config, {
		system,
		user: [
			"请对以下小说做一致性质检。",
			project.bible !== void 0 ? "设定圣经：\n" + [
				project.bible.worldRules.length > 0 ? `世界规则：\n${project.bible.worldRules.map((r) => `- ${r}`).join("\n")}` : "",
				project.bible.redLines.length > 0 ? `写作红线：\n${project.bible.redLines.map((r) => `- ${r}`).join("\n")}` : "",
				project.bible.characters.length > 0 ? `角色：\n${project.bible.characters.map((ch) => `- ${ch.name}（${ch.traits.join("、")}）`).join("\n")}` : ""
			].filter((s) => s !== "").join("\n") : "",
			factsBlock !== "" ? `已确立事实库：\n${factsBlock}` : "",
			`正文节选（每章前 700 字）：\n${chapterBlocks}`,
			"只输出 JSON 数组。"
		].filter((s) => s !== "").join("\n\n"),
		temperature: .2,
		maxTokens: Math.max(config.maxTokens, 12e3)
	}));
	const issues = [];
	for (const entry of parsed) {
		const item = typeof entry.item === "string" ? entry.item : "";
		if (item === "") continue;
		issues.push({
			chapterNo: Number(entry.chapterNo) || 0,
			severity: [
				"high",
				"medium",
				"low"
			].includes(entry.severity) ? entry.severity : "medium",
			item,
			suggestion: typeof entry.suggestion === "string" ? entry.suggestion : ""
		});
	}
	return issues;
}
/** 全书一致性质检：LLM 分批扫描已生成章节 + 设定 + 事实库，聚合矛盾清单。 */
async function auditBook(ctx, config, project, outputDir, onProgress) {
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating");
	if (written.length === 0) {
		onProgress?.(0, 0);
		return [];
	}
	const totalBatches = Math.ceil(written.length / AUDIT_BATCH_SIZE);
	const all = [];
	onProgress?.(0, totalBatches);
	for (let i = 0; i < written.length; i += AUDIT_BATCH_SIZE) {
		const batch = written.slice(i, i + AUDIT_BATCH_SIZE);
		try {
			all.push(...await auditBatch(ctx, config, project, outputDir, batch));
		} catch {}
		onProgress?.(Math.min(Math.ceil((i + AUDIT_BATCH_SIZE) / AUDIT_BATCH_SIZE), totalBatches), totalBatches);
	}
	return all.slice(0, 50);
}
/** 小说简介：AI 生成或按已写开头补全（面向读者的作品门面）。 */
async function generateBlurb(ctx, config, project, partial = "") {
	const system = [
		"你是一位网文平台编辑，擅长写抓人的作品简介。",
		"要求：",
		"1. 120-250 字，突出核心卖点（金手指/题材/爽点/人设反差），用一两句抛出开局钩子。",
		"2. 不剧透结局与关键反转；语气贴合题材（热血/悬疑/轻松/虐心）。",
		"3. 中文，直接输出简介正文，不要 Markdown、不要引号包裹、不要「简介：」前缀。"
	].join("\n");
	const genreBlock = project.bible?.genre !== void 0 ? `题材：${project.bible.genre}` : "";
	const volumeBlock = (project.volumes ?? []).slice(0, 3).map((v) => v.title).join("、");
	return (await complete(ctx, config, {
		system,
		user: [
			`书名：《${project.bookName}》`,
			genreBlock,
			volumeBlock !== "" ? `卷结构：${volumeBlock}` : "",
			`已写章节数：${project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating").length}`,
			"大纲节选：\n" + project.outline.slice(0, 2500),
			partial.trim() !== "" ? `已有开头草稿（请保留其内容与语气，续写补全为完整简介）：\n${partial.trim()}` : "请全量生成一份完整简介。"
		].filter((s) => s !== "").join("\n\n"),
		temperature: .7,
		maxTokens: Math.max(config.maxTokens, 4e3),
		reasoning: config.analysisReasoning ?? "low"
	})).replace(/^["'「『]|["'」』]$/g, "").replace(/^简介[：:]\s*/, "").trim().slice(0, 600);
}
/**
* 组装全书上下文包（AI 助手 book_overview 工具）。
* 分片策略：章节要点默认只给最近 30 章（避免超长后爆上下文）；
* scope='full' 全量；scope=数字 只给该卷章节。
*/
function bookOverview(project, scope = "recent") {
	const s = [];
	s.push(`书名：${project.bookName}`);
	s.push(`【大纲全文】\n${project.outline}`);
	if (project.bible !== void 0) {
		const bible = project.bible;
		s.push("【设定圣经】");
		if (bible.genre !== "") s.push(`题材基调：${bible.genre}`);
		if (bible.worldRules.length > 0) s.push("世界规则：\n" + bible.worldRules.map((r) => `- ${r}`).join("\n"));
		if (bible.characters.length > 0) {
			s.push("角色卡：");
			for (const card of bible.characters) {
				const roleName = {
					protagonist: "主角",
					supporting: "配角",
					antagonist: "反派",
					other: "其他"
				}[card.role];
				s.push(`- ${card.name}（${roleName}）：${card.traits.join("、")}${card.goals !== "" ? `；目标：${card.goals}` : ""}${card.relations !== "" ? `；关系：${card.relations}` : ""}`);
			}
		}
		if (bible.redLines.length > 0) s.push("写作红线：\n" + bible.redLines.map((r) => `- ${r}`).join("\n"));
		if (bible.style.length > 0) s.push("风格要求：\n" + bible.style.map((r) => `- ${r}`).join("\n"));
	}
	const worldBlock = renderWorld(project.world);
	if (worldBlock !== "") s.push(worldBlock);
	if (project.volumes !== void 0 && project.volumes.length > 0) {
		s.push("【卷结构】");
		for (const v of project.volumes) s.push(`第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`);
	}
	if (project.chapters.length > 0) {
		const maxNo = project.chapters.reduce((m, c) => Math.max(m, c.no), 0);
		const shown = project.chapters.filter((c) => {
			if (scope === "full") return true;
			if (typeof scope === "number") return c.volume === scope;
			return c.no > Math.max(0, maxNo - 30);
		});
		const label = scope === "full" ? "全部章节（标题/状态/剧情要点/摘要）" : typeof scope === "number" ? `第 ${scope} 卷章节（标题/状态/剧情要点/摘要）` : `最近 ${shown.length} 章（标题/状态/剧情要点/摘要）`;
		s.push(`【${label}】`);
		const statusText = {
			pending: "待生成",
			generating: "生成中",
			written: "待审稿",
			reviewing: "审稿中",
			approved: "已通过",
			rejected: "待修订",
			error: "失败"
		};
		for (const c of shown) s.push(`第${c.no}章《${c.title}》[${statusText[c.status] ?? c.status}]${c.chars !== void 0 ? ` ${c.chars}字` : ""}\n剧情要点：${c.beats}\n摘要：${c.summary ?? "无"}`);
		if (scope !== "full" && project.chapters.length > shown.length) s.push(`（还有 ${project.chapters.length - shown.length} 章未列出，可用 scope=volume:N 查看指定卷）`);
	}
	if ((project.facts ?? []).length > 0) {
		s.push("【事实库（最近 40 条；更多用 facts_query 检索）】");
		for (const f of (project.facts ?? []).slice(-40)) s.push(`- [第${f.chapterNo}章] ${f.text}`);
	}
	if (project.foreshadows.length > 0) {
		s.push("【伏笔】");
		for (const f of project.foreshadows) s.push(`- [${f.status}] ${f.description}${f.targetChapter !== void 0 ? `（预计 ${f.targetChapter} 章回收）` : ""}`);
	}
	if (project.blurb !== void 0 && project.blurb !== "") s.push(`【小说简介】${project.blurb}`);
	return s.join("\n\n");
}
/**
* 影响分析：LLM 扫描全书（大纲/设定/大世界/事实库/已写章节），
* 定位一次改动波及的所有位置。助手在修改后主动调用，做连锁维护。
*/
async function analyzeImpact(ctx, config, project, outputDir, change) {
	const system = [
		"你是一位网文一致性审校。作者要做一处修改，请找出这次改动会波及的所有位置（设定、大纲、已写章节正文、事实库、简介中可能因此过时或矛盾的内容）。",
		"输出必须是合法 JSON 数组，格式：[{\"location\": \"位置（第N章/大纲/设定圣经-世界规则/大世界-境界/事实库/简介）\", \"quote\": \"原文片段（20-60字）\", \"suggestion\": \"修改建议\", \"kind\": \"must|optional|note\"}]",
		"kind 含义：must=必须同步改否则矛盾；optional=建议改（影响观感）；note=备注（如旧称保留为古称、或无需改但需知晓）。",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating");
	const base = [
		`要做的修改：${change}`,
		"以下为全书设定与规则要点（章节为分批节选）：",
		`大纲节选：\n${project.outline.slice(0, 2e3)}`,
		project.bible !== void 0 ? `道藏：${project.bible.worldRules.length} 条世界规则 / ${project.bible.redLines.length} 条红线 / 人物 ${project.bible.characters.map((c) => c.name).join("、")}` : "",
		(project.facts ?? []).length > 0 ? `编年录最近 40 条：\n${(project.facts ?? []).slice(-40).map((f) => `[第${f.chapterNo}章] ${f.text}`).join("\n")}` : ""
	].filter((s) => s !== "").join("\n\n");
	const items = [];
	const IMPACT_BATCH_SIZE = 8;
	for (let i = 0; i < written.length; i += IMPACT_BATCH_SIZE) {
		const batch = written.slice(i, i + IMPACT_BATCH_SIZE);
		const chapterBlock = batch.map((c) => {
			const excerpt = (readChapterFile(outputDir, c) ?? "").replace(/^#\s+.*$/m, "").trim().slice(0, 500);
			return `【第${c.no}章《${c.title}》】\n${excerpt}`;
		}).join("\n\n");
		const user = `${base}\n\n本批章节（第 ${batch[0].no}-${batch[batch.length - 1].no} 章）：\n${chapterBlock}\n\n只输出 JSON 数组。`;
		try {
			const text = await complete(ctx, config, {
				system,
				user,
				temperature: .2,
				maxTokens: Math.max(config.maxTokens, 12e3)
			});
			for (const entry of parseJsonArray(text)) {
				const quote = typeof entry.quote === "string" ? entry.quote.trim() : "";
				if (quote === "") continue;
				items.push({
					location: typeof entry.location === "string" ? entry.location : "未定位",
					quote: quote.slice(0, 120),
					suggestion: typeof entry.suggestion === "string" ? entry.suggestion : "",
					kind: entry.kind === "must" || entry.kind === "optional" || entry.kind === "note" ? entry.kind : "optional"
				});
			}
		} catch {}
	}
	return items.slice(0, 30);
}
/** 把大世界结构化数据渲染成提示词块（境界体系按顺序强约束）。 */
function renderWorld(world) {
	if (world === void 0) return "";
	const sections = ["==================== 大世界（结构化设定，写作时严格遵守） ===================="];
	if (world.realms.length > 0) {
		sections.push("境界体系（由低到高，不得随意跳级或自创境界）：");
		world.realms.forEach((realm, i) => {
			sections.push(`${i + 1}. ${realm.name}${realm.description !== "" ? ` — ${realm.description}` : ""}`);
		});
	}
	if (world.regions.length > 0) {
		sections.push("地理区域：");
		for (const region of world.regions) sections.push(`- ${region.name}${region.description !== "" ? `：${region.description}` : ""}${region.faction !== void 0 && region.faction !== "" ? `（势力：${region.faction}）` : ""}`);
	}
	if (world.factions.length > 0) {
		sections.push("势力分布：");
		for (const faction of world.factions) sections.push(`- ${faction.name}（${faction.kind}）${faction.description !== "" ? `：${faction.description}` : ""}${faction.region !== void 0 && faction.region !== "" ? `（驻地：${faction.region}）` : ""}`);
	}
	return sections.join("\n");
}
/** AI 提炼大世界：从大纲 + 设定圣经生成结构化境界体系/区域/势力。 */
async function extractWorld(ctx, config, project) {
	const system = [
		"你是一位网文世界观架构师。请根据小说大纲与设定圣经，提炼结构化「大世界」数据。",
		"输出必须是合法 JSON 对象：",
		"{\"realms\": [{\"name\": \"境界名\", \"description\": \"突破条件/寿命/标志等\"}], \"regions\": [{\"name\": \"区域名\", \"description\": \"描述\", \"faction\": \"关联势力名或空\"}], \"factions\": [{\"name\": \"势力名\", \"kind\": \"宗门/家族/王朝/组织等\", \"description\": \"描述\", \"region\": \"驻地区域或空\"}]}",
		"要求：",
		"1. realms 按由低到高顺序排列（修仙题材必须含完整境界链；无境界设定的题材可输出空数组）。",
		"2. 数量贴合大纲：realms 3-12 个，regions 2-10 个，factions 2-10 个。",
		"3. 内容严格来自大纲与设定圣经，不要凭空发明与大纲冲突的设定。",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
	].join("\n");
	const bibleBlock = project.bible !== void 0 ? [project.bible.genre !== "" ? `题材：${project.bible.genre}` : "", project.bible.worldRules.length > 0 ? `世界规则：\n${project.bible.worldRules.map((r) => `- ${r}`).join("\n")}` : ""].filter((s) => s !== "").join("\n") : "";
	const raw = parseJsonObject(await complete(ctx, config, {
		system,
		user: [
			"请为这部小说提炼大世界数据。",
			`书名：《${project.bookName}》`,
			bibleBlock !== "" ? bibleBlock : "",
			"大纲：\n" + project.outline.slice(0, 5e3),
			"只输出 JSON 对象。"
		].filter((s) => s !== "").join("\n\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 12e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const str = (value) => typeof value === "string" ? value.trim() : "";
	const objArray = (value) => Array.isArray(value) ? value.filter((v) => typeof v === "object" && v !== null) : [];
	return {
		realms: objArray(raw.realms).map((entry) => ({
			name: str(entry.name).slice(0, 20) || "未命名境界",
			description: str(entry.description).slice(0, 200)
		})).filter((r) => r.name !== "未命名境界" || r.description !== ""),
		regions: objArray(raw.regions).map((entry) => ({
			name: str(entry.name).slice(0, 30) || "未命名区域",
			description: str(entry.description).slice(0, 200),
			faction: str(entry.faction).slice(0, 30)
		})).filter((r) => r.name !== "未命名区域" || r.description !== ""),
		factions: objArray(raw.factions).map((entry) => ({
			name: str(entry.name).slice(0, 30) || "未命名势力",
			kind: str(entry.kind).slice(0, 20) || "组织",
			description: str(entry.description).slice(0, 200),
			region: str(entry.region).slice(0, 30)
		})).filter((f) => f.name !== "未命名势力" || f.description !== "")
	};
}
/**
* 事实库回填：对历史已生成章节批量抽取事实（无事实记录的旧章节）。
* @returns 回填的章节数。
*/
async function backfillFacts(ctx, config, project, outputDir) {
	const have = new Set((project.facts ?? []).map((f) => f.chapterNo));
	let filled = 0;
	for (const chapter of project.chapters) {
		if (chapter.status === "pending" || chapter.status === "generating") continue;
		if (chapter.file === void 0 || have.has(chapter.no)) continue;
		try {
			if (await extractFacts(ctx, config, project, outputDir, chapter.no) > 0) filled++;
		} catch {}
		have.add(chapter.no);
	}
	return filled;
}
/**
* 角色卡刷新：出场统计由服务端从正文精确计算（角色名出现过的章节数、
* 最近出现章节），LLM 只负责聚合「当前状态」一句话。
*/
async function refreshCharacters(ctx, config, project, outputDir) {
	const roster = (((project.roles ?? []).length > 0 ? project.roles : project.bible?.characters) ?? []).map((r) => ({
		name: r.name,
		traits: r.traits ?? [],
		role: r.roleLabel !== void 0 ? r.roleLabel : r.role ?? "other"
	}));
	const facts = project.facts ?? [];
	if (roster.length === 0 && facts.length === 0) return [];
	const stat = /* @__PURE__ */ new Map();
	const known = roster.map((card) => card.name);
	for (const chapter of project.chapters) {
		if (chapter.status === "pending" || chapter.status === "generating") continue;
		const body = readChapterFile(outputDir, chapter);
		if (body === void 0) continue;
		for (const name of known) if (body.includes(name)) {
			const entry = stat.get(name) ?? {
				chapters: /* @__PURE__ */ new Set(),
				last: 0
			};
			entry.chapters.add(chapter.no);
			if (chapter.no > entry.last) entry.last = chapter.no;
			stat.set(name, entry);
		}
	}
	let statuses = /* @__PURE__ */ new Map();
	if (facts.length > 0) {
		const system = [
			"你是一位网文角色档案管理员。请根据「角色名单」与「已确立事实库」，为每个角色输出「当前状态」一句话（境界/修为/伤势/资源/心境）。",
			"输出必须是合法 JSON 数组，格式：[{\"name\": \"角色名\", \"status\": \"当前状态一句话\"}]",
			"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
		].join("\n");
		const rosterBlock = roster.map((ch) => `- ${ch.name}（${ch.traits.join("、")}）`).join("\n");
		const factsBlock = facts.map((f) => `[第${f.chapterNo}章] ${f.text}`).join("\n");
		const user = [
			`角色名单：\n${rosterBlock}`,
			`已确立事实库（${facts.length} 条）：\n${factsBlock.slice(-6e3)}`,
			"只输出 JSON 数组。"
		].join("\n\n");
		try {
			const text = await complete(ctx, config, {
				system,
				user,
				temperature: .2,
				maxTokens: Math.max(config.maxTokens, 8e3)
			});
			for (const entry of parseJsonArray(text)) {
				const name = typeof entry.name === "string" ? entry.name : "";
				if (name !== "" && typeof entry.status === "string") statuses.set(name, entry.status);
			}
		} catch {}
	}
	const cards = [];
	const roleOf = (name) => roster.find((c) => c.name === name)?.role ?? "other";
	for (const card of roster) {
		const entry = stat.get(card.name);
		cards.push({
			name: card.name,
			role: card.role,
			status: statuses.get(card.name) ?? "",
			lastChapter: entry?.last ?? 0,
			appearances: entry?.chapters.size ?? 0
		});
	}
	for (const [name, entry] of stat) if (!cards.some((c) => c.name === name)) cards.push({
		name,
		role: roleOf(name),
		status: statuses.get(name) ?? "",
		lastChapter: entry.last,
		appearances: entry.chapters.size
	});
	return cards;
}
/** System prompt for foreshadow suggestions. */
function foreshadowSystemPrompt() {
	return [
		"你是一位网文伏笔设计师。你会收到大纲和已写的章节信息，请为小说建议 3-8 条值得埋设的伏笔。",
		"要求：",
		"1. 伏笔必须有明确的回收价值（推动主线、人物弧光、世界观揭秘）。",
		"2. 描述要具体，指出埋设章节与预计回收章节（可空缺）。",
		"3. 优先从大纲的暗线（如记忆代价、残片收集、身世谜团）中提炼。",
		"输出必须是合法 JSON 数组：",
		"[{\"description\": \"伏笔描述\", \"plantedChapter\": 章节号或null, \"targetChapter\": 章节号或null}]",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
	].join("\n");
}
/** Suggest foreshadows from the outline + plan. */
async function suggestForeshadows(ctx, config, project) {
	const user = [
		"请为下面这部小说设计伏笔。",
		`大纲：\n${project.outline}`,
		`已规划章节数：${project.chapters.length}`
	].join("\n");
	const parsed = parseJsonArray(await complete(ctx, config, {
		system: foreshadowSystemPrompt(),
		user,
		temperature: .5,
		maxTokens: Math.max(config.maxTokens, 12e3),
		reasoning: config.analysisReasoning ?? "low"
	}));
	const existing = new Set(project.foreshadows.map((f) => f.description));
	const created = [];
	for (const entry of parsed) {
		if (typeof entry !== "object" || entry === null) continue;
		const description = typeof entry.description === "string" ? entry.description.trim() : "";
		if (description === "" || existing.has(description)) continue;
		existing.add(description);
		created.push({
			id: `fs-${Date.now().toString(36)}-${created.length}`,
			description: description.slice(0, 200),
			plantedChapter: typeof entry.plantedChapter === "number" ? entry.plantedChapter : void 0,
			targetChapter: typeof entry.targetChapter === "number" ? entry.targetChapter : void 0,
			status: "planned"
		});
	}
	project.foreshadows.push(...created);
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	return created;
}
/**
* 写法引擎：从样本文本提取一份写法资产（叙事风格规则）。
* @returns 提取出的风格规则（未持久化，由调用方存入 project.assets）。
*/
async function extractStyleAsset(ctx, config, sampleText) {
	const user = `请分析下面这段样本文本，提炼其叙事风格规则：\n\n${sampleText}`;
	const raw = parseJsonObject(await complete(ctx, config, {
		system: styleEngineSystemPrompt(),
		user,
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 12e3)
	}));
	const strArray = (value) => Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim() !== "") : [];
	const result = {
		proseRules: strArray(raw.proseRules),
		dialogueRules: strArray(raw.dialogueRules),
		descriptionRules: strArray(raw.descriptionRules),
		boundaries: strArray(raw.boundaries)
	};
	if (result.proseRules.length + result.dialogueRules.length + result.descriptionRules.length + result.boundaries.length === 0) throw new Error("写法提取失败：模型没有返回有效规则");
	return result;
}
/** Export the whole book as one txt/md file. */
function exportBook(outputDir, project, format) {
	const parts = [];
	if (format === "md") parts.push(`# ${project.bookName}\n`);
	else parts.push(project.bookName, "");
	const done = project.chapters.filter((c) => c.file !== void 0);
	for (const chapter of done) {
		const body = readChapterFile(outputDir, chapter) ?? "";
		if (format === "md") parts.push(`\n## 第${chapter.no}章 ${chapter.title}\n`, body.trim(), "");
		else parts.push("", `第${chapter.no}章 ${chapter.title}`, "", body.trim(), "");
	}
	const content = parts.join("\n");
	const ext = format === "md" ? "md" : "txt";
	const file = `《${safeFileName(project.bookName)}》全本.${ext}`;
	writeFileSync(join(outputDir, file), content, "utf8");
	return {
		file,
		chars: content.length,
		chapters: done.length
	};
}
//#endregion
//#region src/bookshelf.ts
/**
* 书架（Bookshelf）— 多书管理：一本书记录一个独立输出目录。
* 状态持久化到 ~/.dsh/dsh-novel-forge-bookshelf.json（跟随 dsh 配置惯例）。
*/
/** 书架配置文件路径。 */
function bookshelfFile() {
	return join(homedir(), ".dsh", "dsh-novel-forge-bookshelf.json");
}
function defaultStore() {
	return {
		books: [],
		activeBookId: null
	};
}
/** 读取书架（无则返回空）。 */
function loadBookshelf() {
	const file = bookshelfFile();
	if (!existsSync(file)) return defaultStore();
	try {
		let raw = readFileSync(file, "utf8");
		if (raw.charCodeAt(0) === 65279) raw = raw.slice(1);
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed.books)) return defaultStore();
		return {
			books: parsed.books,
			activeBookId: parsed.activeBookId ?? null
		};
	} catch {
		return defaultStore();
	}
}
/** 持久化书架。 */
function saveBookshelf(store) {
	const file = bookshelfFile();
	mkdirSync(join(homedir(), ".dsh"), { recursive: true });
	writeFileSync(file, JSON.stringify(store, null, 2), "utf8");
}
/** 当前激活的书。 */
function activeBook(store) {
	return store.books.find((b) => b.id === store.activeBookId);
}
/** 书架快照（含每本书的进度摘要）。 */
function bookshelfSnapshot(store) {
	return {
		books: store.books.map((book) => {
			const project = loadProject(book.outputDir);
			const done = project === void 0 ? 0 : project.chapters.filter((c) => c.status === "approved" || c.status === "written" || c.status === "rejected").length;
			const hasCover = project?.coverPath !== void 0 && project.coverPath !== "" && existsSync(join(book.outputDir, project.coverPath));
			return {
				...book,
				done,
				total: project?.chapters.length ?? 0,
				hasProject: project !== void 0,
				hasCover,
				blurb: project?.blurb
			};
		}),
		activeBookId: store.activeBookId
	};
}
/** 新建一本书（自动成为当前书）。 */
function createBook(bookName, outputDir) {
	const store = loadBookshelf();
	const id = `book-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const book = {
		id,
		bookName,
		outputDir,
		createdAt: now,
		updatedAt: now
	};
	store.books.push(book);
	store.activeBookId = id;
	saveBookshelf(store);
	return book;
}
/** 更新某本书的书名（开书向导导入大纲后书名以大纲首行为准）。 */
function renameBook(id, bookName) {
	const store = loadBookshelf();
	const book = store.books.find((b) => b.id === id);
	if (book === void 0) return false;
	book.bookName = bookName;
	book.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveBookshelf(store);
	return true;
}
/**
* 播种：书架为空时，把指定输出目录下已有的项目自动登记为第一本书。
* 兼容升级场景 —— 旧版插件直接在输出目录写项目，从未登记书架。
* @param outputDir - 候选输出目录（通常为 settings 的默认输出目录）。
* @returns 是否发生了播种。
*/
function seedBookshelfFromOutputDir(outputDir) {
	if (loadBookshelf().books.length > 0) return false;
	if (!existsSync(outputDir)) return false;
	const hasProject = existsSync(join(outputDir, "novel-project.json"));
	const hasChapters = existsSync(outputDir);
	if (!hasProject && !hasChapters) return false;
	createBook(loadProject(outputDir)?.bookName ?? outputDir.split(/[\\/]/).pop() ?? "未命名小说", outputDir);
	return true;
}
/** 导入已有项目目录到书架：校验 novel-project.json，已存在则直接激活。 */
function importDir(outputDir) {
	const project = loadProject(outputDir);
	if (project === void 0) throw new Error(`目录中未找到有效的 novel-project.json：${outputDir}`);
	const store = loadBookshelf();
	const existed = store.books.find((b) => b.outputDir === outputDir);
	if (existed !== void 0) {
		store.activeBookId = existed.id;
		saveBookshelf(store);
		return {
			book: existed,
			existed: true
		};
	}
	return {
		book: createBook(project.bookName !== "" ? project.bookName : outputDir.split(/[\\/]/).pop() ?? "未命名小说", outputDir),
		existed: false
	};
}
/** 激活一本书。 */
function activateBook(id) {
	const store = loadBookshelf();
	const book = store.books.find((b) => b.id === id);
	if (book === void 0) return void 0;
	store.activeBookId = id;
	book.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveBookshelf(store);
	return book;
}
/** 移除一本书。 */
function removeBook(id) {
	const store = loadBookshelf();
	const idx = store.books.findIndex((b) => b.id === id);
	if (idx === -1) return false;
	store.books.splice(idx, 1);
	if (store.activeBookId === id) store.activeBookId = store.books[0]?.id ?? null;
	saveBookshelf(store);
	return true;
}
/** 当前书输出目录（无书架则 undefined，回退 settings）。 */
function activeBookOutputDir() {
	return activeBook(loadBookshelf())?.outputDir;
}
/** 默认输出目录推断：~/.dsh/novels/书名。 */
function defaultOutputDirFor(bookName) {
	const clean = bookName.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 40) || "未命名小说";
	return join(homedir(), ".dsh", "novels", clean);
}
//#endregion
//#region src/run.ts
/**
* 生产单（Production Run）：批量章节生产的标准执行器。
* 职责：计划补足 → 逐章生成（完整质量门）→ 被拒分级处理（豁免/修订+验证/待人工）→ 断点续跑。
* 与路由层解耦：只依赖 engine 导出函数与磁盘状态，自身不碰 HTTP。
* 串行纪律：单例执行器 + working 锁；每章重新从磁盘加载，写前合并易变字段。
*/
/** 生产单 checkpoint 文件名（放在书目录下）。 */
function runStateFile(outputDir) {
	return join(outputDir, "run-state.json");
}
var ProductionRunner = class {
	deps;
	state = null;
	working = false;
	pauseRequested = false;
	stopRequested = false;
	/** 生产单绑定目录（start 时快照；所有读写固定用它，防止运行中切书导致写错目录）。 */
	bookDir = null;
	constructor(deps) {
		this.deps = deps;
	}
	/** 当前生产单状态（内存优先；web 重启后从磁盘恢复）。 */
	status() {
		if (this.state !== null) return this.state;
		const candidates = [this.deps.getConfig().outputDir];
		const bookshelf = loadBookshelf();
		for (const b of bookshelf.books) if (!candidates.includes(b.outputDir)) candidates.push(b.outputDir);
		for (const outputDir of candidates) {
			const file = runStateFile(outputDir);
			if (!existsSync(file)) continue;
			try {
				const raw = readFileSync(file, "utf8");
				const parsed = JSON.parse(raw);
				if (parsed?.runId === void 0) continue;
				if (parsed.status === "running") parsed.status = "paused";
				this.state = parsed;
				this.bookDir = outputDir;
				return this.state;
			} catch {}
		}
		return null;
	}
	persist() {
		if (this.state === null) return;
		const outputDir = this.bookDir ?? this.deps.getConfig().outputDir;
		mkdirSync(outputDir, { recursive: true });
		writeFileSync(runStateFile(outputDir), JSON.stringify(this.state, null, 2), "utf8");
	}
	log(text) {
		if (this.state === null) return;
		this.state.log.push({
			at: (/* @__PURE__ */ new Date()).toISOString(),
			text
		});
		if (this.state.log.length > 300) this.state.log = this.state.log.slice(-300);
		this.state.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	}
	/** 启动/续跑生产单：startNo..endNo 区间，endNo 超出计划时先自动补计划。 */
	async start(startNo, endNo) {
		const config = this.deps.getConfig();
		if (this.working) throw new Error("生产单正在运行中，请先暂停或停止");
		let project = loadProject(config.outputDir);
		if (project === void 0) throw new Error("输出目录中没有项目");
		if (endNo > project.chapters.length) {
			const need = endNo - project.chapters.length;
			this.log(`计划不足，追加 ${need} 章计划…`);
			const chapters = await planChapters(this.deps.ctx, config, project, need, void 0, config.outputDir);
			mergeVolatileFromDisk(config.outputDir, project);
			project.chapters.push(...chapters);
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			this.log(`计划已追加，全书 ${project.chapters.length} 章`);
		}
		this.state = {
			runId: `run-${Date.now().toString(36)}`,
			startNo,
			endNo,
			status: "running",
			currentNo: startNo,
			stats: {
				generated: 0,
				revised: 0,
				exempted: 0,
				regenerated: 0,
				error: 0
			},
			pendingManual: [],
			log: [],
			startedAt: (/* @__PURE__ */ new Date()).toISOString(),
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		this.pauseRequested = false;
		this.stopRequested = false;
		this.bookDir = config.outputDir;
		this.working = true;
		this.persist();
		this.loop();
		return this.state;
	}
	pause() {
		this.pauseRequested = true;
	}
	resume() {
		if (this.state === null || this.state.status !== "paused") return;
		this.state.status = "running";
		this.working = true;
		this.pauseRequested = false;
		this.stopRequested = false;
		this.persist();
		this.loop();
	}
	stop() {
		this.stopRequested = true;
	}
	/** 主循环：从 currentNo 扫描到 endNo，逐章处理；支持暂停/停止。 */
	async loop() {
		const config = this.deps.getConfig();
		const outputDir = this.bookDir ?? config.outputDir;
		try {
			while (this.state !== null) {
				if (this.stopRequested) {
					this.stopRequested = false;
					this.state.status = "stopped";
					this.log("生产单已停止");
					this.persist();
					break;
				}
				if (this.pauseRequested) {
					this.pauseRequested = false;
					this.state.status = "paused";
					this.log("生产单已暂停（随时可继续）");
					this.persist();
					break;
				}
				const project = loadProject(outputDir);
				if (project === void 0) {
					this.state.status = "error";
					this.state.error = "项目丢失";
					this.persist();
					break;
				}
				let next;
				for (let no = this.state.currentNo; no <= this.state.endNo; no++) {
					const ch = project.chapters.find((c) => c.no === no);
					if (ch === void 0) continue;
					if (ch.status === "approved") {
						this.state.currentNo = no;
						continue;
					}
					next = ch;
					break;
				}
				if (next === void 0) {
					this.state.status = "done";
					this.log(`生产单完成：${this.state.startNo}-${this.state.endNo} 章处理完毕`);
					this.persist();
					break;
				}
				this.state.currentNo = next.no;
				await this.processChapter(project, next);
				this.persist();
			}
		} catch (error) {
			if (this.state !== null) {
				this.state.status = "error";
				this.state.error = error.message;
				this.log(`生产单异常：${error.message}`);
				this.persist();
			}
		} finally {
			this.working = false;
		}
	}
	async processChapter(project, chapter) {
		if (chapter.status === "pending" || chapter.status === "error" || chapter.status === "written") await this.produce(project, chapter);
		else if (chapter.status === "rejected") await this.handleRejected(project, chapter);
		else if (chapter.status === "generating") {
			chapter.status = "pending";
			await this.produce(project, chapter);
		}
	}
	/** 完整质量门：生成 → 摘要+事实 → 伏笔标记 → 审稿 → 作者复盘。 */
	async produce(project, chapter) {
		const { ctx, getConfig } = this.deps;
		const config = getConfig();
		const outputDir = this.bookDir ?? config.outputDir;
		const no = chapter.no;
		const wasError = chapter.status === "error";
		chapter.status = "generating";
		chapter.error = void 0;
		chapter.generatingAt = (/* @__PURE__ */ new Date()).toISOString();
		mergeVolatileFromDisk(outputDir, project);
		saveProject(outputDir, project);
		this.log(wasError ? `第${no}章《${chapter.title}》重新生成…` : `第${no}章《${chapter.title}》生成…`);
		try {
			for await (const step of generateChapterStream(ctx, config, project, outputDir, no));
			try {
				await summarizeAndExtractFacts(ctx, config, project, outputDir, no);
			} catch (e) {
				console.warn("[dsh-novel-forge] run summary/facts:", e.message);
			}
			try {
				markForeshadowPlanted(project, outputDir, no);
			} catch (e) {
				console.warn("[dsh-novel-forge] run foreshadow:", e.message);
			}
			if (config.autoReview ?? true) {
				const report = await reviewChapter(ctx, config, project, outputDir, no);
				if (this.state !== null) this.state.stats[wasError ? "regenerated" : "generated"]++;
				this.log(`第${no}章 审稿 ${report.score}分 ${report.passed ? "✅ 通过" : "⚠️ 被拒"}`);
			} else {
				chapter.status = "approved";
				mergeVolatileFromDisk(outputDir, project);
				saveProject(outputDir, project);
			}
			if (config.autoAuthorReview ?? true) try {
				const body = readChapterFile(outputDir, chapter);
				if (body !== void 0) {
					let prevTail = "";
					if (no > 1) {
						const prev = project.chapters.find((c) => c.no === no - 1);
						if (prev !== void 0) prevTail = (readChapterFile(outputDir, prev) ?? "").replace(/^#.*$/m, "").trim().slice(-600);
					}
					const review = await authorReviewChapter(ctx, config, project, no, body, prevTail);
					chapter.authorReview = review;
					if (review.advancedLines !== void 0) autoLinkPlotlines(project, no, review.advancedLines);
					mergeVolatileFromDisk(outputDir, project);
					saveProject(outputDir, project);
				}
			} catch (e) {
				console.warn("[dsh-novel-forge] run author review:", e.message);
			}
		} catch (error) {
			chapter.status = "error";
			chapter.error = error.message;
			mergeVolatileFromDisk(outputDir, project);
			saveProject(outputDir, project);
			if (this.state !== null) this.state.stats.error++;
			this.log(`第${no}章 失败：${error.message}`);
		}
	}
	/** 被拒分级处理：无 high 豁免；有 high 按意见修订（最多 2 轮）+ 验证模式；仍不过 → 待人工。 */
	async handleRejected(project, chapter) {
		const { ctx, getConfig } = this.deps;
		const config = getConfig();
		const outputDir = this.bookDir ?? config.outputDir;
		const no = chapter.no;
		const highs = (chapter.review?.issues ?? []).filter((i) => i.severity === "high");
		if (highs.length === 0) {
			chapter.status = "approved";
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			if (this.state !== null) this.state.stats.exempted++;
			this.log(`第${no}章 豁免通过（无 high）`);
			return;
		}
		this.log(`第${no}章 修订（${highs.length} 个 high）…`);
		for (let round = 1; round <= 2; round++) {
			const instr = "按审稿意见修订（优先处理）：\n" + highs.map((h) => `[${h.severity}] ${h.item}${h.suggestion !== "" ? `\n建议：${h.suggestion}` : ""}`).join("\n\n");
			try {
				for await (const step of rewriteChapterStream(ctx, config, project, outputDir, no, instr, void 0));
			} catch (error) {
				this.log(`第${no}章 第${round}轮修订出错：${error.message}`);
				continue;
			}
			const fresh = loadProject(outputDir);
			const freshCh = fresh?.chapters.find((c) => c.no === no);
			const draft = freshCh?.pendingDraft;
			if (draft === void 0 || draft.length < 50) {
				this.log(`第${no}章 第${round}轮草稿缺失，重试`);
				continue;
			}
			const verify = await reviewChapterText(ctx, config, fresh, draft, chapter.review);
			const highs2 = (verify.issues ?? []).filter((i) => i.severity === "high");
			if (verify.passed || highs2.length === 0) {
				this.applyDraft(fresh, freshCh, draft, verify);
				if (this.state !== null) this.state.stats.revised++;
				this.log(`第${no}章 第${round}轮修订通过（${verify.score}分）`);
				return;
			}
			this.log(`第${no}章 第${round}轮仍不过（${highs2.length} high）`);
		}
		if (this.state !== null) this.state.pendingManual.push(no);
		this.log(`第${no}章 ⚠️ 两轮修订仍不过 → 保留草稿待人工`);
	}
	applyDraft(project, chapter, draft, report) {
		const config = this.deps.getConfig();
		const outputDir = this.bookDir ?? config.outputDir;
		const fileName = chapterFileName(chapter);
		mkdirSync(outputDir, { recursive: true });
		const targetPath = join(outputDir, fileName);
		if (existsSync(targetPath)) copyFileSync(targetPath, join(outputDir, `${fileName.replace(/\.md$/, "")}.bak.md`));
		writeFileSync(targetPath, `# 第${chapter.no}章 ${chapter.title}\n\n${draft}\n`, "utf8");
		chapter.pendingDraft = void 0;
		chapter.chars = draft.length;
		chapter.file = fileName;
		if (typeof report.score === "number") {
			chapter.review = report;
			chapter.status = report.passed === true ? "approved" : "rejected";
		} else {
			chapter.status = "written";
			chapter.review = void 0;
		}
		chapter.error = void 0;
		project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		saveProject(outputDir, project);
	}
};
//#endregion
//#region src/protocol.ts
/** The /api/dsh-novel-forge route family (same-origin, loopback-fenced). */
const NOVEL_API = {
	status: "/api/dsh-novel-forge/status",
	loadOutline: "/api/dsh-novel-forge/load-outline",
	saveOutline: "/api/dsh-novel-forge/save-outline",
	plan: "/api/dsh-novel-forge/plan",
	volumes: "/api/dsh-novel-forge/volumes",
	bible: "/api/dsh-novel-forge/bible",
	assets: "/api/dsh-novel-forge/assets",
	styleEngine: "/api/dsh-novel-forge/style-engine",
	generate: "/api/dsh-novel-forge/generate",
	review: "/api/dsh-novel-forge/review",
	rewrite: "/api/dsh-novel-forge/rewrite",
	polish: "/api/dsh-novel-forge/polish",
	/** 采纳待确认草稿（润色/重写产物）覆盖正文文件。 */
	draftApply: "/api/dsh-novel-forge/draft/apply",
	/** 放弃待确认草稿，保留原稿。 */
	draftDiscard: "/api/dsh-novel-forge/draft/discard",
	summary: "/api/dsh-novel-forge/summary",
	foreshadow: "/api/dsh-novel-forge/foreshadow",
	exportBook: "/api/dsh-novel-forge/export",
	chapter: "/api/dsh-novel-forge/chapter",
	/** 审查任意正文文本（作者手动编辑后，不落盘）。 */
	chapterCheck: "/api/dsh-novel-forge/chapter/check",
	/** 保存手动编辑的正文（自动备份 .bak）。 */
	chapterSave: "/api/dsh-novel-forge/chapter/save",
	assistant: "/api/dsh-novel-forge/assistant",
	assistantHistory: "/api/dsh-novel-forge/assistant-history",
	/** 清空助手对话记录。 */
	assistantClear: "/api/dsh-novel-forge/assistant/clear",
	bookshelf: "/api/dsh-novel-forge/bookshelf",
	/** 导入已有项目目录（含 novel-project.json）到书架。 */
	bookshelfImportDir: "/api/dsh-novel-forge/bookshelf/import-dir",
	/** 导入 txt/md 全本：拆章建项目并登记书架。 */
	bookshelfImportText: "/api/dsh-novel-forge/bookshelf/import-text",
	/** 导入 txt/md 全本：拆章预览（不落盘）。 */
	bookshelfImportTextPreview: "/api/dsh-novel-forge/bookshelf/import-text/preview",
	/** 漫剧方案管理：create/remove/activate。 */
	manhuaPlans: "/api/dsh-novel-forge/manhua/plans",
	/** 漫剧角色库：从分镜提名（规则+LLM两段式）/ 建卡 / 更新 / 删除 / 形象锚点 / 精修提示词。 */
	mangaRoles: "/api/dsh-novel-forge/manga/roles",
	/** 分镜·编剧级：单章 → 剧情骨架（节拍链）。 */
	storyboardSkeleton: "/api/dsh-novel-forge/storyboard/skeleton",
	/** 分镜·导演级：骨架 → 分镜表（镜头级）。 */
	storyboardTable: "/api/dsh-novel-forge/storyboard/table",
	/** 分镜·提示词级：分镜表 → 即梦可粘贴视频提示词。 */
	storyboardPrompts: "/api/dsh-novel-forge/storyboard/prompts",
	/** 生图接口连通性测试（设置页每个模型条目用）。 */
	imageTest: "/api/dsh-novel-forge/image-test",
	/** 重置项目（可选携带新大纲）：清空设定/卷/章节/伏笔/资产/事实库。 */
	reset: "/api/dsh-novel-forge/reset",
	/** 全书一致性质检：LLM 扫描已生成章节，输出矛盾问题清单。 */
	audit: "/api/dsh-novel-forge/audit",
	/** 角色卡刷新：基于事实库与各章摘要聚合角色当前状态。 */
	charactersRefresh: "/api/dsh-novel-forge/characters/refresh",
	/** 事实库回填：对历史已生成章节批量抽取事实（旧章节无事实记录时用）。 */
	factsBackfill: "/api/dsh-novel-forge/facts/backfill",
	/** 设定圣经局部修补（如世界观规则编辑）。 */
	biblePatch: "/api/dsh-novel-forge/bible/patch",
	/** 小说简介：生成（AI）/补全（AI）/保存。 */
	blurb: "/api/dsh-novel-forge/blurb",
	/** 重命名当前书（同步项目与书架条目）。 */
	rename: "/api/dsh-novel-forge/rename",
	/** 大世界：AI 提炼 / 保存结构化数据（境界/区域/势力）。 */
	world: "/api/dsh-novel-forge/world",
	/** 封面：GET 读取（dataUrl）/ POST 上传或移除。 */
	cover: "/api/dsh-novel-forge/blurb/cover",
	/** 剧情线管理：增删改 + 关联章节。 */
	plotlines: "/api/dsh-novel-forge/plotlines",
	/** 角色库：AI 提炼 / 采纳 / 更新 / 删除。 */
	roles: "/api/dsh-novel-forge/roles",
	scenes: "/api/dsh-novel-forge/scenes",
	visualRules: "/api/dsh-novel-forge/visual-rules",
	/** 作者复盘补跑：对已写章节补齐 authorReview（全书流式 / 单章 JSON）。 */
	reviewBackfill: "/api/dsh-novel-forge/review/backfill",
	/** 章节复位：generating 卡死 → pending（可重新生成）。 */
	chapterReset: "/api/dsh-novel-forge/chapter/reset",
	/** 章节直接通过：作者对 rejected/written 章节行使最终决定权。 */
	chapterApprove: "/api/dsh-novel-forge/chapter/approve",
	/** 敏感词检查：全书已写章节或指定文本。 */
	sensitiveCheck: "/api/dsh-novel-forge/sensitive-check",
	/** 开书想法 → AI 补全大纲：输入一句话想法，生成 2-3 个可选大纲方案。 */
	outlineSuggest: "/api/dsh-novel-forge/outline/suggest",
	/** 反推大纲：从已写章节正文反向生成全书总纲（NDJSON 流）。 */
	outlineReverse: "/api/dsh-novel-forge/outline/reverse",
	/** 拆书分析：对已写章节做结构/人物/文风/卖点四维体检（两阶段：源笔记→分节分析）。 */
	breakdown: "/api/dsh-novel-forge/breakdown",
	/** 漫剧分镜生成：章节 → 角色锚点 + 分镜表（可适配豆包/Seedance/SD）。 */
	/** 漫剧分集计划：读一卷 → 按故事弧线分集（高潮拆集/过渡并章）。 */
	/** 漫画脚本：章节 → 分页分格漫画脚本（含角色视觉锚点）。 */
	/** 生产单：启动批量生产（计划补足 + 逐章生成 + 被拒分级处理）。 */
	runStart: "/api/dsh-novel-forge/run/start",
	/** 生产单控制：pause / resume / stop。 */
	runControl: "/api/dsh-novel-forge/run/control",
	/** 生产单状态（含进度统计与日志）。 */
	runStatus: "/api/dsh-novel-forge/run/status",
	config: "/api/dsh-novel-forge/config",
	openFolder: "/api/dsh-novel-forge/open-folder",
	/** 作者资产库/总数据：读取个人跨书资产（笔法/红线/套路/角色模板/世界观模板）。 */
	authorAssets: "/api/dsh-novel-forge/author-assets",
	/** 作者资产库：新增/更新一条资产（upsert by id）。 */
	authorAssetsUpsert: "/api/dsh-novel-forge/author-assets/upsert",
	/** 作者资产库：删除一条资产。 */
	authorAssetsRemove: "/api/dsh-novel-forge/author-assets/remove",
	/** 作者资产库：导入默认（书架书的写作资产/角色 + 内置全局库）批量沉淀。 */
	authorAssetsImportDefault: "/api/dsh-novel-forge/author-assets/import-default",
	/** 改编模式：上传全文 → 分析 → 原文设定卡片/可改范围矩阵。 */
	adaptAnalyze: "/api/dsh-novel-forge/adapt/analyze",
	/** 改编模式：确认要改的维度 → 生成映射表/改编规则/联动影响清单。 */
	adaptPropose: "/api/dsh-novel-forge/adapt/propose",
	/** 改编模式：执行术语替换（全局替换 + 命中统计 + 改编文本预览）。 */
	adaptExecute: "/api/dsh-novel-forge/adapt/execute",
	/** 主题自定义背景：上传图片（POST，存盘并返回服务端 URL）。 */
	themeBackgroundUpload: "/api/dsh-novel-forge/theme/background",
	/** 主题自定义背景：读取已上传文件（GET prefix，/theme/background/<name>）。 */
	themeBackgroundGet: "/api/dsh-novel-forge/theme/background"
};
//#endregion
//#region src/docx.ts
/**
* docx outline extraction: a .docx is a zip whose word/document.xml holds the
* body text in <w:t> runs inside <w:p> paragraphs. We unzip with fflate and
* walk the XML with a tiny tokenizer — no heavyweight XML/DOM dependency.
*/
/** Decode the handful of XML entities docx bodies actually use. */
function decodeEntities(text) {
	return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}
/**
* Extract plain text from a docx buffer: one line per <w:p> paragraph, with
* <w:tab>/<w:br> preserved as whitespace. Tables and nested structures are
* flattened in document order (their paragraphs are just <w:p> too).
* @param buffer - the raw .docx bytes.
* @returns the body text.
*/
function extractDocxText(buffer) {
	let files;
	try {
		files = unzipSync(buffer);
	} catch (error) {
		throw new Error(`not a valid docx (zip open failed): ${error.message}`);
	}
	const document = files["word/document.xml"];
	if (document === void 0) throw new Error("not a valid docx (word/document.xml missing)");
	const xml = strFromU8(document);
	const paragraphs = [];
	const parts = xml.split(/<w:p\b[^>]*>/);
	for (let i = 1; i < parts.length; i++) {
		const segment = parts[i];
		const runs = [];
		for (const match of segment.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g)) if (match[0].startsWith("<w:tab")) runs.push("	");
		else if (match[0].startsWith("<w:br")) runs.push("\n");
		else runs.push(decodeEntities(match[1] ?? ""));
		const line = runs.join("").replace(/\u00a0/g, " ").trimEnd();
		paragraphs.push(line);
	}
	const text = paragraphs.join("\n").replace(/\n{3,}/g, "\n\n").trim();
	if (text.length === 0) throw new Error("docx contains no extractable text");
	return text;
}
/**
* Read and extract a docx outline from disk.
* @param path - absolute path to the .docx file.
* @returns the extracted outline text.
*/
function readOutlineFromDocx(path) {
	let buffer;
	try {
		buffer = readFileSync(path);
	} catch (error) {
		throw new Error(`cannot read outline file "${path}": ${error.message}`);
	}
	return extractDocxText(new Uint8Array(buffer));
}
//#endregion
//#region src/assistant.ts
/**
* AI assistant engine — a conversational editor over the novel project.
*
* The user talks to the assistant about plot, characters, settings; the
* assistant can reply in prose AND emit action directives that the host
* executes (rewrite a paragraph, edit the bible, regenerate a chapter,
* export the book, ...). Conversation history persists next to the project
* as NDJSON, so a reload keeps the thread.
*
* Action protocol: the model emits a line of the form
*   <dsh-action name="toolName">{jsonArgs}</dsh-action>
* anywhere in its reply. The host strips it, executes the tool, appends the
* result as a tool-role message, and continues the loop (bounded rounds).
*/
/** History file name inside the output dir. */
const ASSISTANT_HISTORY_FILE = "novel-assistant.jsonl";
/** Max tool-call rounds per user turn (safety bound). */
const MAX_TOOL_ROUNDS = 6;
/** Load the persisted conversation (empty when none). */
function loadAssistantHistory(outputDir) {
	const file = join(outputDir, ASSISTANT_HISTORY_FILE);
	if (!existsSync(file)) return [];
	const messages = [];
	try {
		for (const line of readFileSync(file, "utf8").split("\n")) {
			if (line.trim() === "") continue;
			try {
				const parsed = JSON.parse(line);
				if (typeof parsed.role === "string" && typeof parsed.content === "string") messages.push(parsed);
			} catch {}
		}
	} catch {}
	return messages;
}
/** Append one message to the persisted history. Tool payloads (e.g. full
*  outline / chapter text) are capped so the jsonl and later LLM context
*  don't grow unboundedly. */
function appendHistory(outputDir, message) {
	mkdirSync(outputDir, { recursive: true });
	const entry = message.role === "tool" && message.content.length > 4e3 ? {
		...message,
		content: message.content.slice(0, 4e3) + "\n…（已截断，如需完整内容请重新调用工具）"
	} : message;
	appendFileSync(join(outputDir, ASSISTANT_HISTORY_FILE), JSON.stringify(entry) + "\n", "utf8");
}
/** 清空助手对话记录（删除历史文件）。 */
function clearAssistantHistory(outputDir) {
	const file = join(outputDir, ASSISTANT_HISTORY_FILE);
	if (existsSync(file)) rmSync(file, { force: true });
}
/** Render the project snapshot the assistant sees. */
function renderProjectSnapshot(project) {
	const sections = [];
	sections.push(`书名：${project.bookName}`);
	sections.push(`总纲节选（如需全文用 outline_text 工具）：\n${project.outline.slice(0, 2500)}`);
	const assetNames = [];
	if (project.assets?.genre !== void 0) assetNames.push(`题材：${project.assets.genre.name}`);
	if (project.assets?.primaryProgression !== void 0) assetNames.push(`主推进：${project.assets.primaryProgression.name}`);
	if ((project.assets?.styleAssets?.length ?? 0) > 0) assetNames.push(`写法：${project.assets.styleAssets.map((s) => s.name).join("、")}`);
	if ((project.assets?.antiAiRules?.length ?? 0) > 0) assetNames.push(`文戒自定义：${project.assets.antiAiRules.map((r) => r.name).join("、")}`);
	if (assetNames.length > 0) sections.push(`【写作资产】${assetNames.join(" · ")}`);
	if (project.bible !== void 0) {
		const bible = project.bible;
		sections.push("【道藏】");
		if (bible.genre !== "") sections.push(`题材基调：${bible.genre}`);
		if (bible.worldRules.length > 0) sections.push("世界规则：\n" + bible.worldRules.map((r) => `- ${r}`).join("\n"));
		if (bible.characters.length > 0) {
			sections.push("角色卡：");
			for (const card of bible.characters) {
				const roleName = {
					protagonist: "主角",
					supporting: "配角",
					antagonist: "反派",
					other: "其他"
				}[card.role];
				sections.push(`- ${card.name}（${roleName}）：${card.traits.join("、")}${card.goals !== "" ? `；目标：${card.goals}` : ""}`);
			}
		}
		if (bible.redLines.length > 0) sections.push("写作红线：\n" + bible.redLines.map((r) => `- ${r}`).join("\n"));
	}
	if (project.world !== void 0) {
		const world = project.world;
		sections.push("【大世界】");
		if (world.realms.length > 0) sections.push("境界体系：" + world.realms.map((r, i) => `${i + 1}.${r.name}（${r.description.slice(0, 40)}）`).join(" → "));
		if (world.regions.length > 0) sections.push("区域：" + world.regions.map((r) => r.name).join("、"));
		if (world.factions.length > 0) sections.push("势力：" + world.factions.map((f) => `${f.name}（${f.kind}）`).join("、"));
	}
	if (project.volumes !== void 0 && project.volumes.length > 0) {
		sections.push("【卷结构】");
		for (const v of project.volumes) sections.push(`第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`);
	}
	if (project.chapters.length > 0) {
		const shown = project.chapters.slice(-30);
		sections.push(`【章节计划与进度（最近 ${shown.length} 章）】`);
		for (const c of shown) {
			const statusText = {
				pending: "待生成",
				generating: "生成中",
				written: "待审稿",
				reviewing: "审稿中",
				approved: "已通过",
				rejected: "待修订",
				error: "失败"
			}[c.status];
			sections.push(`第${c.no}章《${c.title}》[${statusText}]${c.chars !== void 0 ? ` ${c.chars}字` : ""}${c.summary !== void 0 && c.summary !== "" ? ` 摘要：${c.summary}` : ""}`);
		}
		if (project.chapters.length > shown.length) sections.push(`（还有 ${project.chapters.length - shown.length} 章未列出，可用 book_overview scope=volume:N 查看）`);
		const recent = project.chapters.filter((c) => c.status === "approved" || c.status === "written").slice(-2);
		if (recent.length > 0) {
			sections.push("【最近章节正文节选】");
			for (const c of recent) sections.push(`第${c.no}章《${c.title}》（节选，如需全文用 chapter_text）：${c.beats.slice(0, 300)}`);
		}
	}
	if (project.foreshadows.length > 0) {
		sections.push("【暗线】");
		for (const f of project.foreshadows) sections.push(`- [${f.status}] ${f.description}${f.targetChapter !== void 0 ? `（预计 ${f.targetChapter} 章回收）` : ""}`);
	}
	if ((project.facts ?? []).length > 0) {
		sections.push("【已确立编年录（最近 40 条，回答设定问题必须遵守）】");
		for (const f of (project.facts ?? []).slice(-40)) sections.push(`- [第${f.chapterNo}章] ${f.text}`);
	}
	if (project.blurb !== void 0 && project.blurb !== "") sections.push(`【卷首语】${project.blurb}`);
	return sections.join("\n");
}
/** The assistant system prompt. */
function assistantSystemPrompt(project) {
	return [
		"你是「编辑老师」——服务这本书作者的资深中文网文编辑。",
		"人设：二十年网文老编辑，懂套路、懂市场、懂节奏，说话直接但句句有用。",
		"座右铭：「书是你的，但坑我替你盯着。」",
		"职责边界：陪作者讨论剧情/人设/世界观/爽点节奏并落地修改、维护全书一致性；不闲聊、不彩虹屁、不无意义长篇大论。",
		"==================== 模块正式名称（回复作者时一律使用，禁止使用括号里的旧称） ====================",
		"总纲 = 总纲；道藏 = 道藏；暗线 = 暗线；卷首语 = 卷首语；编年录 = 编年录。",
		"==================== 当前项目快照 ====================",
		renderProjectSnapshot(project),
		"==================== 快照结束 ====================",
		"",
		"工作规则（严格遵守）：",
		"1. 全量知情：回答和修改必须基于项目真实数据，禁止编造书中不存在的设定。需要完整信息时，先调用 book_overview 获取全书上下文（总纲全文/道藏/大世界/编年录/全部章节要点/暗线/卷首语）；需要某章正文用 chapter_text。",
		"2. 修改流程：改前用一句话说明意图 → 执行工具 → 改后简要汇报。",
		"3. 连锁维护：改动可能波及其它位置（其它章节、设定、编年录、卷首语）时，执行后主动调用 impact_analysis 分析影响面，并把「必须同步」的项一并处理或明确提示作者逐项确认。",
		"4. 删除红线：删除章节、清空设定等破坏性操作必须等作者明确同意。",
		"5. 品质门槛：建议必须具体——指出问题在哪一章、哪一段、哪一句，并给出可落地的改法；禁止\"建议增强冲突\"这类空话。",
		"6. 设定忠诚：忠于总纲、道藏、大世界、编年录；发现书中已有内容与设定冲突时，主动指出并给修正方案。",
		"7. 中文回复，简洁有干货。",
		"",
		"可用工具：",
		"- book_overview：{\"scope\": \"recent|full|volume:2\"(可选，默认 recent)}。返回全书上下文包（总纲/道藏/大世界/章节要点/编年录/暗线/卷首语）。recent=最近30章；full=全部章节（书很长时慎用）；volume:N=只看第N卷。",
		"- facts_query：{\"keyword\": \"关键词\"}。从编年录按关键词检索相关事实（如灵石、境界名、人物名）。",
		"- impact_analysis：{\"change\": \"要做的修改描述\"}。分析这次改动会波及哪些位置，返回影响清单（定位到章节/设定/编年录）。",
		"- outline_text：无参数。返回当前总纲全文。",
		"- outline_replace：{\"old\": \"要替换的原文片段\", \"new\": \"新文本\"}。在总纲中替换一段文字（old 必须能在总纲中找到）。",
		"- bible_set_rule：{\"index\": 序号(0起), \"text\": \"新规则文本\"} 或 {\"append\": \"追加的规则\"}。修改道藏的世界规则。",
		"- bible_set_redline：同上，修改写作红线。",
		"- chapter_text：{\"no\": 章节号}。返回该章正文。",
		"- chapter_rewrite：{\"no\": 章节号, \"instructions\": \"修改要求\", \"target\": \"原文片段(可选，留空整章)\"}。按讨论结果修订章节；给了 target 只改该自然段。",
		"- chapter_generate：{\"no\": 章节号}。重新生成该章。",
		"- chapter_review：{\"no\": 章节号}。对该章执行 AI 审稿。",
		"- foreshadow_add：{\"description\": \"暗线描述\", \"targetChapter\": 预计回收章(可选)}。新增暗线。",
		"- foreshadow_update：{\"id\": \"暗线id\", \"status\": \"planned|planted|progressing|resolved|abandoned\"}。更新暗线状态。",
		"- export_txt：无参数。导出全本 TXT。",
		"- assets_status：无参数。查看本书当前写作资产（题材/推进模式/反AI规则/写法）。",
		"- assets_set_genre：{\"name\": \"题材名\", \"description\": \"题材说明(可选)\"}。设置本书题材基底。",
		"- assets_set_progression：{\"name\": \"模式名\", \"driver\": \"驱动力\", \"primary\": true/false}。设置主/辅助推进模式。",
		"- assets_add_rule：{\"name\": \"规则名(可选)\", \"avoid\": \"要避免的表达问题\", \"fix\": \"修正方向(可选)}。新增反 AI 规则。",
		"",
		"回答质量要求（非常重要）：",
		"- 具体：回答必须引用项目里的真实内容（人名、境界、章节、暗线、设定），禁止空泛套话。快照里没有的信息，先调用工具获取（chapter_text / outline_text）再回答。",
		"- 专业：给建议时说明理由，指出问题所在章节/段落，给出可直接落地的修改方案（改什么、怎么改）。",
		"- 主动：作者说\"改一下\"，主动调用对应工具执行，不要只给建议不动手；执行前用一句话说明意图，执行后简短汇报结果。",
		"- 忠于设定：以总纲、道藏、编年录为准，不得自相矛盾；发现问题（如剧情与设定冲突）主动指出。",
		"- 中文回复；文字量适中，别啰嗦。",
		"",
		"使用规则（非常重要）：",
		"- 写操作（chapter_generate / chapter_rewrite / chapter_review / outline_replace / bible_set_* / foreshadow_* / assets_set_* / export_txt）只有在作者明确要求时才能调用——例如作者说\"生成第 120 章\"\"把第 105 章结尾改一下\"\"帮我审一下第 88 章\"。作者只是提问、闲聊、查信息时，一律用文字回答，禁止调用任何写操作，也不要先斩后奏（如\"为了回答你，我先把第 X 章生成了\"）。",
		"- 当你想执行任何工具时，你的【整个回复】必须只包含动作指令标签，格式如下（不要有任何解释文字、不要用自然语言说\"我要去改\"，直接输出标签）：",
		"  正确示例：<dsh-action name=\"outline_replace\">{\"old\":\"要替换的原文\",\"new\":\"新文本\"}</dsh-action>",
		"  正确示例：<dsh-action name=\"chapter_text\">{\"no\":1}</dsh-action>",
		"  错误示例（绝对不要这样回复）：\"好的，我先看一下总纲，马上改。\" ← 这只是文字，不会执行任何操作",
		"  错误示例（绝对不要这样回复）：\"先拉完整上下文确认改动落地情况，避免继续空转。\" ← 没有动作标签，不会执行任何操作",
		"  错误示例（绝对不要这样回复）：\"现在处理暗线库，我先看当前列表定位 id。\" ← 没有动作标签，不会执行任何操作",
		"- 铁律：只要你想执行任何操作，你的【整个回复】必须只包含一个动作标签，禁止先说话、禁止解释\"我要做什么\"、禁止铺垫——直接输出标签。",
		"- 如果你收到「格式提示」（宿主说你没有输出动作标签）：你的下一条回复必须只输出动作标签，禁止再解释、禁止再道歉、禁止再描述计划。",
		"- 工具调用是自动的：你输出标签后，宿主会执行并把结果反馈给你，你再基于结果继续。",
		"- 每次回复最多调用 1 个动作；执行结果会反馈给你，你可以继续讨论或再调用。",
		"- 需要先看总纲/章节再决定怎么改？那就先输出一个 outline_text / chapter_text 的标签，等结果回来。",
		"- chapter_rewrite 的 target 参数：从章节正文中复制一小段（一句话或几句话即可），不要带换行、不要带引号，取连续文本片段。",
		"- 如果工具执行失败（例如片段未找到），根据错误信息修正参数后自动重试一次，不要直接放弃或让作者手动操作。",
		"- 修改前先向作者说明你要改什么、为什么；动作执行后简要汇报结果。",
		"- 涉及删除类操作（删除章节、清空设定）必须等作者明确同意。",
		"- 严格忠于道藏与总纲；不得自行发明与既有设定冲突的内容。",
		"- 用中文回复。"
	].join("\n");
}
/** Execute one action directive. Returns a text result (or throws). */
/**
* Execute one action directive as an async generator: yields live progress
* text (chapter text being generated/rewritten), then yields the final result
* string. Throws on failure.
*/
async function* executeAction(ctx, config, project, outputDir, name, args) {
	const str = (value) => typeof value === "string" ? value : "";
	const num = (value) => typeof value === "number" ? value : void 0;
	/** Forward live text deltas from a streaming chapter job (text only). */
	const forward = async function* (stream) {
		for await (const step of stream) if (step.frame === "delta") yield step.text;
	};
	switch (name) {
		case "book_overview": {
			const scopeArg = str(args.scope);
			return bookOverview(project, scopeArg === "full" ? "full" : /^volume:(\d+)$/.test(scopeArg) ? Number(scopeArg.slice(7)) : "recent");
		}
		case "facts_query": {
			const keyword = str(args.keyword).trim();
			if (keyword === "") throw new Error("facts_query 需要 keyword");
			const hits = (project.facts ?? []).filter((f) => f.text.includes(keyword)).slice(-30);
			if (hits.length === 0) return `编年录中未找到与「${keyword}」相关的事实记录。`;
			return `编年录中与「${keyword}」相关的事实（${hits.length} 条）：\n` + hits.map((f) => `- [第${f.chapterNo}章] ${f.text}`).join("\n");
		}
		case "impact_analysis": {
			const change = str(args.change);
			if (change === "") throw new Error("impact_analysis 需要 change（要做的修改描述）");
			const items = await analyzeImpact(ctx, config, project, outputDir, change);
			if (items.length === 0) return "影响分析：未发现需要同步修改的位置。";
			const lines = items.map((it, i) => `${i + 1}. [${it.location}]「${it.quote}」${it.suggestion !== "" ? ` → ${it.suggestion}` : ""}（${it.kind === "must" ? "必须同步" : it.kind === "optional" ? "建议" : "备注"}）`);
			return `影响分析：这次改动波及 ${items.length} 处——\n${lines.join("\n")}\n请据此提示作者逐项处理；章节内的修改可引导作者在工作区查看。`;
		}
		case "outline_text": return project.outline;
		case "outline_replace": {
			const old = str(args.old);
			const next = str(args.new);
			if (old === "" || !project.outline.includes(old)) throw new Error(`总纲中未找到片段「${old.slice(0, 40)}…」`);
			project.outline = project.outline.replace(old, next);
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `总纲已修改：替换了 ${old.length} 字符的片段。`;
		}
		case "bible_set_rule": {
			if (project.bible === void 0) throw new Error("尚无道藏，请先提炼");
			const index = num(args.index);
			if (index !== void 0) project.bible.worldRules[index] = str(args.text);
			else if (str(args.append) !== "") project.bible.worldRules.push(str(args.append));
			else throw new Error("bible_set_rule 需要 index+text 或 append");
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `世界规则已更新（当前 ${project.bible.worldRules.length} 条）。`;
		}
		case "bible_set_redline": {
			if (project.bible === void 0) throw new Error("尚无道藏，请先提炼");
			const index = num(args.index);
			if (index !== void 0) project.bible.redLines[index] = str(args.text);
			else if (str(args.append) !== "") project.bible.redLines.push(str(args.append));
			else throw new Error("bible_set_redline 需要 index+text 或 append");
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `写作红线已更新（当前 ${project.bible.redLines.length} 条）。`;
		}
		case "chapter_text": {
			const no = num(args.no);
			if (no === void 0) throw new Error("chapter_text 需要 no");
			const chapter = project.chapters.find((c) => c.no === no);
			if (chapter === void 0) throw new Error(`章节 ${no} 不存在`);
			const body = readChapterFile(outputDir, chapter);
			if (body === void 0) throw new Error(`章节 ${no} 尚未生成`);
			return body;
		}
		case "chapter_rewrite": {
			const no = num(args.no);
			if (no === void 0) throw new Error("chapter_rewrite 需要 no");
			const instructions = str(args.instructions);
			const target = str(args.target);
			for await (const chunk of forward(rewriteChapterStream(ctx, config, project, outputDir, no, instructions, target === "" ? void 0 : target))) yield chunk;
			const chapter = project.chapters.find((c) => c.no === no);
			const draft = chapter?.pendingDraft;
			if (chapter === void 0 || draft === void 0 || draft === "") throw new Error(`章节 ${no} 修订后没有产出草稿`);
			const fileName = chapterFileName(chapter);
			mkdirSync(outputDir, { recursive: true });
			writeFileSync(join(outputDir, fileName), `# 第${chapter.no}章 ${chapter.title}\n\n${draft}\n`, "utf8");
			chapter.pendingDraft = void 0;
			chapter.status = "written";
			chapter.chars = draft.length;
			chapter.file = fileName;
			chapter.review = void 0;
			chapter.error = void 0;
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			yield "（已采纳修订稿，正在生成章节摘要与编年录…）";
			try {
				await summarizeAndExtractFacts(ctx, config, project, outputDir, no);
			} catch {}
			yield "（正在 AI 审稿…）";
			const report = await reviewChapter(ctx, config, project, outputDir, no);
			return `章节 ${no} 已${target === "" ? "整章" : "局部"}修订完成（${project.chapters.find((c) => c.no === no)?.chars ?? "?"} 字）。重新审稿：${report.score} 分 — ${report.verdict}`;
		}
		case "chapter_generate": {
			const no = num(args.no);
			if (no === void 0) throw new Error("chapter_generate 需要 no");
			for await (const chunk of forward(generateChapterStream(ctx, config, project, outputDir, no))) yield chunk;
			yield "（正在生成章节摘要与编年录…）";
			try {
				await summarizeAndExtractFacts(ctx, config, project, outputDir, no);
			} catch {}
			yield "（正在 AI 审稿…）";
			const report = await reviewChapter(ctx, config, project, outputDir, no);
			return `章节 ${no} 已生成（${project.chapters.find((c) => c.no === no)?.chars ?? "?"} 字）。审稿：${report.score} 分 — ${report.verdict}`;
		}
		case "chapter_review": {
			const no = num(args.no);
			if (no === void 0) throw new Error("chapter_review 需要 no");
			const report = await reviewChapter(ctx, config, project, outputDir, no);
			const issues = report.issues.map((i) => `[${i.severity}] ${i.item} → ${i.suggestion}`).join("\n");
			return `章节 ${no} 审稿：${report.score} 分 — ${report.verdict}\n${issues}`;
		}
		case "foreshadow_add": {
			const description = str(args.description);
			if (description === "") throw new Error("foreshadow_add 需要 description");
			const targetChapter = num(args.targetChapter);
			project.foreshadows.push({
				id: `fs-${Date.now().toString(36)}`,
				description,
				targetChapter,
				status: "planned"
			});
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `已新增暗线：「${description.slice(0, 50)}」`;
		}
		case "foreshadow_update": {
			const id = str(args.id);
			const status = str(args.status);
			const target = project.foreshadows.find((f) => f.id === id);
			if (target === void 0) throw new Error(`暗线 ${id} 不存在`);
			if (![
				"planned",
				"planted",
				"progressing",
				"resolved",
				"abandoned"
			].includes(status)) throw new Error(`非法状态 ${status}`);
			target.status = status;
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `暗线已更新为 ${status}：「${target.description.slice(0, 50)}」`;
		}
		case "export_txt": {
			const result = exportBook(outputDir, project, "txt");
			return `已导出 TXT：${result.file}（${result.chars} 字，${result.chapters} 章）`;
		}
		case "assets_status": {
			const assets = project.assets;
			if (assets === void 0) return "本书尚未配置写作资产。";
			const parts = [];
			if (assets.genre !== void 0) parts.push(`题材：${assets.genre.name}`);
			if (assets.primaryProgression !== void 0) parts.push(`主推进：${assets.primaryProgression.name}`);
			if (assets.auxiliaryProgressions.length > 0) parts.push(`辅助推进：${assets.auxiliaryProgressions.map((m) => m.name).join("、")}`);
			if (assets.antiAiRules.length > 0) parts.push(`自定义反AI规则：${assets.antiAiRules.map((r) => r.name).join("、")}`);
			if (assets.styleAssets.length > 0) parts.push(`写法资产：${assets.styleAssets.map((s) => s.name).join("、")}`);
			return parts.length > 0 ? parts.join("\n") : "本书尚未配置写作资产。";
		}
		case "assets_set_genre": {
			const name = str(args.name);
			const description = str(args.description);
			if (name === "") throw new Error("assets_set_genre 需要 name");
			if (project.assets === void 0) project.assets = emptyProjectAssets();
			project.assets.genre = {
				name,
				description,
				children: []
			};
			project.assets.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `题材已设为「${name}」`;
		}
		case "assets_set_progression": {
			const name = str(args.name);
			const driver = str(args.driver);
			const primary = args.primary !== false;
			if (name === "") throw new Error("assets_set_progression 需要 name");
			if (project.assets === void 0) project.assets = emptyProjectAssets();
			const mode = {
				name,
				driver: driver !== "" ? driver : name,
				readerExpectation: str(args.readerExpectation),
				payoffs: Array.isArray(args.payoffs) ? args.payoffs.filter((v) => typeof v === "string") : [],
				risks: Array.isArray(args.risks) ? args.risks.filter((v) => typeof v === "string") : [],
				primary
			};
			if (primary) project.assets.primaryProgression = mode;
			else {
				if (project.assets.auxiliaryProgressions === void 0) project.assets.auxiliaryProgressions = [];
				project.assets.auxiliaryProgressions.push(mode);
			}
			project.assets.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `推进模式${primary ? "（主）" : "（辅助）"}已设置：「${name}」`;
		}
		case "assets_add_rule": {
			const name = str(args.name);
			const avoid = str(args.avoid);
			if (avoid === "") throw new Error("assets_add_rule 需要 avoid（要避免的表达问题）");
			if (project.assets === void 0) project.assets = emptyProjectAssets();
			if (project.assets.antiAiRules === void 0) project.assets.antiAiRules = [];
			project.assets.antiAiRules.push({
				name: name !== "" ? name : `自定义规则 ${project.assets.antiAiRules.length + 1}`,
				avoid,
				fix: str(args.fix)
			});
			project.assets.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `已新增反 AI 规则「${name !== "" ? name : avoid.slice(0, 20)}」`;
		}
		default: throw new Error(`未知工具 ${name}`);
	}
}
/** Extract the first action directive from a reply (tolerant to common tag misspellings). */
function extractAction(reply) {
	const match = /<([a-z_]*d[a-z]?sh?-action)\s+name="([^"]+)"\s*>([\s\S]*?)<\/\1>/.exec(reply);
	if (match === null) return void 0;
	const rawArgs = match[3]?.trim() ?? "";
	let args;
	try {
		args = rawArgs === "" ? {} : JSON.parse(rawArgs);
	} catch {
		throw new Error(`动作参数不是合法 JSON：${rawArgs.slice(0, 80)}`);
	}
	return {
		name: match[2] ?? "",
		args,
		index: match.index
	};
}
/** Render the recent history as LLM messages (skipping tool chatter in early rounds). */
function historyToMessages(history) {
	const recent = history.slice(-18);
	const messages = [];
	for (const entry of recent) if (entry.role === "user") messages.push(createUserMessage({
		content: [{
			type: "text",
			text: entry.content
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-novel-forge"
		}
	}));
	else if (entry.role === "assistant") messages.push(createAssistantMessage({
		content: [{
			type: "text",
			text: entry.content
		}],
		source: {
			provider: "deepseek-official",
			model: "deepseek-v4-flash"
		}
	}));
	else if (entry.role === "tool") {
		const body = entry.content.length > 2e3 ? entry.content.slice(0, 2e3) + "\n…（结果过长已截断，需要完整内容请重新调用工具）" : entry.content;
		messages.push(createUserMessage({
			content: [{
				type: "text",
				text: `【工具 ${entry.tool ?? ""} 的执行结果】\n${body}`
			}],
			source: {
				kind: "plugin",
				plugin: "dsh-novel-forge"
			}
		}));
	}
	return messages;
}
/** One non-streaming LLM chat turn (used inside the tool loop). */
async function chatOnce(ctx, config, system, history) {
	const messages = historyToMessages(history);
	const last = messages[messages.length - 1];
	if (last?.role === "user" && Array.isArray(last.content)) {
		const blocks = last.content;
		const idx = blocks.findIndex((b) => b.type === "text");
		if (idx !== -1) {
			const textBlock = blocks[idx];
			const newBlocks = blocks.map((b, i) => i === idx ? {
				...textBlock,
				text: textBlock.text + "\n\n（回复格式提醒：如果你需要执行任何操作，你的回复必须【只包含】一个 <dsh-action name=\"工具名\">{\"参数\":值}</dsh-action> 标签，禁止先说话、禁止解释、禁止铺垫；如果你只是在回答或讨论，正常回复即可，不要输出标签。）"
			} : b);
			messages[messages.length - 1] = {
				...last,
				content: newBlocks
			};
		}
	}
	const request = {
		provider: config.provider,
		model: config.model,
		messages,
		system,
		maxTokens: Math.max(config.maxTokens, 16e3),
		temperature: .7
	};
	const assembler = new BlockAssembler();
	for await (const chunk of ctx.llm.stream(request)) assembler.push(chunk);
	const finish = assembler.finish;
	if (finish.kind === "error" || finish.kind === "aborted") throw new Error(`助手调用失败（${finish.kind}）: ${finish.failure.message}`);
	const blocks = assembler.blocks();
	let text = blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (text === "") {
		const reasoning = blocks.filter((block) => block.type === "reasoning").map((block) => block.text).join("\n").trim();
		if (reasoning !== "") text = reasoning;
	}
	return text;
}
/** Run one user turn. Yields stream frames; persists history. */
async function* runAssistantTurn(ctx, config, project, outputDir, userMessage) {
	const history = loadAssistantHistory(outputDir);
	const system = assistantSystemPrompt(project);
	const userEntry = {
		role: "user",
		content: userMessage,
		ts: (/* @__PURE__ */ new Date()).toISOString()
	};
	history.push(userEntry);
	appendHistory(outputDir, userEntry);
	let round = 0;
	/** 已提示模型输出动作标签的次数（0 = 尚未提示；超过上限则按纯文字回复结束，防死循环）。 */
	let nudged = 0;
	const MAX_NUDGES = 6;
	/** 连续收到 hex 乱码回复的次数（≥2 次判定 LLM 侧异常，放弃本轮避免死循环）。 */
	let garbleCount = 0;
	const WRITE_TOOL_KEYS = {
		chapter_generate: /(生成|写第\s*\d+\s*章|写一[章篇]|新写|续写|接着写|继续写|开始写|写正文|写书|创作)/,
		chapter_rewrite: /(重写|改写|修订|修改|改一下|调整|替换|润色|优化|修正|完善|回炉|换一种|从头)/,
		chapter_review: /(审|检查|校验|点评|评估|把关|质量|怎么样|如何)/,
		outline_replace: /(大纲|总纲|简介)/,
		bible_set_rule: /(道藏|设定|规则|红线|世界|金手指)/,
		bible_set_redline: /(道藏|设定|红线)/,
		foreshadow_add: /(暗线|伏笔|埋)/,
		foreshadow_update: /(暗线|伏笔)/,
		export_txt: /(导出|打包|下载|txt)/,
		assets_set_genre: /(题材)/,
		assets_set_progression: /(推进)/,
		assets_add_rule: /(规则|文戒|反AI)/
	};
	/** 本轮已放行过写操作：后续写操作（生成→审稿→修订闭环）不再逐个拦截。 */
	let writeUnlocked = false;
	const guardWrite = (name, userMessage) => {
		if (writeUnlocked) return true;
		const key = WRITE_TOOL_KEYS[name];
		if (key === void 0) return true;
		const recentUsers = history.filter((m) => m.role === "user").slice(-2).map((m) => m.content).join("\n");
		if (key.test(recentUsers)) {
			writeUnlocked = true;
			return true;
		}
		return false;
	};
	for (;;) {
		if (round++ > 20) break;
		const reply = await chatOnce(ctx, config, system, history);
		if (reply.length > 120 && /^[0-9a-fA-F\s]+$/.test(reply.slice(0, 2e3))) {
			garbleCount++;
			if (garbleCount >= 2) {
				const garbleEntry = {
					role: "assistant",
					content: "（模型本次返回了异常编码内容，已忽略；请重新描述你的问题。）",
					ts: (/* @__PURE__ */ new Date()).toISOString()
				};
				history.push(garbleEntry);
				appendHistory(outputDir, garbleEntry);
				yield {
					frame: "delta",
					text: garbleEntry.content
				};
				return;
			}
			continue;
		}
		const action = extractAction(reply);
		if (action === void 0) {
			const intendsAction = /(改|修改|修订|重写|替换|调整|生成|新增|删除|导出|看看|查看|调出|读一下|加上|加一个|去掉|删掉|把.+改成|定位|处理|转轨|检查|确认|搜索|找一下|列一下|查一下|查一遍|查一查|再查|查查|核实|核对|清点|盘点|看一下|看下|继续)/.test(reply);
			const mentionsTarget = /(编年录|道藏|暗线|总纲|卷首语|章节|正文|规则|红线|伏笔|简介|大纲|事实|设定|世界|角色|人物|第\s*\d+\s*章)/.test(reply);
			const strayTag = /<[a-z_-]*action[^>]*>/.test(reply);
			if ((intendsAction || mentionsTarget || strayTag) && nudged < MAX_NUDGES) {
				const userWriteIntent = Object.values(WRITE_TOOL_KEYS).some((re) => re.test(userMessage));
				const nudge = nudged === 0 ? userWriteIntent ? "你的上一条回复表达了想操作项目的意图（或动作标签格式有误），因此没有执行任何操作。请直接输出动作标签来执行，格式必须为 <dsh-action name=\"工具名\">{\"参数\":值}</dsh-action>（注意拼写是 dsh-action，不是 dash-action；标签成对出现，参数为合法 JSON）。如果需要先看内容，先输出 outline_text 或 chapter_text 标签。" : "你刚才的回复看起来在讨论项目内容，但没有必要执行任何操作。如果用户只是在提问或闲聊，请直接以文字回答即可，不要输出动作标签，也不要自行调用任何写操作（生成/修订/删除等只有用户明确要求时才允许）。若确实需要先查看数据，最多使用只读工具（outline_text / chapter_text / book_overview / facts_query）。" : userWriteIntent ? `你第 ${nudged + 1} 次表达了操作意图但没有输出动作标签，因此仍未执行任何操作。铁律：你的【整个回复】现在必须只包含一个 <dsh-action> 标签（例如 <dsh-action name="chapter_text">{"no":1}</dsh-action>），禁止任何解释、铺垫或"我这就去"之类的文字。若你其实不打算执行任何操作，请明确回复「不执行」。` : `你第 ${nudged + 1} 次回复仍不需要执行操作。再次强调：用户没有要求修改，请直接给出文字回答（可以简短引用项目数据），不要输出动作标签。写操作只会在用户明确要求时被允许。`;
				nudged++;
				history.push({
					role: "tool",
					content: nudge,
					tool: "format-hint",
					ts: (/* @__PURE__ */ new Date()).toISOString()
				});
				appendHistory(outputDir, {
					role: "tool",
					content: nudge,
					tool: "format-hint",
					ts: (/* @__PURE__ */ new Date()).toISOString()
				});
				continue;
			}
			const assistantEntry = {
				role: "assistant",
				content: reply,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			};
			history.push(assistantEntry);
			appendHistory(outputDir, assistantEntry);
			yield {
				frame: "delta",
				text: reply
			};
			return;
		}
		const { name, args, index } = action;
		const prose = reply.slice(0, index).trim();
		if (!guardWrite(name, userMessage)) {
			const denied = `【操作被拒绝】${name} 是写操作（会修改正文/项目数据），但你当前的消息里没有明确要求执行该修改。如果需要，请明确说明（如「生成第 120 章」「把第 105 章结尾改一下」）。我不会擅自修改你的作品。`;
			history.push({
				role: "tool",
				content: denied,
				tool: name,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			appendHistory(outputDir, {
				role: "tool",
				content: denied,
				tool: name,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			yield {
				frame: "tool",
				name,
				status: "error",
				detail: denied
			};
			const assistantEntry = {
				role: "assistant",
				content: denied,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			};
			history.push(assistantEntry);
			appendHistory(outputDir, assistantEntry);
			yield {
				frame: "delta",
				text: denied
			};
			return;
		}
		yield {
			frame: "tool",
			name,
			status: "start"
		};
		let result;
		try {
			const iterator = executeAction(ctx, config, project, outputDir, name, args)[Symbol.asyncIterator]();
			result = "";
			for (;;) {
				const step = await iterator.next();
				if (step.done === true) {
					result = typeof step.value === "string" ? step.value : "";
					break;
				}
				const chunk = step.value;
				if (typeof chunk === "string" && chunk !== "") yield {
					frame: "toolDelta",
					name,
					text: chunk
				};
			}
			yield {
				frame: "tool",
				name,
				status: "done",
				detail: result.slice(0, 200)
			};
		} catch (error) {
			result = `执行失败：${error.message}`;
			yield {
				frame: "tool",
				name,
				status: "error",
				detail: error.message
			};
		}
		if (prose !== "") {
			history.push({
				role: "assistant",
				content: prose,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			appendHistory(outputDir, {
				role: "assistant",
				content: prose,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
		}
		history.push({
			role: "tool",
			content: result,
			tool: name,
			ts: (/* @__PURE__ */ new Date()).toISOString()
		});
		appendHistory(outputDir, {
			role: "tool",
			content: result,
			tool: name,
			ts: (/* @__PURE__ */ new Date()).toISOString()
		});
		round++;
		if (round >= MAX_TOOL_ROUNDS) {
			const message = `（已连续执行 ${round} 次修改操作，本轮停止。如需继续请再说。）`;
			history.push({
				role: "assistant",
				content: message,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			appendHistory(outputDir, {
				role: "assistant",
				content: message,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			yield {
				frame: "delta",
				text: message
			};
			return;
		}
	}
}
//#endregion
//#region src/author-assets.ts
/**
* 作者资产库/总数据（跨书）— 按作者维度聚合的可复用资产。
* 与书架同惯例持久化到 ~/.dsh/dsh-novel-forge-author-assets.json。
* 提供读取/持久化/新增或更新/删除，以及「导入默认」：把书架书的写作资产/角色 + 
* 内置全局库（题材/反AI规则/风格模板/推进模式）批量沉淀成资产条目（默认库）。
*/
/** 作者资产库配置文件路径。 */
function authorAssetsFile() {
	return join(homedir(), ".dsh", "dsh-novel-forge-author-assets.json");
}
/** 默认空资产库。 */
function defaultLibrary() {
	return {
		version: 1,
		items: []
	};
}
/** 读取作者资产库（不存在/损坏则返回空库，不抛错）。 */
function loadAuthorAssets() {
	const file = authorAssetsFile();
	if (!existsSync(file)) return defaultLibrary();
	try {
		let raw = readFileSync(file, "utf8");
		if (raw.charCodeAt(0) === 65279) raw = raw.slice(1);
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed.items)) return defaultLibrary();
		return {
			version: 1,
			items: parsed.items
		};
	} catch {
		return defaultLibrary();
	}
}
/** 持久化作者资产库。 */
function saveAuthorAssets(library) {
	const file = authorAssetsFile();
	mkdirSync(join(homedir(), ".dsh"), { recursive: true });
	writeFileSync(file, JSON.stringify(library, null, 2), "utf8");
}
/** 按 id 更新一条资产；不存在则追加。 */
function upsertAuthorAsset(input) {
	const library = loadAuthorAssets();
	const idx = library.items.findIndex((a) => a.id === input.id);
	const now = (/* @__PURE__ */ new Date()).toISOString();
	if (idx >= 0) {
		const prev = library.items[idx];
		if (prev !== void 0) library.items[idx] = {
			...prev,
			...input,
			id: prev.id,
			createdAt: prev.createdAt,
			updatedAt: now
		};
	} else library.items.push({
		...input,
		createdAt: input.createdAt !== "" ? input.createdAt : now,
		updatedAt: now
	});
	saveAuthorAssets(library);
	return library;
}
/** 删除一条资产；返回更新后的资产库。 */
function removeAuthorAsset(id) {
	const library = loadAuthorAssets();
	library.items = library.items.filter((a) => a.id !== id);
	saveAuthorAssets(library);
	return library;
}
/**
* 导入默认：把书架所有书的写作资产/角色 + 内置全局库批量沉淀到作者资产库。
* 按 `kind:name` 去重（已存在则跳过），不覆盖用户已有条目。
* @returns 更新后的资产库。
*/
function importDefaultAuthorAssets() {
	const library = loadAuthorAssets();
	const seen = new Set(library.items.map((a) => a.kind + ":" + a.name));
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const push = (kind, name, summary, content, tags, sourceBooks, structured) => {
		const key = kind + ":" + name.trim();
		if (name.trim() === "" || seen.has(key)) return;
		seen.add(key);
		library.items.push({
			id: "aa-" + Date.now().toString(36) + "-" + randomBytes(3).toString("hex"),
			kind,
			name: name.trim(),
			summary: summary.trim(),
			content: content.trim(),
			sourceBooks,
			tags,
			structured,
			createdAt: now,
			updatedAt: now
		});
	};
	for (const g of flattenGenres(BUILTIN_GENRE_LIBRARY)) push("genre", g.name, g.description, g.description, ["内置", "题材"], [], {
		description: g.description,
		children: (g.children ?? []).map((c) => c.name)
	});
	for (const r of BUILTIN_ANTI_AI_RULES) push("antiAi", r.name, r.avoid, "避免：" + r.avoid + "\n修正：" + r.fix, ["内置", "反AI"], [], {
		avoid: r.avoid,
		fix: r.fix,
		detectPatterns: r.detectPatterns
	});
	for (const t of BUILTIN_STYLE_TEMPLATES) push("style", t.name, t.description, "分类：" + t.category + "\n适用：" + t.applicableGenres.join("、") + "\n叙述：" + t.proseRules.join("；") + "\n台词：" + t.dialogueRules.join("；") + "\n语言：" + t.languageRules.join("；") + "\n节奏：" + t.rhythmRules.join("；"), ["内置", "风格模板"], [], {
		category: t.category,
		applicableGenres: t.applicableGenres
	});
	for (const p of BUILTIN_PROGRESSION_MODES) push("progression", p.name, p.driver, "驱动：" + p.driver + "\n期待：" + p.readerExpectation + "\n兑现：" + p.payoffs.join("；") + "\n风险：" + p.risks.join("；"), ["内置", "推进"], [], {
		driver: p.driver,
		primary: p.primary
	});
	const shelf = loadBookshelf();
	for (const book of shelf.books) {
		const project = loadProject(book.outputDir);
		if (project === void 0) continue;
		const src = [project.bookName];
		const assets = project.assets;
		if (assets !== void 0) {
			if (assets.genre !== void 0) push("genre", assets.genre.name, assets.genre.description, assets.genre.description, ["书", "题材"], src, { description: assets.genre.description });
			if (assets.primaryProgression !== void 0) push("progression", assets.primaryProgression.name, assets.primaryProgression.driver, "驱动：" + assets.primaryProgression.driver + "\n期待：" + assets.primaryProgression.readerExpectation, src, [], {
				driver: assets.primaryProgression.driver,
				primary: true
			});
			for (const p of assets.auxiliaryProgressions ?? []) push("progression", p.name, p.driver, "驱动：" + p.driver + "\n期待：" + p.readerExpectation, src, [], {
				driver: p.driver,
				primary: false
			});
			for (const r of assets.antiAiRules ?? []) push("antiAi", r.name, r.avoid, "避免：" + r.avoid + "\n修正：" + r.fix, src, [], {
				avoid: r.avoid,
				fix: r.fix,
				detectPatterns: r.detectPatterns
			});
			for (const s of assets.styleAssets ?? []) push("style", s.name, s.proseRules.join("；"), "叙述：" + s.proseRules.join("；") + "\n台词：" + s.dialogueRules.join("；") + "\n描写：" + s.descriptionRules.join("；") + "\n边界：" + s.boundaries.join("；"), src, [], { sourceText: s.sourceText });
		}
		for (const role of project.roles ?? []) {
			const persona = ("身份：" + role.identity + "\n性格：" + role.traits.join("、") + "\n目标：" + role.goals + "\n关系：" + role.relations.join("、") + "\n成长线：" + (role.arc.length > 0 ? role.arc.join(" > ") : "—") + "\n知情度：" + role.knowledge.join("、")).trim();
			push("roleTemplate", role.name, role.identity, persona, src, [], {
				roleLabel: role.roleLabel,
				traits: role.traits,
				relations: role.relations,
				arc: role.arc,
				knowledge: role.knowledge
			});
		}
	}
	saveAuthorAssets(library);
	return library;
}
/** 拍平题材库（含子题材，父级名称并入 tag）。 */
function flattenGenres(nodes, parentName) {
	const out = [];
	for (const n of nodes) {
		out.push({
			...n,
			name: parentName !== void 0 ? parentName + "/" + n.name : n.name
		});
		if (n.children.length > 0) out.push(...flattenGenres(n.children, parentName !== void 0 ? parentName + "/" + n.name : n.name));
	}
	return out;
}
//#endregion
//#region src/routes.ts
/** Cap on JSON request bodies (generous: cover images travel as base64). */
const MAX_JSON_BODY_BYTES = 64 * 1024 * 1024;
/** 包内置风格效果图目录（assets/styles，随 npm 包分发）。 */
const builtinStyleDir = fileURLToPath(new URL("../assets/styles/", import.meta.url));
/** Loopback-only fence (mirrors the family plugins' pairing routes). */
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** One JSON response. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(payload);
}
/** Read a JSON request body. */
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > MAX_JSON_BODY_BYTES) return void 0;
		chunks.push(buffer);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return;
	}
}
/** Default chapter count for planning when the request omits it. */
const DEFAULT_PLAN_COUNT = 30;
/**
* Build every /api/dsh-novel-forge route.
* @param deps - context, config resolver, config patcher.
* @returns the route list.
*/
function makeRoutes(deps) {
	const { ctx, getConfig, patchConfig } = deps;
	/** 全书质检实时状态（内存态，重启后回到 idle；用于 /status 暴露进度）。 */
	let auditState = {
		status: "idle",
		totalBatches: 0,
		completedBatches: 0
	};
	/** Guard helper: fence + method check. */
	const guard = (req, res, method) => {
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return false;
		}
		if (req.method !== method) {
			writeJson(res, 405, { error: `method not allowed (expected ${method})` });
			return false;
		}
		return true;
	};
	/** Load (and sync) the project, or respond 400. */
	const requireProject = (res) => {
		const config = getConfig();
		const project = loadProject(config.outputDir);
		if (project === void 0) {
			writeJson(res, 400, { error: "输出目录中没有项目，请先加载大纲" });
			return;
		}
		syncProjectWithDisk(project, config.outputDir);
		saveProject(config.outputDir, project);
		return project;
	};
	const statusRoute = {
		kind: "exact",
		path: NOVEL_API.status,
		handler: (req, res) => {
			if (!guard(req, res, "GET")) return;
			const config = getConfig();
			seedBookshelfFromOutputDir(config.outputDir);
			const project = loadProject(config.outputDir);
			if (project !== void 0) {
				const staleMs = 600 * 1e3;
				for (const c of project.chapters) if (c.status === "generating" && c.generatingAt !== void 0) {
					const started = new Date(c.generatingAt).getTime();
					if (Number.isFinite(started) && Date.now() - started > staleMs) {
						c.status = "pending";
						c.error = void 0;
						c.generatingAt = void 0;
					}
				}
				syncProjectWithDisk(project, config.outputDir);
				saveProject(config.outputDir, project);
			}
			writeJson(res, 200, {
				config,
				project: project !== void 0 ? {
					...project,
					facts: (project.facts ?? []).slice(-80)
				} : void 0,
				generatedFiles: listChapterFiles(config.outputDir),
				audit: auditState
			});
		}
	};
	const loadOutlineRoute = {
		kind: "exact",
		path: NOVEL_API.loadOutline,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			const config = getConfig();
			try {
				let outline;
				let path;
				if (body?.text !== void 0 && body.text.trim() !== "") outline = body.text.trim();
				else {
					const target = body?.path?.trim() !== "" && body?.path !== void 0 ? body.path : config.outlinePath;
					outline = readOutlineFromDocx(target);
					path = target;
				}
				if (outline.length < 50) {
					writeJson(res, 400, { error: "大纲内容过短（<50 字符），请检查文件或直接粘贴大纲文本" });
					return;
				}
				writeJson(res, 200, {
					outline,
					bookName: createProject(outline).bookName,
					chars: outline.length,
					path
				});
			} catch (error) {
				writeJson(res, 400, { error: error.message });
			}
		}
	};
	const saveOutlineRoute = {
		kind: "exact",
		path: NOVEL_API.saveOutline,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			const config = getConfig();
			const outline = body?.text ?? "";
			if (outline.trim().length < 50) {
				writeJson(res, 400, { error: "大纲内容过短（<50 字符）" });
				return;
			}
			let project = loadProject(config.outputDir);
			const now = (/* @__PURE__ */ new Date()).toISOString();
			if (project === void 0) project = createProject(outline);
			else {
				project.outline = outline;
				project.bookName = createProject(outline).bookName;
				project.updatedAt = now;
			}
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				bookName: project.bookName
			});
		}
	};
	const bibleRoute = {
		kind: "exact",
		path: NOVEL_API.bible,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			const config = getConfig();
			const project = loadProject(config.outputDir);
			const outline = body?.outline?.trim() !== "" && body?.outline !== void 0 ? body.outline : project?.outline;
			if (outline === void 0 || outline.length < 50) {
				writeJson(res, 400, { error: "请先加载大纲" });
				return;
			}
			try {
				const bible = await extractBible(ctx, config, outline, project);
				const now = (/* @__PURE__ */ new Date()).toISOString();
				const next = project ?? createProject(outline);
				next.bible = bible;
				next.updatedAt = now;
				saveProject(config.outputDir, next);
				writeJson(res, 200, { bible });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const volumesRoute = {
		kind: "exact",
		path: NOVEL_API.volumes,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			const config = getConfig();
			const project = loadProject(config.outputDir);
			const outline = body?.outline?.trim() !== "" && body?.outline !== void 0 ? body.outline : project?.outline;
			if (outline === void 0 || outline.length < 50) {
				writeJson(res, 400, { error: "请先加载大纲" });
				return;
			}
			try {
				const volumes = await planVolumes(ctx, config, outline);
				const now = (/* @__PURE__ */ new Date()).toISOString();
				const next = project ?? createProject(outline);
				next.volumes = volumes;
				next.updatedAt = now;
				saveProject(config.outputDir, next);
				writeJson(res, 200, { volumes });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const planRoute = {
		kind: "exact",
		path: NOVEL_API.plan,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			const config = getConfig();
			const project = loadProject(config.outputDir);
			const outline = body?.outline?.trim() !== "" && body?.outline !== void 0 ? body.outline : project?.outline;
			if (outline === void 0 || outline.length < 50) {
				writeJson(res, 400, { error: "请先加载大纲（或粘贴大纲文本）" });
				return;
			}
			const count = body?.chapterCount ?? DEFAULT_PLAN_COUNT;
			if (!Number.isInteger(count) || count < 1 || count > 200) {
				writeJson(res, 400, { error: "chapterCount 须为 1-200 的整数" });
				return;
			}
			try {
				const next = project ?? createProject(outline);
				const chapters = await planChapters(ctx, config, next, count, body?.volume, config.outputDir);
				mergeVolatileFromDisk(config.outputDir, next);
				next.chapters.push(...chapters);
				next.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, next);
				writeJson(res, 200, {
					chapters,
					volumes: next.volumes
				});
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const generateRoute = {
		kind: "exact",
		path: NOVEL_API.generate,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			const rawNo = body?.chapterNo;
			if (!Number.isInteger(rawNo) || rawNo === void 0 || rawNo < 1) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const no = rawNo;
			const chapter = project.chapters.find((c) => c.no === no);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${no} 不在计划中` });
				return;
			}
			if (chapter.status === "generating") {
				writeJson(res, 409, { error: `章节 ${no} 正在生成中` });
				return;
			}
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache",
				"x-accel-buffering": "no",
				"referrer-policy": "no-referrer"
			});
			chapter.status = "generating";
			chapter.error = void 0;
			chapter.generatingAt = (/* @__PURE__ */ new Date()).toISOString();
			mergeVolatileFromDisk(config.outputDir, project);
			saveProject(config.outputDir, project);
			const send = (frame) => {
				res.write(JSON.stringify(frame) + "\n");
			};
			try {
				send({
					type: "start",
					no,
					title: chapter.title
				});
				for await (const step of generateChapterStream(ctx, config, project, config.outputDir, no)) if (step.frame === "delta") send({
					type: "delta",
					text: step.text
				});
				else if (step.frame === "done") send({
					type: "done",
					no,
					file: step.file,
					chars: step.chars,
					title: chapter.title
				});
				try {
					await summarizeAndExtractFacts(ctx, config, project, config.outputDir, no);
				} catch (error) {
					console.warn("[dsh-novel-forge] summary/facts failed:", error.message);
				}
				try {
					const marked = markForeshadowPlanted(project, config.outputDir, no);
					if (marked > 0) console.log(`[dsh-novel-forge] 第${no}章已埋伏笔 ${marked} 条`);
				} catch (error) {
					console.warn("[dsh-novel-forge] markForeshadowPlanted failed:", error.message);
				}
				if (!(body?.skipReview === true) && (config.autoReview ?? true)) send({
					type: "review",
					no,
					report: await reviewChapter(ctx, config, project, config.outputDir, no)
				});
				else {
					chapter.status = "approved";
					mergeVolatileFromDisk(config.outputDir, project);
					saveProject(config.outputDir, project);
				}
				if (config.autoAuthorReview ?? true) try {
					const currentBody = readChapterFile(config.outputDir, chapter);
					let prevTail = "";
					if (no > 1) {
						const prev = project.chapters.find((c) => c.no === no - 1);
						if (prev !== void 0) prevTail = (readChapterFile(config.outputDir, prev) ?? "").replace(/^#.*$/m, "").trim().slice(-600);
					}
					if (currentBody !== void 0) {
						const review = await authorReviewChapter(ctx, config, project, no, currentBody, prevTail);
						chapter.authorReview = review;
						if (review.advancedLines !== void 0) autoLinkPlotlines(project, no, review.advancedLines);
						mergeVolatileFromDisk(config.outputDir, project);
						saveProject(config.outputDir, project);
						send({
							type: "author-review",
							no,
							review
						});
					}
				} catch (error) {
					console.warn("[dsh-novel-forge] author review failed:", error.message);
				}
				res.end();
			} catch (error) {
				chapter.status = "error";
				chapter.error = error.message;
				mergeVolatileFromDisk(config.outputDir, project);
				saveProject(config.outputDir, project);
				if (!res.writableEnded) {
					send({
						type: "error",
						no,
						message: error.message
					});
					res.end();
				}
			}
		}
	};
	const reviewRoute = {
		kind: "exact",
		path: NOVEL_API.review,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const no = body.chapterNo;
			try {
				writeJson(res, 200, { report: await reviewChapter(ctx, config, project, config.outputDir, no) });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const rewriteRoute = {
		kind: "exact",
		path: NOVEL_API.rewrite,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const no = body.chapterNo;
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache",
				"x-accel-buffering": "no",
				"referrer-policy": "no-referrer"
			});
			const send = (frame) => {
				res.write(JSON.stringify(frame) + "\n");
			};
			try {
				for await (const step of rewriteChapterStream(ctx, config, project, config.outputDir, no, body?.instructions ?? "", body?.target)) if (step.frame === "delta") send({
					type: "delta",
					text: step.text
				});
				else if (step.frame === "drafted") send({
					type: "drafted",
					no,
					chars: step.chars,
					draft: step.draft
				});
				res.end();
			} catch (error) {
				if (!res.writableEnded) {
					send({
						type: "error",
						no,
						message: error.message
					});
					res.end();
				}
			}
		}
	};
	const polishRoute = {
		kind: "exact",
		path: NOVEL_API.polish,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const no = body.chapterNo;
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache",
				"x-accel-buffering": "no",
				"referrer-policy": "no-referrer"
			});
			const send = (frame) => {
				res.write(JSON.stringify(frame) + "\n");
			};
			try {
				for await (const step of polishChapterStream(ctx, config, project, config.outputDir, no)) if (step.frame === "delta") send({
					type: "delta",
					text: step.text
				});
				else if (step.frame === "drafted") send({
					type: "drafted",
					no,
					chars: step.chars,
					draft: step.draft
				});
				res.end();
			} catch (error) {
				if (!res.writableEnded) {
					send({
						type: "error",
						no,
						message: error.message
					});
					res.end();
				}
			}
		}
	};
	/** 采纳待确认草稿：覆盖正文文件 + 状态回 written + 清空草稿。 */
	const draftApplyRoute = {
		kind: "exact",
		path: NOVEL_API.draftApply,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === body.chapterNo);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${body.chapterNo} 不在计划中` });
				return;
			}
			if (chapter.pendingDraft === void 0 || chapter.pendingDraft === "") {
				writeJson(res, 400, { error: `章节 ${chapter.no} 没有待确认的草稿` });
				return;
			}
			const draft = chapter.pendingDraft;
			const fileName = chapterFileName(chapter);
			mkdirSync(config.outputDir, { recursive: true });
			const targetPath = join(config.outputDir, fileName);
			if (existsSync(targetPath)) copyFileSync(targetPath, join(config.outputDir, `${fileName.replace(/\.md$/, "")}.bak.md`));
			writeFileSync(targetPath, `# 第${chapter.no}章 ${chapter.title}\n\n${draft}\n`, "utf8");
			chapter.pendingDraft = void 0;
			chapter.chars = draft.length;
			chapter.file = fileName;
			const carried = body?.report;
			if (carried !== void 0 && typeof carried.score === "number") {
				chapter.review = carried;
				chapter.status = carried.passed ? "approved" : "rejected";
			} else {
				chapter.status = "written";
				chapter.review = void 0;
			}
			chapter.error = void 0;
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				chars: draft.length,
				file: fileName,
				markdown: draft
			});
		}
	};
	/** 放弃待确认草稿：保留原稿，仅清空草稿字段。 */
	const draftDiscardRoute = {
		kind: "exact",
		path: NOVEL_API.draftDiscard,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === body.chapterNo);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${body.chapterNo} 不在计划中` });
				return;
			}
			if (chapter.pendingDraft !== void 0) {
				chapter.pendingDraft = void 0;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
			}
			writeJson(res, 200, { ok: true });
		}
	};
	const summaryRoute = {
		kind: "exact",
		path: NOVEL_API.summary,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			try {
				writeJson(res, 200, { summary: await summarizeChapter(ctx, config, project, config.outputDir, body.chapterNo) });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const foreshadowRoute = {
		kind: "exact",
		path: NOVEL_API.foreshadow,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			try {
				if (body?.suggest === true) {
					const created = await suggestForeshadows(ctx, config, project);
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, { foreshadows: created });
					return;
				}
				if (body?.id !== void 0) {
					const target = project.foreshadows.find((f) => f.id === body.id);
					if (target === void 0) {
						writeJson(res, 404, { error: `伏笔 ${body.id} 不存在` });
						return;
					}
					if (body.description !== void 0) target.description = body.description;
					if (body.plantedChapter !== void 0) target.plantedChapter = body.plantedChapter;
					if (body.targetChapter !== void 0) target.targetChapter = body.targetChapter;
					if (body.status !== void 0) target.status = body.status;
					if (body.resolvedNote !== void 0) target.resolvedNote = body.resolvedNote;
				} else {
					const description = body?.description?.trim();
					if (description === void 0 || description === "") {
						writeJson(res, 400, { error: "description 必填" });
						return;
					}
					project.foreshadows.push({
						id: `fs-${Date.now().toString(36)}`,
						description,
						plantedChapter: body?.plantedChapter,
						targetChapter: body?.targetChapter,
						status: body?.status ?? "planned"
					});
				}
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { foreshadows: project.foreshadows });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const exportRoute = {
		kind: "exact",
		path: NOVEL_API.exportBook,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const format = (await readJsonBody(req))?.format === "md" ? "md" : "txt";
			try {
				writeJson(res, 200, { ...exportBook(config.outputDir, project, format) });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const chapterRoute = {
		kind: "exact",
		path: NOVEL_API.chapter,
		handler: async (req, res) => {
			if (!guard(req, res, "GET")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const url = new URL(req.url ?? "/", "http://localhost");
			const rawNo = Number(url.searchParams.get("no") ?? "0");
			if (!Number.isInteger(rawNo) || rawNo < 1) {
				writeJson(res, 400, { error: "no 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === rawNo);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${rawNo} 不在计划中` });
				return;
			}
			const markdown = readChapterFile(config.outputDir, chapter);
			if (markdown === void 0) {
				writeJson(res, 404, { error: `章节 ${rawNo} 尚未生成` });
				return;
			}
			writeJson(res, 200, {
				no: chapter.no,
				title: chapter.title,
				markdown
			});
		}
	};
	/** 审查手动编辑的正文（不落盘，返回审稿报告）。 */
	const chapterCheckRoute = {
		kind: "exact",
		path: NOVEL_API.chapterCheck,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			const text = body?.text?.trim() ?? "";
			if (text.length < 50) {
				writeJson(res, 400, { error: "正文过短（<50 字），请先编辑内容" });
				return;
			}
			try {
				writeJson(res, 200, { report: await reviewChapterText(ctx, config, project, text, body?.previousReport) });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 保存手动编辑的正文（自动备份 .bak，状态回 written）。 */
	const chapterSaveRoute = {
		kind: "exact",
		path: NOVEL_API.chapterSave,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === body.chapterNo);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${body.chapterNo} 不在计划中` });
				return;
			}
			const text = body?.text?.trim() ?? "";
			if (text.length < 50) {
				writeJson(res, 400, { error: "正文过短（<50 字），未保存" });
				return;
			}
			const fileName = chapterFileName(chapter);
			mkdirSync(config.outputDir, { recursive: true });
			const targetPath = join(config.outputDir, fileName);
			if (existsSync(targetPath)) copyFileSync(targetPath, join(config.outputDir, `${fileName.replace(/\.md$/, "")}.bak.md`));
			writeFileSync(targetPath, `# 第${chapter.no}章 ${chapter.title}\n\n${text}\n`, "utf8");
			chapter.status = "written";
			chapter.chars = text.length;
			chapter.file = fileName;
			chapter.pendingDraft = void 0;
			let report;
			const carried = body?.report;
			if (carried !== void 0 && typeof carried.score === "number") {
				report = carried;
				chapter.review = report;
				chapter.status = report.passed ? "approved" : "rejected";
			} else report = await reviewChapter(ctx, config, project, config.outputDir, chapter.no);
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				chars: text.length,
				file: fileName,
				report
			});
		}
	};
	const assistantRoute = {
		kind: "exact",
		path: NOVEL_API.assistant,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const message = (await readJsonBody(req))?.message?.trim();
			if (message === void 0 || message === "") {
				writeJson(res, 400, { error: "消息不能为空" });
				return;
			}
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache",
				"x-accel-buffering": "no",
				"referrer-policy": "no-referrer"
			});
			const send = (frame) => {
				res.write(JSON.stringify(frame) + "\n");
			};
			try {
				for await (const step of runAssistantTurn(ctx, config, project, config.outputDir, message)) if (step.frame === "delta") send({
					type: "delta",
					text: step.text
				});
				else if (step.frame === "tool") send({
					type: "tool",
					name: step.name,
					status: step.status,
					detail: step.detail
				});
				else if (step.frame === "toolDelta") send({
					type: "toolDelta",
					name: step.name,
					text: step.text
				});
				send({ type: "done" });
				res.end();
			} catch (error) {
				if (!res.writableEnded) {
					send({
						type: "error",
						message: error.message
					});
					res.end();
				}
			}
		}
	};
	const assistantHistoryRoute = {
		kind: "exact",
		path: NOVEL_API.assistantHistory,
		handler: (req, res) => {
			if (!guard(req, res, "GET")) return;
			writeJson(res, 200, { messages: loadAssistantHistory(getConfig().outputDir) });
		}
	};
	/** 清空助手对话记录。 */
	const assistantClearRoute = {
		kind: "exact",
		path: NOVEL_API.assistantClear,
		handler: (req, res) => {
			if (!guard(req, res, "POST")) return;
			clearAssistantHistory(getConfig().outputDir);
			writeJson(res, 200, { ok: true });
		}
	};
	const assetsRoute = {
		kind: "exact",
		path: NOVEL_API.assets,
		handler: async (req, res) => {
			if (req.method !== "GET" && req.method !== "POST") {
				writeJson(res, 405, { error: "method not allowed (expected GET or POST)" });
				return;
			}
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "forbidden: loopback-only" });
				return;
			}
			const config = getConfig();
			const project = loadProject(config.outputDir);
			const projectAssets = project?.assets ?? emptyProjectAssets();
			if (req.method === "POST") {
				const body = await readJsonBody(req);
				if (body === void 0) {
					writeJson(res, 400, { error: "无效的 JSON" });
					return;
				}
				if (project === void 0) {
					writeJson(res, 400, { error: "请先加载大纲创建项目" });
					return;
				}
				if (body.genre !== void 0) projectAssets.genre = body.genre;
				if (body.primaryProgression !== void 0) projectAssets.primaryProgression = body.primaryProgression;
				if (body.auxiliaryProgressions !== void 0) projectAssets.auxiliaryProgressions = body.auxiliaryProgressions;
				if (body.antiAiRules !== void 0) projectAssets.antiAiRules = body.antiAiRules;
				if (body.styleAssets !== void 0) projectAssets.styleAssets = body.styleAssets;
				projectAssets.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				project.assets = projectAssets;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
			}
			writeJson(res, 200, {
				projectAssets,
				genreLibrary: BUILTIN_GENRE_LIBRARY,
				antiAiLibrary: BUILTIN_ANTI_AI_RULES,
				styleTemplates: BUILTIN_STYLE_TEMPLATES,
				progressionLibrary: BUILTIN_PROGRESSION_MODES
			});
		}
	};
	const styleEngineRoute = {
		kind: "exact",
		path: NOVEL_API.styleEngine,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = loadProject(config.outputDir);
			const body = await readJsonBody(req);
			const sample = body?.sampleText?.trim();
			if (sample === void 0 || sample.length < 50) {
				writeJson(res, 400, { error: "样本文本过短（<50 字符），请粘贴一段能代表目标风格的文字" });
				return;
			}
			try {
				const rules = await extractStyleAsset(ctx, config, sample);
				const styleAsset = {
					name: (body?.name?.trim() !== "" && body?.name !== void 0 ? body.name : `风格资产 ${Date.now().toString(36)}`).slice(0, 40),
					...rules,
					sourceText: sample.slice(0, 3e3),
					createdAt: (/* @__PURE__ */ new Date()).toISOString()
				};
				if (project !== void 0) {
					project.assets ??= emptyProjectAssets();
					project.assets.styleAssets ??= [];
					project.assets.styleAssets.push(styleAsset);
					project.assets.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
				}
				writeJson(res, 200, { styleAsset });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const bookshelfRoute = {
		kind: "exact",
		path: NOVEL_API.bookshelf,
		handler: async (req, res) => {
			if (req.method === "GET") {
				if (!isLoopbackRequest(req)) {
					writeJson(res, 403, { error: "forbidden: loopback-only" });
					return;
				}
				seedBookshelfFromOutputDir(getConfig().outputDir);
				writeJson(res, 200, bookshelfSnapshot(loadBookshelf()));
				return;
			}
			if (req.method === "POST") {
				if (!isLoopbackRequest(req)) {
					writeJson(res, 403, { error: "forbidden: loopback-only" });
					return;
				}
				const body = await readJsonBody(req);
				const bookName = body?.bookName?.trim();
				if (bookName === void 0 || bookName === "") {
					writeJson(res, 400, { error: "bookName 不能为空" });
					return;
				}
				const outputDir = body?.outputDir?.trim() !== "" && body?.outputDir !== void 0 ? body.outputDir : defaultOutputDirFor(bookName);
				const book = createBook(bookName, outputDir);
				const outline = body?.outline?.trim();
				if (outline !== void 0 && outline.length >= 50) {
					const project = createProject(outline);
					saveProject(outputDir, project);
					renameBook(book.id, project.bookName);
				}
				writeJson(res, 200, bookshelfSnapshot(loadBookshelf()));
				return;
			}
			writeJson(res, 405, { error: "method not allowed (expected GET or POST)" });
		}
	};
	/** 重置项目：清空设定/卷/章节计划/正文/伏笔/资产/事实库（可携带新大纲）。 */
	const resetRoute = {
		kind: "exact",
		path: NOVEL_API.reset,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = loadProject(config.outputDir);
			if (project === void 0) {
				writeJson(res, 400, { error: "输出目录中没有项目，无需重置" });
				return;
			}
			const outline = (await readJsonBody(req))?.outline?.trim();
			if (outline !== void 0 && outline.length >= 50) {
				project.outline = outline;
				project.bookName = createProject(outline).bookName;
			}
			project.bible = void 0;
			project.volumes = void 0;
			project.chapters = [];
			project.foreshadows = [];
			project.assets = emptyProjectAssets();
			project.facts = [];
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				bookName: project.bookName
			});
		}
	};
	const bookshelfActivateRoute = {
		kind: "exact",
		path: "/api/dsh-novel-forge/bookshelf/activate",
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body?.id === void 0 || body.id === "") {
				writeJson(res, 400, { error: "id 不能为空" });
				return;
			}
			if (activateBook(body.id) === void 0) {
				writeJson(res, 404, { error: `书 ${body.id} 不存在` });
				return;
			}
			writeJson(res, 200, bookshelfSnapshot(loadBookshelf()));
		}
	};
	const bookshelfRemoveRoute = {
		kind: "exact",
		path: "/api/dsh-novel-forge/bookshelf/remove",
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body?.id === void 0 || body.id === "") {
				writeJson(res, 400, { error: "id 不能为空" });
				return;
			}
			if (!removeBook(body.id)) {
				writeJson(res, 404, { error: `书 ${body.id} 不存在` });
				return;
			}
			writeJson(res, 200, bookshelfSnapshot(loadBookshelf()));
		}
	};
	/** 导入已有项目目录（Mode A）：校验 novel-project.json，登记/激活书架。 */
	const bookshelfImportDirRoute = {
		kind: "exact",
		path: NOVEL_API.bookshelfImportDir,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const outputDir = (await readJsonBody(req))?.outputDir?.trim();
			if (outputDir === void 0 || outputDir === "") {
				writeJson(res, 400, { error: "outputDir 不能为空" });
				return;
			}
			try {
				const { book, existed } = importDir(outputDir);
				writeJson(res, 200, {
					book,
					existed
				});
			} catch (err) {
				writeJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
			}
		}
	};
	/** 导入 txt/md 全本（Mode B）：拆章落盘建项目，登记书架。支持浏览器上传（text+fileName）与服务器本地文件（filePath）两种模式。 */
	const bookshelfImportTextRoute = {
		kind: "exact",
		path: NOVEL_API.bookshelfImportText,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			try {
				if (body?.text !== void 0 && body.text.length > 0) {
					const bookName = (body.fileName ?? "").replace(/\.[^.]+$/, "").trim().slice(0, 40) || "导入小说";
					const outDir = body?.outputDir?.trim() !== void 0 && body.outputDir.trim() !== "" ? body.outputDir.trim() : defaultOutputDirFor(bookName);
					const result = importBookTextFromText(body.text, outDir, bookName);
					const { book } = importDir(outDir);
					writeJson(res, 200, {
						...result,
						book
					});
					return;
				}
				const filePath = body?.filePath?.trim();
				if (filePath === void 0 || filePath === "") {
					writeJson(res, 400, { error: "filePath 不能为空（或请上传文件内容）" });
					return;
				}
				if (!existsSync(filePath)) {
					writeJson(res, 400, { error: `文件不存在：${filePath}` });
					return;
				}
				const bookName = basename(filePath, extname(filePath)).slice(0, 40) || "导入小说";
				const outDir = body?.outputDir?.trim() !== void 0 && body.outputDir.trim() !== "" ? body.outputDir.trim() : defaultOutputDirFor(bookName);
				const result = importBookText(filePath, outDir);
				const { book } = importDir(outDir);
				writeJson(res, 200, {
					...result,
					book
				});
			} catch (err) {
				writeJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
			}
		}
	};
	/** 上传全文做拆章预览（不落盘、不登记书架）。 */
	const bookshelfImportTextPreviewRoute = {
		kind: "exact",
		path: NOVEL_API.bookshelfImportTextPreview,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body?.text === void 0 || body.text.length === 0) {
				writeJson(res, 400, { error: "text 不能为空" });
				return;
			}
			try {
				writeJson(res, 200, {
					bookName: (body.fileName ?? "").replace(/\.[^.]+$/, "").trim().slice(0, 40) || "导入小说",
					...previewBookText(body.text)
				});
			} catch (err) {
				writeJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
			}
		}
	};
	/** 全书一致性质检。 */
	const auditRoute = {
		kind: "exact",
		path: NOVEL_API.audit,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const startedAt = (/* @__PURE__ */ new Date()).toISOString();
			auditState = {
				status: "running",
				startedAt,
				totalBatches: 0,
				completedBatches: 0
			};
			try {
				const issues = await auditBook(ctx, config, project, config.outputDir, (completed, total) => {
					auditState.totalBatches = total;
					auditState.completedBatches = completed;
				});
				const auditedChapters = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating").length;
				auditState = {
					status: "done",
					startedAt,
					finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
					totalBatches: auditState.totalBatches,
					completedBatches: auditState.totalBatches,
					auditedChapters,
					issuesCount: issues.length,
					issues
				};
				writeJson(res, 200, {
					issues,
					auditedChapters,
					auditedAt: auditState.finishedAt
				});
			} catch (error) {
				auditState = {
					...auditState,
					status: "error",
					finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
					error: error.message
				};
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 角色卡刷新（出场统计精确化 + LLM 聚合状态）。 */
	const charactersRefreshRoute = {
		kind: "exact",
		path: NOVEL_API.charactersRefresh,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			try {
				const cards = await refreshCharacters(ctx, config, project, config.outputDir);
				project.roleStatus = cards;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { cards });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 事实库回填：对历史已生成章节批量抽取事实。 */
	const factsBackfillRoute = {
		kind: "exact",
		path: NOVEL_API.factsBackfill,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			try {
				writeJson(res, 200, {
					ok: true,
					filled: await backfillFacts(ctx, config, project, config.outputDir)
				});
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 设定圣经局部修补（世界观规则/红线/风格）。 */
	const biblePatchRoute = {
		kind: "exact",
		path: NOVEL_API.biblePatch,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			if (project.bible === void 0) {
				writeJson(res, 400, { error: "尚未生成道藏，请先生成" });
				return;
			}
			const body = await readJsonBody(req);
			if (Array.isArray(body?.worldRules)) project.bible.worldRules = body.worldRules.filter((r) => r.trim() !== "");
			if (Array.isArray(body?.redLines)) project.bible.redLines = body.redLines.filter((r) => r.trim() !== "");
			if (Array.isArray(body?.style)) project.bible.style = body.style.filter((r) => r.trim() !== "");
			if (Array.isArray(body?.characters)) project.bible.characters = body.characters.filter((c) => c !== void 0 && c !== null && typeof c.name === "string" && c.name.trim() !== "").map((c) => ({
				name: c.name.trim(),
				role: [
					"protagonist",
					"supporting",
					"antagonist",
					"other"
				].includes(c.role) ? c.role : "other",
				traits: Array.isArray(c.traits) ? c.traits.filter((t) => typeof t === "string" && t.trim() !== "") : [],
				goals: typeof c.goals === "string" ? c.goals : "",
				relations: typeof c.relations === "string" ? c.relations : "",
				knowledge: Array.isArray(c.knowledge) ? c.knowledge.filter((k) => typeof k === "string" && k.trim() !== "") : void 0
			}));
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, { bible: project.bible });
		}
	};
	/** 小说简介：AI 生成/补全，或手动保存。 */
	const blurbRoute = {
		kind: "exact",
		path: NOVEL_API.blurb,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			try {
				if (body?.action === "save") {
					const text = body.text?.trim() ?? "";
					project.blurb = text;
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, { blurb: text });
					return;
				}
				const partial = body?.partial?.trim() ?? "";
				const blurb = await generateBlurb(ctx, config, project, partial);
				project.blurb = blurb;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { blurb });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 封面：GET 读取（dataUrl）；POST 上传（base64）或移除。 */
	const coverRoute = {
		kind: "exact",
		path: NOVEL_API.cover,
		handler: async (req, res) => {
			const config = getConfig();
			if (req.method === "GET") {
				if (!isLoopbackRequest(req)) {
					writeJson(res, 403, { error: "forbidden: loopback-only" });
					return;
				}
				const dirParam = new URL(req.url ?? "/", "http://localhost").searchParams.get("dir");
				const targetDir = dirParam !== null && dirParam !== "" ? dirParam : config.outputDir;
				const coverPath = loadProject(targetDir)?.coverPath;
				if (coverPath === void 0 || coverPath === "") {
					writeJson(res, 200, { dataUrl: null });
					return;
				}
				const file = join(targetDir, coverPath);
				if (!existsSync(file)) {
					writeJson(res, 200, { dataUrl: null });
					return;
				}
				writeJson(res, 200, { dataUrl: `data:${coverPath.toLowerCase().endsWith(".png") ? "image/png" : coverPath.toLowerCase().endsWith(".jpg") || coverPath.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : coverPath.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png"};base64,${readFileSync(file).toString("base64")}` });
				return;
			}
			if (req.method === "POST") {
				if (!guard(req, res, "POST")) return;
				const project = requireProject(res);
				if (project === void 0) return;
				const body = await readJsonBody(req);
				try {
					if (body?.action === "remove") {
						if (project.coverPath !== void 0 && project.coverPath !== "") {
							const oldFile = join(config.outputDir, project.coverPath);
							if (existsSync(oldFile)) rmSync(oldFile, { force: true });
						}
						project.coverPath = void 0;
						project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
						saveProject(config.outputDir, project);
						writeJson(res, 200, {
							ok: true,
							coverPath: null
						});
						return;
					}
					const dataUrl = body?.dataUrl ?? "";
					const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/s.exec(dataUrl);
					if (match === null) {
						writeJson(res, 400, { error: "封面须为 PNG/JPEG/WebP 的 base64 data URL" });
						return;
					}
					const mime = match[1];
					const fileName = `cover.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
					const targetPath = join(config.outputDir, fileName);
					const oldPath = project.coverPath;
					mkdirSync(config.outputDir, { recursive: true });
					writeFileSync(targetPath, Buffer.from(match[2], "base64"));
					if (oldPath !== void 0 && oldPath !== "" && oldPath !== fileName) {
						const oldFile = join(config.outputDir, oldPath);
						if (existsSync(oldFile)) rmSync(oldFile, { force: true });
					}
					project.coverPath = fileName;
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, {
						ok: true,
						coverPath: fileName
					});
				} catch (error) {
					writeJson(res, 500, { error: error.message });
				}
				return;
			}
			writeJson(res, 405, { error: "method not allowed (expected GET or POST)" });
		}
	};
	/** 大世界：AI 提炼或手动保存（境界体系/区域/势力）。 */
	const worldRoute = {
		kind: "exact",
		path: NOVEL_API.world,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			try {
				if (body?.action === "save" && body.world !== void 0) {
					project.world = {
						realms: Array.isArray(body.world.realms) ? body.world.realms : [],
						regions: Array.isArray(body.world.regions) ? body.world.regions : [],
						factions: Array.isArray(body.world.factions) ? body.world.factions : []
					};
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, { world: project.world });
					return;
				}
				const world = await extractWorld(ctx, config, project);
				project.world = world;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { world });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 重命名当前书：同步项目 bookName 与书架条目。 */
	const renameRoute = {
		kind: "exact",
		path: NOVEL_API.rename,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const bookName = (await readJsonBody(req))?.bookName?.trim();
			if (bookName === void 0 || bookName === "") {
				writeJson(res, 400, { error: "书名不能为空" });
				return;
			}
			project.bookName = bookName.slice(0, 60);
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			const store = loadBookshelf();
			if (store.activeBookId !== null) renameBook(store.activeBookId, project.bookName);
			writeJson(res, 200, { bookName: project.bookName });
		}
	};
	/** 剧情线管理：增删改 + 关联章节（主线/支线/人物线/悬念线）。 */
	const plotlinesRoute = {
		kind: "exact",
		path: NOVEL_API.plotlines,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (project.plotlines === void 0) project.plotlines = [];
			const op = body?.op;
			if (op === "add" && body?.line !== void 0) {
				const line = body.line;
				project.plotlines.push({
					id: line.id !== "" ? line.id : `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					name: line.name.slice(0, 40),
					kind: line.kind,
					goal: line.goal.slice(0, 300),
					progress: line.progress.slice(0, 300),
					status: line.status,
					chapters: Array.isArray(line.chapters) ? line.chapters.filter((n) => typeof n === "number") : [],
					createdAt: line.createdAt !== "" ? line.createdAt : (/* @__PURE__ */ new Date()).toISOString()
				});
			} else if (op === "update" && body?.line !== void 0 && body.line.id !== "") {
				const idx = project.plotlines.findIndex((l) => l.id === body.line.id);
				if (idx !== -1) {
					const line = body.line;
					project.plotlines[idx] = {
						...project.plotlines[idx],
						name: line.name.slice(0, 40),
						kind: line.kind,
						goal: line.goal.slice(0, 300),
						progress: line.progress.slice(0, 300),
						status: line.status
					};
				}
			} else if (op === "remove" && body?.id !== void 0) project.plotlines = project.plotlines.filter((l) => l.id !== body.id);
			else if (op === "link" && body?.id !== void 0 && typeof body.chapterNo === "number" && body.chapterNo > 0) {
				const line = project.plotlines.find((l) => l.id === body.id);
				if (line !== void 0 && !line.chapters.includes(body.chapterNo)) {
					line.chapters.push(body.chapterNo);
					if (line.status === "active" && line.progress === "") line.progress = `推进至第 ${body.chapterNo} 章`;
				}
			} else if (op === "suggest") try {
				const suggestions = await suggestPlotlines(ctx, config, project);
				writeJson(res, 200, {
					plotlines: project.plotlines,
					suggestions
				});
				return;
			} catch (error) {
				writeJson(res, 500, { error: `AI 建议失败：${error.message}` });
				return;
			}
			else if (op === "refresh" && body?.id !== void 0) {
				const line = project.plotlines.find((l) => l.id === body.id);
				if (line === void 0) {
					writeJson(res, 404, { error: "剧情线不存在" });
					return;
				}
				try {
					line.progress = await refreshPlotlineProgress(ctx, config, project, line);
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, { plotlines: project.plotlines });
					return;
				} catch (error) {
					writeJson(res, 500, { error: `刷新进度失败：${error.message}` });
					return;
				}
			} else if (op === "health") try {
				const health = await analyzePlotlineHealth(ctx, config, project);
				writeJson(res, 200, {
					plotlines: project.plotlines,
					health
				});
				return;
			} catch (error) {
				writeJson(res, 500, { error: `健康检查失败：${error.message}` });
				return;
			}
			else if (op === "plan") try {
				const health = await analyzePlotlineHealth(ctx, config, project);
				const plan = await designPlotlinePlan(ctx, config, project, health);
				writeJson(res, 200, {
					plotlines: project.plotlines,
					health,
					plan
				});
				return;
			} catch (error) {
				writeJson(res, 500, { error: `剧情方案生成失败：${error.message}` });
				return;
			}
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, { plotlines: project.plotlines });
		}
	};
	/** 敏感词检查：指定章节 / 任意文本 / 全书已写章节。 */
	const sensitiveRoute = {
		kind: "exact",
		path: NOVEL_API.sensitiveCheck,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			const hits = [];
			let scanned = 0;
			if (body?.text !== void 0) for (const hit of checkSensitiveText(body.text)) hits.push({
				chapterNo: 0,
				word: hit.word,
				category: hit.category,
				count: hit.count
			});
			else if (typeof body?.chapterNo === "number") {
				const chapter = project.chapters.find((c) => c.no === body.chapterNo);
				if (chapter !== void 0) {
					const text = readChapterFile(config.outputDir, chapter);
					if (text !== void 0) {
						scanned = 1;
						for (const hit of checkSensitiveText(text)) hits.push({
							chapterNo: chapter.no,
							word: hit.word,
							category: hit.category,
							count: hit.count
						});
					}
				}
			} else if (body?.all === true) for (const chapter of project.chapters) {
				if (chapter.status === "pending" || chapter.status === "generating") continue;
				const text = readChapterFile(config.outputDir, chapter);
				if (text === void 0) continue;
				scanned++;
				for (const hit of checkSensitiveText(text)) hits.push({
					chapterNo: chapter.no,
					word: hit.word,
					category: hit.category,
					count: hit.count
				});
			}
			else {
				writeJson(res, 400, { error: "请提供 chapterNo / text / all 之一" });
				return;
			}
			writeJson(res, 200, {
				hits,
				scannedChapters: scanned
			});
		}
	};
	/** 角色库：AI 提炼 / 采纳 / 更新 / 删除。 */
	const rolesRoute = {
		kind: "exact",
		path: NOVEL_API.roles,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (project.roles === void 0) project.roles = [];
			const op = body?.op;
			if (op === "extract") try {
				const candidates = await extractRoles(ctx, config, project);
				writeJson(res, 200, {
					roles: project.roles,
					candidates
				});
				return;
			} catch (error) {
				writeJson(res, 500, { error: `角色提炼失败：${error.message}` });
				return;
			}
			else if ((op === "adopt" || op === "update") && body?.role !== void 0) {
				const r = body.role;
				const idx = project.roles.findIndex((x) => x.name === r.name);
				if (idx === -1) project.roles.push(r);
				else project.roles[idx] = r;
			} else if (op === "remove" && body?.name !== void 0) project.roles = project.roles.filter((x) => x.name !== body.name);
			else if (op === "image") {
				const name = body?.name?.trim();
				const dataUrl = body?.dataUrl?.trim();
				if (name === void 0 || name === "") {
					writeJson(res, 400, { error: "name（角色名）必填" });
					return;
				}
				if (dataUrl === void 0 || dataUrl === "") {
					writeJson(res, 400, { error: "dataUrl（参考图）必填" });
					return;
				}
				const role = project.roles.find((r) => r.name === name);
				if (role === void 0) {
					writeJson(res, 404, { error: `当前激活《${project.bookName}》，角色 ${name} 不存在——若期望的书不对，请先在书架切换该书并刷新` });
					return;
				}
				const label = body?.label?.trim() ?? "";
				if (label !== "") {
					role.gallery ??= [];
					role.gallery = role.gallery.filter((g) => g.label !== label);
					role.gallery.push({
						label,
						dataUrl
					});
					if (label === "立绘" || label.includes("立绘")) role.imageUrl = dataUrl;
				} else role.imageUrl = dataUrl;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, {
					roles: project.roles,
					imageUrl: role.imageUrl
				});
				return;
			} else if (op === "removeImage") {
				const name = body?.name?.trim();
				const label = body?.label?.trim() ?? "";
				const role = project.roles.find((r) => r.name === name);
				if (role !== void 0) if (label !== "") {
					role.gallery = (role.gallery ?? []).filter((g) => g.label !== label);
					if (label === "立绘" || label.includes("立绘")) role.imageUrl = void 0;
				} else role.imageUrl = void 0;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { roles: project.roles });
				return;
			} else if (op === "imageGenerate") {
				const name = body?.name?.trim();
				if (name === void 0 || name === "") {
					writeJson(res, 400, { error: "name（角色名）必填" });
					return;
				}
				try {
					const imageUrl = await generateRoleReferenceImage(ctx, config, project, config.outputDir, name, body?.style ?? "", body?.modelId);
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, {
						roles: project.roles,
						imageUrl
					});
					return;
				} catch (error) {
					writeJson(res, 500, { error: `角色参考图生成失败：${error.message}` });
					return;
				}
			} else if (op === "visual") {
				const name = body?.name?.trim();
				if (name === void 0 || name === "") {
					writeJson(res, 400, { error: "name（角色名）必填" });
					return;
				}
				try {
					const visual = await extractRoleVisual(ctx, config, project, config.outputDir, name, body?.styleId, body?.filterId);
					const role = project.roles.find((r) => r.name === name);
					if (role !== void 0) {
						role.imagePrompt = visual;
						if ((visual.expressions ?? []).length > 0) role.expressions = visual.expressions;
						if (visual.promptKit !== void 0) role.promptKit = visual.promptKit;
					}
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, {
						roles: project.roles,
						visual
					});
					return;
				} catch (error) {
					writeJson(res, 500, { error: `形象提炼失败：${error.message}` });
					return;
				}
			} else if (op === "promptKit") {
				const name = body?.name?.trim();
				if (name === void 0 || name === "") {
					writeJson(res, 400, { error: "name（角色名）必填" });
					return;
				}
				try {
					const kit = await generateRolePromptKit(ctx, config, project, name, body?.styleId, body?.filterId);
					const role = project.roles.find((r) => r.name === name);
					if (role !== void 0) role.promptKit = kit;
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, {
						roles: project.roles,
						promptKit: kit
					});
					return;
				} catch (error) {
					writeJson(res, 500, { error: `提示词精修失败：${error.message}` });
					return;
				}
			} else {
				writeJson(res, 400, { error: "未知的 roles op" });
				return;
			}
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, { roles: project.roles });
		}
	};
	/** 漫剧角色库：从分镜提名（规则+LLM 两段式）/ 建卡 / 更新 / 删除 / 形象锚点 / 精修提示词。 */
	const mangaRolesRoute = {
		kind: "exact",
		path: NOVEL_API.mangaRoles,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (project.mangaRoles === void 0) project.mangaRoles = [];
			const op = body?.op;
			if (op === "nominate") {
				const chapterNo = body?.chapterNo;
				if (typeof chapterNo !== "number" || chapterNo <= 0) {
					writeJson(res, 400, { error: "chapterNo（章号）必填" });
					return;
				}
				try {
					const candidates = await nominateMangaRoles(ctx, config, project, config.outputDir, chapterNo);
					writeJson(res, 200, {
						cards: project.mangaRoles,
						candidates
					});
					return;
				} catch (error) {
					writeJson(res, 500, { error: `提名失败：${error.message}` });
					return;
				}
			} else if (op === "adopt" || op === "update") {
				const card = body?.card;
				if (card === void 0 || typeof card !== "object") {
					writeJson(res, 400, { error: "card（漫剧角色卡）必填" });
					return;
				}
				const name = (card.name ?? "").trim();
				if (name === "") {
					writeJson(res, 400, { error: "漫剧角色名不能为空" });
					return;
				}
				const now = (/* @__PURE__ */ new Date()).toISOString();
				const existing = card.id !== "" ? project.mangaRoles.find((c) => c.id === card.id) : void 0;
				const next = {
					id: card.id !== "" ? card.id : "mr-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
					sourceRoleName: card.sourceRoleName !== void 0 && card.sourceRoleName !== "" ? card.sourceRoleName : void 0,
					name,
					identity: card.identity ?? "",
					coreFunction: card.coreFunction ?? "functional",
					protagonistRelation: card.protagonistRelation ?? "neutral",
					speechStyle: card.speechStyle ?? "",
					traits: Array.isArray(card.traits) ? card.traits.map((t) => String(t).slice(0, 20)).filter((t) => t !== "").slice(0, 3) : [],
					appearance: card.appearance ?? "",
					keyScenes: Array.isArray(card.keyScenes) ? card.keyScenes.map((k) => String(k).slice(0, 120)).filter((k) => k !== "").slice(0, 6) : [],
					appearsInEpisodes: Array.isArray(card.appearsInEpisodes) ? [...new Set(card.appearsInEpisodes.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b).slice(0, 200) : [],
					status: card.status ?? "imported",
					imagePrompt: card.imagePrompt,
					expressions: card.expressions,
					promptKit: card.promptKit,
					imageUrl: card.imageUrl,
					gallery: card.gallery,
					promptStyleId: card.promptStyleId,
					createdAt: existing?.createdAt ?? now,
					updatedAt: now
				};
				if (existing !== void 0) {
					const idx = project.mangaRoles.findIndex((c) => c.id === card.id);
					project.mangaRoles[idx] = next;
				} else project.mangaRoles.push(next);
				project.updatedAt = now;
				saveProject(config.outputDir, project);
				writeJson(res, 200, { cards: project.mangaRoles });
				return;
			} else if (op === "remove") {
				const id = body?.id;
				if (typeof id !== "string" || id === "") {
					writeJson(res, 400, { error: "id（漫剧卡 id）必填" });
					return;
				}
				project.mangaRoles = project.mangaRoles.filter((c) => c.id !== id);
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { cards: project.mangaRoles });
				return;
			} else if (op === "visual") {
				const id = body?.id?.trim();
				if (id === void 0 || id === "") {
					writeJson(res, 400, { error: "id（漫剧卡 id）必填" });
					return;
				}
				try {
					const visual = await extractMangaRoleVisual(ctx, config, project, config.outputDir, id, body?.styleId, body?.filterId);
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, {
						cards: project.mangaRoles,
						visual
					});
					return;
				} catch (error) {
					writeJson(res, 500, { error: `形象锚点生成失败：${error.message}` });
					return;
				}
			} else if (op === "promptKit") {
				const id = body?.id?.trim();
				if (id === void 0 || id === "") {
					writeJson(res, 400, { error: "id（漫剧卡 id）必填" });
					return;
				}
				try {
					const kit = await generateMangaRolePromptKit(ctx, config, project, id, body?.styleId, body?.filterId);
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, {
						cards: project.mangaRoles,
						promptKit: kit
					});
					return;
				} catch (error) {
					writeJson(res, 500, { error: `提示词精修失败：${error.message}` });
					return;
				}
			} else if (op === "image") {
				const id = body?.id?.trim();
				const dataUrl = body?.dataUrl?.trim();
				if (id === void 0 || id === "") {
					writeJson(res, 400, { error: "id（漫剧卡 id）必填" });
					return;
				}
				if (dataUrl === void 0 || dataUrl === "") {
					writeJson(res, 400, { error: "dataUrl（定妆图）必填" });
					return;
				}
				const card = project.mangaRoles.find((c) => c.id === id);
				if (card === void 0) {
					writeJson(res, 404, { error: "漫剧角色卡不存在" });
					return;
				}
				const label = body?.label?.trim() ?? "";
				if (label !== "") {
					card.gallery ??= [];
					card.gallery = card.gallery.filter((g) => g.label !== label);
					card.gallery.push({
						label,
						dataUrl
					});
					if (label.includes("立绘")) card.imageUrl = dataUrl;
				} else card.imageUrl = dataUrl;
				card.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, {
					cards: project.mangaRoles,
					imageUrl: card.imageUrl
				});
				return;
			} else if (op === "removeImage") {
				const id = body?.id?.trim();
				const label = body?.label?.trim() ?? "";
				const card = project.mangaRoles.find((c) => c.id === id);
				if (card !== void 0) {
					if (label !== "") {
						card.gallery = (card.gallery ?? []).filter((g) => g.label !== label);
						if (label.includes("立绘")) card.imageUrl = void 0;
					} else card.imageUrl = void 0;
					card.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				}
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { cards: project.mangaRoles });
				return;
			} else if (op === "imageGenerate") {
				const id = body?.id?.trim();
				if (id === void 0 || id === "") {
					writeJson(res, 400, { error: "id（漫剧卡 id）必填" });
					return;
				}
				try {
					const imageUrl = await generateMangaRoleReferenceImage(ctx, config, project, config.outputDir, id, body?.style ?? "", body?.modelId);
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, {
						cards: project.mangaRoles,
						imageUrl
					});
					return;
				} catch (error) {
					writeJson(res, 500, { error: `定妆图生成失败：${error.message}` });
					return;
				}
			} else if (op === "mode") {
				project.shortDramaMode = body?.shortDramaMode === true;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, {
					cards: project.mangaRoles,
					shortDramaMode: project.shortDramaMode
				});
				return;
			} else {
				writeJson(res, 400, { error: "未知的 manga/roles op" });
				return;
			}
		}
	};
	/** 章节复位：generating 卡死 → pending（可重新生成）。 */
	const chapterResetRoute = {
		kind: "exact",
		path: NOVEL_API.chapterReset,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const no = (await readJsonBody(req))?.chapterNo;
			if (!Number.isInteger(no) || no === void 0 || no < 1) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === no);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${no} 不在计划中` });
				return;
			}
			chapter.status = "pending";
			chapter.error = void 0;
			chapter.generatingAt = void 0;
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				no
			});
		}
	};
	/** 章节直接通过：作者行使最终决定权（不重审，保留审稿记录）。 */
	const chapterApproveRoute = {
		kind: "exact",
		path: NOVEL_API.chapterApprove,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const no = (await readJsonBody(req))?.chapterNo;
			if (!Number.isInteger(no) || no === void 0 || no < 1) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === no);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${no} 不在计划中` });
				return;
			}
			chapter.status = "approved";
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				no
			});
		}
	};
	/** 作者复盘补跑：对已写章节补齐 authorReview（body.chapterNo=单章 JSON，缺省=全书 NDJSON 流）。 */
	const reviewBackfillRoute = {
		kind: "exact",
		path: NOVEL_API.reviewBackfill,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			/** 对一章执行作者复盘（读取已落盘正文，不改变章节状态/正文）。 */
			const runOne = async (chapter) => {
				const currentBody = readChapterFile(config.outputDir, chapter);
				if (currentBody === void 0) throw new Error(`章节 ${chapter.no} 的正文文件不存在`);
				let prevTail = "";
				if (chapter.no > 1) {
					const prev = project.chapters.find((c) => c.no === chapter.no - 1);
					if (prev !== void 0) prevTail = (readChapterFile(config.outputDir, prev) ?? "").replace(/^#.*$/m, "").trim().slice(-600);
				}
				return authorReviewChapter(ctx, config, project, chapter.no, currentBody, prevTail);
			};
			if (typeof body?.chapterNo === "number" && body.chapterNo > 0) {
				const chapter = project.chapters.find((c) => c.no === body.chapterNo);
				if (chapter === void 0) {
					writeJson(res, 404, { error: `章节 ${body.chapterNo} 不在计划中` });
					return;
				}
				if (chapter.status === "pending") {
					writeJson(res, 400, { error: "该章尚未生成正文，无法复盘" });
					return;
				}
				try {
					const review = await runOne(chapter);
					chapter.authorReview = review;
					if (review.advancedLines !== void 0) autoLinkPlotlines(project, chapter.no, review.advancedLines);
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, {
						no: chapter.no,
						review
					});
					return;
				} catch (error) {
					writeJson(res, 500, { error: error.message });
					return;
				}
			}
			const missing = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating" && c.status !== "error" && c.authorReview === void 0);
			if (missing.length === 0) {
				writeJson(res, 200, { count: 0 });
				return;
			}
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache",
				"referrer-policy": "no-referrer"
			});
			const send = (frame) => {
				res.write(JSON.stringify(frame) + "\n");
			};
			let done = 0;
			for (const chapter of missing) try {
				const review = await runOne(chapter);
				chapter.authorReview = review;
				if (review.advancedLines !== void 0) autoLinkPlotlines(project, chapter.no, review.advancedLines);
				done++;
				saveProject(config.outputDir, project);
				send({
					type: "author-review",
					no: chapter.no,
					review
				});
			} catch (error) {
				console.warn(`[dsh-novel-forge] author backfill ch.${chapter.no} failed:`, error.message);
			}
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			send({
				type: "author-backfill-done",
				count: done
			});
			res.end();
		}
	};
	const configRoute = {
		kind: "exact",
		path: NOVEL_API.config,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body === void 0) {
				writeJson(res, 400, { error: "无效的配置 JSON" });
				return;
			}
			try {
				writeJson(res, 200, { config: await patchConfig(body) });
			} catch (error) {
				writeJson(res, 400, { error: error.message });
			}
		}
	};
	const openFolderRoute = {
		kind: "exact",
		path: NOVEL_API.openFolder,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const dir = getConfig().outputDir;
			const child = spawn("explorer", [dir], { shell: false });
			let responded = false;
			child.on("error", (error) => {
				if (responded) return;
				responded = true;
				writeJson(res, 500, {
					ok: false,
					error: error.message
				});
			});
			child.on("exit", (code) => {
				if (responded) return;
				responded = true;
				if (code === 0) writeJson(res, 200, { ok: true });
				else writeJson(res, 500, {
					ok: false,
					error: `explorer 退出码 ${code}`
				});
			});
		}
	};
	/** 开书想法 → AI 大纲：2-3 个可选方案（支持暂留换批：count 只补空槽 + exclude 避开已留方向）。 */
	const outlineSuggestRoute = {
		kind: "exact",
		path: NOVEL_API.outlineSuggest,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const body = await readJsonBody(req);
			const idea = body?.idea?.trim() ?? "";
			if (idea.length < 50) {
				writeJson(res, 400, { error: "想法太短（<50 字），请多写一两句：主角是谁、什么世界、想要什么爽点" });
				return;
			}
			const count = body?.count !== void 0 ? Math.max(1, Math.min(3, Math.floor(body.count))) : 3;
			const exclude = Array.isArray(body?.exclude) ? body.exclude.filter((e) => typeof e === "string" && e.trim() !== "").map((e) => e.trim().slice(0, 200)) : [];
			try {
				writeJson(res, 200, { candidates: await suggestOutlines(ctx, config, idea, count, exclude) });
			} catch (error) {
				writeJson(res, 500, { error: `大纲方案生成失败：${error.message}` });
			}
		}
	};
	/** 反推大纲：从已写章节正文反向生成全书总纲（NDJSON 流式进度）。 */
	const outlineReverseRoute = {
		kind: "exact",
		path: NOVEL_API.outlineReverse,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache",
				"x-accel-buffering": "no",
				"referrer-policy": "no-referrer"
			});
			const send = (frame) => {
				res.write(JSON.stringify(frame) + "\n");
			};
			try {
				const outline = await reverseOutlineFromChapters(ctx, config, project, config.outputDir, (done, total, phase) => {
					send({
						type: "outline-progress",
						done,
						total,
						phase
					});
				});
				project.outline = outline;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				send({
					type: "outline-done",
					outline,
					chars: outline.length
				});
			} catch (error) {
				send({
					type: "error",
					no: 0,
					message: error.message
				});
			} finally {
				res.end();
			}
		}
	};
	/** 分镜·提示词级：分镜表 → 即梦可粘贴视频提示词。 */
	const storyboardPromptsRoute = {
		kind: "exact",
		path: NOVEL_API.storyboardPrompts,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			const no = body?.chapterNo;
			if (!Number.isInteger(no) || no === void 0 || no < 1) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			if (body?.table === void 0 || (body.table.shots ?? []).length === 0) {
				writeJson(res, 400, { error: "table 不能为空，请先生成分镜表" });
				return;
			}
			try {
				writeJson(res, 200, { prompts: await generateStoryboardPrompts(ctx, config, project, config.outputDir, no, body.table, body?.styleId, body?.filterId) });
			} catch (error) {
				writeJson(res, 500, { error: `视频提示词生成失败：${error.message}` });
			}
		}
	};
	/** 生图接口连通性测试：GET {baseURL}/models + 计时（设置页模型条目用）。 */
	const imageTestRoute = {
		kind: "exact",
		path: NOVEL_API.imageTest,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body?.baseURL === void 0 || body?.apiKey === void 0) {
				writeJson(res, 400, { error: "baseURL 与 apiKey 必填" });
				return;
			}
			try {
				writeJson(res, 200, await testImageEndpoint(body.baseURL, body.apiKey, body.model));
			} catch (error) {
				writeJson(res, 500, { error: `测试失败：${error.message}` });
			}
		}
	};
	/** 分镜·导演级：骨架 → 分镜表（镜头级）。 */
	const storyboardTableRoute = {
		kind: "exact",
		path: NOVEL_API.storyboardTable,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			const no = body?.chapterNo;
			if (!Number.isInteger(no) || no === void 0 || no < 1) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			if (body?.skeleton === void 0 || (body.skeleton.beats ?? []).length === 0) {
				writeJson(res, 400, { error: "skeleton 不能为空，请先生成剧情骨架" });
				return;
			}
			try {
				writeJson(res, 200, { table: await generateStoryboardTable(ctx, config, project, config.outputDir, no, body.skeleton, body?.styleId, body?.filterId) });
			} catch (error) {
				writeJson(res, 500, { error: `分镜表生成失败：${error.message}` });
			}
		}
	};
	/** 漫剧方案管理：create / remove / activate。 */
	const manhuaPlansRoute = {
		kind: "exact",
		path: NOVEL_API.manhuaPlans,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (project.mangaPlans === void 0) project.mangaPlans = [];
			if (body?.op === "create") {
				const name = body.name?.trim();
				const styleId = body.styleId?.trim();
				if (name === void 0 || name === "" || styleId === void 0 || styleId === "") {
					writeJson(res, 400, { error: "name 与 styleId 不能为空" });
					return;
				}
				if (project.mangaPlans.some((p) => p.name === name)) {
					writeJson(res, 400, { error: `方案名「${name}」已存在` });
					return;
				}
				const id = `manga-${Date.now().toString(36)}`;
				project.mangaPlans.push({
					id,
					name: name.slice(0, 40),
					styleId,
					filterId: body.filterId?.trim() !== "" ? body.filterId?.trim() : void 0,
					active: project.mangaPlans.length === 0,
					createdAt: (/* @__PURE__ */ new Date()).toISOString(),
					updatedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
			} else if (body?.op === "remove" && body.id !== void 0) {
				const removed = project.mangaPlans.find((p) => p.id === body.id);
				project.mangaPlans = project.mangaPlans.filter((p) => p.id !== body.id);
				if (removed?.active === true && project.mangaPlans.length > 0) project.mangaPlans[0].active = true;
			} else if (body?.op === "activate" && body.id !== void 0) project.mangaPlans.forEach((p) => {
				p.active = p.id === body.id;
			});
			else {
				writeJson(res, 400, { error: "op 须为 create/remove/activate" });
				return;
			}
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, { plans: project.mangaPlans });
		}
	};
	/** 风格库效果图：GET /styles/image?id=<styleId>，从 ~/.dsh/dsh-novel-forge-styles/<id>.png 读取。 */
	const styleImageRoute = {
		kind: "exact",
		path: "/api/dsh-novel-forge/styles/image",
		handler: async (req, res) => {
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "forbidden: loopback-only" });
				return;
			}
			const id = (new URL(req.url ?? "", "http://localhost").searchParams.get("id") ?? "").replace(/[^a-z0-9-]/gi, "");
			if (id === "") {
				writeJson(res, 404, { error: "style image not found" });
				return;
			}
			const base = join(homedir(), ".dsh", "dsh-novel-forge-styles");
			const candidates = [
				{
					file: join(base, "thumbs", id + ".webp"),
					type: "image/webp"
				},
				{
					file: join(base, id + ".png"),
					type: "image/png"
				},
				{
					file: join(builtinStyleDir, id + ".webp"),
					type: "image/webp"
				}
			];
			for (const c of candidates) if (existsSync(c.file)) {
				res.writeHead(200, {
					"content-type": c.type,
					"cache-control": "public, max-age=86400"
				});
				res.end(readFileSync(c.file));
				return;
			}
			writeJson(res, 404, { error: "style image not found" });
		}
	};
	/** 分镜·编剧级：单章 → 剧情骨架（节拍链）。 */
	const storyboardSkeletonRoute = {
		kind: "exact",
		path: NOVEL_API.storyboardSkeleton,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const no = (await readJsonBody(req))?.chapterNo;
			if (!Number.isInteger(no) || no === void 0 || no < 1) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			try {
				writeJson(res, 200, { skeleton: await generateStoryboardSkeleton(ctx, config, project, config.outputDir, no) });
			} catch (error) {
				writeJson(res, 500, { error: `剧情骨架生成失败：${error.message}` });
			}
		}
	};
	/** 拆书分析：对已写章节做结构/人物/文风/卖点体检（两阶段：源笔记→分节分析）。 */
	const breakdownRoute = {
		kind: "exact",
		path: NOVEL_API.breakdown,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			try {
				writeJson(res, 200, await breakdownBook(ctx, config, project, config.outputDir, body?.scope ?? "recent", body?.preset ?? "quick", body?.budgetTokens ?? 5e4));
			} catch (error) {
				writeJson(res, 500, { error: `拆书分析失败：${error.message}` });
			}
		}
	};
	/** 场景库：AI 提炼 / 采纳 / 更新 / 删除 / 图集。 */
	const scenesRoute = {
		kind: "exact",
		path: NOVEL_API.scenes,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (project.scenes === void 0) project.scenes = [];
			const op = body?.op;
			if (op === "extract") try {
				const candidates = await extractScenes(ctx, config, project, body?.styleId, body?.filterId);
				writeJson(res, 200, {
					scenes: project.scenes,
					candidates
				});
				return;
			} catch (error) {
				writeJson(res, 500, { error: `场景提炼失败：${error.message}` });
				return;
			}
			else if ((op === "adopt" || op === "update") && body?.scene !== void 0) {
				const s = body.scene;
				const idx = project.scenes.findIndex((x) => x.name === s.name);
				if (idx === -1) project.scenes.push(s);
				else project.scenes[idx] = s;
			} else if (op === "remove" && body?.name !== void 0) project.scenes = project.scenes.filter((x) => x.name !== body.name);
			else if (op === "image") {
				const name = body?.name?.trim();
				const dataUrl = body?.dataUrl?.trim();
				if (name === void 0 || name === "" || dataUrl === void 0 || dataUrl === "") {
					writeJson(res, 400, { error: "name（场景名）与 dataUrl 必填" });
					return;
				}
				const scene = project.scenes.find((x) => x.name === name);
				if (scene === void 0) {
					writeJson(res, 404, { error: `当前激活《${project.bookName}》，场景 ${name} 不存在——若期望的书不对，请先在书架切换该书并刷新` });
					return;
				}
				const label = body?.label?.trim() ?? "全景";
				scene.gallery ??= [];
				scene.gallery = scene.gallery.filter((g) => g.label !== label);
				scene.gallery.push({
					label,
					dataUrl
				});
			} else if (op === "removeImage") {
				const name = body?.name?.trim();
				const label = body?.label?.trim() ?? "";
				const scene = project.scenes.find((x) => x.name === name);
				if (scene !== void 0 && label !== "") scene.gallery = (scene.gallery ?? []).filter((g) => g.label !== label);
			} else {
				writeJson(res, 400, { error: `未知操作 ${op}` });
				return;
			}
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, { scenes: project.scenes });
		}
	};
	/** 视觉世界观规则：从道藏提炼（生图/生视频纠偏），或手动保存。 */
	const visualRulesRoute = {
		kind: "exact",
		path: NOVEL_API.visualRules,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (body?.op === "extract") try {
				const rules = await extractVisualRules(ctx, config, project);
				project.visualRules = rules;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { rules });
				return;
			} catch (error) {
				writeJson(res, 500, { error: `视觉规则提炼失败：${error.message}` });
				return;
			}
			else if (body?.op === "save" && Array.isArray(body.rules)) {
				project.visualRules = body.rules.filter((r) => typeof r === "string" && r.trim() !== "").map((r) => r.trim().slice(0, 80)).slice(0, 12);
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { rules: project.visualRules });
				return;
			}
			writeJson(res, 400, { error: "op 须为 extract 或 save" });
		}
	};
	/** 生产单执行器（单例）：计划补足 → 逐章生成 → 被拒分级处理 → 断点续跑。 */
	const runner = new ProductionRunner({
		ctx,
		getConfig
	});
	const runStartRoute = {
		kind: "exact",
		path: NOVEL_API.runStart,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			const project = loadProject(getConfig().outputDir);
			if (project === void 0) {
				writeJson(res, 400, { error: "输出目录中没有项目" });
				return;
			}
			const startNo = Number.isInteger(body?.startNo) && body.startNo >= 1 ? body.startNo : 1;
			let endNo;
			if (Number.isInteger(body?.endNo) && body.endNo >= startNo) endNo = body.endNo;
			else if (Number.isInteger(body?.count) && body.count >= 1 && body.count <= 200) endNo = Math.max(0, ...project.chapters.map((c) => c.no)) + body.count;
			else {
				writeJson(res, 400, { error: "请提供 endNo 或 count（1-200）" });
				return;
			}
			try {
				writeJson(res, 200, await runner.start(startNo, endNo));
			} catch (error) {
				writeJson(res, 409, { error: error.message });
			}
		}
	};
	const runControlRoute = {
		kind: "exact",
		path: NOVEL_API.runControl,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (runner.status() === null) {
				writeJson(res, 400, { error: "没有生产单" });
				return;
			}
			if (body?.action === "pause") runner.pause();
			else if (body?.action === "resume") runner.resume();
			else if (body?.action === "stop") runner.stop();
			else {
				writeJson(res, 400, { error: "action 须为 pause / resume / stop" });
				return;
			}
			writeJson(res, 200, runner.status());
		}
	};
	const runStatusRoute = {
		kind: "exact",
		path: NOVEL_API.runStatus,
		handler: (req, res) => {
			if (!guard(req, res, "GET")) return;
			writeJson(res, 200, runner.status());
		}
	};
	const authorAssetsRoute = {
		kind: "exact",
		path: NOVEL_API.authorAssets,
		handler: (req, res) => {
			if (!guard(req, res, "GET")) return;
			writeJson(res, 200, { assets: loadAuthorAssets() });
		}
	};
	const authorAssetsUpsertRoute = {
		kind: "exact",
		path: NOVEL_API.authorAssetsUpsert,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const asset = (await readJsonBody(req))?.asset;
			if (asset === void 0 || asset.name.trim() === "" || asset.content.trim() === "") {
				writeJson(res, 400, { error: "asset 须含 name / content" });
				return;
			}
			writeJson(res, 200, { assets: upsertAuthorAsset(asset) });
		}
	};
	const authorAssetsRemoveRoute = {
		kind: "exact",
		path: NOVEL_API.authorAssetsRemove,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const id = (await readJsonBody(req))?.id ?? "";
			if (id === "") {
				writeJson(res, 400, { error: "id 必填" });
				return;
			}
			writeJson(res, 200, { assets: removeAuthorAsset(id) });
		}
	};
	const authorAssetsImportDefaultRoute = {
		kind: "exact",
		path: NOVEL_API.authorAssetsImportDefault,
		handler: (req, res) => {
			if (!guard(req, res, "POST")) return;
			writeJson(res, 200, { assets: importDefaultAuthorAssets() });
		}
	};
	const adaptAnalyzeRoute = {
		kind: "exact",
		path: NOVEL_API.adaptAnalyze,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			if (!getConfig().enableAdaptMode) {
				writeJson(res, 404, { error: "改编模式未开启" });
				return;
			}
			const body = await readJsonBody(req);
			const config = getConfig();
			let text = body?.text?.trim() ?? "";
			if (text === "" && body?.filePath !== void 0 && body.filePath !== "") try {
				text = readFileSync(body.filePath, "utf8");
			} catch (err) {
				writeJson(res, 400, { error: "读取文件失败：" + err.message });
				return;
			}
			if (text.length < 200) {
				writeJson(res, 400, { error: "全文内容过短（<200 字符），请上传完整小说文本" });
				return;
			}
			try {
				writeJson(res, 200, await analyzeAdaptation(ctx, config, text));
			} catch (err) {
				writeJson(res, 400, { error: err.message });
			}
		}
	};
	const adaptProposeRoute = {
		kind: "exact",
		path: NOVEL_API.adaptPropose,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			if (!getConfig().enableAdaptMode) {
				writeJson(res, 404, { error: "改编模式未开启" });
				return;
			}
			const body = await readJsonBody(req);
			const config = getConfig();
			const text = (body?.text ?? "").trim();
			const selections = body?.selections ?? [];
			if (text.length < 200 || selections.length === 0) {
				writeJson(res, 400, { error: "请提供全文与至少一条要改的维度" });
				return;
			}
			try {
				writeJson(res, 200, await proposeAdaptation(ctx, config, text, selections, body?.dimensions));
			} catch (err) {
				writeJson(res, 400, { error: err.message });
			}
		}
	};
	const adaptExecuteRoute = {
		kind: "exact",
		path: NOVEL_API.adaptExecute,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			if (!getConfig().enableAdaptMode) {
				writeJson(res, 404, { error: "改编模式未开启" });
				return;
			}
			const body = await readJsonBody(req);
			const text = body?.text ?? "";
			const mappings = body?.mappings ?? [];
			if (text.length < 200 || mappings.length === 0) {
				writeJson(res, 400, { error: "请提供全文与映射表" });
				return;
			}
			if (body?.mode === "rewrite") {
				writeJson(res, 400, { error: "rewrite 模式尚未实现，请使用 replace（术语替换）" });
				return;
			}
			const { adaptedText, hits } = applyAdaptationReplacements(text, mappings);
			writeJson(res, 200, {
				adaptedText,
				mappings: mappings.length,
				hits
			});
		}
	};
	const THEME_BG_DIR = join(homedir(), ".dsh", "dsh-novel-forge-assets");
	const MIME_BY_EXT = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		webp: "image/webp",
		gif: "image/gif"
	};
	return [
		statusRoute,
		loadOutlineRoute,
		saveOutlineRoute,
		bibleRoute,
		volumesRoute,
		planRoute,
		generateRoute,
		reviewRoute,
		rewriteRoute,
		polishRoute,
		draftApplyRoute,
		draftDiscardRoute,
		summaryRoute,
		foreshadowRoute,
		exportRoute,
		chapterRoute,
		chapterCheckRoute,
		chapterSaveRoute,
		assetsRoute,
		styleEngineRoute,
		assistantRoute,
		assistantHistoryRoute,
		assistantClearRoute,
		bookshelfRoute,
		bookshelfActivateRoute,
		bookshelfRemoveRoute,
		bookshelfImportDirRoute,
		bookshelfImportTextRoute,
		bookshelfImportTextPreviewRoute,
		resetRoute,
		auditRoute,
		charactersRefreshRoute,
		factsBackfillRoute,
		biblePatchRoute,
		blurbRoute,
		coverRoute,
		worldRoute,
		renameRoute,
		plotlinesRoute,
		rolesRoute,
		mangaRolesRoute,
		scenesRoute,
		visualRulesRoute,
		sensitiveRoute,
		reviewBackfillRoute,
		chapterResetRoute,
		chapterApproveRoute,
		configRoute,
		openFolderRoute,
		outlineSuggestRoute,
		outlineReverseRoute,
		manhuaPlansRoute,
		styleImageRoute,
		storyboardSkeletonRoute,
		imageTestRoute,
		storyboardTableRoute,
		storyboardPromptsRoute,
		breakdownRoute,
		runStartRoute,
		runControlRoute,
		runStatusRoute,
		authorAssetsRoute,
		authorAssetsUpsertRoute,
		authorAssetsRemoveRoute,
		authorAssetsImportDefaultRoute,
		adaptAnalyzeRoute,
		adaptProposeRoute,
		adaptExecuteRoute,
		{
			kind: "exact",
			path: NOVEL_API.themeBackgroundUpload,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const dataUrl = (await readJsonBody(req))?.dataUrl ?? "";
				const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i.exec(dataUrl);
				if (m === null) {
					writeJson(res, 400, { error: "仅支持 PNG/JPG/WebP/GIF 图片" });
					return;
				}
				const ext = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
				const buf = Buffer.from(m[2], "base64");
				if (buf.length === 0) {
					writeJson(res, 400, { error: "图片数据为空" });
					return;
				}
				mkdirSync(THEME_BG_DIR, { recursive: true });
				const name = "theme-bg-" + Date.now().toString(36) + "-" + randomBytes(3).toString("hex") + "." + ext;
				writeFileSync(join(THEME_BG_DIR, name), buf);
				writeJson(res, 200, { url: NOVEL_API.themeBackgroundGet + "/" + name });
			}
		},
		{
			kind: "prefix",
			path: NOVEL_API.themeBackgroundGet,
			handler: (req, res) => {
				if (!guard(req, res, "GET")) return;
				let pathName = "";
				try {
					pathName = new URL(req.url ?? "", "http://localhost").pathname;
				} catch {}
				const name = basename(pathName);
				if (!name.startsWith("theme-bg-")) {
					writeJson(res, 404, { error: "not found" });
					return;
				}
				const file = join(THEME_BG_DIR, name);
				if (!existsSync(file)) {
					writeJson(res, 404, { error: "not found" });
					return;
				}
				const ext = extname(file).slice(1);
				const type = MIME_BY_EXT[ext] ?? "application/octet-stream";
				res.writeHead(200, {
					"content-type": type,
					"cache-control": "public, max-age=31536000"
				});
				res.end(readFileSync(file));
			}
		}
	];
}
//#endregion
//#region src/index.ts
/**
* dsh-novel-forge — host half. Mounts the AI novel-forge workbench: docx
* outline import, LLM chapter planning, chapter-by-chapter generation
* (3000-4000 chars each), Markdown output into your chosen folder, and the
* /api/dsh-novel-forge route family. The browser half (./client) renders the
* workbench panel. Everything rides official NPM SDK packages — no dsh source
* changes.
*/
/** Stable cordis plugin name. */
const name = "novel-forge";
/** Services required before the novel-forge surfaces can mount. */
const inject = [
	"webServer",
	"llm",
	"systemPrompt"
];
/**
* Settings namespace of the novel-forge capability — the section the web
* settings surface edits. Spelled here rather than imported: the browser half
* spells the same value and must not depend on a Host package.
*/
const NOVEL_SETTINGS_NAMESPACE = settingsNamespace("dsh-novel-forge");
const Config = z.object({
	announceToAgent: z.boolean().default(true),
	enabled: z.boolean().default(true),
	outlinePath: z.string().default(""),
	outputDir: z.string().default(join(homedir(), ".dsh", "novels")),
	provider: z.string().default("deepseek-official"),
	model: z.string().default("deepseek-v4-flash"),
	reasoningEffort: z.union([
		"off",
		"low",
		"high",
		"max"
	]).default("off"),
	analysisReasoning: z.union([
		"off",
		"low",
		"high",
		"max"
	]).default("low"),
	chapterChars: z.number().default(3500),
	maxTokens: z.number().default(12e3),
	reviewPassScore: z.number().default(70),
	autoReview: z.boolean().default(true),
	autoAuthorReview: z.boolean().default(true),
	autoReviewAfterRevise: z.boolean().default(true),
	imageModels: z.array(z.object({
		id: z.string().default(""),
		name: z.string().default(""),
		baseURL: z.string().default(""),
		apiKey: z.string().default(""),
		model: z.string().default(""),
		enabled: z.boolean().default(false)
	})).default([]),
	imageApiKey: z.string().default(""),
	imageApiModel: z.string().default(""),
	imageApiEnabled: z.boolean().default(false),
	themeBackground: z.string().default(""),
	themeBackgroundBlur: z.number().default(0),
	themeOpacity: z.number().default(100),
	enableAdaptMode: z.boolean().default(false)
});
/** Schema defaults, re-read for hand-built test contexts. */
const DEFAULT_ANNOUNCE = true;
const DEFAULT_OUTLINE_PATH = "";
const DEFAULT_OUTPUT_DIR = join(homedir(), ".dsh", "novels");
const DEFAULT_PROVIDER = "deepseek-official";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_REASONING_EFFORT = "off";
const DEFAULT_ANALYSIS_REASONING = "low";
const DEFAULT_CHAPTER_CHARS = 3500;
const DEFAULT_MAX_TOKENS = 12e3;
const DEFAULT_REVIEW_PASS_SCORE = 70;
const DEFAULT_AUTO_REVIEW = true;
const DEFAULT_AUTO_AUTHOR_REVIEW = true;
const DEFAULT_AUTO_REVIEW_AFTER_REVISE = true;
/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 160;
/** Model-facing announcement: plugin presence, capabilities, and limits. */
const NOVEL_GUIDANCE = "本机已安装 dsh-novel-forge 插件（AI 编译小说工作台）：侧边栏「小说工坊」入口。能力：读取 docx 大纲或粘贴大纲文本；用 LLM 提炼道藏（人设/世界观/金手指规则/写作红线，即设定圣经）；生成卷计划与章节计划；逐章调用 LLM 生成 3000-4000 字正文并保存为 Markdown（默认输出到用户主目录 ~/.dsh/novels）；每章自动生成摘要（叙事记忆）、自动 AI 审稿（人设/设定/红线/文笔/爽点/逻辑），支持按审稿意见重写、去 AI 味润色、暗线（伏笔）管理、批量连写与全本导出（txt/md）。限制：生成消耗 LLM API 额度；输出目录与模型可在插件设置中修改；章节正文质量取决于大纲完整度。用户提到「小说 / 大纲 / 写小说 / 章节 / 审稿 / 润色」时即指本插件，请据此协作。";
/** Resolve a config-like value into the full runtime config. */
function resolveConfig(value) {
	return {
		outlinePath: value?.outlinePath ?? DEFAULT_OUTLINE_PATH,
		outputDir: value?.outputDir ?? DEFAULT_OUTPUT_DIR,
		provider: value?.provider ?? DEFAULT_PROVIDER,
		model: value?.model ?? DEFAULT_MODEL,
		reasoningEffort: value?.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
		analysisReasoning: value?.analysisReasoning ?? DEFAULT_ANALYSIS_REASONING,
		chapterChars: value?.chapterChars ?? DEFAULT_CHAPTER_CHARS,
		maxTokens: value?.maxTokens ?? DEFAULT_MAX_TOKENS,
		reviewPassScore: value?.reviewPassScore ?? DEFAULT_REVIEW_PASS_SCORE,
		autoReview: value?.autoReview ?? DEFAULT_AUTO_REVIEW,
		autoAuthorReview: value?.autoAuthorReview ?? DEFAULT_AUTO_AUTHOR_REVIEW,
		autoReviewAfterRevise: value?.autoReviewAfterRevise ?? DEFAULT_AUTO_REVIEW_AFTER_REVISE,
		imageModels: value?.imageModels !== void 0 ? value.imageModels : value?.imageApiKey !== void 0 && value.imageApiKey !== "" ? [{
			id: "img-legacy",
			name: "豆包（旧配置）",
			baseURL: DEFAULT_IMAGE_BASE,
			apiKey: value.imageApiKey,
			model: value.imageApiModel ?? "",
			enabled: true
		}] : [],
		imageBaseUrl: (() => {
			const active = (value?.imageModels ?? []).find((m) => m.enabled) ?? (value?.imageModels ?? [])[0];
			return active?.baseURL !== void 0 && active.baseURL !== "" ? active.baseURL : value?.imageApiKey !== void 0 && value.imageApiKey !== "" ? DEFAULT_IMAGE_BASE : void 0;
		})(),
		imageApiKey: (() => {
			return ((value?.imageModels ?? []).find((m) => m.enabled) ?? (value?.imageModels ?? [])[0])?.apiKey ?? value?.imageApiKey;
		})(),
		imageApiModel: (() => {
			return ((value?.imageModels ?? []).find((m) => m.enabled) ?? (value?.imageModels ?? [])[0])?.model ?? value?.imageApiModel;
		})(),
		imageApiEnabled: value?.imageApiEnabled ?? false,
		themeBackground: value?.themeBackground ?? "",
		themeBackgroundBlur: value?.themeBackgroundBlur ?? 0,
		themeOpacity: value?.themeOpacity ?? 100,
		enableAdaptMode: value?.enableAdaptMode ?? false
	};
}
/** 生图默认接口地址（豆包 ark，OpenAI 兼容）。 */
const DEFAULT_IMAGE_BASE = "https://ark.cn-beijing.volces.com/api/v3";
/**
* Mount the routes and announcement.
* @param ctx - host plugin context carrying webServer/llm/systemPrompt.
* @param config - resolved plugin config (schema defaults applied by the loader).
*/
function apply(ctx, config) {
	let current = () => config ?? {};
	const resolve = () => {
		const resolved = resolveConfig(current());
		const shelfDir = activeBookOutputDir();
		if (shelfDir !== void 0) return {
			...resolved,
			outputDir: shelfDir
		};
		return resolved;
	};
	const patchConfig = async (patch) => {
		const next = {};
		if (patch.outlinePath !== void 0) next.outlinePath = patch.outlinePath;
		if (patch.outputDir !== void 0) next.outputDir = patch.outputDir;
		if (patch.provider !== void 0) next.provider = patch.provider;
		if (patch.model !== void 0) next.model = patch.model;
		if (patch.reasoningEffort !== void 0) next.reasoningEffort = patch.reasoningEffort;
		if (patch.analysisReasoning !== void 0) next.analysisReasoning = patch.analysisReasoning;
		if (patch.chapterChars !== void 0) next.chapterChars = patch.chapterChars;
		if (patch.maxTokens !== void 0) next.maxTokens = patch.maxTokens;
		if (patch.reviewPassScore !== void 0) next.reviewPassScore = patch.reviewPassScore;
		if (patch.autoReview !== void 0) next.autoReview = patch.autoReview;
		if (patch.autoAuthorReview !== void 0) next.autoAuthorReview = patch.autoAuthorReview;
		if (patch.autoReviewAfterRevise !== void 0) next.autoReviewAfterRevise = patch.autoReviewAfterRevise;
		if (patch.imageApiKey !== void 0) next.imageApiKey = patch.imageApiKey;
		if (patch.imageApiModel !== void 0) next.imageApiModel = patch.imageApiModel;
		if (patch.imageApiEnabled !== void 0) next.imageApiEnabled = patch.imageApiEnabled;
		if (patch.themeBackground !== void 0) next.themeBackground = patch.themeBackground;
		if (patch.themeBackgroundBlur !== void 0) next.themeBackgroundBlur = patch.themeBackgroundBlur;
		if (patch.themeOpacity !== void 0) next.themeOpacity = patch.themeOpacity;
		if (patch.enableAdaptMode !== void 0) next.enableAdaptMode = patch.enableAdaptMode;
		if (patch.imageModels !== void 0) next.imageModels = patch.imageModels;
		const settings = ctx.get("settings");
		if (settings !== void 0) await settings.update(NOVEL_SETTINGS_NAMESPACE, next);
		else current = () => ({
			...current(),
			...next
		});
		return resolve();
	};
	let disposeSection;
	let disposeRoutes;
	const sync = () => {
		if (disposeSection !== void 0) {
			disposeSection();
			disposeSection = void 0;
		}
		if (disposeRoutes !== void 0) {
			disposeRoutes();
			disposeRoutes = void 0;
		}
		resolve();
		if (!(current().enabled ?? true)) return;
		if (current().announceToAgent ?? DEFAULT_ANNOUNCE) disposeSection = ctx.systemPrompt.section({
			name: "plugin:dsh-novel-forge",
			order: SECTION_ORDER,
			text: NOVEL_GUIDANCE
		});
		const routes = makeRoutes({
			ctx,
			getConfig: resolve,
			patchConfig
		});
		disposeRoutes = ctx.effect(() => {
			const disposers = routes.map((route) => ctx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "dsh-novel-forge: routes");
	};
	installSettingsSection(ctx, NOVEL_SETTINGS_NAMESPACE, Config, config ?? {}, {
		setSource: (source) => {
			current = source;
			sync();
		},
		onChange: sync
	});
	const skillsService = ctx.get("skills");
	if (skillsService?.register !== void 0) {
		const disposeSkill = skillsService.register({
			name: "novel-forge-chapter-batch",
			description: "批量生成小说章节并值守处理审稿未过的章节（豁免/按意见修订/验证模式/重新生成），依赖 dsh-novel-forge 的 /api/dsh-novel-forge/* 路由。",
			content: [
				"# 小说章节批量生产与值守处理",
				"",
				"## 0. 值守纪律（最高优先级，违反即空转）",
				"1. 启动后台任务后立即停下，不轮询、不连续 wait、不做无意义动作——后台任务完成时运行时自动通知。",
				"2. 只有收到「任务完成」通知或用户新消息时，才继续下一步（读结果→处理未过→汇报）。",
				"3. 等待期间可做与当前任务无关的其他有用工作，但不得为等任务而空转。",
				"4. 任务因 web 重启中断时：待 3080 恢复后，复位卡死章节（generating/error → reset）再续跑，并向用户说明中断原因。",
				"",
				"## 1. 前置检查",
				"1. `GET /api/dsh-novel-forge/status` 确认服务在跑，读项目章节数。",
				"2. 列出目标区间 pending 章节号，避免重复生成已处理章节。",
				"3. **串行执行，禁止并行写 project.json**（并发会互相覆盖状态，实测教训）。",
				"",
				"## 2. 批量生成",
				"逐章串行调用 `POST /generate` `{ chapterNo, skipReview: false }`（走完整质量门：生成→摘要+编年录→审稿→复盘）。",
				"响应为 NDJSON，找 review 帧取 score/passed。每章 2-5 分钟；失败重试 1 次；后台跑并告知预计时长。",
				"用 Node 脚本（fetch 逐章循环），避免 PowerShell 转义坑，用完删除。",
				"",
				"## 3. 未过章节分级处理",
				"### A. 无 high → 豁免通过：`POST /chapter/approve`（主观项不磨）",
				"### B. 有 high 且明确 → 按意见修订 + 验证模式：",
				"1. 拼指令 `按审稿意见修订（优先处理）：\n[severity] item → suggestion`（high 优先，无 high 取前 3 medium）",
				"2. `POST /rewrite` 产草稿；3. `POST /chapter/check` 带 `previousReport` 走验证模式（只核对原意见解决+只挑新增 high）",
				"4. 判定 `passed || 无 high` 可接受；5. `POST /draft/apply` 带 passed 报告落盘 approved",
				"6. 不可接受 → 第二轮修订（指令更精确）→ 再验证；每章最多修 2 轮，仍不过保留草稿待人工",
				"### C. 结构性 high（修订改不好）→ `POST /draft/discard` 后 `POST /generate` 重写，剩主观项再走 A",
				"### D. error 状态 → `POST /chapter/reset` 后 `POST /generate`",
				"注意：approved 但 review 有 high 的保留不动；修订指令越精确越有效（具体数字/行为一次就过）。",
				"",
				"## 4. 收尾",
				"`GET /status` 验证目标区间全 approved；可选刷新剧情线（`POST /plotlines` op=refresh，注意只读最近 8 章摘要）；汇报通过/未过/失败与遗留项。",
				"",
				"## 5. 已知陷阱",
				"- 并发写 project.json 互相覆盖 → 必须串行",
				"- rewrite 草稿可能偶发不落盘 → 应用前检查 pendingDraft，不存在则重跑",
				"- PowerShell 调 API 引号/中文转义是坑 → 用 Node 脚本",
				"- 验证模式 500 偶发 → 重试一次"
			].join("\n")
		});
		ctx.effect(() => disposeSkill, "dsh-novel-forge: skill");
	}
	sync();
}
//#endregion
export { Config, NOVEL_GUIDANCE, NOVEL_SETTINGS_NAMESPACE, apply, inject, name, resolveConfig };

//# sourceMappingURL=index.js.map