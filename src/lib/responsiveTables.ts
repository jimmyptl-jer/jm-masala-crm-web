/**
 * Phones never scroll sideways: a table with the class `rt` is shown as a stack of cards under 768 px (the CSS is in index.css) and as a normal table
 * from 768 px up. For the card view every cell shows its column heading in front of its value; this file puts that heading on each cell as
 * `data-label` (read by the CSS with attr()). It labels again whenever the page changes (rows arrive, a page or filter changes), by watching the
 * document. A cell that spans several columns (a group heading) gets no label. Pure DOM; calls no API. Started once from main.tsx.
 */

/** Gives every cell of every `table.rt` the text of its column heading. Cheap: a table has a few dozen cells. */
export function labelResponsiveTables(root: ParentNode = document): void {
  root.querySelectorAll<HTMLTableElement>('table.rt').forEach((table) => {
    const heads = [...table.querySelectorAll('thead th')].map((th) => (th.textContent ?? '').trim());
    table.querySelectorAll('tbody tr').forEach((tr) => {
      let col = 0;
      tr.querySelectorAll<HTMLTableCellElement>(':scope > td').forEach((td) => {
        const span = td.colSpan || 1;
        const label = span > 1 ? '' : heads[col] ?? '';
        if (td.dataset.label !== label) td.dataset.label = label;
        col += span;
      });
    });
  });
}

/** Labels now and again after every change of the page (batched to one pass per frame). Call once at start-up. */
export function startResponsiveTables(): void {
  let queued = false;
  const run = () => { queued = false; labelResponsiveTables(); };
  new MutationObserver(() => { if (!queued) { queued = true; window.requestAnimationFrame(run); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
  run();
}
