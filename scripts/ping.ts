/**
 * Verify the GitHub App credentials work.
 *
 * Usage:
 *   1. Copy .dev.vars.example to .dev.vars and fill in real values
 *   2. pnpm ping
 *
 * Exit code 0 = bot can talk to nexu-io/open-design as the App.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { App } from "octokit";

function loadDevVars(path: string): Record<string, string> {
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Copy .dev.vars.example and fill it in.`);
    process.exit(1);
  }
  const out: Record<string, string> = {};
  let buffer = "";
  let currentKey: string | null = null;
  let inMultiline = false;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (inMultiline) {
      if (line.endsWith('"') && !line.endsWith('\\"')) {
        buffer += line.slice(0, -1);
        out[currentKey!] = buffer;
        currentKey = null;
        buffer = "";
        inMultiline = false;
      } else {
        buffer += line + "\n";
      }
      continue;
    }
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"(.*)$/);
    if (!m) continue;
    const [, key, rest] = m as unknown as [string, string, string];
    if (rest.endsWith('"') && !rest.endsWith('\\"')) {
      out[key] = rest.slice(0, -1);
    } else {
      currentKey = key;
      buffer = rest + "\n";
      inMultiline = true;
    }
  }
  return out;
}

async function main() {
  const vars = loadDevVars(join(process.cwd(), ".dev.vars"));
  const required = ["GH_APP_ID", "GH_APP_INSTALLATION_ID", "GH_APP_PRIVATE_KEY"];
  for (const k of required) {
    if (!vars[k]) {
      console.error(`Missing ${k} in .dev.vars`);
      process.exit(1);
    }
  }

  const app = new App({
    appId: vars.GH_APP_ID!,
    privateKey: vars.GH_APP_PRIVATE_KEY!,
  });

  const octokit = await app.getInstallationOctokit(
    Number(vars.GH_APP_INSTALLATION_ID),
  );

  const { data } = await octokit.rest.repos.get({
    owner: "nexu-io",
    repo: "open-design",
  });

  console.log("");
  console.log("✅ GitHub App credentials work!");
  console.log("");
  console.log(`  Repo:     ${data.full_name}`);
  console.log(`  Stars:    ${data.stargazers_count.toLocaleString()}`);
  console.log(`  Forks:    ${data.forks_count.toLocaleString()}`);
  console.log(`  Issues:   ${data.open_issues_count}`);
  console.log(`  Default:  ${data.default_branch}`);
  console.log("");
}

main().catch((err) => {
  console.error("");
  console.error("❌ Verification failed:");
  console.error("");
  console.error(err);
  process.exit(1);
});
