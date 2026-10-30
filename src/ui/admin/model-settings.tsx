"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { type AdminSettings, type DeepSeekModel } from "@/application/admin/settings";
import { Button } from "@/ui/components/ui/button";
import type { AdminApi } from "./deck-management";

export function ModelSettings({
  api,
  onError,
}: {
  readonly api: AdminApi;
  readonly onError: (error: unknown) => void;
}) {
  const [model, setModel] = useState<DeepSeekModel>("deepseek-flash");
  const [savedModel, setSavedModel] = useState<DeepSeekModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void api<AdminSettings>("/api/admin/settings", { signal: controller.signal })
      .then((settings) => {
        if (controller.signal.aborted) return;
        setModel(settings.model);
        setSavedModel(settings.model);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) onError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, onError]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (loading || saving || savedModel === null) return;
    setSaving(true);
    setSaved(false);
    try {
      const settings = await api<AdminSettings>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      setSavedModel(settings.model);
      setSaved(true);
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="max-w-xl space-y-5">
      <div className="flex items-center gap-3">
        <Image src="/deepseek.svg" alt="DeepSeek" width={54} height={40} unoptimized />
        <h2 className="font-display text-h3">DeepSeek</h2>
      </div>
      <p className="text-body-sm text-fg-muted">
        Configuración global para todos los mazos. Se aplica a las nuevas generaciones y reemplazos.
        Los trabajos ya encolados o en curso conservan su modelo.
      </p>
      <fieldset disabled={loading || saving || savedModel === null} className="space-y-3">
        <legend className="mb-2 font-semibold">Modelo</legend>
        {(
          [
            ["deepseek-flash", "Flash"],
            ["deepseek-v4-pro", "Pro"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-surface-2 p-3"
          >
            <input
              type="radio"
              name="deepseek-model"
              value={value}
              checked={model === value}
              onChange={() => {
                setModel(value);
                setSaved(false);
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <Button
        type="submit"
        disabled={loading || saving || savedModel === null || model === savedModel}
      >
        {saving ? "Guardando…" : "Guardar configuración"}
      </Button>
      <p role="status" className="text-body-sm text-fg-muted">
        {loading ? "Cargando configuración…" : saved ? "Configuración guardada." : ""}
      </p>
    </form>
  );
}
