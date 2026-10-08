# Lab 10 — Ask the Bulletin

This lab extends the existing [Lab 8 DKU Bulletin visualization](../lab8/index.html). It loads the same D3 code and data, then adds a voice and text command layer and a short list of matching passages. No microphone access occurs until the user presses **Start voice control**. Speech is transcribed into the editable command field, including interim words. Listening can be stopped at any time and ends after one command. The user reviews the text and presses **Search / apply** to update the visualization.

Open `lab10/index.html` through a web server. The page uses the same `lab8.js`, `lab8/css/lab8.css`, and `lab8/data/` files as Lab 8.

Commands work identically after the recognized text is reviewed or a command is typed:

| Example | Visualization action |
| --- | --- |
| `Find credit` | Search passage text and highlight matches on the map |
| `Show policy` | Filter the map to Policy, economics and governance |
| `Reset view` | Clear the search and filters, and restore the map view |

The examples are clickable, and matching passages can be opened directly from the page-ordered list. The original search field, topic and section menus, map selection, and reset button remain available. The command status reports the words heard, action, and recognition errors. Speech recognition is optional because browser support varies. The page includes a 177-word design reflection.

Assignment: <https://github.com/hiilab/stats-401/blob/main/Lab10.md>
