import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from changelog_section import extract  # noqa: E402

SCRIPT = Path(__file__).parent / "changelog_section.py"

CHANGELOG = """# Changelog

## [Unreleased]

### Added
- Next thing.

## [0.2.0] - 2026-12-01

### Fixed
- A bug.

## [0.1.0] - 2026-11-10

### Added
- First release.
- Second line.

[Unreleased]: https://example.invalid/compare
"""


def test_extracts_middle_section():
    assert extract(CHANGELOG, "0.2.0") == "### Fixed\n- A bug."


def test_extracts_last_section_and_accepts_v_prefix():
    body = extract(CHANGELOG, "v0.1.0")
    assert body.startswith("### Added\n- First release.")
    assert body.endswith("- Second line.\n\n[Unreleased]: https://example.invalid/compare")


def test_unreleased_is_a_section():
    assert extract(CHANGELOG, "Unreleased") == "### Added\n- Next thing."


def test_missing_version_is_none():
    assert extract(CHANGELOG, "0.3.0") is None


def test_prerelease_uses_base_version_section():
    assert extract(CHANGELOG, "v0.1.0-rc1") == extract(CHANGELOG, "0.1.0")
    assert extract(CHANGELOG, "0.3.0-rc1") is None


def test_prefix_version_does_not_match():
    assert extract(CHANGELOG, "0.1") is None


def test_empty_section_is_none():
    assert extract("## [1.0.0] - x\n\n## [0.9.0]\n- a\n", "1.0.0") is None


def test_cli_exit_codes(tmp_path):
    f = tmp_path / "CHANGELOG.md"
    f.write_text(CHANGELOG)
    ok = subprocess.run([sys.executable, SCRIPT, f, "0.2.0"], capture_output=True, text=True)
    assert ok.returncode == 0 and ok.stdout == "### Fixed\n- A bug.\n"
    bad = subprocess.run([sys.executable, SCRIPT, f, "9.9.9"], capture_output=True, text=True)
    assert bad.returncode == 1 and "9.9.9" in bad.stderr
