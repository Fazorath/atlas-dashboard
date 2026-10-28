/* Custom modules in the running app: `GET /api/custom` is read with the config
   (and again after every Setup save), then each module's Area joins `AREAS`
   and its Widgets join the registry (widgets/registry). Edits to a module file
   show after the next config load, like a changed atlas.yaml. */

import { createElement, lazy, Suspense } from "react";
import { Boxes, type LucideIcon, type LucideProps } from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports";

import { getCustomModules } from "@/lib/api";
import { afterConfigLoad, customAreas } from "@/lib/config";
import { accentCss, buildCustom, type CustomArea, type CustomWidget } from "@/lib/custom-modules";
import { AREAS, type Area } from "@/lib/sections";
import { CUSTOM_LABEL } from "@/lib/sources";

export let customWidgets: CustomWidget[] = [];

const icons = new Map<string, LucideIcon>();

/** A Lucide icon by its kebab-case name, loaded on first use; an unknown name
 *  is the fallback icon, never an error. */
export function iconFor(name: string | null): LucideIcon {
  if (!name || !(name in dynamicIconImports)) return Boxes;
  let icon = icons.get(name);
  if (!icon) {
    const Lazy = lazy(dynamicIconImports[name as keyof typeof dynamicIconImports]);
    icon = ((props: LucideProps) =>
      createElement(Suspense, { fallback: createElement(Boxes, props) }, createElement(Lazy, props))) as unknown as LucideIcon;
    icons.set(name, icon);
  }
  return icon;
}

function areaOf(a: CustomArea): Area {
  return { key: a.key, to: a.to, label: a.label, accent: a.accent, icon: iconFor(a.icon), source: a.source, nav: false };
}

let style: HTMLStyleElement | null = null;

const listeners = new Set<() => void>();
/** Called when the Custom modules changed (the registry rebuilds its Widgets). */
export function onCustomChange(fn: () => void): void {
  listeners.add(fn);
}

export async function loadCustom(): Promise<void> {
  const modules = await getCustomModules();
  const { areas, widgets } = buildCustom(modules);
  for (const key of customAreas) delete AREAS[key];
  customAreas.clear();
  for (const a of areas) {
    AREAS[a.key] = areaOf(a);
    customAreas.add(a.key);
  }
  customWidgets = widgets;

  for (const k of Object.keys(CUSTOM_LABEL)) delete CUSTOM_LABEL[k];
  for (const m of modules) CUSTOM_LABEL[`custom:${m.id}`] = m.name;

  if (!style) {
    style = document.createElement("style");
    document.head.appendChild(style);
  }
  style.textContent = accentCss(areas);
  listeners.forEach((fn) => fn());
}

afterConfigLoad(loadCustom);
