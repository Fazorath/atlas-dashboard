/* Setup's Modules step and the Modules section on Status: a switch per
   Module, and under each one that is on, its form — rendered from the fields
   the backend declares (app/setup/fields.py), never hand-built per Module.

   A secret is never sent back, so its box only says whether one is saved, set
   in .env (read-only — .env wins), or missing. Test runs the Module's own
   fetch with the form as it stands, saved or not; Save is allowed even when
   Test fails, and the Module then shows up as a Problem on Status. */

import { ExternalLink } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { FieldRow, SaveError, Saved, inputClass } from "@/components/settings/parts";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import { AREAS, type AreaKey } from "@/lib/sections";
import {
  REACHING_APPS_URL,
  hostOf,
  pairsToText,
  textToPairs,
  useSaveEnabled,
  useSaveModule,
  useTestModule,
  type FieldDef,
  type ModuleSettings,
  type SettingsState,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

export function ModulesSection({
  settings,
  renderExtra,
  onDirty,
}: {
  settings: SettingsState;
  /** Something to show under one Module's form — Health's Connect card. */
  renderExtra?: (module: ModuleSettings) => ReactNode;
  /** Which Modules' forms have unsaved edits. */
  onDirty?: (id: string, dirty: boolean) => void;
}) {
  const save = useSaveEnabled();

  const toggle = (id: string, on: boolean, take_over = false) => {
    const enabled = on ? [...settings.enabled, id] : settings.enabled.filter((m) => m !== id);
    save.mutate({ enabled, take_over });
  };
  const pending = save.isPending ? save.variables?.enabled : null;

  return (
    <div className="flex flex-col gap-3">
      <SaveError
        error={save.error}
        onTakeOver={() => save.variables && save.mutate({ ...save.variables, take_over: true })}
      />
      <ul className="flex flex-col gap-3">
        {settings.modules.map((m) => {
          const on = pending ? pending.includes(m.id) : m.enabled;
          const area = AREAS[m.area as AreaKey];
          return (
            <li
              key={m.id}
              data-accent={area?.accent}
              className="flex flex-col gap-4 rounded-row bg-surface-2 px-4 py-3 lap:px-5"
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[15px] font-bold">
                    <span aria-hidden className="size-1.5 shrink-0 bg-accent" />
                    {m.label}
                  </p>
                  <p className="text-[12px] leading-snug font-semibold text-fg-muted">{m.blurb}</p>
                </div>
                <Switch
                  on={on}
                  label={`${m.label} on`}
                  disabled={save.isPending}
                  onChange={(next) => toggle(m.id, next)}
                />
              </div>
              {on ? (
                <>
                  <ModuleForm module={m} place={settings.place} onDirty={onDirty} />
                  {renderExtra?.(m)}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Inputs sit on the Module's grey row, so they take the card's darker grey. */
const rowInput = cn(inputClass, "bg-surface");

type Draft = Record<string, string>;

function initialDraft(m: ModuleSettings): Draft {
  const out: Draft = {};
  for (const f of m.fields) {
    if (f.kind === "secret") continue;
    if (f.kind === "pairs") out[f.key] = pairsToText(f.value);
    else if (f.key === "redirect_uri" && !f.value) out[f.key] = `${window.location.origin}/api/sleep/oauth/callback`;
    else out[f.key] = f.value === undefined || f.value === null ? "" : String(f.value);
  }
  return out;
}

export function ModuleForm({
  module: m,
  place,
  onDirty,
}: {
  module: ModuleSettings;
  place: SettingsState["place"];
  onDirty?: (id: string, dirty: boolean) => void;
}) {
  const [saved, setSaved] = useState(() => initialDraft(m));
  const [draft, setDraft] = useState(saved);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const save = useSaveModule(m.id);
  const test = useTestModule(m.id);

  const dirty =
    Object.values(secrets).some((v) => v.trim()) ||
    Object.keys(draft).some((k) => draft[k] !== saved[k]);
  useEffect(() => onDirty?.(m.id, dirty), [dirty, m.id, onDirty]);

  const body = () => ({
    values: Object.fromEntries(
      m.fields
        .filter((f) => f.kind !== "secret")
        .map((f) => [f.key, f.kind === "pairs" ? textToPairs(draft[f.key] ?? "") : draft[f.key] ?? ""]),
    ),
    secrets: Object.fromEntries(Object.entries(secrets).filter(([, v]) => v.trim())),
  });

  const send = (take_over = false) =>
    save.mutate(
      { ...body(), take_over },
      {
        onSuccess: () => {
          setSaved(draft);
          setSecrets({});
          test.reset();
        },
      },
    );

  if (m.fields.length === 0 && !m.uses_place && !m.note) return null;

  return (
    <div className="flex flex-col gap-4 border-t border-divider pt-4">
      {m.uses_place ? (
        <p className="text-[13px] font-semibold text-fg-muted">
          Uses your Place:{" "}
          <span className="text-fg">
            {place.label ||
              (place.latitude !== null ? `${place.latitude}, ${place.longitude}` : "not set yet")}
          </span>
        </p>
      ) : null}

      {m.fields.map((f) => (
        <Field
          key={f.key}
          moduleId={m.id}
          field={f}
          value={draft[f.key] ?? ""}
          onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
          secret={secrets[f.key] ?? ""}
          onSecret={(v) => setSecrets((s) => ({ ...s, [f.key]: v }))}
          hostMoved={
            f.bound_to !== null && hostOf(draft[f.bound_to]) !== hostOf(saved[f.bound_to])
          }
        />
      ))}

      {m.note ? <p className="text-[12px] leading-snug font-semibold text-fg-dim">{m.note}</p> : null}

      {test.data ? (
        <div
          className={cn(
            "flex flex-col gap-1 rounded-row px-4 py-3 text-[13px] leading-snug font-semibold",
            test.data.ok ? "bg-habits-tint text-live-text" : "bg-due-tint text-due-soft",
          )}
          role="status"
        >
          <p className="break-words">{test.data.message}</p>
          {test.data.unreachable ? (
            <a href={REACHING_APPS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg underline">
              Reaching your other apps <ExternalLink aria-hidden className="size-3.5" />
            </a>
          ) : null}
        </div>
      ) : null}
      {test.error ? <SaveError error={test.error} /> : null}
      {save.data?.cleared.length ? (
        <p className="text-[13px] font-semibold text-setup-text">
          The address moved to another host, so the saved {save.data.cleared.join(" and ")} was cleared.
          Enter it again for the new address.
        </p>
      ) : null}
      <SaveError error={save.error} onTakeOver={() => send(true)} />

      {m.fields.length || m.testable ? (
        <div className="flex flex-wrap items-center gap-2">
          {m.fields.length ? (
            <Button variant="solid" disabled={save.isPending || !dirty} onClick={() => send()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          ) : null}
          {m.testable ? (
            <Button variant="soft" disabled={test.isPending} onClick={() => test.mutate(body())}>
              {test.isPending ? "Testing…" : "Test"}
            </Button>
          ) : null}
          <Saved show={save.isSuccess && !dirty} />
          {m.docs ? (
            <a
              href={m.docs}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-[13px] font-bold text-fg-muted"
            >
              Manual <ExternalLink aria-hidden className="size-3.5" />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  moduleId,
  field: f,
  value,
  onChange,
  secret,
  onSecret,
  hostMoved,
}: {
  moduleId: string;
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  secret: string;
  onSecret: (v: string) => void;
  hostMoved: boolean;
}) {
  const id = `${moduleId}-${f.key}`;

  if (f.kind === "secret") {
    const env = f.state === "env";
    const help = env
      ? "Set in .env, which wins. Change it there."
      : hostMoved && f.state === "set" && !secret
        ? `The address now points at another host: saving clears this ${f.label.toLowerCase()}.`
        : f.help;
    return (
      <FieldRow label={f.label} htmlFor={id} help={help}>
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="password"
            value={env ? "" : secret}
            disabled={env}
            onChange={(e) => onSecret(e.target.value)}
            autoComplete="off"
            placeholder={env ? "Set in .env" : f.state === "set" ? "Saved — type to replace" : ""}
            className={rowInput}
          />
          {f.state === "set" && !hostMoved ? (
            <Chip tone="live" compact>
              Saved
            </Chip>
          ) : env ? (
            <Chip tone="idle" compact>
              .env
            </Chip>
          ) : null}
        </div>
      </FieldRow>
    );
  }

  if (f.kind === "pairs") {
    return (
      <FieldRow label={f.label} htmlFor={id} help={f.help}>
        <textarea
          id={id}
          value={value}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder}
          className={cn(rowInput, "h-auto py-3 leading-snug")}
        />
      </FieldRow>
    );
  }

  if (f.kind === "select") {
    return (
      <FieldRow label={f.label} htmlFor={id} help={f.help}>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={rowInput}>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </FieldRow>
    );
  }

  return (
    <FieldRow label={f.label} htmlFor={id} help={f.help}>
      <input
        id={id}
        type={f.kind === "email" ? "email" : "text"}
        inputMode={f.kind === "url" ? "url" : f.kind === "number" ? "decimal" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={f.placeholder}
        spellCheck={false}
        autoComplete="off"
        className={rowInput}
      />
    </FieldRow>
  );
}
