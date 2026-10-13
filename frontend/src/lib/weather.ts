/* The weather seam.

   The API serves Celsius because that is what the archive stores; the choice of
   what to read is made here, once, so no component does arithmetic on a
   temperature. `units:` in config/modules/open_meteo.yaml switches the whole app.

   Nothing here talks to Open-Meteo. The card reads Atlas's own archive, so a
   dead upstream costs freshness and not the card — the last good reading stays
   on screen and the failure shows up in the Sources strip instead. */

import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { getWeather } from "@/lib/api";
import { temperatureUnit } from "@/lib/config";

export const WEATHER_KEY = ["weather"] as const;

export function useWeather() {
  const query = useQuery({
    queryKey: WEATHER_KEY,
    queryFn: getWeather,
    // The archive only moves on the hour, but the card should catch up quickly
    // after a manual sync. Five minutes is cheap: it is a local read.
    refetchInterval: 5 * 60_000,
  });

  return {
    isPending: query.isPending,
    isError: query.isError,
    data: query.data,
    now: query.data?.now ?? null,
  };
}

/** "78°" — rounded, no decimal. Null in means null out, so a caller can decide
 *  between a dash and a skeleton rather than being handed "NaN°". */
export function formatTemp(celsius: number | null | undefined): string | null {
  if (celsius == null || Number.isNaN(celsius)) return null;
  const value = temperatureUnit() === "F" ? celsius * (9 / 5) + 32 : celsius;
  return `${Math.round(value)}°`;
}

/** "3 PM" for the hourly strip. */
export function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric" });
}

/* WMO 4677, grouped to the icons lucide actually ships. The ranges are wide on
   purpose: a card at 22px cannot tell "moderate drizzle" from "dense drizzle",
   and the words underneath already carry that. */
export function weatherIcon(code: number | null | undefined, isDay: boolean | null): LucideIcon {
  const day = isDay ?? true;
  if (code == null) return Cloud;
  if (code === 0) return day ? Sun : Moon;
  if (code <= 2) return day ? CloudSun : CloudMoon;
  if (code === 3) return Cloud;
  if (code <= 48) return CloudFog;
  if (code <= 57) return CloudDrizzle;
  if (code <= 67) return CloudRain;
  if (code <= 77) return CloudSnow;
  if (code <= 82) return CloudRain;
  if (code <= 86) return CloudSnow;
  return CloudLightning;
}

/** "7:28 AM" — sunrise and sunset, in local time. */
export function formatClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** WHO's UV index bands. */
export function uvLevel(uv: number | null | undefined): string | null {
  if (uv == null) return null;
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very high";
  return "Extreme";
}

/** The EPA's US AQI bands, in the words its own scale uses. */
export function aqiLevel(aqi: number | null | undefined): string | null {
  if (aqi == null) return null;
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for sensitive groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhealthy";
  return "Hazardous";
}
