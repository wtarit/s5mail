"""Focused tests for the side-by-side migration helper."""

from __future__ import annotations

import shutil
import sqlite3
import subprocess
from pathlib import Path

import pytest


SCRIPT = Path(__file__).parents[1] / "tools" / "migrate-side-by-side.sh"


def _source_tree(root: Path) -> None:
    storage = root / "data"
    (root / "etc").mkdir(parents=True)
    (storage / "mail").mkdir(parents=True)
    (storage / "owncloud").mkdir()
    (storage / "mail" / "mailboxes" / "user@example.test" / "cur").mkdir(parents=True)
    (storage / "mail" / "mailboxes" / "user@example.test" / "cur" / "message").write_text(
        "fixture", encoding="utf-8"
    )
    (root / "etc" / "s5mail.conf").write_text("STORAGE_ROOT=/data\n", encoding="utf-8")
    (root / "etc" / "s5mail-release").write_text("2026.08.2\n", encoding="utf-8")
    (storage / "s5mail.version").write_text("15\n", encoding="utf-8")

    users = sqlite3.connect(storage / "mail" / "users.sqlite")
    users.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)")
    users.execute("INSERT INTO users(email) VALUES ('user@example.test')")
    users.commit()
    users.close()

    nextcloud = sqlite3.connect(storage / "owncloud" / "owncloud.db")
    nextcloud.execute("CREATE TABLE oc_appconfig (appid TEXT, configkey TEXT, configvalue TEXT)")
    nextcloud.execute("INSERT INTO oc_appconfig VALUES ('core', 'version', '34.0.2')")
    nextcloud.commit()
    nextcloud.close()


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([str(SCRIPT), *args], capture_output=True, text=True, check=False)


def test_dry_run_preflight_and_final_are_non_mutating(tmp_path: Path) -> None:
    source = tmp_path / "source"
    target = tmp_path / "target"
    _source_tree(source)

    result = _run(
        "--source-root",
        str(source),
        "--target-root",
        str(target),
        "--phase",
        "all",
        "--dry-run",
    )

    assert result.returncode == 0, result.stderr
    assert not target.exists()
    assert not (source / "var" / "lib" / "s5mail" / "side-by-side-migration.state").exists()
    assert "final sync complete" in result.stdout


def test_preseed_and_import_clean_target_only(tmp_path: Path) -> None:
    if shutil.which("rsync") is None:
        pytest.skip("rsync is required for the filesystem copy test")
    source = tmp_path / "source"
    target = tmp_path / "target"
    _source_tree(source)
    legacy = target / "data" / "mail" / "roundcube"
    legacy.mkdir(parents=True)
    (legacy / "preferences.sqlite").write_text("source remains intact", encoding="utf-8")

    preseed = _run(
        "--source-root",
        str(source),
        "--target-root",
        str(target),
        "--phase",
        "preseed",
    )
    assert preseed.returncode == 0, preseed.stderr
    assert (target / "data" / "mail" / "users.sqlite").exists()
    assert legacy.exists(), "preseed must not delete target state"

    state_marker = source / "var" / "lib" / "s5mail" / "side-by-side-migration.state"
    state_marker.parent.mkdir(parents=True)
    state_marker.write_text("status=final-sync-complete-import-pending\n", encoding="utf-8")
    ready_marker = target / "var" / "lib" / "s5mail" / "debian13-provisioning-complete"
    ready_marker.parent.mkdir(parents=True)
    ready_marker.write_text("completed=fixture\n", encoding="utf-8")

    imported = _run(
        "--source-root",
        str(source),
        "--target-root",
        str(target),
        "--phase",
        "import",
    )
    assert imported.returncode == 0, imported.stderr
    assert not legacy.exists()
    assert not state_marker.exists()
    assert (source / "data" / "mail" / "users.sqlite").exists()
    assert (source / "data" / "owncloud" / "owncloud.db").exists()


def test_import_requires_post_final_target_provisioning(tmp_path: Path) -> None:
    if shutil.which("rsync") is None:
        pytest.skip("rsync is required for the filesystem copy test")
    source = tmp_path / "source"
    target = tmp_path / "target"
    _source_tree(source)

    preseed = _run(
        "--source-root",
        str(source),
        "--target-root",
        str(target),
        "--phase",
        "preseed",
    )
    assert preseed.returncode == 0, preseed.stderr

    state_marker = source / "var" / "lib" / "s5mail" / "side-by-side-migration.state"
    state_marker.parent.mkdir(parents=True)
    state_marker.write_text("status=final-sync-complete-import-pending\n", encoding="utf-8")

    imported = _run(
        "--source-root",
        str(source),
        "--target-root",
        str(target),
        "--phase",
        "import",
    )
    assert imported.returncode != 0
    assert "target provisioning is not reconciled" in imported.stderr
