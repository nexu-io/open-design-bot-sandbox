import { Hono } from "hono";
import { Webhooks } from "@octokit/webhooks";

import { getOctokit, type GitHubEnv } from "./github.ts";
import {
  handlePullRequestClosed,
  handleWatchStarred,
  handleIssueOpened,
  type WebhookEnv,
} from "./webhook.ts";

interface Env extends GitHubEnv, WebhookEnv {
  GH_WEBHOOK_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("open-design-bot · alive\n"));

app.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));

app.post("/webhook", async (c) => {
  const env = c.env;
  const body = await c.req.text();
  const sig = c.req.header("x-hub-signature-256") ?? "";
  const event = c.req.header("x-github-event") ?? "";
  const deliveryId = c.req.header("x-github-delivery") ?? "";

  const webhooks = new Webhooks({ secret: env.GH_WEBHOOK_SECRET });
  const valid = await webhooks.verify(body, sig);
  if (!valid) return c.json({ error: "invalid signature" }, 401);

  const payload = JSON.parse(body);

  try {
    if (event === "pull_request" && payload.action === "closed") {
      const octokit = await getOctokit(env);
      await handlePullRequestClosed(octokit, env, payload);
    } else if (event === "watch" && payload.action === "started") {
      const octokit = await getOctokit(env);
      await handleWatchStarred(octokit, env, payload);
    } else if (event === "issues" && payload.action === "opened") {
      const octokit = await getOctokit(env);
      await handleIssueOpened(octokit, env, payload);
    }
    return c.json({ ok: true, event, deliveryId });
  } catch (err) {
    console.error("webhook handler failed", err);
    return c.json({ error: "handler failed", message: String(err) }, 500);
  }
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    const octokit = await getOctokit(env);
    const r = await octokit.request("GET /repos/{owner}/{repo}", {
      owner: env.GH_REPO_OWNER,
      repo: env.GH_REPO_NAME,
    });
    console.log(
      `[cron] daily heartbeat · ${r.data.full_name} · ${r.data.stargazers_count} stars`,
    );
  },
};
