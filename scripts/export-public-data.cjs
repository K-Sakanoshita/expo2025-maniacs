const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const osmtogeojson = require('../lib/osmtogeojson.js');

const KIND_KEYS = ['amenity', 'tourism', 'leisure', 'shop', 'barrier', 'highway', 'building', 'natural', 'playground'];
const CSV_TAG_KEYS = ['amenity', 'tourism', 'shop', 'country', 'wheelchair', 'opening_hours', 'website', 'wikidata', 'wikipedia', 'wikimedia_commons'];
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
function exportData({ source = 'data/expo2025.min.json', output = 'data/releases/2026-10-19', version = '2026-10-19', supplemental = 'data/yumeshima_highways_all.geojson' } = {}) {
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
    });
    const supplementaryFiles = {};
    const supplementalSources = [];
    if (supplemental) {
        const content = fs.readFileSync(supplemental);
        const collection = JSON.parse(content);
        if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('Invalid supplemental FeatureCollection');
        const byId = new Map(features.map(feature => [feature.id, feature]));
        const supplementalIds = new Set();
        let added = 0, duplicates = 0;
        for (const feature of collection.features) {
            if (!['node', 'way', 'relation'].includes(feature.osm_type) || !Number.isSafeInteger(feature.osm_id) || feature.osm_id <= 0) throw new Error('Invalid supplemental OSM ID');
            const id = `${feature.osm_type}/${feature.osm_id}`;
            if (supplementalIds.has(id)) throw new Error(`Duplicate supplemental ID: ${id}`);
            supplementalIds.add(id);
            const tags = feature.properties;
            if (feature.type !== 'Feature' || !tags || typeof tags !== 'object' || Array.isArray(tags) || !tags.highway || !feature.geometry || !['Point', 'LineString', 'MultiPolygon', 'Polygon', 'MultiLineString'].includes(feature.geometry.type)) throw new Error(`Invalid supplemental highway feature: ${id}`);
            position(feature.geometry);
            const existing = byId.get(id);
            if (existing) {
                // Keep existing enrichment and geometry; fill only missing tags.
                existing.properties.tags = { ...tags, ...existing.properties.tags };
                existing.properties.name = existing.properties.tags.name || '';
                existing.properties.kind = KIND_KEYS.map(key => existing.properties.tags[key]).find(Boolean) || '';
                duplicates++;
            } else {
                const converted = { type: 'Feature', id, properties: { osm_id: id, name: tags.name || '', kind: KIND_KEYS.map(key => tags[key]).find(Boolean) || '', tags }, geometry: feature.geometry };
                features.push(converted);
                byId.set(id, converted);
                added++;
            }
        }
        supplementaryFiles['yumeshima_highways_all.geojson'] = content;
        supplementalSources.push({ source: supplemental.replaceAll('\\', '/'), source_pbf: collection.source_pbf || null,
            source_osm_base_timestamp: collection.source_osm_base_timestamp || null,
            tag_filter: collection.tag_filter || null, spatial_rule: collection.spatial_rule || null,
            feature_count: collection.features.length, added_feature_count: added, duplicate_feature_count: duplicates,
            merge_rule: 'OSM IDで重複排除。既存の形状・タグ値を優先し、未記録タグのみ補完。',
            source_file: 'yumeshima_highways_all.geojson' });
    }
    features.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (!features.length) throw new Error('No tagged features found');
    const ids = new Set(features.map(feature => feature.id));
    if (ids.size !== features.length) throw new Error('Duplicate feature IDs');
    const geojson = { type: 'FeatureCollection', features };
    const rows = [['osm_id', 'name', 'kind', 'longitude', 'latitude', 'geometry_type', 'tags_json', ...CSV_TAG_KEYS]];
    const counts = {};
    for (const feature of features) {
        const props = feature.properties;
        counts[feature.geometry.type] = (counts[feature.geometry.type] || 0) + 1;
        rows.push([props.osm_id, props.name, props.kind, ...position(feature.geometry), feature.geometry.type, JSON.stringify(props.tags),
            ...CSV_TAG_KEYS.map(key => props.tags[key] ?? '')]);
    }
    const files = {
        'expo2025.geojson': Buffer.from(JSON.stringify(geojson) + '\n'),
        'expo2025.csv': Buffer.from(rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'),
        'expo2025.osm.json': raw,
        ...supplementaryFiles
    };
    const metadata = {
        version,
        description: '2025年10月末時点の大阪・関西万博会場・施設のOSMデータを基に、Wikipedia・Wikimedia CommonsのURL、写真・公式サイト情報などを追加したデータセット。' + (supplementalSources.length ? '2026年1月1日版PBF由来の夢洲の道路・歩道・階段・信号なども統合。各出典の基準日時は個別に記録。' : ''),
        source: source.replaceAll('\\', '/'),
        source_osm_base_timestamp: input.osm3s?.timestamp_osm_base || null,
        source_timestamp_note: '基となるOSMデータの取得時に記録された日時。取得後に追加した情報の日時を示すものではない。',
        supplemental_sources: supplementalSources,
        osm_json_note: supplementalSources.length ? 'expo2025.osm.jsonは施設データの元のOverpass JSON。追加道路は別添のyumeshima_highways_all.geojsonに収録し、統合済みの全件はexpo2025.geojson・expo2025.csvに収録。' : 'expo2025.osm.jsonは元のOverpass JSON。',
        license: 'ODbL-1.0', license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
        attribution: '© OpenStreetMap contributors', attribution_url: 'https://www.openstreetmap.org/copyright',
        publisher: 'EXPO2025 万博マニアックマップ', documentation_url: `${BASE_URL}data.html`,
        coordinate_reference_system: 'WGS 84', coordinate_order: ['longitude', 'latitude'],
        feature_count: features.length, geometry_counts: counts,
        selection: 'タグを持つ地物。リレーションの構成要素は変換時に統合される場合がある。タグなし形状ノードは元データのみ収録。',
        csv: { encoding: 'UTF-8', columns: rows[0], expanded_tag_columns: CSV_TAG_KEYS,
            missing_tag_note: 'タグの空欄は未記録（タグなし）。施設や設備が存在しないことを意味しない。',
            historical_tag_note: '営業時間などは収録時点の情報であり、現在の営業状況を示すものではない。',
            representative_position: 'Pointは元座標。それ以外は境界ボックスの中心。敷地内や入口の位置を保証しない。' },
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
        const metadata = exportData({ source: process.argv[2] || undefined, output: process.argv[3] || undefined, version: process.argv[4] || undefined, supplemental: process.argv[5] || undefined });
        console.log(`Exported ${metadata.feature_count} features (${metadata.version})`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { exportData, position };
