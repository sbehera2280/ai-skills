// Minimal YAML-frontmatter reader/writer (no deps). Journeys are natural-language
// markdown with a small `---` frontmatter block carrying machine-tracked fields
// (pageType, exemplarUrl, risk, status). The PROSE below the frontmatter is what humans
// write/enrich; the agent reads it to generate Playwright code.

/** Parse `---`-delimited frontmatter. Returns { data, body }. Flat key: value only. */
export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (key) data[key] = val;
  }
  return { data, body: text.slice(m[0].length) };
}

/** Return `text` with frontmatter `key` set to `value` (updating, inserting, or
 *  creating the block as needed). Leaves the markdown body untouched. */
export function setFrontmatterKey(text, key, value) {
  const m = text.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/);
  if (!m) {
    return `---\n${key}: ${value}\n---\n\n${text}`;
  }
  const [, open, inner, close] = m;
  const lines = inner.split(/\r?\n/);
  let found = false;
  const updated = lines.map((line) => {
    const i = line.indexOf(':');
    if (i >= 0 && line.slice(0, i).trim() === key) {
      found = true;
      return `${key}: ${value}`;
    }
    return line;
  });
  if (!found) updated.push(`${key}: ${value}`);
  return open + updated.join('\n') + close + text.slice(m[0].length);
}
