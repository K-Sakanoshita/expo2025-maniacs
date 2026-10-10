const assert = require('node:assert/strict');
const fs = require('node:fs');
const { renderExample } = require('../scripts/render-facility-example.cjs');
const fixture = { features: [
    { id: 'node/1', properties: { name: '<unsafe & "name">', tags: { amenity: 'toilets' } }, geometry: { type: 'Point', coordinates: [135, 34] } },
    { id: 'node/2', properties: { name: '', tags: { amenity: 'drinking_water' } }, geometry: { type: 'Point', coordinates: [135.01, 34.01] } },
    { id: 'way/1', properties: { name: '', tags: { amenity: 'vending_machine' } }, geometry: { type: 'Polygon', coordinates: [[[135, 34], [135.01, 34], [135.01, 34.01], [135, 34]]] } },
    { id: 'node/3', properties: { name: '', tags: { 'historic:amenity': 'toilets' } }, geometry: { type: 'Point', coordinates: [136, 35] } }
] };
const result = renderExample(fixture);
assert.deepEqual(result.counts, { toilets: 1, drinking_water: 1, vending_machine: 1 });
assert.equal((result.svg.match(/data-osm-id=/g) || []).length, 3);
assert.match(result.svg, /&lt;unsafe &amp; &quot;name&quot;&gt;/);
assert.doesNotMatch(result.svg, /NaN|Infinity|data-osm-id="node\/3"/);
assert.throws(() => renderExample({ features: [] }), /No matching/);
const data = JSON.parse(fs.readFileSync('data/releases/2026-10-10-2/expo2025.geojson', 'utf8'));
const generated = renderExample(data);
assert.deepEqual(generated.counts, { toilets: 64, drinking_water: 50, vending_machine: 248 });
assert.equal((generated.svg.match(/data-osm-id=/g) || []).length, 362);
assert.equal(generated.svg, fs.readFileSync('examples/expo-facilities.svg', 'utf8'), 'committed image must reproduce exactly');
const page = fs.readFileSync('data.html', 'utf8');
assert.match(page, /src="\.\/examples\/expo-facilities\.svg"/);
assert.match(page, /施設データ ©/);
console.log('PASS: tag selection, polygon placement, escaped labels, exact counts and reproducible SVG');
