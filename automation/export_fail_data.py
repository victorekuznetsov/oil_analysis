#!/usr/bin/env python3
"""
Convert a "Сводный анализ ПК/NTE.xlsx" failure/repair log (sheet "Сводные
данные") into the CSV format expected by report_engine.js
(_parseFailCSV / _buildFailData): columns Дата отказа, Гар#, Узел, Система,
Воздействие, Описание неисправности.

Usage:
    python3 export_fail_data.py <failures.xlsx> --out oil_failures.csv
"""
import argparse

import pandas as pd


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("source", help="Сводный анализ ПК.xlsx / NTE.xlsx")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    df = pd.read_excel(args.source, sheet_name="Сводные данные", header=0, engine="openpyxl")
    df["Дата отказа"] = pd.to_datetime(df["Дата отказа"], errors="coerce", dayfirst=True).dt.strftime("%Y-%m-%d")

    keep = ["Дата отказа", "Гар#", "Узел", "Система", "Воздействие", "Описание неисправности"]
    df = df[[c for c in keep if c in df.columns]]
    df.to_csv(args.out, index=False, encoding="utf-8")
    print(f"wrote {args.out}: {len(df)} rows")


if __name__ == "__main__":
    main()
