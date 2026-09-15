const STATUS_ORDER = ["Increase", "Unchanged", "Decrease"];
const STATUS_COLORS = new Map([
    ["Increase", "#1f7a65"],
    ["Unchanged", "#766949"],
    ["Decrease", "#a9474b"]
]);
const formatGDP = d3.format(",");
const tooltip = d3.select("#chart-tooltip");

function drawLegend() {
    d3.select("#status-legend")
        .selectAll("span")
        .data(STATUS_ORDER)
        .join("span")
        .attr("class", "status-item")
        .html(status => `<i class="status-swatch" style="--status-color:${STATUS_COLORS.get(status)}"></i>${status}`);
}

function validateHierarchy(data) {
    const root = d3.hierarchy(data).sum(d => d.gdp || 0);
    const leaves = root.leaves();
    const statuses = new Set(leaves.map(d => d.data.status));
    const validLeaves = leaves.every(d =>
        d.depth === 3 &&
        typeof d.data.name === "string" &&
        Number.isFinite(d.data.gdp) &&
        d.data.gdp > 0 &&
        STATUS_COLORS.has(d.data.status)
    );

    if (data.name !== "World" || leaves.length !== 27 || root.value !== 85215 || !validLeaves || statuses.size !== 3) {
        throw new Error("The hierarchical GDP data failed validation.");
    }
}

function tooltipPosition(event, target) {
    const tooltipBounds = tooltip.node().getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const requestedX = Number.isFinite(event?.clientX) && event.clientX > 0 ? event.clientX : targetBounds.right;
    const requestedY = Number.isFinite(event?.clientY) && event.clientY > 0 ? event.clientY : targetBounds.top;
    const gap = 14;
    const left = Math.max(gap, Math.min(requestedX + gap, window.innerWidth - tooltipBounds.width - gap));
    const top = Math.max(gap, Math.min(requestedY + gap, window.innerHeight - tooltipBounds.height - gap));
    tooltip.style("left", `${left}px`).style("top", `${top}px`);
}

function showTooltip(event, d) {
    const continent = d.ancestors().find(node => node.depth === 1).data.name;
    const area = d.ancestors().find(node => node.depth === 2).data.name;
    tooltip
        .html(`<strong>${d.data.name}</strong>
            <div class="tooltip-path">World &rsaquo; ${continent} &rsaquo; ${area} &rsaquo; ${d.data.name}</div>
            <div class="tooltip-grid">
                <span>Continent</span><b>${continent}</b>
                <span>Area</span><b>${area}</b>
                <span>GDP</span><b>$${formatGDP(d.data.gdp)} billion</b>
                <span>GDP status</span><b>${d.data.status}</b>
            </div>`)
        .classed("visible", true);
    tooltipPosition(event, event.currentTarget);
}

function hideTooltip() {
    tooltip.classed("visible", false);
}

function renderTreemap(data, selector, chartId, tileMethod, accessibleTitle) {
    const width = 1100;
    const height = 610;
    const root = d3.hierarchy(data)
        .sum(d => d.gdp || 0)
        .sort((a, b) => b.value - a.value || d3.ascending(a.data.name, b.data.name));

    d3.treemap()
        .tile(tileMethod)
        .size([width, height])
        .paddingOuter(5)
        .paddingInner(2)
        .paddingTop(d => d.depth === 1 ? 29 : d.depth === 2 ? 20 : 0)
        .round(true)(root);

    const container = d3.select(selector);
    container.selectAll("*").remove();

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-labelledby", `${chartId}-svg-title ${chartId}-svg-desc`);

    svg.append("title")
        .attr("id", `${chartId}-svg-title`)
        .text(accessibleTitle);

    svg.append("desc")
        .attr("id", `${chartId}-svg-desc`)
        .text("Country rectangle area represents GDP in billions of U.S. dollars. Green represents increase, amber represents unchanged, and red represents decrease. Countries are nested within labeled areas and continents.");

    const leaves = root.leaves();
    const parentNodes = root.descendants().filter(d => d.depth === 1 || d.depth === 2);
    const definitions = svg.append("defs");

    definitions.selectAll("clipPath")
        .data(leaves)
        .join("clipPath")
        .attr("id", (_, index) => `${chartId}-cell-clip-${index}`)
        .append("rect")
        .attr("x", d => d.x0 + 4)
        .attr("y", d => d.y0 + 3)
        .attr("width", d => Math.max(0, d.x1 - d.x0 - 8))
        .attr("height", d => Math.max(0, d.y1 - d.y0 - 6));

    definitions.selectAll("clipPath.group-clip")
        .data(parentNodes)
        .join("clipPath")
        .attr("class", "group-clip")
        .attr("id", (_, index) => `${chartId}-group-clip-${index}`)
        .append("rect")
        .attr("x", d => d.x0 + 5)
        .attr("y", d => d.y0 + 2)
        .attr("width", d => Math.max(0, d.x1 - d.x0 - 10))
        .attr("height", d => d.depth === 1 ? 23 : 16);

    const cells = svg.append("g")
        .attr("aria-label", "Countries")
        .selectAll("g")
        .data(leaves)
        .join("g")
        .attr("class", "country-cell")
        .attr("tabindex", 0)
        .attr("role", "img")
        .attr("aria-label", d => {
            const continent = d.ancestors().find(node => node.depth === 1).data.name;
            const area = d.ancestors().find(node => node.depth === 2).data.name;
            return `${d.data.name}, ${area}, ${continent}, GDP ${formatGDP(d.data.gdp)} billion U.S. dollars, status ${d.data.status}`;
        });

    cells.append("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("width", d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0))
        .attr("fill", d => STATUS_COLORS.get(d.data.status));

    const labels = cells.append("text")
        .attr("class", "country-label")
        .attr("x", d => d.x0 + 7)
        .attr("y", d => d.y0 + 16)
        .attr("clip-path", (_, index) => `url(#${chartId}-cell-clip-${index})`)
        .style("display", d => d.x1 - d.x0 >= 54 && d.y1 - d.y0 >= 27 ? null : "none");

    labels.append("tspan")
        .text(d => d.data.name);

    labels.append("tspan")
        .attr("class", "country-value")
        .attr("x", d => d.x0 + 7)
        .attr("dy", 14)
        .style("display", d => d.x1 - d.x0 >= 70 && d.y1 - d.y0 >= 46 ? null : "none")
        .text(d => `$${formatGDP(d.data.gdp)}B`);

    cells
        .on("pointerenter", showTooltip)
        .on("pointermove", showTooltip)
        .on("pointerleave", hideTooltip)
        .on("focus", showTooltip)
        .on("blur", hideTooltip)
        .on("keydown", event => {
            if (event.key === "Escape") {
                hideTooltip();
                event.currentTarget.blur();
            }
        });

    const groupLayer = svg.append("g").attr("class", "group-layer");

    groupLayer.selectAll("rect")
        .data(parentNodes)
        .join("rect")
        .attr("class", d => d.depth === 1 ? "continent-boundary" : "area-boundary")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("width", d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0));

    groupLayer.selectAll("text")
        .data(parentNodes)
        .join("text")
        .attr("class", d => d.depth === 1 ? "continent-label" : "area-label")
        .attr("x", d => d.x0 + 7)
        .attr("y", d => d.y0 + (d.depth === 1 ? 18 : 14))
        .attr("clip-path", (_, index) => `url(#${chartId}-group-clip-${index})`)
        .style("display", d => d.x1 - d.x0 >= (d.depth === 1 ? 80 : 58) ? null : "none")
        .text(d => d.data.name);
}

function showLoadError(error) {
    console.error(error);
    d3.selectAll(".treemap-chart")
        .html('<p class="chart-error">The hierarchical GDP data could not be loaded.</p>');
}

drawLegend();

d3.json("../data/lab6_assignment_gdp.json")
    .then(data => {
        validateHierarchy(data);
        renderTreemap(data, "#treemap-squarify", "squarify", d3.treemapSquarify, "Squarified treemap of the global GDP hierarchy");
        renderTreemap(data, "#treemap-slice-dice", "slice-dice", d3.treemapSliceDice, "Slice-and-dice treemap of the global GDP hierarchy");
    })
    .catch(showLoadError);
