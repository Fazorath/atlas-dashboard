/* Status — every Source, how fresh it is, and what needs you.

   Behind the avatar menu, not in the nav: it is plumbing, and Today only ever
   shows a single Problem chip that leads here. Later it also holds accounts and
   connections; today the one connection with controls is Google Health, whose
   Testing-mode sign-in needs a click once a week (ADR 0002 moved it here from
   the Health screen).

   Google's consent redirect lands on this screen, as /status?connected=1 or
   ?oauth_error=…, so the outcome is shown on the card that started it. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectionCard } from "@/components/widgets/fitbit-connection";
import { api, type SourceStatus, type SyncResult } from "@/lib/api";
import { AREAS } from "@/lib/sections";
import { useSleep } from "@/lib/sleep";
import {
  areaFreshness,
  freshnessTone,
  problemsOf,
  sourceLabel,
  useSources,
} from "@/lib/sources";

export function Status() {
  const sources = useSources();
  const sleep = useSleep();
  const flash = useOAuthFlash();
  const problems = problemsOf(sources.all);
  const conn = sleep.data?.connection;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-[14px] lap:gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-[30px] leading-none font-extrabold tracking-[-0.02em] lap:text-[40px] lap:tracking-[-0.03em]">
          Status
        </h1>
        <p className="text-[13px] leading-none font-semibold text-fg-muted">
          {sources.isPending
            ? "checking"
            : problems.length === 0
              ? "Every source is working"
              : `${problems.length} ${problems.length === 1 ? "source needs" : "sources need"} you`}
        </p>
      </header>

      <Card title="Sources" bodyClassName="pt-3">
        {sources.isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width="100%" height={58} pulse className="rounded-row" />
            ))}
          </div>
        ) : sources.isError ? (
          <Chip tone="error" className="self-start whitespace-normal">
            The API is not answering — check atlas-api is running
          </Chip>
        ) : (
          <ul className="flex flex-col gap-2">
            {sources.all.map((status) => (
              <li key={status.source}>
                <SourceRow status={status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {conn && conn.state !== "setup" ? (
        <ConnectionCard conn={conn} flash={flash} fetchedAt={sleep.data?.fetched_at ?? null} />
      ) : null}
    </div>
  );
}

/** Which Area a Source feeds, for the row's second line and its link. */
function areaOf(source: string) {
  return Object.values(AREAS).find((a) => a.source === source);
}

function SourceRow({ status }: { status: SourceStatus }) {
  const area = areaOf(status.source);
  const tone = freshnessTone(status);
  const problem = problemsOf([status])[0];
  const sync = useSyncNow(status.source);

  return (
    <div
      data-accent={area?.accent}
      className="flex flex-col gap-2 rounded-row bg-surface-2 px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{sourceLabel(status.source)}</p>
          <p className="truncate text-[12px] font-semibold text-fg-muted">
            {area ? (
              <Link to={area.to} className="text-accent">
                {area.label}
              </Link>
            ) : (
              status.source
            )}
            {" · "}
            {status.live ? "read live" : "archived"}
          </p>
        </div>
        <Chip tone={tone} compact>
          {areaFreshness(status)}
        </Chip>
        {status.configured ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Sync ${sourceLabel(status.source)} now`}
            title="Sync now"
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
          >
            <RefreshCw
              aria-hidden
              strokeWidth={2}
              className={sync.isPending ? "size-[18px] animate-spin" : "size-[18px]"}
            />
          </Button>
        ) : null}
      </div>
      {problem?.detail ? (
        <p className="text-[12px] leading-snug font-semibold break-words text-due-soft">
          {problem.detail}
        </p>
      ) : null}
      {!status.configured ? (
        <p className="text-[12px] leading-snug font-semibold text-fg-muted">
          Its credentials aren't in .env yet — see the README for this source.
        </p>
      ) : null}
    </div>
  );
}

function useSyncNow(source: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<SyncResult>(`/sync/${source}`, { method: "POST" }),
    // A sync can change any Area's numbers (Health also ticks Measured habits),
    // so everything refetches.
    onSettled: () => client.invalidateQueries(),
  });
}

/** Google's redirect comes back as /status?connected=1 or ?oauth_error=…;
    read it once, then drop it from the address so a refresh doesn't repeat it. */
function useOAuthFlash() {
  const [params, setParams] = useSearchParams();
  const [flash] = useState(() => {
    if (params.get("connected")) return { ok: true, message: "Connected — your last 90 days are in." };
    const error = params.get("oauth_error");
    return error ? { ok: false, message: error } : null;
  });
  useEffect(() => {
    if (params.has("connected") || params.has("oauth_error")) setParams({}, { replace: true });
  }, [params, setParams]);
  return flash;
}
