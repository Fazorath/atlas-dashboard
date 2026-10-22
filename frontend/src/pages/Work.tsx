/* Work — reached only by tapping a Work Widget, like Weather. A Board of
   Work's Widgets (Shift, Week); entering the week is
   not a Widget but the Edit week sheet behind the header button.

   `?edit=YYYY-MM-DD` opens the sheet on that week, which is how a "not
   entered" Widget anywhere drops you straight into typing it in. */

import { CalendarRange } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { AreaBoard } from "@/components/board/AreaBoard";
import { Button } from "@/components/ui/button";
import { EditWeek } from "@/components/work/EditWeek";
import { localDate } from "@/lib/habits";
import { mondayOf, useWork } from "@/lib/work";

const MONDAY = /^\d{4}-\d{2}-\d{2}$/;

export function Work() {
  const [params, setParams] = useSearchParams();
  const work = useWork();
  const asked = params.get("edit");
  const editing = asked && MONDAY.test(asked) ? mondayOf(asked) : null;

  // The button opens the week you most likely want to fill in: this one
  // until it's in, then the next.
  const open = () => {
    const thisWeek = work.data?.this_week;
    const target = thisWeek && thisWeek.entered ? work.data!.next_week.week_start : mondayOf(localDate());
    setParams({ edit: target });
  };
  const close = () => setParams({}, { replace: true });

  return (
    <>
      <AreaBoard
        area="work"
        actions={
          <Button variant="ghost" onClick={open} aria-haspopup="dialog" aria-label="Edit week">
            <CalendarRange aria-hidden strokeWidth={2.2} className="size-4" />
            <span className="hidden min-[420px]:inline">Edit week</span>
          </Button>
        }
      />
      {editing ? <EditWeek key={editing} initialWeek={editing} onClose={close} /> : null}
    </>
  );
}
