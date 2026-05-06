/**
 * KeyboardShortcuts — global keyboard handler + help overlay.
 *
 * Bindings:
 *   g  → /        (Live Signals / Grid)
 *   c  → /calibration
 *   h  → /hedge
 *   ?  → toggle help overlay
 *   /  → focus the sort dropdown (first interactive control on grid pages)
 *   esc → close help overlay
 *
 * Ignores keystrokes when focus is in an input/textarea/select to avoid
 * stealing keys from form fields.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Binding = { keys: string[]; label: string; href?: string; action?: string };
const BINDINGS: Binding[] = [
  { keys: ["g"], label: "Go to Live Signals", href: "/" },
  { keys: ["s"], label: "Go to Stats", href: "/stats" },
  { keys: ["h"], label: "Go to Hedge", href: "/hedge" },
  { keys: ["/"], label: "Focus sort/filter controls", action: "focus_controls" },
  { keys: ["?"], label: "Toggle this help", action: "help" },
  { keys: ["Esc"], label: "Close help", action: "close_help" },
];

function isTypingInForm(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't fire while typing in a form
      if (isTypingInForm(e.target)) return;
      // Don't fire with modifier keys (cmd/ctrl/alt + key are reserved)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const k = e.key;
      if (k === "?") {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }
      if (k === "Escape") {
        if (showHelp) {
          e.preventDefault();
          setShowHelp(false);
        }
        return;
      }
      if (k === "g") {
        e.preventDefault();
        router.push("/");
        return;
      }
      if (k === "s") {
        e.preventDefault();
        router.push("/stats");
        return;
      }
      if (k === "h") {
        e.preventDefault();
        router.push("/hedge");
        return;
      }
      if (k === "/") {
        e.preventDefault();
        // Focus the first <select> or <button> in the controls area
        const target =
          (document.querySelector(
            "[role='button'][aria-pressed], select",
          ) as HTMLElement | null) ?? null;
        if (target) target.focus();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, showHelp]);

  if (!showHelp) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => setShowHelp(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="max-w-md w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">
            Keyboard shortcuts
          </h2>
          <button
            onClick={() => setShowHelp(false)}
            className="rounded p-1 text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--foreground)]"
            aria-label="Close shortcuts help"
          >
            ✕
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {BINDINGS.map((b) => (
            <li key={b.keys.join("+")} className="flex items-center justify-between">
              <span className="text-[var(--foreground)]">{b.label}</span>
              <span className="flex gap-1">
                {b.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-0.5 font-mono text-xs"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 text-xs text-[var(--muted)]">
          Shortcuts ignore keys typed into form fields.
        </div>
      </div>
    </div>
  );
}
