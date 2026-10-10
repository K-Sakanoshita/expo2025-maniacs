const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { exportData, position } = require('../scripts/export-public-data.cjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-public-data-'));
try {
    const source = path.join(temp, 'source.json');
    const fixture = { osm3s: { timestamp_osm_base: '2025-10-30T16:07:40Z' }, elements: [
        { type: 'node', id: 1, lon: 135, lat: 34, tags: { name: '名前,"引用"\n改行', amenity: 'toilets', 'custom:test': 'keep' } },
        { type: 'node', id: 2, lon: 135.01, lat: 34 },
        { type: 'node', id: 3, lon: 135.01, lat: 34.01 },
        { type: 'way', id: 1, nodes: [1, 2], tags: { highway: 'footway' } },
        { type: 'way', id: 2, nodes: [1, 2, 3, 1], tags: { building: 'yes', name: '建物' } }
    ] };
    fs.writeFileSync(source, JSON.stringify(fixture));
    const one = path.join(temp, 'one'), two = path.join(temp, 'two');
    const metadata = exportData({ source, output: one });
    exportData({ source, output: two });
    for (const name of fs.readdirSync(one)) assert.deepEqual(fs.readFileSync(path.join(one, name)), fs.readFileSync(path.join(two, name)), `deterministic ${name}`);
    assert.equal(metadata.feature_count, 3);
    assert.equal(metadata.target_date, '2025-10-13');
    assert.equal(metadata.source_osm_base_timestamp, fixture.osm3s.timestamp_osm_base);
    assert.deepEqual(metadata.geometry_counts, { Point: 1, LineString: 1, Polygon: 1 });
    const features = JSON.parse(fs.readFileSync(path.join(one, 'expo2025.geojson'))).features;
    assert.equal(features.find(feature => feature.id === 'node/1').properties.tags['custom:test'], 'keep');
    assert.equal(features.find(feature => feature.id === 'way/2').geometry.coordinates[0].length, 4);
    const csv = fs.readFileSync(path.join(one, 'expo2025.csv'), 'utf8');
    assert.ok(csv.includes('"名前,""引用""\n改行"'));
    assert.ok(csv.includes('node/1,') && csv.includes('way/1,'));
    for (const [name, record] of Object.entries(metadata.files)) {
        const content = fs.readFileSync(path.join(one, name));
        assert.equal(content.length, record.bytes);
        assert.equal(crypto.createHash('sha256').update(content).digest('hex'), record.sha256);
    }
    assert.deepEqual(fs.readFileSync(source), fs.readFileSync(path.join(one, 'expo2025.osm.json')));
    assert.throws(() => exportData({ source, output: one }), /already exists/);
    const brokenSource = path.join(temp, 'broken.json');
    fs.writeFileSync(brokenSource, JSON.stringify({ elements: [{ type: 'node', id: 1, lat: 34, lon: 135 }, { type: 'way', id: 1, nodes: [1, 999, 1], tags: { building: 'yes' } }] }));
    assert.throws(() => exportData({ source: brokenSource, output: path.join(temp, 'broken') }), /Incomplete geometry|No tagged/);
    assert.deepEqual(position({ type: 'Polygon', coordinates: [[[135, 34], [136, 35], [135, 34]]] }), [135.5, 34.5]);
    console.log('PASS: geometry/tag retention, CSV escaping, hashes, deterministic output and release overwrite protection');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
