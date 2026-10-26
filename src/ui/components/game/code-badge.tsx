"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { cn } from "@/ui/lib/cn";

/** Código de sala (§6): mono, 700, tracking amplio, cápsula con copiar. */
export function CodeBadge({ code, className }: { readonly code: string; readonly className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Código copiado");
      setTimeout(() => {
        setCopied(false);
      }, 2_000);
    } catch {
      toast.error("No se pudo copiar el código");
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-5 py-4",
        className,
      )}
    >
      <span className="font-mono text-code font-bold uppercase tracking-[0.2em] text-fg">
        {code}
      </span>
      <button
        type="button"
        onClick={() => {
          void copy();
        }}
        aria-label={copied ? "Código copiado" : "Copiar código de sala"}
        className="grid size-11 shrink-0 place-items-center rounded-sm text-fg-muted transition-colors duration-[var(--dur-instant)] hover:bg-surface-2 hover:text-fg"
      >
        {copied ? (
          <Check aria-hidden="true" className="size-5 text-success" />
        ) : (
          <Copy aria-hidden="true" className="size-5" />
        )}
      </button>
    </div>
  );
}
