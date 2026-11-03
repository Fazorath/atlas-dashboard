/* "What's new": a Sheet with one release's version, date and bullets. Shown by
   itself the first time the app opens after an update (the AppShell mounts
   AutoWhatsNew), and from Status for any release. Minimal on purpose. */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { BUILD_VERSION, ENTRIES } from "@/lib/whats-new-build";
import { markSeen, sheetToShow, type Entry } from "@/lib/whats-new";

export function WhatsNewSheet({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  return (
    <Sheet eyebrow={entry.date ?? undefined} title={`What’s new in ${entry.version}`} onClose={onClose} className="lap:max-w-[480px]">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 lap:px-6">
        <ul className="flex list-disc flex-col gap-3 pl-5 text-[14px] leading-snug font-semibold marker:text-fg-muted">
          {entry.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
      {/* Full-width at the bottom edge, clear of the home-indicator. */}
      <div className="px-4 pt-4 lap:px-6" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <Button variant="solid" className="w-full" onClick={onClose}>
          Got it
        </Button>
      </div>
    </Sheet>
  );
}

/** Opens on its own after an update; dismissing remembers it on this device. */
export function AutoWhatsNew() {
  const [entry, setEntry] = useState<Entry | null>(() => sheetToShow(localStorage, BUILD_VERSION, ENTRIES));
  if (!entry) return null;
  return (
    <WhatsNewSheet
      entry={entry}
      onClose={() => {
        markSeen(localStorage, entry.version);
        setEntry(null);
      }}
    />
  );
}
