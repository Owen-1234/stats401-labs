const chartContainer = d3.select("#chart");
const tooltip = d3.select("#chart-tooltip");
const publishedDataUrl = "https://owen-1234.github.io/stats401-labs/lab1/data/students.csv";

const parseStudent = d => ({
    name: d.name,
    score: +d.score
});

async function loadStudentData() {
    if (window.location.protocol === "file:") {
        return d3.csv(publishedDataUrl, parseStudent);
    }

    try {
        return await d3.csv("data/students.csv", d => ({
            name: d.name,
            score: +d.score
        }));
    } catch (error) {
        console.warn("Relative CSV unavailable; using the published copy.", error);
        return d3.csv(publishedDataUrl, parseStudent);
    }
}

async function drawChart() {
    try {
        const data = await loadStudentData();

        if (!data.length || data.some(d => !d.name || !Number.isFinite(d.score))) {
            throw new Error("The CSV does not contain valid student score records.");
        }

        const mean = d3.mean(data, d => d.score);
        const median = d3.median(data, d => d.score);
        const highest = d3.greatest(data, d => d.score);
        const lowest = d3.least(data, d => d.score);
        const aboveMean = data.filter(d => d.score > mean).length;

        d3.select("#sample-size").text(`${data.length} students`);
        d3.select("#mean-score").text(d3.format(".1f")(mean));
        d3.select("#highest-score").text(`${highest.name} · ${highest.score}`);
        d3.select("#median-score").text(d3.format(".1f")(median));
        d3.select("#above-mean").text(`${aboveMean} of ${data.length} students`);
        d3.select("#score-range").text(`${highest.score - lowest.score} points`);

        chartContainer.selectAll("*").remove();

        const width = 960;
        const height = 560;
        const margin = { top: 32, right: 28, bottom: 118, left: 58 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        const svg = chartContainer
            .append("svg")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-labelledby", "score-chart-svg-title score-chart-svg-desc");

        svg.append("title")
            .attr("id", "score-chart-svg-title")
            .text("Student score bar chart");

        svg.append("desc")
            .attr("id", "score-chart-svg-desc")
            .text(`Eight vertical bars show scores from ${d3.min(data, d => d.score)} to ${highest.score}. ${highest.name} has the highest score. The mean is ${d3.format(".1f")(mean)}.`);

        const plot = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scaleBand()
            .domain(data.map(d => d.name))
            .range([0, innerWidth])
            .paddingInner(0.3)
            .paddingOuter(0.12);

        const y = d3.scaleLinear()
            .domain([0, 100])
            .range([innerHeight, 0]);

        const guideValues = [0, 25, 50, 75, 100];

        plot.selectAll("line.guide")
            .data(guideValues)
            .join("line")
            .attr("class", "guide")
            .attr("x1", 0)
            .attr("x2", innerWidth)
            .attr("y1", d => y(d))
            .attr("y2", d => y(d))
            .attr("stroke", d => d === 0 ? "#a9afb6" : "#d8d6cd")
            .attr("stroke-width", d => d === 0 ? 1.5 : 1)
            .attr("stroke-dasharray", d => d === 0 ? null : "3 5");

        plot.selectAll("text.guide-label")
            .data(guideValues)
            .join("text")
            .attr("class", "guide-label")
            .attr("x", -12)
            .attr("y", d => y(d))
            .attr("dy", "0.32em")
            .attr("text-anchor", "end")
            .attr("fill", "#6a7583")
            .attr("font-family", "IBM Plex Sans, Arial, sans-serif")
            .attr("font-size", 12)
            .text(d => d);

        plot.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -innerHeight / 2)
            .attr("y", -43)
            .attr("text-anchor", "middle")
            .attr("fill", "#66706f")
            .attr("font-family", "IBM Plex Sans, Arial, sans-serif")
            .attr("font-size", 11)
            .attr("font-weight", 600)
            .attr("letter-spacing", "0.12em")
            .text("SCORE · POINTS");

        const meanGroup = plot.append("g")
            .attr("aria-hidden", "true");

        meanGroup.append("line")
            .attr("x1", 0)
            .attr("x2", innerWidth)
            .attr("y1", y(mean))
            .attr("y2", y(mean))
            .attr("stroke", "#a56c35")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "8 6");

        meanGroup.append("text")
            .attr("x", innerWidth)
            .attr("y", y(mean) - 9)
            .attr("text-anchor", "end")
            .attr("fill", "#875327")
            .attr("font-family", "IBM Plex Sans, Arial, sans-serif")
            .attr("font-size", 12)
            .attr("font-weight", 700)
            .text(`MEAN ${d3.format(".1f")(mean)}`);

        const bars = plot.selectAll("rect.score-bar")
            .data(data)
            .join("rect")
            .attr("class", "score-bar")
            .attr("x", d => x(d.name))
            .attr("y", d => y(d.score))
            .attr("width", x.bandwidth())
            .attr("height", d => innerHeight - y(d.score))
            .attr("fill", d => d === highest ? "#a56c35" : "#264d59")
            .attr("rx", 1)
            .attr("tabindex", 0)
            .attr("role", "graphics-symbol")
            .attr("aria-label", d => `${d.name}, score ${d.score} out of 100`);

        plot.selectAll("line.bar-cap")
            .data(data)
            .join("line")
            .attr("class", "bar-cap")
            .attr("x1", d => x(d.name))
            .attr("x2", d => x(d.name) + x.bandwidth())
            .attr("y1", d => y(d.score))
            .attr("y2", d => y(d.score))
            .attr("stroke", d => d === highest ? "#70431e" : "#17383f")
            .attr("stroke-width", 3)
            .attr("pointer-events", "none");

        const labels = plot.selectAll("g.student-label")
            .data(data)
            .join("g")
            .attr("class", "student-label")
            .attr("transform", d => `translate(${x(d.name) + x.bandwidth() / 2},${innerHeight + 28})`)
            .attr("aria-hidden", "true");

        labels.append("text")
            .attr("text-anchor", "middle")
            .attr("fill", "#17263c")
            .attr("font-family", "IBM Plex Sans, Arial, sans-serif")
            .attr("font-size", 14)
            .attr("font-weight", 700)
            .text(d => d.name);

        labels.append("text")
            .attr("y", 25)
            .attr("text-anchor", "middle")
            .attr("fill", "#4d5b6d")
            .attr("font-family", "IBM Plex Sans, Arial, sans-serif")
            .attr("font-size", 13)
            .text(d => `${d.score} points`);

        labels.append("line")
            .attr("x1", -12)
            .attr("x2", 12)
            .attr("y1", 39)
            .attr("y2", 39)
            .attr("stroke", d => d === highest ? "#a56c35" : "#d3d0c6")
            .attr("stroke-width", 2);

        function showTooltip(event, d) {
            const target = event.currentTarget.getBoundingClientRect();
            tooltip
                .html(`<strong>${d.name}</strong><span>${d.score} points · ${d.score >= mean ? "Above" : "Below"} mean</span>`)
                .style("left", `${target.left + target.width / 2}px`)
                .style("top", `${target.top}px`)
                .classed("visible", true);

            d3.select(event.currentTarget).attr("opacity", 0.82);
        }

        function hideTooltip(event) {
            tooltip.classed("visible", false);
            d3.select(event.currentTarget).attr("opacity", 1);
        }

        bars
            .on("mouseenter focus", showTooltip)
            .on("mouseleave blur", hideTooltip);
    } catch (error) {
        console.error("Unable to render the student score chart:", error);
        chartContainer.html(
            `<p class="chart-error"><strong>The chart could not be loaded.</strong><br>Check your internet connection, then open the published Lab 1 page again.</p>`
        );
        d3.selectAll("#sample-size, #mean-score, #highest-score, #median-score, #above-mean, #score-range").text("Unavailable");
    }
}

drawChart();
