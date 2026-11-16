import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const html = readFileSync('public/index.html', 'utf8');
const js = readFileSync('public/app.js', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate element IDs');
for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const value = match[1];
  if (value.startsWith('#') && value.length > 1) assert.ok(ids.includes(value.slice(1)), `Missing target ${value}`);
  else if (!/^(https?:|data:|#)/.test(value)) assert.ok(existsSync(path.join('public', value)), `Missing asset ${value}`);
}
for (const match of html.matchAll(/<label[^>]+for="([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Missing label target ${match[1]}`);
for (const match of js.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), `JS references missing element ${match[1]}`);
assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(js), 'Do not interpret public opinions as HTML');
assert.match(html, /<html lang="vi">/);
assert.match(html, /name="viewport"/);
assert.match(html, /Content-Security-Policy/);
console.log(`PASS static integrity: ${ids.length} unique IDs, local files, links, labels, JS references, text-only public rendering, CSP`);
