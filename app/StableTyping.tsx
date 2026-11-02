"use client";

import { useEffect } from "react";

const editable = (el: Element | null): el is HTMLElement => !!el && (el.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), textarea, select") || (el as HTMLElement).isContentEditable);
const selectorOf = (el: HTMLElement) => el.dataset.testid ? `[data-testid="${CSS.escape(el.dataset.testid)}"]` : el.id ? `#${CSS.escape(el.id)}` : null;

/**
 * Safety net for iPad/iPhone Safari: while someone is typing, the page must not jump back to the top and the field must keep
 * its focus. Right after a keystroke it remembers where the page was and which field was in use; if the page is then thrown to
 * the top (a layout collapse, a remount) within a moment, it puts the page back and focuses the same field again.
 * Normal scrolling by the person is never touched: only a jump of more than 300 px within 700 ms of typing.
 */
export default function StableTyping() {
  useEffect(() => {
    let y = 0, at = 0, selector: string | null = null, caret: [number | null, number | null] = [null, null];
    const onInput = (e: Event) => {
      const el = e.target as HTMLElement;
      if (!editable(el)) return;
      y = window.scrollY; at = Date.now(); selector = selectorOf(el);
      const f = el as HTMLInputElement; try { caret = [f.selectionStart, f.selectionEnd]; } catch { caret = [null, null]; }
    };
    const onScroll = () => {
      if (!at || Date.now() - at > 700 || y < 300 || window.scrollY > y - 300) return;
      const target = y; at = 0;
      window.scrollTo(0, target);
      requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - target) > 4) window.scrollTo(0, target);
        const active = document.activeElement;
        if (selector && (!active || active === document.body || !editable(active))) {
          const el = document.querySelector<HTMLInputElement>(selector);
          if (el) { try { el.focus({ preventScroll: true }); if (caret[0] !== null) el.setSelectionRange(caret[0], caret[1]); } catch { /* not a text field */ } }
        }
      });
    };
    document.addEventListener("input", onInput, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { document.removeEventListener("input", onInput, true); window.removeEventListener("scroll", onScroll); };
  }, []);
  return null;
}
