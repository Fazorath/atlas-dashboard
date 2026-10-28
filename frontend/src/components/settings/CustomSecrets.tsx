/* A Custom module's secrets (ADR 0004): listed as set or not set for anyone;
   the Owner, once unlocked, gets a write-only field for each. The value goes to
   the server and is never read back, so after a save the field is empty again. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { FieldRow, inputClass, SaveError } from "@/components/settings/parts";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Card } from "@/components/ui/card";
import { deleteCustomSecret, getCustomModules, putCustomSecret } from "@/lib/api";
import { useUnlocked } from "@/lib/owner";

export function CustomSecretsCard() {
  const modules = useQuery({ queryKey: ["custom", "modules"], queryFn: getCustomModules });
  const unlocked = useUnlocked();
  const withSecrets = (modules.data ?? []).filter((m) => m.secrets.length > 0);
  if (withSecrets.length === 0) return null;

  return (
    <Card title="Custom module secrets" bodyClassName="flex flex-col gap-4 pt-3">
      {withSecrets.map((m) => (
        <section key={m.id} className="flex flex-col gap-2 rounded-row bg-surface-2 px-4 py-3">
          <p className="text-[15px] font-bold">{m.name}</p>
          {m.secrets.map((s) => (
            <SecretRow key={s.name} module={m.id} name={s.name} isSet={s.set} unlocked={unlocked} />
          ))}
        </section>
      ))}
      {!unlocked ? (
        <p className="text-[12px] leading-snug font-semibold text-fg-muted">
          Unlock as the Owner to enter or change these.
        </p>
      ) : null}
    </Card>
  );
}

function SecretRow({
  module,
  name,
  isSet,
  unlocked,
}: {
  module: string;
  name: string;
  isSet: boolean;
  unlocked: boolean;
}) {
  const client = useQueryClient();
  const [value, setValue] = useState("");
  const done = () => {
    setValue("");
    // The widget, the module's Status row and this list all change with it.
    return client.invalidateQueries();
  };
  const save = useMutation({ mutationFn: () => putCustomSecret(module, name, value), onSuccess: done });
  const remove = useMutation({ mutationFn: () => deleteCustomSecret(module, name), onSuccess: done });
  const id = `secret-${module}-${name}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor={unlocked ? id : undefined} className="min-w-0 flex-1 truncate text-[13px] font-bold">
          {name}
        </label>
        <Chip tone={isSet ? "live" : "setup"} compact>
          {isSet ? "set" : "not set"}
        </Chip>
      </div>
      {unlocked ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) save.mutate();
          }}
        >
          <FieldRow label="" htmlFor={id} help={isSet ? "Saved. Enter a new value to replace it." : undefined}>
            <input
              id={id}
              type="password"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={isSet ? "••••••••" : "Paste the value"}
              className={inputClass}
            />
          </FieldRow>
          <div className="flex gap-2">
            <Button type="submit" size="md" disabled={!value.trim() || save.isPending}>
              {isSet ? "Replace" : "Save"}
            </Button>
            {isSet ? (
              <Button
                type="button"
                size="md"
                variant="neutral"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <SaveError error={save.error ?? remove.error} />
        </form>
      ) : null}
    </div>
  );
}
