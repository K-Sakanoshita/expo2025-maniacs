const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { URL, window: { location: { href: 'https://example.test/' } } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('lib/maplib.js', 'utf8') + '\nthis.Maplibre = Maplibre;', context);
const transform = (url, type = 'Glyphs') => context.Maplibre.prototype.transformGlyphRequest.call({}, url, type).url;
const affected = 'https://tile.openstreetmap.jp/fonts/Noto%20Sans%20Italic/917760-918015.pbf';
assert.equal(transform(affected), 'data:application/x-protobuf;base64,');
for (const url of [
    affected.replace('917760-918015', '0-255'),
    affected.replace('917760-918015', '19968-20223'),
    affected.replace('tile.openstreetmap.jp', 'example.test')
]) assert.equal(transform(url), url);
assert.equal(transform(affected, 'Tile'), affected);
(async () => {
    const response = await fetch(transform(affected));
    assert.equal(response.status, 200);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
    console.log('PASS: unsupported variation-selector glyph range returns empty protobuf; other requests preserved');
})().catch(error => { console.error(error); process.exitCode = 1; });
