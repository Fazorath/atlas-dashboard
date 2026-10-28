/* Who this Atlas belongs to and which modules are on (GET /api/config, from
   config/atlas.yaml). Read once before the first render — main.tsx waits for
   it — so everything downstream can ask synchronously. Setup's saves apply on
   the server at once; `reloadConfig()` then fetches it again and re-renders
   the app (App subscribes with `useConfig`), so no page reload is needed.

   If the API can't be reached, `apiUnreachable()` is true and App shows an
   "API unreachable" screen instead of a dashboard that looks set up wrong. */

import { useSyncExternalStore } from "react";

import type { AreaKey } from "@/lib/sections";

export interface AtlasConfig {
  /** No config/atlas.yaml yet: a fresh install, so the app opens Setup. */
  setup: boolean;
  /** A hand edit of config/ that didn't apply; the last good config is in use. */
  config_problem: string | null;
  /** "" when atlas.yaml gives no name. */
  name: string;
  timezone: string;
  modules: string[];
  areas: string[];
  temperature_unit: "F" | "C";
  /** Edit week can read a Schedule photo (ADR 0006). */
  work_photo: boolean;
}

let current: AtlasConfig | null = null;

/** Areas a Custom module brings (lib/custom): on whenever they exist. */
export const customAreas = new Set<string>();

/** Fetched right after /api/config, on every load (lib/custom registers one). */
const loaders: Array<() => Promise<void>> = [];
export function afterConfigLoad(load: () => Promise<void>): void {
  loaders.push(load);
}
let unreachable = false;
const listeners = new Set<() => void>();

export async function loadConfig(): Promise<void> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    current = (await res.json()) as AtlasConfig;
    unreachable = false;
    await Promise.all(loaders.map((load) => load().catch(() => undefined)));
  } catch {
    // After a good load, keep the last config rather than replace the app.
    unreachable = current === null;
  }
}

/** Fetch the config again after a Save, and re-render whoever reads it. */
export async function reloadConfig(): Promise<void> {
  await loadConfig();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConfig(): AtlasConfig | null {
  return useSyncExternalStore(subscribe, () => current);
}

/** The last /api/config fetch failed: atlas-api is down or not answering. */
export function apiUnreachable(): boolean {
  return unreachable;
}

export function setupNeeded(): boolean {
  return current?.setup ?? false;
}

export function ownerName(): string {
  return current?.name ?? "";
}

export function temperatureUnit(): "F" | "C" {
  return current?.temperature_unit ?? "F";
}

export function areaEnabled(area: AreaKey): boolean {
  return current ? current.areas.includes(area) || customAreas.has(area) : true;
}

/** The Module ids that are on, or null before the config has loaded. */
export function enabledModules(): string[] | null {
  return current ? current.modules : null;
}

export function workPhotoEnabled(): boolean {
  return current?.work_photo ?? false;
}

/** The IANA zone from atlas.yaml, or null before the config has loaded. */
export function currentTimezone(): string | null {
  return current?.timezone || null;
}
