const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const osmtogeojson = require('../lib/osmtogeojson.js');

const KIND_KEYS = ['amenity', 'tourism', 'leisure', 'shop', 'barrier', 'highway', 'building', 'natural', 'playground'];
const BASE_URL = 'https://k-sakanoshita.github.io/expo2025-maniacs/';
const csvCell = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
function position(geometry) {
    const points = [];
    function visit(value) {
        if (!Array.isArray(value) || !value.length) throw new Error('Empty or invalid coordinates');
        if (typeof value[0] === 'number') {
            if (value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) throw new Error('Invalid longitude/latitude');
            points.push(value);
        } else value.forEach(visit);
    }
    visit(geometry.coordinates);
    const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
function exportData({ source = 'data/expo2025.min.json', output = 'data/releases/2026-10-10', version = '2026-10-10' } = {}) {
    if (fs.existsSync(output)) throw new Error(`Published directory already exists; use a new version: ${output}`);
    if (!/^\d{4}-\d{2}-\d{2}(?:-\d+)?$/.test(version)) throw new Error('Invalid release version');
    const raw = fs.readFileSync(source);
    const input = JSON.parse(raw);
    const converted = osmtogeojson(input, { flatProperties: false });
    const features = converted.features.filter(feature => Object.keys(feature.properties.tags || {}).length).map(feature => {
        if (feature.properties.tainted || !feature.geometry) throw new Error(`Incomplete geometry: ${feature.id}`);
        position(feature.geometry);
        const tags = feature.properties.tags;
        return { type: 'Feature', id: feature.id, properties: {
            osm_id: feature.id, name: tags.name || '',
            kind: KIND_KEYS.map(key => tags[key]).find(Boolean) || '', tags
        }, geometry: feature.geometry };
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (!features.length) throw new Error('No tagged features found');
    const ids = new Set(features.map(feature => feature.id));
    if (ids.size !== features.length) throw new Error('Duplicate feature IDs');
    const geojson = { type: 'FeatureCollection', features };
    const rows = [['osm_id', 'name', 'kind', 'longitude', 'latitude', 'geometry_type', 'tags_json']];
    const counts = {};
    for (const feature of features) {
        const props = feature.properties;
        counts[feature.geometry.type] = (counts[feature.geometry.type] || 0) + 1;
        rows.push([props.osm_id, props.name, props.kind, ...position(feature.geometry), feature.geometry.type, JSON.stringify(props.tags)]);
    }
    const files = {
        'expo2025.geojson': Buffer.from(JSON.stringify(geojson) + '\n'),
        'expo2025.csv': Buffer.from(rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'),
        'expo2025.osm.json': raw
    };
    const metadata = {
        version, target_date: '2025-10-13',
        description: '大阪・関西万博の閉幕時点を対象とした会場・施設の記録。取得後の写真・公式サイト情報や遊具などの補足を含む。',
        source: source.replaceAll('\\', '/'),
        source_osm_base_timestamp: input.osm3s?.timestamp_osm_base || null,
        source_timestamp_note: '元データの取得時に記録されたOSM基準日時。施設の対象時点ではない。',
        license: 'ODbL-1.0', license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
        attribution: '© OpenStreetMap contributors', attribution_url: 'https://www.openstreetmap.org/copyright',
        publisher: 'EXPO2025 万博マニアックマップ', documentation_url: `${BASE_URL}data.html`,
        coordinate_reference_system: 'WGS 84', coordinate_order: ['longitude', 'latitude'],
        feature_count: features.length, geometry_counts: counts,
        selection: 'タグを持つ地物。リレーションの構成要素は変換時に統合される場合がある。タグなし形状ノードは元データのみ収録。',
        csv: { encoding: 'UTF-8', representative_position: 'Pointは元座標。それ以外は境界ボックスの中心。敷地内や入口の位置を保証しない。' },
        files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, {
            url: `${BASE_URL}data/releases/${version}/${name}`,
            bytes: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex')
        }]))
    };
    // Validate and serialize everything before creating the release directory.
    files['metadata.json'] = Buffer.from(JSON.stringify(metadata, null, 2) + '\n');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.mkdirSync(output);
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(output, name), content, { flag: 'wx' });
    return metadata;
}
if (require.main === module) {
    try {
        const metadata = exportData({ source: process.argv[2] || undefined, output: process.argv[3] || undefined, version: process.argv[4] || undefined });
        console.log(`Exported ${metadata.feature_count} features (${metadata.version})`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { exportData, position };
