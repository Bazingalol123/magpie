import { createClient } from '@base44/sdk';

const appId = import.meta.env.VITE_BASE44_APP_ID || '6a622e254ee5f8740523313e';
const localBaseUrl = import.meta.env.VITE_BASE44_APP_BASE_URL;
const base44ServerUrl = localBaseUrl || 'https://app.base44.com';
const appBaseUrl = localBaseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://magpiecapture.com');

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
