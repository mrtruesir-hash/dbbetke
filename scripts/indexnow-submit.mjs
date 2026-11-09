/**
 * scripts/indexnow-submit.mjs: tell Bing (and the other IndexNow engines) which dbbetke.com URLs
 * are new or changed. Fixes Bing Webmaster Tools' "Set up IndexNow" recommendation (2026-11-09).
 *
 * Cloudflare Crawler Hints (auto-IndexNow) has been on for this zone since 2026-09-16, but Bing
 * still flagged "Set up IndexNow". A direct POST to Bing's own endpoint with a site-owned key file
 * is what made Bing register IndexNow on the sibling sites, so we send to both endpoints.
 *
 * Ownership proof: public/<KEY>.txt is served at https://dbbetke.com/<KEY>.txt (the Worker sends
 * every non-/api/odds request to static assets, so no Worker change is needed).
 *
 * Usage (run AFTER the deploy is live, because the engines fetch the live key file and URLs):
 *   node scripts/indexnow-submit.mjs                       # every URL in public/sitemap.xml
 *   node scripts/indexnow-submit.mjs https://dbbetke.com/  # only these URLs
 *   add --dry-run to print the payload without sending anything
 * In Git Bash, pass FULL URLs: bare paths like /betting/ get rewritten into Windows paths.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'dbbetke.com';
const KEY = '4b74d669ab1a6171f023604bc4cddd9a';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENDPOINTS = ['https://www.bing.com/indexnow', 'https://api.indexnow.org/indexnow'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const paths = args.filter((a) => a !== '--dry-run');

if (!fs.existsSync(path.join(ROOT, 'public', `${KEY}.txt`))) {
  console.error(`Missing key file public/${KEY}.txt. Aborting.`);
  process.exit(1);
}

let urlList;
if (paths.length) {
  urlList = paths.map((p) => new URL(p, `https://${HOST}`).toString());
} else {
  const xml = fs.readFileSync(path.join(ROOT, 'public/sitemap.xml'), 'utf8');
  urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}
urlList = [...new Set(urlList.filter((u) => new URL(u).hostname === HOST))];

const body = { host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList };

if (dryRun) {
  console.log(JSON.stringify({ ...body, urlList: urlList.slice(0, 5).concat(urlList.length > 5 ? ['…'] : []) }, null, 2));
  console.log(`DRY RUN: ${urlList.length} URLs would go to ${ENDPOINTS.join(' + ')}. Nothing sent.`);
  process.exit(0);
}

// Response codes: 200 OK, 202 accepted (key check pending), 400 bad request, 403 key file not
// reachable or wrong, 422 URL not on host / key mismatch, 429 too many requests.
let failed = false;
for (const endpoint of ENDPOINTS) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  console.log(`${endpoint}: HTTP ${res.status} for ${urlList.length} URLs`);
  if (res.status >= 300) failed = true;
}
if (failed) process.exitCode = 1;
