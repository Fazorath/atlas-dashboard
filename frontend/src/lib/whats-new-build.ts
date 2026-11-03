/* This build's version and notes, from the constants vite.config.ts embeds.
   Apart from whats-new.ts so node's test runner never meets those constants.
   A dev build has no version, so no sheet. */

import { cleanVersion, parseChangelog, type Entry } from "@/lib/whats-new";

export const BUILD_VERSION = cleanVersion(__ATLAS_VERSION__);
export const ENTRIES: Entry[] = parseChangelog(__ATLAS_CHANGELOG__);
