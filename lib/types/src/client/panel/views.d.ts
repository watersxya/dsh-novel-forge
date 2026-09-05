/**
 * 纯展示组件（views）：所有状态与事件处理器都留在 NovelPanel，
 * 这里只接收 props 渲染。便于单独维护与复用。
 */
import type { ReactElement } from 'react';
import type { AuditIssue, Plotline, PlotlineHealthReport, PlotlinePlan, RoleRecord, RoleStatusCard } from '../../protocol.ts';
/** 统计格：状态摘要条 / 资产健康通用。 */
export declare function StatCell(props: {
    label: string;
    value: string;
    detail: string;
    /** 值颜色（可选）。 */
    valueColor?: string;
    /** 值字号覆盖（如长文本用 13）。 */
    valueFontSize?: number;
    /** detail 悬浮提示（可选）。 */
    detailTitle?: string;
}): ReactElement;
/** 待办队列行。 */
export declare function TodoRow(props: {
    tone: 'danger' | 'warning' | 'info' | 'success';
    title: string;
    description: string;
    actionLabel: string;
    disabled: boolean;
    onAction: () => void;
}): ReactElement;
/** 全书质检问题行。 */
export declare function AuditIssueRow(props: {
    issue: AuditIssue;
    disabled: boolean;
    onFix: () => void;
}): ReactElement;
/** 剧情线卡片（列表主体）。 */
export declare function PlotlineCard(props: {
    line: Plotline;
    disabled: boolean;
    onRefresh: () => void;
    onEdit: () => void;
    onRemove: () => void;
}): ReactElement;
/** AI 候选角色行（提炼结果，可采纳/修改后采纳）。 */
export declare function RoleCandidateRow(props: {
    candidate: RoleRecord;
    disabled: boolean;
    onAdopt: () => void;
    onEdit: () => void;
}): ReactElement;
/** 已收录角色卡（含从编年录刷新的当前状态行）。 */
export declare function RoleCard(props: {
    role: RoleRecord;
    status?: RoleStatusCard;
    disabled: boolean;
    onEdit: () => void;
    onRemove: () => void;
}): ReactElement;
/** 🩺 剧情健康检查报告面板。 */
export declare function PlotlineHealthPanel(props: {
    report: PlotlineHealthReport;
    disabled: boolean;
    onPlan: () => void;
    onClose: () => void;
}): ReactElement;
/** ✨ AI 剧情方案面板。 */
export declare function PlotlinePlanPanel(props: {
    plan: PlotlinePlan;
    disabled: boolean;
    onAdopt: (suggestion: Plotline) => void;
    onClose: () => void;
}): ReactElement;
/** ✨ AI 建议剧情线面板。 */
export declare function PlotlineSuggestionPanel(props: {
    suggestions: Plotline[];
    disabled: boolean;
    onAdopt: (suggestion: Plotline) => void;
    onClose: () => void;
}): ReactElement;
