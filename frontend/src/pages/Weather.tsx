/* Weather — reached only by tapping Today's Weather Card. A Board of
   Weather's Widgets: Now, 7-day, and the Area-only Next hours and Today
   (sun, UV, air). Everything reads Atlas's archive, never Open-Meteo, so a
   failed sync costs Freshness and not the screen. */

import { AreaBoard } from "@/components/board/AreaBoard";

export function Weather() {
  return <AreaBoard area="weather" />;
}
