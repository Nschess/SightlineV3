#!/usr/bin/env python3
"""Prepare or verify persistent AGENTS.md instructions for Sightline DEV projects."""
from __future__ import annotations

import argparse
import shutil
import sys
import zipfile
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[1]
CANONICAL_TEMPLATE = (
    WORKSPACE
    / "work"
    / "consolidation-threezip-20261025"
    / "independent-extract-release"
    / "DEV"
    / "AGENTS.md"
)


def default_template() -> Path:
    # When bundled in a DEV project, use that project's root instructions.
    bundled = Path(__file__).resolve().parents[1] / "AGENTS.md"
    try:
        if b"# Sightline V3 Project Instructions" in bundled.read_bytes():
            return bundled
    except OSError:
        pass
    return CANONICAL_TEMPLATE


def prepare(project: Path, template: Path) -> int:
    project = project.resolve()
    target = project / "AGENTS.md"
    template = template.resolve()
    if not template.is_file():
        print(f"BLOCKED: instruction template not found: {template}")
        return 2
    expected = template.read_bytes()
    if target.exists():
        existing = target.read_bytes()
        if existing == expected:
            print(f"PASS: current instructions already present: {target}")
            return 0
        print(f"CONFLICT: existing instructions differ; preserved without overwrite: {target}")
        print("Review and reconcile manually, preserving any newer or project-specific rules.")
        return 2
    if not project.is_dir():
        print(f"BLOCKED: DEV project directory not found: {project}")
        return 2
    shutil.copy2(template, target)
    if target.read_bytes() != expected:
        print(f"FAIL: copied instructions did not verify: {target}")
        return 1
    print(f"PASS: copied and verified instructions: {target}")
    return 0


def verify(project: Path, archive: Path | None, template: Path) -> int:
    project = project.resolve()
    target = project / "AGENTS.md"
    if not target.is_file():
        print(f"FAIL: DEV project root is missing AGENTS.md: {target}")
        return 1
    contents = target.read_bytes()
    required = (
        b"# Sightline V3 Project Instructions",
        b"Protected baselines and scope",
        b"Three.js r128",
        b"Acceptance evidence",
    )
    missing = [marker.decode("ascii") for marker in required if marker not in contents]
    if missing:
        print(f"FAIL: project instructions are missing required sections: {', '.join(missing)}")
        return 1
    if not template.is_file():
        print(f"BLOCKED: authoritative template not found: {template}")
        return 2
    canonical = template.read_bytes()
    # Exact equality is expected for the canonical DEV project. New DEV projects
    # may extend it, but must retain every canonical instruction byte-for-byte.
    if project == template.parent.resolve() and contents != canonical:
        print("FAIL: canonical project AGENTS.md differs from its authoritative file")
        return 1
    print(f"PASS: project root instructions present and applicable: {target}")
    if archive is None:
        return 0
    archive = archive.resolve()
    if not archive.is_file():
        print(f"FAIL: DEV archive not found: {archive}")
        return 1
    try:
        with zipfile.ZipFile(archive) as zf:
            matches = [name for name in zf.namelist() if name == "AGENTS.md"]
            if len(matches) != 1:
                print("FAIL: archive must contain exactly one AGENTS.md at its project root")
                return 1
            packed = zf.read(matches[0])
    except (OSError, zipfile.BadZipFile) as exc:
        print(f"FAIL: cannot read DEV archive: {exc}")
        return 1
    if packed != contents:
        print("FAIL: packaged AGENTS.md differs from the editable DEV project")
        return 1
    print(f"PASS: archive contains the matching root AGENTS.md: {archive}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare", help="copy current project instructions if missing")
    prep.add_argument("project", type=Path)
    prep.add_argument("--template", type=Path, default=default_template())
    check = sub.add_parser("verify", help="verify project instructions and optional DEV ZIP")
    check.add_argument("project", type=Path)
    check.add_argument("--archive", type=Path)
    check.add_argument("--template", type=Path, default=default_template())
    args = parser.parse_args()
    if args.command == "prepare":
        return prepare(args.project, args.template)
    return verify(args.project, args.archive, args.template)


if __name__ == "__main__":
    sys.exit(main())
