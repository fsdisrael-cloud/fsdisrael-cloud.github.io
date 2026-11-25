/* X-BASS notation + sync math. No DOM. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.XBassScore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Diatonic index within the octave: C C# D Eb E F F# G Ab A Bb B
  var DIA = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  var OPEN = [28, 33, 38, 43];
  var LINES = [0, 2, 4, 6, 8];

  function staffPos(midi) {
    var m = midi | 0;
    var oct = Math.floor(m / 12) - 1;
    var dia = DIA[((m % 12) + 12) % 12] + oct * 7;
    return dia - 18;
  }

  function midiOf(string, fret) {
    var s = string | 0;
    if (s < 0) s = 0;
    if (s > 3) s = 3;
    return OPEN[s] + (fret | 0);
  }

  function round3(n) {
    return Math.round((+n || 0) * 1000) / 1000;
  }

  function syncOffset(mediaTime, anchorTime) {
    var now = +mediaTime;
    var anchor = +anchorTime;
    if (!isFinite(now)) now = 0;
    if (!isFinite(anchor)) anchor = 0;
    return round3(now - anchor);
  }

  function scoreTime(mediaTime, offset) {
    var now = +mediaTime;
    var off = +offset;
    if (!isFinite(now)) now = 0;
    if (!isFinite(off)) off = 0;
    return now - off;
  }

  function firstSoundTime(notes) {
    var list = notes || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && !list[i].rest) return +list[i].t || 0;
    }
    return 0;
  }

  function chooseShift(positions) {
    if (!positions.length) return 0;
    var best = 0;
    var bestScore = -Infinity;
    for (var s = 0; s <= 14; s += 7) {
      var inside = 0;
      var dist = 0;
      for (var i = 0; i < positions.length; i++) {
        var w = positions[i] + s;
        if (w >= -1 && w <= 9) inside++;
        var d = w - 4;
        dist += d < 0 ? -d : d;
      }
      var score = inside * 1000 - dist;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  function staffFrame(concertPositions) {
    var ps = [];
    var src = concertPositions || [];
    for (var i = 0; i < src.length; i++) {
      if (isFinite(src[i])) ps.push(src[i]);
    }
    var shift = chooseShift(ps);
    var lo = -4;
    var hi = 12;
    for (var j = 0; j < ps.length; j++) {
      var w = ps[j] + shift;
      if (w < lo) lo = Math.floor(w) - 1;
      if (w > hi) hi = Math.ceil(w) + 1;
    }
    if (lo % 2) lo -= 1;
    if (hi % 2) hi += 1;
    var maxSpan = 18;
    if (hi - lo > maxSpan) {
      var sum = 0;
      for (var k = 0; k < ps.length; k++) sum += ps[k] + shift;
      var med = ps.length ? sum / ps.length : 4;
      lo = Math.floor(med - maxSpan / 2);
      if (lo % 2) lo -= 1;
      hi = lo + maxSpan;
    }
    if (hi - lo < 14) hi = lo + 14;
    return { lo: lo, hi: hi, shift: shift };
  }

  function yOnStaff(pos, frame, top, bottom) {
    var lo = frame.lo;
    var hi = frame.hi;
    var span = hi - lo || 1;
    return bottom - (pos - lo) * ((bottom - top) / span);
  }

  function layoutWords(words, score, opt) {
    var list = words || [];
    var ph = opt.playhead;
    var pps = opt.pps;
    var width = opt.width || 320;
    var gap = opt.gap == null ? 6 : opt.gap;
    var base = opt.baseSize || 15;
    var minSize = opt.minSize || 11;
    var measure = opt.measure;
    var nowT = +score || 0;
    var cur = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].t <= nowT + 0.04) cur = i;
      else break;
    }
    var t0 = nowT - (ph + 24) / pps;
    var t1 = nowT + (width - ph) / pps + 0.7;
    var idxs = [];
    for (var n = 0; n < list.length; n++) {
      var ideal = ph + (list[n].t - nowT) * pps;
      var near = list[n].t >= t0 && list[n].t <= t1 && ideal > -40 && ideal < width + 20;
      if (n === cur && ideal > -140) near = true;
      if (near) idxs.push(n);
    }
    idxs.sort(function (a, b) {
      if (a === cur) return -1;
      if (b === cur) return 1;
      var da = list[a].t - nowT;
      var db = list[b].t - nowT;
      if (da < 0) da = -da;
      if (db < 0) db = -db;
      return da - db;
    });
    var placed = [];
    function hits(x, w) {
      for (var k = 0; k < placed.length; k++) {
        var p = placed[k];
        if (x < p.x + p.w + gap && x + w + gap > p.x) return true;
      }
      return false;
    }
    for (var q = 0; q < idxs.length; q++) {
      var idx = idxs[q];
      var x = ph + (list[idx].t - nowT) * pps;
      var size = base;
      var w = measure(list[idx].label, size);
      if (hits(x, w)) {
        size = minSize;
        w = measure(list[idx].label, size);
        if (hits(x, w)) {
          if (idx !== cur) continue;
          for (var r = placed.length - 1; r >= 0; r--) {
            var old = placed[r];
            if (x < old.x + old.w + gap && x + w + gap > old.x) placed.splice(r, 1);
          }
        }
      }
      placed.push({ i: idx, x: x, w: w, size: size, now: idx === cur });
    }
    placed.sort(function (a, b) { return a.x - b.x; });
    var out = [];
    for (var z = 0; z < placed.length; z++) {
      var item = placed[z];
      out.push({
        label: list[item.i].label,
        x: item.x,
        w: item.w,
        size: item.size,
        now: item.now
      });
    }
    return out;
  }

  function packSync(s) {
    var rec = {
      n: round3(s.noteOffset || 0),
      l: round3(s.lyricOffset || 0)
    };
    if (s.noteSynced) rec.ns = 1;
    if (s.lyricSynced) rec.ls = 1;
    if (s.loopA != null && s.loopB != null && isFinite(s.loopA) && isFinite(s.loopB)) {
      rec.a = round3(s.loopA);
      rec.b = round3(s.loopB);
    }
    if (s.loopLock) rec.lock = 1;
    if (s.lyricAnchor != null && isFinite(s.lyricAnchor)) rec.lAt = round3(s.lyricAnchor);
    return rec;
  }

  function unpackSync(v) {
    var out = { n: 0, l: 0, ns: false, ls: false, a: null, b: null, lock: false, lAt: null };
    if (typeof v === "number" && isFinite(v)) {
      out.n = v;
      out.ns = true;
      return out;
    }
    if (!v || typeof v !== "object") return out;
    if (typeof v.n === "number" && isFinite(v.n)) out.n = v.n;
    if (typeof v.l === "number" && isFinite(v.l)) out.l = v.l;
    out.ns = !!v.ns;
    out.ls = !!v.ls;
    if (typeof v.a === "number" && isFinite(v.a)) out.a = v.a;
    if (typeof v.b === "number" && isFinite(v.b)) out.b = v.b;
    out.lock = !!v.lock;
    if (typeof v.lAt === "number" && isFinite(v.lAt)) out.lAt = v.lAt;
    return out;
  }

  return {
    OPEN: OPEN,
    LINES: LINES,
    staffPos: staffPos,
    midiOf: midiOf,
    syncOffset: syncOffset,
    scoreTime: scoreTime,
    firstSoundTime: firstSoundTime,
    staffFrame: staffFrame,
    yOnStaff: yOnStaff,
    layoutWords: layoutWords,
    packSync: packSync,
    unpackSync: unpackSync
  };
});
