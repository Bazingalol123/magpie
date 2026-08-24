import { assert } from "jsr:@std/assert@1";

Deno.test("production Base44 client uses the deployed app's own origin for API calls (not the shared platform host) and for auth redirects", async () => {
  const source = await Deno.readTextFile(new URL("../src/api/base44Client.js", import.meta.url));
  // Base44 hard-rejects base44.functions.invoke() (POST
  // /api/apps/{appId}/functions/*) made against the shared platform domain
  // once an app has a connected custom/app domain (403 "Backend functions
  // cannot be accessed from the platform domain."). serverUrl must be the
  // deployed app's own browser origin in production, falling back to the
  // platform host only for local dev on localhost with no sandbox configured.
  assert(source.includes("const base44ServerUrl = localBaseUrl || (browserOrigin && !isLocalDevHost ? browserOrigin : platformServerUrl);"));
  assert(source.includes("serverUrl: base44ServerUrl"));
  // appBaseUrl (used for login/logout full-page redirects) must be the
  // public app origin, not the API host: logout's server endpoint only
  // honors from_url when the request itself hits that domain.
  assert(source.includes("const appBaseUrl = localBaseUrl || browserOrigin || base44ServerUrl;"));
  assert(source.includes("appBaseUrl,"));
  const app = await Deno.readTextFile(new URL("../src/App.jsx", import.meta.url));
  assert(app.includes('base44.auth.loginWithProvider("google", shareRedirectPath)'));
  assert(!app.includes("base44.auth.redirectToLogin"));
});

Deno.test("a dedicated /login page is wired up, not a direct provider redirect from Landing", async () => {
  const app = await Deno.readTextFile(new URL("../src/App.jsx", import.meta.url));
  assert(app.includes('import LoginPage from "./LoginPage.jsx";'));
  assert(app.includes('const isLoginRoute = window.location.pathname === "/login";'));
  assert(app.includes("<LoginPage onBack={closeLogin} onAuthenticated={handleAuthenticated} redirectPath=\"/\" />"));
  assert(app.includes('window.history.pushState({}, "", "/login");'));
  const login = await Deno.readTextFile(new URL("../src/LoginPage.jsx", import.meta.url));
  assert(login.includes("base44.auth.loginViaEmailPassword"));
  assert(login.includes('autoComplete="given-name"'));
  assert(login.includes('autoComplete="family-name"'));
  assert(login.includes("base44.auth.updateMe({ full_name: fullName })"));
  assert(login.includes("onAuthenticated(authenticatedUser, redirectPath)"));
  assert(login.includes('handleProvider("google")'));
  assert(login.includes('handleProvider("apple")'));
});
