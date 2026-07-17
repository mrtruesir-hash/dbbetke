/**
 * DBBet Kenya — Cloudflare Worker
 *
 * Serves the static site (via the ASSETS binding) and adds a small server-side
 * proxy at /api/odds that talks to the bookmaker Marketing API.
 *
 * Why a proxy: the Marketing API uses OAuth2 client-credentials. The
 * client_id / client_secret must NEVER reach the browser, so all API calls
 * happen here, server-side, using secrets configured in the Cloudflare
 * dashboard. The browser only ever sees clean, public odds JSON.
 *
 * Required secrets (Workers → dbbetke → Settings → Variables and Secrets):
 *   MARKETING_CLIENT_ID       OAuth2 client id
 *   MARKETING_CLIENT_SECRET   OAuth2 client secret
 *   MARKETING_REF             Partner ID (integer), required on every request
 * Optional:
 *   MARKETING_GR              Partner group (integer)
 *   MARKETING_SPORT_IDS       Comma list of sport ids to include (e.g. "1,2,3")
 *   MARKETING_LANG            Language code (default "en")
 *   MARKETING_COUNT           Max events per feed (default "20")
 */

const API_BASE = "https://cpservm.com/gateway/marketing";
const TOKEN_URL = "https://cpservm.com/gateway/token";
const PREMATCH_PATH = "/datafeed/prematch/api/v2/sportevents";
const LIVE_PATH = "/datafeed/live/api/v2/sportevents";

// Cache the odds payload this long (API allows 1 identical request / 20s).
const ODDS_TTL_SECONDS = 45;

// Module-scope token cache (per isolate). { token, expEpochMs }
let tokenCache = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/odds") {
      return handleOdds(request, url, env, ctx);
    }

    // Everything else → static assets (index.html, css, images, …).
    return env.ASSETS.fetch(request);
  },
};

/* ----------------------------- OAuth2 token ----------------------------- */

async function getAccessToken(env) {
  const now = Date.now();
  if (tokenCache && tokenCache.expEpochMs - 60_000 > now) {
    return tokenCache.token;
  }

  const clientId = env.MARKETING_CLIENT_ID;
  const clientSecret = env.MARKETING_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ApiError("not_configured", 503,
      "MARKETING_CLIENT_ID / MARKETING_CLIENT_SECRET secret is not set");
  }

  const body = new URLSearchParams({ grant_type: "client_credentials" });

  // Try client_secret_post first (credentials in the body).
  let res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ ...Object.fromEntries(body), client_id: clientId, client_secret: clientSecret }),
  });

  // Fall back to HTTP Basic (client_secret_basic) if the server rejects it.
  if (res.status === 400 || res.status === 401) {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
      },
      body,
    });
  }

  if (!res.ok) {
    const text = await safeText(res);
    throw new ApiError("token_failed", 502, `Token endpoint ${res.status}: ${text}`);
  }

  const data = await res.json();
  const token = data.access_token;
  const expiresInSec = Number(data.expires_in) || 300;
  if (!token) throw new ApiError("token_failed", 502, "No access_token in token response");

  tokenCache = { token, expEpochMs: now + expiresInSec * 1000 };
  return token;
}

/* ------------------------------ /api/odds ------------------------------ */

async function handleOdds(request, url, env, ctx) {
  // Serve from the edge cache when fresh (respects the upstream rate limit).
  const cache = caches.default;
  const cacheKey = new Request(new URL("/api/odds" + url.search, url.origin), { method: "GET" });
  if (!url.searchParams.has("nocache")) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }

  let payload, status = 200;
  try {
    const token = await getAccessToken(env);

    // Debug: /api/odds?raw=1&feed=live|prematch returns the upstream JSON verbatim.
    if (url.searchParams.get("raw") === "1") {
      const feed = url.searchParams.get("feed") === "prematch" ? PREMATCH_PATH : LIVE_PATH;
      const upstream = await callFeed(feed, token, env, url);
      payload = upstream;
    } else {
      const [live, prematch] = await Promise.all([
        callFeed(LIVE_PATH, token, env, url).catch((e) => ({ error: String(e.message || e) })),
        callFeed(PREMATCH_PATH, token, env, url).catch((e) => ({ error: String(e.message || e) })),
      ]);
      payload = { ok: true, updatedAt: new Date().toISOString(), live, prematch };
    }
  } catch (err) {
    status = err instanceof ApiError ? err.status : 500;
    payload = { ok: false, error: err.code || "error", message: String(err.message || err) };
  }

  const res = jsonResponse(payload, status);
  if (status === 200) ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}

// Build and execute one feed request (live or prematch).
async function callFeed(path, token, env, url) {
  const ref = env.MARKETING_REF;
  if (!ref) throw new ApiError("not_configured", 503, "MARKETING_REF secret is not set");

  const qs = new URLSearchParams();
  qs.set("ref", ref);
  qs.set("lng", env.MARKETING_LANG || "en");
  qs.set("count", env.MARKETING_COUNT || "20");
  // Just the main Home/Draw/Away odds for a clean widget.
  qs.set("schemeOfGettingOddsOperations", "Get1X2Odds");
  if (env.MARKETING_GR) qs.set("gr", env.MARKETING_GR);

  // Sport filter: ?sports=1,2 overrides the MARKETING_SPORT_IDS default.
  const sports = url.searchParams.get("sports") || env.MARKETING_SPORT_IDS || "";
  for (const id of sports.split(",").map((s) => s.trim()).filter(Boolean)) {
    qs.append("sportIds", id);
  }

  const res = await fetch(`${API_BASE}${path}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new ApiError("upstream_" + res.status, res.status === 403 ? 403 : 502,
      `${path} → ${res.status}: ${await safeText(res)}`);
  }
  return res.json();
}

/* ------------------------------ helpers ------------------------------ */

class ApiError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${ODDS_TTL_SECONDS}`,
    },
  });
}

async function safeText(res) {
  try { return (await res.text()).slice(0, 300); } catch { return "<no body>"; }
}
