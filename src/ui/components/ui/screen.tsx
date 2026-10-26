import { cn } from "@/ui/lib/cn";

/**
 * Marco de pantalla (§5, §10): padding 20px en mobile y 32px desde 768px,
 * ancho máximo legible y espacio para el CTA sticky al pie.
 */
export function Screen({
  children,
  className,
  narrow = true,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly narrow?: boolean;
}) {
  return (
    <main
      className={cn(
        "mx-auto flex min-h-dvh w-full flex-col gap-6 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pt-8",
        narrow ? "max-w-[430px] md:max-w-[720px]" : "max-w-[1440px]",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          {eyebrow !== undefined ? (
            <span className="text-caption uppercase text-fg-subtle">{eyebrow}</span>
          ) : null}
          <h1 className="font-display text-h1 font-bold text-fg">{title}</h1>
        </div>
        {action}
      </div>
      {subtitle !== undefined ? <p className="text-body-sm text-fg-muted">{subtitle}</p> : null}
    </header>
  );
}

/** CTA fija al pie en mobile, con safe area (§10). */
export function StickyFooter({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 bg-canvas/95 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:-mx-8 md:px-8">
      {children}
    </div>
  );
}
