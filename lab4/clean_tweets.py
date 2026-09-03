#!/usr/bin/env python3
"""Clean ChatGPT tweets, derive topics, score sentiment, and export D3 data.

The script deliberately keeps two text paths:
1. aggressive normalization for TF-IDF; and
2. light social-media normalization for Twitter-RoBERTa sentiment.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from pathlib import Path

import nltk
import pandas as pd
import torch
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize
from sklearn.feature_extraction.text import TfidfVectorizer
from transformers import pipeline


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
RAW_PATH = DATA_DIR / "lab4_raw_tweets.csv"
CLEAN_PATH = DATA_DIR / "lab4_clean_tweets.csv"
AGGREGATE_PATH = DATA_DIR / "sentiment_by_topic.csv"
SUMMARY_PATH = DATA_DIR / "topic_summary.csv"
TERMS_PATH = DATA_DIR / "tfidf_terms_by_topic.csv"
REPORT_PATH = DATA_DIR / "cleaning_report.json"

SOURCE_URL = "https://www.kaggle.com/datasets/tariqsays/chatgpt-twitter-dataset"
MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"
MODEL_REVISION = "3216a57f2a0d9c45a2e6c20157c20c49fb4bf9c7"

# Categories are observable keyword groups, not manually verified topic labels.
# A tweet is retained only when it matches exactly one group.
TOPIC_PATTERNS = {
    "Coding": re.compile(
        r"\b(code|coding|programming|programmer|programmers|developer|developers|"
        r"software|github|stack\s*overflow|debug|debugging|api|python|javascript)\b",
        re.IGNORECASE,
    ),
    "Education": re.compile(
        r"\b(student|students|teacher|teachers|school|schools|education|educational|"
        r"university|universities|college|colleges|homework|essay|essays|classroom|"
        r"learning|learn|tutor|tutoring|teaching)\b",
        re.IGNORECASE,
    ),
    "Work": re.compile(
        r"\b(job|jobs|work|workplace|worker|workers|career|careers|employee|employees|"
        r"employment|hire|hiring|resume|résumé|productivity|office)\b",
        re.IGNORECASE,
    ),
    "Reliability": re.compile(
        r"\b(hallucination|hallucinations|hallucinate|wrong|incorrect|error|errors|"
        r"fail|fails|failed|failure|bias|biased|unsafe|risk|risks|risky|misinformation|"
        r"disinformation|fake|privacy|security|inaccurate|accuracy|reliable|reliability|"
        r"trust|trustworthy|truth|factual|fact|facts|credible|bug|bugs|issue|issues|"
        r"concern|concerns|concerned|harmful|safety)\b",
        re.IGNORECASE,
    ),
}

COLUMN_MAP = {
    "Datetime": "created_at",
    "Tweet Id": "tweet_id",
    "Text": "tweet_text",
    "Username": "username",
    "ReplyCount": "reply_count",
    "RetweetCount": "retweet_count",
    "LikeCount": "like_count",
    "QuoteCount": "quote_count",
    "Language": "language",
    "Source": "source",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=RAW_PATH)
    parser.add_argument("--output", type=Path, default=CLEAN_PATH)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument(
        "--reuse-sentiment",
        action="store_true",
        help="Reuse sentiment columns when the existing output has the same tweet IDs.",
    )
    return parser.parse_args()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_source(value: object) -> str:
    text = html.unescape(str(value)).strip()
    match = re.search(r">([^<]+)</a>", text, flags=re.IGNORECASE)
    return match.group(1).strip() if match else text


def assign_topic(text: str) -> str | None:
    matches = [topic for topic, pattern in TOPIC_PATTERNS.items() if pattern.search(text)]
    return matches[0] if len(matches) == 1 else None


def normalize_for_tfidf(text: str) -> str:
    text = text.lower()
    text = re.sub(r"https?://\S+|www\.\S+", " URL ", text)
    text = re.sub(r"@\w+", " USER ", text)
    text = re.sub(r"\b\d+(?:\.\d+)?\b", " NUMBER ", text)
    return re.sub(r"\s+", " ", text).strip()


def prepare_for_roberta(text: str) -> str:
    text = re.sub(r"@\w+", "@user", str(text))
    text = re.sub(r"https?://\S+|www\.\S+", "http", text)
    return text.strip()


def ensure_nltk_resources() -> None:
    resources = {
        "tokenizers/punkt": "punkt",
        "tokenizers/punkt_tab": "punkt_tab",
        "corpora/stopwords": "stopwords",
        "corpora/wordnet": "wordnet",
        "corpora/omw-1.4": "omw-1.4",
    }
    for locator, package in resources.items():
        try:
            nltk.data.find(locator)
        except LookupError:
            nltk.download(package, quiet=True)


def preprocess_for_tfidf(series: pd.Series) -> pd.Series:
    ensure_nltk_resources()
    stop_words = set(stopwords.words("english"))
    stop_words.update({"url", "user", "number", "chatgpt", "amp"})
    lemmatizer = WordNetLemmatizer()

    def preprocess(text: str) -> str:
        tokens = word_tokenize(normalize_for_tfidf(text))
        cleaned = [
            lemmatizer.lemmatize(token.lower())
            for token in tokens
            if token.isalpha() and token.lower() not in stop_words
        ]
        return " ".join(cleaned)

    return series.apply(preprocess)


def clean_structured_data(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    missing_columns = [column for column in COLUMN_MAP if column not in raw.columns]
    if missing_columns:
        raise ValueError(f"Raw data is missing required columns: {missing_columns}")

    df = raw[list(COLUMN_MAP)].rename(columns=COLUMN_MAP).copy()
    audit: dict[str, int] = {"raw_rows": len(df)}
    audit["raw_missing_text"] = int(df["tweet_text"].isna().sum())
    audit["raw_duplicate_tweet_ids"] = int(df.duplicated("tweet_id").sum())
    audit["raw_exact_duplicate_rows"] = int(df.duplicated().sum())

    df["tweet_id"] = df["tweet_id"].astype("string").str.strip()
    df["tweet_text_raw"] = (
        df["tweet_text"].astype("string").str.replace(r"\s+", " ", regex=True).str.strip()
    )
    df["username"] = (
        df["username"].astype("string").str.strip().str.replace(r"^@", "", regex=True).str.lower()
    )
    df["language"] = df["language"].astype("string").str.strip().str.lower()
    df["source"] = df["source"].fillna("Unknown").apply(clean_source)
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce", utc=True)

    numeric_columns = ["reply_count", "retweet_count", "like_count", "quote_count"]
    for column in numeric_columns:
        cleaned = df[column].astype("string").str.replace(",", "", regex=False)
        df[column] = pd.to_numeric(cleaned, errors="coerce")
        df.loc[df[column] < 0, column] = pd.NA
        df[column] = df[column].fillna(0).astype("int64")

    before = len(df)
    df = df.dropna(subset=["tweet_id", "tweet_text_raw", "created_at"])
    df = df[df["tweet_text_raw"].str.len() > 0]
    audit["removed_missing_critical_fields"] = before - len(df)

    before = len(df)
    df = df.drop_duplicates(subset=["tweet_id"], keep="first")
    audit["removed_duplicate_tweet_ids"] = before - len(df)

    before = len(df)
    df = df[df["language"].eq("en")]
    audit["removed_non_english"] = before - len(df)

    # Repeated bodies would otherwise overweight copied or syndicated content.
    df["text_dedup_key"] = df["tweet_text_raw"].str.casefold()
    before = len(df)
    df = df.drop_duplicates(subset=["text_dedup_key"], keep="first")
    audit["removed_duplicate_text"] = before - len(df)

    df["topic"] = df["tweet_text_raw"].apply(assign_topic).astype("string")
    before = len(df)
    df = df.dropna(subset=["topic"])
    audit["removed_unclassified_or_ambiguous_topic"] = before - len(df)
    audit["clean_rows_before_sentiment"] = len(df)

    if len(df) < 1000:
        raise ValueError(f"Only {len(df)} clean topic-assigned tweets remain; at least 1,000 are required.")

    df["date"] = df["created_at"].dt.strftime("%Y-%m-%d")
    df["created_at"] = df["created_at"].dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    df["engagement_total"] = df[numeric_columns].sum(axis=1)
    df["text_clean"] = preprocess_for_tfidf(df["tweet_text_raw"])
    df["sentiment_text"] = df["tweet_text_raw"].apply(prepare_for_roberta)

    return df.reset_index(drop=True), audit


def choose_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def extract_score_dict(scores: list[dict[str, object]]) -> dict[str, float]:
    legacy_labels = {"label_0": "negative", "label_1": "neutral", "label_2": "positive"}
    converted: dict[str, float] = {}
    for item in scores:
        label = str(item["label"]).lower()
        converted[legacy_labels.get(label, label)] = float(item["score"])
    return converted


def score_sentiment(df: pd.DataFrame, batch_size: int) -> tuple[pd.DataFrame, str]:
    device = choose_device()
    print(f"Scoring {len(df):,} tweets with {MODEL_NAME} on {device}...")
    sentiment_model = pipeline(
        "sentiment-analysis",
        model=MODEL_NAME,
        tokenizer=MODEL_NAME,
        revision=MODEL_REVISION,
        top_k=None,
        device=device,
    )
    results = sentiment_model(
        df["sentiment_text"].tolist(),
        truncation=True,
        max_length=512,
        batch_size=batch_size,
    )
    score_dicts = [extract_score_dict(scores) for scores in results]
    for label in ("negative", "neutral", "positive"):
        df[f"sentiment_{label}"] = [scores.get(label, 0.0) for scores in score_dicts]

    probability_columns = ["sentiment_negative", "sentiment_neutral", "sentiment_positive"]
    df["sentiment"] = (
        df[probability_columns]
        .idxmax(axis=1)
        .str.replace("sentiment_", "", regex=False)
        .str.capitalize()
    )
    df["model_confidence"] = df[probability_columns].max(axis=1)
    df["sentiment_score"] = df["sentiment_positive"] - df["sentiment_negative"]
    return df, device


def reuse_existing_sentiment(df: pd.DataFrame, output: Path) -> pd.DataFrame | None:
    if not output.exists():
        return None
    existing = pd.read_csv(output, dtype={"tweet_id": "string"})
    sentiment_columns = [
        "tweet_id",
        "sentiment_negative",
        "sentiment_neutral",
        "sentiment_positive",
        "sentiment",
        "model_confidence",
        "sentiment_score",
    ]
    if not set(sentiment_columns).issubset(existing.columns):
        return None
    if set(existing["tweet_id"]) != set(df["tweet_id"]):
        return None
    return df.merge(existing[sentiment_columns], on="tweet_id", how="left", validate="one_to_one")


def export_tfidf_terms(df: pd.DataFrame) -> int:
    vectorizer = TfidfVectorizer(min_df=5, max_df=0.90, lowercase=True, sublinear_tf=True)
    matrix = vectorizer.fit_transform(df["text_clean"].fillna(""))
    terms = vectorizer.get_feature_names_out()
    records: list[dict[str, object]] = []
    for topic in TOPIC_PATTERNS:
        mask = (df["topic"] == topic).to_numpy()
        mean_scores = matrix[mask].mean(axis=0).A1
        top_indices = mean_scores.argsort()[::-1][:12]
        for rank, index in enumerate(top_indices, start=1):
            records.append(
                {
                    "topic": topic,
                    "rank": rank,
                    "term": terms[index],
                    "mean_tfidf": round(float(mean_scores[index]), 6),
                }
            )
    pd.DataFrame(records).to_csv(TERMS_PATH, index=False)
    return len(terms)


def export_aggregates(df: pd.DataFrame) -> None:
    df = df.assign(received_interaction=df["engagement_total"].gt(0))
    aggregate = (
        df.groupby(["topic", "sentiment"], observed=True)
        .agg(
            count=("tweet_id", "size"),
            mean_sentiment_score=("sentiment_score", "mean"),
            interaction_rate=("received_interaction", "mean"),
            median_engagement=("engagement_total", "median"),
            p75_engagement=("engagement_total", lambda values: values.quantile(0.75)),
            mean_engagement=("engagement_total", "mean"),
            mean_likes=("like_count", "mean"),
            mean_retweets=("retweet_count", "mean"),
        )
        .reset_index()
    )
    aggregate["topic_total"] = aggregate.groupby("topic")["count"].transform("sum")
    aggregate["share"] = aggregate["count"] / aggregate["topic_total"]
    aggregate.to_csv(AGGREGATE_PATH, index=False, float_format="%.6f")

    topic_summary = (
        df.groupby("topic", observed=True)
        .agg(
            tweet_count=("tweet_id", "size"),
            mean_sentiment_score=("sentiment_score", "mean"),
            interaction_rate=("received_interaction", "mean"),
            median_engagement=("engagement_total", "median"),
            mean_engagement=("engagement_total", "mean"),
        )
        .reset_index()
    )
    shares = pd.crosstab(df["topic"], df["sentiment"], normalize="index")
    shares = shares.rename(columns=lambda value: f"share_{str(value).lower()}").reset_index()
    topic_summary.merge(shares, on="topic", how="left").to_csv(
        SUMMARY_PATH, index=False, float_format="%.6f"
    )


def main() -> None:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    raw = pd.read_csv(args.raw, dtype={"Tweet Id": "string"}, low_memory=False)
    df, audit = clean_structured_data(raw)

    device = "reused"
    scored = reuse_existing_sentiment(df, args.output) if args.reuse_sentiment else None
    if scored is None:
        scored, device = score_sentiment(df, args.batch_size)

    numeric_probabilities = [
        "sentiment_negative",
        "sentiment_neutral",
        "sentiment_positive",
        "model_confidence",
        "sentiment_score",
    ]
    scored[numeric_probabilities] = scored[numeric_probabilities].round(6)
    output_columns = [
        "tweet_id",
        "created_at",
        "date",
        "username",
        "language",
        "source",
        "topic",
        "tweet_text_raw",
        "text_clean",
        "reply_count",
        "retweet_count",
        "like_count",
        "quote_count",
        "engagement_total",
        "sentiment_negative",
        "sentiment_neutral",
        "sentiment_positive",
        "model_confidence",
        "sentiment_score",
        "sentiment",
    ]
    scored[output_columns].to_csv(args.output, index=False)
    export_aggregates(scored)
    vocabulary_size = export_tfidf_terms(scored)

    report = {
        "source": SOURCE_URL,
        "license": "CC0: Public Domain",
        "raw_file": args.raw.name,
        "raw_sha256": file_sha256(args.raw),
        "output_file": args.output.name,
        "sentiment_model": MODEL_NAME,
        "sentiment_model_revision": MODEL_REVISION,
        "sentiment_device_for_this_run": device,
        "sentiment_score_definition": "P(positive) - P(negative)",
        "topic_assignment": "Retain English tweets matching exactly one documented keyword group.",
        "topic_keywords": {topic: pattern.pattern for topic, pattern in TOPIC_PATTERNS.items()},
        "tfidf": {"min_df": 5, "max_df": 0.90, "vocabulary_size": vocabulary_size},
        "counts": audit,
        "final_topic_counts": scored["topic"].value_counts().sort_index().to_dict(),
        "final_sentiment_counts": scored["sentiment"].value_counts().sort_index().to_dict(),
        "missing_values_in_output": scored[output_columns].isna().sum().to_dict(),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    probability_sums = scored[
        ["sentiment_negative", "sentiment_neutral", "sentiment_positive"]
    ].sum(axis=1)
    if not probability_sums.between(0.999, 1.001).all():
        raise ValueError("Sentiment probabilities do not sum to approximately one.")
    if not scored["sentiment_score"].between(-1, 1).all():
        raise ValueError("Sentiment scores fall outside [-1, 1].")

    print(json.dumps(report["counts"], indent=2))
    print("Topic counts:", report["final_topic_counts"])
    print("Sentiment counts:", report["final_sentiment_counts"])
    print(f"Wrote {len(scored):,} clean tweets to {args.output}")


if __name__ == "__main__":
    main()
