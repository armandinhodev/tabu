"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/ui/components/ui/button";
import { cn } from "@/ui/lib/cn";

interface AdminConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly targetName?: string;
  readonly targetLabel?: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
  readonly intent?: "archive" | "delete";
}

/** Admin-only confirmation surface; Base UI owns modal and keyboard behavior. */
export function AdminConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  targetName,
  targetLabel,
  cancelLabel = "Cancelar",
  onConfirm,
  disabled = false,
  intent = "delete",
}: AdminConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const irreversible = intent === "delete";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-canvas/80 backdrop-blur-sm transition-opacity duration-[var(--dur-base)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          initialFocus={cancelRef}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2.5rem)] w-[calc(100%-2.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line-strong bg-surface-2 shadow-float transition-[opacity,scale] duration-[var(--dur-base)] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none"
        >
          <div className="min-h-0 overflow-y-auto p-6 sm:p-8">
            <Dialog.Title className="pr-8 font-display text-h2 font-bold break-words text-fg">
              {title}
            </Dialog.Title>
            {targetName && (
              <div className="mt-6 min-w-0 border-l-2 border-line-control pl-4">
                {targetLabel && (
                  <p className="text-caption font-medium text-fg-muted">{targetLabel}</p>
                )}
                <p className="mt-1 text-body font-semibold break-words text-fg">{targetName}</p>
              </div>
            )}
            <Dialog.Description className="mt-5 text-body-sm leading-relaxed break-words text-fg-muted">
              {description}
            </Dialog.Description>
          </div>

          <div className="flex shrink-0 flex-col gap-3 border-t border-line px-6 py-5 sm:flex-row sm:justify-end sm:px-8">
            <Dialog.Close
              render={<Button ref={cancelRef} variant="ghost" className="w-full sm:w-auto" />}
            >
              {cancelLabel}
            </Dialog.Close>
            <Button
              variant={irreversible ? "danger" : "primary"}
              className={cn(
                "w-full sm:w-auto",
                irreversible ? "text-canvas enabled:hover:opacity-90" : "",
              )}
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
          <Dialog.Close
            aria-label="Cerrar confirmación"
            render={
              <Button
                variant="quiet"
                size="icon"
                className="absolute top-3 right-3 enabled:hover:bg-raised-hover enabled:hover:text-fg"
              />
            }
          >
            <X aria-hidden="true" className="size-5" />
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
