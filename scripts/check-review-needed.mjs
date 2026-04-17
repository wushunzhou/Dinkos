#!/usr/bin/env node
// PostToolUse hook helper: scan inkos workspace books for unreviewed chapters.
// Emits "REVIEW_NEEDED: <book-id> N chapters pending (last=X, latest=Y)" to stderr
// when threshold reached, so Claude Code sees it and can invoke the reviewer skill.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const THRESHOLD = 3;
const WORKSPACE_ROOTS = [
  "/home/user/Dinkos/workspace",
];

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function latestChapter(bookDir) {
  const chaptersDir = join(bookDir, "chapters");
  if (!(await exists(chaptersDir))) return 0;
  const files = await readdir(chaptersDir);
  let max = 0;
  for (const f of files) {
    const m = f.match(/^(\d{4})[_-]/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

async function lastReviewed(bookDir) {
  const path = join(bookDir, "review-state.json");
  if (!(await exists(path))) return 0;
  try {
    const data = JSON.parse(await readFile(path, "utf-8"));
    return Number(data.last_reviewed_chapter ?? 0);
  } catch {
    return 0;
  }
}

async function scanRoot(root) {
  const booksDir = join(root, "books");
  if (!(await exists(booksDir))) return [];
  const entries = await readdir(booksDir, { withFileTypes: true });
  const reminders = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const bookDir = join(booksDir, e.name);
    const [latest, reviewed] = await Promise.all([
      latestChapter(bookDir),
      lastReviewed(bookDir),
    ]);
    const pending = latest - reviewed;
    if (pending >= THRESHOLD) {
      reminders.push({ bookId: e.name, latest, reviewed, pending });
    }
  }
  return reminders;
}

async function main() {
  const all = [];
  for (const root of WORKSPACE_ROOTS) {
    all.push(...(await scanRoot(root)));
  }
  for (const r of all) {
    process.stderr.write(
      `REVIEW_NEEDED: ${r.bookId} ${r.pending} chapters pending ` +
      `(last=${r.reviewed}, latest=${r.latest}). ` +
      `Invoke the inkos-reviewer skill.\n`,
    );
  }
  // exit 0 either way — we don't want to block the tool
  process.exit(0);
}

main().catch((err) => {
  // Never fail the hook — just log to stderr
  process.stderr.write(`[check-review-needed] ${err.message}\n`);
  process.exit(0);
});
