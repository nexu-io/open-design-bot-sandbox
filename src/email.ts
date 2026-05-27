import type { CardProps } from "./cards/types.ts";
import { tierFromPoints, type TierDef } from "./tier.ts";
import { fuzzyContributorCount } from "./rank.ts";
import { xShareUrl } from "./share.ts";

export interface ResendEnv {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

export interface CardEmail {
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Thin wrapper around the Resend HTTP API
 * (https://resend.com/docs/api-reference/emails/send-email).
 *
 * No SDK dependency — Resend is a single POST so we use fetch directly,
 * which keeps the Cloudflare Workers bundle small and avoids the polyfills
 * the official SDK pulls in.
 *
 * Returns `{ ok: false, skipped: true }` when the API key or from-address
 * is not configured, so callers can degrade gracefully (the card comment
 * still posts even if the email channel is offline).
 */
export async function sendEmailViaResend(
  env: ResendEnv,
  params: SendEmailParams,
): Promise<SendEmailResult> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.log(
      `[email] resend not configured — skipping email send`,
    );
    return { ok: false, skipped: true, error: "resend not configured" };
  }

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      reply_to: params.replyTo,
      tags: params.tags,
    }),
  });

  if (!r.ok) {
    await r.text().catch(() => "");
    console.error(`[email] resend send failed: ${r.status}`);
    return { ok: false, error: `resend status ${r.status}` };
  }

  const data = (await r.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: data.id };
}

interface TierUpRenderArgs {
  card: CardProps;
  tier: TierDef;
  cardImageUrl: string;
  commentUrl: string;
  xUrlEn: string;
  xUrlCn: string;
  fuzzyCount: string;
}

interface SparkRenderArgs {
  card: CardProps;
  cardImageUrl: string;
  commentUrl: string;
  xUrlEn: string;
  xUrlCn: string;
}

export function tierUpEmail(
  card: CardProps,
  cardImageUrl: string,
  commentUrl: string,
  eventId: string,
): CardEmail {
  const tier = tierFromPoints(card.points);
  const xUrlEn = xShareUrl(card, "en", eventId);
  const xUrlCn = xShareUrl(card, "cn", eventId);
  const fuzzyCount = fuzzyContributorCount(card.totalContributors);

  const subject = `🎉 Congratulations, @${card.username} — you just unlocked another level on Open Design`;

  const text = [
    `Hi @${card.username},`,
    ``,
    `Congratulations — you just unlocked another level on Open Design.`,
    ``,
    `What you've been doing matters. Open source is built one merged PR, one`,
    `review, one careful issue at a time. You've quietly become one of the`,
    `people doing that for Open Design.`,
    ``,
    `Your card is attached below. It's a small thing, but it captures where`,
    `you stand in this project right now:`,
    `  · Ranked #${card.rank.toLocaleString()} among ${fuzzyCount} contributors`,
    `  · ${card.prsMerged} merged PRs · ${card.discussionsAnswered} discussions · ${card.issuesAccepted} issues`,
    `  · ${card.points.toLocaleString()} contribution points`,
    ``,
    `[card]`,
    ``,
    `The card above is yours to keep — feel free to share it on X if you want,`,
    `or just keep going. Either way, we're really glad you're here.`,
    ``,
    `Keep building.`,
    ``,
    `— Open Design`,
    ``,
    `View the card on GitHub: ${commentUrl}`,
    `Share on X (English):    ${xUrlEn}`,
    `分享到 X (中文):          ${xUrlCn}`,
    ``,
    `You're receiving this because @${card.username} contributed to nexu-io/open-design.`,
    `Opt out anytime by adding the .no-bot label to a PR or replying to this email.`,
  ].join("\n");

  const html = renderTierUpHtml({
    card,
    tier,
    cardImageUrl,
    commentUrl,
    xUrlEn,
    xUrlCn,
    fuzzyCount,
  });

  return { subject, html, text };
}

export function welcomeSparkEmail(
  card: CardProps,
  cardImageUrl: string,
  commentUrl: string,
  eventId: string,
): CardEmail {
  const xUrlEn = xShareUrl(card, "en", eventId);
  const xUrlCn = xShareUrl(card, "cn", eventId);

  const subject = `✨ Welcome to Open Design, @${card.username}`;

  const text = [
    `Hi @${card.username},`,
    ``,
    `Welcome to Open Design.`,
    ``,
    `You just made your first contribution — small or large, it counts, and it`,
    `now lives in the project's history. Most people who land on an open source`,
    `repo never write a single line in it. You did.`,
    ``,
    `Open Design is an open-source, local-first AI design workspace. It exists`,
    `because people like you decided to show up. That's the entire engine.`,
    ``,
    `The first time is always the hardest part. You're past it now.`,
    ``,
    `Your welcome card is attached below — it's yours to keep.`,
    ``,
    `[card]`,
    ``,
    `Share it if you want. We're really glad you're here.`,
    ``,
    `— Open Design`,
    ``,
    `View the card on GitHub: ${commentUrl}`,
    `Share on X (English):    ${xUrlEn}`,
    `分享到 X (中文):          ${xUrlCn}`,
    ``,
    `You're receiving this because @${card.username} opened an issue on nexu-io/open-design.`,
    `Opt out anytime by replying to this email.`,
  ].join("\n");

  const html = renderSparkHtml({
    card,
    cardImageUrl,
    commentUrl,
    xUrlEn,
    xUrlCn,
  });

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shellHtml(args: {
  preheader: string;
  accent: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Open Design</title>
</head>
<body style="margin:0;padding:0;background:#0b0d10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e6e8eb;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(args.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b0d10;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#11141a;border:1px solid #1f242c;border-radius:14px;overflow:hidden;">
      <tr><td style="height:4px;background:${args.accent};line-height:4px;font-size:0;">&nbsp;</td></tr>
      ${args.body}
      <tr><td style="padding:20px 28px 28px 28px;border-top:1px solid #1f242c;color:#7a828c;font-size:12px;line-height:1.6;">
        <a href="https://github.com/nexu-io/open-design" style="color:#9aa3ad;text-decoration:none;">Open Design</a>
        — open-source, local-first AI design workspace.<br/>
        You're receiving this because of activity on <a href="https://github.com/nexu-io/open-design" style="color:#9aa3ad;">nexu-io/open-design</a>.
        Opt out anytime by adding the <code style="background:#1f242c;padding:1px 6px;border-radius:4px;">.no-bot</code> label to a PR or replying to this email.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function renderTierUpHtml(args: TierUpRenderArgs): string {
  const { card, tier, cardImageUrl, commentUrl, xUrlEn, xUrlCn, fuzzyCount } = args;
  const username = escapeHtml(card.username);
  const body = `
      <tr><td style="padding:36px 32px 8px 32px;">
        <div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${tier.accent};font-weight:700;">
          🎉 Another level unlocked
        </div>
        <h1 style="margin:14px 0 0 0;font-size:28px;line-height:1.25;color:#f4f6f8;font-weight:700;">
          Congratulations, @${username}
        </h1>
        <p style="margin:18px 0 0 0;font-size:16px;line-height:1.7;color:#cdd3da;">
          You just unlocked another level on Open Design.
        </p>
        <p style="margin:14px 0 0 0;font-size:16px;line-height:1.7;color:#cdd3da;">
          What you've been doing matters. Open source is built one merged PR,
          one review, one careful issue at a time. You've quietly become one of
          the people doing that for Open Design.
        </p>
        <p style="margin:14px 0 0 0;font-size:16px;line-height:1.7;color:#cdd3da;">
          The card below is yours to keep — it captures where you stand in this
          project right now.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:28px 32px 8px 32px;">
        <img src="${escapeHtml(cardImageUrl)}" width="540" alt="Open Design contributor card for @${username}" style="display:block;width:100%;max-width:540px;height:auto;border-radius:12px;" />
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.7;color:#cdd3da;">
          <tr><td style="padding:4px 0;color:#9aa3ad;width:14px;">·</td><td style="padding:4px 0 4px 10px;">Ranked <strong style="color:#f4f6f8;">#${card.rank.toLocaleString()}</strong> among <strong style="color:#f4f6f8;">${escapeHtml(fuzzyCount)}</strong> contributors</td></tr>
          <tr><td style="padding:4px 0;color:#9aa3ad;width:14px;">·</td><td style="padding:4px 0 4px 10px;"><strong style="color:#f4f6f8;">${card.prsMerged}</strong> merged PRs · <strong style="color:#f4f6f8;">${card.discussionsAnswered}</strong> discussions · <strong style="color:#f4f6f8;">${card.issuesAccepted}</strong> issues</td></tr>
          <tr><td style="padding:4px 0;color:#9aa3ad;width:14px;">·</td><td style="padding:4px 0 4px 10px;"><strong style="color:#f4f6f8;">${card.points.toLocaleString()}</strong> contribution points</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:22px 32px 0 32px;font-size:16px;line-height:1.7;color:#cdd3da;">
        Feel free to share the card on X if you want, or just keep going.
        Either way, we're really glad you're here.
      </td></tr>
      <tr><td style="padding:18px 32px 0 32px;font-size:16px;line-height:1.7;color:#cdd3da;">
        Keep building.<br/>
        <span style="color:#9aa3ad;">— Open Design</span>
      </td></tr>
      <tr><td style="padding:28px 32px 8px 32px;">
        <a href="${escapeHtml(commentUrl)}" style="display:inline-block;background:${tier.accent};color:#0b0d10;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px;">
          View the card on GitHub →
        </a>
      </td></tr>
      <tr><td style="padding:14px 32px 32px 32px;font-size:13px;line-height:1.7;color:#9aa3ad;">
        Share the moment:
        <a href="${escapeHtml(xUrlEn)}" style="color:${tier.accent};text-decoration:none;">Post on X (English)</a>
        ·
        <a href="${escapeHtml(xUrlCn)}" style="color:${tier.accent};text-decoration:none;">分享到 X（中文）</a>
      </td></tr>`;
  return shellHtml({
    preheader: `Congratulations, @${card.username} — you just unlocked another level on Open Design.`,
    accent: tier.accent,
    body,
  });
}

function renderSparkHtml(args: SparkRenderArgs): string {
  const { card, cardImageUrl, commentUrl, xUrlEn, xUrlCn } = args;
  const accent = "#FCD34D";
  const username = escapeHtml(card.username);
  const body = `
      <tr><td style="padding:36px 32px 8px 32px;">
        <div style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${accent};font-weight:700;">
          ✨ Welcome to Open Design
        </div>
        <h1 style="margin:14px 0 0 0;font-size:28px;line-height:1.25;color:#f4f6f8;font-weight:700;">
          Welcome, @${username}
        </h1>
        <p style="margin:18px 0 0 0;font-size:16px;line-height:1.7;color:#cdd3da;">
          You just made your first contribution. Small or large, it counts —
          and it now lives in the project's history.
        </p>
        <p style="margin:14px 0 0 0;font-size:16px;line-height:1.7;color:#cdd3da;">
          Most people who land on an open source repo never write a single line
          in it. You did.
        </p>
        <p style="margin:14px 0 0 0;font-size:16px;line-height:1.7;color:#cdd3da;">
          Open Design is an open-source, local-first AI design workspace. It
          exists because people like you decided to show up. That's the entire
          engine.
        </p>
        <p style="margin:14px 0 0 0;font-size:16px;line-height:1.7;color:#cdd3da;">
          The first time is always the hardest part. You're past it now. Your
          welcome card is below — it's yours to keep.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:28px 32px 8px 32px;">
        <img src="${escapeHtml(cardImageUrl)}" width="540" alt="Open Design welcome card for @${username}" style="display:block;width:100%;max-width:540px;height:auto;border-radius:12px;" />
      </td></tr>
      <tr><td style="padding:22px 32px 0 32px;font-size:16px;line-height:1.7;color:#cdd3da;">
        Share it if you want. We're really glad you're here.<br/>
        <span style="color:#9aa3ad;">— Open Design</span>
      </td></tr>
      <tr><td style="padding:28px 32px 8px 32px;">
        <a href="${escapeHtml(commentUrl)}" style="display:inline-block;background:${accent};color:#0b0d10;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px;">
          View the welcome on GitHub →
        </a>
      </td></tr>
      <tr><td style="padding:14px 32px 32px 32px;font-size:13px;line-height:1.7;color:#9aa3ad;">
        Tell the world:
        <a href="${escapeHtml(xUrlEn)}" style="color:${accent};text-decoration:none;">Post on X (English)</a>
        ·
        <a href="${escapeHtml(xUrlCn)}" style="color:${accent};text-decoration:none;">分享到 X（中文）</a>
      </td></tr>`;
  return shellHtml({
    preheader: `Welcome to Open Design, @${card.username}.`,
    accent,
    body,
  });
}
