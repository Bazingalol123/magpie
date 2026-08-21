import { assert } from "jsr:@std/assert@1";

Deno.test("production Base44 client uses the app API host for API calls and the public origin for auth redirects", async () => {
  const source = await Deno.readTextFile(new URL("../src/api/base44Client.js", import.meta.url));
  assert(source.includes("const base44ServerUrl = localBaseUrl || 'https://app.base44.com';"));
  assert(source.includes("serverUrl: base44ServerUrl"));
  // appBaseUrl (used for login/logout full-page redirects) must be the
  // public app origin, not the API host: logout's server endpoint only
  // honors from_url when the request itself hits that domain.
  assert(source.includes("const appBaseUrl = localBaseUrl || (typeof window !== 'undefined' ? window.location.origin : base44ServerUrl);"));
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
  assert(login.includes('handleProvider("google")'));
  assert(login.includes('handleProvider("apple")'));
});
