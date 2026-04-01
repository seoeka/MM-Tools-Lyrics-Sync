# Lyrics Sync

A small web tool to sync song lyrics with your own audio, directly in the browser.

---

## What it does

This tool lets you:
- upload your own audio
- paste lyrics
- sync timing manually
- export the result

That’s it.

---

## Features

- load local audio
- edit lyrics
- set timestamps per line
- jump to any line
- auto highlight during playback
- adjust timing without resetting everything
- export to `.txt`

---

## How to use

1. Load audio  
   Click the 🎵 button and upload your file

2. Add lyrics  
   Paste your lyrics in Lyrics mode

3. Start syncing  
   Go to Sync mode and press play

   - `↓` → set next line  
   - `↑` → undo  
   - click line → jump  
   - double click → edit  

---

## Adjust timing

- `<` / `<<` → earlier  
- `>` / `>>` → later  

---

## End

Scroll to `(End)` and set the last timestamp.

---

## Export

Click ⬇️ to download the file.

---

## Shortcuts

| Key | Action |
|-----|--------|
| Enter | Play / Pause |
| ↓ | Next line |
| ↑ | Undo |
| ← / → | Shift timing |

---

## Notes

Not a full-featured as pro tools (iykyk), but still works fine.

---

## Run

```bash
npm install
npm run dev
