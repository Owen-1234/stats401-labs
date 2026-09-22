"""Reproduce Lab 8 semantic analysis and visualization-ready data."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
import umap
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
MODEL = "sentence-transformers/all-MiniLM-L6-v2"
SEED = 401
N_CLUSTERS = 10
LABELS = DATA / "cluster_labels.json"


def main() -> None:
    df = pd.read_csv(DATA / "bulletin_passages.csv").fillna("")
    df["page"] = df["page"].astype(int)
    df["word_count"] = df["word_count"].astype(int)
    texts = df["text"].tolist()
    model = SentenceTransformer(MODEL)
    embeddings = model.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=True)
    np.save(DATA / "embeddings.npy", embeddings)

    reducer = umap.UMAP(n_components=2, n_neighbors=15, min_dist=.15,
                        metric="cosine", random_state=SEED)
    xy = reducer.fit_transform(embeddings)
    clusters = KMeans(n_clusters=N_CLUSTERS, random_state=SEED, n_init=20).fit_predict(embeddings)
    df["cluster"] = clusters
    df["x"] = xy[:, 0].round(5)
    df["y"] = xy[:, 1].round(5)

    domain_stop = {"duke", "kunshan", "university", "dku", "student", "students", "course", "courses",
                   "including", "academic", "program", "programs", "year", "years", "class", "classes",
                   "credit", "credits", "study", "studies"}
    vectorizer = TfidfVectorizer(stop_words="english", min_df=3, max_df=.8,
                                 ngram_range=(1, 2), max_features=6000)
    tfidf = vectorizer.fit_transform(texts)
    terms = vectorizer.get_feature_names_out()
    allowed = np.array([not any(w in domain_stop for w in t.split()) for t in terms])
    global_scores = np.asarray(tfidf.mean(axis=0)).ravel()
    top_global_idx = np.argsort(np.where(allowed, global_scores, -1))[::-1][:12]
    top_global = [terms[i] for i in top_global_idx]
    inspection = []
    for c in range(N_CLUSTERS):
        idx = np.where(clusters == c)[0]
        scores = np.asarray(tfidf[idx].mean(axis=0)).ravel()
        top = [terms[i] for i in np.argsort(np.where(allowed, scores, -1))[::-1][:12]]
        centroid = embeddings[idx].mean(axis=0)
        centroid /= np.linalg.norm(centroid)
        representative = idx[np.argsort(-(embeddings[idx] @ centroid))[:8]]
        inspection.append({"cluster": c, "count": len(idx), "top_terms": top,
                           "representative": [{"id": str(df.iloc[i]["passage_id"]),
                                               "section": str(df.iloc[i]["section"]),
                                               "page": int(df.iloc[i]["page"]),
                                               "text": str(df.iloc[i]["text"])[:450]}
                                              for i in representative]})
    (DATA / "cluster_inspection.json").write_text(json.dumps(inspection, indent=2, ensure_ascii=False))
    names = json.loads(LABELS.read_text()) if LABELS.exists() else {str(i): f"Topic {i+1}" for i in range(N_CLUSTERS)}
    df["cluster_name"] = [names[str(c)] for c in clusters]

    # Cosine similarity on original normalized vectors, never the UMAP coordinates.
    similarities = embeddings @ embeddings.T
    np.fill_diagonal(similarities, -1)
    neighbors = np.argsort(-similarities, axis=1)[:, :5]
    df["neighbor_ids"] = ["|".join(df.iloc[n]["passage_id"].tolist()) for n in neighbors]
    df["neighbor_scores"] = ["|".join(f"{similarities[i, j]:.3f}" for j in neighbors[i]) for i in range(len(df))]

    output = ["passage_id", "chapter", "section", "subsection", "page", "text", "word_count",
              "cluster", "cluster_name", "x", "y", "neighbor_ids", "neighbor_scores"]
    df.to_csv(DATA / "lab8_embedding_map.csv", columns=output, index=False)
    matrix = df.groupby(["chapter", "section", "cluster", "cluster_name"], as_index=False).size()
    matrix = matrix.rename(columns={"size": "count"})
    totals = df.groupby(["chapter", "section"]).size().rename("section_total").reset_index()
    matrix = matrix.merge(totals, on=["chapter", "section"])
    matrix["proportion"] = (matrix["count"] / matrix["section_total"]).round(4)
    matrix.to_csv(DATA / "lab8_topic_section_matrix.csv", index=False)

    overview = {"top_meaningful_terms": top_global,
                "top_term_scores": [{"term": terms[i], "mean_tfidf": round(float(global_scores[i]), 6)} for i in top_global_idx],
                "cluster_counts": {str(k): int(v) for k, v in Counter(clusters).items()},
                "section_counts": [{"chapter": ch, "section": sec, "count": int(count)}
                                   for (ch, sec), count in df.groupby(["chapter", "section"]).size().sort_values(ascending=False).items()]}
    (DATA / "overview.json").write_text(json.dumps(overview, indent=2, ensure_ascii=False))

    # Analytical evidence. Entropy uses sections with >=10 passages to reduce tiny-group artifacts.
    diversity = []
    for (ch, sec), part in df.groupby(["chapter", "section"]):
        if len(part) < 10:
            continue
        probs = part["cluster"].value_counts(normalize=True).to_numpy()
        entropy = float(-(probs * np.log2(probs)).sum())
        diversity.append({"chapter": ch, "section": sec, "n": len(part), "entropy": round(entropy, 3),
                          "topic_count": part["cluster"].nunique()})
    diversity.sort(key=lambda x: x["entropy"], reverse=True)
    cross = []
    for i in range(len(df)):
        order = np.argsort(-similarities[i])
        for j in order:
            if df.iloc[i]["section"] != df.iloc[j]["section"]:
                if i < j:
                    cross.append({"a": str(df.iloc[i]["passage_id"]), "b": str(df.iloc[j]["passage_id"]),
                                  "score": round(float(similarities[i,j]), 3),
                                  "a_section": str(df.iloc[i]["section"]), "b_section": str(df.iloc[j]["section"]),
                                  "a_page": int(df.iloc[i]["page"]), "b_page": int(df.iloc[j]["page"]),
                                  "a_text": str(df.iloc[i]["text"])[:300], "b_text": str(df.iloc[j]["text"])[:300]})
                break
    cross.sort(key=lambda x: x["score"], reverse=True)
    keywords = {}
    for q in ["credit", "graduation", "registration", "academic integrity"]:
        pattern = rf"\b{re.escape(q)}[a-z]*\b" if " " not in q else re.escape(q)
        rows = df[df["text"].str.contains(pattern, case=False, regex=True)]
        keywords[q] = {"passages": len(rows), "topics": rows["cluster_name"].value_counts().to_dict(),
                       "sections": rows["section"].value_counts().head(8).to_dict()}
    evidence = {"diverse_sections": diversity[:20], "cross_section_neighbors": cross[:20], "keywords": keywords}
    (DATA / "analysis_evidence.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False))
    print("Passages",len(df),"clusters",Counter(clusters))
    print("Global terms",top_global)
    for c in inspection:
        print(c["cluster"],c["count"],", ".join(c["top_terms"][:8]))
        for p in c["representative"][:3]: print("  ",p["page"],p["section"],p["text"][:150])
    print("Diverse sections",diversity[:8])
    print("Cross-section pairs",cross[:3])
    print("Keywords",keywords)


if __name__ == "__main__":
    main()
