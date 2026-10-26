import { cn } from "@/ui/lib/cn";

/** Skeleton plano (§11): superficie quieta, nada de spinners. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none",
        className,
      )}
    />
  );
}
