/* Setup — the guided first run (ADR 0008, CONTEXT.md **Setup**).

   Four steps, one per screen, the step in the address (/setup?step=2) so a
   refresh or Google's Connect redirect lands back where you were:

     1  Owner     claim with the code from the api log + a new passphrase
                  (or unlock, on an install that's already claimed). No skip.
     2  You       name, time zone
     3  Place     city search or coordinates, units
     4  Modules   switch each on, fill its form, Test, Save

   Each step saves as you leave it, writing config/ the way you could by hand,
   and applies at once. Finishing lands on Today with the default Boards. A
   fresh install (no config/atlas.yaml) is sent here from every route; after
   that the same forms live on the Status screen. */

import { useCallback, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ClaimForm, UnlockForm } from "@/components/settings/OwnerForms";
import { ModulesSection } from "@/components/settings/Modules";
import { PlaceForm, YouForm } from "@/components/settings/YouPlace";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectionCard, useOAuthFlash } from "@/components/widgets/fitbit-connection";
import { useConfig } from "@/lib/config";
import { useOwner } from "@/lib/owner";
import { useSettings } from "@/lib/settings";
import { useSleep } from "@/lib/sleep";
import { cn } from "@/lib/utils";

const STEPS = ["Owner", "You", "Place", "Modules"] as const;

export function Setup() {
  const [params, setParams] = useSearchParams();
  const owner = useOwner();
  const unlocked = owner.data?.unlocked ?? false;
  const asked = Number(params.get("step") ?? "1");
  // Nothing past the first step until this device is the Owner's.
  const step = unlocked ? Math.min(Math.max(asked, 2), 4) : 1;

  const go = useCallback(
    (n: number) => setParams({ step: String(n) }, { replace: false }),
    [setParams],
  );

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <div className="mx-auto flex w-full max-w-[600px] flex-col gap-6 px-[18px] pt-10 pb-16 lap:pt-16">
        <header className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-[12px] bg-sleep text-[18px] font-extrabold text-bg"
            >
              A
            </span>
            <span className="text-[22px] font-extrabold tracking-[-0.02em]">Atlas</span>
            <span className="eyebrow ml-auto">Setup</span>
          </div>
          <ol className="flex gap-1.5" aria-label="Setup steps">
            {STEPS.map((name, i) => (
              <li key={name} className="flex flex-1 flex-col gap-1.5">
                <span
                  aria-hidden
                  className={cn("h-1 rounded-full", i + 1 <= step ? "bg-sleep" : "bg-surface-2")}
                />
                <span
                  aria-current={i + 1 === step ? "step" : undefined}
                  className={cn(
                    "text-[12px] font-bold",
                    i + 1 === step ? "text-fg" : "text-fg-dim",
                  )}
                >
                  {i + 1}. {name}
                </span>
              </li>
            ))}
          </ol>
        </header>

        {owner.isPending ? (
          <Skeleton width="100%" height={240} pulse className="rounded-card" />
        ) : owner.isError ? (
          <Chip tone="error" className="self-start whitespace-normal">
            The API is not answering — check atlas-api is running
          </Chip>
        ) : step === 1 ? (
          <OwnerStep claimed={owner.data.claimed} onDone={() => go(2)} />
        ) : (
          <Steps step={step} go={go} />
        )}
      </div>
    </div>
  );
}

function Panel({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <section data-accent="sleep" className="flex flex-col gap-5 rounded-card-lg border border-border-subtle bg-surface p-5 lap:p-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.02em]">{title}</h1>
        <p className="text-[14px] leading-snug font-semibold text-fg-muted">{lede}</p>
      </div>
      {children}
    </section>
  );
}

function OwnerStep({ claimed, onDone }: { claimed: boolean; onDone: () => void }) {
  return claimed ? (
    <Panel
      title="Unlock to continue"
      lede="This Atlas already has an Owner. Enter the passphrase to change its setup from this device."
    >
      <UnlockForm onDone={onDone} />
    </Panel>
  ) : (
    <Panel
      title="Make this Atlas yours"
      lede="Anyone who can open Atlas can look at it. Only its Owner can change settings or enter passwords — prove you run the machine, then pick a passphrase."
    >
      <ClaimForm onDone={onDone} />
    </Panel>
  );
}

function Steps({ step, go }: { step: number; go: (n: number) => void }) {
  const settings = useSettings();
  const config = useConfig();

  if (settings.isPending) return <Skeleton width="100%" height={240} pulse className="rounded-card" />;
  if (settings.isError || !settings.data) {
    return (
      <Chip tone="error" className="self-start whitespace-normal">
        Couldn&rsquo;t load settings — {settings.error?.message ?? "try again"}
      </Chip>
    );
  }
  const s = settings.data;
  // A broken hand edit elsewhere in config/ stops any save from applying.
  const problem = s.problem ? (
    <p className="rounded-row bg-due-tint px-4 py-3 text-[13px] leading-snug font-semibold break-words text-due-soft">
      {s.problem} — fix that file first; until then Atlas keeps its last working settings and
      nothing saved here applies.
    </p>
  ) : null;

  if (step === 2) {
    return (
      <Panel title="Who is this for?" lede="Atlas greets you by name and counts your days in your own time zone.">
        {problem}
        <YouForm you={s.you} fresh={config?.setup ?? false} submitLabel="Next" onSaved={() => go(3)} />
      </Panel>
    );
  }
  if (step === 3) {
    return (
      <Panel title="Where are you?" lede="For the weather. Atlas looks the city up for you; nothing else uses it.">
        {problem}
        <PlaceForm
          place={s.place}
          you={s.you}
          submitLabel="Next"
          onSaved={() => go(4)}
          onSkip={() => go(4)}
        />
        <BackButton onClick={() => go(2)} />
      </Panel>
    );
  }
  return <ModulesStep go={go} problem={problem} />;
}

function ModulesStep({ go, problem }: { go: (n: number) => void; problem: ReactNode }) {
  const settings = useSettings();
  const navigate = useNavigate();
  const flash = useOAuthFlash();
  const sleep = useSleep();
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [warned, setWarned] = useState(false);
  const onDirty = useCallback(
    (id: string, d: boolean) => setDirty((prev) => (prev[id] === d ? prev : { ...prev, [id]: d })),
    [],
  );
  if (!settings.data) return null;

  const unsaved = settings.data.modules.filter((m) => m.enabled && dirty[m.id]).map((m) => m.label);
  const finish = () => {
    if (unsaved.length && !warned) {
      setWarned(true);
      return;
    }
    navigate("/", { replace: true });
  };
  const conn = sleep.data?.connection;

  return (
    <Panel
      title="What should Atlas show?"
      lede="Switch on what you use. Each one can be saved before it works — a Module that can't connect yet shows up on the Status screen until it does."
    >
      {problem}
      <ModulesSection
        settings={settings.data}
        onDirty={onDirty}
        renderExtra={(m) =>
          m.id === "google_health" && conn && conn.state !== "setup" ? (
            <ConnectionCard
              conn={conn}
              flash={flash}
              fetchedAt={sleep.data?.fetched_at ?? null}
              returnTo="/setup?step=4"
            />
          ) : null
        }
      />
      {warned && unsaved.length ? (
        <p className="text-[13px] font-semibold text-setup-text">
          {unsaved.join(", ")} {unsaved.length === 1 ? "has" : "have"} unsaved changes. Save them, or
          press Finish again to leave them.
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button variant="solid" onClick={finish}>
          Finish
        </Button>
        <BackButton onClick={() => go(3)} />
      </div>
    </Panel>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" className="self-start" onClick={onClick}>
      Back
    </Button>
  );
}
