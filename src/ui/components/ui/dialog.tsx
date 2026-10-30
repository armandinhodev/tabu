"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import * as React from "react";

import { Button } from "@/ui/components/ui/button";
import { cn } from "@/ui/lib/cn";

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
  readonly tone?: "caution" | "primary";
}

/**
 * Confirmación de acciones destructivas (§1.7). La semántica de modal, foco y
 * Escape la resuelve Base UI: acá solo se estiliza con tokens.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  onConfirm,
  disabled = false,
  tone = "caution",
}: ConfirmDialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-canvas/80" />
        <BaseDialog.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-line bg-surface-2 p-6 shadow-float",
          )}
        >
          <BaseDialog.Title className="font-display text-h2 font-bold text-fg">
            {title}
          </BaseDialog.Title>
          <BaseDialog.Description className="mt-2 text-body-sm text-fg-muted">
            {description}
          </BaseDialog.Description>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              variant={tone === "caution" ? "caution" : "primary"}
              block
              disabled={disabled}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
            <BaseDialog.Close render={<Button variant="ghost" block />}>
              {cancelLabel}
            </BaseDialog.Close>
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** Diálogo informativo simple (por ejemplo, "cómo se juega"). */
export function InfoDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-canvas/80" />
        <BaseDialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[80dvh] w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-line bg-surface-2 p-6 shadow-float">
          <BaseDialog.Title className="font-display text-h2 font-bold text-fg">
            {title}
          </BaseDialog.Title>
          <div className="mt-4 flex flex-col gap-3 text-body-sm text-fg-muted">{children}</div>
          <BaseDialog.Close render={<Button variant="ghost" block className="mt-6" />}>
            Entendido
          </BaseDialog.Close>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
