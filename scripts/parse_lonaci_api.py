#!/usr/bin/env python3
"""Parse LONACI /api/results dumps (chunked markdown/JSON) into official draws."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "scripts" / "raw_api"

MONTHS_FR = {
    "janvier": 1,
    "février": 2,
    "fevrier": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "août": 8,
    "aout": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "décembre": 12,
    "decembre": 12,
}

DATE_RE = re.compile(
    r'"date"\s*:\s*"(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})/(\d{1,2})"',
    re.I,
)
DRAW_RE = re.compile(
    r'"drawName"\s*:\s*"([^"]+)"\s*,\s*"winningNumbers"\s*:\s*"([^"]+)"\s*,\s*"machineNumbers"\s*:\s*"([^"]+)"',
)

EMPTY = {".", "-", ""}


def parse_nums(s: str) -> list[int]:
    out = []
    for part in re.split(r"\s*-\s*", s.strip()):
        p = part.strip()
        if p in EMPTY:
            return []
        try:
            n = int(p)
        except ValueError:
            return []
        if n < 1 or n > 90:
            return []
        out.append(n)
    if len(out) != 5 or len(set(out)) != 5:
        return []
    return out


def resolve_iso(day: int, month: int, sel_year: int, sel_month: int) -> str:
    year = sel_year
    if sel_month == 12 and month == 1:
        year = sel_year + 1
    elif sel_month == 1 and month == 12:
        year = sel_year - 1
    elif month == sel_month + 1:
        year = sel_year
    elif month == sel_month - 1:
        year = sel_year
    return f"{year:04d}-{month:02d}-{day:02d}"


def parse_text(text: str, sel_year: int, sel_month: int) -> list[dict]:
    draws = []
    current_iso = None
    pos = 0
    tokens = []
    for m in DATE_RE.finditer(text):
        tokens.append(("date", m.start(), m))
    for m in DRAW_RE.finditer(text):
        tokens.append(("draw", m.start(), m))
    tokens.sort(key=lambda t: t[1])
    for kind, _, m in tokens:
        if kind == "date":
            current_iso = resolve_iso(int(m.group(1)), int(m.group(2)), sel_year, sel_month)
            continue
        if not current_iso:
            continue
        name = m.group(1).strip()
        if name in EMPTY:
            continue
        win = parse_nums(m.group(2))
        if not win:
            continue
        machine = parse_nums(m.group(3))
        draws.append(
            {
                "date": current_iso,
                "session": name,
                "win": win,
                "machine": machine,
            }
        )
        pos += 1
    return draws


def load_month_dir(month_dir: Path, sel_year: int, sel_month: int) -> list[dict]:
    chunks = sorted(month_dir.glob("chunk_*.txt"), key=lambda p: int(re.search(r"(\d+)", p.name).group(1)))
    text = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in chunks)
    return parse_text(text, sel_year, sel_month)


def main() -> None:
    if not RAW.exists():
        print("No raw_api dir", file=sys.stderr)
        sys.exit(1)
    all_draws = []
    for d in sorted(RAW.iterdir()):
        if not d.is_dir():
            continue
        # folder name like 2026-07
        try:
            y, m = d.name.split("-")
            sel_year, sel_month = int(y), int(m)
        except ValueError:
            print("skip", d.name)
            continue
        rows = load_month_dir(d, sel_year, sel_month)
        print(f"{d.name}: {len(rows)} draws")
        all_draws.extend(rows)
    seen = {}
    order = []
    for row in all_draws:
        key = (row["date"], row["session"])
        if key not in seen:
            order.append(key)
        seen[key] = row
    out = [seen[k] for k in order]
    out.sort(key=lambda x: (x["date"], x["session"]))
    dest = RAW / "parsed_official.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"TOTAL unique {len(out)} → {dest}")


if __name__ == "__main__":
    main()
