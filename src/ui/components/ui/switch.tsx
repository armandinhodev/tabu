"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";

import { cn } from "@/ui/lib/cn";

interface SwitchProps {
  readonly id?: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly label: string;
  readonly className?: string;
}

/** Switch de Base UI para opciones del lobby (§13). */
export function Switch({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  label,
  className,
}: SwitchProps) {
  return (
    <BaseSwitch.Root
      id={id}
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange(next)}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-pill bg-surface-3",
        "transition-colors duration-[var(--dur-base)] data-[checked]:bg-accent",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className,
      )}
    >
      <BaseSwitch.Thumb
        className={cn(
          "block size-5 translate-x-1 rounded-pill bg-fg transition-transform duration-[var(--dur-base)]",
          "data-[checked]:translate-x-6 data-[checked]:bg-on-accent",
        )}
      />
    </BaseSwitch.Root>
  );
}
