const stationDataUrl = "../data/lab5_assignment_stations.csv";
const routeDataUrl = "../data/lab5_assignment_routes.csv";
const publishedBase = "https://owen-1234.github.io/stats401-labs/data/";

const districtOrder = ["Central", "North", "East", "South", "West"];
const stationTypeOrder = ["Transfer", "Terminal", "Local"];
const districtColors = new Map([
    ["Central", "#d05f3f"],
    ["North", "#3d8fc4"],
    ["East", "#8b6bb3"],
    ["South", "#39a47a"],
    ["West", "#d29a2e"]
]);
const routeColors = new Map([
    ["Metro", "#2f80b7"],
    ["Express", "#e2634d"],
    ["Shuttle", "#4dac88"]
]);
const symbolTypes = new Map([
    ["Local", d3.symbolCircle],
    ["Transfer", d3.symbolSquare],
    ["Terminal", d3.symbolTriangle]
]);
const formatNumber = d3.format(",");
const tooltip = d3.select("#chart-tooltip");

const parseStation = d => ({
    id: d.id,
    station_name: d.station_name,
    district: d.district,
    daily_passengers: +d.daily_passengers,
    station_type: d.station_type
});

const parseRoute = d => ({
    source: d.source,
    target: d.target,
    travel_time_min: +d.travel_time_min,
    route_type: d.route_type
});

async function loadCsv(relativeUrl, publishedUrl, parser) {
    if (window.location.protocol === "file:") return d3.csv(publishedUrl, parser);
    try {
        return await d3.csv(relativeUrl, parser);
    } catch (error) {
        console.warn(`Relative data unavailable at ${relativeUrl}. Using the published copy.`, error);
        return d3.csv(publishedUrl, parser);
    }
}

function validateData(stations, routes) {
    const ids = new Set(stations.map(d => d.id));
    const validStations = stations.length === 50 && ids.size === 50 && stations.every(d =>
        d.id && d.station_name && districtOrder.includes(d.district) &&
        stationTypeOrder.includes(d.station_type) && Number.isFinite(d.daily_passengers)
    );
    const validRoutes = routes.length === 50 && routes.every(d =>
        ids.has(d.source) && ids.has(d.target) && routeColors.has(d.route_type) &&
        Number.isFinite(d.travel_time_min)
    );
    if (!validStations || !validRoutes) throw new Error("The assignment data failed validation.");
}

function prepareNetwork(stations, routes) {
    const adjacency = new Map(stations.map(d => [d.id, new Set()]));
    routes.forEach(d => {
        adjacency.get(d.source).add(d.target);
        adjacency.get(d.target).add(d.source);
    });
    stations.forEach(d => { d.degree = adjacency.get(d.id).size; });
    return adjacency;
}

function componentSizes(stations, adjacency) {
    const unseen = new Set(stations.map(d => d.id));
    const sizes = [];
    while (unseen.size) {
        const start = unseen.values().next().value;
        const stack = [start];
        unseen.delete(start);
        let size = 0;
        while (stack.length) {
            const current = stack.pop();
            size += 1;
            adjacency.get(current).forEach(next => {
                if (unseen.delete(next)) stack.push(next);
            });
        }
        sizes.push(size);
    }
    return sizes.sort((a, b) => b - a);
}

function updateSummary(stations, routes, adjacency) {
    const components = componentSizes(stations, adjacency);
    d3.select("#station-count").text(stations.length);
    d3.select("#route-count").text(routes.length);
    d3.select("#district-count").text(new Set(stations.map(d => d.district)).size);
    d3.select("#component-count").text(`${components[0]} + ${components.length - 1}`);
}

function tooltipPosition(event, target) {
    const node = tooltip.node();
    const bounds = node.getBoundingClientRect();
    const targetBounds = target?.getBoundingClientRect();
    const x = event?.clientX || (targetBounds ? targetBounds.right : window.innerWidth / 2);
    const y = event?.clientY || (targetBounds ? targetBounds.top : window.innerHeight / 2);
    const gap = 14;
    tooltip
        .style("left", `${Math.max(gap, Math.min(x + gap, window.innerWidth - bounds.width - gap))}px`)
        .style("top", `${Math.max(gap, Math.min(y + gap, window.innerHeight - bounds.height - gap))}px`);
}

function showTooltip(html, event, target) {
    tooltip.html(html).classed("visible", true);
    tooltipPosition(event, target);
}

function hideTooltip() {
    tooltip.classed("visible", false);
}

function stationTooltip(d) {
    const connectionText = d.degree === 0 ? "Isolated station" : `${d.degree} direct route${d.degree === 1 ? "" : "s"}`;
    return `<strong>${d.station_name}</strong><div class="tooltip-grid">
        <span>District</span><b>${d.district}</b>
        <span>Station type</span><b>${d.station_type}</b>
        <span>Daily passengers</span><b>${formatNumber(d.daily_passengers)}</b>
        <span>Connectivity</span><b>${connectionText}</b>
    </div>`;
}

function routeTooltip(d) {
    const source = typeof d.source === "object" ? d.source : d._source;
    const target = typeof d.target === "object" ? d.target : d._target;
    return `<strong>${source.station_name} &harr; ${target.station_name}</strong><div class="tooltip-grid">
        <span>Route type</span><b>${d.route_type}</b>
        <span>Travel time</span><b>${d.travel_time_min} min</b>
        <span>Districts</span><b>${source.district} &harr; ${target.district}</b>
    </div>`;
}

function drawLegends(sizeScale) {
    d3.select("#district-legend").selectAll("span").data(districtOrder).join("span")
        .attr("class", "legend-item")
        .html(d => `<i class="legend-dot" style="--legend-color:${districtColors.get(d)}"></i>${d}`);

    const stationLegend = d3.select("#station-type-legend").selectAll("span").data(stationTypeOrder).join("span").attr("class", "legend-item");
    stationLegend.each(function(d) {
        const item = d3.select(this);
        item.selectAll("*").remove();
        item.append("svg").attr("class", "legend-symbol").attr("viewBox", "-10 -10 20 20")
            .append("path").attr("d", d3.symbol().type(symbolTypes.get(d)).size(115)())
            .attr("fill", "rgba(255,255,255,0.18)").attr("stroke", "#e8f1ef").attr("stroke-width", 1.4);
        item.append("span").text(d);
    });

    d3.select("#passenger-legend").html('<span class="small"><i></i>1,373</span><span class="large"><i></i>9,850</span>');
    d3.select("#route-legend").selectAll("span").data(Array.from(routeColors.keys())).join("span")
        .attr("class", "legend-item")
        .html(d => `<i class="legend-route" style="--legend-color:${routeColors.get(d)}"></i>${d}`);
    d3.select("#matrix-legend").selectAll("span").data(Array.from(routeColors.keys())).join("span")
        .attr("class", "legend-item")
        .html(d => `<i class="legend-dot" style="--legend-color:${routeColors.get(d)}"></i>${d}`);
}

function renderNetwork(stations, routes, adjacency) {
    const container = d3.select("#network-chart");
    container.selectAll("*").remove();
    const width = 980;
    const height = 660;
    const sizeScale = d3.scaleSqrt().domain(d3.extent(stations, d => d.daily_passengers)).range([180, 980]);
    const widthScale = d3.scaleLinear().domain(d3.extent(routes, d => d.travel_time_min)).range([1.2, 5.4]);
    drawLegends(sizeScale);

    const svg = container.append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img").attr("aria-labelledby", "network-svg-title network-svg-desc");
    svg.append("title").attr("id", "network-svg-title").text("Force-directed view of the 50-station urban transit network");
    svg.append("desc").attr("id", "network-svg-desc").text("A 45-station connected component is surrounded by five isolated stations. Node color, size, and shape encode district, passenger volume, and station type. Link color and width encode route type and travel time.");

    const link = svg.append("g").attr("aria-label", "Direct routes").selectAll("line").data(routes).join("line")
        .attr("class", "network-link").attr("stroke", d => routeColors.get(d.route_type))
        .attr("stroke-width", d => widthScale(d.travel_time_min)).attr("stroke-opacity", 0.64)
        .attr("tabindex", 0).attr("role", "img")
        .attr("aria-label", d => `${d.source} to ${d.target}, ${d.route_type}, ${d.travel_time_min} minutes`);

    const node = svg.append("g").attr("aria-label", "Stations").selectAll("g").data(stations).join("g")
        .attr("class", "network-node").attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", d => `${d.station_name}, ${d.district}, ${d.station_type}, ${formatNumber(d.daily_passengers)} daily passengers, ${d.degree} direct routes`);
    node.append("path")
        .attr("d", d => d3.symbol().type(symbolTypes.get(d.station_type)).size(sizeScale(d.daily_passengers))())
        .attr("fill", d => districtColors.get(d.district)).attr("stroke", "#e8f0ee").attr("stroke-width", 1.5);
    node.append("text").attr("class", "network-label").attr("dy", d => d.station_type === "Terminal" ? 2 : 0)
        .text(d => d.id.slice(1));

    const simulation = d3.forceSimulation(stations)
        .force("link", d3.forceLink(routes).id(d => d.id).distance(108).strength(0.46))
        .force("charge", d3.forceManyBody().strength(d => d.degree === 0 ? -90 : -235))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => Math.sqrt(sizeScale(d.daily_passengers) / Math.PI) + 8).iterations(2))
        .force("isolateRing", d3.forceRadial(d => d.degree === 0 ? 292 : 92, width / 2, height / 2).strength(d => d.degree === 0 ? 0.22 : 0.008));

    function clearNetworkHighlight() {
        node.classed("dimmed", false).classed("active", false);
        link.classed("dimmed", false).classed("active", false);
        hideTooltip();
    }

    function highlightStation(event, d) {
        const neighbors = adjacency.get(d.id);
        node.classed("dimmed", other => other.id !== d.id && !neighbors.has(other.id))
            .classed("active", other => other.id === d.id || neighbors.has(other.id));
        link.classed("dimmed", edge => edge.source.id !== d.id && edge.target.id !== d.id)
            .classed("active", edge => edge.source.id === d.id || edge.target.id === d.id);
        showTooltip(stationTooltip(d), event, event.currentTarget);
    }

    function highlightRoute(event, d) {
        const endpoints = new Set([d.source.id, d.target.id]);
        node.classed("dimmed", station => !endpoints.has(station.id)).classed("active", station => endpoints.has(station.id));
        link.classed("dimmed", edge => edge !== d).classed("active", edge => edge === d);
        showTooltip(routeTooltip(d), event, event.currentTarget);
    }

    node.on("pointerenter", highlightStation).on("pointermove", (event, d) => showTooltip(stationTooltip(d), event, event.currentTarget))
        .on("pointerleave", clearNetworkHighlight).on("focus", highlightStation).on("blur", clearNetworkHighlight);
    link.on("pointerenter", highlightRoute).on("pointermove", (event, d) => showTooltip(routeTooltip(d), event, event.currentTarget))
        .on("pointerleave", clearNetworkHighlight).on("focus", highlightRoute).on("blur", clearNetworkHighlight);

    node.call(d3.drag()
        .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.25).restart();
            d.fx = d.x;
            d.fy = d.y;
        })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }));

    simulation.on("tick", () => {
        stations.forEach(d => {
            const r = Math.sqrt(sizeScale(d.daily_passengers) / Math.PI) + 4;
            d.x = Math.max(r, Math.min(width - r, d.x));
            d.y = Math.max(r, Math.min(height - r, d.y));
        });
        link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    d3.select("#reset-network").on("click", () => {
        stations.forEach(d => { d.fx = null; d.fy = null; d.x = width / 2 + (Math.random() - 0.5) * 80; d.y = height / 2 + (Math.random() - 0.5) * 80; });
        clearNetworkHighlight();
        simulation.alpha(1).restart();
    });
}

function renderMatrix(stations, routes) {
    const stationById = new Map(stations.map(d => [d.id, d]));
    const sorted = [...stations].sort((a, b) =>
        districtOrder.indexOf(a.district) - districtOrder.indexOf(b.district) ||
        stationTypeOrder.indexOf(a.station_type) - stationTypeOrder.indexOf(b.station_type) ||
        +a.id.slice(1) - +b.id.slice(1)
    );
    const routeLookup = new Map();
    routes.forEach(route => {
        const sourceId = typeof route.source === "object" ? route.source.id : route.source;
        const targetId = typeof route.target === "object" ? route.target.id : route.target;
        route._source = stationById.get(sourceId);
        route._target = stationById.get(targetId);
        routeLookup.set(`${sourceId}|${targetId}`, route);
        routeLookup.set(`${targetId}|${sourceId}`, route);
    });
    const matrixData = sorted.flatMap(row => sorted.map(col => ({ row, col, route: routeLookup.get(`${row.id}|${col.id}`) || null })));
    const width = 930;
    const height = 930;
    const matrixSize = 750;
    const margin = { top: 110, right: 30, bottom: 30, left: 135 };
    const x = d3.scaleBand().domain(sorted.map(d => d.id)).range([0, matrixSize]).paddingInner(0.05);
    const y = d3.scaleBand().domain(sorted.map(d => d.id)).range([0, matrixSize]).paddingInner(0.05);
    const opacity = d3.scaleLinear().domain(d3.extent(routes, d => d.travel_time_min)).range([0.42, 1]);

    const container = d3.select("#matrix-chart");
    container.selectAll("*").remove();
    const svg = container.append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img").attr("aria-labelledby", "matrix-svg-title matrix-svg-desc");
    svg.append("title").attr("id", "matrix-svg-title").text("Adjacency matrix of the 50-station urban transit network");
    svg.append("desc").attr("id", "matrix-svg-desc").text("Rows and columns are grouped by district and station type. Filled colored cells show direct routes, with darker opacity for longer travel time.");
    const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const cells = plot.selectAll("rect.matrix-cell").data(matrixData).join("rect")
        .attr("class", d => `matrix-cell${d.route ? " connected" : ""}`)
        .attr("x", d => x(d.col.id)).attr("y", d => y(d.row.id))
        .attr("width", x.bandwidth()).attr("height", y.bandwidth())
        .attr("fill", d => d.route ? routeColors.get(d.route.route_type) : "#ece9e1")
        .attr("fill-opacity", d => d.route ? opacity(d.route.travel_time_min) : 0.68)
        .attr("stroke", "#fbfaf5").attr("stroke-width", 0.45)
        .attr("tabindex", d => d.route ? 0 : null).attr("role", d => d.route ? "img" : null)
        .attr("aria-label", d => d.route ? `${d.row.station_name} to ${d.col.station_name}, ${d.route.route_type}, ${d.route.travel_time_min} minutes` : null);

    const rowLabels = plot.selectAll("text.row-label").data(sorted).join("text").attr("class", "matrix-label row-label")
        .style("--matrix-color", d => districtColors.get(d.district)).attr("x", -11)
        .attr("y", d => y(d.id) + y.bandwidth() / 2 + 3.5).attr("text-anchor", "end").text(d => d.id.slice(1))
        .attr("tabindex", 0).attr("role", "img").attr("aria-label", d => `${d.station_name}, ${d.district}, ${d.station_type}, ${formatNumber(d.daily_passengers)} daily passengers`);
    const colLabels = plot.selectAll("text.col-label").data(sorted).join("text").attr("class", "matrix-label col-label")
        .style("--matrix-color", d => districtColors.get(d.district))
        .attr("transform", d => `translate(${x(d.id) + x.bandwidth() / 2},-11) rotate(-90)`)
        .attr("text-anchor", "start").text(d => d.id.slice(1));

    const groups = districtOrder.map(district => {
        const members = sorted.filter(d => d.district === district);
        const first = sorted.indexOf(members[0]);
        return { district, first, count: members.length, start: first * matrixSize / sorted.length, span: members.length * matrixSize / sorted.length };
    });
    plot.selectAll("rect.row-band").data(groups).join("rect").attr("class", "district-band row-band")
        .style("--matrix-color", d => districtColors.get(d.district)).attr("x", -7).attr("y", d => d.start).attr("width", 4).attr("height", d => d.span);
    plot.selectAll("rect.col-band").data(groups).join("rect").attr("class", "district-band col-band")
        .style("--matrix-color", d => districtColors.get(d.district)).attr("x", d => d.start).attr("y", -7).attr("width", d => d.span).attr("height", 4);
    plot.selectAll("line.row-divider").data(groups.slice(1)).join("line").attr("class", "district-divider")
        .attr("x1", 0).attr("x2", matrixSize).attr("y1", d => d.start).attr("y2", d => d.start);
    plot.selectAll("line.col-divider").data(groups.slice(1)).join("line").attr("class", "district-divider")
        .attr("x1", d => d.start).attr("x2", d => d.start).attr("y1", 0).attr("y2", matrixSize);
    plot.selectAll("text.group-label").data(groups).join("text").attr("class", "matrix-group-label")
        .attr("x", d => d.start + d.span / 2).attr("y", -91).attr("text-anchor", "middle").text(d => d.district);
    plot.append("text").attr("class", "matrix-axis-title").attr("x", matrixSize / 2).attr("y", -72).attr("text-anchor", "middle").text("Column station");
    plot.append("text").attr("class", "matrix-axis-title").attr("transform", `translate(${-112},${matrixSize / 2}) rotate(-90)`).attr("text-anchor", "middle").text("Row station");

    function clearMatrix() {
        cells.classed("dimmed", false).classed("active", false);
        rowLabels.classed("dimmed", false).classed("active", false);
        colLabels.classed("dimmed", false).classed("active", false);
        hideTooltip();
    }
    function highlightCell(event, d) {
        if (!d.route) return;
        const pair = new Set([`${d.row.id}|${d.col.id}`, `${d.col.id}|${d.row.id}`]);
        cells.classed("dimmed", other => !pair.has(`${other.row.id}|${other.col.id}`))
            .classed("active", other => pair.has(`${other.row.id}|${other.col.id}`));
        rowLabels.classed("dimmed", other => other.id !== d.row.id && other.id !== d.col.id).classed("active", other => other.id === d.row.id || other.id === d.col.id);
        colLabels.classed("dimmed", other => other.id !== d.row.id && other.id !== d.col.id).classed("active", other => other.id === d.row.id || other.id === d.col.id);
        showTooltip(routeTooltip(d.route), event, event.currentTarget);
    }
    cells.filter(d => d.route).on("pointerenter", highlightCell)
        .on("pointermove", (event, d) => showTooltip(routeTooltip(d.route), event, event.currentTarget))
        .on("pointerleave", clearMatrix).on("focus", highlightCell).on("blur", clearMatrix);
    rowLabels.on("pointerenter focus", function(event, d) { showTooltip(stationTooltip(d), event, this); })
        .on("pointermove", function(event, d) { showTooltip(stationTooltip(d), event, this); })
        .on("pointerleave blur", hideTooltip);
}

function showError(error) {
    console.error(error);
    d3.selectAll("#network-chart, #matrix-chart").html('<p class="chart-error">The network data could not be loaded. Serve the repository with a local web server or open the published GitHub Pages site.</p>');
}

Promise.all([
    loadCsv(stationDataUrl, `${publishedBase}lab5_assignment_stations.csv`, parseStation),
    loadCsv(routeDataUrl, `${publishedBase}lab5_assignment_routes.csv`, parseRoute)
]).then(([stations, routes]) => {
    validateData(stations, routes);
    const adjacency = prepareNetwork(stations, routes);
    updateSummary(stations, routes, adjacency);
    renderNetwork(stations, routes, adjacency);
    renderMatrix(stations, routes);
}).catch(showError);
