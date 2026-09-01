# STATS 401 Lab Portfolio

Course website for **STATS 401: Data Acquisition and Visualization**.

**Student:** Shilin Ou &middot; **NetID:** so192

## Live Labs

**[Open the published Student Score](https://owen-1234.github.io/stats401-labs/lab1/)**

**[Open the published Urban Profiles](https://owen-1234.github.io/stats401-labs/lab2/)**

**[Open the published Daily U.S. Public Debt](https://owen-1234.github.io/stats401-labs/lab3/)**

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

Lab 3 acquires 2,928 daily U.S. public-debt observations from the Treasury Fiscal Data REST API with a reproducible Python script. The published study combines a responsive D3 time-series chart with a searchable, paginated, type-aware sortable table and documents acquisition, validation, rate limiting, error handling, provenance, and a source-data reconciliation exception.
