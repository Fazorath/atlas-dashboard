/* Fitbit's connection to Google, in the two places it is shown.

   Google's Testing-status apps sign you out seven days after consent however
   often the token is used, so reconnecting is a weekly chore by design, not a
   failure. The banner makes it one click on Today, before the card goes stale;
   the Status screen's card is the full control — connect, paste back, reconnect,
   disconnect. */

import { Link2, Moon, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { ApiError } from "@/lib/api";
import {
  needsReconnect,
  reconnectByLabel,
  startConnect,
  useCompleteConnect,
  useDisconnect,
  type Connection,
} from "@/lib/sleep";
import { timeAgo } from "@/lib/utils";

function useConnect(conn: Connection) {
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setError(null);
    setBusy(true);
    try {
      await startConnect(conn.paste_back);
      if (conn.paste_back) setWaiting(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't start the Google sign-in.");
    } finally {
      setBusy(false);
    }
  };
  return { connect, error, waiting, busy };
}

/** Today's one-line prompt. Renders nothing unless a click is actually due. */
export function ReconnectBanner({ conn }: { conn: Connection | undefined }) {
  const due = needsReconnect(conn);
  if (!conn || !due) return null;
  return <BannerBody conn={conn} due={due} />;
}

function BannerBody({ conn, due }: { conn: Connection; due: "expired" | "soon" }) {
  const { connect, error, busy } = useConnect(conn);
  const title = due === "expired" ? "Fitbit disconnected" : "Fitbit sign-in ends soon";
  const line =
    due === "expired"
      ? "Google's weekly sign-in lapsed, so sleep stopped syncing. One click brings it back."
      : `Google ends the sign-in ${reconnectByLabel(conn.reconnect_by!)}. Reconnect now to skip the gap.`;

  return (
    <Card title={title} titleHidden accent="sleep" span={4} className="desk:order-0">
      <div className="flex flex-col gap-3 lap:flex-row lap:items-center lap:gap-5">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-chip bg-accent-track text-accent"
        >
          <Moon size={20} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-extrabold">{title}</p>
          <p className="mt-0.5 text-[13px] leading-snug font-semibold text-accent-soft">
            {error ?? line}
          </p>
        </div>
        {/* Paste-back needs the Status screen's input, so that flow goes there. */}
        {conn.paste_back ? (
          <a href="/status" className="pressable self-start lap:self-auto">
            <span className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-4 text-[14px] font-bold text-bg">
              <RefreshCw size={16} strokeWidth={2.6} /> Reconnect
            </span>
          </a>
        ) : (
          <Button variant="solid" className="self-start lap:self-auto" onClick={connect} disabled={busy}>
            <RefreshCw size={16} strokeWidth={2.6} /> Reconnect
          </Button>
        )}
      </div>
    </Card>
  );
}

/** The Status screen's connection card. */
export function ConnectionCard({
  conn,
  flash,
  fetchedAt,
}: {
  conn: Connection;
  /** Outcome carried back on the redirect from Google, if any. */
  flash?: { ok: boolean; message: string } | null;
  fetchedAt: string | null;
}) {
  const { connect, error, waiting, busy } = useConnect(conn);
  const disconnect = useDisconnect();
  const [confirm, setConfirm] = useState(false);

  const connected = conn.state === "connected";
  const due = needsReconnect(conn);

  const chip = connected ? (
    due === "soon" ? (
      <Chip tone="setup" compact>
        Ends {reconnectByLabel(conn.reconnect_by!)}
      </Chip>
    ) : (
      <Chip tone="live" compact>
        Connected
      </Chip>
    )
  ) : conn.state === "expired" ? (
    <Chip tone="error" compact>
      Signed out
    </Chip>
  ) : (
    <Chip tone="setup" compact>
      Not connected
    </Chip>
  );

  const facts = connected
    ? [
        conn.reconnect_by && `Google signs you out ${reconnectByLabel(conn.reconnect_by)}`,
        fetchedAt && `synced ${timeAgo(fetchedAt)}`,
      ]
    : conn.state === "expired"
      ? [conn.reason, "your archived nights are kept"]
      : ["Sign in with the Google account your Fitbit uses. Atlas asks for read-only sleep, activity and heart-rate access."];

  return (
    <Card title="Google Health" accent="sleep" icon={Link2} aside={chip} bodyClassName="gap-4 pt-3">
      {flash ? (
        <Chip tone={flash.ok ? "live" : "error"} className="self-start whitespace-normal">
          {flash.message}
        </Chip>
      ) : null}

      <p className="text-[13px] leading-snug font-semibold text-accent-soft">
        {facts.filter(Boolean).join(" · ")}
      </p>

      {error ? <p className="text-[13px] font-semibold text-due-soft">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button variant={connected ? "soft" : "solid"} onClick={connect} disabled={busy}>
          <RefreshCw size={16} strokeWidth={2.6} />
          {conn.state === "disconnected" ? "Connect Fitbit" : "Reconnect"}
        </Button>
        {conn.state !== "disconnected" ? (
          confirm ? (
            <>
              <Button
                variant="neutral"
                onClick={() => disconnect.mutate(undefined, { onSettled: () => setConfirm(false) })}
                disabled={disconnect.isPending}
              >
                Yes, disconnect
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirm(true)}>
              Disconnect
            </Button>
          )
        ) : null}
      </div>

      {conn.paste_back && (waiting || conn.state !== "connected") ? <PasteBack /> : null}
    </Card>
  );
}

/** For a localhost redirect URI: Google sends the browser to an address that
    doesn't load, and the code in it has to come back here by hand. */
function PasteBack() {
  const [url, setUrl] = useState("");
  const complete = useCompleteConnect();

  return (
    <form
      className="flex flex-col gap-2 rounded-row bg-surface-2 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) complete.mutate(url.trim(), { onSuccess: () => setUrl("") });
      }}
    >
      <label htmlFor="pasted-url" className="text-[13px] leading-snug font-semibold text-fg-muted">
        After you approve, Google opens a page that won&rsquo;t load. Copy its whole address and
        paste it here.
      </label>
      <div className="flex gap-2">
        <input
          id="pasted-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:8080/oauth/callback?state=…&code=…"
          className="h-11 min-w-0 flex-1 rounded-full bg-bg px-4 text-[13px] font-semibold text-fg outline-none placeholder:text-fg-dim focus-visible:ring-2 focus-visible:ring-accent"
          autoComplete="off"
          spellCheck={false}
        />
        <Button variant="solid" type="submit" disabled={complete.isPending || !url.trim()}>
          {complete.isPending ? "Syncing…" : "Finish"}
        </Button>
      </div>
      {complete.isError ? (
        <p className="text-[13px] font-semibold text-due-soft">
          {complete.error instanceof ApiError ? complete.error.message : "That didn't work."}
        </p>
      ) : null}
    </form>
  );
}
