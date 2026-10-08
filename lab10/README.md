# Lab 10 — Ask the Bulletin

This lab extends the existing [Lab 8 DKU Bulletin visualization](../lab8/index.html). It loads the same D3 code and data, and adds a voice and text command layer. No microphone access occurs until the user presses **Start voice control**.

Open `lab10/index.html` through a web server. The page uses the same `lab8.js`, `lab8/css/lab8.css`, and `lab8/data/` files as Lab 8.

Commands work identically when spoken or typed:

| Example | Visualization action |
| --- | --- |
| `Find credit` | Search passage text and highlight matches on the map |
| `Show policy` | Filter the map to Policy, economics and governance |
| `Reset view` | Clear the search and filters, and restore the map view |

The original search field, topic and section menus, map selection, and reset button remain available. The command status reports the received words, action, and recognition errors. Speech recognition is optional because browser support varies. The page includes the required 100–200 word design reflection.

Assignment: <https://github.com/hiilab/stats-401/blob/main/Lab10.md>
