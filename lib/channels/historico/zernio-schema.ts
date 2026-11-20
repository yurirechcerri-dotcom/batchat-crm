import { z } from "zod";

const id = z.string().min(1).max(8192);
const data = z.iso.datetime({ offset: true });
const plataforma = z.enum(["whatsapp", "instagram", "facebook"]);
const pagination = z.object({ hasMore: z.boolean(), nextCursor: id.nullish() });

export const conversaZernioSchema = z.object({
  id,
  accountId: id,
  platform: plataforma,
  participantId: id,
  participantName: z.string().nullable().optional(),
  participantPicture: z.string().nullable().optional(),
  businessScopedUserId: id.optional(),
  updatedTime: data,
  contentNotRetained: z.boolean().optional(),
  isGroup: z.boolean().optional(),
});

export const mensagemZernioSchema = z.object({
  id,
  conversationId: id,
  accountId: id,
  platform: plataforma,
  senderId: id,
  direction: z.enum(["incoming", "outgoing"]),
  createdAt: data,
  message: z.string().max(1_000_000).nullable(),
  contentNotRetained: z.boolean().optional(),
  noRenderableContent: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  attachments: z.array(z.object({
    id: id.optional(),
    type: z.enum(["image", "video", "audio", "file", "sticker", "share", "template", "unsupported_type"]),
    url: z.string().nullable().optional(),
    refreshUrl: z.string().nullable().optional(),
    mimeType: z.string().optional(),
    filename: z.string().nullable().optional(),
  })).max(100),
});

export const paginaConversasZernioSchema = z.object({
  data: z.array(conversaZernioSchema).max(100),
  pagination,
  meta: z.object({
    accountsQueried: z.number().int().nonnegative(),
    accountsFailed: z.number().int().nonnegative(),
    failedAccounts: z.array(z.unknown()).optional(),
    accountsSkipped: z.array(z.unknown()).optional(),
  }),
});

export const paginaMensagensZernioSchema = z.object({
  messages: z.array(mensagemZernioSchema).max(100),
  pagination,
  sortOrderApplied: z.enum(["asc", "desc"]).optional(),
});

export type ConversaZernio = z.infer<typeof conversaZernioSchema>;
export type MensagemZernio = z.infer<typeof mensagemZernioSchema>;
