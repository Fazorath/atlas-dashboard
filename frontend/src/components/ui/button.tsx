import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const button = cva(
  "pressable inline-flex items-center justify-center gap-2 rounded-full font-bold " +
    "disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        solid: "bg-accent text-bg",
        soft: "bg-accent-tint text-accent",
        neutral: "bg-surface-2 text-fg",
        ghost: "text-fg-muted",
      },
      size: {
        /** Both clear the 44px minimum target. */
        md: "h-11 px-4 text-[14px]",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
