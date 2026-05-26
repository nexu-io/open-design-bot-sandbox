import { readFileSync } from "node:fs";
import { tierUpEmail } from "../src/email.ts";
import type { CardProps } from "../src/cards/types.ts";

const apiKey = process.env.RESEND_API_KEY;
const to = process.env.TO_EMAIL || "lilinxin@refly.ai";
const from =
  process.env.RESEND_FROM_EMAIL || "Open Design <hello@open-design.ai>";

if (!apiKey) {
  throw new Error("RESEND_API_KEY is required");
}

const svg = readFileSync("out/certificate-preview-giotto.svg", "utf8");
const svgBase64 = Buffer.from(svg).toString("base64");
const cardImageUrl = `data:image/svg+xml;base64,${svgBase64}`;

const mockCard: CardProps = {
  username: "lilinxin",
  avatarUrl: "https://avatars.githubusercontent.com/u/15102751?v=4",
  rank: 7,
  totalContributors: 142,
  topPercent: 4.9,
  points: 64,
  streakWeeks: 5,
  prsMerged: 18,
  reviews: 9,
  discussionsAnswered: 4,
  issuesAccepted: 6,
};

const commentUrl =
  "https://github.com/nexu-io/open-design/pull/2969#issuecomment-preview";
const eventId = `preview-${Date.now()}`;

const email = tierUpEmail(mockCard, cardImageUrl, commentUrl, eventId);

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from,
    to: [to],
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: [
      {
        filename: "open-design-certificate-preview.svg",
        content: svgBase64,
        content_type: "image/svg+xml",
      },
    ],
    tags: [{ name: "kind", value: "tier_up_preview" }],
  }),
});

const body = await res.text();
if (!res.ok) {
  throw new Error(`Resend failed: ${res.status} ${body}`);
}

console.log(`Sent preview email to ${to}`);
console.log(`Subject: ${email.subject}`);
console.log(`Resend response: ${body}`);
