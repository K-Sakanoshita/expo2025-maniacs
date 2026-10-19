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
function mergeOsm(input, supplement, selectedIds) {
    const elements = new Map();
    // Original Overpass data can repeat a tagged node as an untagged reference.
    for (const original of input.elements) {
        const element = structuredClone(original);
        const id = `${element.type}/${element.id}`;
        const existing = elements.get(id);
        if (existing) {
            const tags = { ...element.tags, ...existing.tags };
            Object.assign(existing, element);
            if (Object.keys(tags).length) existing.tags = tags;
        } else elements.set(id, element);
    }
    const sourceIds = new Set();
    for (const element of supplement.elements) {
        const id = `${element.type}/${element.id}`;
        if (sourceIds.has(id)) throw new Error(`Duplicate supplemental OSM element: ${id}`);
        sourceIds.add(id);
        const existing = elements.get(id);
        if (existing) {
            if (element.tags) existing.tags = { ...element.tags, ...existing.tags };
        } else elements.set(id, structuredClone(element));
    }
    for (const id of selectedIds) {
        if (!sourceIds.has(id) || !Object.keys(elements.get(id)?.tags || {}).length) throw new Error(`Missing supplemental OSM feature: ${id}`);
    }
    for (const element of elements.values()) {
        for (const ref of element.nodes || []) {
            if (!elements.has(`node/${ref}`)) throw new Error(`Missing OSM node reference: ${ref}`);
        }
        for (const member of element.members || []) {
            if (!elements.has(`${member.type}/${member.ref}`) && !member.geometry) throw new Error(`Missing OSM member reference: ${member.type}/${member.ref}`);
        }
    }
    return { ...input, supplemental_sources: [...(input.supplemental_sources || []), { source_pbf: supplement.source_pbf,
        timestamp_osm_base: supplement.osm3s?.timestamp_osm_base, selection_note: supplement.selection_note }], elements: [...elements.values()] };
}
function exportData({ source = 'data/expo2025.min.json', output = 'data/releases/2026-10-19-4', version = '2026-10-19-4', supplemental = ['data/yumeshima_highways_all.geojson', 'data/yumeshima_buildings_all.geojson'], supplementalOsm, corrections = 'data/public-data-corrections.json' } = {}) {
    if (fs.existsSync(output)) throw new Error(`Published directory already exists; use a new version: ${output}`);
    if (!/^\d{4}-\d{2}-\d{2}(?:-\d+)?$/.test(version)) throw new Error('Invalid release version');
    const raw = fs.readFileSync(source);
    const input = JSON.parse(raw);
    // The converter mutates input elements; keep the source graph intact for OSM JSON.
    const converted = osmtogeojson(structuredClone(input), { flatProperties: false });
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
    let osmContent = raw;
    let mergedInput = input;
    for (const supplementalPath of !supplemental ? [] : Array.isArray(supplemental) ? supplemental : [supplemental]) {
        const content = fs.readFileSync(supplementalPath);
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
            if (feature.type !== 'Feature' || !tags || typeof tags !== 'object' || Array.isArray(tags) || !(tags.highway || (tags.building && tags.building !== 'no') || (tags['building:part'] && tags['building:part'] !== 'no')) || !feature.geometry || !['Point', 'LineString', 'MultiPolygon', 'Polygon', 'MultiLineString'].includes(feature.geometry.type)) throw new Error(`Invalid supplemental feature: ${id}`);
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
        const sourceFile = path.basename(supplementalPath);
        supplementaryFiles[sourceFile] = content;
        const osmSource = supplementalOsm || supplementalPath.replace(/\.geojson$/, '.osm.json');
        const osmSupplement = JSON.parse(fs.readFileSync(osmSource));
        mergedInput = mergeOsm(mergedInput, osmSupplement, supplementalIds);
        osmContent = Buffer.from(JSON.stringify(mergedInput) + '\n');
        supplementalSources.push({ source: supplementalPath.replaceAll('\\', '/'), source_pbf: collection.source_pbf || null,
            osm_source: osmSource.replaceAll('\\', '/'),
            source_osm_base_timestamp: collection.source_osm_base_timestamp || null,
            tag_filter: collection.tag_filter || null, spatial_rule: collection.spatial_rule || null,
            feature_count: collection.features.length, added_feature_count: added, duplicate_feature_count: duplicates,
            merge_rule: 'OSM IDで重複排除。既存の形状・タグ値を優先し、未記録タグのみ補完。',
            source_file: sourceFile });
    }
    const appliedCorrections = [];
    if (corrections) {
        const correctionContent = fs.readFileSync(corrections);
        const records = JSON.parse(correctionContent);
        const featureById = new Map(features.map(feature => [feature.id, feature]));
        const elementById = new Map(mergedInput.elements.map(element => [`${element.type}/${element.id}`, element]));
        for (const record of records) {
            const feature = featureById.get(record.osm_id), element = elementById.get(record.osm_id);
            if (!feature || !element) throw new Error(`Correction target missing: ${record.osm_id}`);
            for (const [key, expected] of Object.entries(record.expected_tags)) {
                if ((feature.properties.tags[key] ?? null) !== expected || (element.tags?.[key] ?? null) !== expected) throw new Error(`Correction precondition failed: ${record.osm_id} ${key}`);
            }
            Object.assign(feature.properties.tags, record.set_tags);
            element.tags = { ...element.tags, ...record.set_tags };
            feature.properties.name = feature.properties.tags.name || '';
            feature.properties.kind = KIND_KEYS.map(key => feature.properties.tags[key]).find(Boolean) || '';
            appliedCorrections.push(record);
        }
        mergedInput.data_corrections = appliedCorrections;
        osmContent = Buffer.from(JSON.stringify(mergedInput) + '\n');
        supplementaryFiles['public-data-corrections.json'] = correctionContent;
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
        'expo2025.osm.json': osmContent,
        ...supplementaryFiles
    };
    const metadata = {
        version,
        description: '2025年10月末時点の大阪・関西万博会場・施設のOSMデータを基に、Wikipedia・Wikimedia CommonsのURL、写真・公式サイト情報などを追加したデータセット。' + (supplementalSources.length ? '2026年1月1日版PBF由来の夢洲の道路・歩道・階段・信号・建物なども統合。各出典の基準日時は個別に記録。' : ''),
        source: source.replaceAll('\\', '/'),
        source_osm_base_timestamp: input.osm3s?.timestamp_osm_base || null,
        source_timestamp_note: '基となるOSMデータの取得時に記録された日時。取得後に追加した情報の日時を示すものではない。',
        supplemental_sources: supplementalSources,
        data_corrections: appliedCorrections,
        osm_json_note: supplementalSources.length ? 'GeoJSON・CSV・OSM JSONの全形式に道路・建物を統合。OSM JSONの追加地物・参照ノード・リレーションは元PBFから実IDで取得。選択外の参照要素は形状構築専用としてタグを省略。既存要素の形状・タグを優先。' : 'expo2025.osm.jsonは元のOverpass JSON。',
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
        const metadata = exportData({ source: process.argv[2] || undefined, output: process.argv[3] || undefined, version: process.argv[4] || undefined, supplemental: process.argv.length > 5 ? process.argv.slice(5) : undefined });
        console.log(`Exported ${metadata.feature_count} features (${metadata.version})`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { exportData, position, mergeOsm };
