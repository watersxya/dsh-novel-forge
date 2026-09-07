/** 墨案签名元素 #3：AI 微签。AI 能力 = 名称旁一枚 12px 琥珀 `AI` mono 微签，
 *  不加 、不加"AI ×××"帽。用 `--nf-ai`（琥珀）着色，不发光。 */
import css from './panel.module.css'

export function AiTag(): JSX.Element {
  return <span className={css.aiTag}>AI</span>
}
