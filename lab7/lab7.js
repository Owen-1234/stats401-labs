const companyUrl = "../data/lab7_assignment_companies.csv";
const transactionUrl = "../data/lab7_assignment_transactions_60days.csv";

const regionColors = new Map([
    ["Asia", "#276b69"],
    ["Europe", "#a45935"],
    ["North America", "#66528b"]
]);
const typeColors = new Map([
    ["goods", "#5c6870"],
    ["shipping", "#207e8f"],
    ["components", "#ae6736"],
    ["materials", "#78569b"],
    ["services", "#a04e58"]
]);

const formatMoney = d3.format("$,.2f");
const formatDate = d3.utcFormat("%B %-d, %Y");
const parseDate = d3.utcParse("%Y-%m-%d");
const tooltip = d3.select("#network-tooltip");
const slider = d3.select("#time-slider");

function parseCompany(d) {
    return {
        id: d.id,
        company_name: d.company_name,
        sector: d.sector,
        region: d.region,
        short_name: d.company_name.split(" ")[0],
        dailyVolume: 0,
        dailyPartners: 0
    };
}

function parseTransaction(d) {
    const pair = [d.source, d.target].sort();
    return {
        date: parseDate(d.date),
        dateText: d.date,
        day: +d.day,
        sourceId: d.source,
        targetId: d.target,
        key: pair.join("|"),
        amount: +d.amount_usd,
        type: d.transaction_type,
        count: +d.transaction_count
    };
}

function validateData(companies, transactions) {
    const ids = new Set(companies.map(d => d.id));
    if (companies.length !== 12 || ids.size !== 12 ||
        companies.some(d => !d.company_name || !d.sector || !regionColors.has(d.region))) {
        throw new Error("The company data are incomplete.");
    }
    const dailyPairs = new Set();
    for (const d of transactions) {
        const pairDay = `${d.day}|${d.key}`;
        if (!Number.isInteger(d.day) || d.day < 1 || d.day > 60 ||
            !d.date || !ids.has(d.sourceId) || !ids.has(d.targetId) ||
            d.sourceId === d.targetId || !Number.isFinite(d.amount) || d.amount < 0 ||
            !Number.isInteger(d.count) || d.count < 1 || !typeColors.has(d.type) ||
            dailyPairs.has(pairDay)) {
            throw new Error("The transaction data contain an invalid record.");
        }
        dailyPairs.add(pairDay);
    }
    if (new Set(transactions.map(d => d.day)).size !== 60) {
        throw new Error("The transaction data do not cover all sixty days.");
    }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

function positionTooltip(event, target) {
    const bounds = tooltip.node().getBoundingClientRect();
    const anchor = target?.getBoundingClientRect();
    const x = event?.clientX ?? (anchor ? anchor.right : window.innerWidth / 2);
    const y = event?.clientY ?? (anchor ? anchor.top : window.innerHeight / 2);
    const gap = 13;
    tooltip
        .style("left", `${Math.max(gap, Math.min(x + gap, window.innerWidth - bounds.width - gap))}px`)
        .style("top", `${Math.max(gap, Math.min(y + gap, window.innerHeight - bounds.height - gap))}px`);
}

function showTooltip(html, event, target) {
    tooltip.html(html).classed("visible", true);
    positionTooltip(event, target);
}

function hideTooltip() {
    tooltip.classed("visible", false);
}

function tooltipRows(title, rows) {
    return `<strong>${escapeHtml(title)}</strong>${rows.map(([name, value]) =>
        `<div class="tooltip-row"><span>${escapeHtml(name)}</span><b>${escapeHtml(value)}</b></div>`
    ).join("")}`;
}

function drawLegends() {
    d3.select("#region-legend").selectAll("span").data(Array.from(regionColors))
        .join("span").attr("class", "key-item")
        .html(([name, color]) => `<i class="key-dot" style="--swatch:${color}" aria-hidden="true"></i>${name}`);
    d3.select("#type-legend").selectAll("span").data(Array.from(typeColors))
        .join("span").attr("class", "key-item")
        .html(([name, color]) => `<i class="key-line" style="--swatch:${color}" aria-hidden="true"></i>${name[0].toUpperCase()}${name.slice(1)}`);
}

function layoutCompanies(companies, transactions) {
    const uniqueLinks = Array.from(d3.group(transactions, d => d.key), ([, rows]) => ({
        source: rows[0].sourceId,
        target: rows[0].targetId
    }));
    const simulation = d3.forceSimulation(companies)
        .force("link", d3.forceLink(uniqueLinks).id(d => d.id).distance(165).strength(0.23))
        .force("charge", d3.forceManyBody().strength(-540))
        .force("collision", d3.forceCollide(60))
        .force("center", d3.forceCenter(500, 300))
        .stop();
    for (let i = 0; i < 420; i += 1) simulation.tick();
    const x = d3.scaleLinear().domain(d3.extent(companies, d => d.x)).range([85, 835]);
    const y = d3.scaleLinear().domain(d3.extent(companies, d => d.y)).range([70, 525]);
    companies.forEach(d => {
        d.x = x(d.x);
        d.y = y(d.y);
    });
}

async function main() {
    const [companies, transactions] = await Promise.all([
        d3.csv(companyUrl, parseCompany),
        d3.csv(transactionUrl, parseTransaction)
    ]);
    validateData(companies, transactions);
    layoutCompanies(companies, transactions);
    drawLegends();

    const companyById = new Map(companies.map(d => [d.id, d]));
    const byDay = d3.group(transactions, d => d.day);
    const volumeByDay = new Map();
    let maxVolume = 0;
    for (let day = 1; day <= 60; day += 1) {
        const volumes = new Map(companies.map(d => [d.id, 0]));
        for (const link of byDay.get(day)) {
            volumes.set(link.sourceId, volumes.get(link.sourceId) + link.amount);
            volumes.set(link.targetId, volumes.get(link.targetId) + link.amount);
        }
        maxVolume = Math.max(maxVolume, ...volumes.values());
        volumeByDay.set(day, volumes);
    }
    const radius = d3.scaleSqrt().domain([0, maxVolume]).range([10, 31]);
    const width = d3.scaleSqrt()
        .domain(d3.extent(transactions, d => d.amount))
        .range([2.1, 7.2]);

    d3.select("#network-chart").selectAll("*").remove();
    const svg = d3.select("#network-chart").append("svg")
        .attr("viewBox", "0 0 1000 600")
        .attr("role", "group")
        .attr("aria-label", "Daily commercial transaction network for twelve companies");
    const linkLayer = svg.append("g").attr("class", "links");
    const nodeLayer = svg.append("g").attr("class", "nodes");

    const nodes = nodeLayer.selectAll("g.network-node")
        .data(companies, d => d.id)
        .join("g")
        .attr("class", "network-node")
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .attr("tabindex", 0)
        .attr("role", "img");
    nodes.append("circle").attr("class", "node-circle");
    nodes.append("text").attr("class", "node-label")
        .attr("dy", "0.32em")
        .text(d => d.short_name);

    function nodeTooltip(d) {
        return tooltipRows(d.company_name, [
            ["Region", d.region],
            ["Sector", d.sector],
            ["Daily value", formatMoney(d.dailyVolume)],
            ["Active partners", d.dailyPartners]
        ]);
    }
    function linkTooltip(d) {
        const source = companyById.get(d.sourceId);
        const target = companyById.get(d.targetId);
        return tooltipRows(`${source.company_name} ↔ ${target.company_name}`, [
            ["Date", formatDate(d.date)],
            ["Type", d.type],
            ["Value", formatMoney(d.amount)],
            ["Transactions", d.count],
            ["Regions", `${source.region} ↔ ${target.region}`]
        ]);
    }
    nodes
        .on("pointerenter", function(event, d) { showTooltip(nodeTooltip(d), event, this); })
        .on("pointermove", function(event) { positionTooltip(event, this); })
        .on("pointerleave", hideTooltip)
        .on("focus", function(event, d) { showTooltip(nodeTooltip(d), null, this); })
        .on("blur", hideTooltip);

    let currentDay = 1;
    let timer = null;
    function setRunning(running) {
        d3.select("#play").property("disabled", running);
        d3.select("#pause").property("disabled", !running);
    }
    function pause() {
        if (timer) timer.stop();
        timer = null;
        setRunning(false);
    }
    function showDay(day) {
        currentDay = Math.max(1, Math.min(60, day));
        hideTooltip();
        const currentLinks = byDay.get(currentDay);
        const currentDate = currentLinks[0].date;
        const volumes = volumeByDay.get(currentDay);
        const partners = new Map(companies.map(d => [d.id, new Set()]));
        for (const link of currentLinks) {
            partners.get(link.sourceId).add(link.targetId);
            partners.get(link.targetId).add(link.sourceId);
        }
        companies.forEach(d => {
            d.dailyVolume = volumes.get(d.id);
            d.dailyPartners = partners.get(d.id).size;
        });
        const activeCompanies = companies.filter(d => d.dailyPartners > 0).length;
        const crossRegionLinks = currentLinks.filter(d =>
            companyById.get(d.sourceId).region !== companyById.get(d.targetId).region
        ).length;

        d3.select("#current-day").text(`Day ${currentDay} of 60`);
        d3.select("#current-date").text(formatDate(currentDate));
        d3.select("#active-companies").text(activeCompanies);
        d3.select("#active-links").text(currentLinks.length);
        d3.select("#total-value").text(formatMoney(d3.sum(currentLinks, d => d.amount)));
        d3.select("#cross-region-links").text(crossRegionLinks);
        slider.property("value", currentDay)
            .attr("aria-valuetext", `Day ${currentDay}, ${formatDate(currentDate)}`);

        linkLayer.selectAll("g.transaction").interrupt();
        linkLayer.selectAll(".network-link").interrupt();
        const selection = linkLayer.selectAll("g.transaction")
            .data(currentLinks, d => d.key);
        const entering = selection.enter().append("g")
            .attr("class", "transaction")
            .attr("tabindex", 0)
            .attr("role", "img");
        entering.append("line").attr("class", "network-link").attr("opacity", 0);
        entering.append("line").attr("class", "link-hit");
        const visible = entering.merge(selection)
            .style("pointer-events", null)
            .attr("aria-label", d => `${companyById.get(d.sourceId).company_name} and ${companyById.get(d.targetId).company_name}, ${d.type}, ${formatMoney(d.amount)}`)
            .on("pointerenter", function(event, d) { showTooltip(linkTooltip(d), event, this); })
            .on("pointermove", function(event) { positionTooltip(event, this); })
            .on("pointerleave", hideTooltip)
            .on("focus", function(event, d) { showTooltip(linkTooltip(d), null, this); })
            .on("blur", hideTooltip);
        visible.selectAll("line")
            .attr("x1", d => companyById.get(d.sourceId).x)
            .attr("y1", d => companyById.get(d.sourceId).y)
            .attr("x2", d => companyById.get(d.targetId).x)
            .attr("y2", d => companyById.get(d.targetId).y);
        visible.select(".network-link")
            .attr("stroke", d => typeColors.get(d.type))
            .transition().duration(380)
            .attr("stroke-width", d => width(d.amount))
            .attr("opacity", 0.8);
        selection.exit().style("pointer-events", "none")
            .select(".network-link")
            .transition().duration(380).attr("opacity", 0);
        selection.exit().transition().delay(390).remove();

        nodes.attr("aria-label", d => `${d.company_name}, ${d.region}, ${formatMoney(d.dailyVolume)} in transactions with ${d.dailyPartners} ${d.dailyPartners === 1 ? "partner" : "partners"}`);
        nodes.select(".node-circle")
            .attr("stroke", d => regionColors.get(d.region))
            .transition().duration(380)
            .attr("r", d => radius(d.dailyVolume))
            .attr("fill", d => d.dailyPartners ? regionColors.get(d.region) : "#f7f6f0")
            .attr("fill-opacity", d => d.dailyPartners ? 0.88 : 1);
        nodes.select(".node-label")
            .transition().duration(380)
            .attr("x", d => radius(d.dailyVolume) + 7)
            .attr("opacity", d => d.dailyPartners ? 1 : 0.56);
    }
    function play() {
        if (timer) return;
        if (currentDay === 60) showDay(1);
        setRunning(true);
        timer = d3.interval(() => {
            if (currentDay >= 60) {
                pause();
                return;
            }
            showDay(currentDay + 1);
            if (currentDay === 60) pause();
        }, 650);
    }
    function reset() {
        pause();
        showDay(1);
    }

    d3.select("#play").on("click", play);
    d3.select("#pause").on("click", pause);
    d3.select("#reset").on("click", reset);
    slider.on("input", function() {
        pause();
        showDay(+this.value);
    });
    showDay(1);
}

main().catch(error => {
    console.error(error);
    d3.select("#network-chart").html('<p class="chart-error">The network could not load. Please refresh the page.</p>');
});
