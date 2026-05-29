/**
 * Estuaire — GitHub Actions dispatcher (Cloudflare Worker cron).
 *
 * Why this exists: GitHub Actions' own scheduled cron is unreliable on free
 * public repos — a 5-minute schedule regularly skips ticks and ends up firing
 * every 2-4 hours under load. The Estuaire pipeline depends on a real
 * 5-minute cadence to build readable flight trajectories, so we use a
 * Cloudflare Workers cron (which DOES fire reliably) to manually dispatch
 * the workflow via the GitHub API.
 *
 * Schedule: every 5 minutes — see `wrangler.jsonc`.
 *
 * Secrets required:
 *   GH_PAT — GitHub personal access token with `repo` + `workflow` scopes,
 *            classic or fine-grained with Actions write on this repo.
 */

interface Env {
  GH_PAT: string;
}

const REPO = "nathanforte-byte/estuaire-contrail-map";
const WORKFLOW_FILE = "fetch-opensky.yml";
const REF = "main";

async function dispatch(env: Env): Promise<{ ok: boolean; status: number; body?: string }> {
  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GH_PAT}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "estuaire-cron-dispatcher",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: REF }),
  });
  if (r.status === 204) {
    return { ok: true, status: 204 };
  }
  const body = await r.text();
  return { ok: false, status: r.status, body: body.slice(0, 400) };
}

export default {
  // Runs on the cron schedule defined in wrangler.jsonc.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      dispatch(env).then((res) => {
        if (res.ok) {
          console.log(`[cron] dispatched ${WORKFLOW_FILE} (204)`);
        } else {
          console.error(`[cron] dispatch failed ${res.status}: ${res.body}`);
        }
      }),
    );
  },

  // Manual trigger / liveness probe. Useful while debugging.
  //   GET /          → status text
  //   POST /trigger  → forces a dispatch now (no auth — only the URL is the secret)
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/trigger") {
      const res = await dispatch(env);
      return Response.json(res, { status: res.ok ? 200 : 502 });
    }
    return new Response(
      "estuaire-cron-dispatcher · POST /trigger to fire now · cron every 5 min",
      { status: 200, headers: { "content-type": "text/plain" } },
    );
  },
};
