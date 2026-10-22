/* Money — a Board of Money's Widgets: Balance, This month (with Out by day),
   Where it went, Upcoming bills, and the Area-only Accounts, Goals and In vs
   Out. Everything is read live from Securo through atlas-api; nothing
   financial is stored in Atlas. */

import { AreaBoard } from "@/components/board/AreaBoard";

export function Money() {
  return <AreaBoard area="money" />;
}
