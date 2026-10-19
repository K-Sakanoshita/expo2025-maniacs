const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const release = process.argv[2] || 'data/releases/2026-10-19-4';
const read = name => JSON.parse(fs.readFileSync(path.join(release, name)));
const roads = read('yumeshima_highways_all.geojson');
const merged = read('expo2025.geojson').features;
const metadata = read('metadata.json');
const previous = JSON.parse(fs.readFileSync('data/releases/2026-10-12/expo2025.geojson')).features;
const byId = new Map(merged.map(feature => [feature.id, feature]));
assert.equal(byId.size, merged.length, 'no duplicate OSM IDs');
for (const original of previous) {
    const retained = byId.get(original.id);
    assert.deepEqual(retained.geometry, original.geometry, `retain existing shape ${original.id}`);
    if (original.properties.name) assert.equal(retained.properties.name, original.properties.name);
    for (const [key, value] of Object.entries(original.properties.tags)) assert.equal(retained.properties.tags[key], value, `retain existing tag ${original.id} ${key}`);
}
for (const road of roads.features) {
    const id = `${road.osm_type}/${road.osm_id}`;
    const feature = byId.get(id);
    assert.ok(feature, id);
    assert.deepEqual(feature.geometry, road.geometry, `geometry ${id}`);
    assert.deepEqual(feature.properties.tags, road.properties, `tags ${id}`);
    assert.equal(feature.properties.osm_id, id);
}
assert.equal(roads.features.length, 1399);
assert.equal(merged.length, previous.length + 1382 + 637);
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
const osm = read('expo2025.osm.json');
const osmById = new Map(osm.elements.map(e => [`${e.type}/${e.id}`, e]));
assert.equal(osmById.size, osm.elements.length);
const baseOsm = JSON.parse(fs.readFileSync('data/expo2025.min.json'));
for (const original of baseOsm.elements) {
    const retained = osmById.get(`${original.type}/${original.id}`);
    for (const [key, value] of Object.entries(original)) {
        if (key === 'tags') {
            for (const [tag, tagValue] of Object.entries(value)) assert.equal(retained.tags[tag], tagValue);
        } else assert.deepEqual(retained[key], value, `retain ${original.type}/${original.id} ${key}`);
    }
}
assert.equal(osm.elements.filter(e => Object.keys(e.tags || {}).length).length, merged.length);
const sourceOsm = JSON.parse(fs.readFileSync('data/yumeshima_highways_all.osm.json'));
const sourceById = new Map(sourceOsm.elements.map(e => [`${e.type}/${e.id}`, e]));
const baseIds = new Set(baseOsm.elements.map(e => `${e.type}/${e.id}`));
for (const road of roads.features) {
    const id = `${road.osm_type}/${road.osm_id}`;
    for (const [key, value] of Object.entries(road.properties)) assert.equal(osmById.get(id).tags[key], value, `OSM tag ${id} ${key}`);
    if (!baseIds.has(id)) assert.deepEqual(osmById.get(id), sourceById.get(id), `original PBF structure ${id}`);
}
for (const element of osm.elements) {
    for (const id of element.nodes || []) assert.ok(osmById.has(`node/${id}`));
    for (const member of element.members || []) assert.ok(osmById.has(`${member.type}/${member.ref}`) || member.geometry);
}
assert.equal(osm.supplemental_sources[0].timestamp_osm_base, '2026-01-01T21:21:30Z');
const convertedOsm = require('../lib/osmtogeojson.js')(structuredClone(osm), { flatProperties: false });
const convertedById = new Map(convertedOsm.features.map(f => [f.id, f]));
function normalizedGeometry(geometry) {
    if (!['Polygon', 'MultiPolygon'].includes(geometry.type)) return geometry;
    function ring(points) {
        const open = points.slice(0, -1).map(p => JSON.stringify(p));
        const start = open.indexOf([...open].sort()[0]);
        const rotated = [...open.slice(start), ...open.slice(0, start)];
        return [JSON.stringify(rotated), JSON.stringify([rotated[0], ...rotated.slice(1).reverse()])].sort()[0];
    }
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return { type: 'MultiPolygon', rings: polygons.map(p => JSON.stringify([ring(p[0]), ...p.slice(1).map(ring).sort()])).sort() };
}
for (const feature of merged) {
    const converted = convertedById.get(feature.id);
    assert.ok(converted && !converted.properties.tainted, `complete OSM geometry ${feature.id}`);
    assert.deepEqual(normalizedGeometry(converted.geometry), normalizedGeometry(feature.geometry), `OSM/GeoJSON geometry ${feature.id}`);
}
const existingById = new Map(previous.map(f => [f.id, f]));
const buildings = read('yumeshima_buildings_all.geojson');
assert.equal(buildings.features.length, 691);
assert.equal(metadata.supplemental_sources[1].added_feature_count, 637);
assert.equal(metadata.supplemental_sources[1].duplicate_feature_count, 54);
assert.equal(osm.supplemental_sources.length, 2, 'retain both road and building provenance');
assert.deepEqual(fs.readFileSync(path.join(release, 'yumeshima_buildings_all.geojson')), fs.readFileSync('data/yumeshima_buildings_all.geojson'));
const buildingSource = JSON.parse(fs.readFileSync('data/yumeshima_buildings_all.osm.json'));
const buildingIds = new Set(buildingSource.elements.map(e => `${e.type}/${e.id}`));
for (const building of buildings.features) {
    const id = `${building.osm_type}/${building.osm_id}`;
    const feature = byId.get(id);
    assert.ok(feature && buildingIds.has(id), id);
    assert.deepEqual(normalizedGeometry(feature.geometry), normalizedGeometry(building.geometry), `building shape ${id}`);
    for (const [key, value] of Object.entries(building.properties)) {
        const expected = existingById.get(id)?.properties.tags[key] ?? value;
        assert.equal(feature.properties.tags[key], expected, `building GeoJSON tag ${id} ${key}`);
        assert.equal(osmById.get(id).tags[key], expected, `building OSM tag ${id} ${key}`);
    }
}
const html = fs.readFileSync('data.html', 'utf8');
const preceding = JSON.parse(fs.readFileSync('data/releases/2026-10-19-3/expo2025.geojson')).features;
for (const original of preceding) {
    const expected = structuredClone(original);
    if (expected.id === 'way/1433690580') {
        expected.properties.tags.building = 'yes';
        expected.properties.kind = 'yes';
    }
    assert.deepEqual(byId.get(expected.id), expected, `only China building correction: ${expected.id}`);
}
const precedingOsm = JSON.parse(fs.readFileSync('data/releases/2026-10-19-3/expo2025.osm.json'));
for (const original of precedingOsm.elements) {
    const expected = structuredClone(original);
    if (expected.type === 'way' && expected.id === 1433690580) expected.tags.building = 'yes';
    assert.deepEqual(osmById.get(`${expected.type}/${expected.id}`), expected);
}
assert.equal(metadata.data_corrections.length, 1);
assert.deepEqual(osm.data_corrections, metadata.data_corrections);
for (const name of [...Object.keys(metadata.files), 'metadata.json']) assert.ok(html.includes(`./${release}/${name}`), `download link ${name}`);
console.log('PASS: all 1,399 roads and 691 buildings, OSM geometry parity, existing features, release hashes and links');
