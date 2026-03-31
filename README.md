# ✨ Lyrics Sync

A lightweight web tool to manually synchronize song lyrics with audio — built with **React + Vite**.

This tool is designed to help you **sync lyrics yourself**, especially for songs that only provide short preview clips on streaming platforms. Simply upload your own audio, paste the lyrics, and start syncing directly in the browser.

---

## 🎯 Purpose

Many songs are only available as short previews, making it difficult to sync lyrics properly using traditional tools.

**Lyrics Sync** solves that by letting you:

- 🎵 Upload your own full audio file  
- 📝 Paste raw lyrics  
- ⏱️ Sync timestamps manually in a simple interface  
- 📤 Export ready-to-use timed lyrics  

While this is still **Version 1**, it already provides a solid and practical workflow for manual syncing.

---

## 🚀 Features

- 🎵 Upload local audio files  
- 📝 Paste and edit lyrics  
- ⏱️ Manual timestamp syncing (line-by-line)  
- ▶️ Play-per-line navigation  
- 🎯 Accurate focus tracking (auto highlight based on playback)  
- 🔄 Re-sync from any point without clearing previous timestamps  
- 📤 Export synced lyrics as `.txt`  

---

## 🧠 How It Works

- The player uses **real-time playback** as the source of truth  
- Each lyric line can be assigned a timestamp  
- Syncing is done progressively using keyboard or UI controls  
- Focus automatically follows the current playback position  

---

## 🧪 Current Limitations (v1)

- The environment is **not yet identical** to professional lyric-sync tools  
- Some advanced behaviors and edge cases are still being refined  
- UI/UX is intentionally kept simple for speed and usability  

That said — it’s already very usable for real-world syncing.

---

## 🛠️ How to Use

### 1. Load Audio
- Click the 🎵 button  
- Upload your local audio file  

### 2. Add Lyrics
- Paste your lyrics in **Lyrics mode**  

### 3. Enter Sync Mode
- Click **Sync**  
- Make sure audio + lyrics are loaded  

### 4. Start Syncing
- Press ▶️ to play  

Then use:
- `↓` or button `˅` → set timestamp for current/next line  
- `↑` or button `˄` → remove last timestamp  
- Click a line → jump & play from that line  
- Double-click → edit text  

> ⚠️ Sync starts after you manually press play.

---

## 🎚️ Fine Adjust

Use:
- `<` `<<` → move earlier  
- `>` `>>` → move later  

---

## 🏁 End Marker

- Scroll to `(End)`  
- Set the final timestamp  
- This marks the end of the lyrics  

---

## 📤 Export

- Click ⬇️ to download your synced lyrics  

---

## ⌨️ Keyboard Shortcuts

| Key        | Action                  |
|------------|------------------------|
| `Enter`    | Play / Pause           |
| `↓`        | Sync next line         |
| `↑`        | Undo last sync         |
| `←` / `→`  | Shift timing           |

---

## 🔮 Upcoming Improvements

Planned updates include:

- More advanced sync behaviors  
- Improved editing experience  
- Better alignment with professional lyric-sync environments  
- More precise control and feedback  
- UI refinements and performance improvements  

The goal is to make this tool feel **as close as possible to professional tools — or even better**, while staying simple and fast.

---

## ⚙️ Tech Stack

- React  
- Vite  
- Vanilla styling (no heavy UI framework)  

---

## 🧑‍💻 Development

```bash
npm install
npm run dev