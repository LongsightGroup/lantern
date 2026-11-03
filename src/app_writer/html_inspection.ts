export function hasStylesheetLink(html: string, href: string): boolean {
  const hrefPattern = href.startsWith('./')
    ? `(?:\\./)?${escapeRegExp(href.slice(2))}`
    : escapeRegExp(href);
  return new RegExp(
    `<link\\b(?=[^>]*\\brel=["']stylesheet["'])(?=[^>]*\\bhref=["']${hrefPattern}["'])[^>]*>`,
    'i',
  ).test(html);
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
