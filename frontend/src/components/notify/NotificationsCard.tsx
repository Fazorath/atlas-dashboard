/* Notifications on the Status screen (ADR 0007): turn them on for this device,
   the devices that get them, and one row per Alert with its switch and time.

   Nothing is sent until a device is on. Changes save as you make them — there
   is no Save button, as with a habit tick. Anyone may turn their own device
   on; changing an Alert is Owner-only (ADR 0008). */

import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  type Alert,
  type Device,
  LEADS,
  leadLabel,
  support,
  useNotify,
  useOwnHash,
  useRemove,
  useSetAlert,
  useTest,
  useTurnOn,
} from "@/lib/notify";
import { useUnlocked } from "@/lib/owner";
import { AREAS } from "@/lib/sections";
import { cn, timeAgo } from "@/lib/utils";

const field =
  "tnum h-9 rounded-row bg-surface px-2 text-[13px] text-fg outline-none [color-scheme:dark] " +
  "focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50";

export function NotificationsCard() {
  const notify = useNotify();
  const unlocked = useUnlocked();
  const [ownHash, refreshOwn] = useOwnHash();
  const turnOn = useTurnOn(refreshOwn);
  const can = support();
  const data = notify.data;
  // This browser has a subscription, and the API still lists a device for it.
  const onHere = ownHash !== null && Boolean(data?.devices.some((d) => d.endpoint_hash === ownHash));

  return (
    <Card title="Notifications" icon={Bell} bodyClassName="flex flex-col gap-4 pt-3">
      {notify.isPending ? (
        <Skeleton width="100%" height={58} pulse className="rounded-row" />
      ) : notify.isError || !data ? (
        <Chip tone="error" className="self-start whitespace-normal">
          Couldn&rsquo;t load notification settings
        </Chip>
      ) : (
        <>
          {can === "ios-tab" ? (
            <p className="text-[13px] leading-snug font-semibold text-fg-muted">
              On iPhone, notifications only work in the Home Screen app. In Safari tap Share →
              Add to Home Screen, open Atlas from there, and turn them on here.
            </p>
          ) : can === "none" ? (
            <p className="text-[13px] leading-snug font-semibold text-fg-muted">
              This browser can&rsquo;t receive notifications.
            </p>
          ) : !onHere ? (
            <div className="flex flex-col items-start gap-2">
              <Button
                variant="solid"
                disabled={turnOn.isPending}
                onClick={() => turnOn.mutate(data.public_key)}
              >
                {turnOn.isPending ? "Turning on…" : "Turn on for this device"}
              </Button>
              {turnOn.error ? (
                <p className="text-[12px] leading-snug font-semibold text-due-soft">
                  {turnOn.error.message}
                </p>
              ) : null}
            </div>
          ) : null}

          {data.devices.length > 0 ? (
            <Devices devices={data.devices} ownHash={ownHash} refreshOwn={refreshOwn} />
          ) : (
            <p className="text-[12px] font-semibold text-fg-dim">
              No device has notifications on, so nothing is sent.
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {data.alerts.map((a) => (
              <li key={a.id}>
                <AlertRow alert={a} locked={!unlocked} />
              </li>
            ))}
          </ul>
          {!unlocked ? (
            <p className="text-[12px] font-semibold text-fg-dim">
              Only the Owner can change Alerts — unlock Settings below.
            </p>
          ) : null}

          {data.last_run ? (
            <p className="text-[12px] font-semibold text-fg-dim">
              {data.last_run.status === "failed"
                ? `Last check failed: ${data.last_run.error ?? "unknown error"}`
                : `Checked ${timeAgo(data.last_run.started_at)}`}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

function Devices({
  devices,
  ownHash,
  refreshOwn,
}: {
  devices: Device[];
  ownHash: string | null;
  refreshOwn: () => void;
}) {
  const remove = useRemove(refreshOwn);
  const test = useTest();

  return (
    <ul className="flex flex-col gap-2">
      {devices.map((d) => {
        const own = d.endpoint_hash === ownHash;
        const testing = test.isPending && test.variables === d.id;
        const testError = test.error && test.variables === d.id ? test.error.message : null;
        return (
          <li key={d.id} className="flex flex-col gap-2 rounded-row bg-surface-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">
                  {d.label}
                  {own ? <span className="text-[12px] font-semibold text-fg-muted"> · this device</span> : null}
                </p>
                <p className="truncate text-[12px] font-semibold text-fg-muted">
                  {d.last_ok_at ? `last delivered ${timeAgo(d.last_ok_at)}` : `added ${timeAgo(d.created_at)}`}
                </p>
              </div>
              <Button size="md" variant="ghost" disabled={testing} onClick={() => test.mutate(d.id)}>
                {testing ? "Sending…" : "Test"}
              </Button>
              <Button
                size="md"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: d.id, own })}
              >
                Remove
              </Button>
            </div>
            {testError || d.last_error ? (
              <p className="text-[12px] leading-snug font-semibold break-words text-due-soft">
                {testError ?? d.last_error}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function AlertRow({ alert, locked }: { alert: Alert; locked: boolean }) {
  const set = useSetAlert();
  const area = Object.values(AREAS).find((a) => a.to === alert.url);
  const save = (patch: Partial<Alert>) => set.mutate({ ...alert, ...patch });

  return (
    // On a phone the controls go under the text, or the label truncates.
    <div
      data-accent={area?.accent}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-row bg-surface-2 px-4 py-3"
    >
      <div className="min-w-0 flex-1 max-[479px]:basis-full">
        <p className="truncate text-[15px] font-bold">{alert.label}</p>
        <p className="text-[12px] leading-snug font-semibold text-fg-muted">
          {area ? <span className="text-accent">{area.label} · </span> : null}
          {alert.detail}
        </p>
      </div>
      {alert.at !== null ? (
        <input
          type="time"
          value={alert.at.slice(0, 5)}
          disabled={locked || !alert.enabled}
          onChange={(e) => e.target.value && save({ at: e.target.value })}
          aria-label={`${alert.label} time`}
          className={cn(field, "w-[110px]")}
        />
      ) : alert.lead_minutes !== null ? (
        <select
          value={alert.lead_minutes}
          disabled={locked || !alert.enabled}
          onChange={(e) => save({ lead_minutes: Number(e.target.value) })}
          aria-label={`${alert.label} ${alert.lead_word === "after" ? "delay" : "lead time"}`}
          className={cn(field, "w-[124px]")}
        >
          {(LEADS.includes(alert.lead_minutes) ? LEADS : [...LEADS, alert.lead_minutes].sort((x, y) => x - y)).map((m) => (
            <option key={m} value={m}>
              {leadLabel(m, alert.lead_word)}
            </option>
          ))}
        </select>
      ) : null}
      <Switch
        on={alert.enabled}
        label={alert.label}
        disabled={locked}
        className="ml-auto"
        onChange={(enabled) => save({ enabled })}
      />
      {set.error ? (
        <p className="basis-full text-[12px] font-semibold text-due-soft">{set.error.message}</p>
      ) : null}
    </div>
  );
}
