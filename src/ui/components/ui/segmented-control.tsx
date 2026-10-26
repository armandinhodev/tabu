"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

import { cn } from "@/ui/lib/cn";

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface SegmentedControlProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onValueChange: (value: T) => void;
  readonly className?: string;
}

/**
 * Grupo de toggles de Base UI (foco y teclado resueltos por la primitiva, §13).
 * Se usa para cantidad de equipos y tiempo por turno.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onValueChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const selected = next[0];

        if (selected !== undefined) {
          onValueChange(selected as T);
        }
      }}
      className={cn(
        "flex w-full gap-1 rounded-md border border-line bg-surface p-1",
        className,
      )}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className={cn(
            "min-h-11 flex-1 rounded-sm px-3 font-sans text-body-sm font-medium text-fg-muted",
            "transition-colors duration-[var(--dur-instant)] hover:bg-surface-2",
            "data-[pressed]:bg-accent-soft data-[pressed]:text-accent",
          )}
        >
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
