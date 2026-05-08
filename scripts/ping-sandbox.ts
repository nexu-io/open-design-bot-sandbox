/**
 * Verify the GitHub App can access nexu-io/open-design-bot-sandbox.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { App } from "octokit";

function loadDevVars(path: string): Record<string, string> {
  if (!existsSync(path)) { console.error(`Missing ${path}`); process.exit(1); }
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

  const r = await octokit.rest.repos.get({
    owner: "nexu-io",
    repo: "open-design-bot-sandbox",
  });
  console.log("✅ App can access sandbox repo:");
  console.log(`   ${r.data.full_name}  (id ${r.data.id}, private=${r.data.private})`);

  const installation = await octokit.rest.apps.getRepoInstallation({
    owner: "nexu-io",
    repo: "open-design-bot-sandbox",
  });
  console.log(`   Installation #${installation.data.id} — permissions:`);
  for (const [k, v] of Object.entries(installation.data.permissions)) {
    console.log(`     ${k}: ${v}`);
  }
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
