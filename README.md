# Open Design Contributor Bot

This is the **internal test sandbox** for the contributor recognition bot that will eventually live in [`nexu-io/open-design`](https://github.com/nexu-io/open-design).

The bot watches GitHub events in this repo and **automatically posts a tier card + welcome text** when you contribute.

---

## How to test it (60 seconds)

You're an internal tester. To see the bot in action, do **either** of these:

### Option A — Open an issue (triggers a Spark welcome card)

1. Go to **[Issues → New issue](https://github.com/nexu-io/open-design-bot-sandbox/issues/new)**
2. Title it whatever, body whatever (e.g. `Hello from @yourname`)
3. Click **Submit new issue**
4. Within ~60 seconds, the bot will reply in your issue thread with a ✨ **Spark** welcome card showing your avatar.

### Option B — Open and merge a PR (triggers a Signal upgrade card)

1. Edit any file (the README is fine) — click the pencil icon → make any change
2. At the bottom: **Create a new branch** (any name) → **Propose changes** → **Create pull request**
3. Once the PR is open, **merge it** (no review needed in sandbox).
4. Within ~60 seconds, the bot will comment on the merged PR with a 📡 **Signal** upgrade card.

That's it. Open a few PRs/issues with different accounts and watch the cards stack up.

---

## What you should see

The bot's comment looks like this (pulled from a real test):

> ### ✨ You just leveled up to **Spark** (火花)
>
> [card image: dark-space background, your avatar, tier badge, encouragement text]
>
> *Lit the first spark.*
>
> **Every great contribution starts with a single spark. You showed up — that's the hardest step. Welcome to Open Design.**

---

## What's happening behind the scenes

1. `.github/workflows/contributor-bot.yml` triggers on `pull_request.closed` (merged) and `issues.opened`.
2. `scripts/action-handler.ts` reads the event payload, renders a 1080×1080 PNG card with your avatar via Satori + resvg.
3. The PNG is committed to the `bot-cards` branch.
4. The bot comments on your thread with the card embedded.

---

## Reporting bugs

If the bot does **not** comment within 2 minutes, or the card looks broken, ping `@ashleyashli` with:
- The PR or issue URL
- The Actions run URL (find it under the **Actions** tab)
