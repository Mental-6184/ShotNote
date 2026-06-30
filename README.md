# ShotNote

> A polished Windows screenshot annotation desktop app built with Electron.

ShotNote is a lightweight screenshot and markup tool focused on fast communication and clean visual feedback. It supports global screenshot capture, multi-display region selection, rich annotation tools, OCR text extraction, PNG export, clipboard copy, and local history review in one desktop workflow.

## Highlights

- Global shortcut capture: `Ctrl + Alt + Shift + S`
- Multi-monitor screenshot selection
- Instant jump from capture to annotation editor
- Annotation tools:
  - Pen
  - Highlighter
  - Rectangle
  - Arrow
  - Text
  - Mosaic
  - Blur
  - Hand / pan
- Undo, redo, zoom, and fit-to-screen controls
- OCR recognition with `Chinese + English`, `Chinese`, or `English`
- Copy annotated image directly to clipboard
- Export final result as PNG
- Built-in local history panel for reopening previous exports
- Drag and drop local images into the editor for continued markup
- Tray integration for quick access on Windows

## Preview

ShotNote uses a warm desktop-style interface designed for frequent screenshot work:

- Left sidebar for style controls, OCR language, and export history
- Central canvas for screenshot preview and annotation
- Top action bar for tools, zoom, OCR, copy, export, and new capture
- Full-screen capture overlay for precise region selection

If you want, you can later add screenshots or GIF demos under this section for a more visual GitHub landing page.

## Tech Stack

- Electron
- `screenshot-desktop`
- `tesseract.js`
- `electron-builder`

## Project Structure

```text
ShotNote/
|-- assets/                  App icons and visual assets
|-- dist/                    Build output directory
|-- src/
|   |-- index.html           Renderer window structure
|   |-- renderer.js          Editor and capture interaction logic
|   `-- styles.css           Application styles
|-- tools/
|   `-- generate-icons.ps1   Icon generation script
|-- main.js                  Electron main process
|-- package.json             Project config and scripts
|-- Start ShotNote.vbs       Double-click startup helper for Windows
|-- LICENSE                  Repository license
`-- README.md
```

## Features In Detail

### 1. Fast Screenshot Capture

ShotNote registers a global shortcut so you can start a new screenshot from anywhere:

```text
Ctrl + Alt + Shift + S
```

Once triggered, the app opens a transparent capture overlay on every display and lets you drag-select the region you want.

### 2. Annotation Workflow

After capture, the image is opened directly in the editor, where you can:

- Draw freehand notes
- Highlight key areas
- Add boxes and arrows
- Insert text explanations
- Obfuscate sensitive information with mosaic or blur
- Pan and zoom around large screenshots

### 3. OCR Recognition

ShotNote can recognize text from the current annotated image using Tesseract. OCR results can be inserted back into the canvas as editable text content.

Supported language presets:

- `chi_sim+eng`
- `chi_sim`
- `eng`

### 4. Export And Reuse

You can:

- Copy the final image to the system clipboard
- Export to PNG
- Reopen past exported images from the built-in history list
- Drag local screenshots back into the editor for additional annotation

### 5. Local History

Exports are stored in the Electron user data directory under a local `history` folder, along with an index file for browsing previous records inside the app.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Alt + Shift + S` | Start a new screenshot |
| `Ctrl + Z` | Undo |
| `Ctrl + Shift + Z` | Redo |
| `Ctrl + Y` | Redo |
| `Ctrl + 0` | Fit to screen |
| `Ctrl + Mouse Wheel` | Zoom canvas |
| `Esc` | Cancel capture or close text input |
| `Space` | Temporarily pan while dragging |

## Requirements

- Windows
- Node.js 18+
- npm

## Installation

```bash
npm install
```

## Run In Development

```bash
npm start
```

This launches the Electron desktop app locally.

## Windows Quick Start

If you want to start the app by double-clicking a file on Windows, you can use:

```text
Start ShotNote.vbs
```

## Build

Generate icon assets:

```bash
npm run icons
```

Build installable output:

```bash
npm run build
```

Build unpacked application directory only:

```bash
npm run pack
```

Build artifacts are written to:

```text
dist/
```

## npm Scripts

| Script | Description |
|---|---|
| `npm start` | Start the Electron app |
| `npm run dev` | Run the app in development mode |
| `npm run icons` | Generate or refresh icon assets |
| `npm run pack` | Build unpacked app output |
| `npm run build` | Build distributable installer |

## Typical Usage Flow

1. Press `Ctrl + Alt + Shift + S` or click `New Screenshot`.
2. Drag to select the screen area you want.
3. The selected region opens in the editor automatically.
4. Add annotations with the tools you need.
5. Run OCR if you want to extract text from the image.
6. Copy the result to clipboard or export it as PNG.
7. Reopen previous outputs anytime from the history panel.

## Notes

- This project is currently tailored for Windows usage.
- OCR may need extra time on first run because recognition resources must load.
- Export history is stored locally and may grow over time if not cleaned periodically.
- The application currently uses Electron renderer features such as `nodeIntegration`, so it is aimed at desktop distribution rather than hardened browser-style security constraints.

## Repository

- GitHub: [Mental-6184/ShotNote](https://github.com/Mental-6184/ShotNote)

## License

This repository includes a `LICENSE` file. Please refer to it directly for the current license terms.
