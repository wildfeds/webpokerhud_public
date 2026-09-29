import { describe, it, expect } from 'vitest';
import { html, raw, escapeHtml, SafeHtml } from './html';

describe('html tagged template', () => {
  it('escapes interpolated strings, attributes included', () => {
    const evil = `<img src=x onerror=alert(1)> "quoted" & 'single'`;
    const out = html`<div title="${evil}">${evil}</div>`.html;
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).toContain('&quot;quoted&quot;');
    expect(out).toContain('&#39;single&#39;');
    expect(out).toContain('&amp;');
  });

  it('inserts numbers as text and drops null/undefined/false', () => {
    expect(html`<b>${42}</b>${null}${undefined}${false}`.html).toBe('<b>42</b>');
  });

  it('composes nested fragments and arrays without double-escaping', () => {
    const inner = html`<i>${'a<b'}</i>`;
    const out = html`<div>${[inner, inner]}</div>`.html;
    expect(out).toBe('<div><i>a&lt;b</i><i>a&lt;b</i></div>');
  });

  it('raw() bypasses escaping for trusted markup', () => {
    expect(html`<div>${raw('<svg/>')}</div>`.html).toBe('<div><svg/></div>');
    expect(raw('<p>')).toBeInstanceOf(SafeHtml);
  });
});

describe('escapeHtml', () => {
  it('escapes all five HTML metacharacters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
