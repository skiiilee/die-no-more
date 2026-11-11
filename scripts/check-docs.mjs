// Docs check (ADR-0002 item 4): internal links, progress log names, ADR status.
// Each error says how to fix it.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function listMarkdown(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listMarkdown(path);
    return name.endsWith(".md") ? [path] : [];
  });
}

/** Returns relative link targets in markdown, ignoring URLs, anchors and code. */
export function extractLocalLinks(markdown) {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  const links = [];
  for (const match of withoutCode.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue;
    links.push(decodeURI(target.split("#")[0]));
  }
  return links;
}

export const PROGRESS_NAME = /^\d{4}-\d{2}-\d{2}_(claude|gpt|skii)\.md$/;
export const ADR_STATUS = /^Status:\s*(Proposed|Accepted|Superseded|Deprecated|Rejected)\b/m;

export function checkDocs(root = ROOT) {
  const errors = [];
  const docs = join(root, "docs");
  for (const file of [...listMarkdown(docs), join(root, "README.md")]) {
    const text = readFileSync(file, "utf8");
    for (const link of extractLocalLinks(text)) {
      if (!existsSync(resolve(dirname(file), link))) {
        errors.push(`${relative(root, file)}: broken link "${link}". Fix the path or remove the link.`);
      }
    }
  }
  for (const name of readdirSync(join(docs, "progress"))) {
    if (name !== "README.md" && !PROGRESS_NAME.test(name)) {
      errors.push(`docs/progress/${name}: name must be YYYY-MM-DD_<claude|gpt|skii>.md (see docs/progress/README.md).`);
    }
  }
  for (const name of readdirSync(join(docs, "decisions"))) {
    const text = readFileSync(join(docs, "decisions", name), "utf8");
    if (!ADR_STATUS.test(text)) {
      errors.push(`docs/decisions/${name}: add a "Status: Proposed|Accepted|Superseded|..." line.`);
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkDocs();
  for (const error of errors) console.error(error);
  if (errors.length > 0) process.exit(1);
  console.log("docs check passed");
}
