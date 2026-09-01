"""Acquire daily U.S. public-debt records from the Treasury Fiscal Data API.

The script requests every observation from 2015-01-01 through the most recent
available date, validates the result, derives analysis-ready measures, and
writes the CSV used by the Lab 3 webpage.
"""

from __future__ import annotations

import time
from pathlib import Path

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from requests.exceptions import JSONDecodeError
from urllib3.util.retry import Retry


API_URL = (
    "https://api.fiscaldata.treasury.gov/services/api/"
    "fiscal_service/v2/accounting/od/debt_to_penny"
)
START_DATE = "2015-01-01"
PAGE_SIZE = 100
REQUEST_DELAY_SECONDS = 1
TIMEOUT_SECONDS = 30
OUTPUT_PATH = Path(__file__).resolve().parent / "data" / "us_public_debt_2015_present.csv"

SOURCE_FIELDS = [
    "record_date",
    "debt_held_public_amt",
    "intragov_hold_amt",
    "tot_pub_debt_out_amt",
    "record_fiscal_year",
    "record_fiscal_quarter",
]


def build_session() -> requests.Session:
    """Create a polite HTTP session with automatic retry/backoff."""
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "STATS401-Lab3/1.0 "
                "(academic project; https://github.com/Owen-1234/stats401-labs)"
            )
        }
    )
    session.mount("https://", adapter)
    return session


def request_page(session: requests.Session, page_number: int) -> dict:
    """Request and validate one page of Treasury records."""
    params = {
        "fields": ",".join(SOURCE_FIELDS),
        "filter": f"record_date:gte:{START_DATE}",
        "sort": "record_date",
        "page[number]": page_number,
        "page[size]": PAGE_SIZE,
    }

    try:
        response = session.get(API_URL, params=params, timeout=TIMEOUT_SECONDS)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as error:
        raise RuntimeError(f"Treasury request failed on page {page_number}: {error}") from error
    except JSONDecodeError as error:
        raise RuntimeError(f"Treasury returned invalid JSON on page {page_number}") from error

    if "data" not in payload or "meta" not in payload:
        raise RuntimeError(f"Unexpected Treasury response structure on page {page_number}")

    return payload


def acquire_records() -> list[dict]:
    """Follow API pagination until every record in the date range is acquired."""
    records: list[dict] = []
    page_number = 1
    expected_total: int | None = None

    with build_session() as session:
        while True:
            payload = request_page(session, page_number)
            page_records = payload["data"]
            meta = payload["meta"]

            if expected_total is None:
                expected_total = int(meta["total-count"])
                print(
                    f"Treasury reports {expected_total:,} records from "
                    f"{START_DATE} through the latest available date."
                )

            records.extend(page_records)
            total_pages = int(meta["total-pages"])
            print(
                f"Downloaded page {page_number:,}/{total_pages:,} "
                f"({len(records):,}/{expected_total:,} records)"
            )

            if page_number >= total_pages:
                break

            page_number += 1
            time.sleep(REQUEST_DELAY_SECONDS)

    if expected_total is None or len(records) != expected_total:
        raise RuntimeError(
            f"Incomplete acquisition: received {len(records):,} records; "
            f"expected {expected_total}."
        )

    return records


def prepare_dataset(records: list[dict]) -> pd.DataFrame:
    """Clean, validate, and enrich raw Treasury observations."""
    df = pd.DataFrame.from_records(records)
    df["record_date"] = pd.to_datetime(df["record_date"], errors="raise")

    numeric_columns = [
        "debt_held_public_amt",
        "intragov_hold_amt",
        "tot_pub_debt_out_amt",
        "record_fiscal_year",
        "record_fiscal_quarter",
    ]
    for column in numeric_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df.sort_values("record_date").drop_duplicates(subset="record_date", keep="last")

    required_columns = [
        "record_date",
        "debt_held_public_amt",
        "intragov_hold_amt",
        "tot_pub_debt_out_amt",
        "record_fiscal_year",
        "record_fiscal_quarter",
    ]
    missing_counts = df[required_columns].isna().sum()
    if missing_counts.any():
        details = ", ".join(
            f"{column}={count}" for column, count in missing_counts.items() if count
        )
        raise ValueError(f"Missing required values after cleaning: {details}")

    if not 2_000 <= len(df) <= 3_000:
        raise ValueError(
            f"Expected 2,000–3,000 observations for this assignment; found {len(df):,}."
        )

    composition_total = df["debt_held_public_amt"] + df["intragov_hold_amt"]
    df["component_difference_usd"] = composition_total - df["tot_pub_debt_out_amt"]
    reconciliation_exceptions = df["component_difference_usd"].abs() > 0.02
    if reconciliation_exceptions.any():
        exception_dates = df.loc[reconciliation_exceptions, "record_date"].dt.strftime(
            "%Y-%m-%d"
        )
        print(
            "Source-data note: debt components do not reconcile with the reported "
            f"total on {reconciliation_exceptions.sum()} date(s): "
            f"{', '.join(exception_dates)}. Original Treasury values are preserved."
        )

    df["record_id"] = "DTP-" + df["record_date"].dt.strftime("%Y%m%d")
    df["daily_change_usd"] = df["tot_pub_debt_out_amt"].diff()
    df["public_share_pct"] = (
        100 * df["debt_held_public_amt"] / df["tot_pub_debt_out_amt"]
    )

    df = df.rename(
        columns={
            "record_fiscal_year": "fiscal_year",
            "record_fiscal_quarter": "fiscal_quarter",
            "debt_held_public_amt": "debt_held_public_usd",
            "intragov_hold_amt": "intragovernmental_holdings_usd",
            "tot_pub_debt_out_amt": "total_public_debt_usd",
        }
    )

    df["record_date"] = df["record_date"].dt.strftime("%Y-%m-%d")
    df["fiscal_year"] = df["fiscal_year"].astype(int)
    df["fiscal_quarter"] = df["fiscal_quarter"].astype(int)

    output_columns = [
        "record_id",
        "record_date",
        "fiscal_year",
        "fiscal_quarter",
        "debt_held_public_usd",
        "intragovernmental_holdings_usd",
        "total_public_debt_usd",
        "daily_change_usd",
        "public_share_pct",
        "component_difference_usd",
    ]
    return df[output_columns]


def main() -> None:
    records = acquire_records()
    dataset = prepare_dataset(records)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    dataset.to_csv(OUTPUT_PATH, index=False, float_format="%.2f")

    print("\nValidation complete")
    print(f"Rows: {len(dataset):,}")
    print(f"Columns: {len(dataset.columns)}")
    print(f"Date range: {dataset['record_date'].iloc[0]} to {dataset['record_date'].iloc[-1]}")
    print(f"Duplicate dates: {dataset['record_date'].duplicated().sum()}")
    print(f"Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
