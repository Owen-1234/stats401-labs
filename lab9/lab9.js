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
        const observedValues = geoData.features
            .map(feature => feature.properties.gdp)
            .filter(Number.isFinite);
        const noDataValue = d3.min(observedValues) * 0.01;
        const areaPerGDP = 0.02;
        const components = [];

        // Each polygon component is scaled around its own geographic centroid.
        // This keeps country locations stable while preventing distant islands
        // from forcing the mainland into an oversized collision envelope.
        geoData.features.forEach(feature => {
            const properties = feature.properties || {};
            if (properties.iso3 === "ATA") return;
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
                return {
                    part,
                    area: Math.abs(path.area(part)),
                    centroid: path.centroid(part),
                    bounds: path.bounds(part)
                };
            }).filter(part => Number.isFinite(part.area) && part.area > 0);
            const totalArea = d3.sum(projectedParts, part => part.area);
            if (!totalArea) return;
            const weight = Number.isFinite(properties.gdp) ? properties.gdp : noDataValue;
            const rawScale = Math.sqrt((weight * areaPerGDP) / totalArea);
            const maxScale = Number.isFinite(properties.gdp) ? 0.8 : 0.04;
            const scale = Math.min(rawScale, maxScale);
            projectedParts.forEach(part => components.push({
                ...part,
                properties,
                scale,
                iso3: properties.iso3 || ""
            }));
        });

        // Resolve local collisions instead of shrinking every country because
        // of one crowded region. The boxes are conservative, so polygons
        // themselves remain disjoint after the loop.
        const boxesOverlap = (a, b) => a[0][0] < b[1][0] && a[1][0] > b[0][0]
            && a[0][1] < b[1][1] && a[1][1] > b[0][1];
        const transformedBounds = component => {
            const [[minX, minY], [maxX, maxY]] = component.bounds;
            const [cx, cy] = component.centroid;
            const s = component.scale;
            return [
                [cx + (minX - cx) * s, cy + (minY - cy) * s],
                [cx + (maxX - cx) * s, cy + (maxY - cy) * s]
            ];
        };
        for (let pass = 0; pass < 220; pass += 1) {
            const boxes = components.map(transformedBounds);
            let overlap = false;
            for (let i = 0; i < boxes.length && !overlap; i += 1) {
                for (let j = i + 1; j < boxes.length; j += 1) {
                    if (components[i].iso3 && components[i].iso3 === components[j].iso3) continue;
                    if (boxesOverlap(boxes[i], boxes[j])) {
                        overlap = true;
                        components[i].scale *= 0.94;
                        components[j].scale *= 0.94;
                        break;
                    }
                }
            }
            if (!overlap) break;
        }
        components.forEach(component => {
            component.finalScale = component.scale;
            component.transform = `translate(${component.centroid[0]},${component.centroid[1]}) scale(${component.finalScale}) translate(${-component.centroid[0]},${-component.centroid[1]})`;
        });
        state.cartogramProperties = components.map(component => component.properties);
        const svg = container.append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("width", width)
            .attr("height", height)
            .attr("role", "img")
            .attr("aria-label", "Non-overlapping GDP area cartogram of 2025 nominal GDP");
        svg.selectAll("path.feature")
            .data(components)
            .join("path")
            .attr("class", "feature")
            .attr("d", component => path(component.part))
            .attr("transform", component => component.transform)
            .attr("fill", component => component.properties.gdp == null ? noDataColor : state.colorScale(component.properties.gdp))
            .attr("data-cartogram", "true")
            .attr("data-iso3", component => component.iso3)
            .attr("data-cartogram-scale", component => component.finalScale)
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
