#!/usr/bin/env python3
"""Converte a captura editorial preservada em documentos explícitos, sem enviar.

Uso: python3 scripts/ler-captura-manychat.py captura.md mapa-midias.json saida.json
O mapa relaciona hash da referência capturada ao hash do binário conferido.
Interrompe diante de conteúdo/controle que não sabe representar.
"""
import json
import re
import sys
from pathlib import Path


def required(pattern, text):
    match = re.search(pattern, text, re.M)
    if not match:
        raise ValueError(f"capture_field_missing:{pattern}")
    return match.group(1)


def read_capture(text, media):
    flows = []
    sections = re.split(r"^## (F\d+) · (.+)$", text, flags=re.M)
    for index in range(1, len(sections), 3):
        code, name, section = sections[index:index + 3]
        if code in ("F01", "F02", "F04"):
            continue  # Exportação e Instagram não são envios WhatsApp.
        root = required(r"Raiz declarada: (\d+)", section)
        blocks = re.split(r"^#### Bloco (\d+) · (\w+)$", section, flags=re.M)
        nodes, edges, entries, links = [], [], {}, []
        for offset in range(1, len(blocks), 3):
            block, kind, body = blocks[offset:offset + 3]
            if block in entries:
                raise ValueError("duplicate_block")
            nxt = required(r"Vínculo data.target: (\d+|não definido na captura)", body)
            next_target = None if nxt == "não definido na captura" else nxt
            local = []

            def add(identifier, content):
                local.append({"id": identifier, "content": content})

            if kind == "smart_delay":
                match = re.search(r"Controle shift_time: unit=(minutes|seconds), value=(\d+)", body)
                if not match:
                    raise ValueError("unsupported_smart_delay")
                seconds = int(match[2]) * (60 if match[1] == "minutes" else 1)
                add(f"b{block}", {"kind": "smartDelay", "seconds": seconds})
            elif kind == "whatsapp":
                parts = re.split(r"^Parte (\d+) · (\w+)$", body, flags=re.M)
                for part_index in range(1, len(parts), 3):
                    number, part_kind, part = parts[part_index:part_index + 3]
                    identifier = f"b{block}p{number}"
                    if part_kind == "delay":
                        seconds = int(required(r"Controle de espera: time=(\d+);", part))
                        add(identifier, {"kind": "messageDelay", "seconds": seconds})
                    elif part_kind in ("text", "question", "attachment"):
                        message, assets = "", []
                        if part_kind == "attachment":
                            reference = required(r"referência SHA-256 ([a-f0-9]{64})", part)
                            if reference not in media:
                                raise ValueError(f"missing_media:{code}:{block}:{number}")
                            assets = [{"kind": "private-asset", "bindingId": reference, "contentSha256": media[reference]}]
                        else:
                            message = required(r"(?s)```text\n(.*?)\n```", part)
                        add(identifier, {"kind": "message", "text": message, "media": assets, "buttons": [], "continuation": "automatic"})
                        if part_kind == "question":
                            answer = required(r"Controle answer_type: (text|first_name)", part)
                            if required(r"Controle answer_method: (\w+)", part) != "input":
                                raise ValueError("unsupported_answer_method")
                            minutes = int(required(r"Controle question_answer_timeout: unit=minutes, value=(\d+)", part))
                            timeout = required(r"Destino de timeout: (\d+|não definido na captura)", part)
                            storage = {"kind": "contact-field", "field": "first_name"} if "save_first_name_to_system_field" in part else {"kind": "none"}
                            add(identifier + "q", {"kind": "question", "storage": storage,
                                "timeout": {"kind": "after", "seconds": minutes * 60, "target": timeout},
                                "acceptance": {"kind": "explicit", "skip": {"kind": "disabled"}, "trim": True, "invalid": {"kind": "wait"}, "minCodePoints": 1, "maxCodePoints": 2048},
                                "answerType": answer, "answerMethod": "input", "nextTarget": next_target})
                    else:
                        raise ValueError(f"unsupported_part:{part_kind}")
            else:
                raise ValueError(f"unsupported_block:{kind}")
            if not local:
                raise ValueError("empty_block")
            entries[block] = local[0]["id"]
            for position, node in enumerate(local):
                if node["content"]["kind"] == "question":
                    if position != len(local) - 1:
                        raise ValueError("question_not_last")
                    continue
                if position + 1 < len(local):
                    edges.append({"source": node["id"], "port": "next", "target": {"kind": "node", "nodeId": local[position + 1]["id"]}})
                else:
                    links.append((node["id"], next_target))
            nodes.extend(local)

        def target(block):
            if block is None or block == "não definido na captura":
                return {"kind": "end"}
            if block not in entries:
                raise ValueError(f"missing_target:{code}:{block}")
            return {"kind": "node", "nodeId": entries[block]}

        for identifier, next_target in links:
            edges.append({"source": identifier, "port": "next", "target": target(next_target)})
        for node in nodes:
            content = node["content"]
            if content["kind"] == "question":
                content["nextTarget"] = target(content["nextTarget"])
                content["timeout"]["target"] = target(content["timeout"]["target"])
        expected = int(required(r"Blocos capturados: (\d+)", section))
        if len(entries) != expected:
            raise ValueError(f"block_count_mismatch:{code}:{len(entries)}:{expected}")
        flows.append({"code": code, "name": name, "source_blocks": len(entries), "document": {
            "kind": "batchat-authored-flow", "channel": "whatsapp", "schemaVersion": 2,
            "entry": target(root), "nodes": nodes, "edges": edges}})
    return flows


if __name__ == "__main__":
    result = read_capture(Path(sys.argv[1]).read_text(), json.loads(Path(sys.argv[2]).read_text()))
    output = Path(sys.argv[3])
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    output.chmod(0o600)
    print(json.dumps({"flows": len(result), "blocks": sum(f["source_blocks"] for f in result), "sending": False}))
