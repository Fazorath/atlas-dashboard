/* The map from "area of the app" to its accent and icon, in one place.

   Everything colour-related downstream keys off an `Accent`: the nav tab, the
   card tint, the rings, the chart bars and the focus outline. Adding an area
   means adding a row here and a `[data-accent]` block in index.css. */

import {
  Book,
  CircleCheck,
  Cloud,
  Headphones,
  Moon,
  Sun,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type Accent = "sleep" | "habits" | "due" | "money" | "weather";

export interface NavSection {
  to: string;
  label: string;
  accent: Accent;
  icon: LucideIcon;
  end?: boolean;
}

/** Today borrows the violet: it is the brand colour as well as Sleep's. */
export const NAV_SECTIONS: NavSection[] = [
  { to: "/", label: "Today", accent: "sleep", icon: Sun, end: true },
  { to: "/sleep", label: "Sleep", accent: "sleep", icon: Moon },
  { to: "/school", label: "School", accent: "due", icon: Book },
  { to: "/money", label: "Money", accent: "money", icon: Wallet },
  { to: "/habits", label: "Habits", accent: "habits", icon: CircleCheck },
];

/** Widgets that are not nav destinations still need an icon. */
export const WEATHER_ICON = Cloud;
export const LISTENING_ICON = Headphones;

/** Habit rows cycle through the palette so a list of five reads as five
 *  different things at a glance, without anyone choosing colours by hand. */
export const HABIT_ACCENT_CYCLE: Accent[] = ["weather", "due", "money", "sleep", "habits"];

export function habitAccent(index: number): Accent {
  return HABIT_ACCENT_CYCLE[index % HABIT_ACCENT_CYCLE.length];
}
