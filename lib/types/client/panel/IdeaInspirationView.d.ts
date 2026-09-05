import type { NovelApi } from '../api.ts';
import type { IdeaInspirationResult } from '../../protocol.ts';
export default function IdeaInspirationView({ api, onUseIdea }: {
    api: NovelApi;
    onUseIdea?: (idea: IdeaInspirationResult['ideas'][number]) => void;
}): JSX.Element;
