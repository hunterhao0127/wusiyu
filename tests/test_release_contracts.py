import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "02-Mac版" / "flask-app" / "app.py"
WEB_PATH = ROOT / "web" / "index.html"
MAC_HTML_PATH = ROOT / "02-Mac版" / "flask-app" / "static" / "index.html"
WINDOWS_MAIN_PATH = ROOT / "01-Windows版" / "main.js"
WINDOWS_PACKAGE_PATH = ROOT / "01-Windows版" / "package.json"
WINDOWS_WORKFLOW_PATH = ROOT / ".github" / "workflows" / "windows-build.yml"


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

    def test_source_server_serves_main_page_from_any_working_directory(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("务思语", response.get_data(as_text=True))
        response.close()

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
        self.assertIn("超过", response.get_json()["error"])

    def test_invalid_json_does_not_crash_translation_routes(self):
        response = self.client.post(
            "/api/translate/word", data="not-json", content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)

    def test_sync_records_round_trip_and_secret_rejection(self):
        records = [{
            "id": "word:hello",
            "type": "vocabulary",
            "updatedAt": 10,
            "deviceId": "mac-test",
            "deletedAt": None,
            "payload": {"id": "word:hello", "type": "word", "text": "hello"},
        }]
        response = self.client.put("/api/sync-records", json={"records": records})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/sync-records").get_json()["records"], records)

        rejected = self.client.put("/api/sync-records", json={"records": [{
            **records[0],
            "payload": {"api_key": "must-not-be-saved"},
        }]})
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(self.client.get("/api/sync-records").get_json()["records"], records)

    def test_book_response_contains_stable_content_id(self):
        books_dir = Path(self.backend.BOOKS_DIR)
        books_dir.mkdir(parents=True, exist_ok=True)
        (books_dir / "sample.txt").write_text("same book content", encoding="utf-8")

        first = self.client.get("/api/books/sample.txt").get_json()["book"]
        second = self.client.get("/api/books/sample.txt").get_json()["book"]

        self.assertTrue(first["bookId"].startswith("sha256:"))
        self.assertEqual(first["bookId"], second["bookId"])
        self.assertEqual(first["size"], len("same book content".encode("utf-8")))

    def test_desktop_complete_backup_round_trip(self):
        books_dir = Path(self.backend.BOOKS_DIR)
        books_dir.mkdir(parents=True, exist_ok=True)
        content = "Pride and Prejudice\nIt is a truth universally acknowledged.".encode()
        (books_dir / "傲慢与偏见.txt").write_bytes(content)
        (books_dir / "not-selected.txt").write_text("leave me out", encoding="utf-8")
        record = {
            "id": "word:truth",
            "type": "vocabulary",
            "updatedAt": 10,
            "deviceId": "desktop-test",
            "deletedAt": None,
            "payload": {"id": "word:truth", "type": "word", "text": "truth"},
        }
        backup = {
            "format": "wusiyu-learning-backup",
            "version": 2,
            "exportedAt": "2026-09-08T00:00:00.000Z",
            "sourceDeviceId": "desktop-test",
            "records": [record],
        }

        exported = self.client.post(
            "/api/backup/export",
            json={"backup": backup, "filenames": ["傲慢与偏见.txt"]},
        )
        self.assertEqual(exported.status_code, 200)
        archive_bytes = exported.data
        exported.close()
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
            self.assertEqual(set(archive.namelist()), {"backup.json", "books/0001.txt"})
            manifest = json.loads(archive.read("backup.json"))
            self.assertEqual(manifest["records"], [record])
            self.assertEqual(manifest["books"][0]["filename"], "傲慢与偏见.txt")
            self.assertEqual(archive.read("books/0001.txt"), content)
            self.assertNotIn("api_key", archive.read("backup.json").decode("utf-8").lower())

        (books_dir / "傲慢与偏见.txt").unlink()
        restored = self.client.post(
            "/api/backup/import",
            data={"file": (io.BytesIO(archive_bytes), "backup.zip")},
            content_type="multipart/form-data",
        )
        self.assertEqual(restored.status_code, 200, restored.get_data(as_text=True))
        result = restored.get_json()
        self.assertEqual(result["backup"]["records"], [record])
        self.assertEqual(result["importedBooks"][0]["filename"], "傲慢与偏见.txt")
        self.assertEqual((books_dir / "傲慢与偏见.txt").read_bytes(), content)

        duplicate = self.client.post(
            "/api/backup/import",
            data={"file": (io.BytesIO(archive_bytes), "backup.zip")},
            content_type="multipart/form-data",
        ).get_json()
        self.assertEqual(duplicate["importedBooks"], [])
        self.assertEqual(duplicate["skippedBooks"], ["傲慢与偏见.txt"])

    def test_desktop_backup_rejects_unsafe_archive_path(self):
        payload = io.BytesIO()
        backup = {
            "format": "wusiyu-learning-backup",
            "version": 2,
            "exportedAt": "2026-09-08T00:00:00.000Z",
            "sourceDeviceId": "desktop-test",
            "records": [],
            "books": [{
                "bookId": "sha256:" + "0" * 64,
                "filename": "book.txt",
                "archivePath": "../book.txt",
                "size": 4,
                "mediaType": "text/plain",
            }],
        }
        with zipfile.ZipFile(payload, "w") as archive:
            archive.writestr("backup.json", json.dumps(backup))
            archive.writestr("../book.txt", b"book")
        response = self.client.post(
            "/api/backup/import",
            data={"file": (io.BytesIO(payload.getvalue()), "unsafe.zip")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("路径", response.get_json()["error"])


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
            self.assertIn("sharedCore.exportBackup", backup_section)
            legacy_section = source[source.index("function legacyBackupSnapshot"):source.index("async function initSharedData")]
            self.assertIn("wusiyu_wordbook", legacy_section)
            self.assertIn("wusiyu_history", legacy_section)
        self.assertIn("function checkForUpdates", WEB_PATH.read_text(encoding="utf-8"))

    def test_all_three_platforms_use_the_release_manifest(self):
        release = json.loads((ROOT / "web" / "version.json").read_text(encoding="utf-8"))
        self.assertEqual(release["downloads"]["mac"], "https://github.com/hunterhao0127/wusiyu/releases/latest")
        self.assertEqual(release["downloads"]["windows"], "https://github.com/hunterhao0127/wusiyu/releases/latest")
        self.assertIn("checkForUpdates", (ROOT / "02-Mac版" / "main.js").read_text(encoding="utf-8"))
        self.assertIn("checkForUpdates", (ROOT / "01-Windows版" / "main.js").read_text(encoding="utf-8"))

    def test_web_can_select_original_books_for_zip_backup(self):
        source = WEB_PATH.read_text(encoding="utf-8")
        self.assertIn('id="includeBooksInBackup"', source)
        self.assertIn('accept="application/json,.json,application/zip,.zip"', source)
        self.assertIn("sourceBlob: file.slice", source)
        self.assertIn("new JSZip()", source)
        self.assertIn("sharedCore.validateBookManifest", source)

    def test_desktop_can_select_books_for_zip_backup(self):
        source = MAC_HTML_PATH.read_text(encoding="utf-8")
        self.assertIn('id="includeBooksInBackup"', source)
        self.assertIn('id="backupBookPicker"', source)
        self.assertIn('accept="application/json,.json,application/zip,.zip"', source)
        self.assertIn("fetch('/api/backup/export'", source)
        self.assertIn("fetch('/api/backup/import'", source)

    def test_web_and_desktop_mount_one_shared_review_panel(self):
        for path in (WEB_PATH, MAC_HTML_PATH):
            source = path.read_text(encoding="utf-8")
            self.assertIn("assets/shared/core/learning/review.js", source)
            self.assertIn("assets/shared/ui/review-panel.js", source)
            self.assertIn("sharedCore.mountReviewPanel", source)
            self.assertNotIn("function rateVocabularyRecord", source)

        shared_ui = (ROOT / "shared" / "ui" / "review-panel.js").read_text(encoding="utf-8")
        self.assertIn("记错了", shared_ui)
        self.assertIn("上一词", shared_ui)
        self.assertIn("每日新词", shared_ui)

    def test_web_and_desktop_share_reader_display_rules(self):
        for path in (WEB_PATH, MAC_HTML_PATH):
            source = path.read_text(encoding="utf-8")
            self.assertIn("assets/shared/core/reader/settings.js", source)
            self.assertIn("assets/shared/ui/reader-controls.js", source)
            self.assertIn("sharedCore.mountReaderControls", source)
            self.assertIn("sharedCore.readingProgress", source)

        shared_ui = (ROOT / "shared" / "ui" / "reader-controls.js").read_text(encoding="utf-8")
        self.assertIn("宽屏双栏", shared_ui)
        self.assertIn("页面边距", shared_ui)
        self.assertIn("段落间距", shared_ui)

    def test_windows_build_uses_the_shared_desktop_backend(self):
        main = WINDOWS_MAIN_PATH.read_text(encoding="utf-8")
        package = json.loads(WINDOWS_PACKAGE_PATH.read_text(encoding="utf-8"))
        workflow = WINDOWS_WORKFLOW_PATH.read_text(encoding="utf-8")

        self.assertIn("02-Mac版', 'flask-app', 'app.py", main)
        self.assertIn("'backend', 'wusiyu_backend.exe'", main)
        self.assertIn("WUSIYU_DATA_DIR: app.getPath('userData')", main)
        self.assertIn("release.downloads && release.downloads.windows", main)
        self.assertEqual(package["version"], "1.6.0")
        self.assertEqual(package["build"]["extraResources"][0]["from"], "backend/wusiyu_backend.exe")
        self.assertIn("02-Mac版/flask-app/requirements.txt", workflow)
        self.assertIn("build-windows-backend.ps1", workflow)
        self.assertIn("smoke-windows-backend.ps1", workflow)


if __name__ == "__main__":
    unittest.main()
