import type { NovelApi } from '../api.ts';
import type { DirectorTodo } from '../../protocol.ts';
export default function DirectorView({ api, todos, onTodosChange }: {
    api: NovelApi;
    todos: DirectorTodo[];
    onTodosChange?: (todos: DirectorTodo[]) => void;
}): JSX.Element;
