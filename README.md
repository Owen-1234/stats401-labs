# STATS 401 Lab Portfolio

Course website for **STATS 401: Data Acquisition and Visualization**.

**Student:** Shilin Ou &middot; **NetID:** so192

## Live Labs

**[Open the published Student Score](https://owen-1234.github.io/stats401-labs/lab1/)**

**[Open the published Urban Profiles](https://owen-1234.github.io/stats401-labs/lab2/)**

**[Open the published Daily U.S. Public Debt](https://owen-1234.github.io/stats401-labs/lab3/)**

**[Open the published ChatGPT Conversations](https://owen-1234.github.io/stats401-labs/lab4/)**

**[Open the published Urban Transit Network](https://owen-1234.github.io/stats401-labs/lab5/)**

**[Open the published Global GDP Hierarchy](https://owen-1234.github.io/stats401-labs/lab6/)**

**[Open the published Temporal Commercial Network](https://owen-1234.github.io/stats401-labs/lab7/)**

**[Open the published DKU Bulletin Semantic Map](https://owen-1234.github.io/stats401-labs/lab8/)**

**[Open Messi, Repositioned: Visualization Critique and Redesign](https://owen-1234.github.io/messi-repositioned/)**

Lab 1 is organized as a self-contained study:

```text
lab1/
├── index.html
├── css/
│   └── style.css
├── data/
│   └── students.csv
└── js/
    ├── chart.js
    └── main.js
```

The page loads the course-provided CSV with D3 v7, converts scores to numbers during row parsing, and creates a responsive SVG bar chart through D3 data binding. The published page runs directly in the browser and does not require Python or any local setup.

Lab 2 uses the course-provided city dataset to coordinate four dimensions in an aligned population bar chart and temperature dot plot. Region is encoded by color, development level by marker size, and every city row exposes exact values through an accessible tooltip.

Lab 3 acquires 2,928 daily U.S. public-debt observations from the Treasury Fiscal Data REST API with a reproducible Python script. The published study combines a responsive D3 time-series chart with a searchable, paginated, type-aware sortable table; the script and Lab 3 README document acquisition, validation, rate limiting, error handling, provenance, and a source-data reconciliation exception.

Lab 4 cleans 50,001 public ChatGPT tweets and retains 7,076 English, de-duplicated records assigned to one of four documented topic groups. A Twitter-RoBERTa model estimates sentiment for every retained tweet; the D3 study coordinates normalized sentiment composition with interaction rates across Coding, Education, Work, and Reliability.

Lab 5 loads 50 stations and 50 routes from two external CSV files. An interactive D3 force simulation encodes district, passenger volume, station type, travel time, and route type, while a district-ordered adjacency matrix reveals the same undirected network through complementary spatial encoding.

Lab 6 converts the course-provided GDP table into hierarchical JSON with Python. Two D3 treemaps encode GDP by area and GDP status by color while comparing squarified and slice-and-dice spatial subdivision.

Lab 7 uses the course-provided company and 60-day transaction data to show daily changes in an undirected commercial network. A D3 force simulation establishes stable company positions. Region, daily company volume, transaction type, and amount are encoded visually, while playback controls and a time slider support inspection of each day.

Lab 8 extracts 1,035 meaningful passages from the official 2021–22 DKU Undergraduate Bulletin, preserves their formal hierarchy and page numbers, and analyzes sentence embeddings with K-means and UMAP. The D3 study coordinates a searchable semantic map, nearest-neighbor details, and a topic-by-section matrix. Its four findings are linked to source passages.

The individual project critiques an existing eight-panel Lionel Messi shot-map series and rebuilds the comparison from one pinned StatsBomb dataset. A coordinated D3 interface compares event locations, fixed-bin density, and playing-time-standardized rates across Barcelona manager periods; the accompanying 500–800 word report connects every redesign decision to a documented weakness.
