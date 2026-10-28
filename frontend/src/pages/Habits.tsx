/* Habits — a Board of Habits' Widgets: Today's habits and the Area-only
   This week, which is also the Backfill (pick a past day and its rows tick
   that day).

   Setting habits up is not a Widget: Manage, in the toolbar, opens a sheet to
   add, rename, archive and restore them, and to link one to a Health figure
   so it ticks itself (ADR 0001). A tick by hand always wins over the data. */

import { Settings2 } from "lucide-react";
import { useState } from "react";

import { AreaBoard } from "@/components/board/AreaBoard";
import { ManageHabits } from "@/components/habits/ManageHabits";
import { Button } from "@/components/ui/button";

export function Habits() {
  const [managing, setManaging] = useState(false);
  return (
    <>
      <AreaBoard
        area="habits"
        actions={
          <Button variant="ghost" onClick={() => setManaging(true)} aria-haspopup="dialog" aria-label="Manage habits">
            <Settings2 aria-hidden strokeWidth={2.2} className="size-4" />
            <span className="hidden min-[420px]:inline">Manage</span>
          </Button>
        }
      />
      {managing ? <ManageHabits onClose={() => setManaging(false)} /> : null}
    </>
  );
}
