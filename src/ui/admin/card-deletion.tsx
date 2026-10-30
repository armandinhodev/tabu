"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/ui/components/ui/button";
import { ConfirmDialog } from "@/ui/components/ui/dialog";

export function CardDeletion({
  word,
  disabled,
  onDelete,
}: {
  word: string;
  disabled: boolean;
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pending = useRef(false);

  async function remove() {
    if (disabled || pending.current) return;
    pending.current = true;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      pending.current = false;
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        className="text-warning hover:text-warning"
        disabled={disabled || deleting}
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Eliminar carta
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Eliminar carta definitivamente"
        description={`Se eliminará definitivamente la carta «${word}». Esta acción no se puede deshacer.`}
        confirmLabel="Confirmar eliminación de carta"
        disabled={disabled || deleting}
        onConfirm={() => void remove()}
      />
    </>
  );
}
