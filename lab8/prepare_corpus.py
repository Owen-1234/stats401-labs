"""Extract paragraph-level DKU Bulletin passages with PDF hierarchy metadata.

Source: Bulletin of Duke Kunshan University Undergraduate Instruction 2021-2022.
The official PDF is downloaded only if it is absent locally. Pages 3-9 are its
contents pages; analysis begins at the first substantive chapter on PDF page 10.
"""
from __future__ import annotations

import csv
import json
import re
import urllib.request
from collections import Counter
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
PDF = DATA / "V2021-22_DKU_UG_Bulletin.pdf"
SOURCE = "https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/dkumain/files/V2021-22_DKU_UG_Bulletin.pdf"
if not PDF.exists():
    urllib.request.urlretrieve(SOURCE, PDF)


def normalize(text: str) -> str:
    text = re.sub(r"(?<=\w)-\s*\n\s*(?=\w)", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def classify(block: dict, page_num: int, chapter: str) -> tuple[str, str] | None:
    spans = [s for line in block.get("lines", []) for s in line.get("spans", []) if s["text"].strip()]
    if not spans:
        return None
    title = normalize("\n".join("".join(s["text"] for s in line["spans"]) for line in block["lines"]))
    if not title or len(title) > 180:
        return None
    weighted = sum(len(s["text"]) for s in spans)
    bold_ratio = sum(len(s["text"]) for s in spans if "Bold" in s["font"]) / weighted
    max_size = max(s["size"] for s in spans)
    if re.fullmatch(r"Part \d+:? .+", title) and max_size >= 13:
        return "chapter", title
    if page_num >= 217 and title == "Course Descriptions":
        return "chapter", "Part 10: Majors and Courses"
    if page_num >= 217 and re.match(r"^Courses with Course Subject:", title) and bold_ratio > .7:
        return "section", title.replace("Courses with Course Subject: ", "")
    if max_size >= 13 and bold_ratio > .6 and len(title.split()) < 25:
        return "section", title
    if (84 <= page_num < 217 and chapter.startswith("Part 10") and
            max_size >= 11.8 and bold_ratio > .7 and "/" not in title and
            title not in {"Major Requirements", "Divisional Foundation Courses",
                          "Interdisciplinary Courses", "Disciplinary Courses"} and
            len(title.split()) < 25):
        return "section", title
    if max_size >= 11.8 and bold_ratio > .7 and len(title.split()) < 25:
        return "subsection", title
    if page_num >= 217 and bold_ratio > .8 and re.match(r"^[A-Z]{2,}(?:/[A-Z]{2,})?\s*\d{2,4}[A-Z]?\b", title):
        return "subsection", title
    return None


def main() -> None:
    doc = pymupdf.open(PDF)
    assert len(doc) == 400, f"Unexpected PDF length: {len(doc)}"
    chapter = section = subsection = ""
    candidates = []
    exclusion = Counter()
    for pindex in range(9, len(doc)):
        page_num = pindex + 1
        page = doc[pindex]
        for block in sorted(page.get_text("dict")["blocks"], key=lambda b: (round(b["bbox"][1] / 3), b["bbox"][0])):
            if block.get("type") != 0:
                continue
            text = normalize("\n".join("".join(s["text"] for s in line["spans"]) for line in block.get("lines", [])))
            if not text:
                continue
            if re.fullmatch(str(page_num), text):
                exclusion["page_number"] += 1
                continue
            kind = classify(block, page_num, chapter)
            if kind:
                level, title = kind
                if level == "chapter":
                    chapter, section, subsection = title, "", ""
                elif level == "section":
                    section, subsection = title, ""
                else:
                    subsection = title
                exclusion["heading"] += 1
                continue
            if not chapter:
                exclusion["outside_chapter"] += 1
                continue
            candidates.append({"chapter": chapter, "section": section or chapter.split(": ", 1)[-1], "subsection": subsection, "page": page_num, "text": text})

    # Reject short table cells, labels, isolated codes, and repeated extracted blocks.
    seen = set()
    passages = []
    for row in candidates:
        text = row["text"]
        words = text.split()
        if len(words) < 15:
            exclusion["short_or_table_cell"] += 1
            continue
        if re.search(r"\s[248]\s*$", text) and not re.search(r"[.!?]\s*[248]\s*$", text):
            exclusion["course_table_row"] += 1
            continue
        if sum(c.isalpha() for c in text) / len(text) < .62:
            exclusion["low_text_density"] += 1
            continue
        if not re.search(r"[.!?;:]|\b(?:and|or|the|is|are|of|to)\b", text, re.I):
            exclusion["fragment"] += 1
            continue
        key = re.sub(r"\W+", "", text.lower())
        if key in seen:
            exclusion["duplicate"] += 1
            continue
        seen.add(key)
        row["passage_id"] = f"p{len(passages)+1:05d}"
        row["word_count"] = len(words)
        passages.append(row)

    fields = ["passage_id", "chapter", "section", "subsection", "page", "text", "word_count"]
    with (DATA / "bulletin_passages.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fields)
        writer.writeheader()
        writer.writerows(passages)
    report = {
        "source_title": "Bulletin of Duke Kunshan University Undergraduate Instruction",
        "academic_year": "2021-2022",
        "source_url": SOURCE,
        "date_accessed": "2026-09-22",
        "pdf_pages": len(doc),
        "content_pages": len(doc) - 9,
        "raw_candidate_blocks": len(candidates),
        "clean_passages": len(passages),
        "average_words_per_passage": round(sum(p["word_count"] for p in passages) / len(passages), 1),
        "formal_sections": len(set((p["chapter"], p["section"]) for p in passages)),
        "exclusions": dict(exclusion),
    }
    (DATA / "corpus_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    counts = Counter((p["chapter"], p["section"]) for p in passages)
    print("Top sections:", counts.most_common(20))
    print("Sample passages:")
    for p in passages[::max(1, len(passages)//15)][:15]:
        print(p["page"],p["chapter"],p["section"],p["subsection"],p["text"][:150])


if __name__ == "__main__":
    main()
