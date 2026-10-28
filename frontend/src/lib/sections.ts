/* The map from Area to its route, accent, icon and Source, in one place.

   Everything colour-related downstream keys off an `Accent`: the nav tab, the
   card tint, the rings, the chart bars and the focus outline. Adding an Area
   means adding a row here and, for a new colour, a `[data-accent]` block in
   index.css. */

import {
  Book,
  Briefcase,
  CircleCheck,
  Cloud,
  Headphones,
  HeartPulse,
  Sun,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { areaEnabled } from "@/lib/config";
import { SOURCE } from "@/lib/sources";

/** A palette name, or `custom-<id>` for a Custom module's hex colour. */
export type Accent = string;

export type BuiltInAreaKey = "health" | "school" | "money" | "habits" | "weather" | "listening" | "work";

/** A built-in Area, or a Custom module's (its module id). */
export type AreaKey = string;

export interface Area {
  key: AreaKey;
  to: string;
  label: string;
  accent: Accent;
  icon: LucideIcon;
  /** The Source whose Freshness the Area's header shows. Habits has none —
   *  you are its upstream. */
  source?: string;
  /** False for Areas reached only by tapping their Today Card. */
  nav: boolean;
}

/** Health keeps Sleep's violet; Listening shares School's coral. */
export const AREAS: Record<AreaKey, Area> = {
  health: {
    key: "health",
    to: "/health",
    label: "Health",
    accent: "sleep",
    icon: HeartPulse,
    source: SOURCE.sleep,
    nav: true,
  },
  school: {
    key: "school",
    to: "/school",
    label: "School",
    accent: "due",
    icon: Book,
    source: SOURCE.school,
    nav: true,
  },
  money: {
    key: "money",
    to: "/money",
    label: "Money",
    accent: "money",
    icon: Wallet,
    source: SOURCE.finance,
    nav: true,
  },
  habits: {
    key: "habits",
    to: "/habits",
    label: "Habits",
    accent: "habits",
    icon: CircleCheck,
    nav: true,
  },
  weather: {
    key: "weather",
    to: "/weather",
    label: "Weather",
    accent: "weather",
    icon: Cloud,
    source: SOURCE.weather,
    nav: false,
  },
  listening: {
    key: "listening",
    to: "/listening",
    label: "Listening",
    accent: "due",
    icon: Headphones,
    source: SOURCE.listening,
    nav: false,
  },
  /* Like Habits, you are its upstream: no Source, no Freshness. */
  work: {
    key: "work",
    to: "/work",
    label: "Work",
    accent: "work",
    icon: Briefcase,
    nav: false,
  },
};

export interface NavSection {
  to: string;
  label: string;
  accent: Accent;
  icon: LucideIcon;
  end?: boolean;
}

/** The Areas whose module is on in atlas.yaml, in `AREAS` order. */
export function enabledAreas(): Area[] {
  return Object.values(AREAS).filter((a) => areaEnabled(a.key));
}

/** Today borrows the violet: it is the brand colour as well as Health's. */
export function navSections(): NavSection[] {
  return [
    { to: "/", label: "Today", accent: "sleep", icon: Sun, end: true },
    ...enabledAreas()
      .filter((a) => a.nav)
      .map(({ to, label, accent, icon }) => ({ to, label, accent, icon })),
  ];
}

/** Kept for the Cards that predate `AREAS`. */
export const WEATHER_ICON = AREAS.weather.icon;
export const LISTENING_ICON = AREAS.listening.icon;

/** Habit rows cycle through the palette so a list of five reads as five
 *  different things at a glance, without anyone choosing colours by hand. */
export const HABIT_ACCENT_CYCLE: string[] = ["weather", "due", "money", "sleep", "habits"];

export function habitAccent(index: number): string {
  return HABIT_ACCENT_CYCLE[index % HABIT_ACCENT_CYCLE.length];
}
