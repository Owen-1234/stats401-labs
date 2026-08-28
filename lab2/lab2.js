const chartContainer = d3.select("#chart");
const tooltip = d3.select("#chart-tooltip");
const publishedDataUrl = "https://owen-1234.github.io/stats401-labs/data/cities_multivariate.csv";

const developmentOrder = ["High", "Medium", "Low"];
const validRegions = ["North", "South", "East", "West"];

const regionColors = new Map([
    ["North", "#356e87"],
    ["South", "#9b4f47"],
    ["East", "#4f7a65"],
    ["West", "#b07932"]
]);

const parseCity = d => ({
    city: d.city,
    population: +d.population,
    temp_c: +d.temp_c,
    development_level: d.development_level,
    region: d.region
});

async function loadCityData() {
    if (window.location.protocol === "file:") {
        return d3.csv(publishedDataUrl, parseCity);
    }

    try {
        return await d3.csv("../data/cities_multivariate.csv", parseCity);
    } catch (error) {
        console.warn("Relative CSV unavailable; using the published copy.", error);
        return d3.csv(publishedDataUrl, parseCity);
    }
}

function validateData(data) {
    return data.length > 0 && data.every(d =>
        d.city &&
        Number.isFinite(d.population) &&
        Number.isFinite(d.temp_c) &&
        developmentOrder.includes(d.development_level) &&
        validRegions.includes(d.region)
    );
}

function updateSummary(data) {
    const temperatureExtent = d3.extent(data, d => d.temp_c);
    const regions = new Set(data.map(d => d.region));

    d3.select("#city-count").text(`${data.length} cities`);
    d3.select("#median-population").text(`${d3.format(".2~f")(d3.median(data, d => d.population))} million`);
    d3.select("#temperature-span").text(`${d3.format(".1f")(temperatureExtent[0])}–${d3.format(".1f")(temperatureExtent[1])} °C`);
    d3.select("#region-count").text(`${regions.size} regions`);
}

function tooltipMarkup(d) {
    return `
        <strong class="tooltip-city">${d.city}</strong>
        <span class="tooltip-row"><span>Population</span><b>${d3.format(".1f")(d.population)} million</b></span>
        <span class="tooltip-row"><span>Temperature</span><b>${d3.format(".1f")(d.temp_c)} °C</b></span>
        <span class="tooltip-row"><span>Development</span><b>${d.development_level}</b></span>
        <span class="tooltip-row"><span>Region</span><b>${d.region}</b></span>
    `;
}

function positionTooltip(clientX, clientY) {
    const node = tooltip.node();
    const bounds = node.getBoundingClientRect();
    const gap = 14;
    const left = Math.min(clientX + gap, window.innerWidth - bounds.width - gap);
    const top = Math.min(clientY + gap, window.innerHeight - bounds.height - gap);

    tooltip
        .style("left", `${Math.max(gap, left)}px`)
        .style("top", `${Math.max(gap, top)}px`);
}

function showTooltip(event, d) {
    const row = d3.select(event.currentTarget.parentNode);
    row.classed("active", true);
    tooltip.html(tooltipMarkup(d)).classed("visible", true);

    if (event.type === "focus") {
        const target = event.currentTarget.getBoundingClientRect();
        positionTooltip(target.right, target.top + target.height / 2);
    } else {
        positionTooltip(event.clientX, event.clientY);
    }
}

function hideTooltip(event) {
    d3.select(event.currentTarget.parentNode).classed("active", false);
    tooltip.classed("visible", false);
}

function renderChart(data) {
    chartContainer.selectAll("*").remove();

    const sortedData = [...data].sort((a, b) =>
        d3.ascending(developmentOrder.indexOf(a.development_level), developmentOrder.indexOf(b.development_level)) ||
        d3.descending(a.population, b.population)
    );

    const measuredWidth = chartContainer.node().getBoundingClientRect().width;
    const width = Math.max(780, Math.min(1080, measuredWidth));
    const height = 720;
    const margin = { top: 100, right: 28, bottom: 48, left: 126 };
    const plotWidth = width - margin.left - margin.right;
    const panelGap = Math.max(54, plotWidth * 0.08);
    const panelWidth = (plotWidth - panelGap) / 2;
    const populationStart = 0;
    const temperatureStart = panelWidth + panelGap;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = chartContainer
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-labelledby", "city-chart-svg-title city-chart-svg-desc");

    svg.append("title")
        .attr("id", "city-chart-svg-title")
        .text("Population and temperature profiles for twelve cities");

    svg.append("desc")
        .attr("id", "city-chart-svg-desc")
        .text("An aligned bar and dot plot. Population is shown by bar length, temperature by dot position, region by color, and development level by dot size.");

    const plot = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3.scaleBand()
        .domain(sortedData.map(d => d.city))
        .range([0, innerHeight])
        .paddingInner(0.2)
        .paddingOuter(0.08);

    const populationScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.population)])
        .nice()
        .range([populationStart, populationStart + panelWidth]);

    const temperatureExtent = d3.extent(data, d => d.temp_c);
    const temperatureScale = d3.scaleLinear()
        .domain(temperatureExtent)
        .nice()
        .range([temperatureStart, temperatureStart + panelWidth]);

    const sizeScale = d3.scaleOrdinal()
        .domain(["Low", "Medium", "High"])
        .range([5, 8, 11]);

    const colorScale = d3.scaleOrdinal()
        .domain(validRegions)
        .range(validRegions.map(region => regionColors.get(region)));

    const populationTicks = populationScale.ticks(width < 900 ? 4 : 5);
    const temperatureTicks = temperatureScale.ticks(width < 900 ? 4 : 5);

    plot.selectAll("line.population-guide")
        .data(populationTicks)
        .join("line")
        .attr("class", "population-guide")
        .attr("x1", d => populationScale(d))
        .attr("x2", d => populationScale(d))
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", d => d === 0 ? "#9ca5a1" : "#dedbd2")
        .attr("stroke-width", d => d === 0 ? 1.2 : 1)
        .attr("stroke-dasharray", d => d === 0 ? null : "2 5");

    plot.selectAll("line.temperature-guide")
        .data(temperatureTicks)
        .join("line")
        .attr("class", "temperature-guide")
        .attr("x1", d => temperatureScale(d))
        .attr("x2", d => temperatureScale(d))
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#dedbd2")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2 5");

    const populationAxis = d3.axisTop(populationScale)
        .tickValues(populationTicks)
        .tickFormat(d => d3.format("~g")(d));

    const temperatureAxis = d3.axisTop(temperatureScale)
        .tickValues(temperatureTicks)
        .tickFormat(d => `${d}°`);

    const axes = plot.selectAll("g.panel-axis")
        .data([
            { key: "population", axis: populationAxis },
            { key: "temperature", axis: temperatureAxis }
        ])
        .join("g")
        .attr("class", d => `panel-axis ${d.key}-axis`)
        .call(d => d.each(function(axisData) {
            d3.select(this).call(axisData.axis);
        }));

    axes.select(".domain").attr("stroke", "#596664");
    axes.selectAll(".tick line").attr("stroke", "#9ca5a1");
    axes.selectAll(".tick text")
        .attr("fill", "#596664")
        .attr("font-family", "IBM Plex Sans, Arial, sans-serif")
        .attr("font-size", 11);

    plot.selectAll("text.panel-title")
        .data([
            { x: populationStart, title: "POPULATION" },
            { x: temperatureStart, title: "AVERAGE TEMPERATURE" }
        ])
        .join("text")
        .attr("class", "panel-title")
        .attr("x", d => d.x)
        .attr("y", -70)
        .attr("fill", "#172724")
        .attr("font-family", "IBM Plex Sans, Arial, sans-serif")
        .attr("font-size", 12)
        .attr("font-weight", 700)
        .attr("letter-spacing", "0.08em")
        .text(d => d.title);

    plot.selectAll("text.panel-unit")
        .data([
            { x: populationStart, unit: "MILLIONS · RATIO" },
            { x: temperatureStart, unit: "°C · INTERVAL" }
        ])
        .join("text")
        .attr("class", "panel-unit")
        .attr("x", d => d.x)
        .attr("y", -52)
        .attr("fill", "#7a817f")
        .attr("font-family", "IBM Plex Sans, Arial, sans-serif")
        .attr("font-size", 9)
        .attr("font-weight", 600)
        .attr("letter-spacing", "0.12em")
        .text(d => d.unit);

    const groupStarts = developmentOrder.map(level => ({
        level,
        city: sortedData.find(d => d.development_level === level).city
    }));

    plot.selectAll("line.group-rule")
        .data(groupStarts.slice(1))
        .join("line")
        .attr("class", "group-rule")
        .attr("x1", -margin.left + 14)
        .attr("x2", plotWidth)
        .attr("y1", d => y(d.city) - y.step() * 0.1)
        .attr("y2", d => y(d.city) - y.step() * 0.1)
        .attr("stroke", "#b8b7af")
        .attr("stroke-width", 1);

    plot.selectAll("text.group-label")
        .data(groupStarts)
        .join("text")
        .attr("class", "group-label")
        .attr("x", -margin.left + 14)
        .attr("y", d => y(d.city) + y.bandwidth() / 2)
        .attr("dy", "0.32em")
        .attr("fill", "#a56c35")
        .attr("font-family", "IBM Plex Sans, Arial, sans-serif")
        .attr("font-size", 9)
        .attr("font-weight", 700)
        .attr("letter-spacing", "0.12em")
        .text(d => d.level.toUpperCase());

    const rows = plot.selectAll("g.city-row")
        .data(sortedData)
        .join("g")
        .attr("class", "city-row")
        .attr("transform", d => `translate(0,${y(d.city)})`);

    rows.append("rect")
        .attr("class", "row-band")
        .attr("x", -margin.left + 8)
        .attr("y", -y.step() * 0.1)
        .attr("width", plotWidth + margin.left - 8)
        .attr("height", y.step());

    rows.append("text")
        .attr("class", "city-label")
        .attr("x", -12)
        .attr("y", y.bandwidth() / 2)
        .attr("dy", "0.34em")
        .attr("text-anchor", "end")
        .attr("fill", "#172724")
        .attr("font-family", "Source Serif 4, Georgia, serif")
        .attr("font-size", 12)
        .attr("font-weight", 600)
        .text(d => d.city);

    rows.append("rect")
        .attr("class", "population-bar")
        .attr("x", populationStart)
        .attr("y", y.bandwidth() * 0.28)
        .attr("width", d => populationScale(d.population) - populationScale(0))
        .attr("height", y.bandwidth() * 0.44)
        .attr("fill", d => colorScale(d.region))
        .attr("opacity", 0.82);

    rows.append("line")
        .attr("class", "temperature-range")
        .attr("x1", temperatureStart)
        .attr("x2", temperatureStart + panelWidth)
        .attr("y1", y.bandwidth() / 2)
        .attr("y2", y.bandwidth() / 2)
        .attr("stroke", "#c9c8c0")
        .attr("stroke-width", 1);

    rows.append("circle")
        .attr("class", "temperature-dot")
        .attr("cx", d => temperatureScale(d.temp_c))
        .attr("cy", y.bandwidth() / 2)
        .attr("r", d => sizeScale(d.development_level))
        .attr("fill", d => colorScale(d.region))
        .attr("stroke", "#fbfaf5")
        .attr("stroke-width", 2)
        .attr("opacity", 0.88);

    rows.append("circle")
        .attr("class", "temperature-ring")
        .attr("cx", d => temperatureScale(d.temp_c))
        .attr("cy", y.bandwidth() / 2)
        .attr("r", d => sizeScale(d.development_level) + 2)
        .attr("fill", "none")
        .attr("stroke", d => colorScale(d.region))
        .attr("stroke-width", 1)
        .attr("pointer-events", "none");

    const hitTargets = rows.append("rect")
        .attr("class", "city-row-hit")
        .attr("x", -margin.left + 8)
        .attr("y", -y.step() * 0.1)
        .attr("width", plotWidth + margin.left - 8)
        .attr("height", y.step())
        .attr("fill", "transparent")
        .attr("tabindex", 0)
        .attr("role", "graphics-symbol")
        .attr("aria-label", d => `${d.city}: population ${d.population} million, average temperature ${d.temp_c} degrees Celsius, ${d.development_level} development, ${d.region} region.`);

    hitTargets
        .on("mouseenter focus", showTooltip)
        .on("mousemove", event => positionTooltip(event.clientX, event.clientY))
        .on("mouseleave blur", hideTooltip);
}

async function drawChart() {
    try {
        const data = await loadCityData();

        if (!validateData(data)) {
            throw new Error("The CSV does not contain valid city records.");
        }

        updateSummary(data);
        renderChart(data);

        let resizeTimer;
        new ResizeObserver(() => {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => renderChart(data), 120);
        }).observe(chartContainer.node());
    } catch (error) {
        console.error("Unable to render the city profile chart:", error);
        chartContainer.html(
            `<p class="chart-error"><strong>The chart could not be loaded.</strong><br>Check the data path and internet connection, then open the Lab 2 page again.</p>`
        );
        d3.selectAll("#city-count, #median-population, #temperature-span, #region-count").text("Unavailable");
    }
}

drawChart();
