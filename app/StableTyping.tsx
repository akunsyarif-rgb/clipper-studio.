"use client";

import { useEffect } from "react";

const FIELD = "input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=submit]):not([type=button]), textarea";
const editable = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement => !!el && el.matches(FIELD);

/** A way to find "the same field" again if its element is replaced: its test id / id / name / placeholder and which one of those it is. */
function locate(el: HTMLElement): (() => HTMLInputElement | HTMLTextAreaElement | null) | null {
  const attr = el.dataset.testid ? ["data-testid", el.dataset.testid] : el.id ? ["id", el.id] : el.getAttribute("name") ? ["name", el.getAttribute("name")!] : el.getAttribute("placeholder") ? ["placeholder", el.getAttribute("placeholder")!] : null;
  if (!attr) return null;
  const sel = `${el.tagName.toLowerCase()}[${attr[0]}="${CSS.escape(attr[1])}"]`;
  const index = Math.max(0, [...document.querySelectorAll(sel)].indexOf(el));
  return () => { const found = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(sel); return found[Math.min(index, found.length - 1)] ?? null; };
}

/**
 * Safety net for iPad/iPhone Safari while someone is typing. Two things must never happen: the page being thrown back to the top, and the
 * field losing focus (the keyboard closing, the caret gone) because the element was replaced or blurred by something other than the person.
 * - Right after a keystroke it remembers the field, the caret and the scroll position.
 * - If the page then jumps up by more than 300 px within 700 ms, it puts the page back and refocuses the field.
 * - If the field loses focus (or is replaced) within 1.5 s of typing without the person tapping elsewhere, pressing Tab/Enter/Escape, it is focused
 *   again, with the caret where it was. `window.__focusRescues` counts how often this happened (for tests and diagnostics).
 */
export default function StableTyping() {
  useEffect(() => {
    let y = 0, at = 0, field: HTMLInputElement | HTMLTextAreaElement | null = null, find: ReturnType<typeof locate> = null;
    let caret: [number | null, number | null] = [null, null], value = "", pointerAt = 0, leftAt = 0, rescues = 0;
    const w = window as unknown as { __focusRescues?: number };
    w.__focusRescues = 0;

    const remember = (el: HTMLInputElement | HTMLTextAreaElement) => {
      y = window.scrollY; at = Date.now(); field = el; find = locate(el); value = el.value;
      try { caret = [el.selectionStart, el.selectionEnd]; } catch { caret = [null, null]; }
    };
    const onInput = (e: Event) => { if (editable(e.target as Element)) remember(e.target as HTMLInputElement); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Tab" || e.key === "Enter" || e.key === "Escape") leftAt = Date.now(); };
    const onPointer = () => { pointerAt = Date.now(); };

    const rescue = () => {
      // A tap, Tab, Enter or Escape after the last keystroke means the person moved on.
      if (!field || Date.now() - at > 1500 || pointerAt > at || leftAt > at) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement) return; // focus is somewhere: the person moved on, or it is still here
      const target = field.isConnected ? field : find?.() ?? null;
      if (!target || target.disabled || target.readOnly || !target.isConnected) return;
      try {
        target.focus({ preventScroll: true });
        if (caret[0] !== null && target.value === value) target.setSelectionRange(caret[0], caret[1]);
        else if (caret[0] !== null) { const end = target.value.length; target.setSelectionRange(end, end); }
        rescues++; w.__focusRescues = rescues; field = target;
      } catch { /* a field type without a caret */ }
    };
    const onFocusOut = (e: FocusEvent) => { if (e.relatedTarget === null && editable(e.target as Element)) queueMicrotask(rescue); };
    const observer = new MutationObserver(() => { if (field && Date.now() - at < 1500) queueMicrotask(rescue); });
    observer.observe(document.body, { childList: true, subtree: true });

    const onScroll = () => {
      if (!at || Date.now() - at > 700 || y < 300 || window.scrollY > y - 300) return;
      const target = y; at = 0;
      window.scrollTo(0, target);
      requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - target) > 4) window.scrollTo(0, target);
        at = Date.now(); rescue();
      });
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      document.removeEventListener("input", onInput, true); document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true); document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return null;
}
