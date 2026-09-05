import type { NovelConfig } from '../../protocol.ts';
export interface ReasoningSectionProps {
    reasoningEffort: NovelConfig['reasoningEffort'];
    analysisReasoning: NovelConfig['analysisReasoning'];
    onChange: (patch: {
        reasoningEffort?: NovelConfig['reasoningEffort'];
        analysisReasoning?: NovelConfig['analysisReasoning'];
    }) => void;
}
export declare function ReasoningSection({ reasoningEffort, analysisReasoning, onChange }: ReasoningSectionProps): JSX.Element;
