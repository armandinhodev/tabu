import { AlertTriangle } from "lucide-react";
import * as React from "react";

import { cn } from "@/ui/lib/cn";

interface FieldProps {
  readonly label: string;
  readonly htmlFor: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly children: React.ReactNode;
  readonly className?: string;
}

/** Etiqueta + control + error, con `aria-describedby` para lectores de pantalla. */
export function Field({ label, htmlFor, error, hint, children, className }: FieldProps) {
  const descriptionId = error !== undefined ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={htmlFor} className="text-caption uppercase text-fg-muted">
        {label}
      </label>
      <div aria-describedby={descriptionId}>{children}</div>
      {error !== undefined ? (
        <p id={descriptionId} role="alert" className="flex items-center gap-1.5 text-body-sm text-warning">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      ) : hint !== undefined ? (
        <p className="text-body-sm text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
