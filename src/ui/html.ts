// Escaping-by-default HTML templating for the extension pages (popup, panel,
// account chip). Two rules make renders safe by construction:
//
//   1. html`…${value}…` escapes every interpolated value — strings and
//      numbers become text, never markup. Nested html`…` results (SafeHtml)
//      and arrays of them are inserted as-is, so fragments compose without
//      double-escaping. Use raw() only for trusted, self-generated markup
//      (e.g. chart SVG built from numbers).
//   2. setHtml() renders through DOMParser instead of innerHTML, so no page
//      code assigns dynamic strings to innerHTML at all (AMO hardening).
//
// Fragments passed to setHtml must be well-formed on their own (a <tr> needs
// its <table>): the HTML parser drops table parts found outside a table.

export class SafeHtml {
  constructor(readonly html: string) {}
  toString(): string { return this.html; }
}

// Trusted, pre-built markup — bypasses escaping. Keep call sites few.
export function raw(trusted: string): SafeHtml {
  return new SafeHtml(trusted);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

function renderValue(v: unknown): string {
  if (v instanceof SafeHtml) return v.html;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (v === null || v === undefined || v === false) return '';
  return escapeHtml(String(v));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1]!;
  return new SafeHtml(out);
}

// Replace el's children with the fragment, parsed inert (scripts never run).
export function setHtml(el: Element, content: SafeHtml): void {
  if (content.html === '') {
    el.replaceChildren();
    return;
  }
  const doc = new DOMParser().parseFromString(content.html, 'text/html');
  const adopted = Array.from(doc.body.childNodes, n => el.ownerDocument.importNode(n, true));
  el.replaceChildren(...adopted);
}
