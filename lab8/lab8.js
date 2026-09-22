(() => {
  "use strict";
  const palette = ["#367a72", "#9b5c43", "#426f9c", "#75618e", "#a4742f", "#a43f5b", "#517e48", "#8b6a29", "#447f8c", "#665f50"];
  const keyOf = d => `${d.chapter}|||${d.section}`;
  const $ = id => document.getElementById(id);
  const short = (s, n = 34) => s.length > n ? `${s.slice(0, n - 1)}…` : s;
  const matchesQuery = (text, query) => {
    if (!query) return true;
    if (/^[a-z]{4,}$/.test(query)) return new RegExp(`\\b${query}[a-z]*\\b`, "i").test(text);
    return text.toLowerCase().includes(query);
  };
  const tooltip = d3.select("#chart-tooltip");
  const hideTip = () => tooltip.classed("visible", false);
  const showTip = (event, lines) => {
    tooltip.html("");
    lines.forEach((line, i) => tooltip.append(i === 0 ? "strong" : "span").text(line));
    tooltip.style("left", `${Math.min(window.innerWidth - 150, Math.max(150, event.clientX))}px`)
      .style("top", `${event.clientY - 10}px`).classed("visible", true);
  };

  Promise.all([
    d3.csv("data/lab8_embedding_map.csv", d => ({...d, page: +d.page, word_count: +d.word_count,
      cluster: +d.cluster, x: +d.x, y: +d.y,
      neighbor_ids: d.neighbor_ids ? d.neighbor_ids.split("|") : [],
      neighbor_scores: d.neighbor_scores ? d.neighbor_scores.split("|").map(Number) : []})),
    d3.csv("data/lab8_topic_section_matrix.csv", d => ({...d, cluster: +d.cluster,
      count: +d.count, section_total: +d.section_total, proportion: +d.proportion})),
    d3.json("data/corpus_report.json"),
    d3.json("data/overview.json")
  ]).then(([data, matrix, report, overview]) => {
    const byId = new Map(data.map(d => [d.passage_id, d]));
    const topics = d3.rollups(data, v => v.length, d => d.cluster)
      .sort((a, b) => a[0] - b[0]).map(([cluster, count]) => ({cluster, count, name: data.find(d => d.cluster === cluster).cluster_name}));
    const chapters = [...new Set(data.map(d => d.chapter))].sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
    const sections = d3.rollups(data, v => v.length, d => keyOf(d)).map(([key, count]) => ({key, count, row: data.find(d => keyOf(d) === key)}));
    const state = {query: "", topic: "", section: "", chapter: "", selected: null, cell: null};

    // Corpus metrics and two required corpus-level summaries.
    const metrics = [
      ["Raw candidate blocks", report.raw_candidate_blocks.toLocaleString()],
      ["Clean passages", report.clean_passages.toLocaleString()],
      ["Mean passage length", `${report.average_words_per_passage} words`],
      ["Formal sections", report.formal_sections.toLocaleString()]
    ];
    d3.select("#corpus-metrics").selectAll("div").data(metrics).join("div")
      .attr("class", "meta-item").html(d => `<span class="meta-label">${d[0]}</span><span class="meta-value">${d[1]}</span>`);
    drawBars("#section-overview", overview.section_counts.slice(0, 8).map(d => ({label: d.section, value: d.count})), "#426f73");
    drawBars("#term-overview", overview.top_term_scores.slice(0, 8).map(d => ({label: d.term, value: d.mean_tfidf})), "#a56c35", false);

    const topicSelect = d3.select("#topic-filter");
    topicSelect.selectAll("option.topic").data(topics).join("option").attr("class", "topic")
      .attr("value", d => d.cluster).text(d => d.name);
    const sectionSelect = d3.select("#section-filter");
    chapters.forEach(ch => {
      const group = sectionSelect.append("optgroup").attr("label", ch);
      sections.filter(s => s.row.chapter === ch).sort((a,b) => a.row.section.localeCompare(b.row.section))
        .forEach(s => group.append("option").attr("value", s.key).text(s.row.section));
    });
    d3.select("#matrix-chapter").selectAll("option.chapter").data(chapters).join("option")
      .attr("class", "chapter").attr("value", d => d).text(d => d.replace(/^Part \d+: /, ""));
    d3.select("#topic-legend").selectAll("span").data(topics).join("span")
      .html(d => `<i style="background:${palette[d.cluster]}"></i>${d.cluster + 1}. ${d.name} (${d.count})`);

    // Semantic map.
    const mapW = 820, mapH = 560, pad = 32;
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.x)).range([pad, mapW - pad]);
    const y = d3.scaleLinear().domain(d3.extent(data, d => d.y)).range([mapH - pad, pad]);
    const radius = d3.scaleSqrt().domain(d3.extent(data, d => d.word_count)).range([2.4, 7]);
    const svg = d3.select("#semantic-map").append("svg").attr("viewBox", `0 0 ${mapW} ${mapH}`)
      .attr("role", "img").attr("aria-label", "UMAP semantic map. Select a point to read the passage and its nearest neighbors.");
    const zoomLayer = svg.append("g");
    const zoom = d3.zoom().scaleExtent([.75, 12]).on("zoom", event => zoomLayer.attr("transform", event.transform));
    svg.call(zoom);
    const points = zoomLayer.selectAll("circle").data(data).join("circle")
      .attr("class", "map-point").attr("cx", d => x(d.x)).attr("cy", d => y(d.y))
      .attr("r", d => radius(d.word_count)).attr("fill", d => palette[d.cluster])
      .attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", d => `${d.cluster_name}, ${d.section}, page ${d.page}`)
      .on("click", (event, d) => { event.stopPropagation(); selectPassage(d.passage_id); })
      .on("keydown", (event, d) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectPassage(d.passage_id); } })
      .on("mouseenter", (event, d) => showTip(event, [d.cluster_name, `${d.section} · p. ${d.page}`, short(d.text, 85)]))
      .on("mousemove", (event, d) => showTip(event, [d.cluster_name, `${d.section} · p. ${d.page}`, short(d.text, 85)]))
      .on("mouseleave", hideTip);
    svg.on("click", () => { state.selected = null; state.cell = null; updateMap(); updateMatrix(); clearDetail(); });

    function updateMap() {
      const current = state.selected ? byId.get(state.selected) : null;
      const neighborSet = new Set(current ? current.neighbor_ids : []);
      let shown = 0, searchMatches = 0;
      points.each(function(d) {
        const inFilters = (state.topic === "" || d.cluster === +state.topic) &&
          (state.section === "" || keyOf(d) === state.section);
        const special = d.passage_id === state.selected || neighborSet.has(d.passage_id);
        const visible = inFilters || special;
        if (inFilters) shown++;
        const found = matchesQuery(d.text, state.query);
        if (inFilters && found) searchMatches++;
        const inCell = !state.cell || !!state.selected || (keyOf(d) === state.cell.key && d.cluster === state.cell.cluster);
        d3.select(this).style("display", visible ? null : "none")
          .classed("dimmed", !found || !inCell)
          .classed("match", !!state.query && found && inCell)
          .classed("neighbor", neighborSet.has(d.passage_id))
          .classed("selected", d.passage_id === state.selected);
      });
      $("map-status").textContent = `${shown.toLocaleString()} passages in current filters` +
        (state.query ? ` · ${searchMatches.toLocaleString()} text matches` : "") +
        (state.cell ? " · matrix cell highlighted" : "") +
        (current ? " · five semantic neighbors highlighted" : "");
    }

    function clearDetail() {
      const panel = d3.select("#detail-panel"); panel.html("");
      panel.append("p").attr("class", "section-kicker").text("Selected passage");
      panel.append("h3").attr("id", "detail-title").text("Select a point");
      panel.append("p").text("Click a point or a matrix cell to inspect its source and related passages.");
    }
    function selectPassage(id) {
      const d = byId.get(id); if (!d) return;
      state.selected = id; state.cell = {key: keyOf(d), cluster: d.cluster};
      const panel = d3.select("#detail-panel"); panel.html("");
      panel.append("p").attr("class", "section-kicker").text(`Passage ${d.passage_id}`);
      panel.append("h3").attr("id", "detail-title").text(d.section);
      const meta = panel.append("dl").attr("class", "detail-meta");
      [["Chapter", d.chapter], ["Section", d.section], ["Subsection", d.subsection || "—"],
        ["Page", String(d.page)], ["Semantic topic", d.cluster_name], ["Length", `${d.word_count} words`]]
        .forEach(([label, value]) => { meta.append("dt").text(label); meta.append("dd").text(value); });
      panel.append("p").attr("class", "detail-text").text(d.text);
      panel.append("a").attr("class", "source-page").attr("href", `data/V2021-22_DKU_UG_Bulletin.pdf#page=${d.page}`)
        .attr("target", "_blank").attr("rel", "noopener").text(`Read source page ${d.page} ↗`);
      panel.append("h4").text("Five nearest semantic passages");
      const list = panel.append("ol").attr("class", "neighbor-list");
      d.neighbor_ids.forEach((nid, i) => {
        const n = byId.get(nid); if (!n) return;
        const li = list.append("li");
        li.append("button").attr("type", "button").text(`${n.section} · p. ${n.page}`)
          .on("click", () => selectPassage(nid));
        li.append("span").text(` · cosine ${d.neighbor_scores[i].toFixed(2)} · ${short(n.text, 80)}`);
      });
      updateMap(); updateMatrix();
    }
    d3.selectAll(".passage-button").on("click", function() {
      selectPassage(this.dataset.passage);
      $("semantic-map").scrollIntoView({behavior: "smooth", block: "center"});
    });

    // Formal section × semantic topic matrix. All sections remain accessible by scrolling or chapter selection.
    const cellW = 57, rowH = 27, labelW = 335, headerH = 62;
    const countByKey = new Map(matrix.map(d => [`${keyOf(d)}|||${d.cluster}`, d]));
    const sectionRows = sections.sort((a,b) => chapters.indexOf(a.row.chapter) - chapters.indexOf(b.row.chapter) || a.row.section.localeCompare(b.row.section));
    function updateMatrix() {
      const rows = sectionRows.filter(s => !state.chapter || s.row.chapter === state.chapter);
      const width = labelW + cellW * topics.length + 16;
      const height = headerH + rowH * rows.length + 8;
      const root = d3.select("#matrix-container"); root.html("");
      const chart = root.append("svg").attr("width", width).attr("height", height)
        .attr("role", "img").attr("aria-label", "Topic by formal bulletin section matrix");
      chart.selectAll("text.col").data(topics).join("text").attr("class", "matrix-col-label")
        .attr("x", d => labelW + d.cluster * cellW + cellW / 2).attr("y", 36)
        .attr("text-anchor", "middle").text(d => `T${d.cluster + 1}`)
        .append("title").text(d => d.name);
      chart.append("text").attr("class", "matrix-col-label").attr("x", 12).attr("y", 36).text("FORMAL SECTION");
      rows.forEach((s, ri) => {
        const ypos = headerH + ri * rowH;
        chart.append("text").attr("class", "matrix-row-label").attr("x", 12).attr("y", ypos + 18)
          .text(short(s.row.section, 47)).append("title").text(`${s.row.chapter} · ${s.row.section} (${s.count} passages)`);
        topics.forEach(t => {
          const item = countByKey.get(`${s.key}|||${t.cluster}`);
          const count = item ? item.count : 0;
          const share = count / s.count;
          const selected = state.cell && state.cell.key === s.key && state.cell.cluster === t.cluster;
          chart.append("rect").attr("class", `matrix-cell${selected ? " active" : ""}`)
            .attr("x", labelW + t.cluster * cellW).attr("y", ypos)
            .attr("width", cellW - 2).attr("height", rowH - 2)
            .attr("fill", count ? d3.interpolateRgb("#edf0eb", palette[t.cluster])(Math.min(.95, .17 + Math.sqrt(share) * .82)) : "#f2f0e9")
            .attr("tabindex", 0).attr("role", "button")
            .attr("aria-label", `${s.row.section}, ${t.name}: ${count} ${count === 1 ? "passage" : "passages"}, ${(share*100).toFixed(1)} percent`)
            .on("mouseenter", event => showTip(event, [s.row.section, t.name, `${count} ${count === 1 ? "passage" : "passages"} · ${(share*100).toFixed(1)}% of section`]))
            .on("mousemove", event => showTip(event, [s.row.section, t.name, `${count} ${count === 1 ? "passage" : "passages"} · ${(share*100).toFixed(1)}% of section`]))
            .on("mouseleave", hideTip)
            .on("focus", function() { const box = this.getBoundingClientRect(); showTip({clientX: box.left + box.width / 2, clientY: box.top}, [s.row.section, t.name, `${count} ${count === 1 ? "passage" : "passages"} · ${(share*100).toFixed(1)}% of section`]); })
            .on("blur", hideTip)
            .on("click", () => selectCell(s, t, count))
            .on("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectCell(s, t, count); } });
        });
      });
      $("matrix-status").textContent = `${rows.length} formal sections shown · ${topics.length} semantic topics · T1–T10 correspond to the legend above`;
    }
    function selectCell(s, t, count) {
      state.cell = {key: s.key, cluster: t.cluster}; state.selected = null;
      state.topic = ""; state.section = ""; state.query = "";
      topicSelect.property("value", ""); sectionSelect.property("value", ""); $("search").value = "";
      const panel = d3.select("#detail-panel"); panel.html("");
      panel.append("p").attr("class", "section-kicker").text("Matrix selection");
      panel.append("h3").attr("id", "detail-title").text(s.row.section);
      panel.append("p").text(`${t.name}: ${count} of ${s.count} passages in this formal section (${(100*count/s.count).toFixed(1)}%).`);
      if (count) {
        panel.append("h4").text("Passages in this cell");
        const list = panel.append("ol").attr("class", "neighbor-list");
        data.filter(d => keyOf(d) === s.key && d.cluster === t.cluster).slice(0, 12).forEach(d => {
          list.append("li").append("button").attr("type", "button")
            .text(`p. ${d.page} · ${short(d.text, 100)}`).on("click", () => selectPassage(d.passage_id));
        });
      }
      updateMap(); updateMatrix();
      $("semantic-map").scrollIntoView({behavior: "smooth", block: "center"});
    }

    d3.select("#search").on("input", event => { state.query = event.target.value.trim().toLowerCase(); updateMap(); });
    topicSelect.on("change", event => { state.topic = event.target.value; updateMap(); });
    sectionSelect.on("change", event => { state.section = event.target.value; updateMap(); });
    d3.select("#matrix-chapter").on("change", event => { state.chapter = event.target.value; updateMatrix(); });
    d3.select("#reset-map").on("click", () => {
      state.query = state.topic = state.section = ""; state.selected = state.cell = null;
      $("search").value = ""; topicSelect.property("value", ""); sectionSelect.property("value", "");
      svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity);
      clearDetail(); updateMap(); updateMatrix();
    });
    updateMap(); updateMatrix();

    function drawBars(selector, items, color, quantitative = true) {
      const width = 520, row = 28, left = 220, right = 42;
      const max = d3.max(items, d => d.value) || 1;
      const chart = d3.select(selector).append("svg").attr("viewBox", `0 0 ${width} ${items.length*row+8}`);
      items.forEach((d, i) => {
        const yy = i * row + 2;
        chart.append("text").attr("x", 0).attr("y", yy+17).attr("fill", "#596664")
          .attr("font-size", 11).text(short(d.label, 31)).append("title").text(d.label);
        chart.append("rect").attr("x", left).attr("y", yy+5).attr("width", width-left-right).attr("height", 15).attr("fill", "#e8e6de");
        chart.append("rect").attr("x", left).attr("y", yy+5)
          .attr("width", (width-left-right)*d.value/max).attr("height", 15).attr("fill", color);
        chart.append("text").attr("x", width - 2).attr("y", yy+17).attr("text-anchor", "end")
          .attr("font-size", 11).attr("fill", "#172724")
          .text(quantitative ? d.value : d.value.toFixed(3));
      });
    }
  }).catch(error => {
    console.error(error);
    $("map-status").textContent = "The visualization data could not be loaded. Please reload the page.";
  });
})();
