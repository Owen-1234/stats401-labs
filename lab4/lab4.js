const cleanDataUrl = "data/lab4_clean_tweets.csv";
const publishedDataUrl = "https://owen-1234.github.io/stats401-labs/lab4/data/lab4_clean_tweets.csv";

const topics = ["Coding", "Education", "Work", "Reliability"];
const sentiments = ["Negative", "Neutral", "Positive"];
const colors = new Map([["Negative", "#87464a"], ["Neutral", "#858a82"], ["Positive", "#2f6d70"]]);
const formatCount = d3.format(",");
const formatPercent = d3.format(".1%");
const formatScore = d3.format("+.2f");

const parseTweet = d => ({
    tweet_id: d.tweet_id,
    created_at: new Date(d.created_at),
    date: d.date,
    topic: d.topic,
    sentiment: d.sentiment,
    reply_count: +d.reply_count,
    retweet_count: +d.retweet_count,
    like_count: +d.like_count,
    quote_count: +d.quote_count,
    engagement_total: +d.engagement_total,
    sentiment_score: +d.sentiment_score
});

async function loadCleanData() {
    if (window.location.protocol === "file:") return d3.csv(publishedDataUrl, parseTweet);
    try {
        return await d3.csv(cleanDataUrl, parseTweet);
    } catch (error) {
        console.warn("Relative CSV unavailable; using the published copy.", error);
        return d3.csv(publishedDataUrl, parseTweet);
    }
}

function validateData(data) {
    return data.length >= 1000 && data.every(d =>
        d.tweet_id && topics.includes(d.topic) && sentiments.includes(d.sentiment) &&
        Number.isFinite(d.engagement_total) && Number.isFinite(d.sentiment_score) &&
        d.sentiment_score >= -1 && d.sentiment_score <= 1
    );
}

function summarize(data) {
    const topicRows = topics.map(topic => {
        const rows = data.filter(d => d.topic === topic);
        const sentimentRows = sentiments.map(sentiment => {
            const subset = rows.filter(d => d.sentiment === sentiment);
            return {
                topic, sentiment, count: subset.length, share: subset.length / rows.length,
                interactionRate: d3.mean(subset, d => d.engagement_total > 0 ? 1 : 0),
                meanScore: d3.mean(subset, d => d.sentiment_score),
                meanEngagement: d3.mean(subset, d => d.engagement_total),
                medianEngagement: d3.median(subset, d => d.engagement_total)
            };
        });
        return {
            topic, count: rows.length, meanScore: d3.mean(rows, d => d.sentiment_score),
            interactionRate: d3.mean(rows, d => d.engagement_total > 0 ? 1 : 0), sentiments: sentimentRows
        };
    });
    return { total: data.length, topics: topicRows, cells: topicRows.flatMap(d => d.sentiments) };
}

function updateSummary(summary) {
    const negative = summary.cells.filter(d => d.sentiment === "Negative").sort((a, b) => d3.descending(a.share, b.share))[0];
    const positive = summary.cells.filter(d => d.sentiment === "Positive").sort((a, b) => d3.descending(a.share, b.share))[0];
    const interaction = [...summary.cells].sort((a, b) => d3.descending(a.interactionRate, b.interactionRate))[0];
    d3.select("#record-count").text(formatCount(summary.total));
    d3.select("#records-fact").text(`${formatCount(summary.total)} tweets`);
    d3.select("#most-negative").text(`${negative.topic} · ${formatPercent(negative.share)}`);
    d3.select("#most-positive").text(`${positive.topic} · ${formatPercent(positive.share)}`);
    d3.select("#highest-interaction").text(`${interaction.topic}, ${interaction.sentiment} · ${formatPercent(interaction.interactionRate)}`);
}

function positionTooltip(event, target) {
    const tooltip = d3.select("#chart-tooltip");
    const bounds = tooltip.node().getBoundingClientRect();
    const targetBounds = target?.getBoundingClientRect();
    const pointX = event?.clientX || (targetBounds ? targetBounds.right : window.innerWidth / 2);
    const pointY = event?.clientY || (targetBounds ? targetBounds.top : window.innerHeight / 2);
    const gap = 14;
    const left = Math.min(pointX + gap, window.innerWidth - bounds.width - gap);
    const top = Math.min(pointY + gap, window.innerHeight - bounds.height - gap);
    tooltip.style("left", `${Math.max(gap, left)}px`).style("top", `${Math.max(gap, top)}px`);
}

function tooltipMarkup(d) {
    return `<strong>${d.topic} · ${d.sentiment}</strong>
        <span class="tooltip-row"><span>Tweets</span><b>${formatCount(d.count)}</b></span>
        <span class="tooltip-row"><span>Topic share</span><b>${formatPercent(d.share)}</b></span>
        <span class="tooltip-row"><span>Received interaction</span><b>${formatPercent(d.interactionRate)}</b></span>
        <span class="tooltip-row"><span>Mean sentiment score</span><b>${formatScore(d.meanScore)}</b></span>
        <span class="tooltip-row"><span>Median interactions</span><b>${d3.format(",.0f")(d.medianEngagement)}</b></span>`;
}

function attachTooltip(selection) {
    const tooltip = d3.select("#chart-tooltip");
    selection
        .on("pointerenter pointermove", function(event, d) {
            tooltip.html(tooltipMarkup(d)).classed("visible", true);
            positionTooltip(event, this);
        })
        .on("pointerleave", () => tooltip.classed("visible", false))
        .on("focus", function(event, d) {
            tooltip.html(tooltipMarkup(d)).classed("visible", true);
            positionTooltip(event, this);
        })
        .on("blur", () => tooltip.classed("visible", false));
}

function renderSentimentChart(summary) {
    const container = d3.select("#sentiment-chart");
    container.selectAll("*").remove();
    const width = 660, height = 350;
    const margin = { top: 30, right: 18, bottom: 48, left: 106 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const x = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
    const y = d3.scaleBand().domain(topics).range([0, innerHeight]).padding(0.35);
    const svg = container.append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img").attr("aria-labelledby", "sentiment-svg-title sentiment-svg-desc");
    svg.append("title").attr("id", "sentiment-svg-title").text("Model-predicted sentiment distribution across four ChatGPT discussion topics");
    svg.append("desc").attr("id", "sentiment-svg-desc").text("Four normalized stacked bars compare negative, neutral, and positive tweet shares. Reliability has the largest negative share; Coding has the largest positive share.");
    const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    plot.append("g").attr("class", "chart-axis").attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));
    plot.selectAll("text.topic-label").data(summary.topics).join("text").attr("class", "topic-label")
        .attr("x", -12).attr("y", d => y(d.topic) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text(d => d.topic);
    summary.topics.forEach(topicRow => {
        let runningShare = 0;
        topicRow.sentiments.forEach(cell => { cell.x0 = runningShare; cell.x1 = runningShare + cell.share; runningShare = cell.x1; });
    });
    const segments = plot.selectAll("rect.sentiment-segment").data(summary.cells).join("rect")
        .attr("class", "sentiment-segment chart-mark").attr("x", d => x(d.x0)).attr("y", d => y(d.topic))
        .attr("width", d => Math.max(0, x(d.x1) - x(d.x0))).attr("height", y.bandwidth()).attr("rx", 1)
        .attr("fill", d => colors.get(d.sentiment)).attr("tabindex", 0).attr("role", "img")
        .attr("aria-label", d => `${d.topic}, ${d.sentiment}: ${formatPercent(d.share)}, ${formatCount(d.count)} tweets`);
    attachTooltip(segments);
    plot.selectAll("text.segment-label").data(summary.cells.filter(d => d.share >= 0.13)).join("text")
        .attr("class", "segment-label").attr("x", d => x((d.x0 + d.x1) / 2))
        .attr("y", d => y(d.topic) + y.bandwidth() / 2 + 4).attr("text-anchor", "middle").text(d => formatPercent(d.share));
    plot.append("text").attr("class", "chart-label").attr("x", innerWidth / 2).attr("y", innerHeight + 43)
        .attr("text-anchor", "middle").text("Share of topic tweets");
}

function renderInteractionChart(summary) {
    const container = d3.select("#interaction-chart");
    container.selectAll("*").remove();
    const width = 610, height = 350;
    const margin = { top: 30, right: 26, bottom: 48, left: 106 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const extent = d3.extent(summary.cells, d => d.interactionRate);
    const x = d3.scaleLinear().domain([Math.floor((extent[0] - 0.04) * 10) / 10, Math.ceil((extent[1] + 0.03) * 10) / 10]).range([0, innerWidth]);
    const y = d3.scaleBand().domain(topics).range([0, innerHeight]).padding(0.24);
    const offsets = new Map([["Negative", -13], ["Neutral", 0], ["Positive", 13]]);
    const radius = d3.scaleSqrt().domain(d3.extent(summary.cells, d => d.count)).range([6, 11]);
    const svg = container.append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img").attr("aria-labelledby", "interaction-svg-title interaction-svg-desc");
    svg.append("title").attr("id", "interaction-svg-title").text("Interaction rate by ChatGPT discussion topic and predicted sentiment");
    svg.append("desc").attr("id", "interaction-svg-desc").text("Colored dots show the percentage of tweets receiving at least one interaction. Dot size represents the number of tweets in each group.");
    const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    plot.selectAll("line.interaction-baseline").data(x.ticks(5)).join("line").attr("class", "interaction-baseline")
        .attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", innerHeight);
    plot.append("g").attr("class", "chart-axis").attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));
    plot.selectAll("text.topic-label").data(summary.topics).join("text").attr("class", "topic-label")
        .attr("x", -12).attr("y", d => y(d.topic) + y.bandwidth() / 2 + 4).attr("text-anchor", "end").text(d => d.topic);
    plot.selectAll("line.interaction-guide").data(summary.topics).join("line").attr("class", "interaction-guide")
        .attr("x1", d => x(d3.min(d.sentiments, row => row.interactionRate)))
        .attr("x2", d => x(d3.max(d.sentiments, row => row.interactionRate)))
        .attr("y1", d => y(d.topic) + y.bandwidth() / 2).attr("y2", d => y(d.topic) + y.bandwidth() / 2);
    const dots = plot.selectAll("circle.interaction-dot").data(summary.cells).join("circle")
        .attr("class", "interaction-dot chart-mark").attr("cx", d => x(d.interactionRate))
        .attr("cy", d => y(d.topic) + y.bandwidth() / 2 + offsets.get(d.sentiment)).attr("r", d => radius(d.count))
        .attr("fill", d => colors.get(d.sentiment)).attr("stroke", "#fbfaf5").attr("stroke-width", 1.5)
        .attr("tabindex", 0).attr("role", "img")
        .attr("aria-label", d => `${d.topic}, ${d.sentiment}: ${formatPercent(d.interactionRate)} received interaction, ${formatCount(d.count)} tweets`);
    attachTooltip(dots);
    plot.append("text").attr("class", "chart-label").attr("x", innerWidth / 2).attr("y", innerHeight + 43)
        .attr("text-anchor", "middle").text("Tweets receiving at least one interaction");
}

function showError(error) {
    console.error(error);
    d3.selectAll("#sentiment-chart, #interaction-chart")
        .html('<p class="chart-error">The cleaned tweet data could not be loaded. Serve the repository through a local web server or open the published GitHub Pages site.</p>');
}

loadCleanData().then(data => {
    if (!validateData(data)) throw new Error("Cleaned tweet data failed validation.");
    const summary = summarize(data);
    updateSummary(summary);
    renderSentimentChart(summary);
    renderInteractionChart(summary);
}).catch(showError);
