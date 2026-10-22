/* A modal sheet: up from the bottom on a phone, a centred panel from 900px.
   Owns the dialog plumbing every sheet needs — focus moves in and back out,
   Escape and a tap on the backdrop close it, the page behind stops scrolling.
   The Widget gallery and Manage habits are both one of these. */

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Sheet({
  eyebrow,
  title,
  onClose,
  className,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  onClose: () => void;
  /** Width and the like, on the panel. */
  className?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // So a Board in Edit mode behind the sheet doesn't also take it as Done.
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 lap:items-center lap:p-8"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "flex max-h-[88dvh] w-full flex-col rounded-t-[16px] border border-border-subtle bg-bg outline-none lap:rounded-card-lg",
          className,
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-divider px-4 py-3 lap:px-6">
          <div className="min-w-0">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId} className="mt-1 text-[20px] font-medium">
              {title}
            </h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
            <X aria-hidden strokeWidth={2.2} className="size-5" />
          </Button>
        </header>
        {children}
      </div>
    </div>
  );
}
