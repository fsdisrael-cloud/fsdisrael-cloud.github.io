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
    const saved = localStorage.getItem("jet-haptics");
    if (saved === "0") on = false;
  } catch { /* private mode */ }

  return {
    enabled() { return on; },
    setOn(v) {
      on = !!v;
      try { localStorage.setItem("jet-haptics", on ? "1" : "0"); } catch { /* ignore */ }
    },
    /** Tiny tick for button presses (Android vibrate; iOS 18+ switch trick, best effort). */
    crash() {},
    /** b24: no haptics for your own weapons or hits on targets; only crash() and hit() (YOU are hit) vibrate */
    lock() {}, bomb() {}, boom() {}, tick() {}, pulse() {},
    hit() {
      if (!on) return;
      try { navigator.vibrate?.([30, 36, 70]); } catch { /* unsupported */ }
      if (label && input) { try { label.click(); } catch { /* ignore */ } }
    },
  };
}
