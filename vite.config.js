import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Last-resort net for the one error class below. A real iPhone (standalone
// Safari webview) resets TCP connections abruptly, and Node re-emits that as
// an 'error' on the raw accepted socket. If nothing is listening on that
// specific socket, it becomes an uncaughtException and kills the whole Vite
// process -- which is exactly how a phone opening the app took the dev/preview
// server down ("Error: read ECONNRESET ... exited with code 1"), leaving the
// owner unable to log in. The per-socket handler in hardenSockets() catches
// almost all of these; this guard is a narrow backstop that swallows ONLY
// ECONNRESET and re-throws everything else so real bugs still surface.
process.on('uncaughtException', (err) => {
  if (err && err.code === 'ECONNRESET') return;
  throw err;
});

// Attach an 'error' listener to every accepted socket so a client-side reset
// (a phone dropping a keep-alive or aborting an asset/request mid-flight)
// can't bubble up as an unhandled error and crash the server. This is the
// real fix -- the earlier proxy-only handler only covered resets on proxied
// /api requests, not resets on the base HTTP server's own sockets (static
// assets, navigations, keep-alives), which is what a real iPhone actually
// triggered against `vite preview`.
function hardenSockets(httpServer) {
  if (!httpServer) return;
  httpServer.on('connection', (socket) => { socket.on('error', () => {}); });
  httpServer.on('clientError', (_err, socket) => { try { socket.destroy(); } catch { /* already gone */ } });
}

const hardenSocketsPlugin = {
  name: 'magpie-harden-sockets',
  configureServer(server) { hardenSockets(server.httpServer); },
  configurePreviewServer(server) { hardenSockets(server.httpServer); },
};

export default defineConfig({
  plugins: [react(), hardenSocketsPlugin],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Lets a phone on the same Tailscale/LAN network reach this dev server --
    // `npx base44 dev` itself only ever binds 127.0.0.1 with no flag to
    // change that, so /api is proxied to it instead of trying to make the
    // backend directly reachable. With VITE_BASE44_APP_BASE_URL unset,
    // src/api/base44Client.js already falls back to same-origin
    // (browserOrigin) for any non-localhost origin -- the exact case this
    // proxy exists to serve, no env var needed.
    host: true,
    allowedHosts: true,
    proxy: apiProxy(),
  },
  // Used by `npm run preview` (serves the production build). Preferred path
  // for real-device testing: a production build has no HMR websocket, one
  // fewer fragile connection for a phone to reset. Socket resets are handled
  // by hardenSocketsPlugin above regardless.
  preview: {
    host: true,
    allowedHosts: true,
    proxy: apiProxy(),
  },
});

// One /api -> local base44 backend proxy, shared by dev and preview.
function apiProxy() {
  return {
    '/api': {
      // `npx base44 dev` picks its backend port non-deterministically
      // (seen on 4400 and 4491) -- MAGPIE_BACKEND_URL lets the person
      // starting the server point the proxy at whatever it actually chose
      // without editing this file (and triggering a fragile Vite restart).
      target: process.env.MAGPIE_BACKEND_URL || 'http://127.0.0.1:4400',
      changeOrigin: true,
      // Covers resets that happen specifically on a proxied request; the
      // socket-level handler in hardenSockets() covers everything else.
      configure: (proxy) => { proxy.on('error', () => {}); },
    },
  };
}
