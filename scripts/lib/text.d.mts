// Types for scripts/lib/text.mjs.

export function codeSpanPlaceholders(markdown: string): string;
export function escapeRegExp(text: string): string;
export function htmlToText(html: string | null | undefined): string;
export function lostPlaceholders(source: string, renderedText: string): string[];
export function normalizeText(text: string | null | undefined): string;
