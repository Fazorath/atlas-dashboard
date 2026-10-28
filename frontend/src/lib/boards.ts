/* The Board seam: read and save a screen's arrangement (/api/boards).

   The server stores only what you saved; `layout: null` means "never saved"
   and the Board shows its default, so Reset is a DELETE rather than writing
   the default back. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { BoardKey, TileSpec } from "@/widgets/types";

interface BoardOut {
  key: string;
  layout: TileSpec[] | null;
  /** Modules that were on when the layout was last written; null if unknown. */
  seen_modules?: string[] | null;
  updated_at: string | null;
}

const boardKey = (key: BoardKey) => ["boards", key] as const;

export function useBoardLayout(key: BoardKey) {
  return useQuery({
    queryKey: boardKey(key),
    queryFn: () => api<BoardOut>(`/boards/${key}`),
    // Changes only when you press Done, and that writes the cache itself.
    staleTime: Infinity,
  });
}

interface SaveArgs {
  layout: TileSpec[];
  /** Modules on when this is written; they count as caught up. */
  seen?: string[] | null;
}

export function useSaveBoard(key: BoardKey) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ layout, seen }: SaveArgs) =>
      api<BoardOut>(`/boards/${key}`, {
        method: "PUT",
        body: JSON.stringify({ layout, seen_modules: seen ?? undefined }),
      }),
    // Optimistic: Done shows the new arrangement at once; a failed save puts
    // the old one back.
    onMutate: async ({ layout, seen }) => {
      await client.cancelQueries({ queryKey: boardKey(key) });
      const previous = client.getQueryData<BoardOut>(boardKey(key));
      client.setQueryData<BoardOut>(boardKey(key), {
        key,
        layout,
        seen_modules: seen ?? previous?.seen_modules ?? null,
        updated_at: previous?.updated_at ?? null,
      });
      return { previous };
    },
    onError: (_err, _layout, ctx) => {
      if (ctx?.previous) client.setQueryData(boardKey(key), ctx.previous);
    },
    onSuccess: (saved) => client.setQueryData(boardKey(key), saved),
  });
}

export function useResetBoard(key: BoardKey) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/boards/${key}`, { method: "DELETE" }),
    onSuccess: () => client.setQueryData<BoardOut>(boardKey(key), { key, layout: null, updated_at: null }),
  });
}
