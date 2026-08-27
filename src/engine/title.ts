/**
 * Pi restores its default title after session_start. Reapply ours on the next turn.
 */
export function setEngineTitle(
  ctx: { ui: { setTitle: (title: string) => void } },
  title: string,
): void {
  ctx.ui.setTitle(title);
  setTimeout(() => ctx.ui.setTitle(title), 0);
}
