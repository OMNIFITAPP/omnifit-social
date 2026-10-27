#!/usr/bin/env node
// Publishes every queue item that is approved, due, and not yet published.
//
//   node scripts/publish.mjs --dry-run   verify the token, list what is due, post nothing
//   node scripts/publish.mjs             publish

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as ig from "./lib/instagram.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE = path.join(ROOT, "queue.json");
const DRY = process.argv.includes("--dry-run");

const load = () => JSON.parse(readFileSync(QUEUE, "utf8"));
const save = (q) => writeFileSync(QUEUE, JSON.stringify(q, null, 2) + "\n");

const isDue = (item, now) =>
  item.status === "approved" &&
  Array.isArray(item.assets) && item.assets.length > 0 &&
  Date.parse(item.scheduledFor) <= now;

async function main() {
  const queue = load();
  const now = Date.now();
  const due = (queue.items || []).filter((i) => isDue(i, now));

  const who = await ig.whoami();
  console.log(`account: @${who.username || "?"} (${who.id})`);
  console.log(`queue: ${queue.items.length} items, ${due.length} due`);

  if (DRY) {
    for (const i of due) console.log(`  would publish ${i.id} · ${i.type === "reel" ? "a reel" : `${i.assets.length} image(s)`} · ${i.scheduledFor}`);
    console.log("dry run: nothing was published");
    return;
  }

  let published = 0;
  for (const item of due) {
    const caption = [item.caption, (item.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
    try {
      const out = item.type === "reel"
        ? await ig.publishReel(item.assets[0], caption, { thumbOffsetMs: item.thumbOffsetMs })
        : item.assets.length === 1
          ? await ig.publishImage(item.assets[0], caption)
          : await ig.publishCarousel(item.assets, caption);
      item.status = "published";
      item.publishedAt = new Date().toISOString();
      item.permalink = out.permalink;
      item.mediaId = out.mediaId;
      published++;
      console.log(`published ${item.id} → ${out.permalink}`);
    } catch (err) {
      // Leave the item approved so the next run retries it. A permanent failure
      // shows up as the same message every 15 minutes, which is the signal.
      item.lastError = String(err.message || err);
      console.error(`failed ${item.id}: ${item.lastError}`);
    }
    save(queue);
  }
  console.log(`done: ${published} published`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
