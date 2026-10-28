# Schedule photos are read locally, and the model only reads a cut-out row

A Week can be filled from a Schedule photo: a phone picture of the handwritten staff schedule, which lists many people's hours. Atlas does the geometry itself. It turns the photo upright, straightens it, finds the ruled grid, picks your row by your printed name and cuts out the header plus that row. A small local vision model (`gemma3:4b` on Ollama) only copies the text of that strip. Atlas then parses the times ("3 to C", "9 to 4"), resolves Close and am/pm, and files the result as a Draft week. The photo never leaves the machine and is not kept.

## Considered Options

Tested on a sample schedule photo (CPU only):

| Approach | Days right | Time |
|---|---|---|
| Whole sheet, "find this name's row" | 5/7 (Wed/Thu swapped, the same on every run) | 74 s |
| Whole sheet, straightened | 2/7 | 91 s |
| Whole sheet, one weekday per question | 1/7 | ~9 min |
| Header + your row only | **7/7**, plus the dates | 106 s |

- **Whole-sheet reading by the model.** Rejected. Handwritten rows slant across the grid, and a 4B model loses track of which row it is on. Its mistakes look plausible, such as two weekdays swapped, so a quick check wouldn't catch them.
- **Cloud vision (a hosted model).** Rejected. The photo carries coworkers' names, and a phone photo carries GPS in its metadata. Atlas keeps personal data on the box.
- **A bigger local model.** Not needed while the strip approach reads 7/7. It's the next step if accuracy drops on other photos.

## Consequences

- Atlas needs ordinary image tools (OpenCV for the grid, Tesseract for the printed names and the weekday header). The model's raw text is never trusted. Times are parsed tolerantly (`270 C` → "2 TO C") and anything unparseable is flagged in the editor, not guessed.
- Nothing is ever saved without you: a reading only produces a Draft week, one per Week, replaced by a newer photo, kept until you Save or Discard it.
- Off by default. Installs without a vision model configured never show the button.
- It's used about once a week, so nothing runs between uses. The image tools are only installed when the API image is built with `WITH_VISION=true`. A reading runs as a background task inside the API, and Ollama is asked to unload the model right after. A separate always-on container was rejected as idle cost. Starting one on demand was rejected because it would need the Docker socket, which is effectively root on the host.
