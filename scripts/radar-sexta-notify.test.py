"""Testes sem rede da ponte privada; python3 scripts/radar-sexta-notify.test.py."""
import contextlib
import hashlib
import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("radar_notify", Path(__file__).with_name("radar-sexta-notify.py"))
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class NotificationTests(unittest.TestCase):
    def setUp(self):
        self.status = "pending"
        self.sent = 0
        self.timeout = False
        self.row = {
            "id": "00000000-0000-4000-8000-000000000003",
            "conversation_id": "00000000-0000-4000-8000-000000000004",
            "text": "Oi 😀 quero comprar", "contact_name": "Teste",
            "source_hash": hashlib.sha256("Oi 😀 quero comprar".encode()).hexdigest(),
            "excerpt_start": 6, "excerpt_length": 13,
            "category": "compra", "pause_status": "paused",
        }

    def query(self, sql):
        if sql.startswith("select exists"):
            return "t"
        if sql.startswith("with candidate"):
            if self.status != "pending":
                return ""
            self.status = "sending"
            return json.dumps(self.row)
        for status in ["sent", "unknown", "suppressed", "failed"]:
            if "set notify_status='" + status + "',notification_id=" in sql:
                self.status = status
        return ""

    def telegram(self, _token, method, payload):
        if method == "getMe":
            return {"ok": True, "result": {"username": "EquipeYuriBot"}}
        self.sent += 1
        self.assertIn("quero comprar", payload["text"])
        if self.timeout:
            raise TimeoutError()
        return {"ok": True, "result": {"message_id": 42}}

    def run_bridge(self):
        argv = ["bridge", "--organization", "00000000-0000-4000-8000-000000000001",
                "--operator", "00000000-0000-4000-8000-000000000002", "--chat-id", "123",
                "--hermes-env", "/unused", "--base-url", "https://example.test"]
        env = {"TELEGRAM_BOT_TOKEN": "test-only", "TELEGRAM_HOME_CHANNEL": "123"}
        with patch("sys.argv", argv), patch.object(bridge, "read_env", return_value=env), \
                patch.object(bridge, "query", side_effect=self.query), \
                patch.object(bridge, "telegram", side_effect=self.telegram), contextlib.redirect_stdout(io.StringIO()):
            bridge.main()

    def test_utf16_excerpt_and_sent_receipt(self):
        self.assertEqual(bridge.excerpt(self.row["text"], 6, 13), "quero comprar")
        self.run_bridge()
        self.run_bridge()
        self.assertEqual((self.status, self.sent), ("sent", 1))

    def test_uncertain_delivery_never_blindly_resends(self):
        self.timeout = True
        self.run_bridge()
        self.run_bridge()
        self.assertEqual((self.status, self.sent), ("unknown", 1))

    def test_changed_evidence_is_not_sent(self):
        self.row["text"] = "Texto alterado"
        self.run_bridge()
        self.assertEqual((self.status, self.sent), ("suppressed", 0))

    def test_ecmascript_whitespace_preserves_hash(self):
        self.row["text"] = "\ufeff\u00a0" + self.row["text"] + "\r\n"
        self.run_bridge()
        self.assertEqual((self.status, self.sent), ("sent", 1))


if __name__ == "__main__":
    unittest.main()
