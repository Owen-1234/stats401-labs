(() => {
  "use strict";

  const input = document.getElementById("command-input");
  const form = document.getElementById("command-form");
  const runButton = document.getElementById("run-command");
  const voiceButton = document.getElementById("voice-button");
  const status = document.getElementById("interaction-status");
  const map = document.getElementById("semantic-map");
  const topicSelect = document.getElementById("topic-filter");
  const sectionSelect = document.getElementById("section-filter");
  const chapterSelect = document.getElementById("matrix-chapter");
  const search = document.getElementById("search");
  const resetButton = document.getElementById("reset-map");
  const resultNavigator = document.getElementById("result-navigator");
  const detailPanel = document.getElementById("detail-panel");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let ready = false;
  let listening = false;
  let programmaticReset = false;

  function normalize(value) {
    return value.toLowerCase().trim().replace(/[.,!?;:]+$/g, "").replace(/\s+/g, " ");
  }

  function resetControls() {
    programmaticReset = true;
    try {
      resetButton.click();
    } finally {
      programmaticReset = false;
    }
  }

  function matchesQuery(text, query) {
    if (!query) return true;
    if (/^[a-z]{4,}$/.test(query)) return new RegExp(`\\b${query}[a-z]*\\b`, "i").test(text);
    return text.toLowerCase().includes(query);
  }

  function renderResultNavigator() {
    if (!ready) return 0;
    const query = search.value.trim().toLowerCase();
    const topic = topicSelect.value;
    const section = sectionSelect.value;
    if (!query && !topic && !section) {
      resultNavigator.hidden = true;
      resultNavigator.replaceChildren();
      return 0;
    }

    const matches = Array.from(map.querySelectorAll("circle.map-point"))
      .map(element => ({element, passage: element.__data__}))
      .filter(({passage}) => passage &&
        (!topic || passage.cluster === Number(topic)) &&
        (!section || `${passage.chapter}|||${passage.section}` === section) &&
        matchesQuery(passage.text, query))
      .sort((a, b) => a.passage.page - b.passage.page || a.passage.passage_id.localeCompare(b.passage.passage_id));

    const heading = document.createElement("h3");
    heading.textContent = "Matching passages";
    const count = document.createElement("p");
    count.className = "result-count";
    count.setAttribute("role", "status");
    count.textContent = matches.length
      ? `${matches.length.toLocaleString()} matches · first ${Math.min(5, matches.length)} by page`
      : "No passages match these controls";
    resultNavigator.replaceChildren(heading, count);

    if (matches.length) {
      const list = document.createElement("ol");
      for (const {element, passage} of matches.slice(0, 5)) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        const label = document.createElement("strong");
        label.textContent = passage.section;
        const page = document.createElement("small");
        page.textContent = `Page ${passage.page}`;
        const excerpt = document.createElement("span");
        const text = passage.text.replace(/\s+/g, " ");
        const matchPosition = query ? Math.max(0, text.toLowerCase().indexOf(query)) : 0;
        const start = Math.max(0, matchPosition - 30);
        excerpt.textContent = `${start ? "…" : ""}${text.slice(start, start + 125)}${text.length > start + 125 ? "…" : ""}`;
        button.setAttribute("aria-label", `${passage.section}, page ${passage.page}. ${excerpt.textContent}`);
        button.append(label, page, excerpt);
        button.addEventListener("click", () => {
          element.dispatchEvent(new MouseEvent("click", {bubbles: true}));
          detailPanel.scrollIntoView({behavior: "smooth", block: "nearest"});
        });
        item.append(button);
        list.append(item);
      }
      resultNavigator.append(list);
    }
    resultNavigator.hidden = false;
    return matches.length;
  }

  function handleCommand(raw, source) {
    const command = normalize(raw);
    const prefix = source === "voice" ? `Heard: “${raw.trim()}”. ` : source === "example" ? `Example: “${raw.trim()}”. ` : `Typed: “${raw.trim()}”. `;
    if (!command) {
      status.textContent = "Enter a command. Try “Find credit”, “Show policy”, or “Reset view”.";
      return;
    }
    if (/^(reset|reset view|clear|clear filters)$/.test(command)) {
      resetControls();
      status.textContent = `${prefix}Action: view reset.`;
      return;
    }
    const searchMatch = command.match(/^(?:find|search for|search) (.+)$/);
    if (searchMatch) {
      const term = searchMatch[1].trim();
      resetControls();
      search.value = term;
      search.dispatchEvent(new Event("input", {bubbles: true}));
      const count = renderResultNavigator();
      status.textContent = `${prefix}Action: searched for “${term}”, ${count.toLocaleString()} matching passages.`;
      return;
    }
    const topicMatch = command.match(/^(?:show topic|filter topic|show) (.+)$/);
    if (topicMatch) {
      const phrase = topicMatch[1].trim();
      const aliases = {credit: "credits", computing: "computing", transfer: "transfer", policy: "policy", culture: "culture"};
      const lookup = aliases[phrase] || phrase;
      const matches = Array.from(topicSelect.options).filter(option =>
        option.value !== "" && normalize(option.textContent).includes(lookup)
      );
      if (matches.length === 1) {
        resetControls();
        topicSelect.value = matches[0].value;
        topicSelect.dispatchEvent(new Event("change", {bubbles: true}));
        const count = renderResultNavigator();
        status.textContent = `${prefix}Action: showing “${matches[0].textContent}”, ${count.toLocaleString()} passages.`;
      } else {
        status.textContent = `${prefix}${matches.length > 1 ? "Topic is ambiguous" : "Topic not found"}. Try “Show policy” or use the topic menu.`;
      }
      return;
    }
    status.textContent = `${prefix}Command not recognized. Try “Find credit”, “Show policy”, or “Reset view”.`;
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (ready) handleCommand(input.value, "text");
  });
  document.querySelectorAll("[data-command]").forEach(button => {
    button.addEventListener("click", () => {
      if (!ready) return;
      input.value = button.dataset.command;
      handleCommand(button.dataset.command, "example");
    });
  });
  search.addEventListener("input", () => {
    if (ready) renderResultNavigator();
  });
  topicSelect.addEventListener("change", () => {
    if (ready) renderResultNavigator();
  });
  sectionSelect.addEventListener("change", () => {
    if (ready) renderResultNavigator();
  });
  const matrixContainer = document.getElementById("matrix-container");
  function syncMatrixSelection(event) {
    if (!event.target.matches("rect.matrix-cell")) return;
    setTimeout(() => {
      if (!ready) return;
      renderResultNavigator();
      status.textContent = "Matrix cell selected. Explore its passages in the detail panel.";
    }, 0);
  }
  matrixContainer.addEventListener("click", syncMatrixSelection);
  matrixContainer.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") syncMatrixSelection(event);
  });
  resetButton.addEventListener("click", () => {
    const fromCommand = programmaticReset;
    setTimeout(() => {
      chapterSelect.value = "";
      chapterSelect.dispatchEvent(new Event("change", {bubbles: true}));
      if (ready) {
        renderResultNavigator();
        if (!fromCommand) status.textContent = "View reset. Use voice, text, or the controls below to continue.";
      }
    }, 0);
  });

  function enableWhenReady() {
    if (!map.querySelector("svg")) return;
    ready = true;
    input.disabled = false;
    runButton.disabled = false;
    voiceButton.disabled = !SpeechRecognition;
    document.querySelectorAll("[data-command]").forEach(button => { button.disabled = false; });
    renderResultNavigator();
    status.textContent = SpeechRecognition
      ? "Ready. Type a command or press Start voice control."
      : "Ready for text commands. Speech recognition is unavailable in this browser.";
    observer.disconnect();
  }
  const observer = new MutationObserver(enableWhenReady);
  observer.observe(map, {childList: true});
  enableWhenReady();

  if (!SpeechRecognition) return;
  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;
  function setListening(active) {
    listening = active;
    voiceButton.textContent = active ? "Stop listening" : "Start voice control";
    voiceButton.setAttribute("aria-pressed", String(active));
    voiceButton.disabled = !ready;
  }
  voiceButton.addEventListener("click", () => {
    if (!ready) return;
    if (listening) {
      recognition.abort();
      status.textContent = "Listening stopped. Type a command or use the controls below.";
      return;
    }
    try {
      recognition.start();
      setListening(true);
    } catch (error) {
      setListening(false);
      status.textContent = "The microphone could not start. Type a command or use the controls below.";
    }
  });
  recognition.onstart = () => {
    setListening(true);
    status.textContent = "Listening for one command…";
  };
  recognition.onresult = event => {
    handleCommand(event.results[0][0].transcript, "voice");
  };
  recognition.onerror = event => {
    status.textContent = event.error === "aborted"
      ? "Listening stopped. Type a command or use the controls below."
      : event.error === "not-allowed" || event.error === "service-not-allowed"
      ? "Microphone permission was denied. Type a command or use the controls below."
      : `Speech recognition failed (${event.error}). Type a command or try again.`;
  };
  recognition.onend = () => {
    setListening(false);
  };
})();
