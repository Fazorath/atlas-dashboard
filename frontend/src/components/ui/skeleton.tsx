import { cn } from "@/lib/utils";

/** Stands in for a number that has no source yet. Fully rounded and drawn in
 *  the area's track colour, so an unconfigured card still looks like itself. */
export function Skeleton({
  width = 48,
  height = 10,
  pulse = false,
  className,
}: {
  width?: number | string;
  height?: number;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      style={{ width, height }}
      className={cn("rounded-full bg-accent-track", pulse && "skeleton-pulse", className)}
    />
  );
}
