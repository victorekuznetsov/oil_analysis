#!/usr/bin/env python3
"""
Merge raw lab-sample workbooks ("Свод_анализов_масла*.xlsm") into the CSV
format expected by automation/report_engine.js (_parseCSV / _buildDB), and
derive fresh reference tables (per model|node mean/std/p90 norms, fleet-wide
P90/P95) instead of relying on the stale constants baked into the manually
built dashboard_final.html.

Usage:
    python3 export_oil_data.py <oil.xlsm> [<oil2.xlsm> ...] --out-dir DIR

Outputs into --out-dir:
    oil_samples.csv   - one row per lab sample, headers = original Excel headers
    norms.csv         - per (Модель узла|Узел) mean/std/p90 reference table
    fleet_pct.json    - {"p90": {...}, "p95": {...}} fleet-wide percentiles
"""
import argparse
import json
import sys

import numpy as np
import pandas as pd

# Fleet-wide P90/P95 fallback constants (mirrors FLEET_P90/FLEET_P95 in the
# dashboard template).
FLEET_METRICS = [
    "V100", "V40", "TAN", "Si", "OXI", "Fe", "TBN", "Al", "Pb", "Na", "Cu",
    "Cr", "Ni", "Sn", "K", "Ca", "Zn", "P", "B",
]


def load_workbook_sheet(path: str) -> pd.DataFrame:
    """Load the 'Анализы' sheet, auto-detecting whether row 1 or row 2 is
    the real header row (some incremental exports skip the grouping row)."""
    probe = pd.read_excel(path, sheet_name="Анализы", header=0, engine="openpyxl", nrows=1)
    if "УО" in probe.columns:
        header_row = 0
    else:
        header_row = 1
    df = pd.read_excel(path, sheet_name="Анализы", header=header_row, engine="openpyxl")
    df = df.dropna(axis=1, how="all")
    df = df.loc[:, ~df.columns.astype(str).str.startswith("Unnamed")]
    return df


def merge_sources(paths):
    frames = [load_workbook_sheet(p) for p in paths]
    all_cols = set()
    for f in frames:
        all_cols |= set(f.columns)
    frames = [f.reindex(columns=sorted(all_cols)) for f in frames]
    merged = pd.concat(frames, ignore_index=True)
    merged = merged.drop_duplicates()
    # The dashboard's CSV_COL_MAP expects header text as it comes out of an
    # Excel "Save As CSV" export, which flattens Alt+Enter line breaks in
    # cell text to a single space (e.g. "V100),\ncSt" -> "V100), cSt").
    # openpyxl preserves the raw embedded newline, so normalize it here -
    # otherwise the dashboard's naive line-based CSV parser misreads the
    # header row entirely and every sample collapses into one bucket.
    merged.columns = [str(c).replace("\r\n", " ").replace("\n", " ") for c in merged.columns]
    return merged


def percentile(series: pd.Series, q: float):
    vals = pd.to_numeric(series, errors="coerce").dropna()
    if not len(vals):
        return None
    return round(float(np.percentile(vals, q)), 3)


def mean_std(series: pd.Series):
    vals = pd.to_numeric(series, errors="coerce").dropna()
    if not len(vals):
        return None, None
    return round(float(vals.mean()), 3), round(float(vals.std(ddof=0)), 3)


def build_norms(df: pd.DataFrame) -> str:
    model_col = "Модель узла"
    node_col = "Узел"
    grp_key = df[model_col].fillna("").astype(str) + "|" + df[node_col].fillna("").astype(str)

    header = ["Модель узла", "Узел", "НормаКлюч", "Кол_проб",
              "Fe_mean", "Fe_std", "Fe_p90", "Cu_mean", "Cu_std", "Cu_p90",
              "Cr_p90", "Al_p90", "Ni_p90", "Pb_p90", "Si_p90", "Na_p90",
              "OXI_p90", "NIT_p90", "TAN_p90", "TBN_p10", "W_p75"]
    rows = [",".join(header)]

    for key, idx in grp_key.groupby(grp_key).groups.items():
        sub = df.loc[idx]
        model = str(sub[model_col].iloc[0]) if pd.notna(sub[model_col].iloc[0]) else ""
        node = str(sub[node_col].iloc[0]) if pd.notna(sub[node_col].iloc[0]) else ""
        fe_mean, fe_std = mean_std(sub.get("Fe", pd.Series(dtype=float)))
        cu_mean, cu_std = mean_std(sub.get("Cu", pd.Series(dtype=float)))
        vals = {
            "Модель узла": model, "Узел": node, "НормаКлюч": key,
            "Кол_проб": len(sub),
            "Fe_mean": fe_mean, "Fe_std": fe_std, "Fe_p90": percentile(sub.get("Fe", pd.Series(dtype=float)), 90),
            "Cu_mean": cu_mean, "Cu_std": cu_std, "Cu_p90": percentile(sub.get("Cu", pd.Series(dtype=float)), 90),
            "Cr_p90": percentile(sub.get("Cr", pd.Series(dtype=float)), 90),
            "Al_p90": percentile(sub.get("Al", pd.Series(dtype=float)), 90),
            "Ni_p90": percentile(sub.get("Ni", pd.Series(dtype=float)), 90),
            "Pb_p90": percentile(sub.get("Pb", pd.Series(dtype=float)), 90),
            "Si_p90": percentile(sub.get("Si", pd.Series(dtype=float)), 90),
            "Na_p90": percentile(sub.get("Na", pd.Series(dtype=float)), 90),
            "OXI_p90": percentile(sub.get("Окисление (OXI), А/0,1мм", pd.Series(dtype=float)), 90),
            "NIT_p90": percentile(sub.get("Нитрование (NIT), А/0,1мм", pd.Series(dtype=float)), 90),
            "TAN_p90": percentile(sub.get("Кислотное число (TAN), мгКОН/см3", pd.Series(dtype=float)), 90),
            "TBN_p10": percentile(sub.get("Щелочное число (TBN), мгКОН/см3", pd.Series(dtype=float)), 10),
            "W_p75": percentile(sub.get("Содержание воды (W), %", pd.Series(dtype=float)), 75),
        }
        rows.append(",".join("" if vals[h] is None else str(vals[h]) for h in header))
    return "\n".join(rows) + "\n"


def build_fleet_pct(df: pd.DataFrame) -> dict:
    colmap = {
        "V100": "Вязкость при 100°С (V100), cSt (сантистокс)",
        "V40": "Вязкость при 40°С (V40), cSt (сантистокс)",
        "TAN": "Кислотное число (TAN), мгКОН/см3",
        "TBN": "Щелочное число (TBN), мгКОН/см3",
        "OXI": "Окисление (OXI), А/0,1мм",
    }
    p90, p95 = {}, {}
    for metric in FLEET_METRICS:
        col = colmap.get(metric, metric)
        if col not in df.columns:
            continue
        v90 = percentile(df[col], 90)
        v95 = percentile(df[col], 95)
        if v90 is not None:
            p90[metric] = v90
        if v95 is not None:
            p95[metric] = v95
    return {"p90": p90, "p95": p95}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("sources", nargs="+", help="Свод_анализов_масла*.xlsm files to merge")
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()

    import os
    os.makedirs(args.out_dir, exist_ok=True)

    df = merge_sources(args.sources)
    print(f"merged rows: {len(df)}", file=sys.stderr)

    date_col = "Дата отбора пробы"
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce").dt.strftime("%Y-%m-%d")

    # The dashboard's CSV parser splits the whole file on '\n' first and
    # parses each line independently - it does not understand a quoted CSV
    # field that spans multiple physical lines. Free-text cells (Заключение,
    # Описание несоответствия, Примечание) sometimes contain a hard line
    # break in Excel; flatten those to a space so one Excel row always
    # becomes exactly one CSV line.
    def _flatten(v):
        return v.replace("\r\n", " ").replace("\n", " ") if isinstance(v, str) else v
    for col in df.select_dtypes(include=["object", "str"]).columns:
        df[col] = df[col].map(_flatten)

    csv_path = f"{args.out_dir}/oil_samples.csv"
    df.to_csv(csv_path, index=False, encoding="utf-8")
    print(f"wrote {csv_path}", file=sys.stderr)

    norms_csv = build_norms(df)
    with open(f"{args.out_dir}/norms.csv", "w", encoding="utf-8") as f:
        f.write(norms_csv)
    print(f"wrote {args.out_dir}/norms.csv", file=sys.stderr)

    fleet_pct = build_fleet_pct(df)
    with open(f"{args.out_dir}/fleet_pct.json", "w", encoding="utf-8") as f:
        json.dump(fleet_pct, f, ensure_ascii=False, indent=2)
    print(f"wrote {args.out_dir}/fleet_pct.json", file=sys.stderr)


if __name__ == "__main__":
    main()
