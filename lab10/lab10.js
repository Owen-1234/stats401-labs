(() => {
  "use strict";

  const input = document.getElementById("command-input");
  const form = document.getElementById("command-form");
  const runButton = document.getElementById("run-command");
  const voiceButton = document.getElementById("voice-button");
  const status = document.getElementById("interaction-status");
  const map = document.getElementById("semantic-map");
  const topicSelect = document.getElementById("topic-filter");
  const chapterSelect = document.getElementById("matrix-chapter");
  const search = document.getElementById("search");
  const resetButton = document.getElementById("reset-map");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let ready = false;
  let listening = false;

  function normalize(value) {
    return value.toLowerCase().trim().replace(/[.,!?;:]+$/g, "").replace(/\s+/g, " ");
  }

  function resetControls() {
    chapterSelect.value = "";
    chapterSelect.dispatchEvent(new Event("change", {bubbles: true}));
    resetButton.click();
  }

  function handleCommand(raw, source) {
    const command = normalize(raw);
    const prefix = source === "voice" ? `Heard: “${raw.trim()}”. ` : `Typed: “${raw.trim()}”. `;
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
      const count = document.getElementById("map-status").textContent.match(/(\d[\d,]*) text matches/);
      status.textContent = `${prefix}Action: searched for “${term}”${count ? `, ${count[1]} matching passages` : ""}.`;
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
        status.textContent = `${prefix}Action: showing “${matches[0].textContent}”.`;
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

  function enableWhenReady() {
    if (!map.querySelector("svg")) return;
    ready = true;
    input.disabled = false;
    runButton.disabled = false;
    voiceButton.disabled = !SpeechRecognition;
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
  voiceButton.addEventListener("click", () => {
    if (!ready || listening) return;
    try {
      recognition.start();
    } catch (error) {
      listening = false;
      voiceButton.disabled = false;
      status.textContent = "The microphone could not start. Type a command or use the controls below.";
    }
  });
  recognition.onstart = () => {
    listening = true;
    voiceButton.disabled = true;
    status.textContent = "Listening for one command…";
  };
  recognition.onresult = event => {
    handleCommand(event.results[0][0].transcript, "voice");
  };
  recognition.onerror = event => {
    status.textContent = event.error === "not-allowed" || event.error === "service-not-allowed"
      ? "Microphone permission was denied. Type a command or use the controls below."
      : `Speech recognition failed (${event.error}). Type a command or try again.`;
  };
  recognition.onend = () => {
    listening = false;
    voiceButton.disabled = !ready;
  };
})();
