"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { normalizarVoiceId, problemaNoVoiceId } from "@/lib/ai/voz/voice-id";
import { modeloPadraoDaVoz, type ProvedorDeVoz } from "@/lib/ai/voz/provedor";

interface VozDoCatalogo {
  id: string;
  nome: string;
  idioma: string | null;
}

export function CartaoDeVoz({ podeEditar }: { podeEditar: boolean }) {
  const t = useT();
  const [carregando, setCarregando] = useState(true);
  const [provider, setProvider] = useState<ProvedorDeVoz>("elevenlabs");
  const [providerSalvo, setProviderSalvo] = useState<ProvedorDeVoz>("elevenlabs");
  const [modelId, setModelId] = useState<string | null>(null);
  const cargaAtual = useRef({ pedido: 0 });
  const [voiceId, setVoiceId] = useState("");
  const [catalogo, setCatalogo] = useState<VozDoCatalogo[]>([]);
  const [catalogoVeioDoProvedor, setCatalogoVeioDoProvedor] = useState(false);
  const [temCredencial, setTemCredencial] = useState(false);
  const [falhaDeLeitura, setFalhaDeLeitura] = useState(false);
  const [erroDeFormato, setErroDeFormato] = useState<string | null>(null);
  const [erroDoProvedor, setErroDoProvedor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const carregar = useCallback((escolhido?: ProvedorDeVoz) => {
    const pedido = ++cargaAtual.current.pedido;
    return apiClient.get<{
        data: {
          provider?: ProvedorDeVoz;
          providerSalvo?: ProvedorDeVoz;
          modelId?: string | null;
          voiceId: string | null;
          vozesDisponiveis?: string[];
          catalogo?: VozDoCatalogo[];
          catalogoVeioDoProvedor?: boolean;
          temCredencial: boolean;
        };
      }>(escolhido ? `/api/v1/ai/voz?provider=${escolhido}` : "/api/v1/ai/voz").then((res) => {
      if (pedido !== cargaAtual.current.pedido) return;
      setFalhaDeLeitura(false);
      setProvider(res.data.provider ?? "elevenlabs");
      setProviderSalvo(res.data.providerSalvo ?? res.data.provider ?? "elevenlabs");
      setModelId(res.data.modelId ?? null);
      setVoiceId(res.data.voiceId ?? "");
      // Resposta incompleta não derruba o painel inteiro: sem catálogo, cai na
      // lista de ids que já era a da tela; sem nenhuma das duas, fica só o campo.
      const doCatalogo = res.data.catalogo ?? [];
      setCatalogo(
        doCatalogo.length > 0
          ? doCatalogo
          : (res.data.vozesDisponiveis ?? []).map((id) => ({ id, nome: id, idioma: null })),
      );
      setCatalogoVeioDoProvedor(res.data.catalogoVeioDoProvedor === true);
      setTemCredencial(res.data.temCredencial === true);
    }).catch((err: unknown) => {
      if (pedido === cargaAtual.current.pedido) { setFalhaDeLeitura(true); showApiError(err); }
    }).finally(() => {
      if (pedido === cargaAtual.current.pedido) setCarregando(false);
    });
  }, []);

  useEffect(() => {
    const controle = cargaAtual.current;
    void carregar();
    return () => { controle.pedido++; };
  }, [carregar]);

  /** Valida o FORMATO antes de gastar requisição/síntese. Não consulta lista. */
  function idParaUsar(): string | null {
    if (provider === "fish" && !/^[a-f0-9]{32}$/i.test(voiceId.trim())) {
      setErroDeFormato(t("O Voice ID do Fish Audio deve ter 32 caracteres hexadecimais."));
      return null;
    }
    const problema = problemaNoVoiceId(voiceId);
    if (problema === null) {
      setErroDeFormato(null);
      return normalizarVoiceId(voiceId);
    }
    setErroDeFormato(
      problema === "vazio"
        ? t("Informe um Voice ID.")
        : t("Voice ID inválido: use só letras, números, hífen e sublinhado (8 a 64 caracteres)."),
    );
    return null;
  }

  async function salvar() {
    const id = idParaUsar();
    if (id === null) return;
    setErroDoProvedor(null);
    setSalvando(true);
    try {
      const res = await apiClient.patch<{ data: { voiceId: string } }>("/api/v1/ai/voz", {
        provider,
        voice_id: id,
        model_id: modelId,
      });
      setProviderSalvo(provider);
      setVoiceId(res.data.voiceId);
      toast.success(`${t("Voz salva:")} ${res.data.voiceId}`);
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  async function ouvirPrevia() {
    const id = idParaUsar();
    if (id === null) return;
    setErroDoProvedor(null);
    setOuvindo(true);
    try {
      const res = await apiClient.post<{ data: { audioBase64: string; mimeType: string } }>(
        "/api/v1/ai/voz/preview",
        { provider, voice_id: id, model_id: modelId ?? modeloPadraoDaVoz(provider) },
      );
      if (audioRef.current) {
        audioRef.current.src = `data:${res.data.mimeType};base64,${res.data.audioBase64}`;
        await audioRef.current.play();
      }
    } catch (err) {
      // A recusa do provedor sobre a voz aparece AQUI, com o texto dele: é o
      // que diferencia "id errado" de "provedor fora do ar" para quem colou
      // um id que a lista não conhece.
      const detalhes = err instanceof ApiError ? err.details : undefined;
      const doProvedor = detalhes?.erroDoProvedor;
      if (typeof doProvedor === "string" && doProvedor.trim() !== "") setErroDoProvedor(doProvedor);
      showApiError(err);
    } finally {
      setOuvindo(false);
    }
  }

  if (carregando) return null;
  if (falhaDeLeitura) return <Card className="mb-6 space-y-3 p-4" role="alert">
    <p>{t("Não consegui ler a configuração de voz. Tente de novo antes de alterar.")}</p>
    <Button variant="outline" onClick={() => { setCarregando(true); void carregar(); }}>{t("Tentar de novo")}</Button>
  </Card>;

  const nomeDoProvedor = provider === "fish" ? "Fish Audio" : "ElevenLabs";

  const naLista = catalogo.some((v) => v.id === voiceId);

  return (
    <Card className="mb-6 space-y-3 p-4" data-testid="cartao-de-voz">
      <h2 className="text-base font-semibold">{t("Voz do agente")}</h2>
      <p className="text-sm text-muted-foreground">
        {t(
          "Qual voz sai quando um agente responde em áudio — ligado por versão, no editor do agente. Precisa de uma credencial validada do provedor de voz escolhido.",
        )}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="voz-provider">{t("Provedor de voz")}</Label>
        <Select
          value={provider}
          disabled={!podeEditar || salvando || ouvindo}
          onValueChange={(valor) => {
            const proximo = valor as ProvedorDeVoz;
            setCarregando(true);
            setProvider(proximo);
            setVoiceId("");
            setModelId(null);
            setCatalogo([]);
            setTemCredencial(false);
            setErroDeFormato(null);
            setErroDoProvedor(null);
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.removeAttribute("src");
            }
            void carregar(proximo);
          }}
        >
          <SelectTrigger id="voz-provider" data-testid="voz-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
            <SelectItem value="fish">Fish Audio</SelectItem>
          </SelectContent>
        </Select>
        {provider !== providerSalvo && (
          <p className="text-xs text-amber-600" role="status">
            {t(
              "Trocar o provedor afeta todos os agentes que usam voz. Revise também as vozes próprias de cada agente antes de salvar.",
            )}
          </p>
        )}
        {provider === "fish" && (
          <p className="text-xs text-muted-foreground">
            {t("Modelo de voz:")} s2.1-pro.{" "}
            {t(
              "A síntese usa a chave Fish Audio e entra no orçamento de IA. Esta escolha não altera o modelo de conversa.",
            )}
          </p>
        )}
      </div>
      {!temCredencial && (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          {t("Sem credencial validada para")} {nomeDoProvedor}.{" "}
          <Link className="underline underline-offset-4" href="/app/ai/credentials">
            {t("Cadastrar em Credenciais")}
          </Link>
        </p>
      )}

      {temCredencial && !catalogoVeioDoProvedor && (
        <p className="text-xs text-muted-foreground" data-testid="voz-catalogo-antigo">
          {t(
            "A lista de vozes não está disponível agora. Você ainda pode colar o Voice ID e ouvir a prévia para conferir o acesso.",
          )}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 space-y-1.5">
          <Label className="text-xs" htmlFor="voz-voice-id">
            {t("Voice ID")}
          </Label>
          {catalogo.length > 0 && (
            <Select
              value={naLista ? voiceId : ""}
              onValueChange={(id) => {
                setVoiceId(id);
                setErroDeFormato(null);
              }}
              disabled={!podeEditar || carregando || salvando || ouvindo}
            >
              <SelectTrigger
                data-testid="voz-escolher-da-lista"
                aria-label={t("Escolher da lista")}
              >
                <SelectValue placeholder={t("escolha da lista")} />
              </SelectTrigger>
              <SelectContent>
                {catalogo.map((voz) => (
                  <SelectItem key={voz.id} value={voz.id}>
                    {voz.nome === voz.id
                      ? voz.id
                      : `${voz.nome}${voz.idioma ? ` — ${voz.idioma}` : ""}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input
            id="voz-voice-id"
            value={voiceId}
            onChange={(e) => {
              setVoiceId(e.target.value);
              setErroDeFormato(null);
            }}
            placeholder={
              provider === "fish" ? "ID da voz Fish (32 caracteres)" : "ex.: 21m00Tcm4TlvDq8ikWAM"
            }
            data-testid="voz-voice-id"
            disabled={!podeEditar || carregando || salvando || ouvindo}
            aria-invalid={erroDeFormato !== null}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "Escolha da lista ou cole o ID de qualquer voz da sua conta, inclusive uma que não apareça aqui.",
            )}
          </p>
          {erroDeFormato !== null && (
            <p className="text-xs text-destructive" role="alert" data-testid="voz-erro-de-formato">
              {erroDeFormato}
            </p>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          disabled={carregando || salvando || ouvindo || voiceId.trim() === ""}
          onClick={() => void ouvirPrevia()}
          data-testid="voz-ouvir-previa"
        >
          {ouvindo ? t("Gerando…") : t("Ouvir prévia")}
        </Button>

        {podeEditar && (
          <Button
            size="sm"
            disabled={carregando || salvando || ouvindo || voiceId.trim() === ""}
            onClick={() => void salvar()}
            data-testid="voz-salvar"
          >
            {salvando ? t("Salvando…") : t("Salvar voz")}
          </Button>
        )}
      </div>

      {erroDoProvedor !== null && (
        <p className="text-xs text-destructive" role="alert" data-testid="voz-erro-do-provedor">
          {t("O provedor recusou esta voz:")} {erroDoProvedor}
        </p>
      )}

      <audio ref={audioRef} data-testid="voz-audio-previa" />
    </Card>
  );
}
