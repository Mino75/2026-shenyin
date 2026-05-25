// main.js
(() => {
  "use strict";

  const KARAOKE_ORIGIN = "https://karaoke.hongkoala.com";
  const MESSAGE_TYPE_TRACK_CHANGE = "karaoke-track-change";
  const MESSAGE_TYPE_PLAYBACK_STATE = "karaoke-playback-state";

  const overlay = document.getElementById("karaokeOverlay");
  const openBtn = document.getElementById("openKaraokeBtn");
  const closeBtn = document.getElementById("closeKaraokeBtn");
  
  openBtn.addEventListener("click", () => {
    overlay.classList.remove("hidden");
    setTimeout(() => {
      emitCurrentTrack("karaoke-open");
    }, 300);
  });
  
  closeBtn.addEventListener("click", () => {
    overlay.classList.add("hidden");
  });
  
  // ---------------------------
  // DOM references
  // ---------------------------
  const $ = (sel) => document.querySelector(sel);

  const playlistListEl        = $("#playlistList");
  const trackListEl           = $("#trackList");
  const emptyStateEl          = $("#emptyState");
  const btnNewPlaylist        = $("#btnNewPlaylist");
  const fileInput             = $("#fileInput");
  const importPlaylistInput   = $("#importPlaylistInput");
  const btnPlay               = $("#btnPlay");
  const btnPrev               = $("#btnPrev");
  const btnNext               = $("#btnNext");
  const btnShuffle            = $("#btnShuffle");
  const activePlaylistBadge   = $("#activePlaylistBadge");
  const nowPlayingEl          = $("#nowPlaying");
  const storageInfoEl         = $("#storageInfo");
  const seekBar               = $("#seekBar");
  const timeDisplay           = $("#timeDisplay");
  const mediaEl               = $("#mediaEl");   // <video> — plays both audio and video

  // ---------------------------
  // Screen Wake Lock
  // ---------------------------
  let wakeLock = null;

  async function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch { /* denied or OS-restricted */ }
  }

  async function releaseWakeLock() {
    try { if (wakeLock) await wakeLock.release(); }
    finally { wakeLock = null; }
  }

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && !mediaEl.paused) {
      await acquireWakeLock();
    }
  });

  // ---------------------------
  // Media Session API
  // Enables Android notification controls, lock-screen controls,
  // Bluetooth headset buttons, and car steering-wheel buttons.
  // ---------------------------
  function setupMediaSessionHandlers() {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", async () => {
      await mediaEl.play();
      await acquireWakeLock();
      navigator.mediaSession.playbackState = "playing";
    });

    navigator.mediaSession.setActionHandler("pause", async () => {
      mediaEl.pause();
      await releaseWakeLock();
      navigator.mediaSession.playbackState = "paused";
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => prevTrack());
    navigator.mediaSession.setActionHandler("nexttrack",     () => nextTrack());

    // Seek support (shown as a scrubber in some Android / car UIs)
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) mediaEl.currentTime = details.seekTime;
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      mediaEl.currentTime = Math.min(
        mediaEl.duration,
        mediaEl.currentTime + (details.seekOffset ?? 10)
      );
    });
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      mediaEl.currentTime = Math.max(
        0,
        mediaEl.currentTime - (details.seekOffset ?? 10)
      );
    });
  }

  /** Update MediaSession metadata for the track that is about to play */
  function setMediaSessionMetadata(track) {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  track.title ?? "Untitled",
      artist: "Shenyin",
      album:  getActivePlaylist()?.name ?? "",
      // artwork omitted — add entries here if you ever store cover images
    });
  }

  /** Keep the OS playback state indicator in sync */
  mediaEl.addEventListener("play",  () => {
    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = "playing";
   emitPlaybackState();
  });
  mediaEl.addEventListener("pause", () => {
    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = "paused";
    emitPlaybackState(); 
  });


//Karaoke

function getKaraokeFrameWindow() {
  const frame = document.getElementById("karaokeFrame");
  return frame?.contentWindow || null;
}

function emitToKaraoke(type, payload = {}) {
  const target = getKaraokeFrameWindow();
  if (!target) return;

  target.postMessage(
    {
      type,
      payload,
      sourceApp: "shenyin",
      emittedAt: Date.now(),
    },
    "https://karaoke.hongkoala.com"
  );
}

  function emitCurrentTrack(reason = "update") {
    const p = getActivePlaylist();
    if (!p || currentIndex < 0 || currentIndex >= p.trackIds.length) return;

    const trackId = p.trackIds[currentIndex];

    emitToKaraoke(MESSAGE_TYPE_TRACK_CHANGE, {
      trackId,
      title: nowPlayingEl.textContent?.replace(/^Playing:\s*/, "") || "Untitled",
      duration: Number.isFinite(mediaEl.duration) ? Math.round(mediaEl.duration) : 0,
      currentTime: Number.isFinite(mediaEl.currentTime) ? Math.round(mediaEl.currentTime) : 0,
      state: mediaEl.paused ? "paused" : "playing",
      reason,
    });
  }

  function emitPlaybackState() {
    const p = getActivePlaylist();
    const trackId =
      p && currentIndex >= 0 && currentIndex < p.trackIds.length
        ? p.trackIds[currentIndex]
        : null;

    emitToKaraoke(MESSAGE_TYPE_PLAYBACK_STATE, {
      trackId,
      currentTime: Number.isFinite(mediaEl.currentTime) ? Math.round(mediaEl.currentTime) : 0,
      duration: Number.isFinite(mediaEl.duration) ? Math.round(mediaEl.duration) : 0,
      state: mediaEl.paused ? "paused" : "playing",
    });
  }

  
  // ---------------------------
  // IndexedDB — schema & helpers
  // ---------------------------
  const DB_NAME    = "offline_playlist_player";
  const LAST_STATE_KEY = "offline_player_last_state";
  const DB_VERSION = 1;
  const STORES     = { playlists: "playlists", tracks: "tracks" };

  /** @type {IDBDatabase|null} */
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORES.playlists))
          d.createObjectStore(STORES.playlists, { keyPath: "id" });
        if (!d.objectStoreNames.contains(STORES.tracks))
          d.createObjectStore(STORES.tracks, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  function tx(storeName, mode = "readonly") {
    if (!db) throw new Error("DB not ready");
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function idbGet(storeName, key) {
    return new Promise((resolve, reject) => {
      const r = tx(storeName).get(key);
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror   = () => reject(r.error);
    });
  }

  function idbGetAll(storeName) {
    return new Promise((resolve, reject) => {
      const r = tx(storeName).getAll();
      r.onsuccess = () => resolve(r.result ?? []);
      r.onerror   = () => reject(r.error);
    });
  }

  function idbPut(storeName, value) {
    return new Promise((resolve, reject) => {
      const r = tx(storeName, "readwrite").put(value);
      r.onsuccess = () => resolve(true);
      r.onerror   = () => reject(r.error);
    });
  }

  function idbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
      const r = tx(storeName, "readwrite").delete(key);
      r.onsuccess = () => resolve(true);
      r.onerror   = () => reject(r.error);
    });
  }

  // ---------------------------
  // App state
  // ---------------------------
  let playlists        = [];
  let activePlaylistId = null;
  let currentIndex     = -1;
  let currentObjectUrl = null;
  let isShuffleActive = false;
  // ---------------------------
  // Media file validation
  // ---------------------------
  function isMediaFile(file) {
    const mime = file.type || "";
    if (mime.startsWith("audio/") || mime.startsWith("video/")) return true;
    return /\.(mp3|mp4|m4a|m4v|ogg|ogv|wav|flac|aac|webm|opus|mov|avi|mkv|3gp)$/i.test(file.name);
  }

  // ---------------------------
  // Blob ↔ Base64 helpers
  // ---------------------------
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve(r.result.split(",")[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  function base64ToBlob(b64, mime) {
    const bytes = atob(b64);
    const arr   = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime || "application/octet-stream" });
  }

  // ---------------------------
  // Seek bar & time display
  // ---------------------------
  let isSeeking = false;

  function formatTime(s) {
    if (!isFinite(s) || isNaN(s)) return "—";
    const m   = Math.floor(s / 60);
    const sec = String(Math.floor(s % 60)).padStart(2, "0");
    return `${m}:${sec}`;
  }

  function updateSeekBar() {
    if (isSeeking) return;
    const dur = mediaEl.duration;
    const cur = mediaEl.currentTime;
    seekBar.value = isFinite(dur) && dur > 0 ? (cur / dur) * 1000 : 0;
    timeDisplay.textContent = isFinite(dur)
      ? `${formatTime(cur)} / ${formatTime(dur)}`
      : formatTime(cur);

    // Keep MediaSession position state in sync (enables scrubber in car/OS UIs)
    if ("mediaSession" in navigator && isFinite(dur) && dur > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration:     dur,
          playbackRate: mediaEl.playbackRate,
          position:     cur,
        });
      } catch { /* setPositionState not supported on all platforms */ }
    }
  }

  function resetSeekBar() {
    seekBar.value           = 0;
    seekBar.disabled        = true;
    timeDisplay.textContent = "—";
  }

  mediaEl.addEventListener("loadedmetadata", () => {
    seekBar.disabled = false;
    updateSeekBar();
    emitCurrentTrack("metadata-loaded");
  });

  mediaEl.addEventListener("timeupdate", () => {
    updateSeekBar();
    saveLastPlaybackState();
  });

  seekBar.addEventListener("input", () => {
    isSeeking = true;
    const preview = (seekBar.value / 1000) * mediaEl.duration;
    timeDisplay.textContent = `${formatTime(preview)} / ${formatTime(mediaEl.duration)}`;
  });

  seekBar.addEventListener("change", () => {
    if (isFinite(mediaEl.duration)) {
      mediaEl.currentTime = (seekBar.value / 1000) * mediaEl.duration;
    }
    isSeeking = false;
    saveLastPlaybackState();
    emitPlaybackState();
  });

  mediaEl.addEventListener("error", () => {
    const code = mediaEl.error?.code ?? "?";
    nowPlayingEl.textContent = `⚠️ Cannot play this file (error ${code})`;
    resetSeekBar();
  });

  // ---------------------------
  // Play / Pause button label sync
  // ---------------------------
  function updatePlayBtn() {
    btnPlay.textContent = mediaEl.paused ? "▶️ Play" : "⏸ Pause";
  }

  mediaEl.addEventListener("play",  updatePlayBtn);
  mediaEl.addEventListener("pause", updatePlayBtn);

  // ---------------------------
  // Utilities
  // ---------------------------
  function uid(prefix = "id") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  async function importTracksFromPlaylistFile(file) {
    const p = getActivePlaylist();
    if (!p) { alert("Sélectionne une playlist d'abord."); return; }
  
    nowPlayingEl.textContent = "⏳ Importing…";
    try {
      const text = await file.text();
      const data = JSON.parse(text);
  
      if (data.version !== 1 || !Array.isArray(data.tracks)) {
        alert("Fichier de playlist invalide.");
        return;
      }
  
      const newTrackIds = [];
      for (const track of data.tracks) {
        const blob  = base64ToBlob(track.data, track.mime);
        const newId = uid("tr");
        await idbPut(STORES.tracks, {
          id: newId, title: track.title || "Untitled",
          blob, mime: track.mime || "application/octet-stream",
          createdAt: Date.now(), updatedAt: Date.now(),
        });
        newTrackIds.push(newId);
      }
  
      await idbPut(STORES.playlists, {
        ...p,
        trackIds:  [...p.trackIds, ...newTrackIds],
        updatedAt: Date.now(),
      });
  
      await loadPlaylists();
      renderPlaylists();
      await renderTracks();
      await refreshStorageInfo();
    } catch (err) {
      alert(`Import échoué : ${err.message}`);
    } finally {
      nowPlayingEl.textContent = mediaEl.paused ? "—" : nowPlayingEl.textContent;
    }
  }

  
  function saveLastPlaybackState() {
    try {
      const p = getActivePlaylist();
      const trackId =
        p && currentIndex >= 0 && currentIndex < p.trackIds.length
          ? p.trackIds[currentIndex]
          : null;
  
      localStorage.setItem(LAST_STATE_KEY, JSON.stringify({
        activePlaylistId,
        trackId,
        currentTime: Number.isFinite(mediaEl.currentTime) ? mediaEl.currentTime : 0,
      }));
    } catch {
      /* ignore persistence errors */
    }
  }
  
  function clearLastPlaybackState() {
    try {
      localStorage.removeItem(LAST_STATE_KEY);
    } catch {
      /* ignore */
    }
  }

  
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function bytesToHuman(bytes) {
    if (!Number.isFinite(bytes)) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0, v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function setEmptyState(visible) {
    emptyStateEl.style.display = visible ? "block" : "none";
  }

  function setControlsEnabled(enabled) {
    btnPlay.disabled    = !enabled;
    btnPrev.disabled    = !enabled;
    btnNext.disabled    = !enabled;
    btnShuffle.disabled = !enabled;
    fileInput.disabled  = !activePlaylistId;
  }

  function getActivePlaylist() {
    return playlists.find(p => p.id === activePlaylistId) ?? null;
  }

  async function refreshStorageInfo() {
    try {
      if (navigator.storage?.estimate) {
        const est   = await navigator.storage.estimate();
        storageInfoEl.textContent =
          `Storage: ${bytesToHuman(est.usage ?? NaN)} / ${bytesToHuman(est.quota ?? NaN)}`;
      } else {
        storageInfoEl.textContent = "Storage: estimate unavailable";
      }
    } catch {
      storageInfoEl.textContent = "Storage: estimate unavailable";
    }
  }

  // ---------------------------
  // Rendering
  // ---------------------------
  function renderPlaylists() {
    playlistListEl.innerHTML = "";

    if (playlists.length === 0) {
      const div = document.createElement("div");
      div.className = "empty";
      div.style.display = "block";
      div.textContent = "No playlists. Create one to get started.";
      playlistListEl.appendChild(div);
      return;
    }

    for (const p of playlists) {
      const item = document.createElement("div");
      item.className = `item ${p.id === activePlaylistId ? "item--active" : ""}`;
      item.style.cursor = "pointer";
      item.onclick = () => setActivePlaylist(p.id);

      const left = document.createElement("div");
      left.className = "item__left";

      const titleInput = document.createElement("input");
      titleInput.className = "inputTitle";
      titleInput.value = p.name;
      titleInput.title = "Tap to rename";
      titleInput.onclick  = (e) => e.stopPropagation();
      titleInput.onkeydown = (e) => { if (e.key === "Enter") titleInput.blur(); };
      titleInput.onblur = async () => {
        const newName = titleInput.value.trim() || "Untitled";
        if (newName === p.name) return;
        await idbPut(STORES.playlists, { ...p, name: newName, updatedAt: Date.now() });
        await loadPlaylists();
        renderPlaylists();
        if (activePlaylistId === p.id) activePlaylistBadge.textContent = newName;
      };

      const meta = document.createElement("div");
      meta.className = "item__meta";
      meta.textContent = `${p.trackIds.length} track(s)`;

      left.appendChild(titleInput);
      left.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "item__actions";

      const btnExport = document.createElement("button");
      btnExport.className = "iconbtn";
      btnExport.textContent = "📤";
      btnExport.title = "Export playlist";
      btnExport.onclick = (e) => { e.stopPropagation(); exportPlaylist(p.id); };

      const btnDel = document.createElement("button");
      btnDel.className = "iconbtn";
      btnDel.textContent = "🗑️";
      btnDel.title = "Delete playlist";
      btnDel.onclick = (e) => { e.stopPropagation(); deletePlaylist(p.id); };

      actions.appendChild(btnExport);
      actions.appendChild(btnDel);
      item.appendChild(left);
      item.appendChild(actions);
      playlistListEl.appendChild(item);
    }
  }

  async function renderTracks() {
    const p = getActivePlaylist();
    trackListEl.innerHTML = "";

    if (mediaEl.paused && currentIndex < 0) nowPlayingEl.textContent = "—";

    if (!p) {
      activePlaylistBadge.textContent = "No playlist";
      setEmptyState(true);
      setControlsEnabled(false);
      return;
    }

    activePlaylistBadge.textContent = p.name;

    if (p.trackIds.length === 0) {
      setEmptyState(true);
      setControlsEnabled(false);
      return;
    }

    setEmptyState(false);
    setControlsEnabled(true);

    for (let i = 0; i < p.trackIds.length; i++) {
      const trackId = p.trackIds[i];
      const t = await idbGet(STORES.tracks, trackId);
      if (!t) continue;

      const row = document.createElement("div");
      row.className = "item";

      const left = document.createElement("div");
      left.className = "item__left";

      const titleInput = document.createElement("input");
      titleInput.className = "inputTitle";
      titleInput.value = t.title ?? "Untitled";
      titleInput.title = "Click to edit title (saved on blur)";
      titleInput.onkeydown = (e) => { if (e.key === "Enter") titleInput.blur(); };
      titleInput.onblur = async () => {
        const newTitle = titleInput.value.trim() || "Untitled";
        if (newTitle === t.title) return;
        await idbPut(STORES.tracks, { ...t, title: newTitle, updatedAt: Date.now() });
        const ap = getActivePlaylist();
        if (ap && currentIndex === i && ap.trackIds[currentIndex] === trackId) {
          nowPlayingEl.textContent = `Playing: ${newTitle}`;
        }
      };

      const meta = document.createElement("div");
      meta.className = "item__meta";
      const typeEmoji = (t.mime || "").startsWith("video/") ? "🎬" : "🎵";
      meta.textContent = `${typeEmoji} ${t.mime || "unknown"} · ${trackId.slice(0, 8)}…`;

      left.appendChild(titleInput);
      left.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "item__actions";

      const btnUp = document.createElement("button");
      btnUp.className = "iconbtn";
      btnUp.textContent = "↑";
      btnUp.title = "Move up";
      btnUp.disabled = i === 0;
      btnUp.onclick = () => moveTrack(i, -1);

      const btnDown = document.createElement("button");
      btnDown.className = "iconbtn";
      btnDown.textContent = "↓";
      btnDown.title = "Move down";
      btnDown.disabled = i === p.trackIds.length - 1;
      btnDown.onclick = () => moveTrack(i, +1);

      const btnCopyTrack = document.createElement("button");
      btnCopyTrack.className = "iconbtn";
      btnCopyTrack.textContent = "📋";
      btnCopyTrack.title = "Copy to playlist";
      btnCopyTrack.onclick = () => copyTrackToPlaylist(trackId);

      
      const btnPlayThis = document.createElement("button");
      btnPlayThis.className = "btn btn--primary";
      btnPlayThis.textContent = "▶️";
      btnPlayThis.title = "Play this track";
      btnPlayThis.onclick = () => playIndex(i);

      const btnDelTrack = document.createElement("button");
      btnDelTrack.className = "iconbtn";
      btnDelTrack.textContent = "🗑️";
      btnDelTrack.title = "Remove track";
      btnDelTrack.onclick = () => removeTrackFromPlaylist(i);

      actions.appendChild(btnUp);
      actions.appendChild(btnDown);
      actions.appendChild(btnCopyTrack);
      actions.appendChild(btnPlayThis);
      actions.appendChild(btnDelTrack);

      row.appendChild(left);
      row.appendChild(actions);
      trackListEl.appendChild(row);
    }
  }

  // ---------------------------
  // Core actions
  // ---------------------------
  async function loadPlaylists() {
    playlists = await idbGetAll(STORES.playlists);
    playlists.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }

  async function createPlaylist() {
    const name = prompt("Playlist name?", `Playlist ${playlists.length + 1}`);
    if (!name) return;

    const p = {
      id:        uid("pl"),
      name:      name.trim() || "Untitled",
      trackIds:  [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await idbPut(STORES.playlists, p);
    await loadPlaylists();

    activePlaylistId = p.id;
    currentIndex     = -1;
    await stopPlayback();

    renderPlaylists();
    await renderTracks();
  }

  async function setActivePlaylist(playlistId) {
    activePlaylistId = playlistId;
    currentIndex     = -1;
    await stopPlayback();

    saveLastPlaybackState();
    renderPlaylists();
    await renderTracks();
  }

  async function importFilesToActivePlaylist(files) {
    const p = getActivePlaylist();
    if (!p) return;

    const newTrackIds = [];

    for (const file of files) {
      const baseName = (file.name || "Untitled").replace(/\.[^/.]+$/, "");
      const track = {
        id:        uid("tr"),
        title:     baseName || "Untitled",
        blob:      file,
        mime:      file.type || "application/octet-stream",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await idbPut(STORES.tracks, track);
      newTrackIds.push(track.id);
    }

    const updated = {
      ...p,
      trackIds:  [...p.trackIds, ...newTrackIds],
      updatedAt: Date.now(),
    };

    await idbPut(STORES.playlists, updated);
    await loadPlaylists();
    renderPlaylists();
    await renderTracks();
    await refreshStorageInfo();
  }

async function copyTrackToPlaylist(trackId) {
  const sourceTrack = await idbGet(STORES.tracks, trackId);
  if (!sourceTrack) return;

  const choices = playlists
    .map((p, i) => `${i + 1}. ${p.name}`)
    .join("\n");

  const raw = prompt(`Copy to playlist:\n\n${choices}`);
  if (!raw) return;

  const targetIndex = Number(raw) - 1;
  const targetPlaylist = playlists[targetIndex];

  if (!targetPlaylist) {
    alert("Invalid playlist.");
    return;
  }

  const newTrackId = uid("tr");

  await idbPut(STORES.tracks, {
    ...sourceTrack,
    id: newTrackId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await idbPut(STORES.playlists, {
    ...targetPlaylist,
    trackIds: [...targetPlaylist.trackIds, newTrackId],
    updatedAt: Date.now(),
  });

  await loadPlaylists();
  renderPlaylists();
  await renderTracks();
  await refreshStorageInfo();
}

  
  async function moveTrack(index, delta) {
    const p = getActivePlaylist();
    if (!p) return;

    const nextIndex = clamp(index + delta, 0, p.trackIds.length - 1);
    if (nextIndex === index) return;

    const ids = [...p.trackIds];
    const [moved] = ids.splice(index, 1);
    ids.splice(nextIndex, 0, moved);

    const updated = { ...p, trackIds: ids, updatedAt: Date.now() };
    await idbPut(STORES.playlists, updated);
    await loadPlaylists();

    if      (currentIndex === index)     currentIndex = nextIndex;
    else if (currentIndex === nextIndex) currentIndex = index;

    renderPlaylists();
    await renderTracks();
  }

  async function removeTrackFromPlaylist(trackIndex) {
    const p = getActivePlaylist();
    if (!p) return;

    const trackId     = p.trackIds[trackIndex];
    const newTrackIds = p.trackIds.filter((_, i) => i !== trackIndex);

    await idbPut(STORES.playlists, { ...p, trackIds: newTrackIds, updatedAt: Date.now() });
    await idbDelete(STORES.tracks, trackId);

    try {
        const raw = localStorage.getItem(LAST_STATE_KEY);
        if (raw) {
          const last = JSON.parse(raw);
          if (last?.trackId === trackId) clearLastPlaybackState();
        }
      } catch {
        clearLastPlaybackState();
        }
    
    if (currentIndex === trackIndex) {
      await stopPlayback();
      currentIndex = -1;
    } else if (currentIndex > trackIndex) {
      currentIndex--;
    }

    await loadPlaylists();
    renderPlaylists();
    await renderTracks();
    await refreshStorageInfo();
  }

  async function deletePlaylist(playlistId) {
    const p = playlists.find(pl => pl.id === playlistId);
    if (!p) return;
    if (!confirm(`Delete playlist "${p.name}" and all its tracks?`)) return;

    for (const trackId of p.trackIds) await idbDelete(STORES.tracks, trackId);
    await idbDelete(STORES.playlists, playlistId);

    try {
          const raw = localStorage.getItem(LAST_STATE_KEY);
          if (raw) {
            const last = JSON.parse(raw);
            if (last?.activePlaylistId === playlistId) clearLastPlaybackState();
          }
        } catch {
          clearLastPlaybackState();
        }

    
    if (activePlaylistId === playlistId) {
      activePlaylistId = null;
      currentIndex     = -1;
      await stopPlayback();
    }

    await loadPlaylists();
    renderPlaylists();
    await renderTracks();
    await refreshStorageInfo();
  }

  // ---------------------------
  // Playlist export / import
  // ---------------------------
  async function exportPlaylist(playlistId) {
    const p = playlists.find(pl => pl.id === playlistId);
    if (!p) return;

    nowPlayingEl.textContent = "⏳ Exporting…";

    try {
      const tracks = [];
      for (const trackId of p.trackIds) {
        const t = await idbGet(STORES.tracks, trackId);
        if (!t) continue;
        const data = await blobToBase64(t.blob);
        tracks.push({ title: t.title, mime: t.mime, data });
      }

      const payload = JSON.stringify({
        version:  1,
        playlist: { name: p.name, createdAt: p.createdAt },
        tracks,
      });

      const blob = new Blob([payload], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), {
        href:     url,
        download: `${p.name.replace(/[^a-z0-9]/gi, "_")}_playlist.json`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      nowPlayingEl.textContent = mediaEl.paused ? "—" : nowPlayingEl.textContent;
    }
  }

  async function importPlaylistFromFile(file) {
    nowPlayingEl.textContent = "⏳ Importing…";
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.version !== 1 || !data.playlist || !Array.isArray(data.tracks)) {
        alert("Invalid playlist file. Only files exported by this app are supported.");
        return;
      }

      const newTrackIds = [];
      for (const track of data.tracks) {
        const blob  = base64ToBlob(track.data, track.mime);
        const newId = uid("tr");
        await idbPut(STORES.tracks, {
          id:        newId,
          title:     track.title || "Untitled",
          blob,
          mime:      track.mime || "application/octet-stream",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        newTrackIds.push(newId);
      }

      const newPlaylist = {
        id:        uid("pl"),
        name:      data.playlist.name || "Imported Playlist",
        trackIds:  newTrackIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await idbPut(STORES.playlists, newPlaylist);
      await loadPlaylists();

      activePlaylistId = newPlaylist.id;
      currentIndex     = -1;

      renderPlaylists();
      await renderTracks();
      await refreshStorageInfo();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      nowPlayingEl.textContent = mediaEl.paused ? "—" : nowPlayingEl.textContent;
    }
  }

  // ---------------------------
  // Playback
  // ---------------------------
  async function stopPlayback() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    mediaEl.pause();
    mediaEl.removeAttribute("src");
    mediaEl.load();
    mediaEl.classList.remove("visible");
    nowPlayingEl.textContent = "—";
    resetSeekBar();
    await releaseWakeLock();
    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = "none";
  }

  async function playIndex(index, startTime = 0) {
    const p = getActivePlaylist();
    if (!p || p.trackIds.length === 0) return;

    currentIndex = clamp(index, 0, p.trackIds.length - 1);
    const trackId = p.trackIds[currentIndex];
    const t = await idbGet(STORES.tracks, trackId);
    if (!t) {
      clearLastPlaybackState();
      currentIndex = -1;
      nowPlayingEl.textContent = "—";
      return;
    }

    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(t.blob);

    mediaEl.src = currentObjectUrl;

    mediaEl.addEventListener("loadedmetadata", () => {
      if (
        Number.isFinite(startTime) &&
        startTime > 0 &&
        Number.isFinite(mediaEl.duration) &&
        startTime < mediaEl.duration
      ) {
        mediaEl.currentTime = startTime;
      }
    }, { once: true });
    
    
    const isVideo = (t.mime || "").startsWith("video/");
    mediaEl.classList.toggle("visible", isVideo);

    nowPlayingEl.textContent = `Playing: ${t.title ?? "Untitled"}`;
    saveLastPlaybackState();
    // ── Media Session: update metadata for this track ──────────────
    setMediaSessionMetadata(t);
    emitCurrentTrack("track-selected");

    try {
      await mediaEl.play();
      await acquireWakeLock();
      emitCurrentTrack("play-started");
    } catch { /* autoplay blocked */ }
  }

    async function playCurrentOrFirst() {
      const p = getActivePlaylist();
      if (!p || p.trackIds.length === 0) return;
    
      if (currentIndex >= 0 && mediaEl.src && mediaEl.paused) {
        try {
          await mediaEl.play();
          await acquireWakeLock();
          return;
        } catch { /* fall through */ }
      }
    
      if (currentIndex < 0) currentIndex = 0;
    
      let startTime = 0;
    
      try {
        const last = JSON.parse(localStorage.getItem(LAST_STATE_KEY) || "{}");
        const trackId = p.trackIds[currentIndex];
    
        if (last?.activePlaylistId === activePlaylistId && last?.trackId === trackId) {
          startTime = Number(last.currentTime ?? 0);
        }
      } catch {
        startTime = 0;
      }
    
      await playIndex(currentIndex, startTime);
    }

  async function togglePlayPause() {
    if (!mediaEl.paused) {
      mediaEl.pause();
      await releaseWakeLock();
    } else {
      await playCurrentOrFirst();
    }
  }

function getRandomTrackIndex(excludeIndex = -1) {
  const p = getActivePlaylist();
  if (!p || p.trackIds.length === 0) return -1;
  if (p.trackIds.length === 1) return 0;

  let idx;
  do {
    idx = Math.floor(Math.random() * p.trackIds.length);
  } while (idx === excludeIndex);

  return idx;
}
  
async function nextTrack() {
  const p = getActivePlaylist();
  if (!p || p.trackIds.length === 0) return;

  if (isShuffleActive) {
    await playIndex(getRandomTrackIndex(currentIndex));
    return;
  }

  const next = currentIndex < 0 ? 0 : (currentIndex + 1) % p.trackIds.length;
  await playIndex(next);
}

async function prevTrack() {
  const p = getActivePlaylist();
  if (!p || p.trackIds.length === 0) return;

  if (isShuffleActive) {
    await playIndex(getRandomTrackIndex(currentIndex));
    return;
  }

  const prev = currentIndex <= 0 ? 0 : currentIndex - 1;
  await playIndex(prev);
}

  function shuffleTrack() {
    isShuffleActive = !isShuffleActive;
    btnShuffle.classList.toggle("active", isShuffleActive);
    btnShuffle.setAttribute("aria-pressed", String(isShuffleActive));
    btnShuffle.textContent = isShuffleActive ? "🔀 ON" : "🔀 OFF";
  }

  // ---------------------------
  // Event wiring
  // ---------------------------
  btnNewPlaylist.addEventListener("click", createPlaylist);

  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = "";
    if (files.length === 0) return;
  
    // Séparer json et media
    const jsonFiles  = files.filter(f => f.name.endsWith(".json"));
    const mediaFiles = files.filter(f => !f.name.endsWith(".json") && isMediaFile(f));
    const skipped    = files.length - jsonFiles.length - mediaFiles.length;
  
    for (const jsonFile of jsonFiles) {
      await importTracksFromPlaylistFile(jsonFile); // nouvelle fonction
    }
  
    if (mediaFiles.length > 0) await importFilesToActivePlaylist(mediaFiles);
    if (skipped > 0) alert(`${skipped} fichier(s) ignoré(s) (format non reconnu).`);
  });


  importPlaylistInput.addEventListener("change", async () => {
    const file = importPlaylistInput.files?.[0];
    importPlaylistInput.value = "";
    if (!file) return;
    await importPlaylistFromFile(file);
  });

  btnPlay.addEventListener("click",    togglePlayPause);
  btnNext.addEventListener("click",    nextTrack);
  btnPrev.addEventListener("click",    prevTrack);
  btnShuffle.addEventListener("click", shuffleTrack);

  mediaEl.addEventListener("ended", async () => {
    const p = getActivePlaylist();
    if (!p || p.trackIds.length === 0) return;
  
    if (isShuffleActive) {
      await playIndex(getRandomTrackIndex(currentIndex));
      return;
    }
  
    await playIndex((currentIndex + 1) % p.trackIds.length);
  });

  window.addEventListener("beforeunload", () => {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  });

  setInterval(() => {
    if (!mediaEl.paused && mediaEl.src) {
      emitPlaybackState();
    }
  }, 1500);

//Iframe remote control

  window.addEventListener("message", async (event) => {
    const msg = event.data || {};
    const action = msg.action || msg.type;

    switch (action) {
      case "play":
        await togglePlayPause();
        break;

      case "next":
        await nextTrack();
        break;

      case "previous":
      case "prev":
        await prevTrack();
        break;

      case "random":
      case "shuffle":
        await playIndex(getRandomTrackIndex(currentIndex));
        break;
    }
  });

  
  // ---------------------------
  // Boot
  // ---------------------------
    async function restoreLastPlaybackState() {
    try {
      const raw = localStorage.getItem(LAST_STATE_KEY);
      if (!raw) return false;
  
      const last = JSON.parse(raw);
      if (!last?.activePlaylistId) {
        clearLastPlaybackState();
        return false;
      }
  
      const p = playlists.find(pl => pl.id === last.activePlaylistId);
      if (!p) {
        clearLastPlaybackState();
        return false;
      }
  
      activePlaylistId = p.id;
  
      if (!last.trackId) {
        currentIndex = -1;
        return true;
      }
  
      const idx = p.trackIds.indexOf(last.trackId);
      if (idx === -1) {
        clearLastPlaybackState();
        currentIndex = -1;
        return true;
      }
  
      const t = await idbGet(STORES.tracks, last.trackId);
      if (!t) {
        clearLastPlaybackState();
        currentIndex = -1;
        return true;
      }
  
      currentIndex = idx;
      nowPlayingEl.textContent = `Ready: ${t.title ?? "Untitled"}`;
      return true;
      
    } catch {
      clearLastPlaybackState();
      currentIndex = -1;
      return false;
    }
  }


  
  (async function init() {
    db = await openDB();
    await loadPlaylists();
    renderPlaylists();

    const restored = await restoreLastPlaybackState();
    if (!restored && playlists.length > 0) {
      activePlaylistId = playlists[0].id;
    }
    
    await renderTracks();
    await refreshStorageInfo();

    // Register Media Session action handlers once at startup
    setupMediaSessionHandlers();
  })();
})();
