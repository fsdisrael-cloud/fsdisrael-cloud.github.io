/**
 * Hit feedback.
 * navigator.vibrate works on many Android browsers and is a no-op elsewhere.
 * The hidden checkbox[switch] + label click is a best-effort iOS 18+ Safari
 * side effect (a light tick). It is unreliable: older iOS, desktop Safari,
 * and most WebViews ignore it. Screen shake and the red flash always run.
 */
export function createHaptics() {
  const input = document.getElementById("ios-haptic-switch");
  const label = document.getElementById("ios-haptic-label");
  let on = true;
  try {
    const saved = localStorage.getItem("ubu-haptics");
    if (saved === "0") on = false;
  } catch { /* private mode */ }

  return {
    enabled() { return on; },
    setOn(v) {
      on = !!v;
      try { localStorage.setItem("ubu-haptics", on ? "1" : "0"); } catch { /* ignore */ }
    },
    /** Tiny tick for button presses (Android vibrate; iOS 18+ switch trick, best effort). */
    crash() {
      if (!on) return;
      try { navigator.vibrate?.([120, 60, 220, 80, 120]); } catch { /* ignore */ }
      if (label && input) { [0, 140, 320].forEach((d) => setTimeout(() => { try { label.click(); } catch { /* ignore */ } }, d)); }
    },
    tick() {
      if (!on) return;
      try { navigator.vibrate?.(8); } catch { /* ignore */ }
      if (label && input) { try { label.click(); } catch { /* ignore */ } }
    },
    /** Call on missile or bullet damage. Does not replace the visual fallback. */
    pulse() {
      if (!on) return;
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try { navigator.vibrate([30, 36, 70]); } catch { /* unsupported */ }
      }
      // iOS 18+ only, and only sometimes. Clicking the label toggles the switch.
      if (label && input) {
        try { label.click(); } catch { /* ignore */ }
      }
    },
  };
}
