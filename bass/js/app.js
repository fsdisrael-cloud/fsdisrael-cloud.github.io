/* X-BASS v1.9
   Note source: default eighth-note groove at the BPM, locked to media currentTime.
   A real transcription plugs in as absolute media times:
     XBass.setTrack([{t: 0.0, string: 0, fret: 0}, {t: 0.5, string: 0, fret: 3}]);
   string 0..3 = E A D G (low to high), fret 0 = open. Pass null to restore the groove.
   Notes are one bass staff. A low part is written up an octave so heads sit on the
   five lines; ledger lines are only for pitches that still fall outside.
   Per song (localStorage xbass.sync): note start offset, lyric start offset, loop markers.
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
  const GEO = { nut: 1496, scale: 1900, boardY: 268, boardH: 196, boardL: 0, strings: [292, 340, 388, 436] };
  const TOP_Y = [102, 130, 158, 186];
  const I18N = {
    en: {
      dir: "ltr",
      newPlayer: "NEW PLAYER", savedPlayers: "SAVED PLAYERS", continue: "CONTINUE",
      settings: "SETTINGS", language: "LANGUAGE", song: "SONG", play: "PLAY",
      paste: "Paste a YouTube link", upload: "Upload mp3/mp4", recent: "RECENT",
      search: "SEARCH", searchPh: "Song or artist", searching: "Searching…",
      preparing: "Preparing…", ready: "Ready to play", noTab: "No bass tab found",
      noVideo: "No video found", noSongs: "No songs found", searchFail: "Search failed",
      sync: "Sync", synced: "Synced", syncNotes: "Sync notes", syncLyrics: "Sync lyrics",
      rotate: "Rotate your phone",
      loopStart: "Loop start", loopEnd: "Loop end",
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
      sync: "סנכרון", synced: "סונכרן", syncNotes: "סנכרון תווים", syncLyrics: "סנכרון מילים",
      rotate: "סובב את הטלפון",
      loopStart: "התחלת לולאה", loopEnd: "סוף לולאה",
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
  state.noteOffset = 0;
  state.lyricOffset = 0;
  state.noteSynced = false;
  state.lyricSynced = false;
  state.lyricAnchor = null;
  state.loopA = null;
  state.loopB = null;
  state.loopLock = false;
  state.songKey = "";
  state.words = [];
  state.lyricQuery = null;
  let stack = ["home"];
  let current = "home";
  let ytPlayer = null;
  let seekHold = null;
  let lyricFor = "";
  let ytApi = null;
  let mediaEl = null;
  let fileUrl = null;
  let pendingPlay = false;
  let rafId = 0;
  let lastTs = 0;
  const vis = {
    key: "", pf: "index", pluckStart: -1e9, shape: null, left: null, rY: null
  };
  const mutes = { guitar: false, piano: false, vocals: false, drums: false };
  let taps = [];
  let mediaPlaying = false;
  let markDrag = null;
  let clockOverride = null;
  let stageReady = false;
  let tapLock = 0;

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

  // Left-hand shapes. Fingers: 0 index, 1 middle, 2 ring, 3 pinky.
  // Simandl in the low positions uses 1-2-4 (ring braces the pinky) across three frets.
  // A low-position reach of four frets uses extended 1-2-4. From fret 5 up, one finger per fret.
  // Octaves (two strings and two frets) are index + pinky. Open strings press with nobody.
  function simandlShape(P) {
    P = Math.max(1, P | 0);
    return { system: "simandl", p: P, frets: [P, P + 1, P + 2, P + 2], support: true };
  }
  function extendShape(P) {
    P = Math.max(1, P | 0);
    return { system: "extend", p: P, frets: [P, P + 1, P + 2, P + 3], support: false };
  }
  function ofpfShape(P) {
    P = Math.max(1, P | 0);
    return { system: "ofpf", p: P, frets: [P, P + 1, P + 2, P + 3], support: false };
  }
  function contextNotes(time) {
    const out = [];
    if (state.track && state.track.length) {
      const a = state.track;
      let start = 0;
      while (start < a.length && a[start].t < time - 0.45) start++;
      for (let i = Math.max(0, start - 1); i < a.length && out.length < 10; i++) out.push(a[i]);
      return out;
    }
    const eighth = 60 / state.bpm / 2;
    const idx = Math.floor(Math.max(0, time) / eighth);
    for (let k = idx - 1; k <= idx + 6; k++) {
      if (k < 0) continue;
      const g = GROOVE[((k % 4) + 4) % 4];
      out.push({ t: k * eighth, string: g.string, fret: g.fret, rest: false });
    }
    return out;
  }
  function octavePartner(note, notes, time) {
    let best = null;
    let bestDt = 1e9;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (!n || n.rest || n.fret <= 0) continue;
      if (n.string === note.string && n.fret === note.fret) continue;
      const ds = n.string - note.string;
      const df = n.fret - note.fret;
      if (!((ds === 2 && df === 2) || (ds === -2 && df === -2))) continue;
      const dt = Math.abs((+n.t || 0) - time);
      if (dt <= 2 && dt < bestDt) { bestDt = dt; best = n; }
    }
    return best;
  }
  function octaveShape(note, partner) {
    const low = note.fret < partner.fret ? note : partner;
    const high = low === note ? partner : note;
    const P = low.fret;
    return {
      system: "octave",
      p: P,
      frets: [P, P + 1, P + 1, P + 2],
      support: false,
      low: { string: low.string | 0, fret: low.fret | 0 },
      high: { string: high.string | 0, fret: high.fret | 0 },
      strings: [low.string | 0, low.string | 0, high.string | 0, high.string | 0]
    };
  }
  function pressFinger(shape, note) {
    if (!note || note.rest || note.fret <= 0) return -1;
    if (shape.system === "octave") {
      if (note.string === shape.low.string && note.fret === shape.low.fret) return 0;
      if (note.string === shape.high.string && note.fret === shape.high.fret) return 3;
      return -1;
    }
    if (shape.system === "simandl") {
      if (note.fret <= shape.p) return 0;
      if (note.fret === shape.p + 1) return 1;
      if (note.fret === shape.p + 2) return 3;
      return -1;
    }
    const i = note.fret - shape.frets[0];
    if (i <= 0) return 0;
    if (i >= 3) return 3;
    return i;
  }
  function shapeCovers(shape, fret) {
    if (!shape || shape.system === "octave") return false;
    if (shape.system === "simandl") return fret >= shape.p && fret <= shape.p + 2;
    return fret >= shape.frets[0] && fret <= shape.frets[3];
  }
  function chooseNewShape(note, notes, time) {
    const frets = [note.fret];
    function add(f) {
      const loTry = Math.min.apply(null, frets.concat(f));
      const hiTry = Math.max.apply(null, frets.concat(f));
      if (hiTry - loTry > 3) return false;
      frets.push(f);
      return true;
    }
    const future = notes.filter((n) => n && !n.rest && n.fret > 0 && n.t > time + 0.02 && n.t - time < 1.6);
    future.sort((a, b) => a.t - b.t);
    for (let i = 0; i < future.length; i++) if (!add(future[i].fret)) break;
    const past = notes.filter((n) => n && !n.rest && n.fret > 0 && n.t < time - 0.02 && time - n.t < 1.2);
    past.sort((a, b) => b.t - a.t);
    for (let i = 0; i < past.length; i++) if (!add(past[i].fret)) break;
    const lo = Math.min.apply(null, frets);
    const hi = Math.max.apply(null, frets);
    const span = hi - lo;
    if (hi <= 4 && span <= 2) {
      let P = lo;
      if (span === 0) P = note.fret <= 2 ? 1 : note.fret - 2;
      return simandlShape(P);
    }
    if (hi <= 5 && span === 3 && lo <= 2) return extendShape(lo);
    let P = lo;
    if (hi - P > 3) P = hi - 3;
    if (span === 0 && note.fret >= 5) P = note.fret;
    if (note.fret > P + 3) P = note.fret - 3;
    if (P < 1) P = 1;
    return ofpfShape(P);
  }
  function planShape(note, time) {
    const notes = contextNotes(time);
    const open = !note || note.rest || (note.fret | 0) <= 0;
    if (!open) {
      const partner = octavePartner(note, notes, time);
      if (partner) {
        const shape = octaveShape(note, partner);
        shape.press = pressFinger(shape, note);
        shape.string = note.string | 0;
        return shape;
      }
    }
    if (open) {
      const base = vis.shape && vis.shape.system !== "octave" ? vis.shape : simandlShape(1);
      return {
        system: base.system, p: base.p, frets: base.frets.slice(), support: !!base.support,
        press: -1, string: clamp((note && note.string) | 0, 0, 3)
      };
    }
    if (vis.shape && shapeCovers(vis.shape, note.fret)) {
      let ahead = null;
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (!n || n.rest || n.fret <= 0) continue;
        if (n.t <= time + 0.02 || n.t - time > 1.2) continue;
        if (!ahead || n.t < ahead.t) ahead = n;
      }
      const prepare = ahead && !shapeCovers(vis.shape, ahead.fret) && Math.abs(ahead.fret - note.fret) <= 3;
      if (!prepare) {
        return {
          system: vis.shape.system, p: vis.shape.p, frets: vis.shape.frets.slice(), support: !!vis.shape.support,
          press: pressFinger(vis.shape, note), string: note.string | 0
        };
      }
    }
    const shape = chooseNewShape(note, notes, time);
    shape.press = pressFinger(shape, note);
    shape.string = note.string | 0;
    return shape;
  }

  function n1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function crClosed(points) {
    const p = [];
    for (let i = 0; i < points.length; i++) {
      const q = points[i];
      if (!q || !isFinite(q.x) || !isFinite(q.y)) continue;
      if (p.length && Math.hypot(q.x - p[p.length - 1].x, q.y - p[p.length - 1].y) < 0.4) continue;
      p.push(q);
    }
    const n = p.length;
    if (n < 3) return "";
    let d = "M" + n1(p[0].x) + " " + n1(p[0].y);
    for (let i = 0; i < n; i++) {
      const p0 = p[(i - 1 + n) % n];
      const p1 = p[i];
      const p2 = p[(i + 1) % n];
      const p3 = p[(i + 2) % n];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += "C" + n1(c1x) + " " + n1(c1y) + " " + n1(c2x) + " " + n1(c2y) + " " + n1(p2.x) + " " + n1(p2.y);
    }
    return d + "Z";
  }
  function widthProfile(t, w0, w1) {
    const base = w0 + (w1 - w0) * Math.pow(t, 0.82);
    const mcp = Math.exp(-Math.pow((t - 0.06) / 0.08, 2));
    const pip = Math.exp(-Math.pow((t - 0.42) / 0.05, 2));
    const dip = Math.exp(-Math.pow((t - 0.72) / 0.045, 2));
    const waist = Math.exp(-Math.pow((t - 0.24) / 0.08, 2));
    const tip = t > 0.88 ? 1 - (t - 0.88) * 0.7 : 1;
    return Math.max(w1 * 0.72, base * (1 + 0.12 * mcp + 0.22 * pip + 0.12 * dip - 0.06 * waist) * Math.max(0.78, tip));
  }
  function sampleAt(samples, t) {
    let best = samples[0];
    let bestD = 1e9;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.abs(samples[i].t - t);
      if (d < bestD) { bestD = d; best = samples[i]; }
    }
    return best;
  }
  function limbSamples(x0, y0, x1, y1, opt) {
    const w0 = opt.w0, w1 = opt.w1;
    const mx = (x0 + x1) / 2 + (opt.bowX || 0);
    const my = (y0 + y1) / 2 + (opt.bowY || 0);
    const N = 16;
    const samples = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = 1 - t;
      const x = u * u * x0 + 2 * u * t * mx + t * t * x1;
      const y = u * u * y0 + 2 * u * t * my + t * t * y1;
      let tx = 2 * u * (mx - x0) + 2 * t * (x1 - mx);
      let ty = 2 * u * (my - y0) + 2 * t * (y1 - my);
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      samples.push({ t: t, x: x, y: y, tx: tx, ty: ty, px: -ty, py: tx, w: widthProfile(t, w0, w1) });
    }
    return samples;
  }
  function sideBand(samples, sign, inner, outer, t0, t1) {
    const a = [];
    const b = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s.t < t0 || s.t > t1) continue;
      a.push({ x: s.x + s.px * sign * s.w * inner, y: s.y + s.py * sign * s.w * inner });
      b.push({ x: s.x + s.px * sign * s.w * outer, y: s.y + s.py * sign * s.w * outer });
    }
    if (a.length < 2) return "";
    return crClosed(a.concat(b.reverse()));
  }
  function creasePath(samples, t, arch) {
    const s = sampleAt(samples, t);
    const hw = s.w * 0.72;
    const ax = s.x + s.px * hw, ay = s.y + s.py * hw;
    const bx = s.x - s.px * hw, by = s.y - s.py * hw;
    const cx = s.x + s.tx * arch, cy = s.y + s.ty * arch;
    return "M" + n1(ax) + " " + n1(ay) + "Q" + n1(cx) + " " + n1(cy) + " " + n1(bx) + " " + n1(by);
  }
  function nailPaths(samples) {
    const sub = samples.filter((s) => s.t >= 0.74);
    if (sub.length < 2) return { nail: "", shine: "", cut: "" };
    const left = [];
    const right = [];
    for (let i = 0; i < sub.length; i++) {
      const s = sub[i];
      const hw = s.w * 0.74;
      left.push({ x: s.x + s.px * hw, y: s.y + s.py * hw });
      right.push({ x: s.x - s.px * hw, y: s.y - s.py * hw });
    }
    const end = sub[sub.length - 1];
    const tip = { x: end.x + end.tx * end.w * 0.78, y: end.y + end.ty * end.w * 0.78 };
    const nail = crClosed(left.concat([tip], right.reverse()));
    const cut = creasePath(samples, 0.76, end.w * 0.35);
    const sh = sampleAt(samples, 0.88);
    const sx = sh.x - sh.px * sh.w * 0.08 + sh.tx * sh.w * 0.15;
    const sy = sh.y - sh.py * sh.w * 0.08 + sh.ty * sh.w * 0.15;
    const shinePts = [];
    const ang = Math.atan2(sh.ty, sh.tx);
    const co = Math.cos(ang), si = Math.sin(ang);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lx = Math.cos(a) * sh.w * 0.34, ly = Math.sin(a) * sh.w * 0.2;
      shinePts.push({ x: sx + lx * co - ly * si, y: sy + lx * si + ly * co });
    }
    return { nail: nail, shine: crClosed(shinePts), cut: cut };
  }
  function limbGeometry(x0, y0, x1, y1, opt) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 12) {
      const c = "M" + n1(x1) + " " + n1(y1) + "m-6,0a6,6 0 1,0 12,0a6,6 0 1,0 -12,0";
      return { skin: c, shade: "", hi: "", c1: "", c2: "", nail: "", shine: "", cut: "" };
    }
    const samples = limbSamples(x0, y0, x1, y1, opt);
    const left = [];
    const right = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      left.push({ x: s.x + s.px * s.w, y: s.y + s.py * s.w });
      right.push({ x: s.x - s.px * s.w, y: s.y - s.py * s.w });
    }
    const end = samples[samples.length - 1];
    const tipA = {
      x: end.x + end.tx * end.w * 0.55 + end.px * end.w * 0.72,
      y: end.y + end.ty * end.w * 0.55 + end.py * end.w * 0.72
    };
    const tipM = { x: end.x + end.tx * end.w * 0.95, y: end.y + end.ty * end.w * 0.95 };
    const tipB = {
      x: end.x + end.tx * end.w * 0.55 - end.px * end.w * 0.72,
      y: end.y + end.ty * end.w * 0.55 - end.py * end.w * 0.72
    };
    const start = samples[0];
    const base = { x: start.x - start.tx * start.w * 0.25, y: start.y - start.ty * start.w * 0.25 };
    const skin = crClosed(left.concat([tipA, tipM, tipB], right.reverse(), [base]));
    const mid = samples[(samples.length / 2) | 0];
    const lightSign = (mid.px * -0.5 + mid.py * -0.86) >= 0 ? 1 : -1;
    const nails = nailPaths(samples);
    return {
      skin: skin,
      shade: sideBand(samples, -lightSign, 0.08, 0.82, 0.02, 0.78),
      hi: sideBand(samples, lightSign, 0.12, 0.7, 0.04, 0.7),
      c1: creasePath(samples, 0.42, mid.w * 0.45),
      c2: creasePath(samples, 0.7, mid.w * 0.3),
      nail: nails.nail,
      shine: nails.shine,
      cut: nails.cut
    };
  }
  function setCls(g, cls, d) {
    const n = g.querySelector("." + cls);
    if (n) n.setAttribute("d", d || "");
  }
  function makeLimb(id) {
    const g = svg("g", { id: id });
    g.appendChild(svg("path", { class: "shade", fill: "#e39a86", opacity: "0.34" }));
    g.appendChild(svg("path", { class: "skin", fill: "url(#skin)", stroke: "#c57b6c", "stroke-width": "2.2", "stroke-linejoin": "round", "stroke-linecap": "round" }));
    g.appendChild(svg("path", { class: "hi", fill: "#fff", opacity: "0.38" }));
    g.appendChild(svg("path", { class: "c1", fill: "none", stroke: "#e2a898", "stroke-width": "1.55", "stroke-linecap": "round" }));
    g.appendChild(svg("path", { class: "c2", fill: "none", stroke: "#e2a898", "stroke-width": "1.35", "stroke-linecap": "round" }));
    const nail = svg("g", { class: "nailg" });
    nail.appendChild(svg("ellipse", { class: "nail", fill: "url(#nail)", stroke: "#c57b6c", "stroke-width": "1.1" }));
    nail.appendChild(svg("ellipse", { class: "shine", fill: "#fff", opacity: "0.92" }));
    nail.appendChild(svg("path", { class: "cut", fill: "none", stroke: "#b84354", "stroke-width": "1.15", "stroke-linecap": "round" }));
    g.appendChild(nail);
    return g;
  }
  function makePalm(id) {
    const g = svg("g", { id: id });
    g.appendChild(svg("ellipse", { class: "shadow", fill: "#6a4038", opacity: "0.12" }));
    g.appendChild(svg("path", { class: "skin", fill: "url(#skin)", stroke: "#c57b6c", "stroke-width": "2.2", "stroke-linejoin": "round" }));
    g.appendChild(svg("path", { class: "hi", fill: "#fff", opacity: "0.28" }));
    g.appendChild(svg("path", { class: "crease", fill: "none", stroke: "#e2a898", "stroke-width": "1.5", "stroke-linecap": "round" }));
    return g;
  }
  function updateLimb(g, x0, y0, x1, y1, opt) {
    if (!g) return;
    const o = opt || {};
    const geo = limbGeometry(x0, y0, x1, y1, o);
    setCls(g, "skin", geo.skin);
    setCls(g, "shade", geo.shade);
    setCls(g, "hi", geo.hi);
    setCls(g, "c1", geo.c1);
    setCls(g, "c2", geo.c2);
    const samples = limbSamples(x0, y0, x1, y1, o);
    const s = sampleAt(samples, 0.9);
    const ang = Math.atan2(s.ty, s.tx) * 180 / Math.PI;
    const nail = g.querySelector(".nailg");
    if (!nail) return;
    const nx = s.x + s.tx * s.w * 0.2;
    const ny = s.y + s.ty * s.w * 0.2;
    nail.setAttribute("transform", "translate(" + n1(nx) + " " + n1(ny) + ") rotate(" + ang.toFixed(1) + ")");
    const rx = Math.max(6.2, s.w * 1.05);
    const ry = Math.max(4.4, s.w * 0.62);
    const body = nail.querySelector(".nail");
    body.setAttribute("cx", "0");
    body.setAttribute("cy", "0");
    body.setAttribute("rx", n1(rx));
    body.setAttribute("ry", n1(ry));
    const shine = nail.querySelector(".shine");
    shine.setAttribute("cx", n1(-rx * 0.22));
    shine.setAttribute("cy", n1(-ry * 0.28));
    shine.setAttribute("rx", n1(rx * 0.32));
    shine.setAttribute("ry", n1(ry * 0.38));
    const cut = nail.querySelector(".cut");
    cut.setAttribute("d", "M" + n1(-rx * 0.55) + " " + n1(-ry * 0.7) + "Q" + n1(-rx * 0.15) + " " + n1(-ry * 0.05) + " " + n1(-rx * 0.55) + " " + n1(ry * 0.7));
  }
  function palmPath(knuckles, dir) {
    const left = knuckles[0].x - 18;
    const right = knuckles[3].x + 16;
    const mid = (left + right) / 2;
    const edge = (knuckles[0].y + knuckles[3].y) / 2;
    const top = edge - dir * 4;
    const bot = edge + dir * 58;
    const side = dir > 0 ? 1 : -1;
    return "M" + n1(left + 14) + " " + n1(top)
      + "C" + n1(left - 2) + " " + n1(top + side * 16) + " " + n1(left + 2) + " " + n1(top + side * 40) + " " + n1(mid - 22) + " " + n1(bot - side * 10)
      + "C" + n1(mid - 16) + " " + n1(bot + side * 8) + " " + n1(mid + 20) + " " + n1(bot + side * 8) + " " + n1(mid + 24) + " " + n1(bot - side * 10)
      + "C" + n1(right + 4) + " " + n1(top + side * 40) + " " + n1(right + 2) + " " + n1(top + side * 14) + " " + n1(right - 12) + " " + n1(top)
      + "C" + n1(mid + 16) + " " + n1(top - side * 8) + " " + n1(mid - 24) + " " + n1(top - side * 6) + " " + n1(left + 14) + " " + n1(top) + "Z";
  }
  function updatePalm(g, knuckles, dir) {
    if (!g) return;
    g.querySelector(".skin").setAttribute("d", palmPath(knuckles, dir));
    const midX = (knuckles[0].x + knuckles[3].x) / 2;
    const edge = (knuckles[0].y + knuckles[3].y) / 2;
    const sh = g.querySelector(".shadow");
    sh.setAttribute("cx", n1(midX + 4));
    sh.setAttribute("cy", n1(edge + dir * 46));
    sh.setAttribute("rx", "36");
    sh.setAttribute("ry", "8");
    const hy = edge + dir * 16;
    g.querySelector(".hi").setAttribute("d", "M" + n1(midX - 28) + " " + n1(hy)
      + "a24 10 0 1 0 40 0a24 10 0 1 0 -40 0");
    const cy = edge + dir * 24;
    g.querySelector(".crease").setAttribute("d", "M" + n1(knuckles[0].x + 2) + " " + n1(cy)
      + "Q" + n1(midX) + " " + n1(cy + dir * 6) + " " + n1(knuckles[3].x - 2) + " " + n1(cy));
  }

  const HAND_KX = [50, 18, -14, -48];
  const HAND_KY = [3, -7, 0, 12];
  const HAND_W = [[13.2, 8.4], [14.2, 8.8], [12.8, 8.1], [10.6, 7.1]];
  const HAND_REACH = 108;

  function behindFret(fret) {
    const f = Math.max(1, fret | 0);
    const wire = fretX(f);
    const prev = fretX(f - 1);
    const space = Math.max(0, prev - wire);
    return wire + Math.max(10, Math.min(17, space * 0.24));
  }
  function poseLeft(shape) {
    const string = clamp(shape.string | 0, 0, 3);
    const ideal = [];
    for (let i = 0; i < 4; i++) {
      const s = shape.strings && shape.strings[i] != null ? shape.strings[i] : string;
      ideal.push({ x: behindFret(shape.frets[i]), y: GEO.strings[clamp(s | 0, 0, 3)] });
    }
    if (shape.support) {
      const off = shape.press === 3 ? 16 : 26;
      ideal[2] = { x: ideal[3].x + 15, y: ideal[3].y + off, fixed: true };
    }
    if (shape.system === "octave") {
      const x0 = ideal[0].x, x3 = ideal[3].x, y0 = ideal[0].y, y3 = ideal[3].y;
      ideal[1] = { x: x0 + (x3 - x0) * 0.4, y: (y0 + y3) / 2 + 30 };
      ideal[2] = { x: x0 + (x3 - x0) * 0.64, y: (y0 + y3) / 2 + 32 };
    }
    const palmX = (ideal[0].x + ideal[3].x) / 2 + 2;
    let palmY = (ideal[0].y + ideal[3].y) / 2 + HAND_REACH;
    if (palmY > 492) palmY = 492;
    const knuckles = HAND_KX.map((dx, i) => ({ x: palmX + dx, y: palmY + HAND_KY[i] }));
    const tips = ideal.map((p, i) => {
      if (shape.press === i) return { x: p.x, y: p.y, press: 1 };
      if (p.fixed) return { x: p.x, y: p.y, press: 0 };
      let pull = 0.28;
      if (shape.system === "octave") pull = (i === 1 || i === 2) ? 0.2 : 0.12;
      return {
        x: p.x + (knuckles[i].x - p.x) * pull,
        y: p.y + (knuckles[i].y - p.y) * pull,
        press: 0
      };
    });
    return { knuckles: knuckles, tips: tips, palmX: palmX, palmY: palmY };
  }
  function lerpLeft(target, dt) {
    const snap = !vis.left;
    const k = snap ? 1 : 1 - Math.exp(-8 * Math.max(0.001, dt));
    if (snap) { vis.left = target; return; }
    const L = vis.left;
    for (let i = 0; i < 4; i++) {
      L.knuckles[i].x += (target.knuckles[i].x - L.knuckles[i].x) * k;
      L.knuckles[i].y += (target.knuckles[i].y - L.knuckles[i].y) * k;
      L.tips[i].x += (target.tips[i].x - L.tips[i].x) * k;
      L.tips[i].y += (target.tips[i].y - L.tips[i].y) * k;
      L.tips[i].press += (target.tips[i].press - L.tips[i].press) * k;
    }
    L.palmX += (target.palmX - L.palmX) * k;
    L.palmY += (target.palmY - L.palmY) * k;
  }
  function placeThumb(L) {
    const pad = $("thumb-pad");
    if (!pad) return;
    const cx = L.knuckles[0].x + 2;
    const cy = GEO.boardY - 1;
    const skin = pad.querySelector(".skin");
    skin.setAttribute("cx", n1(cx));
    skin.setAttribute("cy", n1(cy));
    skin.setAttribute("rx", "22");
    skin.setAttribute("ry", "15");
    const hi = pad.querySelector(".hi");
    hi.setAttribute("cx", n1(cx - 5));
    hi.setAttribute("cy", n1(cy - 3));
    hi.setAttribute("rx", "6");
    hi.setAttribute("ry", "3.2");
    const nail = pad.querySelector(".nail");
    nail.setAttribute("cx", n1(cx + 2));
    nail.setAttribute("cy", n1(cy - 1));
    nail.setAttribute("rx", "7");
    nail.setAttribute("ry", "4.6");
    const arm = $("thumb-arm");
    if (arm) {
      const x0 = L.knuckles[0].x + 6;
      const y0 = Math.min(GEO.boardY + GEO.boardH - 8, L.knuckles[0].y + 8);
      const x1 = cx;
      const y1 = GEO.boardY + 10;
      arm.setAttribute("d", "M" + n1(x0 - 12) + " " + n1(y0)
        + "C" + n1(x0 - 8) + " " + n1((y0 + y1) / 2) + " " + n1(x1 - 16) + " " + n1(y1 + 16) + " " + n1(x1 - 8) + " " + n1(y1)
        + "C" + n1(x1 + 10) + " " + n1(y1 - 4) + " " + n1(x1 + 12) + " " + n1(y1 + 8) + " " + n1(x0 + 14) + " " + n1(y0)
        + "C" + n1(x0 + 4) + " " + n1(y0 + 10) + " " + n1(x0 - 4) + " " + n1(y0 + 8) + " " + n1(x0 - 12) + " " + n1(y0) + "Z");
    }
  }
  function drawLeftHand(dt, shape) {
    const target = poseLeft(shape);
    lerpLeft(target, dt);
    const L = vis.left;
    updatePalm($("fret-palm"), L.knuckles, 1);
    for (let i = 0; i < 4; i++) {
      const kn = L.knuckles[i];
      const tip = L.tips[i];
      const bow = 6 + (1 - tip.press) * 12;
      updateLimb($("ff" + i), kn.x, kn.y + 14, tip.x, tip.y, {
        w0: HAND_W[i][0],
        w1: HAND_W[i][1],
        bowX: (i - 1.5) * 2,
        bowY: bow * 0.65
      });
      const c = $("contact" + i);
      if (c) {
        c.setAttribute("cx", n1(tip.x));
        c.setAttribute("cy", n1(tip.y + 3));
        c.setAttribute("opacity", (Math.max(0, tip.press) * 0.18).toFixed(3));
      }
    }
    placeThumb(L);
  }
  function thumbRestFor(stringIndex) {
    // Thumb stays on the bridge pickup and slides toward the string being plucked.
    const y = TOP_Y[stringIndex] - 26;
    return { x: 138, y: clamp(y, 64, 156) };
  }
  function drawRightHand(dt, note, now) {
    const s = clamp(note.string | 0, 0, 3);
    const rest = thumbRestFor(s);
    const snap = vis.rY == null;
    const k = snap ? 1 : 1 - Math.exp(-8 * Math.max(0.001, dt));
    if (snap) {
      vis.rY = TOP_Y[s];
      vis.thX = rest.x;
      vis.thY = rest.y;
    } else {
      vis.rY += (TOP_Y[s] - vis.rY) * k;
      vis.thX += (rest.x - vis.thX) * k;
      vis.thY += (rest.y - vis.thY) * k;
    }
    const age = (now - vis.pluckStart) / 240;
    let env = 0;
    if (!note.rest && age >= 0 && age <= 1) {
      env = age < 0.28 ? Math.sin((age / 0.28) * Math.PI / 2) : Math.cos(((age - 0.28) / 0.72) * Math.PI / 2);
    }
    const y = vis.rY;
    const palmX = 188;
    const palmY = 14 + (y - TOP_Y[0]) * 0.42;
    const knuckles = [
      { x: palmX - 22, y: palmY + 24 },
      { x: palmX + 12, y: palmY + 28 },
      { x: palmX + 40, y: palmY + 20 },
      { x: palmX + 62, y: palmY + 10 }
    ];
    const indexOn = vis.pf === "index";
    function pluckTip(on, x, lift, travel) {
      const e = on ? env : 0;
      return { x: x, y: y - lift + e * travel, bow: on ? 3 + (1 - e) * 8 : 14 };
    }
    const index = pluckTip(indexOn, palmX - 16, 14, 46);
    const middle = pluckTip(!indexOn, palmX + 20, 14, 48);
    const ring = { x: palmX + 44, y: y - 36, bow: 16 };
    const pinky = { x: palmX + 64, y: y - 52, bow: 14 };
    updatePalm($("ph-palm"), knuckles, -1);
    const parts = [
      ["ph-index", knuckles[0], index, HAND_W[0]],
      ["ph-middle", knuckles[1], middle, HAND_W[1]],
      ["ph-ring", knuckles[2], ring, HAND_W[2]],
      ["ph-pinky", knuckles[3], pinky, HAND_W[3]]
    ];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      updateLimb($(part[0]), part[1].x, part[1].y - 10, part[2].x, part[2].y, {
        w0: part[3][0], w1: part[3][1], bowX: 0, bowY: -part[2].bow
      });
    }
    updateLimb($("ph-thumb"), palmX - 8, palmY + 8, vis.thX, vis.thY, {
      w0: 17, w1: 12, bowX: -16, bowY: 4
    });
  }
  function buildHands() {
    const thumbG = svg("g", { id: "thumb-back" });
    thumbG.appendChild(svg("path", { id: "thumb-arm", fill: "url(#skin)", stroke: "#c57b6c", "stroke-width": "2", "stroke-linejoin": "round" }));
    const pad = svg("g", { id: "thumb-pad" });
    pad.appendChild(svg("ellipse", { class: "skin", fill: "url(#skin)", stroke: "#c57b6c", "stroke-width": "2" }));
    pad.appendChild(svg("ellipse", { class: "hi", fill: "#fff", opacity: "0.55" }));
    pad.appendChild(svg("ellipse", { class: "nail", fill: "url(#nail)", stroke: "#c57b6c", "stroke-width": "1" }));
    thumbG.appendChild(pad);
    const board = $("board");
    board.parentNode.insertBefore(thumbG, board);
    const hand = $("fret-hand");
    hand.replaceChildren();
    for (let i = 0; i < 4; i++) {
      hand.appendChild(svg("ellipse", { id: "contact" + i, rx: "8", ry: "3.4", fill: "#5a302c", opacity: "0" }));
    }
    hand.appendChild(makePalm("fret-palm"));
    for (let i = 3; i >= 0; i--) hand.appendChild(makeLimb("ff" + i));
    const pluck = $("pluck-hand");
    pluck.replaceChildren();
    pluck.removeAttribute("transform");
    pluck.appendChild(makePalm("ph-palm"));
    pluck.appendChild(makeLimb("ph-thumb"));
    pluck.appendChild(makeLimb("ph-pinky"));
    pluck.appendChild(makeLimb("ph-ring"));
    pluck.appendChild(makeLimb("ph-middle"));
    pluck.appendChild(makeLimb("ph-index"));
  }

  function buildStage() {
    const frets = $("top-frets");
    for (let n = 0; n <= 11; n++) {
      const x = 1108 + n * 38;
      if (x > 1540) break;
      frets.appendChild(svg("line", { x1: x, y1: 22, x2: x, y2: 228, stroke: n ? "#c5c9d0" : "#f7f4ee", "stroke-width": n ? 2 : 8 }));
      if (n === 3 || n === 5 || n === 7 || n === 9) {
        frets.appendChild(svg("circle", { cx: x - 19, cy: 125, r: 6, fill: "#fffdf8" }));
      }
    }
    const pk = $("pickups");
    [118, 236].forEach((x) => {
      const g = svg("g", { transform: "translate(" + x + ",58)" });
      g.appendChild(svg("rect", { width: 44, height: 148, rx: 6, fill: "#111" }));
      g.appendChild(svg("rect", { x: 18, y: 6, width: 8, height: 136, rx: 2, fill: "#1c1c1c" }));
      for (let i = 0; i < 8; i++) {
        const cy = 14 + i * 16;
        g.appendChild(svg("circle", { cx: 12, cy: cy, r: 3.3, fill: "#f2f4f7", stroke: "#9aa", "stroke-width": 0.5 }));
        g.appendChild(svg("circle", { cx: 32, cy: cy, r: 3.3, fill: "#f2f4f7", stroke: "#9aa", "stroke-width": 0.5 }));
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
    for (let n = 0; n <= 24; n++) {
      const x = fretX(n);
      if (x < left + 8) break;
      board.appendChild(svg("line", {
        x1: x, y1: y + 6, x2: x, y2: y + h - 6,
        stroke: n === 0 ? "#f7f4ee" : "#aeb6c0", "stroke-width": n === 0 ? 8 : 2.6
      }));
      if (n) {
        board.appendChild(svg("line", {
          x1: x - 1, y1: y + 6, x2: x - 1, y2: y + h - 6,
          stroke: "#f7f9fb", "stroke-width": 0.9
        }));
      }
    }
    [3, 5, 7, 9, 15, 17, 19, 21].forEach((n) => {
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

    buildHands();
  }

  function buildHead() {
    const nutX = 273;
    const stringY = [124, 158, 192, 226];
    const pegs = [
      { x: 368, y: 78 },
      { x: 448, y: 68 },
      { x: 522, y: 64 },
      { x: 590, y: 74 }
    ];
    state._pegs = pegs;
    const frets = $("hs-frets");
    frets.replaceChildren();
    for (let i = 0; i < 7; i++) {
      const x = 28 + i * 34;
      frets.appendChild(svg("line", { x1: x, y1: 102, x2: x, y2: 230, stroke: "#f6f1e8", "stroke-width": 2 }));
    }
    const sg = $("hs-strings");
    const pg = $("hs-pegs");
    sg.replaceChildren();
    pg.replaceChildren();
    pegs.forEach((p, i) => {
      const y = stringY[i];
      sg.appendChild(svg("polyline", {
        id: "hss" + i,
        points: "12," + y + " " + nutX + "," + y + " " + p.x + "," + p.y,
        fill: "none",
        stroke: i === state.stringSel ? "#e1061c" : "#1c1c1c",
        "stroke-width": i === state.stringSel ? 3.4 : 1.8,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      }));
      const g = svg("g", { id: "peg" + i, transform: "translate(" + p.x + "," + p.y + ")" });
      g.appendChild(svg("ellipse", { cx: -11, cy: 0, rx: 9, ry: 5.5, fill: "#e7edf3", stroke: "#111", "stroke-width": 1.4 }));
      g.appendChild(svg("ellipse", { cx: 11, cy: 0, rx: 9, ry: 5.5, fill: "#cfd6df", stroke: "#111", "stroke-width": 1.4 }));
      g.appendChild(svg("circle", { r: 6.5, fill: "#f7f9fb", stroke: i === state.stringSel ? "#e1061c" : "#111", "stroke-width": 1.6 }));
      g.appendChild(svg("circle", { r: 2.2, fill: "#7c8692" }));
      pg.appendChild(g);
    });
    const hand = $("hs-hand");
    hand.replaceChildren();
    hand.appendChild(svg("path", {
      fill: "#f6c7ad", stroke: "#222", "stroke-width": 2,
      d: "M-6,-78 C-28,-96 8,-124 42,-112 C74,-100 86,-68 64,-48 C96,-36 104,-4 72,6 C40,14 -8,4 -22,-18 C-40,-6 -34,-52 -6,-78 Z"
    }));
    hand.appendChild(svg("ellipse", { cx: 16, cy: 4, rx: 11, ry: 8, fill: "#e3182d", stroke: "#222" }));
    hand.appendChild(svg("ellipse", { cx: 46, cy: -8, rx: 9, ry: 7, fill: "#e3182d", stroke: "#222" }));
    const arrow = $("hs-arrow");
    arrow.replaceChildren();
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
    if (name === "play" || name === "tuner") ensureStage();
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
      span.textContent = r.title || r.id;
      b.append(img, span);
      b.addEventListener("click", () => {
        if (r.songId) prepareSong({ songId: r.songId, artist: r.artist || "", title: r.title || "" });
        else {
          state.track = null;
          state.staffFrame = null;
          loadSongTiming("yt:" + r.id);
          state.lyricQuery = null;
          state.words = [];
          lyricFor = "";
          startYouTube(r.id, r.url || ("https://youtu.be/" + r.id));
        }
      });
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

  function pushRecent(id, url, meta) {
    const item = { id: id, url: url };
    if (meta && meta.songId) {
      item.songId = meta.songId;
      item.artist = meta.artist || "";
      item.title = meta.title || "";
    }
    state.recent = [item].concat(state.recent.filter((r) => r.id !== id)).slice(0, 12);
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
        maybeLyrics();
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
            maybeLyrics();
          },
          onStateChange: function (e) {
            const PS = YT.PlayerState;
            setPlayingFlag(e.data === PS.PLAYING);
            maybeLyrics();
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
    const meta = state.lyricQuery && state.songKey && state.songKey.indexOf("ss:") === 0
      ? { songId: +state.songKey.slice(3), artist: state.lyricQuery.artist, title: state.lyricQuery.title }
      : null;
    pushRecent(id, url, meta);
    state.source = { type: "yt", id: id };
    pendingPlay = true;
    go("play");
    mountYouTube(id);
  }
  function startFile(file) {
    state.track = null;
    state.staffFrame = null;
    loadSongTiming("");
    state.lyricQuery = null;
    state.words = [];
    lyricFor = "";
    const lyrics = $("lyric-strip");
    if (lyrics) lyrics.dataset.win = "";
    state.source = { type: "file", name: file.name };
    go("play");
    mountFile(file);
  }

  function mediaTime() {
    if (clockOverride != null && isFinite(clockOverride)) return clockOverride;
    let real = 0;
    try {
      if (state.source && state.source.type === "yt" && ytPlayer && ytPlayer.getCurrentTime) {
        const n = ytPlayer.getCurrentTime();
        if (typeof n === "number") real = n;
      } else if (mediaEl) real = mediaEl.currentTime || 0;
    } catch (e) {}
    if (seekHold) {
      const close = Math.abs(real - seekHold.t) < 0.35;
      const stale = performance.now() - seekHold.at > 1500;
      if (close || stale) seekHold = null;
      else return seekHold.t;
    }
    return real;
  }
  function noteScore() { return XBassScore.scoreTime(mediaTime(), state.noteOffset); }
  function lyricScore() { return XBassScore.scoreTime(mediaTime(), state.lyricOffset); }
  function seekTo(sec, soft) {
    const dest = Math.max(0, sec);
    seekHold = { t: dest, at: performance.now() };
    const now = performance.now();
    if (soft && seekTo.sent && now - seekTo.sent < 90) return;
    seekTo.sent = now;
    try {
      if (state.source && state.source.type === "yt" && ytPlayer && ytPlayer.seekTo) ytPlayer.seekTo(dest, true);
    } catch (e) {}
    if (mediaEl) { try { mediaEl.currentTime = dest; } catch (e) {} }
  }
  function seekBy(delta) { seekTo(mediaTime() + delta, false); }
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
    mediaPlaying = !!on;
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
    holdLoop();
    const noteT = noteScore();
    const note = noteAt(noteT);
    renderKaraoke(noteT, lyricScore());
    if (note.key !== vis.key) {
      vis.key = note.key;
      if (!note.rest) {
        vis.pluckStart = now;
        vis.pf = vis.pf === "index" ? "middle" : "index";
      }
    }
    const age = (now - vis.pluckStart) / 240;
    const wob = !note.rest && age >= 0 && age < 2 ? Math.sin(age * 14) * Math.exp(-age * 2.2) * 2.4 : 0;
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

    const shape = planShape(note, noteT);
    vis.shape = shape;
    drawLeftHand(dt, shape);
    drawRightHand(dt, note, now);
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
      line.setAttribute("stroke", on ? "#e1061c" : "#1c1c1c");
      line.setAttribute("stroke-width", on ? 3.4 : 1.8);
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
      vis.shape = null; vis.left = null; vis.key = ""; vis.rY = null;
      if (!notes) { state.track = null; state.staffFrame = null; return; }
      state.track = notes.map((n) => ({ t: +n.t || 0, string: n.string | 0, fret: n.fret | 0, rest: !!n.rest })).sort((a, b) => a.t - b.t);
      state.staffFrame = frameOf(state.track);
    },
    clearTrack: function () {
      vis.shape = null; vis.left = null; vis.key = ""; vis.rY = null;
      state.track = null; state.staffFrame = null;
    },
    getTrack: function () { return state.track; },
    setClock: function (t) { clockOverride = t == null || t === "" ? null : +t; },
    hand: function () {
      const L = vis.left;
      return {
        shape: vis.shape,
        pf: vis.pf,
        tips: L ? L.tips.map((p) => ({ x: p.x, y: p.y, press: p.press })) : null
      };
    },
    noteScore: function () { return noteScore(); },
    lyricScore: function () { return lyricScore(); },
    syncNotes: function () { syncNotes(); },
    syncLyrics: function () { syncLyrics(); },
    open: function (name) { go(name); },
    loadTiming: function (key) { loadSongTiming(key || ""); },
    offsets: function () {
      return { n: state.noteOffset, l: state.lyricOffset, ns: !!state.noteSynced, ls: !!state.lyricSynced, key: state.songKey };
    },
    setWords: function (words) {
      state.words = (words || []).map((w) => ({ t: +w.t || 0, label: String(w.label || "") }));
      const el = $("lyric-strip");
      if (el) el.dataset.win = "";
    }
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
      const syncedPick = pickVideo(meta.videos, pointsList, bi, hash);
      let chosen = syncedPick && syncedPick.points ? syncedPick : null;
      if (!chosen) {
        const officialId = await officialVideo(meta.videos, rec.artist || meta.artist, rec.title || meta.title);
        if (officialId) {
          const synced = (pointsList || []).find((p) => p && p.videoId === officialId && p.points && p.points.length > 4);
          chosen = { id: officialId, points: synced ? synced.points : null };
        } else chosen = syncedPick;
      }
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
      loadSongTiming("ss:" + rec.songId);
      state.lyricQuery = { artist: rec.artist || meta.artist || "", title: rec.title || meta.title || "" };
      state.words = [];
      lyricFor = "";
      const lyricEl = $("lyric-strip");
      if (lyricEl) lyricEl.dataset.win = "";
      if (sounded.length) {
        window.XBass.setTrack(notes);
        setStatus(t("ready") + " · Songsterr");
      } else {
        window.XBass.clearTrack();
        setStatus(t("noTab"), "warn");
      }
      startYouTube(chosen.id, "https://youtu.be/" + chosen.id);
      loadLyrics(state.lyricQuery.artist, state.lyricQuery.title, 0);
    } catch (e) {
      setStatus(t("searchFail"), "warn");
    }
  }

  const PITCHES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const PPS = 70;
  const PLAYHEAD = 64;
  function pitchName(string, fret) {
    const midi = [28, 33, 38, 43][string] + fret;
    return PITCHES[((midi % 12) + 12) % 12];
  }
  function syncMap() {
    try { return JSON.parse(localStorage.getItem("xbass.sync") || "{}") || {}; } catch (e) { return {}; }
  }
  function readSync(key) {
    if (!key) return XBassScore.unpackSync(null);
    return XBassScore.unpackSync(syncMap()[key]);
  }
  function loadSongTiming(key) {
    const s = readSync(key);
    state.songKey = key || "";
    state.noteOffset = s.n || 0;
    state.lyricOffset = s.l || 0;
    state.noteSynced = s.ns;
    state.lyricSynced = s.ls;
    state.lyricAnchor = s.lAt;
    state.loopA = s.a;
    state.loopB = s.b;
    state.loopLock = s.lock;
    paintSyncButtons();
  }
  function saveSongSync() {
    const key = state.songKey;
    if (!key) return;
    const m = syncMap();
    m[key] = XBassScore.packSync(state);
    try { localStorage.setItem("xbass.sync", JSON.stringify(m)); } catch (e) {}
  }
  function paintSyncButtons() {
    const notesBtn = $("btn-sync-notes");
    const lyricBtn = $("btn-sync-lyrics");
    if (notesBtn) notesBtn.classList.toggle("set", !!state.noteSynced);
    if (lyricBtn) lyricBtn.classList.toggle("set", !!state.lyricSynced);
  }
  function flashSync(btn) {
    if (!btn) return;
    btn.classList.add("set", "did");
    clearTimeout(btn._flash);
    btn._flash = setTimeout(() => { btn.classList.remove("did"); }, 700);
  }
  function firstNoteTime() {
    const notes = soundedNotes();
    return notes.length ? notes[0].t : 0;
  }
  function syncNotes() {
    state.noteOffset = XBassScore.syncOffset(mediaTime(), XBassScore.firstSoundTime(state.track || []));
    state.noteSynced = true;
    saveSongSync();
    flashSync($("btn-sync-notes"));
  }
  function syncLyrics() {
    const words = state.words || [];
    const now = mediaTime();
    if (words.length) {
      state.lyricOffset = XBassScore.syncOffset(now, words[0].t);
      state.lyricAnchor = null;
    } else {
      state.lyricAnchor = now;
      state.lyricOffset = now;
    }
    state.lyricSynced = true;
    saveSongSync();
    flashSync($("btn-sync-lyrics"));
  }
  function soundedNotes() {
    return (state.track || []).filter((n) => n && !n.rest);
  }
  function frameOf(notes) {
    const ps = [];
    (notes || []).forEach((n) => {
      if (!n || n.rest) return;
      ps.push(XBassScore.staffPos(XBassScore.midiOf(n.string, n.fret)));
    });
    return XBassScore.staffFrame(ps);
  }
  function measureWord(label, size) {
    try {
      if (!measureWord.ctx) measureWord.ctx = document.createElement("canvas").getContext("2d");
      measureWord.ctx.font = "800 " + size + "px \"Avenir Next\", \"Segoe UI\", sans-serif";
      return measureWord.ctx.measureText(String(label || "")).width || size;
    } catch (e) {
      return String(label || "").length * size * 0.55;
    }
  }
  function renderStaff(score, notes, curIdx) {
    const el = $("note-strip");
    if (!el) return;
    const w = Math.max(80, el.clientWidth || 300);
    const h = Math.max(64, el.clientHeight || 96);
    let root = el.querySelector("svg");
    if (!root) {
      root = svg("svg", { class: "staff-svg" });
      el.appendChild(root);
    }
    root.setAttribute("viewBox", "0 0 " + w + " " + h);
    root.setAttribute("preserveAspectRatio", "none");
    while (root.firstChild) root.removeChild(root.firstChild);
    const frame = state.staffFrame || XBassScore.staffFrame([]);
    const top = 8;
    const bottom = h - 8;
    const yFor = (pos) => XBassScore.yOnStaff(pos, frame, top, bottom);
    const step = Math.max(3, yFor(0) - yFor(1));
    XBassScore.LINES.forEach((line) => {
      const y = yFor(line);
      root.appendChild(svg("line", {
        class: "staff-line", "data-line": String(line),
        x1: 34, y1: y.toFixed(2), x2: w, y2: y.toFixed(2),
        stroke: "#222", "stroke-width": 1.35
      }));
    });
    const yF = yFor(6);
    const clefScale = Math.max(0.7, (2 * step) / 10);
    const clef = svg("g", {
      transform: "translate(1," + yF.toFixed(2) + ") scale(" + clefScale.toFixed(3) + ") translate(0,-18.5)"
    });
    clef.appendChild(svg("path", {
      d: "M16,1 C7,4 3,14 7,24 C11,34 20,34 22,24 C24,16 16,12 12,18 C8,26 12,36 20,38",
      fill: "none", stroke: "#111", "stroke-width": 2.4, "stroke-linecap": "round"
    }));
    clef.appendChild(svg("circle", { cx: 26, cy: 14, r: 2.15, fill: "#111" }));
    clef.appendChild(svg("circle", { cx: 26, cy: 23, r: 2.15, fill: "#111" }));
    root.appendChild(clef);
    if (frame.shift) {
      const mark = svg("text", {
        x: 8, y: (yFor(-1)).toFixed(1),
        "font-size": Math.max(9, step * 1.7),
        fill: "#111", "font-weight": 800, "font-family": "Georgia, serif"
      });
      mark.textContent = frame.shift >= 14 ? "15" : "8";
      root.appendChild(mark);
    }
    const t0 = score - (PLAYHEAD + 28) / PPS;
    const t1 = score + (w - PLAYHEAD) / PPS + 0.45;
    const beat = 60 / (state.bpm || 96);
    const acc = { 1: "#", 3: "b", 6: "#", 8: "b", 10: "b" };
    const rx = Math.max(4, step * 1.05);
    const ry = Math.max(2.8, step * 0.9);
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.t < t0 || n.t > t1) continue;
      const midi = XBassScore.midiOf(n.string, n.fret);
      const pos = XBassScore.staffPos(midi) + (frame.shift || 0);
      const y = yFor(pos);
      const x = PLAYHEAD + (n.t - score) * PPS;
      const nextT = notes[i + 1] ? notes[i + 1].t : n.t + beat;
      const dur = Math.max(0.05, nextT - n.t);
      const color = i === curIdx ? "#e1061c" : "#111";
      const whole = dur >= beat * 3.5;
      const half = !whole && dur >= beat * 1.6;
      if (pos <= -2) {
        const last = Math.floor(pos / 2) * 2;
        for (let p = -2; p >= last; p -= 2) {
          const ly = yFor(p);
          root.appendChild(svg("line", {
            x1: (x - rx - 4).toFixed(1), y1: ly.toFixed(2),
            x2: (x + rx + 4).toFixed(1), y2: ly.toFixed(2),
            stroke: "#222", "stroke-width": 1.2
          }));
        }
      }
      if (pos >= 10) {
        const last = Math.floor(pos / 2) * 2;
        for (let p = 10; p <= last; p += 2) {
          const ly = yFor(p);
          root.appendChild(svg("line", {
            x1: (x - rx - 4).toFixed(1), y1: ly.toFixed(2),
            x2: (x + rx + 4).toFixed(1), y2: ly.toFixed(2),
            stroke: "#222", "stroke-width": 1.2
          }));
        }
      }
      const sign = acc[((midi % 12) + 12) % 12];
      if (sign) {
        const at = svg("text", {
          x: (x - rx - 8).toFixed(1), y: (y + ry * 0.85).toFixed(1),
          "font-size": Math.max(10, step * 2.2),
          fill: color, "font-weight": 700, "font-family": "Georgia, serif"
        });
        at.textContent = sign;
        root.appendChild(at);
      }
      const g = svg("g", {
        "data-pos": String(pos),
        "data-y": y.toFixed(2),
        "data-now": i === curIdx ? "1" : "0",
        transform: "translate(" + x.toFixed(2) + "," + y.toFixed(2) + ")"
      });
      g.appendChild(svg("ellipse", {
        cx: 0, cy: 0, rx: rx.toFixed(2), ry: ry.toFixed(2),
        transform: "rotate(-18)",
        fill: half || whole ? "#fff" : color,
        stroke: color, "stroke-width": 1.45
      }));
      root.appendChild(g);
      if (!whole) {
        const up = pos < 4;
        const dir = up ? -1 : 1;
        const sx = x + (up ? rx * 0.7 : -rx * 0.7);
        const sy = y + dir * step * 3.1;
        root.appendChild(svg("line", {
          x1: sx.toFixed(2), y1: y.toFixed(2), x2: sx.toFixed(2), y2: sy.toFixed(2),
          stroke: color, "stroke-width": 1.35
        }));
        if (dur < beat * 0.75) {
          const flag = up
            ? "M" + sx.toFixed(1) + "," + sy.toFixed(1) + " c4,2 7,5 3,8"
            : "M" + sx.toFixed(1) + "," + sy.toFixed(1) + " c4,-2 7,-5 3,-8";
          root.appendChild(svg("path", { d: flag, fill: "none", stroke: color, "stroke-width": 1.3 }));
        }
      }
    }
    root.appendChild(svg("line", {
      class: "playhead",
      x1: PLAYHEAD, y1: 1, x2: PLAYHEAD, y2: h - 1,
      stroke: "#e1061c", "stroke-width": 1.6
    }));
  }
  function renderLyricStrip(score) {
    const el = $("lyric-strip");
    if (!el) return;
    const words = state.words || [];
    if (!words.length) {
      if (el.dataset.win !== "ph") {
        el.dataset.win = "ph";
        el.replaceChildren();
        const ph = document.createElement("span");
        ph.className = "lyric-ph";
        ph.textContent = "· · ·";
        el.appendChild(ph);
      }
      return;
    }
    const laid = XBassScore.layoutWords(words, score, {
      playhead: PLAYHEAD,
      pps: PPS,
      width: el.clientWidth || 280,
      gap: 6,
      baseSize: 15,
      minSize: 11,
      measure: measureWord
    });
    el.dataset.win = "live";
    el.replaceChildren();
    laid.forEach((w) => {
      const s = document.createElement("span");
      s.className = "lyric-word" + (w.now ? " now" : "");
      s.textContent = w.label;
      s.style.left = w.x.toFixed(1) + "px";
      s.style.fontSize = w.size + "px";
      el.appendChild(s);
    });
  }
  function renderKaraoke(noteT, lyricT) {
    const notes = soundedNotes();
    let cur = -1;
    for (let i = 0; i < notes.length; i++) {
      if (notes[i].t <= noteT + 0.04) cur = i;
      else break;
    }
    renderStaff(noteT, notes, cur);
    placeMarkers(noteT);
    renderLyricStrip(lyricT);
  }
  function parseLrc(text) {
    const rows = [];
    String(text || "").split(/\n/).forEach((line) => {
      const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)/);
      if (!m) return;
      const words = m[3].trim();
      if (!words) return;
      rows.push({ t: (+m[1]) * 60 + (+m[2]), text: words });
    });
    rows.sort((a, b) => a.t - b.t);
    const out = [];
    rows.forEach((row, i) => {
      const parts = row.text.split(/\s+/).filter(Boolean);
      const next = rows[i + 1] ? rows[i + 1].t : row.t + 3;
      const span = Math.max(0.4, next - row.t);
      const weight = parts.reduce((s, w) => s + Math.max(1, w.length), 0);
      let acc = 0;
      parts.forEach((w) => {
        const dur = span * (Math.max(1, w.length) / weight);
        out.push({ t: row.t + acc, label: w, line: i });
        acc += dur;
      });
    });
    return out;
  }
  async function loadLyrics(artist, title, duration) {
    const token = ++loadLyrics.token;
    const lyric = $("lyric-strip");
    if (!artist || !title) return;
    try {
      const url = "https://lrclib.net/api/search?artist_name=" + encodeURIComponent(artist) + "&track_name=" + encodeURIComponent(title);
      const r = await fetch(url);
      if (!r.ok || token !== loadLyrics.token) return;
      const list = await r.json();
      if (!Array.isArray(list) || token !== loadLyrics.token) return;
      const want = title.toLowerCase();
      let best = null, bestD = 1e9;
      list.forEach((item) => {
        if (!item || !item.syncedLyrics) return;
        const name = (item.trackName || "").toLowerCase();
        if (name && want && name.indexOf(want.slice(0, 8)) < 0 && want.indexOf(name.slice(0, 8)) < 0) return;
        const d = duration ? Math.abs((+item.duration || 0) - duration) : 0;
        if (d < bestD) { bestD = d; best = item; }
      });
      if (!best || token !== loadLyrics.token) return;
      if (duration && bestD > 45) return;
      state.words = parseLrc(best.syncedLyrics);
      if (state.lyricAnchor != null && state.words.length) {
        state.lyricOffset = XBassScore.syncOffset(state.lyricAnchor, state.words[0].t);
        state.lyricAnchor = null;
        saveSongSync();
      }
      if (lyric) lyric.dataset.win = "";
    } catch (e) {}
  }
  loadLyrics.token = 0;
  function maybeLyrics() {
    const q = state.lyricQuery;
    if (!q || !ytPlayer || !ytPlayer.getDuration) return;
    let dur = 0;
    try { dur = ytPlayer.getDuration() || 0; } catch (e) {}
    if (dur < 1) return;
    const key = (state.source && state.source.id) + ":" + Math.round(dur);
    if (lyricFor === key) return;
    lyricFor = key;
    loadLyrics(q.artist, q.title, dur);
  }
  function loopBounds() {
    let a = state.loopA;
    let b = state.loopB;
    if (a == null || b == null || !isFinite(a) || !isFinite(b)) {
      const t0 = firstNoteTime();
      a = t0;
      b = t0 + 8;
    }
    if (b < a) { const swap = a; a = b; b = swap; }
    if (b - a < 0.35) b = a + 0.35;
    return { a: a, b: b };
  }
  function holdLoop() {
    if (!state.loopLock || !mediaPlaying || !state.source) return;
    const bounds = loopBounds();
    const start = Math.max(0, bounds.a + (state.noteOffset || 0));
    const end = Math.max(start + 0.35, bounds.b + (state.noteOffset || 0));
    const mt = mediaTime();
    if (mt >= end - 0.04 || mt < start - 0.15) {
      if (!seekHold || Math.abs(seekHold.t - start) > 0.25) seekTo(start, false);
    }
  }
  function timeFromX(clientX) {
    const strip = $("note-strip");
    if (!strip) return noteScore();
    const rect = strip.getBoundingClientRect();
    return noteScore() + ((clientX - rect.left) - PLAYHEAD) / PPS;
  }
  function placeMarkers(score) {
    const strip = $("note-strip");
    if (!strip) return;
    const w = strip.clientWidth || 280;
    const bounds = loopBounds();
    const x1 = PLAYHEAD + (bounds.a - score) * PPS;
    const x2 = PLAYHEAD + (bounds.b - score) * PPS;
    [["loop-a", x1], ["loop-b", x2]].forEach(([id, x]) => {
      const el = $(id);
      if (!el) return;
      const shown = Math.max(0, Math.min(w - 32, x - 16));
      el.style.transform = "translate3d(" + shown.toFixed(1) + "px,0,0)";
      el.classList.toggle("locked", !!state.loopLock);
    });
    const span = $("loop-span");
    if (!span) return;
    const left = Math.max(0, Math.min(x1, x2));
    const right = Math.min(w, Math.max(x1, x2));
    span.classList.toggle("locked", !!state.loopLock);
    if (right - left < 1) {
      span.style.opacity = "0";
    } else {
      span.style.opacity = "1";
      span.style.transform = "translate3d(" + left.toFixed(1) + "px,0,0)";
      span.style.width = (right - left).toFixed(1) + "px";
    }
  }
  function toggleLoopLock() {
    const bounds = loopBounds();
    state.loopA = bounds.a;
    state.loopB = bounds.b;
    state.loopLock = !state.loopLock;
    saveSongSync();
    if (state.loopLock) seekTo(Math.max(0, bounds.a + (state.noteOffset || 0)), false);
  }
  function bindMarkers() {
    ["loop-a", "loop-b"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("pointerdown", (e) => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const bounds = loopBounds();
        state.loopA = bounds.a;
        state.loopB = bounds.b;
        const which = el.dataset.which === "b" ? "b" : "a";
        const cur = which === "a" ? state.loopA : state.loopB;
        markDrag = { which: which, moved: false, x: e.clientX, y: e.clientY, grab: timeFromX(e.clientX) - cur };
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
      });
    });
    window.addEventListener("pointermove", (e) => {
      if (!markDrag) return;
      const dx = e.clientX - markDrag.x;
      const dy = e.clientY - markDrag.y;
      if (!markDrag.moved && dx * dx + dy * dy < 36) return;
      markDrag.moved = true;
      if (state.loopLock) return;
      const t = timeFromX(e.clientX) - markDrag.grab;
      const gap = 0.35;
      if (markDrag.which === "a") state.loopA = Math.min(t, state.loopB - gap);
      else state.loopB = Math.max(t, state.loopA + gap);
    });
    const endDrag = (canToggle) => {
      if (!markDrag) return;
      const moved = markDrag.moved && !state.loopLock;
      const tapped = !markDrag.moved;
      markDrag = null;
      if (tapped && canToggle) toggleLoopLock();
      else if (moved) {
        const bounds = loopBounds();
        state.loopA = bounds.a;
        state.loopB = bounds.b;
        saveSongSync();
      }
    };
    window.addEventListener("pointerup", () => endDrag(true));
    window.addEventListener("pointercancel", () => endDrag(false));
  }
  function bindStrip() {
    const strip = $("note-strip");
    if (!strip) return;
    let drag = null;
    strip.addEventListener("pointerdown", (e) => {
      pauseMedia();
      drag = { x: e.clientX, t: mediaTime() };
      try { strip.setPointerCapture(e.pointerId); } catch (err) {}
    });
    strip.addEventListener("pointermove", (e) => {
      if (!drag) return;
      seekTo(drag.t - (e.clientX - drag.x) / PPS, true);
    });
    const end = (e) => {
      if (!drag) return;
      seekTo(drag.t - (e.clientX - drag.x) / PPS, false);
      drag = null;
    };
    strip.addEventListener("pointerup", end);
    strip.addEventListener("pointercancel", end);
  }

  function clickSound() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!clickSound.ctx) clickSound.ctx = new Ctx();
      const ctx = clickSound.ctx;
      if (ctx.state === "suspended") ctx.resume();
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(1320, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.06);
    } catch (e) {}
  }
  function runHit(kind) {
    if (kind === "new") openNew();
    else if (kind === "saved") go("players");
    else if (kind === "continue") {
      if (!state.current && state.players.length) state.current = state.players[state.players.length - 1];
      persist();
      go("song");
    } else if (kind === "settings") go("settings");
  }
  function runNav(n) {
    if (n === "back") back();
    else if (n === "home") home();
    else if (n === "song") toSong();
    else go(n);
  }
  function armHome() {
    document.querySelectorAll("#view-home .hit, #view-home [data-nav]").forEach((el) => {
      const fire = (e) => {
        if (e.type === "pointerdown" && e.button != null && e.button !== 0) return;
        const now = performance.now();
        if (now - tapLock < 350) return;
        tapLock = now;
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        el.classList.add("pressed");
        clickSound();
        const spec = HITS.find((h) => h[0] === el.id);
        const nav = el.dataset.nav;
        setTimeout(() => {
          el.classList.remove("pressed");
          if (spec) runHit(spec[5]);
          else if (nav) runNav(nav);
        }, 55);
      };
      el.addEventListener("pointerdown", fire);
      el.addEventListener("touchstart", fire, { passive: false });
    });
  }
  function ensureStage() {
    if (stageReady) return;
    stageReady = true;
    buildStage();
    buildHead();
    setBpm(state.bpm);
    $("speed").value = String(state.speed || 1);
    $("speed-val").textContent = (state.speed || 1).toFixed(2) + "×";
    $("btn-loop").classList.toggle("on", !!state.loop);
    selectString(state.stringSel);
  }
  function bindSyncTap(id, fn) {
    const el = $(id);
    if (!el) return;
    let last = 0;
    el.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      const now = performance.now();
      if (now - last < 280) return;
      last = now;
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }

  function boot() {
    armHome();
    layoutHome();
    applyI18n();

    document.body.addEventListener("click", (e) => {
      if (performance.now() - tapLock < 450 && e.target.closest && e.target.closest("#view-home")) return;
      const nav = e.target.closest("[data-nav]");
      if (nav) {
        runNav(nav.dataset.nav);
        return;
      }
      const hit = e.target.closest(".hit");
      if (hit) {
        const spec = HITS.find((h) => h[0] === hit.id);
        if (!spec) return;
        runHit(spec[5]);
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
      state.staffFrame = null;
      loadSongTiming("yt:" + id);
      state.lyricQuery = null;
      state.words = [];
      lyricFor = "";
      const lyrics = $("lyric-strip");
      if (lyrics) lyrics.dataset.win = "";
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
    $("btn-back").addEventListener("click", () => seekBy(-10));
    $("btn-fwd").addEventListener("click", () => seekBy(10));
    document.documentElement.style.setProperty("--ph", PLAYHEAD + "px");
    bindSyncTap("btn-sync-notes", syncNotes);
    bindSyncTap("btn-sync-lyrics", syncLyrics);
    bindStrip();
    bindMarkers();
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
    const later = () => { ensureStage(); };
    if (window.requestIdleCallback) requestIdleCallback(later, { timeout: 500 });
    else setTimeout(later, 0);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
