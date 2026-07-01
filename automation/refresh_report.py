#!/usr/bin/env python3
"""
One-command refresh of the oil-analysis dashboard from the latest raw Excel
data. Wires together export_oil_data.py -> export_fail_data.py ->
build_dashboard.js so an agent (or a human) never has to manually open
Excel, save a CSV and drag it into the browser's "📂 Обновить"/"🔧 Отказы"
modals - it reproduces exactly what those modals do, headlessly.

Usage (from repo root):
    python3 automation/refresh_report.py
    python3 automation/refresh_report.py --oil "Свод_анализов_масла.xlsm" --out dashboard_report.html

By default it auto-discovers:
  - all "Свод_анализов_масла*.xlsm" workbooks (merged together)
  - "Сводный анализ ПК*.xlsx" for the failure/repair overlay (falls back to
    "Сводный анализ NTE*.xlsx" if the ПК-wide file isn't present)
  - "dashboard_report.html" as both the template and the output (in-place
    refresh, so `git diff` shows exactly what changed)

Filenames on this repo mix NFC/NFD Unicode normalization for Cyrillic
(GitHub's web upload vs. local tools disagree), so discovery normalizes
before matching instead of relying on shell globs.
"""
import argparse
import fnmatch
import os
import subprocess
import sys
import tempfile
import unicodedata
import zipfile

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTOMATION_DIR = os.path.dirname(os.path.abspath(__file__))


def find_files(pattern, root=REPO_ROOT):
    npat = unicodedata.normalize("NFC", pattern)
    matches = []
    for name in os.listdir(root):
        if fnmatch.fnmatch(unicodedata.normalize("NFC", name), npat):
            matches.append(os.path.join(root, name))
    return sorted(matches)


def bootstrap_template(template_path):
    """The regenerated report isn't tracked in git (it's a 40-60MB build
    artifact); the repo instead ships a template inside a small zip. If the
    template is missing locally, extract it from the first zip that
    contains a dashboard_*.html so a fresh clone can run with zero manual
    steps."""
    if os.path.exists(template_path):
        return
    for zpath in find_files("*.zip"):
        with zipfile.ZipFile(zpath) as zf:
            for name in zf.namelist():
                if fnmatch.fnmatch(name.lower(), "dashboard*.html"):
                    print(f"[refresh_report] bootstrapping template from {os.path.basename(zpath)}:{name}")
                    with zf.open(name) as src, open(template_path, "wb") as dst:
                        dst.write(src.read())
                    return
    sys.exit(f"Template not found: {template_path} (and no zip with a dashboard*.html to bootstrap from)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--oil", nargs="+", default=None,
                    help="oil lab-sample workbook(s); default: all Свод_анализов_масла*.xlsm")
    ap.add_argument("--failures", default=None,
                    help="failure/repair log workbook; default: Сводный анализ ПК*.xlsx")
    ap.add_argument("--no-failures", action="store_true", help="skip the failure overlay entirely")
    ap.add_argument("--template", default=os.path.join(REPO_ROOT, "dashboard_report.html"))
    ap.add_argument("--out", default=os.path.join(REPO_ROOT, "dashboard_report.html"))
    ap.add_argument("--keep-intermediates", metavar="DIR",
                    help="also write the intermediate CSV/JSON files to this directory")
    args = ap.parse_args()

    oil_files = args.oil or find_files("Свод_анализов_масла*.xlsm")
    if not oil_files:
        sys.exit("No Свод_анализов_масла*.xlsm files found - pass --oil explicitly")
    print(f"[refresh_report] oil sources: {[os.path.basename(f) for f in oil_files]}")

    fail_file = None
    if not args.no_failures:
        fail_file = args.failures
        if not fail_file:
            candidates = find_files("Сводный анализ ПК*.xlsx") or find_files("Сводный анализ NTE*.xlsx")
            fail_file = candidates[0] if candidates else None
        if fail_file:
            print(f"[refresh_report] failure source: {os.path.basename(fail_file)}")
        else:
            print("[refresh_report] no failure workbook found, skipping отказы overlay")

    bootstrap_template(args.template)

    work_dir = args.keep_intermediates or tempfile.mkdtemp(prefix="oil_report_")
    os.makedirs(work_dir, exist_ok=True)

    subprocess.run(
        [sys.executable, os.path.join(AUTOMATION_DIR, "export_oil_data.py"),
         *oil_files, "--out-dir", work_dir],
        check=True,
    )

    fail_csv = None
    if fail_file:
        fail_csv = os.path.join(work_dir, "oil_failures.csv")
        subprocess.run(
            [sys.executable, os.path.join(AUTOMATION_DIR, "export_fail_data.py"),
             fail_file, "--out", fail_csv],
            check=True,
        )

    cmd = [
        "node", os.path.join(AUTOMATION_DIR, "build_dashboard.js"),
        "--template", args.template,
        "--oil-csv", os.path.join(work_dir, "oil_samples.csv"),
        "--norms-csv", os.path.join(work_dir, "norms.csv"),
        "--fleet-pct", os.path.join(work_dir, "fleet_pct.json"),
        "--out", args.out,
    ]
    if fail_csv:
        cmd += ["--fail-csv", fail_csv]
    subprocess.run(cmd, check=True)
    print(f"[refresh_report] done -> {args.out}")


if __name__ == "__main__":
    main()
