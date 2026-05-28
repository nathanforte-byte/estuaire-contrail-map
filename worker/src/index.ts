/**
 * Estuaire — OpenSky proxy on Cloudflare Workers.
 *
 * OpenSky blacklists most cloud-provider egress IPs (GCP, AWS-East confirmed at
 * the application layer: TCP SYN with no response). Cloudflare's edge has its
 * own ASN and reaches the OpenSky servers cleanly.
 *
 * Endpoints:
 *   GET /states/all?lamin=&lomin=&lamax=&lomax=    → forwards to OpenSky with Bearer auth
 *   GET /health                                     → liveness
 *
 * Optional protection: set PROXY_KEY as a secret; clients must send
 * `x-proxy-key: <value>` on every request. This stops randos from spending
 * our OpenSky daily credit budget.
 */

interface Env {
  OPENSKY_CLIENT_ID: string;
  OPENSKY_CLIENT_SECRET: string;
  PROXY_KEY?: string;
}

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const OPENSKY_BASE = 'https://opensky-network.org/api';
const TOKEN_REFRESH_MARGIN_S = 30;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function fetchToken(env: Env): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.OPENSKY_CLIENT_ID,
    client_secret: env.OPENSKY_CLIENT_SECRET,
  });
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`OpenSky auth ${r.status}: ${text.slice(0, 200)}`);
  }
  const data = (await r.json()) as { access_token: string; expires_in?: number };
  const expiresIn = data.expires_in ?? 1800;
  cachedToken = {
    value: data.access_token,
    expiresAt: now + Math.max(expiresIn - TOKEN_REFRESH_MARGIN_S, 60) * 1000,
  };
  return cachedToken.value;
}

async function proxyStates(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const upstream = new URL(`${OPENSKY_BASE}/states/all`);
  // Whitelist only the bbox params we expect, to keep the proxy boring.
  for (const k of ['lamin', 'lomin', 'lamax', 'lomax', 'time', 'icao24', 'extended']) {
    const vs = url.searchParams.getAll(k);
    for (const v of vs) upstream.searchParams.append(k, v);
  }

  let token = await fetchToken(env);
  let r = await fetch(upstream.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  // If the token just expired, force a refresh and retry once.
  if (r.status === 401) {
    cachedToken = null;
    token = await fetchToken(env);
    r = await fetch(upstream.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  // Pass through the response, forcing JSON content-type and a small cache hint.
  const headers = new Headers();
  headers.set('content-type', 'application/json; charset=utf-8');
  // Echo OpenSky's rate-limit headers for visibility.
  for (const h of ['x-rate-limit-remaining', 'x-rate-limit-retry-after-seconds']) {
    const v = r.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(r.body, { status: r.status, headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'estuaire-opensky-proxy' });
    }

    if (url.pathname === '/debug') {
      // Test reachability from CF egress to OpenSky + a control.
      const results: Record<string, any> = {};
      for (const [name, target] of [
        ['opensky_root', 'https://opensky-network.org/api/states/all?lamin=46&lomin=6&lamax=47&lomax=7'],
        ['opensky_auth', 'https://auth.opensky-network.org/auth/realms/opensky-network/.well-known/openid-configuration'],
        ['control_cf', 'https://www.cloudflare.com/cdn-cgi/trace'],
        ['control_google', 'https://www.google.com/generate_204'],
      ]) {
        const t0 = Date.now();
        try {
          const r = await fetch(target, { method: 'GET' });
          results[name] = { status: r.status, ms: Date.now() - t0 };
        } catch (e) {
          results[name] = { error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
        }
      }
      return Response.json(results);
    }

    if (url.pathname !== '/states/all') {
      return new Response('Not found', { status: 404 });
    }

    if (env.PROXY_KEY) {
      const provided = req.headers.get('x-proxy-key');
      if (provided !== env.PROXY_KEY) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    try {
      return await proxyStates(req, env);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return Response.json({ error: msg }, { status: 502 });
    }
  },
};
