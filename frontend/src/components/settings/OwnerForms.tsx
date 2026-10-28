/* Becoming the Owner (ADR 0008): claim a fresh install with the setup code
   from the api log, unlock this device with the passphrase, or change it. */

import { useState, type FormEvent } from "react";

import { FieldRow, SaveError, Saved, inputClass } from "@/components/settings/parts";
import { Button } from "@/components/ui/button";
import { CODE_COMMAND, useChangePassphrase, useClaim, useUnlock } from "@/lib/owner";

const MIN = 8;

export function ClaimForm({ onDone }: { onDone?: () => void }) {
  const claim = useClaim();
  const [code, setCode] = useState("");
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const mismatch = again.length > 0 && again !== pass;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pass.length < MIN || pass !== again) return;
    claim.mutate({ code, passphrase: pass }, { onSuccess: () => onDone?.() });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldRow
        label="Setup code"
        htmlFor="claim-code"
        help={
          <>
            Atlas printed it in its log when it started. On the machine running Atlas:{" "}
            <code className="font-mono text-fg">{CODE_COMMAND}</code>
          </>
        }
      >
        <input
          id="claim-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCD-EFGH"
          className={`${inputClass} font-mono tracking-[0.12em] uppercase`}
        />
      </FieldRow>
      <FieldRow
        label="New Owner passphrase"
        htmlFor="claim-pass"
        help={`At least ${MIN} characters. You'll need it to change settings, on each device, every 30 days.`}
      >
        <input
          id="claim-pass"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="new-password"
          className={inputClass}
        />
      </FieldRow>
      <FieldRow label="Passphrase again" htmlFor="claim-again" help={mismatch ? "These don't match yet." : undefined}>
        <input
          id="claim-again"
          type="password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          autoComplete="new-password"
          className={inputClass}
        />
      </FieldRow>
      <SaveError error={claim.error} />
      <Button
        type="submit"
        variant="solid"
        className="self-start"
        disabled={claim.isPending || !code.trim() || pass.length < MIN || pass !== again}
      >
        {claim.isPending ? "Claiming…" : "Claim this Atlas"}
      </Button>
    </form>
  );
}

export function UnlockForm({ onDone }: { onDone?: () => void }) {
  const unlock = useUnlock();
  const [pass, setPass] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    unlock.mutate({ passphrase: pass }, { onSuccess: () => onDone?.() });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FieldRow
        label="Owner passphrase"
        htmlFor="unlock-pass"
        help={
          <>
            Forgot it? On the machine running Atlas:{" "}
            <code className="font-mono text-fg">docker compose exec atlas-api python -m app.owner reset</code>
          </>
        }
      >
        <input
          id="unlock-pass"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="current-password"
          className={inputClass}
        />
      </FieldRow>
      <SaveError error={unlock.error} />
      <Button type="submit" variant="solid" className="self-start" disabled={unlock.isPending || !pass}>
        {unlock.isPending ? "Unlocking…" : "Unlock"}
      </Button>
    </form>
  );
}

export function ChangePassphraseForm() {
  const change = useChangePassphrase();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate(
      { current, new: next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 lap:grid-cols-2">
        <FieldRow label="Current passphrase" htmlFor="pass-current">
          <input
            id="pass-current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className={inputClass}
          />
        </FieldRow>
        <FieldRow label="New passphrase" htmlFor="pass-new">
          <input
            id="pass-new"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className={inputClass}
          />
        </FieldRow>
      </div>
      <p className="text-[12px] leading-snug font-semibold text-fg-muted">
        Every other device is locked out until it unlocks with the new one. Saved secrets are kept.
      </p>
      <SaveError error={change.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={change.isPending || !current || next.length < MIN}>
          {change.isPending ? "Changing…" : "Change passphrase"}
        </Button>
        <Saved show={change.isSuccess}>Changed</Saved>
      </div>
    </form>
  );
}
