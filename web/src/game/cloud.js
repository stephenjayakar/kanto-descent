// Cloud saves in Convex behind Google sign-in (Convex Auth), over Convex's plain HTTP API (no bundler).
// Only allowlisted accounts can sync or download the game's asset packs; invite links (?invite=CODE)
// add whoever signs in with them. localStorage is always written first, so play works offline.
import { CONVEX_URL, PACKS } from '../../config.js';

const AUTH_KEY = 'kanto-descent.auth.v1';
const VERIFIER_KEY = 'kanto-descent.authVerifier.v1';
const INVITE_KEY = 'kanto-descent.invite.v1'; // kept across the Google redirect
const hasStorage = typeof localStorage !== 'undefined';
let pushTimer = null, pending = null;

function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function store(key, v) { try { if (v === null || v === undefined) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage off */ } }
function tokenExpiry(jwt) { try { return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { return 0; } }

export const Cloud = {
  url: CONVEX_URL ? CONVEX_URL.replace(/\/$/, '') : null,
  siteUrl: CONVEX_URL ? CONVEX_URL.replace(/\/$/, '').replace(/\.convex\.cloud$/, '.convex.site') : null,
  packs: !!PACKS,   // hosted build: the assets come from Convex after sign-in
  auth: null,       // { token, refreshToken }
  me: null,         // { email, name, allowed, canInvite }
  status: 'idle',   // idle | syncing | ok | offline
  error: null,
  get email() { return this.me?.allowed ? this.me.email : null; },
};

async function post(kind, path, args, token, keepalive = false) {
  if (!Cloud.url) throw new Error('Cloud saves are not configured.');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${Cloud.url}/api/${kind}`, { method: 'POST', headers, keepalive, body: JSON.stringify({ path, args, format: 'json' }) });
  const body = await res.json().catch(() => ({ status: 'error', errorMessage: `HTTP ${res.status}` }));
  if (body.status !== 'success') {
    const m = /Uncaught Error: ([^\n]*)/.exec(body.errorMessage || '');
    throw new Error(m ? m[1] : body.errorMessage || 'Request failed');
  }
  return body.value;
}

function setAuth(tokens) {
  Cloud.auth = tokens ? { token: tokens.token, refreshToken: tokens.refreshToken } : null;
  store(AUTH_KEY, Cloud.auth);
  if (!tokens) Cloud.me = null;
}

let refreshing = null;
async function freshToken() {
  if (!Cloud.auth) return null;
  if (tokenExpiry(Cloud.auth.token) - Date.now() > 60_000) return Cloud.auth.token;
  refreshing ??= post('action', 'auth:signIn', { refreshToken: Cloud.auth.refreshToken })
    .then(r => { setAuth(r.tokens || null); return Cloud.auth?.token ?? null; })
    .catch(e => { console.warn('token refresh failed', e); setAuth(null); return null; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function call(kind, path, args, opts = {}) {
  const token = await freshToken();
  if (!token) throw new Error('Signed out. Sign in with Google again.');
  return post(kind, path, args, token, opts.keepalive);
}

// Run once at boot: picks up ?invite= and the ?code= coming back from Google, then who we are.
export async function initCloud() {
  if (!hasStorage || !Cloud.url) return;
  Cloud.auth = load(AUTH_KEY, null);
  const url = new URL(location.href);
  const inv = url.searchParams.get('invite');
  if (inv) { store(INVITE_KEY, inv); url.searchParams.delete('invite'); }
  const code = url.searchParams.get('code');
  if (code) url.searchParams.delete('code');
  if (inv || code) history.replaceState(null, '', url.pathname + url.search + url.hash);
  if (code) {
    try { const r = await post('action', 'auth:signIn', { params: { code }, verifier: load(VERIFIER_KEY, undefined) }); setAuth(r.tokens || null); }
    catch (e) { Cloud.error = e.message; }
    store(VERIFIER_KEY, null);
  }
  if (!Cloud.auth) return;
  const pendingInv = load(INVITE_KEY, null);
  if (pendingInv) {
    try { await call('mutation', 'invites:redeem', { code: pendingInv }); store(INVITE_KEY, null); }
    catch (e) { Cloud.error = e.message; if (/used|expired|not valid/i.test(e.message)) store(INVITE_KEY, null); }
  }
  try {
    Cloud.me = await call('query', 'game:me', {});
    if (Cloud.me && !Cloud.me.allowed) Cloud.error ||= `${Cloud.me.email} isn't on the list yet. Ask for an invite link.`;
    Cloud.status = Cloud.me?.allowed ? 'ok' : 'idle';
  } catch (e) {
    Cloud.error = e.message; Cloud.status = 'offline';
    if (/sign in|signed out/i.test(e.message)) setAuth(null);
  }
}

export async function signIn() {
  Cloud.error = null;
  const redirectTo = location.origin + location.pathname;
  const r = await post('action', 'auth:signIn', { provider: 'google', params: { redirectTo } });
  store(VERIFIER_KEY, r.verifier);
  location.href = r.redirect;
}

export async function signOut() {
  await Cloud.flushMeta().catch(() => {});
  try { await call('action', 'auth:signOut', {}); } catch { /* already gone */ }
  setAuth(null);
  location.reload();
}

export const pendingInvite = () => (hasStorage ? load(INVITE_KEY, null) : null);
export const authToken = () => freshToken();
export const packManifest = () => call('query', 'packs:manifest', {});
export function dropAuth(message) { setAuth(null); Cloud.error = message || null; }

// Only the owner can make these (enforced on the server too).
export async function createInviteLink(note) {
  const r = await call('mutation', 'invites:create', { note: note || undefined });
  return `${location.origin}${location.pathname}?invite=${r.code}`;
}

// ---- save sync (used by run.js) -------------------------------------------------------------
Object.assign(Cloud, {
  async load() {
    if (!this.email) return null;
    this.status = 'syncing';
    try { const v = await call('query', 'game:load', {}); this.status = 'ok'; return v; }
    catch (e) { this.status = 'offline'; this.error = e.message; return null; }
  },
  pushMeta(meta) {
    if (!this.email) return;
    pending = meta;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => this.flushMeta(), 1500);
  },
  async flushMeta(keepalive = false) {
    if (!this.email || !pending) return;
    const meta = pending; pending = null;
    try { await call('mutation', 'game:putMeta', { meta }, { keepalive }); this.status = 'ok'; }
    catch (e) { this.status = 'offline'; this.error = e.message; }
  },
  async putSave(save) {
    if (!this.email) return;
    try { await call('mutation', 'game:putSave', { save }); this.status = 'ok'; }
    catch (e) { this.status = 'offline'; this.error = e.message; }
  },
  async addRun(entry) {
    if (!this.email) return;
    try { await call('mutation', 'game:addRun', { entry }); }
    catch (e) { this.status = 'offline'; this.error = e.message; }
  },
});

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('pagehide', () => { if (pending) Cloud.flushMeta(true); });
}
