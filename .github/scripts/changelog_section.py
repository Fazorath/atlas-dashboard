#!/usr/bin/env python3
"""Print the CHANGELOG.md section for one version (Keep a Changelog format).

    changelog_section.py CHANGELOG.md 0.1.0   # also accepts v0.1.0

Prints the body under "## [0.1.0] - date" up to the next "## " heading.
A release candidate such as 0.1.0-rc1 (only -rcN) falls back to the 0.1.0 section.
Exits 1 with a message on stderr when the section is missing or empty, so a tag
with no release notes fails the release job.
"""

import re
import sys

HEADING = re.compile(r"^##\s+\[?v?([^\]\s]+)\]?(?:\s|$)")


RC_SUFFIX = re.compile(r"(.+)-rc\d+")


def extract(text: str, version: str) -> str | None:
    version = version.removeprefix("v")
    body = _section(text, version)
    rc = RC_SUFFIX.fullmatch(version)
    if body is None and rc:
        # A release candidate (0.1.0-rc1) uses the notes of the version it previews.
        body = _section(text, rc.group(1))
    return body


def _section(text: str, version: str) -> str | None:
    lines: list[str] = []
    found = False
    for line in text.splitlines():
        m = HEADING.match(line)
        if m:
            if found:
                break
            found = m.group(1) == version
            continue
        if found:
            lines.append(line)
    body = "\n".join(lines).strip()
    return body if found and body else None


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: changelog_section.py CHANGELOG.md VERSION", file=sys.stderr)
        return 2
    path, version = argv[1], argv[2]
    try:
        text = open(path, encoding="utf-8").read()
    except OSError as e:
        print(f"cannot read {path}: {e}", file=sys.stderr)
        return 1
    body = extract(text, version)
    if body is None:
        print(f"{path} has no non-empty section for {version}", file=sys.stderr)
        return 1
    print(body)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
