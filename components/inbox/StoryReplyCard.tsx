"use client";

import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * "Respondeu ao seu story" — como o Instagram mostra: o rótulo acima e a
 * miniatura do story com a barra lateral. A imagem vem de um link assinado da
 * Meta que expira; quando não carrega, fica só o rótulo.
 */
export function lerRespostaDeStory(metadata: unknown): { storyUrl: string | null } | null {
  const bruto = (metadata as Record<string, unknown> | null)?.story_reply;
  if (!bruto || typeof bruto !== "object") return null;
  const url = (bruto as Record<string, unknown>).story_url;
  return { storyUrl: typeof url === "string" && /^https:\/\//.test(url) ? url : null };
}

export function StoryReplyCard({ storyUrl, className }: { storyUrl: string | null; className?: string }) {
  const t = useT();
  const [quebrou, setQuebrou] = useState(false);
  return (
    <div className={cn("mb-0.5", className)}>
      <p className="mb-1.5 text-[11px] text-muted-foreground">{t("Respondeu ao seu story")}</p>
      {storyUrl && !quebrou && (
        <div className="flex gap-2">
          <span aria-hidden className="w-0.5 shrink-0 rounded-full bg-muted-foreground/40" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={storyUrl}
            alt={t("Story respondido")}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setQuebrou(true)}
            className="h-40 w-auto max-w-[7.5rem] rounded-xl object-cover"
          />
        </div>
      )}
    </div>
  );
}
