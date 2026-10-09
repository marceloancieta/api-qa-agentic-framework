// Text that leaves this repository for a renderer (test-management descriptions, tracker issues).
// Renderers change text (L-47): Markdown reads a bare `<petId>` as an HTML tag and drops it. Text is
// made safe before it is sent, and what was rendered is checked after.

const PLACEHOLDER = /<([A-Za-z][\w.-]*)>/g;

/** Wrap `<placeholder>` tokens of prose in code spans; existing code spans are left alone. */
export function codeSpanPlaceholders(markdown) {
  return markdown
    .split(/(`[^`]*`)/)
    .map((part) => (part.startsWith('`') ? part : part.replace(PLACEHOLDER, '`<$1>`')))
    .join('');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** Visible text of an HTML fragment: tags removed, common entities decoded. */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name) => ENTITIES[name]);
}

/** Placeholders of the source that the rendered text no longer shows. */
export function lostPlaceholders(source, renderedText) {
  const wanted = [...new Set([...String(source).matchAll(PLACEHOLDER)].map((m) => m[0]))];
  return wanted.filter((token) => !renderedText.includes(token));
}

/** Text normalized for a read-back comparison: line endings, trailing spaces, outer blank lines. */
export function normalizeText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}
