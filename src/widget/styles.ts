/**
 * Widget stylesheet, inlined into the single-file widget bundle at build time.
 *
 * All of it is scoped under `.aos-studio` so it can never affect the host page.
 * The palette is an original dark-teal studio theme built from one hue ramp
 * plus a single mint accent; contrast of body text on every surface here clears
 * 4.5:1, and the accent is only used for fills with dark text on top.
 */
export const WIDGET_CSS = String.raw`
.aos-studio {
  --aos-bg: #051417;
  --aos-surface: #0a2027;
  --aos-surface-2: #0f2c34;
  --aos-surface-3: #143843;
  --aos-border: #1d4a55;
  --aos-border-strong: #2a6674;
  --aos-text: #e8f6f4;
  --aos-text-dim: #9fc2c2;
  --aos-text-faint: #7aa2a4;
  --aos-accent: #34e2c0;
  --aos-accent-dim: #1a9e86;
  --aos-accent-ink: #032420;
  --aos-warn: #f2c14e;
  --aos-warn-bg: #2e2510;
  --aos-danger: #ff8574;
  --aos-danger-bg: #331815;
  --aos-ok: #5fe08a;
  --aos-radius: 14px;
  --aos-radius-sm: 9px;

  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  background: radial-gradient(120% 90% at 8% 0%, #0d3540 0%, var(--aos-bg) 58%);
  color: var(--aos-text);
  font-family: ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.aos-studio *, .aos-studio *::before, .aos-studio *::after { box-sizing: inherit; }

/* ------------------------------------------------------------------ primitives */

.aos-card {
  background: var(--aos-surface);
  border: 1px solid var(--aos-border);
  border-radius: var(--aos-radius);
  padding: 16px;
}
.aos-row { display: flex; gap: 10px; align-items: center; }
.aos-row--wrap { flex-wrap: wrap; }
.aos-spacer { flex: 1 1 auto; }
.aos-grid { display: grid; gap: 12px; }
.aos-muted { color: var(--aos-text-dim); }
.aos-faint { color: var(--aos-text-faint); font-size: 12px; }
.aos-mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
}

.aos-label {
  display: block;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--aos-text-faint);
  margin-bottom: 6px;
}

.aos-input, .aos-select, .aos-textarea {
  width: 100%;
  background: var(--aos-bg);
  color: var(--aos-text);
  border: 1px solid var(--aos-border);
  border-radius: var(--aos-radius-sm);
  padding: 9px 11px;
  font: inherit;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.aos-textarea { resize: vertical; min-height: 84px; line-height: 1.55; }
.aos-input:focus-visible, .aos-select:focus-visible, .aos-textarea:focus-visible,
.aos-btn:focus-visible, .aos-chip:focus-visible, .aos-seg button:focus-visible {
  outline: 2px solid var(--aos-accent);
  outline-offset: 2px;
}
.aos-input:hover:not(:disabled), .aos-select:hover:not(:disabled), .aos-textarea:hover:not(:disabled) {
  border-color: var(--aos-border-strong);
}
.aos-input:disabled, .aos-select:disabled, .aos-textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.aos-select {
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--aos-text-dim) 50%),
                    linear-gradient(135deg, var(--aos-text-dim) 50%, transparent 50%);
  background-position: calc(100% - 17px) calc(50% + 1px), calc(100% - 12px) calc(50% + 1px);
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  padding-right: 30px;
}

.aos-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--aos-border-strong);
  background: var(--aos-surface-2);
  color: var(--aos-text);
  border-radius: var(--aos-radius-sm);
  padding: 9px 15px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
}
.aos-btn:hover:not(:disabled) { background: var(--aos-surface-3); }
.aos-btn:active:not(:disabled) { transform: translateY(1px); }
.aos-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.aos-btn--primary {
  background: linear-gradient(180deg, var(--aos-accent) 0%, var(--aos-accent-dim) 100%);
  border-color: transparent;
  color: var(--aos-accent-ink);
}
.aos-btn--primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--aos-accent); }
.aos-btn--ghost { background: transparent; border-color: var(--aos-border); }
.aos-btn--danger { color: var(--aos-danger); border-color: #5a2a26; background: var(--aos-danger-bg); }
.aos-btn--sm { padding: 6px 11px; font-size: 12px; }
.aos-btn--icon { padding: 6px 9px; font-size: 12px; }

.aos-chip {
  border: 1px solid var(--aos-border);
  background: var(--aos-bg);
  color: var(--aos-text-dim);
  border-radius: 999px;
  padding: 5px 13px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 120ms ease;
}
.aos-chip:hover:not(:disabled) { border-color: var(--aos-border-strong); color: var(--aos-text); }
.aos-chip[aria-pressed="true"] {
  background: rgba(52, 226, 192, 0.14);
  border-color: var(--aos-accent-dim);
  color: var(--aos-accent);
}
.aos-chip:disabled { opacity: 0.4; cursor: not-allowed; }

.aos-seg {
  display: inline-flex;
  background: var(--aos-bg);
  border: 1px solid var(--aos-border);
  border-radius: 999px;
  padding: 3px;
  gap: 3px;
}
.aos-seg button {
  border: 0;
  background: transparent;
  color: var(--aos-text-dim);
  border-radius: 999px;
  padding: 6px 16px;
  font: inherit;
  font-weight: 650;
  font-size: 13px;
  cursor: pointer;
  transition: all 120ms ease;
}
.aos-seg button[aria-pressed="true"] {
  background: var(--aos-accent);
  color: var(--aos-accent-ink);
}
.aos-seg button:disabled { opacity: 0.45; cursor: not-allowed; }

.aos-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 4px 11px;
  font-size: 11.5px;
  font-weight: 650;
  letter-spacing: 0.02em;
  border: 1px solid var(--aos-border);
  color: var(--aos-text-dim);
  background: var(--aos-bg);
  white-space: nowrap;
}
.aos-pill--ok { color: var(--aos-ok); border-color: #2c5e3f; background: #0d2a1c; }
.aos-pill--warn { color: var(--aos-warn); border-color: #5b4a1c; background: var(--aos-warn-bg); }
.aos-pill--busy { color: var(--aos-accent); border-color: var(--aos-accent-dim); background: rgba(52, 226, 192, 0.1); }
.aos-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
.aos-dot--pulse { animation: aos-pulse 1.4s ease-in-out infinite; }
@keyframes aos-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }

/* --------------------------------------------------------------------- header */

.aos-header { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
.aos-brand { display: flex; align-items: center; gap: 11px; min-width: 0; }
.aos-mark {
  width: 36px; height: 36px; flex: 0 0 auto;
  border-radius: 11px;
  background: linear-gradient(145deg, var(--aos-accent) 0%, #0d6f68 100%);
  display: grid; place-items: center;
  color: var(--aos-accent-ink);
  font-weight: 800; font-size: 13px; letter-spacing: -0.04em;
}
.aos-title { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
.aos-subtitle { margin: 1px 0 0; font-size: 12px; color: var(--aos-text-faint); }

/* --------------------------------------------------------------------- banners */

.aos-banner {
  display: flex;
  gap: 12px;
  border-radius: var(--aos-radius);
  padding: 14px 15px;
  border: 1px solid var(--aos-border);
  background: var(--aos-surface-2);
}
.aos-banner--warn { border-color: #5b4a1c; background: var(--aos-warn-bg); }
.aos-banner--danger { border-color: #5a2a26; background: var(--aos-danger-bg); }
.aos-banner__icon { font-size: 16px; line-height: 1.3; flex: 0 0 auto; }
.aos-banner__body { min-width: 0; }
.aos-banner__title { margin: 0 0 4px; font-size: 13.5px; font-weight: 700; }
.aos-banner__text { margin: 0; font-size: 12.5px; color: var(--aos-text-dim); }
.aos-banner code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--aos-border);
  border-radius: 5px;
  padding: 1px 5px;
}
.aos-banner ul { margin: 7px 0 0; padding-left: 18px; font-size: 12.5px; color: var(--aos-text-dim); }
.aos-banner li { margin-bottom: 3px; }
.aos-link { color: var(--aos-accent); text-decoration: none; font-weight: 600; }
.aos-link:hover { text-decoration: underline; }

/* -------------------------------------------------------------------- composer */

.aos-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 12px; }
.aos-refs { display: grid; gap: 7px; }
.aos-ref { display: flex; gap: 7px; align-items: center; }
.aos-divider { height: 1px; background: var(--aos-border); margin: 2px 0; border: 0; }

.aos-estimate {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  background: var(--aos-bg);
  border: 1px solid var(--aos-border);
  border-radius: var(--aos-radius-sm);
  padding: 11px 13px;
}
.aos-estimate__figure { display: flex; align-items: baseline; gap: 5px; }
.aos-estimate__value { font-size: 21px; font-weight: 750; letter-spacing: -0.02em; color: var(--aos-accent); }
.aos-estimate__unit { font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.07em; color: var(--aos-text-faint); }
.aos-breakdown { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; }
.aos-breakdown li { display: flex; justify-content: space-between; gap: 14px; font-size: 11.5px; color: var(--aos-text-faint); }

/* ------------------------------------------------------------------------ job */

.aos-progress {
  position: relative;
  height: 7px;
  border-radius: 999px;
  background: var(--aos-bg);
  border: 1px solid var(--aos-border);
  overflow: hidden;
}
.aos-progress__fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--aos-accent-dim), var(--aos-accent));
  transition: width 400ms ease;
}
.aos-progress--indeterminate .aos-progress__fill { animation: aos-slide 1.6s ease-in-out infinite; }
@keyframes aos-slide {
  0% { margin-left: -35%; width: 35%; }
  100% { margin-left: 100%; width: 35%; }
}

.aos-results { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.aos-result {
  border: 1px solid var(--aos-border);
  border-radius: var(--aos-radius-sm);
  overflow: hidden;
  background: var(--aos-bg);
  display: flex;
  flex-direction: column;
}
.aos-result__media {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: #020c0e;
}
.aos-result video.aos-result__media { object-fit: contain; }
.aos-result__bar {
  display: flex; align-items: center; gap: 7px;
  padding: 8px 9px;
  border-top: 1px solid var(--aos-border);
  font-size: 11.5px;
  color: var(--aos-text-faint);
}

.aos-history { display: grid; gap: 7px; }
.aos-history__item {
  display: flex; gap: 10px; align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--aos-border);
  border-radius: var(--aos-radius-sm);
  background: var(--aos-bg);
  font-size: 12.5px;
  text-align: left;
  color: inherit;
  font-family: inherit;
  cursor: pointer;
  width: 100%;
}
.aos-history__item:hover { border-color: var(--aos-border-strong); }
.aos-history__prompt {
  flex: 1 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--aos-text-dim);
}

.aos-sr {
  position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .aos-studio *, .aos-studio *::before, .aos-studio *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
