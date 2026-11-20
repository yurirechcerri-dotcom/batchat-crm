"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { TIPOS_MIDIA_FLUXO, validarMidiaUpload } from "@/lib/followup/validar-midia-upload";

export function MidiaDoPasso({ flowId, value, onChange }: {
  flowId?: string; value: string; onChange: (value: string) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const request = useRef<AbortController | null>(null);
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  useEffect(() => () => request.current?.abort(), []);

  async function upload(file: File) {
    const invalid = validarMidiaUpload(file.type, file.size);
    if (invalid) { setError(t(invalid)); return; }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(null);
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch(`/api/v1/ai/followup-flows/${flowId}/media`, {
        method: "POST", body: form, signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || typeof result.data?.media_url !== "string") {
        throw new Error(result.error?.message ?? t("Não foi possível subir o arquivo."));
      }
      if (!controller.signal.aborted) { change.current(result.data.media_url); setName(file.name); }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : t("Falha no upload."));
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <div className="space-y-2 rounded-md border border-border p-3">
    <Label htmlFor="action-media-file">{t("Áudio, foto ou vídeo — até 15 MB")}</Label>
    <Input id="action-media-file" type="file" accept={Object.keys(TIPOS_MIDIA_FLUXO).join(",")}
      disabled={!flowId || busy} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) void upload(file);
      }} />
    {busy && <p role="status" className="text-sm">{t("Enviando arquivo…")}</p>}
    {value && <div className="flex items-center justify-between gap-2">
      <p className="min-w-0 truncate text-sm">{name || t("Mídia anexada ao passo")}</p>
      <Button type="button" variant="ghost" size="sm" disabled={busy}
        onClick={() => { onChange(""); setName(""); }}>{t("Remover")}</Button>
    </div>}
    {error && <p role="alert" className="text-sm text-error-fg">{error}</p>}
    <p className="text-xs text-text-muted">{t("O arquivo fica neste passo. Salve o rascunho e publique quando estiver pronto; subir o arquivo não envia mensagens.")}</p>
    <details><summary className="cursor-pointer text-xs">{t("Usar um link de mídia")}</summary>
      <Input id="action-media-url" aria-label={t("Link da mídia")} type="url" value={value}
        maxLength={2000} disabled={busy} placeholder="https://…"
        onChange={(e) => { onChange(e.target.value); setName(""); }} />
    </details>
  </div>;
}
