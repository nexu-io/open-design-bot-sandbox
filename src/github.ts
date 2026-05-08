import { Octokit } from "@octokit/core";

export interface GitHubEnv {
  GH_APP_ID: string;
  GH_APP_INSTALLATION_ID: string;
  GH_APP_PRIVATE_KEY: string;
  GH_REPO_OWNER: string;
  GH_REPO_NAME: string;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(cleaned);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function pkcs1ToPkcs8(pkcs1: ArrayBuffer): ArrayBuffer {
  const prefix = new Uint8Array([
    0x30, 0x82, 0x00, 0x00, 0x02, 0x01, 0x00, 0x30, 0x0d, 0x06, 0x09, 0x2a,
    0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00, 0x04, 0x82,
    0x00, 0x00,
  ]);
  const body = new Uint8Array(pkcs1);
  prefix[2] = ((body.length + 22) >> 8) & 0xff;
  prefix[3] = (body.length + 22) & 0xff;
  prefix[24] = (body.length >> 8) & 0xff;
  prefix[25] = body.length & 0xff;
  const out = new Uint8Array(prefix.length + body.length);
  out.set(prefix, 0);
  out.set(body, prefix.length);
  return out.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const isPkcs8 = pem.includes("BEGIN PRIVATE KEY");
  const raw = pemToArrayBuffer(pem);
  const pkcs8 = isPkcs8 ? raw : pkcs1ToPkcs8(raw);
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function b64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function signAppJWT(appId: string, key: CryptoKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
  );
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(sig)}`;
}

interface InstallationToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, InstallationToken>();

async function getInstallationToken(env: GitHubEnv): Promise<string> {
  const cached = tokenCache.get(env.GH_APP_INSTALLATION_ID);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const key = await importPrivateKey(env.GH_APP_PRIVATE_KEY);
  const jwt = await signAppJWT(env.GH_APP_ID, key);

  const r = await fetch(
    `https://api.github.com/app/installations/${env.GH_APP_INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "open-design-bot",
      },
    },
  );

  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Installation token fetch failed: ${r.status} ${body}`);
  }

  const data = (await r.json()) as { token: string; expires_at: string };
  const exp = Math.floor(new Date(data.expires_at).getTime() / 1000);
  tokenCache.set(env.GH_APP_INSTALLATION_ID, { token: data.token, expiresAt: exp });
  return data.token;
}

export async function getOctokit(env: GitHubEnv): Promise<Octokit> {
  const token = await getInstallationToken(env);
  return new Octokit({
    auth: token,
    userAgent: "open-design-bot",
  });
}

export async function getRepo(env: GitHubEnv) {
  const octokit = await getOctokit(env);
  return octokit.request("GET /repos/{owner}/{repo}", {
    owner: env.GH_REPO_OWNER,
    repo: env.GH_REPO_NAME,
  });
}
