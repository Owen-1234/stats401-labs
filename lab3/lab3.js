const dataUrl = "data/us_public_debt_2015_present.csv";
const publishedDataUrl = "https://owen-1234.github.io/stats401-labs/lab3/data/us_public_debt_2015_present.csv";

const parseDate = d3.utcParse("%Y-%m-%d");
const formatDate = d3.utcFormat("%b %d, %Y");
const formatShortDate = d3.utcFormat("%b %Y");
const formatTrillions = value => `$${d3.format(".2f")(value / 1e12)}T`;
const formatSignedTrillions = value => {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}$${d3.format(".2f")(Math.abs(value) / 1e12)}T`;
};
const formatCurrency = value => value === null ? "—" : d3.format("$,.2f")(value);
const formatSignedCurrency = value => {
    if (value === null) return "—";
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${sign}${d3.format("$,.2f")(Math.abs(value))}`;
};

const parseDebtRecord = d => ({
    record_id: d.record_id,
    record_date_text: d.record_date,
    record_date: parseDate(d.record_date),
    fiscal_year: +d.fiscal_year,
    fiscal_quarter: +d.fiscal_quarter,
    debt_held_public_usd: +d.debt_held_public_usd,
    intragovernmental_holdings_usd: +d.intragovernmental_holdings_usd,
    total_public_debt_usd: +d.total_public_debt_usd,
    daily_change_usd: d.daily_change_usd === "" ? null : +d.daily_change_usd,
    public_share_pct: +d.public_share_pct,
    component_difference_usd: +d.component_difference_usd
});

const columns = [
    { key: "record_id", label: "Record ID", type: "text", format: d => d },
    { key: "record_date", label: "Record date", type: "date", format: d => formatDate(d) },
    { key: "fiscal_year", label: "Fiscal year", type: "number", format: d => d },
    { key: "fiscal_quarter", label: "Quarter", type: "number", format: d => `Q${d}` },
    { key: "debt_held_public_usd", label: "Held by public", type: "number", format: formatCurrency },
    { key: "intragovernmental_holdings_usd", label: "Intragovernmental", type: "number", format: formatCurrency },
    { key: "total_public_debt_usd", label: "Total debt", type: "number", format: formatCurrency },
    { key: "daily_change_usd", label: "Daily change", type: "number", format: formatSignedCurrency },
    { key: "public_share_pct", label: "Public share", type: "number", format: d => `${d3.format(".2f")(d)}%` },
    { key: "component_difference_usd", label: "Component difference", type: "number", format: formatSignedCurrency }
];

let fullData = [];
let sortKey = "record_date";
let sortDirection = "descending";
let searchTerm = "";
let currentPage = 1;
let pageSize = 50;

async function loadDebtData() {
    if (window.location.protocol === "file:") {
        return d3.csv(publishedDataUrl, parseDebtRecord);
    }

    try {
        return await d3.csv(dataUrl, parseDebtRecord);
    } catch (error) {
        console.warn("Relative CSV unavailable; using the published copy.", error);
        return d3.csv(publishedDataUrl, parseDebtRecord);
    }
}

function validateData(data) {
    if (data.length < 2000 || data.length > 3000) return false;

    return data.every(d =>
        d.record_id &&
        d.record_date instanceof Date &&
        !Number.isNaN(d.record_date.valueOf()) &&
        Number.isFinite(d.fiscal_year) &&
        Number.isFinite(d.fiscal_quarter) &&
        Number.isFinite(d.debt_held_public_usd) &&
        Number.isFinite(d.intragovernmental_holdings_usd) &&
        Number.isFinite(d.total_public_debt_usd) &&
        Number.isFinite(d.public_share_pct) &&
        Number.isFinite(d.component_difference_usd)
    );
}

function updateSummary(data) {
    const first = data[0];
    const latest = data[data.length - 1];
    const change = latest.total_public_debt_usd - first.total_public_debt_usd;
    const coverage = `${formatShortDate(first.record_date)}–${formatShortDate(latest.record_date)}`;

    d3.select("#record-count").text(`${d3.format(",")(data.length)} days`);
    d3.select("#date-range").text(coverage);
    d3.select("#latest-total").text(formatTrillions(latest.total_public_debt_usd));
    d3.select("#period-change").text(formatSignedTrillions(change));
    d3.select("#records-fact").text(d3.format(",")(data.length));
    d3.select("#coverage-fact").text(`${formatDate(first.record_date)}–${formatDate(latest.record_date)}`);
}

function positionTooltip(event) {
    const tooltip = d3.select("#debt-tooltip");
    const bounds = tooltip.node().getBoundingClientRect();
    const gap = 14;
    const left = Math.min(event.clientX + gap, window.innerWidth - bounds.width - gap);
    const top = Math.min(event.clientY + gap, window.innerHeight - bounds.height - gap);

    tooltip
        .style("left", `${Math.max(gap, left)}px`)
        .style("top", `${Math.max(gap, top)}px`);
}

function tooltipMarkup(d) {
    return `
        <strong class="tooltip-date">${formatDate(d.record_date)}</strong>
        <span class="tooltip-row"><span>Total debt</span><b>${formatTrillions(d.total_public_debt_usd)}</b></span>
        <span class="tooltip-row"><span>Held by public</span><b>${formatTrillions(d.debt_held_public_usd)}</b></span>
        <span class="tooltip-row"><span>Intragovernmental</span><b>${formatTrillions(d.intragovernmental_holdings_usd)}</b></span>
        <span class="tooltip-row"><span>Daily change</span><b>${d.daily_change_usd === null ? "—" : formatSignedTrillions(d.daily_change_usd)}</b></span>
    `;
}

function renderChart(data) {
    const container = d3.select("#debt-chart");
    container.selectAll("*").remove();

    const measuredWidth = container.node().getBoundingClientRect().width;
    const width = Math.max(760, Math.min(1080, measuredWidth));
    const height = 470;
    const margin = { top: 18, right: 34, bottom: 48, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-labelledby", "debt-chart-svg-title debt-chart-svg-desc");

    svg.append("title")
        .attr("id", "debt-chart-svg-title")
        .text("Daily U.S. public debt and its two components since 2015");

    svg.append("desc")
        .attr("id", "debt-chart-svg-desc")
        .text("Three time-series lines show total public debt, debt held by the public, and intragovernmental holdings in trillions of dollars.");

    const plot = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleUtc()
        .domain(d3.extent(data, d => d.record_date))
        .range([0, innerWidth]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.total_public_debt_usd) * 1.04])
        .nice()
        .range([innerHeight, 0]);

    const yTicks = y.ticks(6);
    plot.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(y).tickValues(yTicks).tickSize(-innerWidth).tickFormat(""));

    plot.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(d3.utcYear.every(width < 900 ? 2 : 1)).tickFormat(d3.utcFormat("%Y")));

    plot.append("g")
        .attr("class", "axis")
        .call(d3.axisLeft(y).tickValues(yTicks).tickFormat(d => `$${d / 1e12}T`));

    const series = [
        { key: "total_public_debt_usd", color: "#264d59", width: 3 },
        { key: "debt_held_public_usd", color: "#a56c35", width: 2 },
        { key: "intragovernmental_holdings_usd", color: "#743b3c", width: 2 }
    ];

    const line = key => d3.line()
        .defined(d => Number.isFinite(d[key]))
        .x(d => x(d.record_date))
        .y(d => y(d[key]))
        .curve(d3.curveMonotoneX);

    plot.selectAll("path.debt-series")
        .data(series)
        .join("path")
        .attr("class", "debt-series")
        .attr("fill", "none")
        .attr("stroke", d => d.color)
        .attr("stroke-width", d => d.width)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .attr("d", d => line(d.key)(data));

    const focus = plot.append("g")
        .style("display", "none")
        .attr("aria-hidden", "true");

    focus.append("line")
        .attr("class", "focus-rule")
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#596664")
        .attr("stroke-dasharray", "3 4");

    const focusPoints = focus.selectAll("circle")
        .data(series)
        .join("circle")
        .attr("r", 4)
        .attr("fill", "#fbfaf5")
        .attr("stroke", d => d.color)
        .attr("stroke-width", 2);

    const tooltip = d3.select("#debt-tooltip");
    const bisect = d3.bisector(d => d.record_date).center;

    function showNearest(event) {
        const [pointerX] = d3.pointer(event, this);
        const index = Math.max(0, Math.min(data.length - 1, bisect(data, x.invert(pointerX))));
        const datum = data[index];
        const xPosition = x(datum.record_date);

        focus.style("display", null);
        focus.select(".focus-rule")
            .attr("x1", xPosition)
            .attr("x2", xPosition);
        focusPoints
            .attr("cx", xPosition)
            .attr("cy", seriesDatum => y(datum[seriesDatum.key]));

        tooltip.html(tooltipMarkup(datum)).classed("visible", true);
        positionTooltip(event);
    }

    function hideFocus() {
        focus.style("display", "none");
        tooltip.classed("visible", false);
    }

    plot.append("rect")
        .attr("class", "chart-overlay")
        .attr("width", innerWidth)
        .attr("height", innerHeight)
        .attr("fill", "transparent")
        .style("cursor", "crosshair")
        .on("pointerenter pointermove", showNearest)
        .on("pointerleave", hideFocus);
}

function filteredAndSortedData() {
    const filtered = fullData.filter(d => {
        if (!searchTerm) return true;
        const searchable = [
            d.record_id,
            d.record_date_text,
            String(d.fiscal_year),
            `q${d.fiscal_quarter}`
        ].join(" ").toLowerCase();
        return searchable.includes(searchTerm);
    });

    return filtered.sort((a, b) => {
        const aValue = a[sortKey];
        const bValue = b[sortKey];

        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;

        const comparison = typeof aValue === "string"
            ? aValue.localeCompare(bValue)
            : d3.ascending(aValue, bValue);
        return sortDirection === "ascending" ? comparison : -comparison;
    });
}

function renderHeader() {
    const headerCells = d3.select("#table-header")
        .selectAll("th")
        .data(columns, d => d.key)
        .join("th")
        .attr("scope", "col")
        .attr("aria-sort", d => d.key === sortKey ? sortDirection : "none");

    const buttons = headerCells.selectAll("button")
        .data(d => [d])
        .join("button")
        .attr("type", "button")
        .attr("data-column", d => d.key)
        .attr("aria-label", d => {
            const next = d.key === sortKey && sortDirection === "ascending" ? "descending" : "ascending";
            return `Sort by ${d.label} ${next}`;
        })
        .on("click", (_, column) => {
            if (sortKey === column.key) {
                sortDirection = sortDirection === "ascending" ? "descending" : "ascending";
            } else {
                sortKey = column.key;
                sortDirection = "ascending";
            }
            currentPage = 1;
            renderTable();
        });

    buttons.selectAll("span.header-label")
        .data(d => [d])
        .join("span")
        .attr("class", "header-label")
        .text(d => d.label);

    buttons.selectAll("span.sort-indicator")
        .data(d => [d])
        .join("span")
        .attr("class", "sort-indicator")
        .attr("aria-hidden", "true")
        .text(d => d.key === sortKey ? (sortDirection === "ascending" ? "▲" : "▼") : "↕");
}

function renderTable() {
    renderHeader();
    const prepared = filteredAndSortedData();
    const totalPages = Math.max(1, Math.ceil(prepared.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const startIndex = (currentPage - 1) * pageSize;
    const pageData = prepared.slice(startIndex, startIndex + pageSize);

    const body = d3.select("#table-body");
    if (pageData.length === 0) {
        body.selectAll("tr")
            .data([null])
            .join("tr")
            .html(`<td class="table-empty" colspan="${columns.length}">No records match this filter.</td>`);
    } else {
        const rows = body.selectAll("tr")
            .data(pageData, d => d ? d.record_id : null)
            .join("tr");

        rows.selectAll("td")
            .data(row => columns.map(column => ({ row, column, value: row[column.key] })))
            .join("td")
            .attr("class", d => {
                const classes = [];
                if (d.column.type === "number") classes.push("numeric");
                if (d.column.key === "component_difference_usd" && Math.abs(d.value) > 0.02) {
                    classes.push("data-exception");
                }
                return classes.join(" ");
            })
            .text(d => d.column.format(d.value));
    }

    const endIndex = Math.min(startIndex + pageSize, prepared.length);
    const columnLabel = columns.find(column => column.key === sortKey).label;
    d3.select("#table-status").text(
        prepared.length === 0
            ? "0 matching records"
            : `Showing ${d3.format(",")(startIndex + 1)}–${d3.format(",")(endIndex)} of ${d3.format(",")(prepared.length)} records · Sorted by ${columnLabel} ${sortDirection}`
    );
    d3.select("#page-indicator").text(`Page ${currentPage} of ${totalPages}`);
    d3.select("#previous-page").property("disabled", currentPage <= 1);
    d3.select("#next-page").property("disabled", currentPage >= totalPages);
}

function initializeTableControls() {
    d3.select("#table-search").on("input", function() {
        searchTerm = this.value.trim().toLowerCase();
        currentPage = 1;
        renderTable();
    });

    d3.select("#page-size").on("change", function() {
        pageSize = +this.value;
        currentPage = 1;
        renderTable();
    });

    d3.select("#previous-page").on("click", () => {
        if (currentPage > 1) {
            currentPage -= 1;
            renderTable();
        }
    });

    d3.select("#next-page").on("click", () => {
        const totalPages = Math.ceil(filteredAndSortedData().length / pageSize);
        if (currentPage < totalPages) {
            currentPage += 1;
            renderTable();
        }
    });
}

function showLoadError(error) {
    console.error("Lab 3 data could not be loaded.", error);
    d3.select("#debt-chart")
        .html(`<p class="chart-error">The Treasury dataset could not be loaded. Serve this repository through a local web server or open the published GitHub Pages site.</p>`);
    d3.select("#table-body")
        .html(`<tr><td class="table-empty" colspan="${columns.length}">The acquired CSV could not be loaded.</td></tr>`);
    d3.select("#table-status").text("Data unavailable");
}

loadDebtData()
    .then(data => {
        data.sort((a, b) => d3.ascending(a.record_date, b.record_date));
        if (!validateData(data)) {
            throw new Error("The dataset failed record-count, type, or completeness validation.");
        }

        fullData = data;
        updateSummary(data);
        renderChart(data);
        initializeTableControls();
        renderTable();
    })
    .catch(showLoadError);
