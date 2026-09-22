# Lab 8 · DKU Undergraduate Bulletin

**[Open the interactive study](https://owen-1234.github.io/stats401-labs/lab8/)**

This project maps the formal and semantic structure of the *Bulletin of Duke Kunshan University Undergraduate Instruction*, academic year 2021–2022. The [official DKU PDF](https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/dkumain/files/V2021-22_DKU_UG_Bulletin.pdf) was accessed on September 22, 2026. The archived source PDF is in `data/`. Its SHA-256 is `431bd3fdcdfdf7722783c29502a7600e8ac21ae45fd4785d230d1ab387dc9133`; the page-integrity check found 400 readable pages.

## Reproduce the analysis

From the repository root, in Python 3.12:

```bash
python -m venv .venv
.venv/bin/python -m pip install -r lab8/requirements.txt
.venv/bin/python lab8/prepare_corpus.py
.venv/bin/python lab8/analyze_corpus.py
python -m http.server 8000
```

Then open `http://localhost:8000/lab8/`. The published site uses static CSV and JSON outputs, so model inference is not needed in the browser.

## Data and method

The 400-page PDF has nine preliminary pages and 391 substantive pages. `prepare_corpus.py` uses PDF text blocks as candidate paragraphs, detects the hierarchy from heading typography, and retains the source page. It excludes page numbers, headings, brief table cells, low-density fragments, and duplicate text. A paragraph or short policy block is one point. There were 3,716 candidate blocks and 1,109 cleaned passages. Their mean length is 79 words, and they belong to 147 formal sections. The extraction rules and exclusion counts are recorded in `data/corpus_report.json`.

`analyze_corpus.py` encodes each original passage using `sentence-transformers/all-MiniLM-L6-v2`, with normalized 384-dimensional vectors. K-means clusters these vectors into ten groups with random seed 401 and 20 initializations. Topic names in `data/cluster_labels.json` were assigned after examining representative passages and characteristic TF-IDF terms in `data/cluster_inspection.json`. UMAP projects the original vectors to two dimensions using cosine distance, 15 neighbors, minimum distance 0.15, and seed 401. Five nearest neighbors are ranked by cosine similarity in the original vectors. The 2D coordinates are used only for display.

The outputs are `data/lab8_embedding_map.csv`, `data/lab8_topic_section_matrix.csv`, `data/overview.json`, and `data/analysis_evidence.json`. `data/embeddings.npy` preserves the exact vectors used by the published visualizations. The page uses D3 v7 and includes two corpus summaries, a searchable embedding map, a topic-by-section matrix, linked selection, source text, and six evidence-based findings.

The matrix uses within-section topic proportions for color and reports both passage counts and proportions in tooltips. Formal sections with fewer than ten passages are excluded only from the entropy ranking in the written findings. All sections remain available in the matrix and section filter.
