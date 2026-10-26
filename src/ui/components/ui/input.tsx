"use client";

import { Input as BaseInput } from "@base-ui/react/input";
import * as React from "react";

import { cn } from "@/ui/lib/cn";

export type InputProps = React.ComponentPropsWithoutRef<typeof BaseInput>;

/**
 * Input de Base UI con los tokens del proyecto (§13). El foco lo dibuja
 * `:focus-visible` global; nunca se apaga.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <BaseInput
      ref={ref}
      className={cn(
        "min-h-13 w-full rounded-md border border-line bg-surface px-4 text-body text-fg",
        "placeholder:text-fg-subtle transition-colors duration-[var(--dur-instant)]",
        "hover:border-line-strong focus-visible:border-warning",
        "aria-[invalid=true]:border-warning",
        className,
      )}
      {...props}
    />
  );
});
