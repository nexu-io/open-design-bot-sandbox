/**
 * Find PRs by users matching "qiongyu" in nexu-io/open-design.
 * Used to pick a safe target PR for end-to-end test.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { App } from "octokit";

function loadDevVars(path: string): Record<string, string> {
  if (!existsSync(path)) {
    console.error(`Missing ${path}.`);
    process.exit(1);
  }
  const out: Record<string, string> = {};
  let buffer = "", currentKey: string | null = null, inMultiline = false;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (inMultiline) {
      if (line.endsWith('"') && !line.endsWith('\\"')) {
        buffer += line.slice(0, -1);
        out[currentKey!] = buffer;
        currentKey = null; buffer = ""; inMultiline = false;
      } else { buffer += line + "\n"; }
      continue;
    }
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"(.*)$/);
    if (!m) continue;
    const [, key, rest] = m as unknown as [string, string, string];
    if (rest.endsWith('"') && !rest.endsWith('\\"')) out[key] = rest.slice(0, -1);
    else { currentKey = key; buffer = rest + "\n"; inMultiline = true; }
  }
  return out;
}

async function main() {
  const vars = loadDevVars(join(process.cwd(), ".dev.vars"));
  const app = new App({ appId: vars.GH_APP_ID!, privateKey: vars.GH_APP_PRIVATE_KEY! });
  const octokit = await app.getInstallationOctokit(Number(vars.GH_APP_INSTALLATION_ID));

  console.log("\n🔍 Searching nexu-io/open-design for PRs by users matching 'qiongyu'...\n");

  // Search for PRs by qiongyu* authors
  const searchQ = `repo:nexu-io/open-design is:pr author:qiongyu`;

  try {
    const r = await octokit.request("GET /search/issues", { q: searchQ, per_page: 30 });
    if (r.data.total_count === 0) {
      console.log("   ⚠️  No PRs found from author exactly named 'qiongyu'.");
      console.log("   Trying broader search across recent PR authors...\n");
    } else {
      console.log(`   Found ${r.data.total_count} PR(s) by exact 'qiongyu':\n`);
      for (const pr of r.data.items) {
        console.log(`   #${pr.number}  [${pr.state}${(pr as { pull_request?: { merged_at?: string } }).pull_request?.merged_at ? "·merged" : ""}]  @${pr.user?.login} — ${pr.title}`);
        console.log(`            ${pr.html_url}`);
      }
      return;
    }
  } catch (err) {
    console.log("   Search failed, falling back to scanning recent PRs...\n");
  }

  // Fallback: list recent PRs and grep authors containing 'qiongyu'
  const list = await octokit.rest.pulls.list({
    owner: "nexu-io",
    repo: "open-design",
    state: "all",
    sort: "created",
    direction: "desc",
    per_page: 100,
  });
  const matches = list.data.filter((p) => p.user?.login.toLowerCase().includes("qiongyu"));
  if (matches.length === 0) {
    console.log("   ❌ No 'qiongyu*' authors in last 100 PRs.");
    console.log("\n   👉 Tell me the exact GitHub username (e.g. qiongyu1999, qiongyu-xx) and I'll target that.\n");
    console.log("   Or list latest 10 PR authors as candidates:\n");
    const seen = new Set<string>();
    let n = 0;
    for (const p of list.data) {
      if (!p.user || seen.has(p.user.login)) continue;
      seen.add(p.user.login);
      console.log(`     - @${p.user.login}  (PR #${p.number})`);
      if (++n >= 10) break;
    }
  } else {
    console.log(`   ✅ Found ${matches.length} PR(s) by users matching 'qiongyu*':\n`);
    for (const p of matches) {
      console.log(`   #${p.number}  [${p.state}${p.merged_at ? "·merged" : ""}]  @${p.user?.login} — ${p.title}`);
      console.log(`            ${p.html_url}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
