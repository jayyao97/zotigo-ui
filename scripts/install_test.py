"""Exercise the public piped bootstrap against an isolated tagged repository."""
import os
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


if __name__ == "__main__":
    unittest.main()
