# dbbetke.com — DBBet Kenya

Static player-acquisition site targeting the **Kenya** market for **DBBet** (operator).
Goal: generate organic search traffic from Kenya → registered, depositing players. Long-run: win AI search.

**Separate from dbbetaff.com (Ray's affiliate business) — no connection.**

## Stack
- Static HTML (no server, no CMS). Hosted on **Cloudflare Pages** + CDN.
- Brand skin: dark `#121212` / accent `#ff335c` / Montserrat (matches dbbet.us.com).
- All CTAs → DBBet tracking link (the "money link").

## Structure
- `index.html` — homepage (hero + KES 14,803 bonus + M-Pesa +30% + Aviator + predictions + FAQ).
- `robots.txt`, `sitemap.xml` — SEO basics.
- (coming) content hubs: Aviator, Best Betting Sites, Predictions, M-Pesa/Payments, How-to/Trust, Bonuses.

## Deploy (Cloudflare Pages)
1. Add `dbbetke.com` to Cloudflare; point registrar nameservers to Cloudflare's.
2. Create a Cloudflare Pages project (Direct Upload or Git) → attach custom domain `dbbetke.com`.
3. Push updates → auto-deploy.

## To confirm / provide
- Real images for the labelled slots in `index.html`.
- Real welcome-bonus/promo details if different from the official KES 14,803 / casino KES 222,105 + 150 FS.
- Registration/tracking link is wired; confirm it passes back conversions for attribution.
