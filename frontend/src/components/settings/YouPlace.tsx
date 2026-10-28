/* Setup's You and Place steps, and the same two sections on Status.

   You: the greeting's name and the time zone "today" is counted in, which
   starts as the browser's own. Place: a city search through the backend
   (Open-Meteo's geocoder, so the browser only talks to Atlas), or coordinates
   typed in. Picking a city also suggests its units, and its time zone when
   that differs from the one saved. */

import { Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { FieldRow, SaveError, Saved, inputClass } from "@/components/settings/parts";
import { Button } from "@/components/ui/button";
import {
  browserTimeZone,
  searchPlaces,
  useSavePlace,
  useSaveYou,
  type Place,
  type SettingsState,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

function timeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return [];
  }
}

export function YouForm({
  you,
  fresh = false,
  submitLabel = "Save",
  onSaved,
}: {
  you: SettingsState["you"];
  /** Setup on a fresh install: start from the browser's time zone. */
  fresh?: boolean;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const save = useSaveYou();
  const [name, setName] = useState(you.name);
  const [tz, setTz] = useState(fresh ? browserTimeZone() : you.timezone);
  const zones = useMemo(timeZones, []);

  const send = (take_over = false) =>
    save.mutate({ name, timezone: tz.trim(), take_over }, { onSuccess: () => onSaved?.() });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldRow label="Your name" htmlFor="you-name" help="For the greeting on Today. Leave blank for just “Hello”.">
        <input
          id="you-name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          className={inputClass}
        />
      </FieldRow>
      <FieldRow
        label="Time zone"
        htmlFor="you-tz"
        help="Where your day starts and ends: habit ticks, today's weather, which night was last night."
      >
        <input
          id="you-tz"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          list="atlas-zones"
          spellCheck={false}
          className={inputClass}
        />
        <datalist id="atlas-zones">
          {zones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </FieldRow>
      <SaveError error={save.error} onTakeOver={() => send(true)} />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="solid" disabled={save.isPending || !tz.trim()}>
          {save.isPending ? "Saving…" : submitLabel}
        </Button>
        <Saved show={save.isSuccess && !onSaved} />
      </div>
    </form>
  );
}

const coord = (v: number | null) => (v === null ? "" : String(v));

export function PlaceForm({
  place,
  you,
  submitLabel = "Save",
  onSaved,
  onSkip,
}: {
  place: SettingsState["place"];
  you: SettingsState["you"];
  submitLabel?: string;
  onSaved?: () => void;
  onSkip?: () => void;
}) {
  const save = useSavePlace();
  const saveYou = useSaveYou();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [label, setLabel] = useState(place.label);
  const [lat, setLat] = useState(coord(place.latitude));
  const [lon, setLon] = useState(coord(place.longitude));
  const [units, setUnits] = useState(place.units);
  const [zone, setZone] = useState<string | null>(null);
  const [useZone, setUseZone] = useState(true);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await searchPlaces(query.trim()));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const pick = (p: Place) => {
    setLabel(p.label);
    setLat(String(p.latitude));
    setLon(String(p.longitude));
    setUnits(p.units);
    setZone(p.timezone && p.timezone !== you.timezone ? p.timezone : null);
    setResults(null);
  };

  const latN = Number(lat);
  const lonN = Number(lon);
  const valid =
    lat.trim() !== "" && lon.trim() !== "" && Math.abs(latN) <= 90 && Math.abs(lonN) <= 180;

  const send = (take_over = false) =>
    save.mutate(
      { latitude: latN, longitude: lonN, units, label: manual ? "" : label, take_over },
      {
        onSuccess: () => {
          if (zone && useZone) saveYou.mutate({ name: you.name, timezone: zone, take_over });
          onSaved?.();
        },
      },
    );

  return (
    <div className="flex flex-col gap-4">
      {!manual ? (
        <form onSubmit={search} className="flex flex-col gap-2">
          <label htmlFor="place-q" className="text-[13px] font-bold">
            Your city
          </label>
          <div className="flex gap-2">
            <input
              id="place-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={place.label || "Search a city or town"}
              className={inputClass}
            />
            <Button type="submit" variant="neutral" size="icon" aria-label="Search" disabled={searching}>
              <Search aria-hidden strokeWidth={2} className="size-[18px]" />
            </Button>
          </div>
          {searchError ? (
            <p className="text-[13px] font-semibold text-due-soft">{searchError}</p>
          ) : null}
          {results ? (
            results.length === 0 ? (
              <p className="text-[13px] font-semibold text-fg-muted">Nothing found — try a nearby city.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {results.map((r) => (
                  <li key={`${r.latitude},${r.longitude}`}>
                    <button
                      type="button"
                      onClick={() => pick(r)}
                      className="pressable flex min-h-11 w-full items-center rounded-row bg-surface-2 px-4 text-left text-[14px] font-semibold hover:bg-surface"
                    >
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {label && valid ? (
            <p className="text-[13px] font-semibold text-fg-muted">
              <span className="text-fg">{label}</span>{" "}
              <span className="tnum">
                · {latN.toFixed(2)}, {lonN.toFixed(2)}
              </span>
            </p>
          ) : null}
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Latitude" htmlFor="place-lat">
            <input id="place-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} className={inputClass} />
          </FieldRow>
          <FieldRow label="Longitude" htmlFor="place-lon">
            <input id="place-lon" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} className={inputClass} />
          </FieldRow>
        </div>
      )}
      <button
        type="button"
        onClick={() => setManual((m) => !m)}
        className="self-start text-[13px] font-bold text-accent"
      >
        {manual ? "Search for a city instead" : "Enter coordinates instead"}
      </button>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-bold">Temperatures in</legend>
        <div className="flex gap-2">
          {(["fahrenheit", "celsius"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={units === u}
              onClick={() => setUnits(u)}
              className={cn(
                "pressable h-11 rounded-full px-5 text-[14px] font-bold",
                units === u ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted",
              )}
            >
              {u === "fahrenheit" ? "°F" : "°C"}
            </button>
          ))}
        </div>
      </fieldset>

      {zone ? (
        <label className="flex items-center gap-3 text-[13px] font-semibold">
          <input
            type="checkbox"
            checked={useZone}
            onChange={(e) => setUseZone(e.target.checked)}
            className="size-5 accent-[var(--accent)]"
          />
          Also use {zone} as your time zone
        </label>
      ) : null}

      <SaveError error={save.error ?? saveYou.error} onTakeOver={() => send(true)} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="solid" disabled={save.isPending || !valid} onClick={() => send()}>
          {save.isPending ? "Saving…" : submitLabel}
        </Button>
        {onSkip ? (
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        ) : null}
        <Saved show={save.isSuccess && !onSaved} />
      </div>
    </div>
  );
}
