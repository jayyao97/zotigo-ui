"""Exercise the public piped bootstrap against an isolated tagged repository."""
import os
import json
import shutil
from pathlib import Path
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]


class BootstrapTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="zotigo-ui-bootstrap-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.source = self.base / "release"
        self.source.mkdir()
        (self.source / "install.sh").write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$RESULT"\n')
        for args in [["init", "-q"], ["add", "."], ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "release"],
                     ["tag", "v1.9.0"], ["-c", "user.name=Test", "-c", "user.email=test@example.com", "tag", "-a", "v1.10.0", "-m", "stable"], ["tag", "v2.0.0-rc.1"]]:
            subprocess.run(["git", "-C", str(self.source), *args], check=True)
        self.result = self.base / "arguments"
        self.env = {**os.environ, "HOME": str(self.base / "home"), "RESULT": str(self.result),
                    "GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": f"url.{self.source.as_uri()}.insteadOf",
                    "GIT_CONFIG_VALUE_0": "https://github.com/jayyao97/zotigo-ui.git"}

    def install(self, *args):
        return subprocess.run(["sh", "-s", "--", *args], input=(REPO / "install.sh").read_text(),
                              env=self.env, text=True, capture_output=True)

    def test_default_stable_and_option_forwarding(self):
        prefix = str(self.base / "install with spaces")
        daemon = str(self.base / "daemon source")
        result = self.install("--component", "web", "--prefix", prefix, "--daemon-source", daemon, "--no-service")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Selected stable version v1.10.0", result.stdout)
        args = self.result.read_text().splitlines()
        self.assertEqual(args[2:], ["--component", "web", "--prefix", prefix, "--no-service", "--daemon-source", daemon])

    def test_explicit_version_overrides_default(self):
        result = self.install("--version", "v1.9.0")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("Selected stable", result.stdout)
        self.assertEqual(self.result.read_text().splitlines()[2:4], ["--component", "desktop"])

    def test_no_stable_tag_is_an_error(self):
        subprocess.run(["git", "-C", str(self.source), "tag", "-d", "v1.9.0", "v1.10.0"], check=True, capture_output=True)
        result = self.install()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("No stable", result.stderr)
        self.assertFalse(self.result.exists())


class ClientConfigTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="zotigo-client-config-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.prefix = self.base / "install with spaces"
        self.config = self.prefix / "config"
        self.config.mkdir(parents=True)
        self.token = self.config / "daemon.token"
        self.token.write_text("test-secret\n")
        (self.config / "daemon.env").write_text(f"ZOTIGOD_ADDR=0.0.0.0:8766\nZOTIGOD_AUTH_TOKEN_FILE='{self.token}'\n")
        self.stage = self.base / "stage"
        self.stage.mkdir()
        # Only the paired installer's quoting/probe interface is needed here;
        # its installer and address mapping are tested in the daemon repository.
        self.helpers = self.base / "install-helpers.sh"
        self.helpers.write_text("""fail() { echo "$*" >&2; exit 1; }
quote() { printf "'%s'" "$1"; }
daemon_check_url() { check_url=http://127.0.0.1:8766/health; }
""")
        self.env = {**os.environ, "HOME": str(self.base / "home"), "prefix": str(self.prefix),
                    "stage": str(self.stage), "node_executable": shutil.which("node")}

    def configure(self, component, platform="Linux", installed=False):
        root = self.prefix / component
        if installed:
            (root / "current").mkdir(parents=True, exist_ok=True)
            (root / "current/INSTALLATION").write_text("version=old\n")
        resources = self.stage / ("output/Zotigo.app/Contents/Resources" if platform == "Darwin" else "output/resources")
        resources.mkdir(parents=True, exist_ok=True)
        link = resources / "local-host.json"
        if link.is_symlink():
            link.unlink()  # Each install has a fresh staging directory.
        return subprocess.run(["sh", "-c", 'set -eu; umask 077; . "$1"; . "$2"; install_client_config',
                               "test", str(self.helpers), str(REPO / "scripts/install-client-config.sh")],
                              env={**self.env, "component": component, "platform": platform, "root": str(root)},
                              capture_output=True, text=True)

    def test_first_web_install_connects_to_daemon_and_preserves_config(self):
        result = self.configure("web")
        self.assertEqual(result.returncode, 0, result.stderr)
        config = self.config / "web.env"
        values = subprocess.check_output(["sh", "-c", '. "$1"; printf "%s\\n" "$ZOTIGOD_URL" "$ZOTIGOD_AUTH_TOKEN_FILE"', "test", str(config)], text=True).splitlines()
        self.assertEqual(values, ["http://127.0.0.1:8766", str(self.token)])
        self.assertEqual(config.stat().st_mode & 0o777, 0o600)
        config.write_text("ZOTIGOD_URL=http://127.0.0.1:9999\nZOTIGOD_AUTH_TOKEN_FILE=\n")
        original = config.read_bytes()
        self.assertEqual(self.configure("web", installed=True).returncode, 0)
        self.assertEqual(config.read_bytes(), original)

    def test_first_desktop_install_and_retry_link_persistent_config(self):
        for platform in ["Linux", "Darwin"]:
            result = self.configure("desktop", platform)
            self.assertEqual(result.returncode, 0, result.stderr)
            config = self.config / "desktop.json"
            self.assertEqual(json.loads(config.read_text()), {"baseUrl": "http://127.0.0.1:8766", "tokenFile": str(self.token)})
            resources = self.stage / ("output/Zotigo.app/Contents/Resources" if platform == "Darwin" else "output/resources")
            self.assertEqual((resources / "local-host.json").resolve(), config)
            self.assertNotIn("test-secret", config.read_text())
        config.write_text('{"baseUrl":"http://127.0.0.1:9999","tokenFile":""}')
        original = config.read_bytes()
        self.assertEqual(self.configure("desktop", installed=True).returncode, 0)
        self.assertEqual(config.read_bytes(), original)

    def test_legacy_desktop_does_not_automatically_adopt_token(self):
        self.assertEqual(self.configure("desktop", installed=True).returncode, 0)
        self.assertFalse((self.config / "desktop.json").exists())
        self.assertFalse((self.stage / "output/resources/local-host.json").exists())

    def test_missing_existing_web_config_is_not_first_install(self):
        result = self.configure("web", installed=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Existing Web configuration is missing", result.stderr)
        self.assertFalse((self.config / "web.env").exists())

    def test_new_client_preserves_legacy_daemon_without_auth(self):
        (self.config / "daemon.env").write_text("ZOTIGOD_ADDR=127.0.0.1:8766\n")
        self.env["ZOTIGOD_AUTH_TOKEN_FILE"] = "/unrelated/shell/token"
        self.assertEqual(self.configure("desktop").returncode, 0)
        self.assertEqual(json.loads((self.config / "desktop.json").read_text())["tokenFile"], "")


if __name__ == "__main__":
    unittest.main()
