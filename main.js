// main.js
(() => {
  "use strict";

  // ---------------------------
  // DOM
  // ---------------------------
  const $ = (sel) => document.querySelector(sel);

  const playlistListEl = $("#playlistList");
  const trackListEl = $("#trackList");
  const emptyStateEl = $("#emptyState");

  const btnNewPlaylist = $("#btnNewPlaylist");
  const fileInput = $("#fileInput");

  const btnPlay = $("#btnPlay");
  const btnPrev = $("#btnPrev");
  const btnNext = $("#btnNext");

  const activePlaylistBadge = $("#activePlaylistBadge");
  const nowPlayingEl = $("#nowPlaying");
  const storageInfoEl = $("#storageInfo");

  const audioEl = $("#audio");

  // ---------------------------
  // WAKELOCK 
  // ---------------------------
  
  let wakeLock = null;

async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch {
    // Refusé ou non autorisé (souvent si pas d'interaction user ou contraintes OS)
  }
}

async function releaseWakeLock() {
  try {
    if (wakeLock) await wakeLock.release();
  } finally {
    wakeLock = null;
  }
}

document.addEventListener("visibilitychange", async () => {
  // si on redevient visible et qu'on joue encore => réacquérir
  if (document.visibilityState === "visible" && !audioEl.paused) {
    await acquireWakeLock();
  }
});

  // ---------------------------
  // IndexedDB: schema & helpers
  // ---------------------------
  const DB_NAME = "offline_playlist_player";
  const DB_VERSION = 1;

  const STORES = {
    playlists: "playlists",
    tracks: "tracks",
  };

  /** @type {IDBDatabase|null} */
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const d = req.result;

        // Playlists: { id, name, trackIds: string[], createdAt, updatedAt }
        if (!d.objectStoreNames.contains(STORES.playlists)) {
          d.createObjectStore(STORES.playlists, { keyPath: "id" });
        }

        // Tracks: { id, title, blob, mime, createdAt, updatedAt }
        if (!d.objectStoreNames.contains(STORES.tracks)) {
          d.createObjectStore(STORES.tracks, { keyPath: "id" });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
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
      r.onerror = () => reject(r.error);
    });
  }

  function idbGetAll(storeName) {
    return new Promise((resolve, reject) => {
      const r = tx(storeName).getAll();
      r.onsuccess = () => resolve(r.result ?? []);
      r.onerror = () => reject(r.error);
    });
  }

  function idbPut(storeName, value) {
    return new Promise((resolve, reject) => {
      const r = tx(storeName, "readwrite").put(value);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  }

  // ---------------------------
  // App state
  // ---------------------------
  /** @type {{id:string,name:string,trackIds:string[],createdAt:number,updatedAt:number}[]} */
  let playlists = [];

  /** Active playlist id */
  let activePlaylistId = null;

  /** Playback */
  let currentIndex = -1;
  let currentObjectUrl = null;

  // ---------------------------
  // Utilities
  // ---------------------------
  function uid(prefix = "id") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function bytesToHuman(bytes) {
    if (!Number.isFinite(bytes)) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function setEmptyState(visible) {
    emptyStateEl.style.display = visible ? "block" : "none";
  }

  function setControlsEnabled(enabled) {
    btnPlay.disabled = !enabled;
    btnPrev.disabled = !enabled;
    btnNext.disabled = !enabled;
    fileInput.disabled = !activePlaylistId;
  }

  function getActivePlaylist() {
    return playlists.find((p) => p.id === activePlaylistId) ?? null;
  }

  async function refreshStorageInfo() {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        const used = bytesToHuman(est.usage ?? NaN);
        const quota = bytesToHuman(est.quota ?? NaN);
        storageInfoEl.textContent = `Stockage: ${used} / ${quota}`;
      } else {
        storageInfoEl.textContent = "Stockage: estimation indisponible";
      }
    } catch {
      storageInfoEl.textContent = "Stockage: estimation indisponible";
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
      div.textContent = "Aucune playlist. Créez-en une pour démarrer.";
      playlistListEl.appendChild(div);
      return;
    }

    for (const p of playlists) {
      const item = document.createElement("div");
      item.className = `item ${p.id === activePlaylistId ? "item--active" : ""}`;

      const left = document.createElement("div");
      left.className = "item__left";

      const title = document.createElement("div");
      title.className = "item__title";
      title.textContent = p.name;

      const meta = document.createElement("div");
      meta.className = "item__meta";
      meta.textContent = `${p.trackIds.length} titre(s)`;

      left.appendChild(title);
      left.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "item__actions";

      const btnSelect = document.createElement("button");
      btnSelect.className = "btn";
      btnSelect.textContent = "Ouvrir";
      btnSelect.onclick = () => setActivePlaylist(p.id);

      actions.appendChild(btnSelect);

      item.appendChild(left);
      item.appendChild(actions);

      playlistListEl.appendChild(item);
    }
  }

  async function renderTracks() {
    const p = getActivePlaylist();

    trackListEl.innerHTML = "";
    nowPlayingEl.textContent = "—";

    if (!p) {
      activePlaylistBadge.textContent = "Aucune playlist";
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
      titleInput.value = t.title ?? "Sans titre";
      titleInput.title = "Modifier le titre (valide à la sortie du champ)";
      titleInput.onchange = async () => {
        const newTitle = titleInput.value.trim() || "Sans titre";
        await idbPut(STORES.tracks, { ...t, title: newTitle, updatedAt: Date.now() });
        // Optionnel: refléter immédiatement le nowPlaying si nécessaire
        const ap = getActivePlaylist();
        if (ap && currentIndex === i && ap.trackIds[currentIndex] === trackId) {
          nowPlayingEl.textContent = `Lecture: ${newTitle}`;
        }
      };

      const meta = document.createElement("div");
      meta.className = "item__meta";
      meta.textContent = `${t.mime || "audio/mpeg"} · ${trackId.slice(0, 8)}…`;

      left.appendChild(titleInput);
      left.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "item__actions";

      const btnUp = document.createElement("button");
      btnUp.className = "iconbtn";
      btnUp.textContent = "↑";
      btnUp.disabled = i === 0;
      btnUp.onclick = () => moveTrack(i, -1);

      const btnDown = document.createElement("button");
      btnDown.className = "iconbtn";
      btnDown.textContent = "↓";
      btnDown.disabled = i === p.trackIds.length - 1;
      btnDown.onclick = () => moveTrack(i, +1);

      const btnPlayThis = document.createElement("button");
      btnPlayThis.className = "btn btn--primary";
      btnPlayThis.textContent = "Lire";
      btnPlayThis.onclick = () => playIndex(i);

      actions.appendChild(btnUp);
      actions.appendChild(btnDown);
      actions.appendChild(btnPlayThis);

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
    const name = prompt("Nom de la playlist ?", `Playlist ${playlists.length + 1}`);
    if (!name) return;

    const p = {
      id: uid("pl"),
      name: name.trim() || "Sans nom",
      trackIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await idbPut(STORES.playlists, p);
    await loadPlaylists();

    activePlaylistId = p.id;
    currentIndex = -1;
    stopPlayback();

    renderPlaylists();
    await renderTracks();
  }

  async function setActivePlaylist(playlistId) {
    activePlaylistId = playlistId;
    currentIndex = -1;
    stopPlayback();

    renderPlaylists();
    await renderTracks();
  }

  async function importFilesToActivePlaylist(files) {
    const p = getActivePlaylist();
    if (!p) return;

    const newTrackIds = [];

    for (const file of files) {
      // Nom initial = nom de fichier (sans extension), éditable ensuite
      const baseName = (file.name || "Sans titre").replace(/\.[^/.]+$/, "");
      const track = {
        id: uid("tr"),
        title: baseName || "Sans titre",
        blob: file, // File est un Blob => stockable
        mime: file.type || "audio/mpeg",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await idbPut(STORES.tracks, track);
      newTrackIds.push(track.id);
    }

    const updated = {
      ...p,
      trackIds: [...p.trackIds, ...newTrackIds],
      updatedAt: Date.now(),
    };

    await idbPut(STORES.playlists, updated);
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

    // Ajuster l’index de lecture si on déplace l’élément en cours
    if (currentIndex === index) currentIndex = nextIndex;
    else if (currentIndex === nextIndex) currentIndex = index;

    renderPlaylists();
    await renderTracks();
  }

  function stopPlayback() {
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
    audioEl.pause();
    audioEl.removeAttribute("src");
    audioEl.load();
    nowPlayingEl.textContent = "—";
  }

  async function playIndex(index) {
    const p = getActivePlaylist();
    if (!p || p.trackIds.length === 0) return;

    currentIndex = clamp(index, 0, p.trackIds.length - 1);
    const trackId = p.trackIds[currentIndex];
    const t = await idbGet(STORES.tracks, trackId);
    if (!t) return;

    // Nettoyage précédent objectURL
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(t.blob);

    audioEl.src = currentObjectUrl;
    nowPlayingEl.textContent = `Lecture: ${t.title ?? "Sans titre"}`;

    try {
      await audioEl.play();
    } catch {
      // autoplay bloqué : lecture déclenchée via interaction user en pratique
    }
  }

  async function playCurrentOrFirst() {
    const p = getActivePlaylist();
    if (!p || p.trackIds.length === 0) return;

    if (currentIndex < 0) currentIndex = 0;
    await playIndex(currentIndex);
  }

  async function nextTrack() {
    const p = getActivePlaylist();
    if (!p || p.trackIds.length === 0) return;

    const next = (currentIndex < 0) ? 0 : (currentIndex + 1);
    if (next >= p.trackIds.length) return; // fin de playlist (volontairement strict)
    await playIndex(next);
  }

  async function prevTrack() {
    const p = getActivePlaylist();
    if (!p || p.trackIds.length === 0) return;

    const prev = (currentIndex <= 0) ? 0 : (currentIndex - 1);
    await playIndex(prev);
  }

  // ---------------------------
  // Wiring
  // ---------------------------
  btnNewPlaylist.addEventListener("click", createPlaylist);

  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = "";
    if (files.length === 0) return;

    // Filtrage minimal (vous pouvez élargir à d’autres formats audio)
    const mp3s = files.filter((f) => (f.type || "").includes("mpeg") || /\.mp3$/i.test(f.name));
    if (mp3s.length === 0) {
      alert("Aucun MP3 détecté dans la sélection.");
      return;
    }

    await importFilesToActivePlaylist(mp3s);
  });

  btnPlay.addEventListener("click", playCurrentOrFirst);
  btnNext.addEventListener("click", nextTrack);
  btnPrev.addEventListener("click", prevTrack);

  audioEl.addEventListener("ended", async () => {
    // Lecture séquentielle: auto-next jusqu’à la fin
    const p = getActivePlaylist();
    if (!p) return;
    if (currentIndex + 1 < p.trackIds.length) {
      await playIndex(currentIndex + 1);
    }
  });

  window.addEventListener("beforeunload", () => {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  });

  // ---------------------------
  // Boot
  // ---------------------------
  (async function init() {
    db = await openDB();

    await loadPlaylists();
    renderPlaylists();

    // Auto-sélection de la playlist la plus récente
    if (playlists.length > 0) {
      activePlaylistId = playlists[0].id;
    }

    await renderTracks();
    await refreshStorageInfo();
  })();
})();
