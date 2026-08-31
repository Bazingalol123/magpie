import { createClient } from '@base44/sdk';

const appId = import.meta.env.VITE_BASE44_APP_ID || '6a622e254ee5f8740523313e';
const localBaseUrl = import.meta.env.VITE_BASE44_APP_BASE_URL;
const platformServerUrl = 'https://app.base44.com';
const browserOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
const isLocalDevHost = !!browserOrigin && /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(browserOrigin);
// Base44 now hard-rejects every base44.functions.invoke() call
// (POST /api/apps/{appId}/functions/*) made against the shared platform
// domain once an app has a connected custom/app domain -- 403 "Backend
// functions cannot be accessed from the platform domain. Use the app's
// subdomain instead.", confirmed live 2026-08-21 via curl against both
// app.base44.com and magpiecapture.com with an identical request (the
// custom domain correctly reached entry.ts's own 401; the platform domain
// 403'd before entry.ts ever ran). Entities and /auth/me behave identically
// on both hosts, so serverUrl must be the deployed app's own origin, not
// the platform host -- except for local dev on localhost with no sandbox
// configured, which still wants the real hosted backend as before.
// Prefer the browser's own origin whenever it isn't localhost, even over an
// explicit localBaseUrl -- `npx base44 dev` bakes VITE_BASE44_APP_BASE_URL
// as a literal http://localhost:<port> into its own embedded frontend
// bundle regardless of where that bundle actually gets served from. On a
// phone (loading the dev server over Tailscale/LAN), "localhost" resolves
// to the phone itself, not the dev machine -- honoring localBaseUrl there
// produced a silent axios "Network Error" that never reproduced from the
// dev machine itself (curl and a local Playwright browser both correctly
// resolve localhost back to the real machine, masking the bug). localBaseUrl
// only makes sense when the browser is ALSO on localhost -- i.e., the
// developer's own machine talking directly to its own local backend.
const useBrowserOrigin = !!(browserOrigin && !isLocalDevHost);
const base44ServerUrl = useBrowserOrigin ? browserOrigin : (localBaseUrl || platformServerUrl);
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
const appBaseUrl = useBrowserOrigin ? browserOrigin : (localBaseUrl || browserOrigin || base44ServerUrl);

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
