/* X-BASS v1.2
   Note source: default eighth-note groove at the BPM, locked to media currentTime.
   A real transcription plugs in as absolute media times:
     XBass.setTrack([{t: 0.0, string: 0, fret: 0}, {t: 0.5, string: 0, fret: 3}]);
   string 0..3 = E A D G (low to high), fret 0 = open. Pass null to restore the groove.
*/
(function () {
  "use strict";

  const KEY = "xbass.v1";
  const STR = ["E", "A", "D", "G"];
  const PITCH = [41.2034, 55, 73.4162, 97.9989];
  const GROOVE = [
    { string: 0, fret: 0 },
    { string: 0, fret: 0 },
    { string: 0, fret: 3 },
    { string: 1, fret: 0 }
  ];
  const HITS = [
    ["hit-new", 470, 416, 410, 78, "new"],
    ["hit-saved", 470, 492, 410, 76, "saved"],
    ["hit-go", 470, 564, 410, 80, "continue"],
    ["hit-gear", 1180, 14, 70, 90, "settings"]
  ];
  const GEO = { nut: 1340, scale: 2200, boardY: 268, boardH: 250, boardL: 20, strings: [318, 372, 426, 480] };
  const TOP_Y = [108, 134, 160, 186];
  const TIP = { index: 183, middle: 200 };
  const PLUCK_X = 230;
  const I18N = {
    en: {
      dir: "ltr",
      newPlayer: "NEW PLAYER", savedPlayers: "SAVED PLAYERS", continue: "CONTINUE",
      settings: "SETTINGS", language: "LANGUAGE", song: "SONG", play: "PLAY",
      paste: "Paste a YouTube link", upload: "Upload mp3/mp4", recent: "RECENT",
      search: "SEARCH", searchPh: "Song or artist", searching: "Searching…",
      preparing: "Preparing…", ready: "Ready to play", noTab: "No bass tab found",
      noVideo: "No video found", noSongs: "No songs found", searchFail: "Search failed",
      guitar: "GUITAR", piano: "PIANO", vocals: "VOCALS", drums: "DRUMS",
      tuner: "TUNER", flat: "FLAT", inTune: "IN TUNE", sharp: "SHARP",
      tuneUp: "TUNE UP", tuneDown: "TUNE DOWN", back: "Back", home: "Home",
      playerName: "Player name", save: "Save", emptyPlayers: "No saved players",
      emptyRecent: "No recent songs", delete: "Delete", cents: "CENTS",
      enableMic: "Enable microphone", micDenied: "Microphone unavailable",
      invalid: "That is not a YouTube link", tap: "Tap tempo", loop: "Loop", pause: "Pause"
    },
    he: {
      dir: "rtl",
      newPlayer: "נגן חדש", savedPlayers: "נגנים שמורים", continue: "המשך",
      settings: "הגדרות", language: "שפה", song: "שיר", play: "נגן",
      paste: "הדבק קישור יוטיוב", upload: "העלאת mp3/mp4", recent: "אחרונים",
      search: "חיפוש", searchPh: "שיר או אמן", searching: "מחפש…",
      preparing: "מכין…", ready: "מוכן לנגן", noTab: "לא נמצא טאב לבס",
      noVideo: "לא נמצא סרטון", noSongs: "לא נמצאו שירים", searchFail: "החיפוש נכשל",
      guitar: "גיטרה", piano: "פסנתר", vocals: "שירה", drums: "תופים",
      tuner: "טיונר", flat: "נמוך", inTune: "מכוון", sharp: "גבוה",
      tuneUp: "מתח למעלה", tuneDown: "שחרר למטה", back: "חזרה", home: "בית",
      playerName: "שם הנגן", save: "שמור", emptyPlayers: "אין נגנים שמורים",
      emptyRecent: "אין שירים אחרונים", delete: "מחק", cents: "סנט",
      enableMic: "הפעל מיקרופון", micDenied: "אין גישה למיקרופון",
      invalid: "זה לא קישור יוטיוב", tap: "קצב בהקשה", loop: "לולאה", pause: "השהה"
    }
  };

  const state = load();
  let stack = ["home"];
  let current = "home";
  let ytPlayer = null;
  let ytApi = null;
  let mediaEl = null;
  let fileUrl = null;
  let pendingPlay = false;
  let rafId = 0;
  let lastTs = 0;
  const vis = {
    idx: -1, pf: "index", pluckStart: -1e9, shift: 0, key: "",
    fingers: [0, 1, 2, 3].map(() => ({ x: 1100, y: 400, o: 0 }))
  };
  const mutes = { guitar: false, piano: false, vocals: false, drums: false };
  let taps = [];

  let audioCtx = null;
  let analyser = null;
  let stream = null;
  let micPending = false;
  let tunerOn = false;
  let tunerRaf = 0;
  let lastDetect = 0;
  let needle = 0;
  let tuneDir = 0;
  const wave = new Float32Array(8192);

  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  function t(k) { return (I18N[state.lang] || I18N.en)[k] || I18N.en[k] || k; }

  function load() {
    const base = { players: [], recent: [], current: "", lang: "en", bpm: 96, stringSel: 1, speed: 1, loop: false, track: null };
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && typeof raw === "object") Object.assign(base, raw);
    } catch (e) {}
    if (base.lang !== "he" && base.lang !== "en") base.lang = "en";
    base.bpm = clamp(base.bpm | 0 || 96, 40, 220);
    base.stringSel = clamp(base.stringSel | 0, 0, 3);
    base.players = Array.isArray(base.players) ? base.players.filter((n) => typeof n === "string").slice(0, 40) : [];
    base.recent = Array.isArray(base.recent) ? base.recent.filter((r) => r && r.id).slice(0, 12) : [];
    base.track = null;
    return base;
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        players: state.players, recent: state.recent, current: state.current,
        lang: state.lang, bpm: state.bpm, stringSel: state.stringSel, speed: state.speed, loop: state.loop
      }));
    } catch (e) {}
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function applyI18n() {
    const pack = I18N[state.lang] || I18N.en;
    document.documentElement.lang = state.lang === "he" ? "he" : "en";
    document.documentElement.dir = pack.dir;
    document.querySelectorAll("[data-i]").forEach((el) => { el.textContent = pack[el.dataset.i] || el.textContent; });
    document.querySelectorAll("[data-ph]").forEach((el) => { el.placeholder = pack[el.dataset.ph] || ""; });
    document.querySelectorAll("[data-aria]").forEach((el) => { el.setAttribute("aria-label", pack[el.dataset.aria] || ""); });
    $("lang-en").classList.toggle("on", state.lang === "en");
    $("lang-he").classList.toggle("on", state.lang === "he");
    $("btn-loop").setAttribute("aria-pressed", state.loop ? "true" : "false");
  }

  function svg(name, attrs) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function fretX(f) {
    if (f <= 0) return GEO.nut;
    return GEO.nut - (1 - Math.pow(2, -f / 12)) * GEO.scale;
  }

  function buildStage() {
    const frets = $("top-frets");
    for (let n = 0; n <= 12; n++) {
      const x = 1024 + n * 40;
      if (x > 1508) break;
      frets.appendChild(svg("line", { x1: x, y1: 52, x2: x, y2: 180, stroke: n ? "#c5c9d0" : "#f7f4ee", "stroke-width": n ? 2 : 7 }));
      if (n === 3 || n === 5 || n === 7 || n === 9 || n === 12) {
        frets.appendChild(svg("circle", { cx: x - 20, cy: 116, r: 5.5, fill: "#fffdf8" }));
      }
    }
    const pk = $("pickups");
    [156, 360].forEach((x) => {
      const g = svg("g", { transform: "translate(" + x + ",84)" });
      g.appendChild(svg("rect", { x: -2, y: -2, width: 42, height: 120, rx: 7, fill: "#3a3a3a" }));
      g.appendChild(svg("rect", { width: 38, height: 116, rx: 5, fill: "#141414" }));
      for (let i = 0; i < 6; i++) {
        const cy = 14 + i * 16;
        g.appendChild(svg("circle", { cx: 12, cy: cy, r: 3.2, fill: "#eef2f6", stroke: "#9aa3ad", "stroke-width": 0.6 }));
        g.appendChild(svg("circle", { cx: 26, cy: cy, r: 3.2, fill: "#eef2f6", stroke: "#9aa3ad", "stroke-width": 0.6 }));
      }
      pk.appendChild(g);
    });
    const ts = $("top-strings");
    TOP_Y.forEach((y, i) => {
      ts.appendChild(svg("line", {
        id: "ts" + i, x1: 70, y1: y, x2: 1588, y2: y,
        stroke: "#c5ced8", "stroke-width": 1.7 + (3 - i) * 0.35, "stroke-linecap": "round"
      }));
    });

    const board = $("board");
    const y = GEO.boardY, h = GEO.boardH, left = GEO.boardL;
    board.appendChild(svg("rect", { x: left, y: y, width: GEO.nut - left + 6, height: h, rx: 16, fill: "url(#wood)" }));
    board.appendChild(svg("rect", { x: left + 7, y: y + 8, width: GEO.nut - left - 10, height: h - 16, rx: 10, fill: "none", stroke: "#f8efdf", "stroke-width": 4 }));
    for (let n = 0; n <= 20; n++) {
      const x = fretX(n);
      if (x < left + 8) break;
      board.appendChild(svg("line", {
        x1: x, y1: y + 8, x2: x, y2: y + h - 8,
        stroke: n === 0 ? "#f7f4ee" : "#c5c9d0", "stroke-width": n === 0 ? 8 : 2.5
      }));
    }
    [3, 5, 7, 9, 15].forEach((n) => {
      const x = (fretX(n) + fretX(n - 1)) / 2;
      if (x < left) return;
      board.appendChild(svg("circle", { cx: x, cy: y + h / 2, r: 8, fill: "#fffdf8" }));
    });
    const x12 = (fretX(12) + fretX(11)) / 2;
    board.appendChild(svg("circle", { cx: x12, cy: y + h / 2 - 28, r: 8, fill: "#fffdf8" }));
    board.appendChild(svg("circle", { cx: x12, cy: y + h / 2 + 28, r: 8, fill: "#fffdf8" }));
    board.appendChild(svg("path", {
      d: "M" + (GEO.nut - 2) + " " + (y + 16) + " L1520 " + (y - 6) + " L1588 " + (y + 24) + " L1588 " + (y + h - 18) + " L1520 " + (y + h + 8) + " L" + (GEO.nut - 2) + " " + (y + h - 14) + " Z",
      fill: "url(#wood2)", stroke: "#c9a06a", "stroke-width": 2
    }));
    GEO.strings.forEach((sy, i) => {
      board.appendChild(svg("line", {
        id: "bs" + i, x1: left + 12, y1: sy, x2: GEO.nut, y2: sy,
        stroke: "#d5dbe3", "stroke-width": 1.6 + (3 - i) * 0.35, "stroke-linecap": "round"
      }));
    });

    const hand = $("fret-hand");
    const leans = [-10, -3, 7, 16];
    const lens = [104, 118, 112, 96];
    for (let i = 0; i < 4; i++) {
      const g = svg("g", { id: "ff" + i });
      const lean = leans[i];
      const len = lens[i];
      const d = "M-13,18 C" + (-17 + lean * 0.08) + ",42 " + (-16 + lean * 0.28) + "," + (len * 0.62) + " " + (-7 + lean * 0.45) + "," + len +
        " C" + (-1 + lean * 0.5) + "," + (len + 16) + " " + (12 + lean * 0.32) + "," + (len + 12) + " " + (15 + lean * 0.18) + "," + (len - 8) +
        " C" + (18 + lean * 0.06) + "," + (len * 0.5) + " 15,40 11,18 C7,8 2,5 0,11 C-8,7 -12,10 -13,18 Z";
      g.appendChild(svg("path", { d: d, fill: "url(#skin)", stroke: "#e2b198", "stroke-width": 1.5 }));
      g.appendChild(svg("path", { d: "M-12,48 Q1,56 14,46", fill: "none", stroke: "#d9a48c", "stroke-width": 1.3, "stroke-linecap": "round" }));
      g.appendChild(svg("path", { d: "M-10,74 Q2,82 13,72", fill: "none", stroke: "#d9a48c", "stroke-width": 1.1, "stroke-linecap": "round" }));
      g.appendChild(svg("circle", { class: "glow", cx: 0, cy: 12, r: 15, fill: "#ff2a3a", opacity: 0, filter: "url(#glow)" }));
      g.appendChild(svg("ellipse", { cx: 0, cy: 13, rx: 11, ry: 8.5, fill: "url(#nail)" }));
      g.appendChild(svg("ellipse", { cx: -3, cy: 11, rx: 4.2, ry: 2.3, fill: "#ffe0e3", opacity: 0.85 }));
      hand.appendChild(g);
    }
    hand.appendChild(svg("ellipse", { id: "fret-palm", cx: 0, cy: 0, rx: 86, ry: 36, fill: "url(#skin)", stroke: "#e2b198", "stroke-width": 1.5 }));
    const thumb = svg("g", { id: "fret-thumb" });
    thumb.appendChild(svg("path", { fill: "url(#skin)", stroke: "#e2b198", "stroke-width": 1.5, d: "M0,8 C16,-6 40,4 42,26 C44,46 26,60 8,52 C-8,44 -8,18 0,8 Z" }));
    thumb.appendChild(svg("ellipse", { cx: 34, cy: 22, rx: 10, ry: 7.5, fill: "url(#nail)" }));
    thumb.appendChild(svg("ellipse", { cx: 31, cy: 20, rx: 3.5, ry: 2, fill: "#ffe0e3", opacity: 0.8 }));
    hand.appendChild(thumb);
  }

  function buildHead() {
    const pegs = [
      { x: 300, y: 78, sy: 128 },
      { x: 368, y: 66, sy: 156 },
      { x: 436, y: 56, sy: 184 },
      { x: 504, y: 48, sy: 210 }
    ];
    state._pegs = pegs;
    const frets = $("hs-frets");
    for (let i = 0; i < 6; i++) {
      const x = 36 + i * 36;
      frets.appendChild(svg("line", { x1: x, y1: 104, x2: x, y2: 226, stroke: "#f6f1e8", "stroke-width": 2 }));
    }
    const sg = $("hs-strings");
    const pg = $("hs-pegs");
    pegs.forEach((p, i) => {
      sg.appendChild(svg("line", {
        id: "hss" + i, x1: 0, y1: p.sy, x2: p.x, y2: p.y,
        stroke: i === state.stringSel ? "#e1061c" : "#dedede",
        "stroke-width": i === state.stringSel ? 4 : 2, "stroke-linecap": "round"
      }));
      const g = svg("g", { id: "peg" + i, transform: "translate(" + p.x + "," + p.y + ")" });
      g.appendChild(svg("circle", { r: 16, fill: "#e6eaee", stroke: "#111", "stroke-width": 2 }));
      g.appendChild(svg("circle", { r: 5, fill: "#8d97a3" }));
      pg.appendChild(g);
    });
    const hand = $("hs-hand");
    hand.appendChild(svg("path", {
      fill: "#f6c7ad", stroke: "#222", "stroke-width": 2,
      d: "M-6,-78 C-28,-96 8,-124 42,-112 C74,-100 86,-68 64,-48 C96,-36 104,-4 72,6 C40,14 -8,4 -22,-18 C-40,-6 -34,-52 -6,-78 Z"
    }));
    hand.appendChild(svg("ellipse", { cx: 16, cy: 4, rx: 11, ry: 8, fill: "#e3182d", stroke: "#222" }));
    hand.appendChild(svg("ellipse", { cx: 46, cy: -8, rx: 9, ry: 7, fill: "#e3182d", stroke: "#222" }));
    const arrow = $("hs-arrow");
    arrow.appendChild(svg("path", {
      id: "tune-arc", d: "M8,36 A26 26 0 1 1 6,58", fill: "none", stroke: "#fff",
      "stroke-width": 3, "marker-end": "url(#ah)"
    }));
    const label = svg("text", { id: "tune-dir", x: 40, y: 28, fill: "#fff", "font-size": 14, "font-weight": 700 });
    label.textContent = t("tuneUp");
    arrow.appendChild(label);
  }

  function layoutHome() {
    const view = $("view-home");
    const vw = view.clientWidth, vh = view.clientHeight;
    if (!vw || !vh) return;
    const iw = 1280, ih = 720;
    const scale = Math.max(vw / iw, vh / ih);
    const ox = (vw - iw * scale) / 2;
    const oy = (vh - ih * scale) / 2;
    HITS.forEach(([id, x, y, w, h]) => {
      const el = $(id);
      el.style.left = (ox + x * scale) + "px";
      el.style.top = (oy + y * scale) + "px";
      el.style.width = (w * scale) + "px";
      el.style.height = (h * scale) + "px";
    });
  }

  function show(name) {
    const prev = current;
    current = name;
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("on", v.id === "view-" + name));
    if (prev === "play" && name !== "play") pauseMedia();
    if (name !== "tuner") tunerLeave();
    if (name === "play") startLoop(); else stopLoop();
    if (name === "players") renderPlayers();
    if (name === "song") { renderRecent(); $("song-who").textContent = state.current || ""; }
    if (name === "home") requestAnimationFrame(layoutHome);
    if (name === "tuner") tunerEnter();
    if (name === "settings") applyI18n();
  }
  function go(name) { stack.push(name); show(name); }
  function back() { if (stack.length > 1) stack.pop(); show(stack[stack.length - 1]); }
  function home() { stack = ["home"]; show("home"); }
  function toSong() {
    const i = stack.lastIndexOf("song");
    stack = i >= 0 ? stack.slice(0, i + 1) : stack.concat("song");
    show("song");
  }

  function renderPlayers() {
    const ul = $("player-list");
    ul.replaceChildren();
    if (!state.players.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = t("emptyPlayers");
      ul.appendChild(li);
      return;
    }
    state.players.forEach((name, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "row-main" + (name === state.current ? " on" : "");
      b.textContent = name;
      b.addEventListener("click", () => { state.current = name; persist(); go("song"); });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "row-del";
      del.textContent = t("delete");
      del.addEventListener("click", () => {
        state.players.splice(i, 1);
        if (state.current === name) state.current = "";
        persist();
        renderPlayers();
      });
      li.append(b, del);
      ul.appendChild(li);
    });
  }

  function renderRecent() {
    const box = $("recent-list");
    box.replaceChildren();
    if (!state.recent.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = t("emptyRecent");
      box.appendChild(p);
      return;
    }
    state.recent.forEach((r) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "recent";
      const img = document.createElement("img");
      img.src = "https://i.ytimg.com/vi/" + r.id + "/hqdefault.jpg";
      img.alt = "";
      const span = document.createElement("span");
      span.textContent = r.id;
      b.append(img, span);
      b.addEventListener("click", () => startYouTube(r.id, r.url || ("https://youtu.be/" + r.id)));
      box.appendChild(b);
    });
  }

  function youtubeId(raw) {
    let s = String(raw || "").trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    let u;
    try { u = new URL(s); } catch (e) { return null; }
    const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    const ok = host === "youtu.be" || host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com" || host.endsWith(".youtube.com");
    if (!ok) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    let id = "";
    if (host === "youtu.be") id = parts[0] || "";
    else if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") id = parts[1] || "";
    else id = u.searchParams.get("v") || "";
    const m = String(id).match(/^[A-Za-z0-9_-]{11}/);
    return m ? m[0] : null;
  }

  function pushRecent(id, url) {
    state.recent = [{ id: id, url: url }].concat(state.recent.filter((r) => r.id !== id)).slice(0, 12);
    persist();
  }

  function ensureYT() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (ytApi) return ytApi;
    ytApi = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prev === "function") prev();
        resolve();
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
    return ytApi;
  }

  function destroyYT() {
    if (ytPlayer && ytPlayer.destroy) { try { ytPlayer.destroy(); } catch (e) {} }
    ytPlayer = null;
  }
  function clearFile() {
    if (mediaEl) { mediaEl.pause(); mediaEl.remove(); mediaEl = null; }
    if (fileUrl) { URL.revokeObjectURL(fileUrl); fileUrl = null; }
  }

  function mountYouTube(id) {
    clearFile();
    const slot = $("media-slot");
    if (!$("yt-mount") || !ytPlayer) {
      destroyYT();
      slot.replaceChildren();
      const mount = document.createElement("div");
      mount.id = "yt-mount";
      slot.appendChild(mount);
    }
    ensureYT().then(() => {
      if (!state.source || state.source.type !== "yt" || state.source.id !== id) return;
      if (ytPlayer && ytPlayer.loadVideoById) {
        ytPlayer.loadVideoById({ videoId: id });
        applySpeed();
        if (pendingPlay) { ytPlayer.playVideo(); pendingPlay = false; }
        return;
      }
      ytPlayer = new YT.Player("yt-mount", {
        width: "100%",
        height: "100%",
        videoId: id,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, fs: 0, origin: location.origin },
        events: {
          onReady: function () {
            applySpeed();
            if (pendingPlay) { ytPlayer.playVideo(); pendingPlay = false; }
          },
          onStateChange: function (e) {
            const PS = YT.PlayerState;
            setPlayingFlag(e.data === PS.PLAYING);
            if (e.data === PS.ENDED && state.loop && ytPlayer) {
              ytPlayer.seekTo(0, true);
              ytPlayer.playVideo();
            }
          }
        }
      });
    }).catch(() => {});
  }

  function mountFile(file) {
    destroyYT();
    clearFile();
    const slot = $("media-slot");
    slot.replaceChildren();
    const isVideo = /^video\//.test(file.type) || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    fileUrl = URL.createObjectURL(file);
    mediaEl = document.createElement(isVideo ? "video" : "audio");
    mediaEl.src = fileUrl;
    mediaEl.playsInline = true;
    mediaEl.setAttribute("playsinline", "");
    mediaEl.setAttribute("webkit-playsinline", "");
    mediaEl.loop = !!state.loop;
    if (!isVideo) {
      const face = document.createElement("div");
      face.className = "audio-face";
      face.textContent = "♪";
      slot.appendChild(face);
    }
    slot.appendChild(mediaEl);
    mediaEl.addEventListener("play", () => setPlayingFlag(true));
    mediaEl.addEventListener("pause", () => setPlayingFlag(false));
    const playAttempt = mediaEl.play();
    if (playAttempt && playAttempt.catch) playAttempt.catch(() => setPlayingFlag(false));
  }

  function startYouTube(id, url) {
    const slot = $("media-slot");
    if (slot) slot.dataset.video = id;
    pushRecent(id, url);
    state.source = { type: "yt", id: id };
    pendingPlay = true;
    go("play");
    mountYouTube(id);
  }
  function startFile(file) {
    state.track = null;
    state.source = { type: "file", name: file.name };
    go("play");
    mountFile(file);
  }

  function mediaTime() {
    try {
      if (state.source && state.source.type === "yt" && ytPlayer && ytPlayer.getCurrentTime) {
        const n = ytPlayer.getCurrentTime();
        return typeof n === "number" ? n : 0;
      }
      if (mediaEl) return mediaEl.currentTime || 0;
    } catch (e) {}
    return 0;
  }
  function pauseMedia() {
    pendingPlay = false;
    try { if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo(); } catch (e) {}
    if (mediaEl && !mediaEl.paused) mediaEl.pause();
    setPlayingFlag(false);
  }
  function applySpeed() {
    const r = state.speed;
    if (mediaEl) { try { mediaEl.playbackRate = r; } catch (e) {} }
    if (ytPlayer && ytPlayer.setPlaybackRate) { try { ytPlayer.setPlaybackRate(r); } catch (e) {} }
  }
  function setPlayingFlag(on) {
    $("btn-play").textContent = on ? "❚❚" : "▶";
    $("btn-play").setAttribute("aria-label", on ? t("pause") : t("play"));
  }
  function togglePlay() {
    if (!state.source) return;
    if (state.source.type === "yt" && ytPlayer && ytPlayer.getPlayerState) {
      try {
        if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
        else ytPlayer.playVideo();
      } catch (e) {}
      return;
    }
    if (mediaEl) {
      if (mediaEl.paused) { const p = mediaEl.play(); if (p && p.catch) p.catch(() => {}); }
      else mediaEl.pause();
    }
  }

  function noteAt(time) {
    if (state.track && state.track.length) {
      const a = state.track;
      if (time < a[0].t) return { string: 0, fret: 0, key: "rest", rest: true };
      let lo = 0, hi = a.length - 1, ans = 0;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (a[m].t <= time + 1e-4) { ans = m; lo = m + 1; } else hi = m - 1;
      }
      const n = a[ans];
      if (n.rest) return { string: 0, fret: 0, key: "c" + ans, rest: true };
      return { string: clamp(n.string | 0, 0, 3), fret: clamp(n.fret | 0, 0, 24), key: "c" + ans };
    }
    const eighth = 60 / state.bpm / 2;
    const idx = Math.floor(Math.max(0, time) / eighth + 1e-6);
    const g = GROOVE[((idx % 4) + 4) % 4];
    return { string: g.string, fret: g.fret, key: "g" + idx, idx: idx };
  }

  function tick(dt, now) {
    const note = noteAt(mediaTime());
    const k = 1 - Math.exp(-7 * dt);
    if (note.key !== vis.key) {
      vis.key = note.key;
      vis.pluckStart = now;
      vis.pf = vis.pf === "index" ? "middle" : "index";
    }
    const age = (now - vis.pluckStart) / 210;
    const dip = age >= 0 && age <= 1 ? Math.sin(age * Math.PI) * 16 : 0;
    const shiftTarget = TOP_Y[note.string] - TIP[vis.pf];
    vis.shift += (shiftTarget - vis.shift) * k;
    $("pluck-hand").setAttribute("transform", "translate(" + PLUCK_X + "," + vis.shift.toFixed(1) + ")");
    const pluckingIndex = vis.pf === "index";
    $("pf-index").setAttribute("transform", pluckingIndex ? "translate(0," + dip.toFixed(1) + ") rotate(" + (dip * 0.4).toFixed(2) + " 63 174)" : "");
    $("pf-middle").setAttribute("transform", pluckingIndex ? "" : "translate(0," + dip.toFixed(1) + ") rotate(" + (dip * -0.32).toFixed(2) + " 106 190)");

    const wob = age >= 0 && age < 2 ? Math.sin(age * 14) * Math.exp(-age * 2.2) * 2.4 : 0;
    for (let i = 0; i < 4; i++) {
      const top = $("ts" + i);
      const y = TOP_Y[i] + (i === note.string ? wob : 0);
      top.setAttribute("y1", y);
      top.setAttribute("y2", y);
      top.setAttribute("stroke", i === note.string ? "#fff" : "#c5ced8");
      const bot = $("bs" + i);
      const by = GEO.strings[i] + (i === note.string ? wob : 0);
      bot.setAttribute("y1", by);
      bot.setAttribute("y2", by);
      bot.setAttribute("stroke", i === note.string ? "#fff" : "#d5dbe3");
    }

    const open = note.fret <= 0 || note.rest;
    const fi = open ? -1 : (note.fret - 1) % 4;
    const anchor = open ? 0 : note.fret - fi;
    let palmX = 0;
    for (let i = 0; i < 4; i++) {
      const fr = anchor + i;
      const tx = fretX(Math.max(0, fr));
      const ty = GEO.strings[note.string] + (open ? 46 : 0);
      const f = vis.fingers[i];
      f.x += (tx - f.x) * k;
      f.y += (ty - f.y) * k;
      const targetO = i === fi ? 0.95 : 0;
      f.o += (targetO - f.o) * k;
      const g = $("ff" + i);
      g.setAttribute("transform", "translate(" + f.x.toFixed(1) + "," + f.y.toFixed(1) + ")");
      g.querySelector(".glow").setAttribute("opacity", f.o.toFixed(3));
      palmX += f.x;
    }
    const palm = $("fret-palm");
    palm.setAttribute("cx", (palmX / 4 + 6).toFixed(1));
    palm.setAttribute("cy", (vis.fingers[1].y + 86).toFixed(1));
    $("fret-thumb").setAttribute("transform", "translate(" + (vis.fingers[3].x + 26).toFixed(1) + "," + (vis.fingers[3].y + 18).toFixed(1) + ")");
  }

  function startLoop() {
    if (rafId) return;
    lastTs = 0;
    const frame = (ts) => {
      rafId = requestAnimationFrame(frame);
      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;
      if (current === "play") tick(dt, ts);
    };
    rafId = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function setBpm(n) {
    state.bpm = clamp(Math.round(n), 40, 220);
    $("bpm-val").textContent = String(state.bpm);
    persist();
  }

  function selectString(i) {
    state.stringSel = i;
    persist();
    document.querySelectorAll("#str-btns button").forEach((b) => {
      b.classList.toggle("on", +b.dataset.string === i);
    });
    $("tune-name").textContent = STR[i];
    (state._pegs || []).forEach((p, n) => {
      const line = $("hss" + n);
      if (!line) return;
      const on = n === i;
      line.setAttribute("stroke", on ? "#e1061c" : "#dedede");
      line.setAttribute("stroke-width", on ? 4 : 2);
      const peg = $("peg" + n);
      if (peg) peg.querySelector("circle").setAttribute("stroke", on ? "#e1061c" : "#111");
    });
    placeHand();
  }
  function placeHand() {
    const p = (state._pegs || [])[state.stringSel];
    if (!p) return;
    $("hs-hand").setAttribute("transform", "translate(" + (p.x - 10) + "," + (p.y - 8) + ") rotate(" + (tuneDir * -16) + " 20 0)");
    const show = tuneDir !== 0;
    $("hs-arrow").setAttribute("visibility", show ? "visible" : "hidden");
    $("hs-arrow").setAttribute("transform", "translate(" + (p.x + 24) + "," + (p.y - 70) + ") scale(" + (tuneDir > 0 ? -1 : 1) + ",1)");
    const label = $("tune-dir");
    if (label) label.textContent = tuneDir > 0 ? t("tuneDown") : t("tuneUp");
  }

  function detectPitch(buf, sampleRate) {
    const step = 4;
    const n = (buf.length / step) | 0;
    if (n < 64) return null;
    let energy = 0;
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = buf[i * step];
      b[i] = v;
      energy += v * v;
    }
    if (energy / n < 0.0008) return null;
    const sr = sampleRate / step;
    const minLag = Math.max(2, (sr / 500) | 0);
    const maxLag = Math.min(n - 3, (sr / 28) | 0);
    const cm = new Float32Array(maxLag + 1);
    let run = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      let sum = 0;
      const len = n - tau;
      for (let i = 0; i < len; i++) {
        const d = b[i] - b[i + tau];
        sum += d * d;
      }
      run += sum;
      cm[tau] = run > 0 ? (sum * tau) / run : 1;
    }
    const TH = 0.12;
    let tau = minLag;
    while (tau <= maxLag && cm[tau] > TH) tau++;
    if (tau > maxLag) {
      let best = minLag;
      for (let t0 = minLag; t0 <= maxLag; t0++) if (cm[t0] < cm[best]) best = t0;
      if (cm[best] > 0.35) return null;
      tau = best;
    }
    let best = tau;
    while (best + 1 <= maxLag && cm[best + 1] < cm[best]) best++;
    if (cm[best] > 0.4) return null;
    const xm = cm[best - 1], x0 = cm[best], xp = cm[best + 1] || x0;
    const denom = xm - 2 * x0 + xp;
    const shift = denom ? (xm - xp) / (2 * denom) : 0;
    const freq = sr / (best + shift);
    if (!(freq > 28 && freq < 500)) return null;
    return freq;
  }
  function foldNear(freq, target) {
    let f = freq, g = 0;
    const lim = Math.SQRT2;
    while (f > target * lim && g++ < 4) f *= 0.5;
    g = 0;
    while (f < target / lim && g++ < 4) f *= 2;
    return f;
  }

  function tunerEnter() {
    tunerOn = true;
    selectString(state.stringSel);
    needle = 0;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $("mic-btn").hidden = false;
      $("mic-msg").hidden = false;
      $("mic-msg").textContent = t("micDenied");
      return;
    }
    if (stream) { tunerLoop(); return; }
    if (micPending) return;
    micPending = true;
    $("mic-btn").hidden = true;
    $("mic-msg").hidden = true;
    const constraints = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
    navigator.mediaDevices.getUserMedia(constraints).catch(() => navigator.mediaDevices.getUserMedia({ audio: true }))
      .then((s) => {
        micPending = false;
        if (!tunerOn) { s.getTracks().forEach((tr) => tr.stop()); return; }
        stream = s;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const resume = audioCtx.resume();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 8192;
        audioCtx.createMediaStreamSource(s).connect(analyser);
        Promise.resolve(resume).then(tunerLoop);
      })
      .catch(() => {
        micPending = false;
        $("mic-btn").hidden = false;
        $("mic-msg").hidden = false;
        $("mic-msg").textContent = t("micDenied");
      });
  }
  function tunerLeave() {
    tunerOn = false;
    if (tunerRaf) cancelAnimationFrame(tunerRaf);
    tunerRaf = 0;
    if (stream) { stream.getTracks().forEach((tr) => tr.stop()); stream = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; analyser = null; }
    micPending = false;
  }
  function tunerLoop() {
    if (!tunerOn) return;
    tunerRaf = requestAnimationFrame(tunerLoop);
    const now = performance.now();
    if (!analyser || now - lastDetect < 60) {
      paintNeedle(null, false);
      return;
    }
    lastDetect = now;
    analyser.getFloatTimeDomainData(wave);
    const raw = detectPitch(wave, audioCtx.sampleRate || 48000);
    paintNeedle(raw, !!raw);
  }
  function paintNeedle(freq) {
    const targetHz = PITCH[state.stringSel];
    let cents = null;
    if (freq) {
      const folded = foldNear(freq, targetHz);
      cents = 1200 * Math.log2(folded / targetHz);
    }
    const goal = cents == null ? 0 : clamp(cents, -50, 50);
    needle += (goal - needle) * (cents == null ? 0.08 : 0.35);
    $("needle").setAttribute("transform", "rotate(" + (needle / 50 * 78).toFixed(2) + " 200 176)");
    if (cents == null) {
      $("tune-cents").textContent = "—";
      tuneDir = 0;
    } else {
      const rounded = Math.round(cents);
      const shown = clamp(rounded, -99, 99);
      $("tune-cents").textContent = (shown > 0 ? "+" : "") + shown;
      tuneDir = rounded < -7 ? -1 : rounded > 7 ? 1 : 0;
    }
    $("lab-flat").classList.toggle("hot", tuneDir < 0);
    $("lab-ok").classList.toggle("hot", cents != null && tuneDir === 0);
    $("lab-sharp").classList.toggle("hot", tuneDir > 0);
    placeHand();
  }

  function openNew() {
    $("modal").hidden = false;
    const input = $("name-input");
    input.value = "";
    input.focus();
  }
  function savePlayer(name) {
    const n = name.trim().slice(0, 24);
    if (!n) return;
    if (!state.players.includes(n)) state.players.push(n);
    state.current = n;
    persist();
    $("modal").hidden = true;
    go("song");
  }

  window.XBass = {
    setTrack: function (notes) {
      if (!notes) { state.track = null; return; }
      state.track = notes.map((n) => ({ t: +n.t || 0, string: n.string | 0, fret: n.fret | 0, rest: !!n.rest })).sort((a, b) => a.t - b.t);
    },
    clearTrack: function () { state.track = null; },
    getTrack: function () { return state.track; }
  };

  function setStatus(text, kind) {
    ["status-song", "status-play"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.textContent = text || "";
      el.classList.toggle("warn", kind === "warn");
    });
  }
  function parseMaybe(text) {
    const s = String(text || "").trim();
    try { return JSON.parse(s); } catch (e) {}
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    const a2 = s.indexOf("["), b2 = s.lastIndexOf("]");
    if (a2 >= 0 && b2 > a2) return JSON.parse(s.slice(a2, b2 + 1));
    throw new Error("parse");
  }
  async function getJson(url) {
    const opt = {};
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) opt.signal = AbortSignal.timeout(20000);
    try {
      const r = await fetch(url, opt);
      if (r.ok) return await r.json();
    } catch (e) {}
    const r = await fetch("https://r.jina.ai/" + url, Object.assign({ headers: { Accept: "application/json" } }, opt));
    if (!r.ok) throw new Error("net");
    const wrap = await r.json();
    if (!wrap || !wrap.data || !wrap.data.content) throw new Error("empty");
    return parseMaybe(wrap.data.content);
  }
  function isBassTrack(tr) {
    const inst = tr.instrument || "";
    const blob = (inst + " " + (tr.name || "")).toLowerCase();
    const id = tr.instrumentId | 0;
    if (/drum/.test(inst.toLowerCase())) return false;
    if (id >= 32 && id <= 39) return true;
    return blob.indexOf("bass") >= 0;
  }
  function bassIndex(tracks) {
    let best = -1, score = -1;
    (tracks || []).forEach((tr, i) => {
      if (!isBassTrack(tr)) return;
      let sc = tr.views || 0;
      const id = tr.instrumentId | 0;
      if (id >= 32 && id <= 39) sc += 1e9;
      else if ((tr.instrument || "").toLowerCase().indexOf("bass") >= 0) sc += 5e8;
      else sc += 1e8;
      if ((tr.tuning || []).length === 4) sc += 1e7;
      if (sc > score) { score = sc; best = i; }
    });
    return best;
  }
  function toBass(midi) {
    const open = [28, 33, 38, 43];
    let best = null;
    for (let s = 0; s < 4; s++) {
      const fret = midi - open[s];
      if (fret >= 0 && fret <= 22 && (!best || fret < best.fret)) best = { string: s, fret: fret };
    }
    return best;
  }
  function beatSeconds(beat, bpm, beatType) {
    const whole = (beatType || 4) * (60 / (bpm || 120));
    const dur = beat.duration;
    let frac = 0.25;
    if (dur && dur.length === 2 && dur[1]) frac = dur[0] / dur[1];
    else if (beat.type) {
      frac = 1 / beat.type;
      let dots = beat.dots || 0, add = frac;
      while (dots-- > 0) { add /= 2; frac += add; }
    }
    return frac * whole;
  }
  function tabToNotes(part, points) {
    const tuning = part.tuning || [43, 38, 33, 28];
    const measures = part.measures || [];
    const tempos = (part.automations && part.automations.tempo) || [];
    const tempoAt = {};
    tempos.forEach((tp) => { if (tp && tp.measure != null) tempoAt[tp.measure] = tp; });
    let bpm = (tempos[0] && tempos[0].bpm) || 120;
    let beatType = (tempos[0] && tempos[0].type) || 4;
    const events = [];
    let notation = 0;
    measures.forEach((measure, mi) => {
      if (tempoAt[mi]) {
        if (tempoAt[mi].bpm) bpm = tempoAt[mi].bpm;
        if (tempoAt[mi].type) beatType = tempoAt[mi].type;
      }
      const beats = (measure.voices && measure.voices[0] && measure.voices[0].beats) || [];
      let off = 0;
      const local = [];
      beats.forEach((beat) => {
        if (!beat || beat.graceNote) return;
        if (beat.tempo && beat.tempo.bpm) bpm = beat.tempo.bpm;
        const sec = beatSeconds(beat, bpm, beatType);
        const ns = beat.notes || [];
        const tied = ns.length && ns.every((n) => n && n.tie === true);
        if (beat.rest || ns.some((n) => n && n.rest)) {
          local.push({ off: off, rest: true });
        } else if (!tied) {
          let low = null;
          ns.forEach((n) => {
            if (!n || n.rest || n.tie === true || n.fret == null || n.string == null) return;
            if (n.string < 0 || n.string >= tuning.length) return;
            const midi = tuning[n.string] + n.fret;
            if (low == null || midi < low) low = midi;
          });
          const mapped = low == null ? null : toBass(low);
          if (mapped) local.push({ off: off, string: mapped.string, fret: mapped.fret });
        }
        off += sec;
      });
      local.forEach((ev) => {
        const frac = off > 0 ? ev.off / off : 0;
        let tt = notation + ev.off;
        if (points && mi < points.length && isFinite(+points[mi])) {
          const a = +points[mi];
          const b = mi + 1 < points.length && isFinite(+points[mi + 1]) ? +points[mi + 1] : a + Math.max(off, 0.2);
          tt = b > a ? a + frac * (b - a) : a;
        }
        events.push({ t: Math.max(0, tt), string: ev.string || 0, fret: ev.fret || 0, rest: !!ev.rest });
      });
      notation += off;
    });
    events.sort((a, b) => a.t - b.t);
    const out = [];
    events.forEach((ev) => {
      const prev = out[out.length - 1];
      if (prev && Math.abs(prev.t - ev.t) < 0.02 && prev.rest === ev.rest && prev.string === ev.string && prev.fret === ev.fret) return;
      out.push(ev);
    });
    return out.filter((ev) => ev.rest || ev.fret >= 0).slice(0, 6000);
  }
  function pickVideo(videos, points, partIndex, hash) {
    function featScore(f) {
      if (f === "playthrough" || !f) return 3;
      if (f === "alternative") return 2;
      if (f === "backing") return 1;
      return 0;
    }
    function onTrack(p) {
      if (Array.isArray(p.tracks) && p.tracks.indexOf(partIndex) >= 0) return true;
      if (hash && Array.isArray(p.trackHashes) && p.trackHashes.indexOf(hash) >= 0) return true;
      return false;
    }
    let best = null, bestScore = -1;
    (points || []).forEach((p) => {
      if (!p || !p.videoId || !p.points || p.points.length < 4 || p.feature === "solo") return;
      const sc = p.points.length + (onTrack(p) ? 100000 : 0) + featScore(p.feature) * 1000;
      if (sc > bestScore) { bestScore = sc; best = p; }
    });
    if (best) return { id: best.videoId, points: best.points };
    const vids = (videos || []).filter((v) => v && v.videoId && v.status !== "failed" && v.feature !== "solo");
    vids.sort((a, b) => featScore(b.feature) - featScore(a.feature));
    return vids.length ? { id: vids[0].videoId, points: null } : null;
  }
  async function youtubeSearch(q) {
    const bases = [
      "https://inv.nadeko.net/api/v1/search?type=video&q=",
      "https://invidious.privacyredirect.com/api/v1/search?type=video&q="
    ];
    const query = encodeURIComponent(q + " official audio");
    for (let i = 0; i < bases.length; i++) {
      try {
        const r = await fetch(bases[i] + query);
        if (!r.ok) continue;
        const arr = await r.json();
        const hit = (arr || []).find((v) => v && /^[A-Za-z0-9_-]{11}$/.test(v.videoId || ""));
        if (hit) return hit.videoId;
      } catch (e) {}
    }
    return null;
  }
  function renderFind(records) {
    const box = $("find-results");
    box.replaceChildren();
    if (!records.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = t("noSongs");
      box.appendChild(p);
      return;
    }
    records.forEach((rec) => {
      const b = document.createElement("button");
      b.type = "button";
      const title = document.createElement("div");
      title.textContent = rec.title || "";
      const sub = document.createElement("small");
      sub.textContent = rec.artist || "";
      b.append(title, sub);
      b.addEventListener("click", () => { prepareSong(rec); });
      box.appendChild(b);
    });
  }
  async function runSearch(q) {
    const query = (q || "").trim();
    if (!query) return;
    setStatus(t("searching"));
    $("find-results").replaceChildren();
    try {
      const data = await getJson("https://www.songsterr.com/api/search?size=8&pattern=" + encodeURIComponent(query));
      const records = ((data && data.records) || []).filter((r) => r && r.songId && !r.isJunk).slice(0, 8);
      renderFind(records);
      setStatus(records.length ? "" : t("noSongs"), records.length ? "" : "warn");
    } catch (e) {
      setStatus(t("searchFail"), "warn");
    }
  }
  async function officialVideo(videos, artist, title) {
    const seen = {};
    const cands = [];
    (videos || []).forEach((v) => {
      if (!v || !v.videoId || seen[v.videoId] || v.feature === "solo" || v.feature === "backing") return;
      seen[v.videoId] = 1;
      cands.push(v);
    });
    cands.sort((a, b) => ((a.feature || "") === "" || a.feature === "playthrough" ? 0 : 1) - ((b.feature || "") === "" || b.feature === "playthrough" ? 0 : 1));
    const slice = cands.slice(0, 8);
    const infos = await Promise.all(slice.map(async (v) => {
      try {
        const r = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + v.videoId));
        if (!r.ok) return null;
        const d = await r.json();
        return { id: v.videoId, title: d.title || "", author: d.author_name || "" };
      } catch (e) { return null; }
    }));
    const song = (title || "").toLowerCase();
    const art = (artist || "").toLowerCase();
    let best = null, bestSc = 0;
    infos.forEach((info) => {
      if (!info) return;
      const tl = info.title.toLowerCase();
      const al = info.author.toLowerCase();
      if (song && tl.indexOf(song) < 0) return;
      let sc = 20;
      if (tl.indexOf("official audio") >= 0) sc += 80;
      else if (tl.indexOf("official") >= 0) sc += 50;
      if (art && al.indexOf(art) >= 0) sc += 25;
      if (al.indexOf("topic") >= 0) sc += 30;
      if (sc > bestSc) { bestSc = sc; best = info; }
    });
    return best && bestSc >= 70 ? best.id : null;
  }
  async function prepareSong(rec) {
    setStatus(t("preparing"));
    try {
      const meta = await getJson("https://www.songsterr.com/api/meta/" + rec.songId);
      const tracks = meta.tracks || [];
      const bi = bassIndex(tracks);
      const hash = bi >= 0 ? tracks[bi].hash : "";
      let pointsList = [];
      if (meta.revisionId) {
        try { pointsList = await getJson("https://www.songsterr.com/api/video-points/" + meta.songId + "/" + meta.revisionId + "/list"); }
        catch (e) { pointsList = []; }
      }
      let chosen = null;
      const officialId = await officialVideo(meta.videos, rec.artist || meta.artist, rec.title || meta.title);
      if (officialId) {
        const synced = (pointsList || []).find((p) => p && p.videoId === officialId && p.points && p.points.length > 4);
        chosen = { id: officialId, points: synced ? synced.points : null };
      }
      if (!chosen) chosen = pickVideo(meta.videos, pointsList, bi, hash);
      if (!chosen) {
        const id = await youtubeSearch((rec.artist || "") + " " + (rec.title || ""));
        if (id) chosen = { id: id, points: null };
      }
      if (!chosen) { setStatus(t("noVideo"), "warn"); return; }
      let notes = null;
      if (bi >= 0 && meta.image && meta.revisionId) {
        try {
          const part = await getJson("https://dqsljvtekg760.cloudfront.net/" + meta.songId + "/" + meta.revisionId + "/" + meta.image + "/" + bi + ".json");
          notes = tabToNotes(part, chosen.points);
        } catch (e) { notes = null; }
      }
      const sounded = (notes || []).filter((n) => !n.rest);
      if (sounded.length) {
        window.XBass.setTrack(notes);
        setStatus(t("ready") + " · Songsterr");
      } else {
        window.XBass.clearTrack();
        setStatus(t("noTab"), "warn");
      }
      startYouTube(chosen.id, "https://youtu.be/" + chosen.id);
    } catch (e) {
      setStatus(t("searchFail"), "warn");
    }
  }

  function boot() {
    applyI18n();
    buildStage();
    buildHead();
    setBpm(state.bpm);
    $("speed").value = String(state.speed || 1);
    $("speed-val").textContent = (state.speed || 1).toFixed(2) + "×";
    $("btn-loop").classList.toggle("on", !!state.loop);
    selectString(state.stringSel);
    layoutHome();

    document.body.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-nav]");
      if (nav) {
        const n = nav.dataset.nav;
        if (n === "back") back();
        else if (n === "home") home();
        else if (n === "song") toSong();
        else go(n);
        return;
      }
      const hit = e.target.closest(".hit");
      if (hit) {
        const spec = HITS.find((h) => h[0] === hit.id);
        if (!spec) return;
        if (spec[5] === "new") openNew();
        else if (spec[5] === "saved") go("players");
        else if (spec[5] === "continue") {
          if (!state.current && state.players.length) state.current = state.players[state.players.length - 1];
          persist();
          go("song");
        } else if (spec[5] === "settings") go("settings");
        return;
      }
      const mute = e.target.closest("[data-mute]");
      if (mute) {
        const k = mute.dataset.mute;
        mutes[k] = !mutes[k];
        mute.classList.toggle("off", mutes[k]);
        mute.setAttribute("aria-pressed", mutes[k] ? "true" : "false");
      }
      const sb = e.target.closest("#str-btns button");
      if (sb) selectString(+sb.dataset.string);
    });

    $("name-form").addEventListener("submit", (e) => { e.preventDefault(); savePlayer($("name-input").value); });
    $("name-cancel").addEventListener("click", () => { $("modal").hidden = true; });
    $("song-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = youtubeId($("song-url").value);
      const err = $("song-error");
      if (!id) { err.hidden = false; err.textContent = t("invalid"); return; }
      err.hidden = true;
      state.track = null;
      startYouTube(id, $("song-url").value.trim());
    });
    $("find-form").addEventListener("submit", (e) => {
      e.preventDefault();
      runSearch($("find-q").value);
    });
    $("upload-btn").addEventListener("click", () => $("file-input").click());
    $("file-input").addEventListener("change", () => {
      const f = $("file-input").files && $("file-input").files[0];
      $("file-input").value = "";
      if (f) startFile(f);
    });
    $("btn-play").addEventListener("click", togglePlay);
    $("btn-loop").addEventListener("click", () => {
      state.loop = !state.loop;
      $("btn-loop").classList.toggle("on", state.loop);
      $("btn-loop").setAttribute("aria-pressed", state.loop ? "true" : "false");
      if (mediaEl) mediaEl.loop = state.loop;
      persist();
    });
    $("speed").addEventListener("input", () => {
      state.speed = +$("speed").value;
      $("speed-val").textContent = state.speed.toFixed(2) + "×";
      applySpeed();
      persist();
    });
    $("bpm-dec").addEventListener("click", () => setBpm(state.bpm - 1));
    $("bpm-inc").addEventListener("click", () => setBpm(state.bpm + 1));
    $("bpm-tap").addEventListener("click", () => {
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
      taps.push(now);
      if (taps.length >= 2) {
        const span = taps[taps.length - 1] - taps[Math.max(0, taps.length - 5)];
        const steps = Math.min(4, taps.length - 1);
        setBpm(60000 / (span / steps));
      }
    });
    $("lang-en").addEventListener("click", () => { state.lang = "en"; persist(); applyI18n(); });
    $("lang-he").addEventListener("click", () => { state.lang = "he"; persist(); applyI18n(); });
    $("mic-btn").addEventListener("click", () => { tunerLeave(); tunerOn = true; tunerEnter(); });

    window.addEventListener("resize", () => { if (current === "home") layoutHome(); });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", () => { if (current === "home") layoutHome(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
