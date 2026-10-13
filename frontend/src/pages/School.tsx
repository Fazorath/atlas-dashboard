/* School — a Board of School's Widgets: Due soon, Next class, and the
   Area-only Coming up (three weeks ahead) and Past assignments (the part of
   the term Canvas's own feed has already forgotten). A Class session is a
   time you join, never ticked and never counted as due. */

import { AreaBoard } from "@/components/board/AreaBoard";

export function School() {
  return <AreaBoard area="school" />;
}
