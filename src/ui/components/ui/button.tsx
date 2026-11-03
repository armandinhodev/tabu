"use client";

import { type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/ui/lib/cn";
import { buttonVariants } from "./button-variants";

export { buttonVariants };

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

/** Botón del sistema (§6): 52px de alto, radio md, foco visible, press 0.98. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
});
