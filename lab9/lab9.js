(() => {
    const width = 960;
    const height = 520;
    const noDataColor = "#d8d8d0";
    const formatGDP = d3.format(",.1f");
    const formatRank = d3.format("d");
    const state = {
        selectedIso3: null,
        statsByIso: new Map(),
        colorScale: null,
        choroplethPaths: null
    };

    const escapeHtml = value => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const showPageError = error => {
        console.error(error);
        document.querySelectorAll(".map-container").forEach(container => {
            container.innerHTML = '<p class="chart-error">The visualization could not load. Please refresh the page and check the browser console for the asset path.</p>';
        });
    };

    const tooltipHtml = properties => {
        const value = properties.gdp;
        const name = properties.country || properties.name || properties.iso3 || "Unknown economy";
        if (value == null) {
            return `<strong>${escapeHtml(name)}</strong><span>No supplied GDP observation</span>`;
        }
        const rank = properties.rank ? `<span>Rank ${formatRank(properties.rank)} in the supplied top 50</span>` : "";
        return `<strong>${escapeHtml(name)}</strong><span>$${formatGDP(value)} billion</span>${rank}`;
    };

    const positionTooltip = (event, tooltip) => {
        tooltip
            .style("left", `${event.clientX}px`)
            .style("top", `${event.clientY}px`);
    };

    const renderLegend = () => {
        const legend = d3.select("#color-legend");
        legend.html("");
        const gradientStops = d3.range(0, 1.01, 0.1)
            .map(t => state.colorScale(state.colorScale.domain()[0] * Math.pow(state.colorScale.domain()[1] / state.colorScale.domain()[0], t)))
            .join(", ");
        legend.append("div")
            .attr("class", "legend-gradient")
            .style("background", `linear-gradient(to right, ${gradientStops})`);
        const ticks = [300, 1000, 3000, 10000, 30000].filter(value => {
            const [min, max] = state.colorScale.domain();
            return value >= min && value <= max;
        });
        legend.append("div")
            .attr("class", "legend-ticks")
            .selectAll("span")
            .data(ticks)
            .join("span")
            .text(value => `$${d3.format(",.0f")(value)}`);
        const note = legend.append("div").attr("class", "legend-note");
        note.append("span").attr("class", "legend-no-data");
        note.append("span").text("No data in the supplied top-50 table");
    };

    const applySelection = () => {
        const selected = state.selectedIso3;
        d3.selectAll("#choropleth-map .country")
            .classed("is-selected", d => selected != null && d.properties.iso3 === selected)
            .classed("is-dimmed", d => selected != null && d.properties.iso3 !== selected);
        d3.selectAll("#cartogram-map .feature")
            .classed("is-selected", d => selected != null && (d.feature?.properties || d.properties)?.iso3 === selected)
            .classed("is-dimmed", d => selected != null && (d.feature?.properties || d.properties)?.iso3 !== selected);

        const status = d3.select("#selection-status");
        if (selected == null) {
            status.classed("is-selected", false).text("No country selected");
            return;
        }
        const properties = state.statsByIso.get(selected);
        status
            .classed("is-selected", true)
            .text(properties ? `Selected: ${properties.country}` : `Selected: ${selected}`);
    };

    const selectCountry = iso3 => {
        if (!iso3) return;
        state.selectedIso3 = state.selectedIso3 === iso3 ? null : iso3;
        applySelection();
    };

    const renderChoropleth = geoData => {
        const container = d3.select("#choropleth-map");
        container.html("");
        const projection = d3.geoNaturalEarth1();
        projection.fitSize([width, height], geoData);
        const path = d3.geoPath(projection);
        const svg = container.append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", "World choropleth map of 2025 nominal GDP");
        const mapGroup = svg.append("g");
        const tooltip = d3.select("#choropleth-tooltip");

        const paths = mapGroup.selectAll("path")
            .data(geoData.features, d => d.properties.iso3 || d.properties.name)
            .join("path")
            .attr("class", "country")
            .attr("d", path)
            .attr("fill", d => d.properties.gdp == null ? noDataColor : state.colorScale(d.properties.gdp))
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr("aria-label", d => `${d.properties.country || d.properties.name}: ${d.properties.gdp == null ? "no supplied GDP observation" : `$${formatGDP(d.properties.gdp)} billion`}`)
            .on("mouseenter focus", function(event, d) {
                tooltip.html(tooltipHtml(d.properties)).classed("visible", true);
                positionTooltip(event, tooltip);
            })
            .on("mousemove", event => positionTooltip(event, tooltip))
            .on("mouseleave blur", () => tooltip.classed("visible", false))
            .on("click keydown", function(event, d) {
                if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                selectCountry(d.properties.iso3);
            });

        state.choroplethPaths = paths;
        const zoom = d3.zoom()
            .scaleExtent([1, 8])
            .on("zoom", event => mapGroup.attr("transform", event.transform));
        svg.call(zoom);
        applySelection();
    };

    const attachCartogramInteractions = () => {
        const features = d3.selectAll("#cartogram-map .feature");
        const tooltip = d3.select("#cartogram-tooltip");
        const propertiesOf = datum => datum.feature?.properties || datum.properties || {};
        features
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr("data-iso3", d => propertiesOf(d).iso3 || "")
            .attr("aria-label", d => `${propertiesOf(d).country || propertiesOf(d).name || "Unknown economy"}: ${propertiesOf(d).gdp == null ? "no supplied GDP observation" : `$${formatGDP(propertiesOf(d).gdp)} billion`}`)
            .on("mouseenter.lab9 focus.lab9", function(event, d) {
                tooltip.html(tooltipHtml(propertiesOf(d))).classed("visible", true);
                positionTooltip(event, tooltip);
            })
            .on("mousemove.lab9", event => positionTooltip(event, tooltip))
            .on("mouseleave.lab9 blur.lab9", () => tooltip.classed("visible", false))
            .on("click keydown", function(event, d) {
                if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                selectCountry(propertiesOf(d).iso3);
            });
        applySelection();
    };

    const renderCartogram = geoData => {
        const container = d3.select("#cartogram-map");
        container.html("");
        const projection = d3.geoNaturalEarth1();
        projection.fitSize([width, height], geoData);
        const path = d3.geoPath(projection);
        const svg = container.append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", "GDP cartogram of the world's countries");
        const group = svg.append("g");
        const observed = geoData.features.filter(feature => Number.isFinite(feature.properties.gdp));
        const referenceGDP = d3.median(observed, feature => feature.properties.gdp);
        const areaScale = feature => {
            if (!Number.isFinite(feature.properties.gdp)) return 1;
            // A bounded square-root scale keeps the global topology legible
            // while making higher GDP values occupy more area.
            return Math.max(0.62, Math.min(2.6, Math.pow(feature.properties.gdp / referenceGDP, 0.38)));
        };
        const placements = geoData.features.map(feature => {
            const [cx, cy] = path.centroid(feature);
            const scale = areaScale(feature);
            const projectedArea = path.area(feature);
            const radius = Number.isFinite(projectedArea)
                ? Math.max(4, Math.sqrt(projectedArea / Math.PI) * scale * 0.58)
                : 4;
            return {
                feature,
                cx,
                cy,
                x: cx,
                y: cy,
                scale,
                radius,
                observed: Number.isFinite(feature.properties.gdp)
            };
        });
        const observedPlacements = placements.filter(item => item.observed && Number.isFinite(item.cx) && Number.isFinite(item.cy));
        const collisionForce = d3.forceSimulation(observedPlacements)
            .randomSource(d3.randomLcg(0.4019))
            .force("x", d3.forceX(item => item.cx).strength(0.16))
            .force("y", d3.forceY(item => item.cy).strength(0.16))
            .force("collision", d3.forceCollide(item => item.radius + 1.5).strength(0.9).iterations(3))
            .stop();
        for (let tick = 0; tick < 220; tick += 1) collisionForce.tick();

        placements.forEach(item => {
            if (!item.observed) return;
            item.x = Math.max(24 + item.radius, Math.min(width - 24 - item.radius, item.x));
            item.y = Math.max(24 + item.radius, Math.min(height - 24 - item.radius, item.y));
        });

        const ordered = placements
            .sort((a, b) => Number(a.observed) - Number(b.observed));
        group.selectAll("path")
            .data(ordered, d => d.feature.properties.iso3 || d.feature.properties.name)
            .join("path")
            .attr("class", "feature")
            .attr("d", d => path(d.feature))
            .attr("fill", d => d.feature.properties.gdp == null ? noDataColor : state.colorScale(d.feature.properties.gdp))
            .attr("transform", d => {
                const { cx, cy, x, y, scale } = d;
                return Number.isFinite(cx) && Number.isFinite(cy)
                    ? `translate(${x} ${y}) scale(${scale}) translate(${-cx} ${-cy})`
                    : null;
            });
        attachCartogramInteractions();
    };

    Promise.all([
        d3.json("../data/lab9_world.geojson?v=collision-fix-1"),
        d3.csv("../data/lab9_gdp_2025_top50.csv?v=collision-fix-1", row => ({
            iso3: row.iso3.trim().toUpperCase(),
            country: row.country.trim(),
            gdp: Number(row.gdp_2025_billion_usd),
            rank: Number(row.rank)
        }))
    ]).then(([geoData, stats]) => {
        stats.forEach(row => state.statsByIso.set(row.iso3, row));
        const values = stats.map(row => row.gdp).filter(Number.isFinite);
        state.colorScale = d3.scaleSequentialLog(d3.interpolateYlGnBu)
            .domain([d3.min(values), d3.max(values)]);

        geoData.features.forEach(feature => {
            const iso3 = feature.properties.iso3;
            const stat = state.statsByIso.get(iso3);
            feature.properties = {
                ...feature.properties,
                country: stat?.country || feature.properties.name || iso3,
                gdp: stat?.gdp ?? null,
                rank: stat?.rank ?? null
            };
        });
        const matched = new Set(
            geoData.features
                .map(feature => feature.properties.iso3)
                .filter(iso3 => state.statsByIso.has(iso3))
        ).size;
        if (matched !== stats.length) console.warn(`GDP join matched ${matched} of ${stats.length} supplied rows.`);
        renderLegend();
        renderChoropleth(geoData);
        renderCartogram(geoData);
    }).catch(showPageError);
})();
