const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const release = process.argv[2] || 'data/releases/2026-10-19';
const read = name => JSON.parse(fs.readFileSync(path.join(release, name)));
const roads = read('yumeshima_highways_all.geojson');
const merged = read('expo2025.geojson').features;
const metadata = read('metadata.json');
const previous = JSON.parse(fs.readFileSync('data/releases/2026-10-12/expo2025.geojson')).features;
const byId = new Map(merged.map(feature => [feature.id, feature]));
assert.equal(byId.size, merged.length, 'no duplicate OSM IDs');
for (const original of previous) assert.deepEqual(byId.get(original.id), original, `retain existing ${original.id}`);
for (const road of roads.features) {
    const id = `${road.osm_type}/${road.osm_id}`;
    const feature = byId.get(id);
    assert.ok(feature, id);
    assert.deepEqual(feature.geometry, road.geometry, `geometry ${id}`);
    assert.deepEqual(feature.properties.tags, road.properties, `tags ${id}`);
    assert.equal(feature.properties.osm_id, id);
}
assert.equal(roads.features.length, 1399);
assert.equal(merged.length, previous.length + 1382);
assert.equal(metadata.feature_count, merged.length);
assert.equal(metadata.supplemental_sources[0].duplicate_feature_count, 17);
const counts = {};
for (const f of merged) counts[f.geometry.type] = (counts[f.geometry.type] || 0) + 1;
assert.deepEqual(metadata.geometry_counts, counts);
for (const [name, record] of Object.entries(metadata.files)) {
    const bytes = fs.readFileSync(path.join(release, name));
    assert.equal(bytes.length, record.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), record.sha256);
}
assert.deepEqual(fs.readFileSync(path.join(release, 'yumeshima_highways_all.geojson')), fs.readFileSync('data/yumeshima_highways_all.geojson'));
assert.deepEqual(fs.readFileSync(path.join(release, 'expo2025.osm.json')), fs.readFileSync('data/expo2025.min.json'));
const html = fs.readFileSync('data.html', 'utf8');
for (const name of [...Object.keys(metadata.files), 'metadata.json']) assert.ok(html.includes(`./${release}/${name}`), `download link ${name}`);
console.log('PASS: all 1,399 highway geometries/tags, 17 duplicates, existing features, release hashes and links');
