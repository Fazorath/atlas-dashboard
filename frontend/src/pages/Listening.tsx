/* Listening — reached only by tapping Today's Listening Card. A Board of
   Listening's Widgets: Now listening, Listening streak, and the Area-only
   Also in progress and Finished. Read live from Audiobookshelf, read-only
   throughout: nothing here can move your place in a book. */

import { AreaBoard } from "@/components/board/AreaBoard";

export function Listening() {
  return <AreaBoard area="listening" />;
}
