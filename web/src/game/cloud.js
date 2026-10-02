// Cloud saves in Convex, keyed by email. The backend only answers calls carrying the deployment's access
// key (baked into config.js, which is only served by the private site / local dev) for allowed emails.
// Talks to Convex's HTTP API with plain fetch, so the game needs no bundler. Everything is fail-soft:
// localStorage is always written first and the game works offline.
import { CONVEX_URL, ACCESS_KEY, DEFAULT_EMAIL } from '../../config.js';

const EMAIL_KEY = 'kanto-descent-email';
let pushTimer = null, pending = null;

async function call(kind, path, args) {
  if (!CONVEX_URL) throw new Error('no CONVEX_URL');
  const r = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args: { key: ACCESS_KEY || '', ...args }, format: 'json' }),
  });
  const j = await r.json();
  if (j.status !== 'success') throw new Error(j.errorMessage || 'convex error');
  return j.value;
}

export const Cloud = {
  email: (() => { try { return localStorage.getItem(EMAIL_KEY) || DEFAULT_EMAIL || null; } catch { return DEFAULT_EMAIL || null; } })(),
  status: 'idle', // idle | syncing | ok | offline
  lastError: null,

  setEmail(email) {
    this.email = email ? email.trim().toLowerCase() : null;
    try { if (this.email) localStorage.setItem(EMAIL_KEY, this.email); else localStorage.removeItem(EMAIL_KEY); } catch { /* storage off */ }
  },

  async load() {
    if (!this.email) return null;
    this.status = 'syncing';
    try { const v = await call('query', 'game:load', { email: this.email }); this.status = 'ok'; return v; }
    catch (e) { this.status = 'offline'; this.lastError = e.message; return null; }
  },

  // progression is pushed debounced (it changes often)
  pushMeta(meta) {
    if (!this.email) return;
    pending = meta;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => this.flushMeta(), 1500);
  },
  async flushMeta() {
    if (!this.email || !pending) return;
    const meta = pending; pending = null;
    try { await call('mutation', 'game:putMeta', { email: this.email, meta }); this.status = 'ok'; }
    catch (e) { this.status = 'offline'; this.lastError = e.message; }
  },

  async putSave(save) {
    if (!this.email) return;
    try { await call('mutation', 'game:putSave', { email: this.email, save }); this.status = 'ok'; }
    catch (e) { this.status = 'offline'; this.lastError = e.message; }
  },

  async addRun(entry) {
    if (!this.email) return;
    try { await call('mutation', 'game:addRun', { email: this.email, entry }); }
    catch (e) { this.status = 'offline'; this.lastError = e.message; }
  },
};

// Make sure queued progression reaches the server when the tab closes.
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('pagehide', () => {
    if (!Cloud.email || !pending || !CONVEX_URL) return;
    try { navigator.sendBeacon?.(`${CONVEX_URL}/api/mutation`, new Blob([JSON.stringify({ path: 'game:putMeta', args: { key: ACCESS_KEY || '', email: Cloud.email, meta: pending }, format: 'json' })], { type: 'application/json' })); } catch { /* best effort */ }
  });
}
