"use client";

import * as React from "react";

import { cn } from "@/ui/lib/cn";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<"textarea">
>(function Textarea({ className, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        "min-h-28 w-full resize-y rounded-md border border-line bg-surface px-4 py-3 text-body text-fg",
        "transition-colors duration-[var(--dur-instant)] placeholder:text-fg-subtle",
        "hover:border-line-strong focus-visible:border-warning aria-[invalid=true]:border-warning",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
