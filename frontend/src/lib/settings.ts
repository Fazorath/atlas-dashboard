/* Setup's forms and the Settings sections on Status (ADR 0008), Owner-only.

   The backend declares every Module's fields (app/setup/fields.py) and this
   side only renders them, so a new Module's form needs no new screen. Every
   save applies at once on the server; `afterSave` then refetches the config
   and every query, so the nav, Boards and Widgets follow without a reload.

   A file written by hand answers 409: rewriting it drops its comments, so the
   screen asks first and repeats the save with `take_over`. */

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import { reloadConfig } from "@/lib/config";

export type FieldKind = "text" | "url" | "email" | "number" | "select" | "secret" | "pairs";
export type SecretState = "set" | "env" | "unset";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  help: string;
  placeholder: string;
  required: boolean;
  options: string[];
  /** A secret bound to this url field's host. */
  bound_to: string | null;
  /** Non-secret fields. `pairs` is an object. */
  value?: string | number | Record<string, string>;
  /** Secret fields: never a value. */
  state?: SecretState;
}

export interface FileInfo {
  path: string;
  /** Written by Setup (or missing): saving needs no confirmation. */
  ours: boolean;
}

export interface ModuleSettings {
  id: string;
  label: string;
  area: string;
  blurb: string;
  testable: boolean;
  uses_place: boolean;
  note: string;
  docs: string;
  fields: FieldDef[];
  enabled: boolean;
  file: FileInfo;
}

export interface SettingsState {
  you: { name: string; timezone: string; file: FileInfo };
  place: {
    latitude: number | null;
    longitude: number | null;
    units: "fahrenheit" | "celsius";
    label: string;
    file: FileInfo;
  };
  enabled: string[];
  modules: ModuleSettings[];
  problem: string | null;
}

export interface Outcome {
  ok: boolean;
  message: string;
  unreachable: boolean;
}

export interface Place {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
  units: "fahrenheit" | "celsius";
}

export interface ModuleValues {
  values: Record<string, unknown>;
  secrets: Record<string, string>;
}

export const SETTINGS_KEY = ["settings"] as const;

/** The manual's page on Compose networks, for a Test that reached nothing. */
export const REACHING_APPS_URL =
  "https://fazorath.github.io/atlas-dashboard/start/configuration/#reaching-your-other-apps";

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api<SettingsState>("/settings"),
    enabled,
    retry: false,
  });
}

/** True for the 409 a hand-written file answers. */
export function isHandWritten(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.message.includes("by hand");
}

async function afterSave(client: QueryClient, state: SettingsState) {
  client.setQueryData(SETTINGS_KEY, state);
  await reloadConfig();
  // Any Area's numbers may change with a new address, key or module.
  void client.invalidateQueries();
}

function put<T>(path: string, body: unknown) {
  return api<T>(`/settings${path}`, { method: "PUT", body: JSON.stringify(body) });
}

export function useSaveYou() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; timezone: string; take_over?: boolean }) =>
      put<SettingsState>("/you", body),
    onSuccess: (state) => afterSave(client, state),
  });
}

export function useSavePlace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      latitude: number;
      longitude: number;
      units: "fahrenheit" | "celsius";
      label: string;
      take_over?: boolean;
    }) => put<SettingsState>("/place", body),
    onSuccess: (state) => afterSave(client, state),
  });
}

export function useSaveEnabled() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { enabled: string[]; take_over?: boolean }) =>
      put<SettingsState>("/modules", body),
    onSuccess: (state) => afterSave(client, state),
  });
}

export function useSaveModule(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ModuleValues & { take_over?: boolean }) =>
      put<{ cleared: string[]; settings: SettingsState }>(`/modules/${id}`, body),
    onSuccess: (out) => afterSave(client, out.settings),
  });
}

export function useTestModule(id: string) {
  return useMutation({
    mutationFn: (body: ModuleValues) =>
      api<Outcome>(`/settings/modules/${id}/test`, { method: "POST", body: JSON.stringify(body) }),
  });
}

export const searchPlaces = (q: string) =>
  api<Place[]>(`/settings/geocode?q=${encodeURIComponent(q)}`);

/** `CS101 = Intro CS` lines <-> the `{CS101: "Intro CS"}` YAML map. */
export function pairsToText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, string>)
    .map(([k, v]) => `${k} = ${v}`)
    .join("\n");
}

export function textToPairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf("=");
    if (at < 0) continue;
    const key = line.slice(0, at).trim();
    const label = line.slice(at + 1).trim();
    if (key && label) out[key] = label;
  }
  return out;
}

export function hostOf(url: unknown): string {
  try {
    return new URL(String(url)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** The browser's own time zone — Setup's starting guess. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
