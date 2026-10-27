"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/ui/lib/cn";

/** Botón del sistema (§6): 52px de alto, radio md, foco visible, press 0.98. */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-display font-semibold transition-[background-color,box-shadow,transform,color] duration-[var(--dur-instant)] ease-out select-none disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press",
        ghost: "border border-line bg-transparent text-fg hover:bg-surface-2",
        caution: "border border-warning bg-warning-soft text-warning hover:bg-warning/15",
        danger: "bg-danger text-fg hover:opacity-90",
        quiet: "text-fg-muted hover:text-fg hover:bg-surface-2",
        /**
         * Control sobre panel de contenido: fondo elevado (--bg-raised) con
         * borde de control (--border-control, 3.16:1, el mínimo de §9). Se
         * separa 1.48:1 de --bg-surface, la superficie de los paneles de
         * equipo, para que el botón no se funda con el panel que lo rodea.
         *
         * El color va solo en el ícono: --accent coincide con --team-1 y
         * --success con --team-2, así que una superficie de color en un
         * control de acción se lee como pertenencia a un equipo (§3).
         */
        tinted:
          "border border-line-control bg-raised text-fg shadow-card hover:bg-raised-hover hover:shadow-float disabled:hover:bg-raised disabled:hover:shadow-card",
        /**
         * Acción sobre un equipo concreto: fondo del color del equipo al 18 %
         * y borde del color pleno, el patrón de chip de equipo (§6). El color
         * lo aporta el consumidor vía className, desde teamPalette(color).
         *
         * Sin fondo ni hover propios: quien lo usa compone las clases de
         * color, y así no compiten con las de la variante.
         */
        team: "border text-fg",
      },
      size: {
        md: "min-h-13 px-5 text-body",
        lg: "min-h-14 px-6 text-h3",
        sm: "min-h-11 px-4 text-body-sm",
        icon: "size-11 shrink-0",
      },
      block: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

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
