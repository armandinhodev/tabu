"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/ui/lib/cn";

/**
 * Chips de palabras prohibidas (§6.1): informativa 36px sin badge, reportable
 * 44px con badge "!" visible en reposo. También se usa para palabra reportada.
 */
export const chipVariants = cva(
  "inline-flex items-center gap-2 rounded-pill border font-sans leading-none",
  {
    variants: {
      tone: {
        informative: "h-9 border-danger bg-danger-soft px-4 text-body-sm text-fg",
        reportable:
          "h-11 border-danger bg-danger-soft px-4 pr-3 text-body-sm text-fg transition-[background-color,transform] duration-[var(--dur-instant)] hover:bg-danger/26 active:scale-[0.97] active:bg-danger/40",
        reported: "h-11 border-danger bg-danger px-4 text-body-sm font-semibold text-fg",
        neutral: "h-9 border-line bg-surface-2 px-4 text-body-sm text-fg-muted",
      },
    },
    defaultVariants: { tone: "informative" },
  },
);

export interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof chipVariants> {
  readonly badge?: boolean;
}

export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { className, tone, badge = false, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(chipVariants({ tone }), className)}
      {...props}
    >
      <span>{children}</span>
      {badge ? (
        <span
          aria-hidden="true"
          className="grid size-[18px] shrink-0 place-items-center rounded-pill bg-danger text-micro font-bold leading-none text-fg"
        >
          !
        </span>
      ) : null}
    </button>
  );
});
