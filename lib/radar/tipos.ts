import type { Classificacao } from "./contrato";
export interface RadarConfig { enabled: boolean; auto_pause: boolean; notify_sexta: boolean }
export interface RadarItem {
  id: string; conversation_id: string; message_id: string; category: Classificacao["categoria"];
  confidence: string; excerpt: string; contact_name: string; created_at: string;
  pause_status: string; notify_status: string; error_code: string | null;
}
export interface RadarData { config: RadarConfig; canManage: boolean; items: RadarItem[] }
