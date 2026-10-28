/* Notifications — the seam for /api/notify, and this browser's push
   subscription (ADR 0007).

   A device is one browser's PushSubscription, stored by the API. This browser
   knows its own endpoint, which is how the list marks "this device". On an
   iPhone, push exists only inside the Home Screen app, never in a Safari tab,
   so `support()` tells those apart to say what to do instead. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { api, type SyncResult } from "@/lib/api";

export interface Device {
  id: number;
  label: string;
  created_at: string;
  last_ok_at: string | null;
  last_error: string | null;
  /** First 16 hex chars of sha256(endpoint); see `useOwnHash`. */
  endpoint_hash: string;
}

export interface Alert {
  id: string;
  label: string;
  detail: string;
  url: string;
  enabled: boolean;
  /** "HH:MM:SS" for clock-time Alerts, else null. */
  at: string | null;
  /** For lead-time Alerts, else null. */
  lead_minutes: number | null;
  /** How the lead reads: "90 min before", or "6 h after" for one that waits. */
  lead_word: "before" | "after";
}

export interface NotifyState {
  public_key: string;
  alerts: Alert[];
  devices: Device[];
  last_run: SyncResult | null;
}

export type Support =
  | "ok"
  /** iPhone/iPad in a Safari tab: it works once added to the Home Screen. */
  | "ios-tab"
  /** The browser can't do Web Push at all. */
  | "none";

export function support(): Support {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
    return "ok";
  }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios ? "ios-tab" : "none";
}

const KEY = ["notify"] as const;

export function useNotify() {
  return useQuery({ queryKey: KEY, queryFn: () => api<NotifyState>("/notify") });
}

async function hashEndpoint(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** This browser's subscription as the API hashes it, or null when it has
 *  none. The API never hands endpoints back, so this is how the device list
 *  finds "this device". `refresh` re-reads it after subscribing or removing. */
export function useOwnHash(): [string | null, () => void] {
  const [hash, setHash] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (support() !== "ok") return;
    let live = true;
    void navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => (sub ? hashEndpoint(sub.endpoint) : null))
      .then((h) => live && setHash(h));
    return () => {
      live = false;
    };
  }, [tick]);
  return [hash, () => setTick((t) => t + 1)];
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** "iPhone", "Mac · Safari" — enough to tell devices apart in the list. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const touchMac = ua.includes("Macintosh") && navigator.maxTouchPoints > 1;
  const os = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) || touchMac ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Macintosh/.test(ua) ? "Mac"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "This device";
  if (os === "iPhone" || os === "iPad") return os;
  const browser = /Edg\//.test(ua) ? "Edge"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  return browser ? `${os} · ${browser}` : os;
}

/** Ask permission, subscribe this browser, and register it with the API.
 *  Must run from a tap: iOS only asks for permission inside a user gesture. */
async function subscribe(publicKey: string): Promise<string> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for Atlas. Allow them in this device's settings, then try again."
        : "Notifications weren't allowed.",
    );
  }
  const reg = await navigator.serviceWorker.ready;
  const options = { userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) };
  let sub: PushSubscription;
  try {
    sub = await reg.pushManager.subscribe(options);
  } catch (err) {
    // Subscribed before under another key (a fresh database makes new keys):
    // drop the old subscription and start again.
    const old = await reg.pushManager.getSubscription();
    if (!old) throw err;
    await old.unsubscribe();
    sub = await reg.pushManager.subscribe(options);
  }
  const json = sub.toJSON();
  await api<Device>("/notify/devices", {
    method: "POST",
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, label: deviceLabel() }),
  });
  return sub.endpoint;
}

export function useTurnOn(refreshOwn: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (publicKey: string) => subscribe(publicKey),
    onSettled: () => {
      refreshOwn();
      return client.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** Remove a device. If it is this browser, unsubscribe here too. */
export function useRemove(refreshOwn: () => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, own }: { id: number; own: boolean }) => {
      await api<void>(`/notify/devices/${id}`, { method: "DELETE" });
      if (own) {
        const reg = await navigator.serviceWorker.ready;
        await (await reg.pushManager.getSubscription())?.unsubscribe();
      }
    },
    onSettled: () => {
      refreshOwn();
      return client.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useTest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<Device>(`/notify/devices/${id}/test`, { method: "POST" }),
    onSettled: () => client.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (a: Pick<Alert, "id" | "enabled" | "at" | "lead_minutes">) =>
      api<Alert>(`/notify/alerts/${a.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: a.enabled, at: a.at, lead_minutes: a.lead_minutes }),
      }),
    onSuccess: (saved) =>
      client.setQueryData<NotifyState>(KEY, (old) =>
        old && { ...old, alerts: old.alerts.map((a) => (a.id === saved.id ? saved : a)) },
      ),
  });
}

/** The lead times on offer, in minutes. */
export const LEADS = [30, 60, 90, 120, 180, 240, 360, 720, 1440];

export function leadLabel(minutes: number, word: Alert["lead_word"] = "before"): string {
  if (minutes < 60) return `${minutes} min ${word}`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h ${word}`;
}
