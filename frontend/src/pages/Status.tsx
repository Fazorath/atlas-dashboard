/* Status — every Source, how fresh it is, and what needs you.

   Behind the avatar menu, not in the nav: it is plumbing, and Today only ever
   shows a single Problem chip that leads here. Later it also holds accounts and
   connections; today the one connection with controls is Google Health, whose
   Testing-mode sign-in needs a click once a week (ADR 0002 moved it here from
   the Health screen). Notifications are switched on and tuned here too.

   Below them, Settings: Setup's forms one section at a time (ADR 0008),
   Owner-only — an unclaimed install is claimed here, a locked device unlocks
   here. A hand edit of config/ that didn't apply shows at the top.

   Google's consent redirect lands on this screen, as /status?connected=1 or
   ?oauth_error=…, so the outcome is shown on the card that started it. */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MapPin, Puzzle, RefreshCw, UserRound } from "lucide-react";
import { Link } from "react-router-dom";

import { CustomSecretsCard } from "@/components/settings/CustomSecrets";
import { NotificationsCard } from "@/components/notify/NotificationsCard";
import { ModulesSection } from "@/components/settings/Modules";
import { ChangePassphraseForm, ClaimForm, UnlockForm } from "@/components/settings/OwnerForms";
import { PlaceForm, YouForm } from "@/components/settings/YouPlace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectionCard, useOAuthFlash } from "@/components/widgets/fitbit-connection";
import { api, type SourceStatus, type SyncResult } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { useLock, useOwner } from "@/lib/owner";
import { useSettings } from "@/lib/settings";
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
  const configProblem = useConfig()?.config_problem;

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

      {configProblem ? (
        <div className="flex flex-col gap-1 rounded-card border border-due-track bg-due-tint px-4 py-3">
          <p className="text-[14px] font-bold text-due-soft">A change to config/ didn&rsquo;t apply</p>
          <p className="text-[12px] leading-snug font-semibold break-words text-fg-muted">
            {configProblem} — Atlas keeps using the last settings that worked until the file is fixed.
          </p>
        </div>
      ) : null}

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

      <CustomSecretsCard />

      <NotificationsCard />

      <SettingsSections />
    </div>
  );
}

/** Setup's forms, for the Owner. Everyone else sees how to become one. */
function SettingsSections() {
  const owner = useOwner();
  const unlocked = owner.data?.unlocked ?? false;
  const settings = useSettings(unlocked);
  const lock = useLock();

  if (owner.isPending || owner.isError) return null;
  if (!owner.data.claimed) {
    return (
      <Card title="Claim this Atlas" icon={KeyRound} bodyClassName="flex flex-col gap-4 pt-3">
        <p className="text-[13px] leading-snug font-semibold text-fg-muted">
          Nobody owns this install yet, so nobody can change its settings. Claim it with the setup
          code from the atlas-api log.
        </p>
        <ClaimForm />
      </Card>
    );
  }
  if (!unlocked) {
    return (
      <Card title="Settings" icon={KeyRound} bodyClassName="flex flex-col gap-4 pt-3">
        <p className="text-[13px] leading-snug font-semibold text-fg-muted">
          Only the Owner can change settings. Unlock to edit them on this device for 30 days.
        </p>
        <UnlockForm />
      </Card>
    );
  }
  if (!settings.data) {
    return settings.isError ? (
      <Chip tone="error" className="self-start whitespace-normal">
        Couldn&rsquo;t load settings — {settings.error.message}
      </Chip>
    ) : (
      <Skeleton width="100%" height={180} pulse className="rounded-card" />
    );
  }
  const s = settings.data;
  return (
    <>
      <h2 className="mt-4 text-[22px] leading-none font-extrabold tracking-[-0.02em]">Settings</h2>
      <Card title="You" icon={UserRound} bodyClassName="pt-3">
        <YouForm key={`${s.you.name}|${s.you.timezone}`} you={s.you} />
      </Card>
      <Card title="Place" icon={MapPin} bodyClassName="pt-3">
        <PlaceForm key={`${s.place.latitude}|${s.place.longitude}|${s.place.units}`} place={s.place} you={s.you} />
      </Card>
      <Card title="Modules" icon={Puzzle} bodyClassName="pt-3">
        <ModulesSection settings={s} />
      </Card>
      <Card title="Owner" icon={KeyRound} bodyClassName="flex flex-col gap-4 pt-3">
        <ChangePassphraseForm />
        <div className="flex items-center gap-3 border-t border-divider pt-4">
          <p className="min-w-0 flex-1 text-[13px] font-semibold text-fg-muted">
            Lock this device: settings need the passphrase again here.
          </p>
          <Button disabled={lock.isPending} onClick={() => lock.mutate(undefined)}>
            Lock
          </Button>
        </div>
      </Card>
    </>
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
        {status.configured && !status.source.startsWith("custom:") ? (
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
          Not set up yet — fill in its settings below.
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
