"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { waitConfigSchema } from "@/lib/followup/graph-schema";
import { MODOS_DE_ESPERA, opcoes } from "@/lib/followup/vocabulario";
import type { HorarioDaEspera } from "@/lib/followup/espera-no-horario";
import { useT } from "@/hooks/i18n/useT";

import { HorarioDaEsperaEditor } from "./HorarioDaEsperaEditor";
import { msToMin, minToMs, type ConfigOf } from "./shared";

export function WaitForm({
  config,
  onChange,
}: {
  config: ConfigOf<"wait">;
  onChange: (c: ConfigOf<"wait">) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<"fixed" | "smart">(config.mode);
  const [durationMs, setDurationMs] = useState(
    config.mode === "fixed" ? config.duration_ms : 600_000,
  );
  const [durationUnit, setDurationUnit] = useState<"minutes" | "seconds">(
    config.mode === "fixed" && config.duration_ms % 60_000 !== 0 ? "seconds" : "minutes",
  );
  const [minMin, setMinMin] = useState(config.mode === "smart" ? msToMin(config.min_ms) : 5);
  const [maxMin, setMaxMin] = useState(config.mode === "smart" ? msToMin(config.max_ms) : 60);
  const [guidance, setGuidance] = useState(config.mode === "smart" ? (config.guidance ?? "") : "");
  const [horario, setHorario] = useState<HorarioDaEspera | null>(
    config.mode === "fixed" ? (config.ate_o_horario ?? null) : null,
  );
  const [error, setError] = useState<string | null>(null);

  // ⚠️ O QUE ESTE FORMULÁRIO NÃO EDITA, ELE CONSERVA. `commit` remontava a
  // config só com o que a tela mostra, e qualquer campo sem controle aqui
  // sumia no primeiro clique: `immune_to_reply` (a espera imune, que o grafo
  // importado ou montado por modelo traz) virava espera comum ao mudar a
  // duração. Ela não tem controle nesta tela; continua viajando intacta.
  const imune = config.mode === "fixed" && config.immune_to_reply === true;

  const commit = (next: {
    mode: "fixed" | "smart";
    durationMs: number;
    minMin: number;
    maxMin: number;
    guidance: string;
    horario: HorarioDaEspera | null;
  }) => {
    const candidate =
      next.mode === "fixed"
        ? {
            mode: "fixed" as const,
            duration_ms: next.durationMs,
            ...(imune ? { immune_to_reply: true } : {}),
            ...(config.mode === "fixed" && config.preservar_prazo ? { preservar_prazo: true } : {}),
            ...(next.horario ? { ate_o_horario: next.horario } : {}),
          }
        : {
            mode: "smart" as const,
            min_ms: minToMs(next.minMin),
            max_ms: minToMs(next.maxMin),
            ...(next.guidance.trim() ? { guidance: next.guidance } : {}),
          };
    const parsed = waitConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="wait-mode">{t("Como calcular a espera")}</Label>
        <Select
          value={mode}
          onValueChange={(v) => {
            const next = v as "fixed" | "smart";
            setMode(next);
            commit({ mode: next, durationMs, minMin, maxMin, guidance, horario });
          }}
        >
          <SelectTrigger id="wait-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opcoes(MODOS_DE_ESPERA).map(({ valor, rotulo }) => (
              <SelectItem key={valor} value={valor}>
                {t(rotulo)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {mode === "fixed" ? (
        <div className="space-y-2">
          <Label htmlFor="wait-duration-unit">{t("Unidade da duração")}</Label>
          <Select value={durationUnit} onValueChange={(v) => setDurationUnit(v as "minutes" | "seconds")}>
            <SelectTrigger id="wait-duration-unit"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="seconds">{t("Segundos")}</SelectItem>
              <SelectItem value="minutes">{t("Minutos")}</SelectItem>
            </SelectContent>
          </Select>
          <Label htmlFor="wait-duration">{durationUnit === "seconds" ? t("Duração (segundos)") : t("Duração (minutos)")}</Label>
          <Input
            id="wait-duration"
            type="number"
            min={durationUnit === "seconds" ? 1 : 1 / 60}
            step="any"
            value={durationMs / (durationUnit === "seconds" ? 1000 : 60_000)}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value) * (durationUnit === "seconds" ? 1000 : 60_000));
              setDurationMs(v);
              commit({ mode, durationMs: v, minMin, maxMin, guidance, horario });
            }}
          />
          {config.mode === "fixed" && <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={config.preservar_prazo ?? false}
              onChange={(e) => onChange({ ...config, preservar_prazo: e.target.checked })} />
            {t("Manter a duração mesmo quando o contato responder")}
          </label>}
          <HorarioDaEsperaEditor
            value={horario}
            onChange={(h) => {
              setHorario(h);
              commit({ mode, durationMs, minMin, maxMin, guidance, horario: h });
            }}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="wait-min">{t("Mínimo (min)")}</Label>
              <Input
                id="wait-min"
                type="number"
                min={5}
                value={minMin}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMinMin(v);
                  commit({ mode, durationMs, minMin: v, maxMin, guidance, horario });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wait-max">{t("Máximo (min)")}</Label>
              <Input
                id="wait-max"
                type="number"
                min={5}
                value={maxMin}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMaxMin(v);
                  commit({ mode, durationMs, minMin, maxMin: v, guidance, horario });
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wait-guidance">{t("Orientação (opcional)")}</Label>
            <Textarea
              id="wait-guidance"
              maxLength={500}
              value={guidance}
              onChange={(e) => {
                setGuidance(e.target.value);
                commit({ mode, durationMs, minMin, maxMin, guidance: e.target.value, horario });
              }}
            />
          </div>
        </>
      )}
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
