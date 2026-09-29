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
        choroplethPaths: null,
        cartogramProperties: []
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
            .classed("is-selected", function() { return selected != null && this.dataset.iso3 === selected; })
            .classed("is-dimmed", function() { return selected != null && this.dataset.iso3 !== selected; });

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
        const propertiesOf = (datum, element) => datum?.properties || state.cartogramProperties.find(properties => properties.iso3 === element.dataset.iso3) || {};
        features
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr("data-iso3", d => d?.properties?.iso3 || "")
            .attr("aria-label", function() {
                const properties = propertiesOf(null, this);
                return `${properties.country || properties.name || "Unknown economy"}: ${properties.gdp == null ? "no supplied GDP observation" : `$${formatGDP(properties.gdp)} billion`}`;
            })
            .on("mouseenter.lab9 focus.lab9", function(event, d) {
                tooltip.html(tooltipHtml(propertiesOf(d, this))).classed("visible", true);
                positionTooltip(event, tooltip);
            })
            .on("mousemove.lab9", event => positionTooltip(event, tooltip))
            .on("mouseleave.lab9 blur.lab9", () => tooltip.classed("visible", false))
            .on("click keydown", function(event, d) {
                if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                selectCountry(event.currentTarget.dataset.iso3);
            });
        applySelection();
    };

    const renderCartogram = geoData => {
        const container = d3.select("#cartogram-map");
        container.html("");
        const projection = d3.geoNaturalEarth1();
        projection.fitSize([width, height], geoData);
        const path = d3.geoPath(projection);
        const areaPerGDP = 0.32;
        const circleGap = 1.4;
        const components = [];
        const countryNodes = new Map();

        const projectRing = ring => ring
            .map(point => projection(point))
            .filter(point => point && point.every(Number.isFinite));
        const sampleRing = ring => {
            // Keep the boundary detail so the rendered polygon area stays close
            // to the GDP target, especially for small island economies.
            const maxPoints = 5000;
            if (ring.length <= maxPoints) return ring;
            const step = Math.ceil(ring.length / maxPoints);
            return ring.filter((_, index) => index % step === 0);
        };
        const irregularPath = points => points
            .map((point, index) => `${index === 0 ? "M" : "L"}${point[0]},${point[1]}`)
            .join("") + "Z";

        // Some GeoJSON files split one country into several features (for
        // example, Australia and its external territories). Allocate that
        // country's GDP across all of its parts instead of counting it once per
        // feature.
        const countryAreaTotals = new Map();
        geoData.features.forEach(feature => {
            const properties = feature.properties || {};
            if (!Number.isFinite(properties.gdp)) return;
            const geometry = feature.geometry || {};
            const polygons = geometry.type === "Polygon"
                ? [geometry.coordinates]
                : geometry.type === "MultiPolygon"
                    ? geometry.coordinates
                    : [];
            const featureArea = d3.sum(polygons, coordinates => {
                const ring = projectRing(sampleRing(coordinates[0] || []));
                return Math.abs(d3.polygonArea(ring));
            });
            countryAreaTotals.set(properties.iso3, (countryAreaTotals.get(properties.iso3) || 0) + featureArea);
        });

        const svg = container.append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("width", width)
            .attr("height", height)
            .attr("role", "img")
            .attr("aria-label", "World GDP area cartogram with geographic context");
        const contextGroup = svg.append("g").attr("class", "cartogram-context");
        contextGroup.selectAll("path.context-country")
            .data(geoData.features)
            .join("path")
            .attr("class", "context-country")
            .attr("d", feature => path(feature))
            .attr("fill", noDataColor)
            .attr("fill-opacity", feature => feature.properties.gdp == null ? 0.44 : 0.24)
            .attr("stroke", "#cbd3cf")
            .attr("stroke-width", 0.65)
            .attr("vector-effect", "non-scaling-stroke")
            .attr("data-context-iso3", feature => feature.properties.iso3 || "");

        // Each observed country keeps a sampled version of its own projected
        // boundary. The result is irregular and country-specific, rather than
        // a repeated symbol, before the country-level centroid layout runs.
        geoData.features.forEach(feature => {
            const properties = feature.properties || {};
            if (!Number.isFinite(properties.gdp)) return;
            const geometry = feature.geometry || {};
            const polygons = geometry.type === "Polygon"
                ? [geometry.coordinates]
                : geometry.type === "MultiPolygon"
                    ? geometry.coordinates
                    : [];
            const projectedParts = polygons.map(coordinates => {
                const part = {
                    type: "Feature",
                    properties,
                    geometry: { type: "Polygon", coordinates }
                };
                const ring = projectRing(sampleRing(coordinates[0] || []));
                return {
                    part,
                    // Use the same sampled outer ring for the area calculation and
                    // for rendering so the final SVG area tracks GDP predictably.
                    area: Math.abs(d3.polygonArea(ring)),
                    centroid: path.centroid(part),
                    ring,
                    radius: 0,
                    targetScale: 1
                };
            }).filter(part => Number.isFinite(part.area)
                && part.area > 0
                && part.ring.length > 3
                && part.centroid.every(Number.isFinite));
            const totalArea = d3.sum(projectedParts, part => part.area);
            if (!totalArea) return;
            projectedParts.forEach(part => {
                const countryTotalArea = countryAreaTotals.get(properties.iso3) || totalArea;
                const targetArea = properties.gdp * areaPerGDP * (part.area / countryTotalArea);
                const originalPoints = part.ring;
                const originalArea = Math.max(part.area, 0.0001);
                part.targetScale = Math.sqrt(targetArea / originalArea);
                const scaledPoints = originalPoints.map(point => [
                    part.centroid[0] + (point[0] - part.centroid[0]) * part.targetScale,
                    part.centroid[1] + (point[1] - part.centroid[1]) * part.targetScale
                ]);
                part.radius = d3.max(scaledPoints, point => Math.hypot(
                    point[0] - part.centroid[0], point[1] - part.centroid[1]
                )) || 0;
                part.points = scaledPoints;
                const component = {
                    ...part,
                    properties,
                    iso3: properties.iso3 || ""
                };
                components.push(component);

                const node = countryNodes.get(component.iso3) || {
                    iso3: component.iso3,
                    properties,
                    components: [],
                    weightedX: 0,
                    weightedY: 0,
                    weight: 0,
                    radius: 0
                };
                node.components.push(component);
                node.weightedX += component.centroid[0] * part.area;
                node.weightedY += component.centroid[1] * part.area;
                node.weight += part.area;
                node.radius = Math.max(node.radius, component.radius);
                countryNodes.set(component.iso3, node);
            });
        });

        // Preserve each country's irregular GDP-scaled geometry. A country-level
        // force layout moves complete shapes to make room for neighbors; translating
        // a polygon preserves its area exactly, unlike local shrinking.
        const nodes = [...countryNodes.values()].map(node => {
            const anchorX = node.weightedX / node.weight;
            const anchorY = node.weightedY / node.weight;
            const areaRadius = Math.sqrt(node.properties.gdp * areaPerGDP / Math.PI);
            return {
                ...node,
                anchorX,
                anchorY,
                x: anchorX,
                y: anchorY,
                radius: Math.min(120, Math.max(8, node.radius, areaRadius * 0.72))
            };
        });
        const simulation = d3.forceSimulation(nodes)
            .force("x", d3.forceX(node => node.anchorX).strength(0.16))
            .force("y", d3.forceY(node => node.anchorY).strength(0.16))
            .force("collide", d3.forceCollide(node => node.radius + circleGap).strength(1).iterations(3))
            .stop();
        for (let tick = 0; tick < 260; tick += 1) simulation.tick();

        nodes.forEach(node => {
            const margin = Math.min(40, node.radius);
            node.x = Math.max(margin, Math.min(width - margin, node.x));
            node.y = Math.max(margin, Math.min(height - margin, node.y));
            let offsetX = node.x - node.anchorX;
            let offsetY = node.y - node.anchorY;
            const allPoints = node.components.flatMap(component => component.points);
            const minX = d3.min(allPoints, point => point[0] + offsetX);
            const maxX = d3.max(allPoints, point => point[0] + offsetX);
            const minY = d3.min(allPoints, point => point[1] + offsetY);
            const maxY = d3.max(allPoints, point => point[1] + offsetY);
            if (minX < 2) offsetX += 2 - minX;
            if (maxX > width - 2) offsetX -= maxX - (width - 2);
            if (minY < 2) offsetY += 2 - minY;
            if (maxY > height - 2) offsetY -= maxY - (height - 2);
            node.components.forEach(component => {
                component.finalScale = component.targetScale;
                component.pathD = irregularPath(component.points.map(point => [
                    point[0] + offsetX,
                    point[1] + offsetY
                ]));
            });
        });
        state.cartogramProperties = components.map(component => component.properties);
        svg.selectAll("path.feature")
            .data(components)
            .join("path")
            .attr("class", "feature")
            .attr("d", component => component.pathD)
            .attr("fill", component => component.properties.gdp == null ? noDataColor : state.colorScale(component.properties.gdp))
            .attr("data-cartogram", "true")
            .attr("data-iso3", component => component.iso3)
            .attr("data-cartogram-scale", component => component.finalScale)
            .attr("data-cartogram-safety", "1")
            .attr("data-cartogram-limiting-pair", "centroid-force-layout")
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr("aria-label", component => `${component.properties.country || component.properties.name || "Unknown economy"}: ${component.properties.gdp == null ? "no supplied GDP observation" : `$${formatGDP(component.properties.gdp)} billion`}`);
        attachCartogramInteractions();
        return components;
    };

    Promise.all([
        d3.json("../data/lab9_world.geojson?v=cartogram-1"),
        d3.csv("../data/lab9_gdp_2025_top50.csv?v=cartogram-1", row => ({
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
