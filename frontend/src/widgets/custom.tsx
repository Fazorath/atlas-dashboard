/* Widgets from Custom modules (config/custom/*.yaml). Atlas pulls the value;
   the Widget only draws it, inside the same frame as every other Widget. */

import { useQuery } from "@tanstack/react-query";

import { ApiError, getCustomList, getCustomStat } from "@/lib/api";
import type { CustomWidget } from "@/lib/custom-modules";
import { formatStat, rowValue, statusDot, visibleRows } from "@/lib/custom-modules";
import { customWidgets, onCustomChange } from "@/lib/custom";
import { cn } from "@/lib/utils";
import { R, WidgetCard } from "@/widgets/frame";
import type { Size, WidgetDef, WidgetProps } from "@/widgets/types";

function Stat({ def, size }: { def: CustomWidget; size: Size }) {
  const stat = useQuery({
    queryKey: ["custom", def.module, def.widget],
    queryFn: () => getCustomStat(def.module, def.widget),
    refetchInterval: 60_000,
    retry: false,
  });
  // 409: the module's secret isn't set (or was dropped); the Owner enters it on Status.
  const needsSecret = stat.error instanceof ApiError && stat.error.status === 409;
  const unit = typeof def.display.unit === "string" ? def.display.unit : stat.data?.unit;

  return (
    <WidgetCard
      title={def.title}
      area={def.area}
      state={
        stat.isPending ? "loading" : needsSecret ? "setup" : stat.isError && !stat.data ? "error" : "ready"
      }
      setup={stat.error?.message}
      problem={{ chip: "Problem", text: stat.error?.message ?? `${def.title} couldn't be read.` }}
    >
      <p className="flex items-baseline gap-1.5">
        <span className={size === "S" ? R.m : R.l}>{formatStat(stat.data?.value, def.display)}</span>
        {unit ? <span className="text-[14px] font-medium text-fg-muted">{unit}</span> : null}
      </p>
    </WidgetCard>
  );
}

function List({ def, size }: { def: CustomWidget; size: Size }) {
  const list = useQuery({
    queryKey: ["custom", def.module, def.widget],
    queryFn: () => getCustomList(def.module, def.widget),
    refetchInterval: 60_000,
    retry: false,
  });
  const needsSecret = list.error instanceof ApiError && list.error.status === 409;
  const { shown, more } = visibleRows(size, list.data?.rows ?? []);
  const anyStatus = shown.some((row) => statusDot(row.status));

  return (
    <WidgetCard
      title={def.title}
      area={def.area}
      state={
        list.isPending ? "loading" : needsSecret ? "setup" : list.isError ? "error" : "ready"
      }
      setup={list.error?.message}
      problem={{ chip: "Problem", text: list.error?.message ?? `${def.title} couldn't be read.` }}
      empty={list.data && list.data.rows.length === 0 ? { title: "Nothing to show", text: `${def.title} has no rows right now.` } : null}
      aside={more > 0 ? `+${more} more` : undefined}
      bodyClassName="justify-start"
    >
      <ul className="flex min-h-0 flex-col gap-2">
        {shown.map((row, i) => {
          const dot = statusDot(row.status);
          return (
            <li key={i} className="flex min-w-0 items-center gap-2.5">
              {anyStatus ? <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot ?? "bg-transparent")} /> : null}
              {row.status ? <span className="sr-only">{row.status}</span> : null}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px] leading-tight font-medium">{row.title}</span>
                {row.detail && size !== "M" ? (
                  <span className="truncate text-[12px] leading-tight text-fg-muted">{row.detail}</span>
                ) : null}
              </span>
              <span className={cn(R.xs, "shrink-0 text-fg-muted")}>{rowValue(row.value)}</span>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

function defOf(w: CustomWidget): WidgetDef {
  return {
    id: w.id,
    title: w.title,
    area: w.area,
    sizes: w.sizes as Size[],
    placement: "anywhere",
    render: ({ size }: WidgetProps) => (w.type === "list" ? <List def={w} size={size} /> : <Stat def={w} size={size} />),
  };
}

/** Rebuilt whenever lib/custom reloads; the registry reads it. */
export function customWidgetDefs(): WidgetDef[] {
  return customWidgets.map(defOf);
}

export { onCustomChange };
