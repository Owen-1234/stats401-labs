"""Convert the course-provided flat GDP CSV into hierarchical JSON."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = PROJECT_ROOT / "data" / "lab6_assignment_gdp.csv"
OUTPUT_PATH = PROJECT_ROOT / "data" / "lab6_assignment_gdp.json"
LEVELS = ("continent", "area", "country")
VALID_STATUSES = {"Increase", "Unchanged", "Decrease"}


def build_hierarchy(rows: list[dict[str, Any]], levels: tuple[str, ...]) -> list[dict[str, Any]]:
    """Recursively group rows by each hierarchy level."""
    current_level = levels[0]

    if len(levels) == 1:
        return [
            {
                "name": row[current_level],
                "gdp": row["gdp_billion_usd"],
                "status": row["gdp_status"],
            }
            for row in rows
        ]

    grouped_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped_rows[row[current_level]].append(row)

    return [
        {
            "name": group_name,
            "children": build_hierarchy(group, levels[1:]),
        }
        for group_name, group in grouped_rows.items()
    ]


def read_rows(path: Path) -> list[dict[str, Any]]:
    """Read and validate the assignment CSV."""
    with path.open(encoding="utf-8", newline="") as source:
        reader = csv.DictReader(source)
        required_columns = {*LEVELS, "gdp_billion_usd", "gdp_status"}
        if not required_columns.issubset(reader.fieldnames or []):
            raise ValueError("The assignment CSV is missing required columns.")

        rows = []
        for line_number, row in enumerate(reader, start=2):
            try:
                gdp = int(row["gdp_billion_usd"])
            except (TypeError, ValueError) as error:
                raise ValueError(f"Invalid GDP value on CSV line {line_number}.") from error

            if gdp <= 0 or row["gdp_status"] not in VALID_STATUSES:
                raise ValueError(f"Invalid assignment value on CSV line {line_number}.")

            rows.append({**row, "gdp_billion_usd": gdp})

    if not rows:
        raise ValueError("The assignment CSV contains no data rows.")
    return rows


def main() -> None:
    rows = read_rows(INPUT_PATH)
    hierarchy = {
        "name": "World",
        "children": build_hierarchy(rows, LEVELS),
    }

    with OUTPUT_PATH.open("w", encoding="utf-8") as destination:
        json.dump(hierarchy, destination, indent=2, ensure_ascii=False)
        destination.write("\n")

    print(f"Wrote {OUTPUT_PATH} from {len(rows)} countries.")


if __name__ == "__main__":
    main()
