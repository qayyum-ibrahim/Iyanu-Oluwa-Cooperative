// The Vite dev server forwards /api calls to the API server, so the API needs
// no CORS code (A-191). The API routes have no /api prefix, so it is removed.
// Form taken from https://vite.dev/config/server-options (server.proxy).

export const API_PREFIX = "/api";
export const DEFAULT_API_TARGET = "http://localhost:3000";

export function stripApiPrefix(path: string): string {
  return path.replace(/^\/api(?=\/|\?|$)/, "") || "/";
}

export function apiProxy(target: string = DEFAULT_API_TARGET) {
  return {
    [API_PREFIX]: {
      target,
      changeOrigin: true,
      rewrite: stripApiPrefix,
    },
  };
}
