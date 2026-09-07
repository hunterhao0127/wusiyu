import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "02-Mac版" / "flask-app" / "app.py"
WEB_PATH = ROOT / "web" / "index.html"
MAC_HTML_PATH = ROOT / "02-Mac版" / "flask-app" / "static" / "index.html"


def load_backend(data_dir):
    os.environ["WUSIYU_DATA_DIR"] = data_dir
    spec = importlib.util.spec_from_file_location("wusiyu_test_app", APP_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BackendContracts(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.backend = load_backend(self.tempdir.name)
        self.client = self.backend.app.test_client()

    def tearDown(self):
        self.tempdir.cleanup()

    def test_anthropic_request_contract(self):
        captured = {}

        class Response:
            def raise_for_status(self):
                pass

            def json(self):
                return {"content": [{"type": "text", "text": "OK"}]}

        def fake_post(url, **kwargs):
            captured["url"] = url
            captured.update(kwargs)
            return Response()

        self.backend.requests.post = fake_post
        result = self.backend.call_ai_api(
            [
                {"role": "system", "content": "system prompt"},
                {"role": "user", "content": "ping"},
            ],
            {
                "provider": "claude",
                "api_key": "test-key",
                "api_base": "https://api.anthropic.com/v1",
                "model": "claude-test",
            },
        )

        self.assertEqual(result, {"content": "OK"})
        self.assertEqual(captured["url"], "https://api.anthropic.com/v1/messages")
        self.assertEqual(captured["headers"]["x-api-key"], "test-key")
        self.assertNotIn("Authorization", captured["headers"])
        self.assertEqual(captured["json"]["system"], "system prompt")
        self.assertEqual([m["role"] for m in captured["json"]["messages"]], ["user"])

    def test_book_path_cannot_escape_books_directory(self):
        sibling = Path(self.tempdir.name) / "books-other"
        sibling.mkdir()
        (sibling / "secret.txt").write_text("secret", encoding="utf-8")
        with self.backend.app.test_request_context():
            _response, status = self.backend.api_get_book("../books-other/secret.txt")
        self.assertEqual(status, 403)

    def test_upload_limit_returns_json(self):
        self.backend.app.config["MAX_CONTENT_LENGTH"] = 8
        response = self.client.post(
            "/api/upload",
            data={"file": (io.BytesIO(b"123456789"), "book.txt")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.get_json()["error"], "文件超过 100 MB 上限")

    def test_invalid_json_does_not_crash_translation_routes(self):
        response = self.client.post(
            "/api/translate/word", data="not-json", content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)


class FrontendContracts(unittest.TestCase):
    def test_web_escapes_ai_sentence_and_filename_handlers(self):
        source = WEB_PATH.read_text(encoding="utf-8")
        self.assertIn("escapeHtml(content).replace(/\\n/g, '<br>')", source)
        self.assertNotIn("innerHTML = content.replace(/\\n/g, '<br>')", source)
        self.assertNotIn('onclick="openBook(\'${b.filename', source)
        self.assertIn('data-filename="${escapeHtml(b.filename)}"', source)

    def test_backup_excludes_api_key_and_update_check_exists(self):
        for path in (WEB_PATH, MAC_HTML_PATH):
            source = path.read_text(encoding="utf-8")
            backup_section = source[source.index("function exportLearningData"):source.index("async function importLearningData")]
            self.assertNotIn("API_KEY_STORAGE", backup_section)
            self.assertNotIn("api_key", backup_section)
            self.assertIn("wusiyu_wordbook", backup_section)
            self.assertIn("wusiyu_history", backup_section)
        self.assertIn("function checkForUpdates", WEB_PATH.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
