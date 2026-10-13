/* The avatar, and the menu behind it. Today it holds one thing — the Status
   screen — and it is where accounts and connections will live once Atlas has
   more than one person in it. A dot on the avatar says a Source needs you. */

import { Activity } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { problemsOf, useSources } from "@/lib/sources";
import { cn } from "@/lib/utils";

export const OWNER_INITIAL = "E";

export function AccountMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const sources = useSources();
  const problems = problemsOf(sources.all);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={problems.length ? "Account — a source needs attention" : "Account"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="pressable relative grid size-11 shrink-0 place-items-center rounded-full bg-sleep text-[16px] font-extrabold text-bg"
      >
        {OWNER_INITIAL}
        {problems.length ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-bg bg-due"
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute top-[52px] right-0 z-30 flex w-56 flex-col gap-1 rounded-[20px] bg-surface-2 p-2"
        >
          <Link
            role="menuitem"
            to="/status"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-[14px] font-bold hover:bg-surface"
          >
            <Activity aria-hidden strokeWidth={2} className="size-[18px] text-fg-muted" />
            <span className="flex-1">Status</span>
            {problems.length ? (
              <span className="tnum rounded-full bg-due-tint px-2 py-0.5 text-[12px] text-due-soft">
                {problems.length}
              </span>
            ) : null}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
