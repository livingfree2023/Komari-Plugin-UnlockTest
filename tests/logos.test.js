const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const scope = { window: {} };
for (const file of ['brand-icons.js', 'logos.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, 'plugin/assets', file), 'utf8'), scope);
}
const getLogo = scope.window.KomariUnlockLogos.getServiceSVG;
const icons = scope.window.KomariUnlockBrandIcons;
const names = require('./fixtures/service-names.json');

test('the full observed service catalog always gets a local SVG', () => {
  assert.equal(names.length, 163);
  let native = 0;
  for (const name of names) {
    const svg = getLogo(name);
    assert.match(svg, /^<svg\b/);
    assert.doesNotMatch(svg, /<script|<foreignObject|\bon\w+=|(?:href|src)=["']https?:/i);
    if (svg.includes('km-ul-native-icon')) native++;
  }
  assert.ok(native >= 50, `expected at least 50 native mappings; got ${native}`);
});

test('similar service names do not inherit the wrong brand', () => {
  assert.ok(getLogo('Viaplay').includes('km-ul-native-icon'));
  assert.ok(!getLogo('Viu.com').includes('km-ul-native-icon'));
  assert.ok(!getLogo('Netflix imitation').includes('km-ul-native-icon'));
  assert.ok(getLogo('Netflix CDN').includes('km-ul-native-icon'));
});

test('unmatched names are escaped into an SVG text badge', () => {
  const svg = getLogo('<img onerror=alert(1)>');
  assert.doesNotMatch(svg, /<img|onerror/);
  assert.match(svg, />IMGO<\/text>/);
});

test('each bundled icon has a pinned source and no remote dependency', () => {
  const lines = fs.readFileSync(path.join(root, 'plugin/assets/icon-sources.csv'), 'utf8').trim().split('\n');
  const sources = new Map(lines.slice(1).map(line => [line.split(',')[0], line]));
  assert.deepEqual([...sources.keys()].sort(), Object.keys(icons).sort());
  for (const [key, { svg }] of Object.entries(icons)) {
    assert.match(sources.get(key), /blob\/[a-f0-9]{40}\//);
    assert.doesNotMatch(svg, /<script|<foreignObject|\bon\w+=|(?:href|src)=["']https?:/i);
  }
});
