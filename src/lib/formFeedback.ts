/**
 * Feedback after a Save that did not go through. A long form in a scrolling sheet (most of all on a phone) can have its first problem
 * above or below what is on screen, so pressing Save then looks like nothing happened. `revealFirstError` brings the first problem
 * into view and puts the cursor in its field; the form also shows the toast `t.common.fixFields`. The shared fields in components/ui.tsx
 * mark an error with `aria-invalid="true"` on the control and `role="alert"` on the message, which is what this looks for.
 * Pure DOM; calls no API.
 */

/**
 * Scrolls the first invalid field (or, failing that, the first error message) of `root` to the middle of the screen and focuses the field.
 * Waits two animation frames so React has drawn the errors that were just set. Does nothing when there is no error on screen.
 * @param root the form or dialog to look in (default: the whole page).
 */
export function revealFirstError(root?: Element | null): void {
  const scope: ParentNode = root ?? document;
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const field = scope.querySelector<HTMLElement>('[aria-invalid="true"]');
    const target = field ?? scope.querySelector<HTMLElement>('[role="alert"]');
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (field) field.focus({ preventScroll: true });
  }));
}
