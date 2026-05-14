const TITLE_RE = /<title>([^<]+)<\/title>/i;
const DESC_RE = /<meta\s+name=["']description["']\s+content=["']([^"']+)["'][^>]*>/i;

export function extractMeta(html) {
  const titleMatch = html.match(TITLE_RE);
  if (!titleMatch) throw new Error('missing <title>');
  const descMatch = html.match(DESC_RE);
  if (!descMatch) throw new Error('missing <meta name="description">');
  return {
    title: titleMatch[1].trim(),
    description: descMatch[1].trim(),
  };
}
