const STORAGE_KEY = "semantica_api_key";
const URL_PARAM_KEYS = ["api_key", "x_api_key", "semantica_api_key"] as const;

function readApiKeyFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    for (const key of URL_PARAM_KEYS) {
      const value = params.get(key);
      if (value && value.trim()) {
        return value.trim();
      }
    }
  } catch {
    // Ignore URL parsing issues and fall back to storage.
  }
  return null;
}

function persistApiKey(apiKey: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, apiKey);
  } catch {
    // Ignore storage failures (private mode, policy, etc.).
  }

  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `semantica_api_key=${encodeURIComponent(apiKey)}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // Ignore cookie write failures.
  }
}

function readStoredApiKey(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function cleanApiKeyFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    let mutated = false;
    for (const key of URL_PARAM_KEYS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        mutated = true;
      }
    }
    if (mutated) {
      window.history.replaceState({}, document.title, url.toString());
    }
  } catch {
    // Ignore history/URL manipulation failures.
  }
}

export function getExplorerApiKey(): string | null {
  const urlKey = readApiKeyFromUrl();
  if (urlKey) {
    persistApiKey(urlKey);
    cleanApiKeyFromUrl();
    return urlKey;
  }
  return readStoredApiKey();
}

function shouldAttachApiKey(input: RequestInfo | URL): boolean {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return raw.startsWith("/api/") || raw.startsWith(`${window.location.origin}/api/`);
}

function withApiKeyHeader(init: RequestInit | undefined, apiKey: string): RequestInit {
  const headers = new Headers(init?.headers ?? undefined);
  headers.set("X-API-Key", apiKey);
  return { ...init, headers };
}

function installFetchAuth(apiKey: string): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!shouldAttachApiKey(input)) {
      return originalFetch(input, init);
    }
    return originalFetch(input, withApiKeyHeader(init, apiKey));
  };
}

function installWebSocketAuth(apiKey: string): void {
  const NativeWebSocket = window.WebSocket;
  class AuthWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const parsed = new URL(url.toString(), window.location.href);
      if (parsed.pathname.startsWith("/ws/")) {
        parsed.searchParams.set("api_key", apiKey);
      }
      super(parsed.toString(), protocols);
    }
  }
  Object.defineProperty(AuthWebSocket, "name", { value: "WebSocket" });
  window.WebSocket = AuthWebSocket;
}

export function installExplorerAuth(): void {
  const apiKey = getExplorerApiKey();
  if (!apiKey) {
    return;
  }
  installFetchAuth(apiKey);
  installWebSocketAuth(apiKey);
}
