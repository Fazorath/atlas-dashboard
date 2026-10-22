/* An Area's screen (ADR 0002): its header, then a Board of only its own
   Widgets — the catalog ones and the Area-only ones too detailed for Today.
   No fixed content: connecting Sources is on the Status screen, and each
   Widget shows its own Setup or Problem state. The avatar rides the toolbar
   on a phone, as on Today, so Status is one tap away from every screen. */

import type { ReactNode } from "react";

import { Board } from "@/components/board/Board";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { AreaHeader } from "@/components/layout/AreaHeader";
import { AREAS, type AreaKey } from "@/lib/sections";

export function AreaBoard({ area, actions }: { area: AreaKey; actions?: ReactNode }) {
  return (
    <Board
      board={area}
      leading={<AreaHeader area={AREAS[area]} />}
      trailing={
        <>
          {actions}
          <AccountMenu className="lap:hidden" />
        </>
      }
    />
  );
}
