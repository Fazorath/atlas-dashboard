/* Health — body data from any health Source; today, Fitbit through the Google
   Health API. A Board of Health's Widgets: Last night, Sleep week, Activity,
   and the Area-only Sleep history.

   Everything reads Atlas's archive, so an expired sign-in never empties the
   screen. Connecting lives on the Status screen (ADR 0002); the one thing
   this screen adds is Today's reconnect banner, when Google needs a click. */

import { AreaBoard } from "@/components/board/AreaBoard";
import { ReconnectBanner } from "@/components/widgets/fitbit-connection";
import { useSleep } from "@/lib/sleep";

export function Health() {
  const sleep = useSleep();
  return (
    <div className="flex flex-col gap-3 lap:gap-4">
      <ReconnectBanner conn={sleep.data?.connection} />
      <AreaBoard area="health" />
    </div>
  );
}
