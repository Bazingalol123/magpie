import { createClient } from '@base44/sdk';

const appId = import.meta.env.VITE_BASE44_APP_ID || '6a622e254ee5f8740523313e';
const localBaseUrl = import.meta.env.VITE_BASE44_APP_BASE_URL;
const base44ServerUrl = localBaseUrl || 'https://app.base44.com';
// loginWithProvider/redirectToLogin/logout build full-page redirect URLs as
// `${appBaseUrl}/api/apps/auth/...`. Login honors an explicit from_url via
// app_id regardless of host, but logout's server endpoint only redirects
// back to from_url when the request itself hits that domain -- hit directly
// on base44ServerUrl it silently redirects to "/" on base44ServerUrl
// instead. So appBaseUrl must be the public app origin, not the API host.
// This used to break login too (a same-origin appBaseUrl turned the OAuth
// redirect into a same-origin navigation our own service worker intercepted
// and quietly fell back to the cached landing page on) -- safe now that
// public/sw.js exempts /api/* from that fallback.
const appBaseUrl = localBaseUrl || (typeof window !== 'undefined' ? window.location.origin : base44ServerUrl);

export const base44 = createClient({
  appId,
  serverUrl: base44ServerUrl,
  appBaseUrl,
});

// Dev-only: the Playwright E2E harness (tests-e2e/) needs to drive the
// dashboard's own SDK instance with the real base44.auth.loginViaEmailPassword
// method (Issue #19 Phase 1 decision: no hand-injected localStorage tokens).
// This module has no other exported handle to the client, so tests need one
// explicit hook. import.meta.env.DEV is statically false in a `vite build`
// production bundle, so this branch and window.__magpieBase44 are dead-code
// eliminated and never exist outside a local `vite`/`base44 dev` session.
if (import.meta.env.DEV) {
  window.__magpieBase44 = base44;
}
