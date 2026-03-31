/* eslint-disable react-hooks/refs */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CONTROL_WIDTH = 430;
const TIME_EPSILON = 0.001;
const TIME_STEP_SMALL = 0.1;
const TIME_STEP_BIG = 0.25;

function formatTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "--:--.--";
  const s = Math.max(0, seconds);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.floor((s - Math.floor(s)) * 100);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function formatPlayerTime(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "--:--";

  const total = Math.floor(Math.max(0, seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;

  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function stripExtension(name) {
  return name.replace(/\.[^.]+$/, "");
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createLine(text = "", time = null, id = makeId()) {
  return { id, text, time };
}

function isBlankLine(line) {
  return !line || line.text.trim() === "";
}

function serializeLyrics(lines) {
  return lines.map((line) => line.text).join("\n");
}

function parseLyricsText(text, previous = []) {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  return rawLines.map((lineText, index) => {
    const prev = previous[index];
    return createLine(lineText, prev?.time ?? null, prev?.id ?? makeId());
  });
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function firstNonBlankIndex(lines) {
  return lines.findIndex((line) => !isBlankLine(line));
}

function nextNonBlankIndex(lines, fromIndex) {
  for (let i = fromIndex + 1; i < lines.length; i += 1) {
    if (!isBlankLine(lines[i])) return i;
  }
  return -1;
}

function prevNonBlankIndex(lines, fromIndex) {
  for (let i = fromIndex - 1; i >= 0; i -= 1) {
    if (!isBlankLine(lines[i])) return i;
  }
  return -1;
}

function nearestNonBlankIndex(lines, fromIndex) {
  if (!lines.length) return -1;

  if (fromIndex >= 0 && fromIndex < lines.length && !isBlankLine(lines[fromIndex])) {
    return fromIndex;
  }

  for (let step = 1; step < lines.length; step += 1) {
    const forward = fromIndex + step;
    if (forward < lines.length && !isBlankLine(lines[forward])) return forward;

    const backward = fromIndex - step;
    if (backward >= 0 && !isBlankLine(lines[backward])) return backward;
  }

  return firstNonBlankIndex(lines);
}

function getPrevTimedTime(lines, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!isBlankLine(line) && line.time != null) return line.time;
  }
  return null;
}

function getNextTimedTime(lines, index) {
  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isBlankLine(line) && line.time != null) return line.time;
  }
  return null;
}

function getLastTimedIndexAtOrBefore(lines, currentTime) {
  let lastTimedIndex = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isBlankLine(line) && line.time != null && line.time <= currentTime + TIME_EPSILON) {
      lastTimedIndex = i;
    }
  }

  return lastTimedIndex;
}

function getActiveLineIndex(lines, endTime, currentTime) {
  const firstIndex = firstNonBlankIndex(lines);
  const lastTimedIndex = getLastTimedIndexAtOrBefore(lines, currentTime);

  if (lastTimedIndex !== -1) {
    const nextIndex = nextNonBlankIndex(lines, lastTimedIndex);

    if (nextIndex !== -1) {
      const nextLine = lines[nextIndex];

      if (nextLine?.time != null && currentTime >= nextLine.time - TIME_EPSILON) {
        return nextIndex;
      }
    }

    if (endTime != null && currentTime >= endTime - TIME_EPSILON) {
      return lines.length;
    }

    return lastTimedIndex;
  }

  if (endTime != null && currentTime >= endTime - TIME_EPSILON) {
    return lines.length;
  }

  return firstIndex === -1 ? 0 : firstIndex;
}

function getNextSyncTargetIndex(lines, endTime, currentTime) {
  const activeIndex = getActiveLineIndex(lines, endTime, currentTime);

  if (activeIndex === lines.length) {
    return lines.length;
  }

  if (activeIndex < 0) {
    const first = firstNonBlankIndex(lines);
    return first === -1 ? lines.length : first;
  }

  const currentLine = lines[activeIndex];

  if (
    currentLine?.time == null ||
    currentTime < currentLine.time - TIME_EPSILON
  ) {
    return activeIndex;
  }

  const nextIndex = nextNonBlankIndex(lines, activeIndex);
  if (nextIndex !== -1) return nextIndex;

  return lines.length;
}

function safeFilePart(text) {
  return text
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "untitled";
}

export default function App() {
  const audioRef = useRef(null);
  const audioInputRef = useRef(null);
  const lineInputRefs = useRef([]);
  const rowRefs = useRef([]);
  const endRef = useRef(null);
  const audioUrlRef = useRef(null);
  const clickTimerRef = useRef(null);

  const [mode, setMode] = useState("lyrics");
  const [audioSrc, setAudioSrc] = useState("");
  const [audioName, setAudioName] = useState("");
  const [lyricsText, setLyricsText] = useState("");
  const [lyrics, setLyrics] = useState([]);
  const [selected, setSelected] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [endTime, setEndTime] = useState(null);
  const [warning, setWarning] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);

  const displayTitle = audioName ? stripExtension(audioName) : "Untitled";

  const bottomReservedSpace = audioSrc
  ? mode === "sync"
    ? 140
    : 70
  : 0;

  const rowBtnStyle = useCallback((enabled = true) => ({
    border: "none",
    background: enabled ? "#efefef" : "#f7f7f7",
    color: enabled ? "#111" : "#c3c3c3",
    borderRadius: 999,
    width: 34,
    height: 34,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: enabled ? "pointer" : "default",
    fontWeight: 700,
    flex: "0 0 auto",
  }), []);

  const rowShellStyle = useCallback((active) => ({
    display: "grid",
    gridTemplateColumns: `${CONTROL_WIDTH}px 1fr`,
    gap: 12,
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: 12,
    border: active ? "2px solid #3d73ff" : "1px solid transparent",
    background: active ? "#eaf1ff" : "#fafafa",
    marginBottom: 6,
    boxSizing: "border-box",
    transition: "background 0.15s ease",
  }), []);

  const openLyricsMode = useCallback(() => {
    setLyricsText(serializeLyrics(lyrics));
    setMode("lyrics");
  }, [lyrics]);

  const openSyncMode = useCallback(() => {
    if (!audioSrc || !lyricsText.trim()) {
      setWarning("Insert Audio and Lyrics to enter Sync Mode!");
      return;
    }

    const nextLyrics = parseLyricsText(lyricsText, lyrics);
    setLyrics(nextLyrics);

    const first = nearestNonBlankIndex(nextLyrics, selected);
    setSelected(first === -1 ? 0 : first);

    setMode("sync");
  }, [audioSrc, lyricsText, lyrics, selected]);

  const handleAudioFile = useCallback((file) => {
    if (!file) return;

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    audioUrlRef.current = url;

    setAudioSrc(url);
    setAudioName(file.name);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const clearAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    setMode("lyrics");
    setAudioSrc("");
    setAudioName("");
    setLyricsText("");
    setLyrics([]);
    setSelected(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setEndTime(null);
    setEditingIndex(null);
    lineInputRefs.current = [];

    if (audioInputRef.current) {
      audioInputRef.current.value = "";
    }
  }, []);

  const recalcActiveSelection = useCallback((timeOverride = null) => {
    const time = timeOverride ?? audioRef.current?.currentTime ?? currentTime;
    const activeIndex = getActiveLineIndex(lyrics, endTime, time);
    setSelected(activeIndex === -1 ? 0 : activeIndex);
  }, [lyrics, endTime, currentTime]);

  const playPause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      if (audio.ended || (duration > 0 && audio.currentTime >= duration - TIME_EPSILON)) {
        audio.currentTime = 0;
        setCurrentTime(0);

        if (mode === "sync") {
          const first = firstNonBlankIndex(lyrics);
          if (first !== -1) setSelected(first);
        }
      }

      document.activeElement?.blur?.();

      try {
        await audio.play();
      } catch {
        // ignore autoplay restrictions
      }

      return;
    }

    audio.pause();
  }, [duration, mode, lyrics]);

  const seek = useCallback((delta) => {
    const audio = audioRef.current;
    if (!audio) return;

    const max = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    const nextTime = Math.max(0, Math.min(max, audio.currentTime + delta));

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const playFromTime = useCallback((time) => {
    const audio = audioRef.current;
    if (!audio) return;

    const nextTime = Math.max(0, time ?? 0);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);

    document.activeElement?.blur?.();
    audio.play().catch(() => {});
  }, []);

  const jumpToTime = useCallback((time) => {
    const audio = audioRef.current;
    if (!audio) return;

    const nextTime = Math.max(0, time ?? 0);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);

    if (mode === "sync") {
    const activeIndex = getActiveLineIndex(lyrics, endTime, nextTime);
      setSelected(activeIndex === -1 ? 0 : activeIndex);
    }
  }, [mode, lyrics, endTime]);

  const setTimestampFromAudio = useCallback((index) => {
    const audio = audioRef.current;
    if (!audio) return;

    setLyrics((prev) => {
      const line = prev[index];
      if (!line || isBlankLine(line)) return prev;

      const prevTime = getPrevTimedTime(prev, index);
      const nextTimeBound = getNextTimedTime(prev, index);

      const min = prevTime == null ? 0 : prevTime + 0.01;
      const max = nextTimeBound == null
        ? (endTime ?? duration ?? Infinity)
        : nextTimeBound - 0.01;

      const raw = audio.currentTime;
      const clamped = Math.max(min, Math.min(max, raw));

      if (!Number.isFinite(clamped)) return prev;
      if (clamped < min || clamped > max) return prev;

      return prev.map((item, i) =>
        i === index ? { ...item, time: +clamped.toFixed(2) } : item
      );
    });
  }, [duration, endTime]);

  const clearTimestamp = useCallback((index) => {
    setLyrics((prev) =>
      prev.map((line, i) => (i === index ? { ...line, time: null } : line))
    );
  }, []);

  const handleLineSingleClick = useCallback((line, index) => {
    setSelected(index);
    setEditingIndex(null);

    if (line?.time != null) {
      playFromTime(line.time);
      return;
    }

    const prevTime = getPrevTimedTime(lyrics, index);
    const fallbackTime = prevTime ?? 0;
    playFromTime(fallbackTime);
  }, [lyrics, playFromTime]);

  const handleLineDoubleClick = useCallback((index) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    setSelected(index);
    setEditingIndex(index);

    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, []);

  const getLineBounds = useCallback((index) => {
    const prevTime = getPrevTimedTime(lyrics, index);
    const nextTime = getNextTimedTime(lyrics, index);

    return {
      min: prevTime == null ? 0 : prevTime + 0.01,
      max: nextTime == null ? (endTime ?? duration ?? Infinity) : nextTime - 0.01,
    };
  }, [lyrics, duration, endTime]);

  const canShiftTimestamp = useCallback((index, delta) => {
    const line = lyrics[index];
    if (!line || isBlankLine(line) || line.time == null) return false;

    const { min, max } = getLineBounds(index);
    const candidate = +(line.time + delta).toFixed(2);

    return candidate >= min && candidate <= max;
  }, [lyrics, getLineBounds]);

  const shiftTimestamp = useCallback((index, delta) => {
    const line = lyrics[index];
    if (!line || isBlankLine(line) || line.time == null) return;

    const { min, max } = getLineBounds(index);
    const base = line.time ?? audioRef.current?.currentTime ?? 0;
    const nextTime = Math.max(0, +(base + delta).toFixed(2));

    if (nextTime < min || nextTime > max) return;

    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
      setCurrentTime(nextTime);
    }

    setLyrics((prev) =>
      prev.map((item, i) => (i === index ? { ...item, time: nextTime } : item))
    );
  }, [lyrics, getLineBounds]);

  const getEndBounds = useCallback(() => {
    const lastLyricIndex = prevNonBlankIndex(lyrics, lyrics.length);
    const min =
      lastLyricIndex !== -1 && lyrics[lastLyricIndex]?.time != null
        ? lyrics[lastLyricIndex].time + 0.01
        : 0;

    const max = duration ?? Infinity;

    return { min, max };
  }, [lyrics, duration]);

  const canShiftEndTimestamp = useCallback((delta) => {
    if (endTime == null) return false;

    const { min, max } = getEndBounds();
    const candidate = +(endTime + delta).toFixed(2);

    return candidate >= min && candidate <= max;
  }, [endTime, getEndBounds]);

  const shiftEndTimestamp = useCallback((delta) => {
    if (endTime == null) return;

    const { min, max } = getEndBounds();
    const candidate = +(endTime + delta).toFixed(2);

    if (candidate < min || candidate > max) return;

    setEndTime(candidate);

    if (audioRef.current) {
      audioRef.current.currentTime = candidate;
      setCurrentTime(candidate);
    }
  }, [endTime, getEndBounds]);

  const updateLineText = useCallback((index, value) => {
    setLyrics((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;

        return {
          ...line,
          text: value,
          time: value.trim() === "" ? null : line.time,
        };
      })
    );
  }, []);

  const setEndTimestampFromAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const raw = audio.currentTime;
    const { min, max } = getEndBounds();
    const clamped = Math.max(min, Math.min(max, raw));

    if (!Number.isFinite(clamped)) return;
    if (clamped < min || clamped > max) return;

    setEndTime(+clamped.toFixed(2));
  }, [getEndBounds]);

  const startFromBeginning = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = 0;
    setCurrentTime(0);
    setSelected(getActiveLineIndex(lyrics, endTime, 0));

    document.activeElement?.blur?.();
    audio.play().catch(() => {});
  }, [lyrics, endTime]);

  const syncUp = useCallback(() => {
    if (!lyrics.length) return;

    const now = audioRef.current?.currentTime ?? currentTime;

    if (endTime != null && endTime <= now + TIME_EPSILON) {
      setEndTime(null);
      requestAnimationFrame(() => {
        recalcActiveSelection();
      });
      return;
    }

    const lastTimedIndex = getLastTimedIndexAtOrBefore(lyrics, now);

    if (lastTimedIndex !== -1) {
      clearTimestamp(lastTimedIndex);

      requestAnimationFrame(() => {
        recalcActiveSelection();
      });
    }
  }, [lyrics, currentTime, endTime, clearTimestamp, recalcActiveSelection]);

  const syncDown = useCallback(() => {
    if (!lyrics.length) return;

    const now = audioRef.current?.currentTime ?? currentTime;
    const target = getNextSyncTargetIndex(lyrics, endTime, now);
    
    if (target === lyrics.length) {
      if (isPlaying) {
        setEndTimestampFromAudio();

        requestAnimationFrame(() => {
          recalcActiveSelection();
        });
      }
      return;
    }

    if (target < 0 || target >= lyrics.length) return;
    if (isBlankLine(lyrics[target])) return;

    if (isPlaying) {
      setTimestampFromAudio(target);
    }

    requestAnimationFrame(() => {
      recalcActiveSelection();
    });
  }, [
    lyrics,
    endTime,
    currentTime,
    isPlaying,
    setTimestampFromAudio,
    setEndTimestampFromAudio,
    recalcActiveSelection,
  ]);

  const canSyncDownNow = !(endTime != null && currentTime >= endTime - TIME_EPSILON);

  useEffect(() => {
    if (mode !== "sync") return;
    if (editingIndex != null) return;

    const activeIndex = getActiveLineIndex(lyrics, endTime, currentTime);
    const nextSelected = activeIndex === -1 ? 0 : activeIndex;

    if (nextSelected !== selected) {
      setSelected(nextSelected);
    }
  }, [mode, editingIndex, lyrics, endTime, currentTime, selected]);

  useEffect(() => {
    if (mode !== "sync") return;
    if (editingIndex != null) return;

    if (selected === lyrics.length) {
      endRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    rowRefs.current[selected]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [mode, editingIndex, selected, lyrics.length]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (mode !== "sync") return;
      if (editingIndex != null) return;

      if (e.key === "Enter") {
        e.preventDefault();
        playPause();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        syncDown();
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        syncUp();
        return;
      }

      if (!isPlaying) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
      }

      if (selected === lyrics.length) {
        if (e.key === "ArrowLeft") {
          shiftEndTimestamp(-TIME_STEP_BIG);
          return;
        }

        if (e.key === "ArrowRight") {
          shiftEndTimestamp(TIME_STEP_BIG);
          return;
        }

        return;
      }

      if (!lyrics.length) return;

      const current = lyrics[selected];
      if (!current) return;

      if (e.key === "ArrowLeft") {
        if (!isBlankLine(current)) shiftTimestamp(selected, -TIME_STEP_BIG);
        return;
      }

      if (e.key === "ArrowRight") {
        if (!isBlankLine(current)) shiftTimestamp(selected, TIME_STEP_BIG);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    mode,
    editingIndex,
    isPlaying,
    lyrics,
    selected,
    playPause,
    syncDown,
    syncUp,
    shiftTimestamp,
    shiftEndTimestamp,
  ]);

  useEffect(() => {
    const stopEditing = () => setEditingIndex(null);

    const onVisibilityChange = () => {
      if (document.hidden) stopEditing();
    };

    window.addEventListener("blur", stopEditing);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("blur", stopEditing);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (mode !== "sync") {
      setEditingIndex(null);
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "sync" || isPlaying) return;
    if (selected === lyrics.length) return;

    const input = lineInputRefs.current[selected];
    if (input && typeof input.focus === "function") {
      input.focus();
      const len = input.value.length;

      try {
        input.setSelectionRange(len, len);
      } catch {
        // ignore
      }
    }
  }, [mode, isPlaying, selected, lyrics.length]);

  const exportTxt = useMemo(() => {
    const lines = [];

    lyrics.forEach((line) => {
      if (line.text.trim() === "") {
        lines.push("");
        return;
      }

      const stamp = line.time == null ? "--:--.--" : formatTime(line.time);
      lines.push(`[${stamp}] ${line.text}`);
    });

    if (endTime != null) {
      lines.push(`[${formatTime(endTime)}] (End)`);
    }

    return lines.join("\n");
  }, [lyrics, endTime]);

  const saveTxt = useCallback(async () => {
    const fileName = `lyrics-${safeFilePart(displayTitle)}.txt`;

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "Text File",
              accept: { "text/plain": [".txt"] },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(exportTxt);
        await writable.close();
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }

    downloadText(fileName, exportTxt);
  }, [displayTitle, exportTxt]);

  const topBarStyle = {
    flex: "0 0 auto",
    width: "100%",
    background: "#fff",
    borderBottom: "1px solid #eee",
  };

  const tabStyle = (active) => ({
    border: "none",
    background: active ? "#ededed" : "transparent",
    color: "#111",
    borderRadius: 999,
    padding: "12px 18px",
    fontWeight: 700,
    cursor: "pointer",
  });

  const mainButtonStyle = {
    border: "none",
    background: "transparent",
    color: "#111",
    borderRadius: "50%",
    width: 42,
    height: 42,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };

  const playerCircleStyle = (dark = false) => ({
    border: "none",
    width: 40,
    height: 40,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    background: dark ? "#111" : "#f1f1f1",
    color: dark ? "#fff" : "#111",
    flex: "0 0 auto",
    fontWeight: 700,
  });

  const syncBarStyle = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 70,
    height: 60,
    background: "#fafafa",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    zIndex: 999,
  };

  const bottomBarStyle = {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    height: 70,
    background: "#fff",
    borderTop: "1px solid #e5e5e5",
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "0 20px",
    boxSizing: "border-box",
    zIndex: 1000,
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const isInstrumentalLine = useCallback((line) => (
    line?.text?.trim() === "#INSTRUMENTAL"
  ), []);

  const getLineDisplayColor = useCallback((line, index, active) => {
    const blank = isBlankLine(line);
    const editing = mode === "sync" && !isPlaying && editingIndex === index;
    const hasTime = line.time != null;

    if (editing) return "#111";
    if (blank) return "#a7a7a7";

    if (hasTime) {
      return line.time <= currentTime + TIME_EPSILON
        ? "#3d73ff"
        : "#111";
    }

    return active ? "#3d73ff" : "#a7a7a7";
  }, [mode, isPlaying, editingIndex, currentTime]);

  const renderTimestampControls = useCallback(({
    hasTime,
    time,
    active,
    onClear,
    onShiftSmallBack,
    onShiftBigBack,
    onShiftSmallForward,
    onShiftBigForward,
    canShiftSmallBack = false,
    canShiftBigBack = false,
    canShiftSmallForward = false,
    canShiftBigForward = false,
    onPlay,
  }) => {
    if (!hasTime) {
      return <div style={{ minHeight: 34 }} />;
    }

    return (
      <>
        <button style={rowBtnStyle(true)} onClick={onClear} title="Clear timestamp">×</button>
        <button
          style={rowBtnStyle(canShiftSmallBack)}
          onClick={onShiftSmallBack}
          disabled={!canShiftSmallBack}
          title="-0.10 seconds"
        >
          &lt;
        </button>
        <button
          style={rowBtnStyle(canShiftBigBack)}
          onClick={onShiftBigBack}
          disabled={!canShiftBigBack}
          title="-0.25 seconds"
        >
          &lt;&lt;
        </button>

        <div
          style={{
            minWidth: 110,
            textAlign: "center",
            fontFamily: "monospace",
            fontSize: 14,
            color: active ? "#3d73ff" : "#111",
            background: active ? "#eaf1ff" : "#f4f4f4",
            borderRadius: 12,
            padding: "8px 10px",
            fontWeight: 700,
            flex: "0 0 auto",
          }}
        >
          {formatTime(time)}
        </div>

        <button
          style={rowBtnStyle(canShiftSmallForward)}
          onClick={onShiftSmallForward}
          disabled={!canShiftSmallForward}
          title="+0.10 seconds"
        >
          &gt;
        </button>
        <button
          style={rowBtnStyle(canShiftBigForward)}
          onClick={onShiftBigForward}
          disabled={!canShiftBigForward}
          title="+0.25 seconds"
        >
          &gt;&gt;
        </button>
        <button style={rowBtnStyle(true)} onClick={onPlay} title="Play from this timestamp">▶</button>
      </>
    );
  }, [rowBtnStyle]);

  const renderSyncShell = useCallback(({ rowKey, rowRef, active, blank = false, left, right }) => (
    <div
      key={rowKey}
      ref={rowRef}
      className="sync-list-row"
      style={rowShellStyle(active, blank)}
    >
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
        {left}
      </div>

      <div style={{ minWidth: 0, display: "flex", justifyContent: "flex-start" }}>
        {right}
      </div>
    </div>
  ), [rowShellStyle]);

  const renderText = useCallback((line, i, color) => {
    const blank = isBlankLine(line);
    const instrumental = isInstrumentalLine(line);
    const editing = mode === "sync" && !isPlaying && editingIndex === i;

    if (editing) {
      return (
        <input
          ref={(el) => {
            lineInputRefs.current[i] = el;
          }}
          value={line.text}
          onChange={(e) => updateLineText(i, e.target.value)}
          onFocus={() => {
            setSelected(i);
            setEditingIndex(i);
          }}
          onBlur={() => setEditingIndex(null)}
          onClick={() => {
            setSelected(i);
            setEditingIndex(i);
          }}
          className="sync-row-input"
          style={{
            color: "#111",
            fontWeight: blank ? 400 : 600,
            minHeight: 26,
          }}
        />
      );
    }

    if (instrumental) {
      return (
        <button
          type="button"
          onClick={() => {
            if (clickTimerRef.current) {
              clearTimeout(clickTimerRef.current);
            }

            clickTimerRef.current = setTimeout(() => {
              handleLineSingleClick(line, i);
              clickTimerRef.current = null;
            }, 220);
          }}
          onDoubleClick={() => {
            handleLineDoubleClick(i);
          }}
          style={{
            border: "none",
            background: "#f2f2f2",
            color: "#666",
            borderRadius: 999,
            padding: "8px 16px",
            fontWeight: 700,
            cursor: "pointer",
            minHeight: 34,
            whiteSpace: "pre-wrap",
            alignSelf: "flex-start",
          }}
        >
          (Instrumental)
        </button>
      );
    }

    return (
    <div
      onClick={() => {
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
        }

        clickTimerRef.current = setTimeout(() => {
          handleLineSingleClick(line, i);
          clickTimerRef.current = null;
        }, 220);
      }}
      onDoubleClick={() => {
        handleLineDoubleClick(i);
      }}
      style={{
        fontSize: 17,
        lineHeight: 1.6,
        fontWeight: 700,
        color,
        cursor: "pointer",
        minHeight: 26,
        display: "flex",
        alignItems: "center",
        userSelect: "none",
        whiteSpace: "pre-wrap",
      }}
    >
      {blank ? " " : line.text}
    </div>
    );
  }, [editingIndex, isInstrumentalLine, isPlaying, mode, updateLineText, handleLineSingleClick, handleLineDoubleClick]);

  const renderSyncRow = useCallback((line, i) => {
    const blank = isBlankLine(line);
    const hasTime = line.time != null;
    const active = i === selected;
    const color = getLineDisplayColor(line, i, active);

    return renderSyncShell({
      rowKey: line.id,
      rowRef: (el) => {
        rowRefs.current[i] = el;
      },
      active,
      blank,
      left: renderTimestampControls({
        hasTime,
        time: line.time,
        active,
        onClear: () => clearTimestamp(i),
        onShiftSmallBack: () => shiftTimestamp(i, -TIME_STEP_SMALL),
        onShiftBigBack: () => shiftTimestamp(i, -TIME_STEP_BIG),
        onShiftSmallForward: () => shiftTimestamp(i, TIME_STEP_SMALL),
        onShiftBigForward: () => shiftTimestamp(i, TIME_STEP_BIG),
        canShiftSmallBack: canShiftTimestamp(i, -TIME_STEP_SMALL),
        canShiftBigBack: canShiftTimestamp(i, -TIME_STEP_BIG),
        canShiftSmallForward: canShiftTimestamp(i, TIME_STEP_SMALL),
        canShiftBigForward: canShiftTimestamp(i, TIME_STEP_BIG),
        onPlay: () => playFromTime(line.time),
      }),
      right: renderText(line, i, color),
    });
  }, [
    selected,
    getLineDisplayColor,
    renderSyncShell,
    renderTimestampControls,
    clearTimestamp,
    shiftTimestamp,
    canShiftTimestamp,
    playFromTime,
    renderText,
  ]);

  const renderSpacerMarker = useCallback((label, onClick) => (
    <div style={rowShellStyle(false)}>
      <div style={{ minHeight: 34 }} />
      <button
        onClick={onClick}
        style={{
          border: "none",
          background: "#f2f2f2",
          color: "#666",
          borderRadius: 999,
          padding: "8px 16px",
          fontWeight: 700,
          cursor: audioSrc ? "pointer" : "default",
          justifySelf: "start",
        }}
      >
        {label}
      </button>
    </div>
  ), [audioSrc, rowShellStyle]);

  const renderEndRow = useCallback(() => {
    const active = selected === lyrics.length;
    const hasTime = endTime != null;

    return renderSyncShell({
      rowKey: "end-row",
      rowRef: endRef,
      active,
      left: renderTimestampControls({
        hasTime,
        time: endTime,
        active,
        onClear: () => setEndTime(null),
        onShiftSmallBack: () => shiftEndTimestamp(-TIME_STEP_SMALL),
        onShiftBigBack: () => shiftEndTimestamp(-TIME_STEP_BIG),
        onShiftSmallForward: () => shiftEndTimestamp(TIME_STEP_SMALL),
        onShiftBigForward: () => shiftEndTimestamp(TIME_STEP_BIG),
        canShiftSmallBack: canShiftEndTimestamp(-TIME_STEP_SMALL),
        canShiftBigBack: canShiftEndTimestamp(-TIME_STEP_BIG),
        canShiftSmallForward: canShiftEndTimestamp(TIME_STEP_SMALL),
        canShiftBigForward: canShiftEndTimestamp(TIME_STEP_BIG),
        onPlay: () => playFromTime(endTime),
      }),
      right: (
        <div
          onClick={() => setSelected(lyrics.length)}
          style={{
            border: "none",
            background: "#f2f2f2",
            color: "#666",
            borderRadius: 999,
            padding: "8px 16px",
            fontWeight: 700,
            cursor: "pointer",
            minHeight: 34,
            whiteSpace: "pre-wrap",
            alignSelf: "flex-start",
          }}
        >
          (End)
        </div>
      ),
    });
  }, [
    selected,
    lyrics.length,
    endTime,
    renderSyncShell,
    renderTimestampControls,
    shiftEndTimestamp,
    canShiftEndTimestamp,
    playFromTime,
  ]);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        color: "#111",
      }}
    >
      <style>{`
        .top-btn {
          transition: background 0.2s ease;
        }
        .top-btn:hover {
          background: #eaeaea !important;
        }
        .sync-list-row:hover { background: #eaeaea !important; }
        .sync-row-input {
          width: 100%;
          border: none;
          outline: none;
          background: transparent;
          color: #111;
          font-size: 16px;
          line-height: 1.6;
          font-weight: 600;
          padding: 0;
          margin: 0;
        }
        .sync-row-input::selection { background: #cfe0ff; }
        .player-track {
          position: relative;
          height: 18px;
          flex: 1;
          cursor: pointer;
          min-width: 120px;
        }
        .player-track-line {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          height: 4px;
          background: #dbdbdb;
          border-radius: 999px;
        }
        .player-track-fill {
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          height: 4px;
          background: #111;
          border-radius: 999px;
        }
        .player-track-thumb {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: #111;
          box-shadow: 0 0 0 2px #fff;
        }
      `}</style>

      <div style={topBarStyle}>
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #eee", width: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <div
              style={{
                fontSize: 20,
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {displayTitle}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="top-btn" onClick={() => audioInputRef.current?.click()} style={mainButtonStyle}>🎵</button>
              <button className="top-btn" onClick={clearAll} style={mainButtonStyle}>🧹</button>
              <button className="top-btn" onClick={saveTxt} style={mainButtonStyle}>⬇️</button>
              <input
                ref={audioInputRef}
                type="file"
                hidden
                onChange={(e) => handleAudioFile(e.target.files?.[0])}
              />
            </div>
          </div>
        </div>

        <div style={{ borderBottom: "1px solid #eee", width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "10px 0", width: "100%" }}>
            <button onClick={openLyricsMode} style={tabStyle(mode === "lyrics")}>Lyrics</button>
            <button onClick={openSyncMode} style={tabStyle(mode === "sync")}>Sync</button>
          </div>
        </div>
      </div>

      <div
      style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          overflowY: mode === "sync" ? "auto" : "hidden",
          background: "#fafafa",
          boxSizing: "border-box",
          marginBottom: bottomReservedSpace,
          paddingBottom: mode === "sync" ? 24 : 0,
        }}
      >
        {mode === "lyrics" ? (
          <textarea
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
            placeholder="Paste lyrics here"
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              border: "none",
              padding: 24,
              fontSize: 16,
              lineHeight: 1.7,
              outline: "none",
              resize: "none",
              overflowY: "auto",
              background: "#fafafa",
              boxSizing: "border-box",
            }}
          />
        ) : (
          <div style={{ width: "100%" }}>
            {renderSpacerMarker("(...)", startFromBeginning)}
            {lyrics.map((line, i) => renderSyncRow(line, i))}
            {renderEndRow()}
          </div>
        )}
      </div>

      {audioSrc && mode === "sync" && (
        <div style={syncBarStyle}>
          <button
            onClick={syncUp}
            style={{
              width: 200,
              height: 50,
              borderRadius: 10,
              border: "none",
              background: "#eee",
              fontSize: 24,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ˄
          </button>

          <button
            onClick={syncDown}
            disabled={!canSyncDownNow}
            style={{
              width: 200,
              height: 50,
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "#fff",
              fontSize: 24,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ˅
          </button>
        </div>
      )}

      {audioSrc && (
        <div style={bottomBarStyle}>
          <div style={{ minWidth: 170, fontFamily: "monospace", fontSize: 14, whiteSpace: "nowrap" }}>
            {formatPlayerTime(currentTime)} / {formatPlayerTime(duration)}
          </div>

          <div
            className="player-track"
            onClick={(e) => {
              if (!duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              const next = +(duration * ratio).toFixed(2);
              jumpToTime(next);
            }}
          >
            <div className="player-track-line" />
            <div className="player-track-fill" style={{ width: `${progressPercent}%` }} />
            <div className="player-track-thumb" style={{ left: `${progressPercent}%` }} />
          </div>

          <button onClick={() => seek(-3)} style={playerCircleStyle(false)} title="Back 3 seconds">⟲</button>
          <button onClick={playPause} style={playerCircleStyle(true)} title="Play / Pause">
            {isPlaying ? "❚❚" : "▶"}
          </button>
          <button onClick={() => seek(3)} style={playerCircleStyle(false)} title="Forward 3 seconds">⟳</button>
        </div>
      )}

      <audio
        ref={audioRef}
        src={audioSrc}
        preload="metadata"
        style={{ display: "none" }}
        onPlay={() => {
          setIsPlaying(true);

          if (mode === "sync") {
            const activeIndex = getActiveLineIndex(
              lyrics,
              endTime,
              audioRef.current?.currentTime ?? 0
            );
            setSelected(activeIndex === -1 ? 0 : activeIndex);
          }
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const nextDuration = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0;
          setDuration(nextDuration);
        }}
      />

      {warning && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "24px 24px",
              borderRadius: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 12 }}>
              {warning}
            </div>

            <button
              onClick={() => setWarning("")}
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "none",
                background: "#111",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}