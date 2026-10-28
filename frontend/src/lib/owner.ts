/* The Owner (ADR 0008): whether this install is claimed, and whether this
   device is unlocked. The unlock itself is an HttpOnly cookie the browser
   sends on its own; nothing here ever holds the passphrase after a request. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export interface OwnerState {
  claimed: boolean;
  unlocked: boolean;
}

export const OWNER_KEY = ["owner"] as const;

/** Where the setup code is, for the screens that ask for it. */
export const CODE_COMMAND = "docker compose logs atlas-api | grep 'setup code'";

export function useOwner() {
  return useQuery({ queryKey: OWNER_KEY, queryFn: () => api<OwnerState>("/owner") });
}

function useOwnerAction<T>(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: T) =>
      api<OwnerState>(`/owner/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) }),
    onSuccess: (state) => {
      client.setQueryData(OWNER_KEY, state);
      // Owner-only reads (settings) change with the lock.
      void client.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export const useClaim = () => useOwnerAction<{ code: string; passphrase: string }>("claim");
export const useUnlock = () => useOwnerAction<{ passphrase: string }>("unlock");
export const useLock = () => useOwnerAction<undefined>("lock");
export const useChangePassphrase = () =>
  useOwnerAction<{ current: string; new: string }>("passphrase");

/** True only once we know this device is unlocked. */
export function useUnlocked(): boolean {
  return useOwner().data?.unlocked ?? false;
}
