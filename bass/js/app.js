/* X-BASS v2.0
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
  // Hands: one filled silhouette. Each finger is 3 bones, the thumb is 2.
  // Poses ease by joint angle. The only stroke is the outer silhouette.
  const LH_BONE = [[58, 40, 28], [63, 43, 30], [57, 39, 27], [50, 35, 24]];
  const RH_BONE = [[46, 32, 22], [50, 35, 24], [44, 31, 21], [36, 26, 18]];
  const THUMB_BONE = [52, 40];
  const LH_W = [[32, 17.5], [34, 18.4], [30, 16.6], [24, 13.4]];
  const RH_W = [[30, 16.5], [33, 17.6], [28, 15.6], [23, 13]];
  const FLEX_F = [0.42, 1, 0.68];
  const FLEX_T = [0.5, 1];
  const BUMP_F = [{ t: 0.46, amp: 0.22, s: 0.07 }, { t: 0.78, amp: 0.14, s: 0.05 }];
  const BUMP_T = [{ t: 0.56, amp: 0.14, s: 0.07 }];

  function sampleAt(samples, t) {
    let best = samples[0];
    let bestD = 1e9;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.abs(samples[i].t - t);
      if (d < bestD) { bestD = d; best = samples[i]; }
    }
    return best;
  }
  function behindFret(fret) {
    const f = Math.max(1, fret | 0);
    const wire = fretX(f);
    const prev = fretX(f - 1);
    const space = Math.max(0, prev - wire);
    return wire + Math.max(10, Math.min(17, space * 0.24));
  }
  function ease(cur, target, dt, rate) {
    const k = 1 - Math.exp(-(rate || 8) * Math.max(0.001, dt || 0.016));
    return cur + (target - cur) * k;
  }
  function chainReach(lengths, flex) {
    let ang = flex[0] || 0;
    let x = 0;
    let y = 0;
    for (let i = 0; i < lengths.length; i++) {
      if (i > 0) ang += flex[i] || 0;
      x += Math.cos(ang) * lengths[i];
      y += Math.sin(ang) * lengths[i];
    }
    return Math.hypot(x, y);
  }
  function solveFlex(lengths, ratios, dist, minCurl) {
    const full = lengths.reduce(function (a, b) { return a + b; }, 0);
    const minC = minCurl == null ? 0.16 : minCurl;
    if (dist >= full * 0.992) return ratios.map(function (r) { return r * minC; });
    let lo = minC;
    let hi = 1.85;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const flex = ratios.map(function (r) { return r * mid; });
      if (chainReach(lengths, flex) > dist) lo = mid;
      else hi = mid;
    }
    const c = (lo + hi) / 2;
    return ratios.map(function (r) { return r * c; });
  }
  function pinChain(origin, target, lengths, flex, bendSign) {
    const aim = Math.atan2(target.y - origin.y, target.x - origin.x);
    let ang = aim + bendSign * (flex[0] || 0);
    const pts = [{ x: origin.x, y: origin.y }];
    let x = origin.x;
    let y = origin.y;
    for (let i = 0; i < lengths.length; i++) {
      if (i > 0) ang += bendSign * (flex[i] || 0);
      x += Math.cos(ang) * lengths[i];
      y += Math.sin(ang) * lengths[i];
      pts.push({ x: x, y: y });
    }
    const tip = pts[pts.length - 1];
    const have = Math.hypot(tip.x - origin.x, tip.y - origin.y) || 1;
    const need = Math.hypot(target.x - origin.x, target.y - origin.y) || 1;
    const rot = Math.atan2(target.y - origin.y, target.x - origin.x) - Math.atan2(tip.y - origin.y, tip.x - origin.x);
    const scale = need / have;
    const co = Math.cos(rot);
    const si = Math.sin(rot);
    return pts.map(function (p) {
      const dx = (p.x - origin.x) * scale;
      const dy = (p.y - origin.y) * scale;
      return { x: origin.x + dx * co - dy * si, y: origin.y + dx * si + dy * co };
    });
  }
  function widthAt(t, w0, w1, bumps) {
    const base = w0 + (w1 - w0) * Math.pow(t, 0.86);
    let m = 1;
    for (let i = 0; i < bumps.length; i++) {
      const b = bumps[i];
      m += b.amp * Math.exp(-Math.pow((t - b.t) / b.s, 2));
    }
    const waist = Math.exp(-Math.pow((t - 0.24) / 0.1, 2));
    return Math.max(w1 * 0.78, base * (m - 0.045 * waist));
  }
  function sampleChain(pts, w0, w1, bumps) {
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      seg.push(l);
      total += l;
    }
    if (total < 1) total = 1;
    const N = 16;
    const samples = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let d = t * total;
      let si = 0;
      let acc = 0;
      while (si < seg.length - 1 && acc + seg[si] < d) {
        acc += seg[si];
        si++;
      }
      const sl = seg[si] || 1;
      const u = clamp((d - acc) / sl, 0, 1);
      const a = pts[si];
      const b = pts[si + 1] || a;
      let tx = b.x - a.x;
      let ty = b.y - a.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      samples.push({
        t: t,
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        tx: tx, ty: ty, px: -ty, py: tx,
        w: widthAt(t, w0, w1, bumps)
      });
    }
    return samples;
  }
  function sideRibbon(samples, sign, inner, outer, t0, t1) {
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
  function edgesOf(samples) {
    const left = [];
    const right = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      left.push({ x: s.x + s.px * s.w, y: s.y + s.py * s.w });
      right.push({ x: s.x - s.px * s.w, y: s.y - s.py * s.w });
    }
    return { left: left, right: right };
  }
  function tipPoint(samples) {
    const e = samples[samples.length - 1];
    return { x: e.x + e.tx * e.w * 0.92, y: e.y + e.ty * e.w * 0.92 };
  }
  function packFinger(samples) {
    const e = edgesOf(samples);
    const mid = (samples.length / 2) | 0;
    const neg = e.left[mid].x <= e.right[mid].x ? e.left : e.right;
    const pos = neg === e.left ? e.right : e.left;
    return { samples: samples, neg: neg, pos: pos, x: samples[0].x };
  }
  function pushRange(pts, arr, a, b) {
    if (a <= b) {
      for (let i = a; i <= b; i++) pts.push(arr[i]);
    } else {
      for (let i = a; i >= b; i--) pts.push(arr[i]);
    }
  }
  function pushWeb(pts, a, b, dir) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 + dir * 13;
    pts.push({ x: (a.x * 2 + mx) / 3, y: (a.y * 2 + my) / 3 });
    pts.push({ x: mx, y: my });
    pts.push({ x: (b.x * 2 + mx) / 3, y: (b.y * 2 + my) / 3 });
  }
  function palmArc(from, to, dir) {
    const midX = (from.x + to.x) / 2;
    const y0 = (from.y + to.y) / 2;
    const span = Math.max(96, from.x - to.x);
    const wideR = span * 0.4 + 62;
    const wideL = span * 0.36 + 46;
    const deep = dir > 0 ? 124 : 210;
    const y1 = y0 + dir * deep * 0.4;
    const y2 = y0 + dir * deep;
    return [
      from,
      { x: from.x + 30, y: y0 + dir * 16 },
      { x: midX + wideR, y: y1 },
      { x: midX + wideR * 0.4, y: y2 },
      { x: midX - 8, y: y2 + dir * 12 },
      { x: midX - wideL * 0.46, y: y2 },
      { x: midX - wideL, y: y1 },
      { x: to.x - 28, y: y0 + dir * 18 },
      to
    ];
  }
  function handOutline(fingers, dir, thumbSamples) {
    const list = fingers.slice().sort(function (a, b) { return a.x - b.x; });
    const web = 5;
    const N = list[0].samples.length - 1;
    const pts = [];
    pushRange(pts, list[0].neg, 0, N);
    pts.push(tipPoint(list[0].samples));
    pushRange(pts, list[0].pos, N, web);
    for (let i = 1; i < list.length; i++) {
      pushWeb(pts, list[i - 1].pos[web], list[i].neg[web], dir);
      pushRange(pts, list[i].neg, web, N);
      pts.push(tipPoint(list[i].samples));
      pushRange(pts, list[i].pos, N, i === list.length - 1 ? 0 : web);
    }
    let palm = palmArc(list[list.length - 1].pos[0], list[0].neg[0], dir);
    if (thumbSamples) {
      const te = edgesOf(thumbSamples);
      const tip = tipPoint(thumbSamples);
      const mid = (te.left.length / 2) | 0;
      const anchor = list[0].samples[0];
      const dL = Math.hypot(te.left[mid].x - anchor.x, te.left[mid].y - anchor.y);
      const dR = Math.hypot(te.right[mid].x - anchor.x, te.right[mid].y - anchor.y);
      const outer = dL >= dR ? te.left : te.right;
      const inner = outer === te.left ? te.right : te.left;
      const spliced = [palm[0]];
      pushRange(spliced, outer, 0, outer.length - 1);
      spliced.push(tip);
      pushRange(spliced, inner, inner.length - 1, 0);
      for (let i = 1; i < palm.length; i++) spliced.push(palm[i]);
      palm = spliced;
    }
    for (let i = 0; i < palm.length; i++) pts.push(palm[i]);
    return crClosed(pts);
  }
  function ribbonPath(samples) {
    const e = edgesOf(samples);
    const tip = tipPoint(samples);
    const b = samples[0];
    const heel = { x: b.x - b.tx * b.w * 0.4, y: b.y - b.ty * b.w * 0.4 };
    return crClosed(e.left.concat([tip], e.right.slice().reverse(), [heel]));
  }
  function placeNail(node, samples) {
    if (!node) return;
    const s = sampleAt(samples, 0.94);
    const x = s.x + s.tx * s.w * 0.1;
    const y = s.y + s.ty * s.w * 0.1;
    const ang = Math.atan2(s.ty, s.tx) * 180 / Math.PI;
    node.setAttribute("transform", "translate(" + n1(x) + " " + n1(y) + ") rotate(" + ang.toFixed(1) + ")");
    const rx = Math.max(8.2, s.w * 1.2);
    const ry = Math.max(5.6, s.w * 0.74);
    const body = node.querySelector(".body");
    body.setAttribute("rx", n1(rx));
    body.setAttribute("ry", n1(ry));
    const shine = node.querySelector(".shine");
    shine.setAttribute("cx", n1(-rx * 0.22));
    shine.setAttribute("cy", n1(-ry * 0.3));
    shine.setAttribute("rx", n1(rx * 0.32));
    shine.setAttribute("ry", n1(ry * 0.4));
  }
  function makeNail(cls) {
    const n = svg("g", { class: cls });
    n.appendChild(svg("ellipse", {
      class: "body", cx: "0", cy: "0", rx: "9", ry: "6",
      fill: "url(#nail)", stroke: "#c41630", "stroke-width": "0.8"
    }));
    n.appendChild(svg("ellipse", { class: "shine", fill: "#fff", opacity: "0.92" }));
    return n;
  }
  function bonesToFit(dist, n) {
    const total = Math.max(n === 2 ? 36 : 78, dist * 1.55);
    if (n === 2) return [total * 0.58, total * 0.42];
    return [total * 0.45, total * 0.33, total * 0.22];
  }
  function makeHandGroup(id) {
    const g = svg("g", { id: id });
    g.appendChild(svg("ellipse", { class: "drop", fill: "#c48b7c", opacity: "0.12" }));
    const ink = svg("g", { class: "ink" });
    for (let i = 0; i < 4; i++) ink.appendChild(svg("path", { class: "f" + i, fill: "url(#skin)" }));
    ink.appendChild(svg("path", { class: "palm", fill: "url(#skin)" }));
    ink.appendChild(svg("path", { class: "thumb", fill: "url(#skin)" }));
    ink.appendChild(svg("path", {
      class: "heel", fill: "none", stroke: "#e7b5a6", "stroke-width": "2.2",
      "stroke-linecap": "round"
    }));
    g.appendChild(ink);
    const shade = svg("g", { class: "shade" });
    shade.appendChild(svg("ellipse", { class: "palmhi", fill: "url(#softHi)" }));
    shade.appendChild(svg("ellipse", { class: "palmsh", fill: "url(#softSh)" }));
    g.appendChild(shade);
    const nails = svg("g", { class: "nails" });
    for (let i = 0; i < 5; i++) nails.appendChild(makeNail("n" + i));
    g.appendChild(nails);
    return g;
  }
  function handPalmPath(cx, edge, halfW, depth, dir) {
    const yKn = edge - dir * 14;
    const yHeel = edge + dir * depth;
    const left = cx - halfW;
    const right = cx + halfW;
    return "M" + n1(left + 36) + " " + n1(yKn)
      + "Q" + n1(left - 8) + " " + n1(yKn) + " " + n1(left - 14) + " " + n1(edge + dir * depth * 0.32)
      + "Q" + n1(left + 18) + " " + n1(yHeel) + " " + n1(cx - 8) + " " + n1(yHeel + dir * 20)
      + "Q" + n1(right - 18) + " " + n1(yHeel) + " " + n1(right + 16) + " " + n1(edge + dir * depth * 0.3)
      + "Q" + n1(right + 8) + " " + n1(yKn) + " " + n1(right - 34) + " " + n1(yKn)
      + "Z";
  }
  function paintHand(g, fingerSamples, dir, thumbSamples, palm) {
    for (let i = 0; i < 4; i++) {
      const d = fingerSamples[i] ? ribbonPath(fingerSamples[i]) : "";
      g.querySelectorAll(".f" + i).forEach(function (node) { node.setAttribute("d", d); });
      placeNail(g.querySelector(".n" + i), fingerSamples[i]);
    }
    const palmD = handPalmPath(palm.cx, palm.edge, palm.halfW, palm.depth, dir);
    g.querySelectorAll(".palm").forEach(function (node) { node.setAttribute("d", palmD); });
    const heel = g.querySelector(".heel");
    if (heel) {
      const left = palm.cx - palm.halfW;
      const right = palm.cx + palm.halfW;
      const yHeel = palm.edge + dir * palm.depth;
      heel.setAttribute("d", "M" + n1(left + 10) + " " + n1(palm.edge + dir * palm.depth * 0.42)
        + "Q" + n1(left + 24) + " " + n1(yHeel) + " " + n1(palm.cx) + " " + n1(yHeel + dir * 16)
        + "Q" + n1(right - 24) + " " + n1(yHeel) + " " + n1(right - 8) + " " + n1(palm.edge + dir * palm.depth * 0.4));
    }
    const drop = g.querySelector(".drop");
    drop.setAttribute("cx", n1(palm.cx + 6));
    drop.setAttribute("cy", n1(palm.edge + dir * palm.depth * 0.45));
    drop.setAttribute("rx", n1(palm.halfW * 0.86));
    drop.setAttribute("ry", n1(palm.depth * 0.42));
    const hi = g.querySelector(".palmhi");
    hi.setAttribute("cx", n1(palm.cx - palm.halfW * 0.08));
    hi.setAttribute("cy", n1(palm.edge + dir * palm.depth * 0.28));
    hi.setAttribute("rx", n1(palm.halfW * 0.62));
    hi.setAttribute("ry", n1(palm.depth * 0.36));
    const sh = g.querySelector(".palmsh");
    sh.setAttribute("cx", n1(palm.cx + 12));
    sh.setAttribute("cy", n1(palm.edge + dir * palm.depth * 0.62));
    sh.setAttribute("rx", n1(palm.halfW * 0.48));
    sh.setAttribute("ry", n1(palm.depth * 0.28));
    const thumbNail = g.querySelector(".n4");
    const thumbs = g.querySelectorAll(".thumb");
    if (thumbSamples) {
      const d = ribbonPath(thumbSamples);
      thumbs.forEach(function (node) {
        node.setAttribute("d", d);
        node.setAttribute("opacity", "1");
      });
      placeNail(thumbNail, thumbSamples);
      thumbNail.setAttribute("opacity", "1");
    } else {
      thumbs.forEach(function (node) {
        node.setAttribute("d", "");
        node.setAttribute("opacity", "0");
      });
      thumbNail.setAttribute("opacity", "0");
    }
  }
  function fingerFlex(origin, target, lengths) {
    const dist = Math.hypot(target.x - origin.x, target.y - origin.y);
    return solveFlex(lengths, lengths.length === 2 ? FLEX_T : FLEX_F, dist, 0.42);
  }
  function easeFlex(cur, want, dt, rate) {
    const out = [];
    for (let i = 0; i < want.length; i++) {
      const row = [];
      const src = cur && cur[i] ? cur[i] : want[i];
      for (let j = 0; j < want[i].length; j++) row.push(ease(src[j] || 0, want[i][j], dt, rate));
      out.push(row);
    }
    return out;
  }
  function spreadKnuckles(tips, palmX, palmY) {
    const raw = tips.map(function (p, i) {
      return { x: palmX + (p.x - palmX) * 0.62, y: palmY + [8, -6, -2, 12][i] };
    });
    const order = [0, 1, 2, 3].sort(function (a, b) { return raw[a].x - raw[b].x; });
    for (let k = 1; k < order.length; k++) {
      const prev = raw[order[k - 1]];
      const cur = raw[order[k]];
      if (cur.x < prev.x + 78) cur.x = prev.x + 78;
    }
    let c = 0;
    raw.forEach(function (p) { c += p.x; });
    const shift = c / 4 - palmX;
    raw.forEach(function (p) { p.x -= shift; });
    return raw;
  }
  function poseLeft(shape) {
    const string = clamp(shape.string | 0, 0, 3);
    const tips = [];
    for (let i = 0; i < 4; i++) {
      const s = shape.strings && shape.strings[i] != null ? shape.strings[i] : string;
      tips.push({
        x: behindFret(shape.frets[i]),
        y: GEO.strings[clamp(s | 0, 0, 3)],
        press: shape.press === i ? 1 : 0
      });
    }
    if (shape.support) {
      const off = shape.press === 3 ? 12 : 20;
      tips[2] = { x: tips[3].x + 16, y: tips[3].y + off, press: 0 };
    }
    if (shape.system === "octave") {
      const x0 = tips[0].x, x3 = tips[3].x, y0 = tips[0].y, y3 = tips[3].y;
      tips[1] = { x: x0 + (x3 - x0) * 0.36, y: (y0 + y3) / 2 + 6, press: 0 };
      tips[2] = { x: x0 + (x3 - x0) * 0.64, y: (y0 + y3) / 2 + 8, press: 0 };
    }
    if ((shape.press | 0) < 0) {
      for (let i = 0; i < 4; i++) tips[i].y += 18;
    }
    let palmX = 0;
    let avgY = 0;
    for (let i = 0; i < 4; i++) { palmX += tips[i].x; avgY += tips[i].y; }
    palmX /= 4;
    let palmY = avgY / 4 + 102;
    if (palmY > 488) palmY = 488;
    return { knuckles: spreadKnuckles(tips, palmX, palmY), tips: tips, palmX: palmX, palmY: palmY };
  }
  function clonePose(src) {
    return {
      palmX: src.palmX,
      palmY: src.palmY,
      knuckles: src.knuckles.map(function (p) { return { x: p.x, y: p.y }; }),
      tips: src.tips.map(function (p) { return { x: p.x, y: p.y, press: p.press }; })
    };
  }
  function lerpLeft(target, dt) {
    if (!vis.left) {
      vis.left = clonePose(target);
      vis.left.flex = target.knuckles.map(function (k, i) {
        return fingerFlex(k, target.tips[i], bonesToFit(Math.hypot(target.tips[i].x - k.x, target.tips[i].y - k.y), 3));
      });
      vis.left.thumb = [0.2, 0.35];
      return;
    }
    const L = vis.left;
    for (let i = 0; i < 4; i++) {
      L.knuckles[i].x = ease(L.knuckles[i].x, target.knuckles[i].x, dt, 8);
      L.knuckles[i].y = ease(L.knuckles[i].y, target.knuckles[i].y, dt, 8);
      L.tips[i].x = ease(L.tips[i].x, target.tips[i].x, dt, 9);
      L.tips[i].y = ease(L.tips[i].y, target.tips[i].y, dt, 9);
      L.tips[i].press = ease(L.tips[i].press, target.tips[i].press, dt, 10);
    }
    L.palmX = ease(L.palmX, target.palmX, dt, 8);
    L.palmY = ease(L.palmY, target.palmY, dt, 8);
    const want = L.knuckles.map(function (k, i) {
      return fingerFlex(k, L.tips[i], bonesToFit(Math.hypot(L.tips[i].x - k.x, L.tips[i].y - k.y), 3));
    });
    L.flex = easeFlex(L.flex, want, dt, 9);
    const thumbTip = { x: L.knuckles[0].x + 10, y: GEO.boardY - 12 };
    const thumbBase = { x: L.knuckles[0].x + 2, y: GEO.boardY + 26 };
    L.thumb = easeFlex([L.thumb], [fingerFlex(thumbBase, thumbTip, bonesToFit(40, 2))], dt, 8)[0];
    L.thumbBase = thumbBase;
    L.thumbTip = thumbTip;
  }
  function drawLeftHand(dt, shape) {
    const target = poseLeft(shape);
    lerpLeft(target, dt);
    const L = vis.left;
    const samples = [];
    let minX = 1e9, maxX = -1e9;
    for (let i = 0; i < 4; i++) {
      const dist = Math.hypot(L.tips[i].x - L.knuckles[i].x, L.tips[i].y - L.knuckles[i].y);
      const bones = bonesToFit(dist, 3);
      const pts = pinChain(L.knuckles[i], L.tips[i], bones, L.flex[i], -1);
      const w = LH_W[i];
      samples.push(sampleChain(pts, w[0], w[1], BUMP_F));
      minX = Math.min(minX, L.knuckles[i].x);
      maxX = Math.max(maxX, L.knuckles[i].x);
      const mark = $("mark" + i);
      if (mark) {
        mark.setAttribute("transform", "translate(" + n1(L.tips[i].x) + " " + n1(L.tips[i].y) + ")");
        mark.setAttribute("opacity", clamp(L.tips[i].press, 0, 1).toFixed(3));
      }
    }
    const span = Math.max(150, maxX - minX);
    paintHand($("fret-hand"), samples, 1, null, {
      cx: L.palmX,
      edge: L.palmY - 6,
      halfW: Math.max(span * 0.85 + 62, 168),
      depth: 136
    });
    const base = L.thumbBase;
    const tip = L.thumbTip;
    const tpts = pinChain(base, tip, bonesToFit(40, 2), L.thumb, 1);
    const ts = sampleChain(tpts, 17, 14, BUMP_T);
    const thumb = $("thumb-back");
    if (thumb) {
      thumb.querySelector(".skin").setAttribute("d", ribbonPath(ts));
      placeNail(thumb.querySelector(".nail"), ts);
    }
  }
  function thumbRestFor(stringIndex) {
    const y = TOP_Y[stringIndex];
    return { x: 268, y: clamp(y + 2, 96, 188) };
  }
  function drawRightHand(dt, note, now) {
    const s = clamp(note.string | 0, 0, 3);
    const stringY = TOP_Y[s];
    const rest = thumbRestFor(s);
    const age = (now - vis.pluckStart) / 240;
    let env = 0;
    if (!note.rest && age >= 0 && age <= 1) {
      env = age < 0.28 ? Math.sin((age / 0.28) * Math.PI / 2) : Math.cos(((age - 0.28) / 0.72) * Math.PI / 2);
    }
    const knuckleY = clamp(52 + (stringY - 130) * 0.1, 46, 68);
    const palmX = 146;
    const kx = [-156, -52, 54, 158];
    const ky = [4, -10, -6, 6];
    const knuckles = kx.map(function (dx, i) { return { x: palmX + dx, y: knuckleY + ky[i] }; });
    const indexOn = vis.pf === "index";
    function tipFor(i, pluck) {
      const x = palmX + [-36, 8, 48, 88][i];
      const curled = knuckleY + 112 + (3 - i) * 6;
      const through = stringY + 22;
      return { x: x, y: pluck ? curled + (through - curled) * env : curled };
    }
    const tips = [tipFor(0, false), tipFor(1, false), tipFor(2, !indexOn), tipFor(3, indexOn)];
    const thumbBase = { x: palmX + 108, y: knuckleY - 6 };
    const thumbTip = { x: 292, y: rest.y - 6 };
    if (!vis.rh || vis.rY == null) {
      vis.rY = stringY;
      vis.rh = {
        knuckles: knuckles.map(function (p) { return { x: p.x, y: p.y }; }),
        tips: tips.map(function (p) { return { x: p.x, y: p.y }; }),
        palmX: palmX,
        knuckleY: knuckleY,
        thumbBase: { x: thumbBase.x, y: thumbBase.y },
        thumbTip: { x: thumbTip.x, y: thumbTip.y },
        flex: knuckles.map(function (k, i) {
          return fingerFlex(k, tips[i], bonesToFit(Math.hypot(tips[i].x - k.x, tips[i].y - k.y), 3));
        }),
        thumb: fingerFlex(thumbBase, thumbTip, THUMB_BONE)
      };
    } else {
      const R = vis.rh;
      for (let i = 0; i < 4; i++) {
        R.knuckles[i].x = ease(R.knuckles[i].x, knuckles[i].x, dt, 8);
        R.knuckles[i].y = ease(R.knuckles[i].y, knuckles[i].y, dt, 8);
        R.tips[i].x = ease(R.tips[i].x, tips[i].x, dt, 16);
        R.tips[i].y = ease(R.tips[i].y, tips[i].y, dt, 16);
      }
      R.palmX = ease(R.palmX, palmX, dt, 8);
      R.knuckleY = ease(R.knuckleY, knuckleY, dt, 8);
      R.thumbBase.x = ease(R.thumbBase.x, thumbBase.x, dt, 8);
      R.thumbBase.y = ease(R.thumbBase.y, thumbBase.y, dt, 8);
      R.thumbTip.x = ease(R.thumbTip.x, thumbTip.x, dt, 8);
      R.thumbTip.y = ease(R.thumbTip.y, thumbTip.y, dt, 8);
      vis.rY = R.knuckleY;
      const want = R.knuckles.map(function (k, i) {
        return fingerFlex(k, R.tips[i], bonesToFit(Math.hypot(R.tips[i].x - k.x, R.tips[i].y - k.y), 3));
      });
      R.flex = easeFlex(R.flex, want, dt, 14);
      R.thumb = easeFlex([R.thumb], [fingerFlex(R.thumbBase, R.thumbTip, THUMB_BONE)], dt, 10)[0];
    }
    const R = vis.rh;
    const samples = [];
    for (let i = 0; i < 4; i++) {
      const dist = Math.hypot(R.tips[i].x - R.knuckles[i].x, R.tips[i].y - R.knuckles[i].y);
      const pts = pinChain(R.knuckles[i], R.tips[i], bonesToFit(dist, 3), R.flex[i], 1);
      samples.push(sampleChain(pts, RH_W[i][0], RH_W[i][1], BUMP_F));
    }
    const tpts = pinChain(R.thumbBase, R.thumbTip, THUMB_BONE, R.thumb, -1);
    const thumbSamples = sampleChain(tpts, 24, 17, BUMP_T);
    paintHand($("pluck-hand"), samples, -1, thumbSamples, {
      cx: R.palmX + 6,
      edge: R.knuckleY + 8,
      halfW: 196,
      depth: 176
    });
  }
  function buildHands() {
    const defs = document.querySelector("#stage-svg defs");
    [["softHi", "#ffffff", "0.55"], ["softSh", "#c48474", "0.4"]].forEach(function (spec) {
      const grad = svg("radialGradient", { id: spec[0], cx: "50%", cy: "50%", r: "50%" });
      grad.appendChild(svg("stop", { offset: "0", "stop-color": spec[1], "stop-opacity": spec[2] }));
      grad.appendChild(svg("stop", { offset: "1", "stop-color": spec[1], "stop-opacity": "0" }));
      defs.appendChild(grad);
    });
    defs.appendChild(svg("clipPath", { id: "clip-top", clipPathUnits: "userSpaceOnUse" }))
      .appendChild(svg("rect", { x: "-80", y: "0", width: "1760", height: "250" }));
    defs.appendChild(svg("clipPath", { id: "clip-board", clipPathUnits: "userSpaceOnUse" }))
      .appendChild(svg("rect", { x: "-80", y: "252", width: "1760", height: "300" }));

    const thumb = svg("g", { id: "thumb-back" });
    thumb.appendChild(svg("path", { class: "skin", fill: "url(#skin)" }));
    thumb.appendChild(makeNail("nail"));
    const board = $("board");
    board.parentNode.insertBefore(thumb, board);

    const hand = $("fret-hand");
    hand.setAttribute("clip-path", "url(#clip-board)");
    hand.replaceChildren();
    hand.appendChild(makeHandGroup("fret-skin"));
    const marks = svg("g", { id: "fret-marks" });
    for (let i = 0; i < 4; i++) {
      const m = svg("g", { id: "mark" + i, opacity: "0" });
      m.appendChild(svg("circle", {
        r: "18", fill: "none", stroke: "#ff4b5c", "stroke-width": "7",
        opacity: "0.55", filter: "url(#glow)"
      }));
      m.appendChild(svg("circle", {
        r: "13", fill: "none", stroke: "#e1061c", "stroke-width": "2.7"
      }));
      marks.appendChild(m);
    }
    hand.appendChild(marks);

    const pluck = $("pluck-hand");
    pluck.replaceChildren();
    pluck.removeAttribute("transform");
    pluck.setAttribute("clip-path", "url(#clip-top)");
    pluck.appendChild(makeHandGroup("pluck-skin"));
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
      vis.shape = null; vis.left = null; vis.rh = null; vis.key = ""; vis.rY = null;
      if (!notes) { state.track = null; state.staffFrame = null; return; }
      state.track = notes.map((n) => ({ t: +n.t || 0, string: n.string | 0, fret: n.fret | 0, rest: !!n.rest })).sort((a, b) => a.t - b.t);
      state.staffFrame = frameOf(state.track);
    },
    clearTrack: function () {
      vis.shape = null; vis.left = null; vis.rh = null; vis.key = ""; vis.rY = null;
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
