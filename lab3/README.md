# Lab 3 — Daily U.S. Public Debt

This lab programmatically acquires daily U.S. public-debt records from the U.S. Treasury Fiscal Data API and publishes the resulting dataset as an interactive D3 study.

## Dataset

- **Source:** [U.S. Treasury Debt to the Penny](https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/)
- **Method:** REST API returning JSON
- **Coverage:** January 2, 2015 through the latest observation available when the script is run
- **Current observations:** 2,928
- **Output:** `data/us_public_debt_2015_present.csv`

Each observation includes a unique record ID, reporting date, fiscal year and quarter, debt held by the public, intragovernmental holdings, total public debt, daily change, public share, and a component-reconciliation difference.

## Reproduce the acquisition

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python acquire_debt_data.py
```

The acquisition script requests 100 records per page, follows the API-reported page count, sleeps one second between pages, retries temporary failures with exponential backoff, validates HTTP and JSON responses, checks record completeness and uniqueness, and verifies that the final count matches the API metadata before writing the CSV.

The Treasury source currently contains one component-reconciliation exception on August 4, 2025. The script preserves all official values and records the $10 billion difference in `component_difference_usd` rather than silently changing the source.

## Run the webpage locally

From the repository root:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/lab3/`.

The page includes a responsive D3 time-series chart, dataset description and provenance, dynamically calculated summary statistics, a searchable paginated table, and type-aware ascending/descending sorting for every column.
