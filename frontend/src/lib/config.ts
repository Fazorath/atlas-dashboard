/* Who this Atlas belongs to and which modules are on (GET /api/config, from
   config/atlas.yaml). Read once before the first render — main.tsx waits for
   it — so everything downstream can ask synchronously. Changing atlas.yaml
   means restarting atlas-api and reloading the page.

   If the API can't be reached at boot, every Area stays on: the Widgets then
   explain their own failures, which beats a blank dashboard. */

import type { AreaKey } from "@/lib/sections";

export interface AtlasConfig {
  /** "" when atlas.yaml gives no name. */
  name: string;
  timezone: string;
  modules: string[];
  areas: string[];
  temperature_unit: "F" | "C";
}

let current: AtlasConfig | null = null;

export async function loadConfig(): Promise<void> {
  try {
    const res = await fetch("/api/config");
    if (res.ok) current = (await res.json()) as AtlasConfig;
  } catch {
    /* keep the all-on fallback */
  }
}

export function ownerName(): string {
  return current?.name ?? "";
}

export function temperatureUnit(): "F" | "C" {
  return current?.temperature_unit ?? "F";
}

export function areaEnabled(area: AreaKey): boolean {
  return current ? current.areas.includes(area) : true;
}
