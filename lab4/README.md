# Lab 4 — ChatGPT Conversations

This lab cleans 50,001 public tweets about ChatGPT, assigns English tweets to four transparent keyword-defined topics, estimates sentiment with a Twitter-RoBERTa model, and publishes a coordinated D3 visualization of sentiment composition and interaction rates.

## Live page

<https://owen-1234.github.io/stats401-labs/lab4/>

## Data source and license

- Source: [ChatGPT Twitter Dataset](https://www.kaggle.com/datasets/tariqsays/chatgpt-twitter-dataset)
- Original file: `data/lab4_raw_tweets.csv`
- Raw observations: 50,001
- Collection window: January 22–24, 2023
- License: CC0: Public Domain
- Raw SHA-256: `76bb101b501840966a90a632a3c5d7aa14018d2eff454224cdfeb7fd6c15b2d9`

The raw CSV is retained because its stated license permits redistribution. The source includes tweet text, timestamps, language, posting source, and reply, repost, like, and quote counts.

## Reproduce the pipeline

From the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r lab4/requirements.txt
python lab4/clean_tweets.py
```

The first run downloads NLTK resources and `cardiffnlp/twitter-roberta-base-sentiment-latest` at pinned revision `3216a57f2a0d9c45a2e6c20157c20c49fb4bf9c7`. CUDA and Apple MPS are used automatically when available; otherwise inference runs on CPU. After the model has been run once, `python lab4/clean_tweets.py --reuse-sentiment` repeats cleaning, TF-IDF, validation, and aggregation while reusing sentiment scores only when the tweet IDs match exactly.

## Cleaning decisions

1. Rename required columns and preserve tweet IDs as strings.
2. Collapse malformed whitespace; trim and lowercase usernames and language codes.
3. Parse timestamps as UTC with invalid values coerced to missing.
4. Parse replies, reposts, likes, and quotes as non-negative integers; invalid or missing counts become zero.
5. Remove missing critical fields and duplicate tweet IDs.
6. Retain English tweets because the assigned RoBERTa model is designed for English social-media text.
7. Remove repeated case-insensitive tweet bodies so copied content is not overweighted.
8. Retain a tweet only when it matches exactly one of the four topic dictionaries. No-match and multi-topic tweets are excluded rather than assigned arbitrarily.

The final tidy dataset contains 7,076 tweets: Coding 1,348; Education 2,618; Work 1,702; and Reliability 1,408. The machine-readable audit is in `data/cleaning_report.json`.

## Two text-analysis paths

For TF-IDF, URLs, users, and numbers are normalized; text is tokenized; English stop words are removed; alphabetic tokens are lemmatized; and a vocabulary is pruned with `min_df=5` and `max_df=0.90`. The resulting vocabulary contains 2,599 terms, with the twelve highest mean TF-IDF terms per topic in `data/tfidf_terms_by_topic.csv`.

For sentiment, the script starts from the whitespace-cleaned original tweet. It replaces usernames with `@user` and URLs with `http` while preserving punctuation, emoji, capitalization, and negation. For every tweet it stores negative, neutral, and positive probabilities, the highest-probability label, model confidence, and:

```text
sentiment_score = P(positive) - P(negative)
```

These values are model-generated estimates, not ground-truth labels. Sarcasm, slang, ambiguous wording, and domain-specific language can produce errors.

## Visualization

`lab4.js` loads `data/lab4_clean_tweets.csv` with D3 and validates that it contains at least 1,000 records and valid topic, sentiment, engagement, and score values. Figure 1 contains two coordinated panels:

- a normalized stacked bar chart of negative, neutral, and positive shares within each topic;
- a dot plot showing the share of each topic–sentiment group receiving at least one like, reply, repost, or quote, with dot size encoding tweet count.

Every mark supports pointer and keyboard focus, provides exact values in a tooltip, and has an accessible text label. The layout is responsive and offers horizontal scrolling on narrow screens.

## Files

```text
lab4/
├── index.html
├── lab4.js
├── clean_tweets.py
├── requirements.txt
├── README.md
├── css/
│   └── lab4.css
└── data/
    ├── lab4_raw_tweets.csv
    ├── lab4_clean_tweets.csv
    ├── sentiment_by_topic.csv
    ├── topic_summary.csv
    ├── tfidf_terms_by_topic.csv
    └── cleaning_report.json
```
