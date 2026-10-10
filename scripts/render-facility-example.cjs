// Reproduce the placement example using only the published GeoJSON, without map tiles.
const fs = require('node:fs');
const { position } = require('./export-public-data.cjs');

const SOURCE = 'data/releases/2026-10-10-2/expo2025.geojson';
const OUTPUT = 'examples/expo-facilities.svg';
const TYPES = [
    { tag: 'toilets', label: 'トイレ', color: '#254da3', shape: 'circle' },
    { tag: 'drinking_water', label: '給水所', color: '#007c83', shape: 'diamond' },
    { tag: 'vending_machine', label: '自動販売機', color: '#b96516', shape: 'square' }
];
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));

function renderExample(data) {
    const groups = TYPES.map(type => ({ ...type, features: data.features.filter(f => f.properties.tags.amenity === type.tag) }));
    const markers = groups.flatMap(group => group.features.map(feature => ({ feature, point: position(feature.geometry) })));
    if (!markers.length) throw new Error('No matching facilities');
    const venues = data.features.filter(f => f.properties.tags.tourism === 'theme_park' && ['Polygon', 'MultiPolygon'].includes(f.geometry.type));
    const buildings = data.features.filter(f => f.properties.tags.building && ['Polygon', 'MultiPolygon'].includes(f.geometry.type));
    const points = markers.map(marker => marker.point);
    function collect(coords) {
        if (typeof coords[0] === 'number') points.push(coords);
        else coords.forEach(collect);
    }
    venues.forEach(feature => collect(feature.geometry.coordinates));
    const middleLat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    // Local equirectangular projection, metres east/north, suitable for the small venue extent.
    const metresLat = Math.PI * 6371000 / 180;
    const metresLon = metresLat * Math.cos(middleLat * Math.PI / 180);
    const origin = points[0];
    const local = ([lon, lat]) => [(lon - origin[0]) * metresLon, (lat - origin[1]) * metresLat];
    const xy = points.map(local);
    const minX = Math.min(...xy.map(p => p[0])), maxX = Math.max(...xy.map(p => p[0]));
    const minY = Math.min(...xy.map(p => p[1])), maxY = Math.max(...xy.map(p => p[1]));
    const scale = Math.min(860 / Math.max(maxX - minX, 1), 500 / Math.max(maxY - minY, 1));
    const project = point => {
        const [x, y] = local(point);
        return [500 + (x - (minX + maxX) / 2) * scale, 380 - (y - (minY + maxY) / 2) * scale];
    };
    const number = value => value.toFixed(2);
    function path(geometry) {
        const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
        return polygons.flatMap(polygon => polygon.map(ring => ring.map((point, i) => {
            const [x, y] = project(point);
            return `${i ? 'L' : 'M'}${number(x)},${number(y)}`;
        }).join(' ') + 'Z')).join(' ');
    }
    function symbol(type, x, y) {
        const common = `fill="${type.color}" stroke="white" stroke-width="1.1"`;
        if (type.shape === 'circle') return `<circle cx="${number(x)}" cy="${number(y)}" r="5.5" ${common}/>`;
        if (type.shape === 'diamond') return `<path d="M${number(x)},${number(y - 6.5)}l6.5,6.5l-6.5,6.5l-6.5,-6.5Z" ${common}/>`;
        return `<rect x="${number(x - 4)}" y="${number(y - 4)}" width="8" height="8" rx="1" ${common}/>`;
    }
    const counts = Object.fromEntries(groups.map(group => [group.tag, group.features.length]));
    const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 760" role="img" aria-labelledby="title description">',
        '<title id="title">公開データで見る、当時のトイレ・給水所・自動販売機</title>',
        `<desc id="description">公開GeoJSONから生成した配置図。${groups.map(g => `${g.label}${g.features.length}件`).join('、')}。会場輪郭と建物を背景に、色と記号で区別。現在の営業・利用状況は示しません。</desc>`,
        '<style>text{font-family:system-ui,sans-serif;fill:#17334b} .small{font-size:15px;fill:#4d6375}</style>',
        '<rect width="1000" height="760" rx="12" fill="#f6f8fa"/>',
        '<text x="40" y="44" font-size="23" font-weight="700">トイレ・給水所・自動販売機の配置</text>',
        '<text x="40" y="72" class="small">大阪・関西万博2025 · 公開版 2026-10-10-2</text>',
        ...groups.map((group, i) => symbol(group, 50 + i * 300, 101) + `<text x="${65 + i * 300}" y="107" font-size="18">${group.label} ${group.features.length}件</text>`),
        '<defs><clipPath id="map-area"><rect x="30" y="125" width="940" height="520" rx="8"/></clipPath></defs>',
        '<rect x="30" y="125" width="940" height="520" rx="8" fill="#edf1f4"/>',
        '<g clip-path="url(#map-area)">',
        ...venues.map(f => `<path d="${path(f.geometry)}" fill="#fffdf5" stroke="#a5afb9" stroke-width="1.5" fill-rule="evenodd"/>`),
        ...buildings.map(f => `<path d="${path(f.geometry)}" fill="#d9dfe5" stroke="#bbc5cf" stroke-width="0.6" fill-rule="evenodd"/>`),
        // Draw the numerous small vending-machine squares first, preserving visibility of other types.
        ...[...groups].reverse().flatMap(group => group.features.map(feature => {
            const [x, y] = project(position(feature.geometry));
            return `<g data-kind="${group.tag}" data-osm-id="${escape(feature.id)}"><title>${escape(feature.properties.name || group.label)} (${escape(feature.id)})</title>${symbol(group, x, y)}</g>`;
        })),
        '</g>',
        '<path d="M938,192V151m0,0l-7,12m7,-12l7,12" fill="none" stroke="#17334b" stroke-width="2"/>',
        '<text x="938" y="143" text-anchor="middle" font-size="16">N</text>',
        `<path d="M45,666v6h${number(500 * scale)}v-6" fill="none" stroke="#17334b" stroke-width="2"/>`,
        '<text x="45" y="695" class="small">約500 m</text>',
        '<text x="300" y="683" class="small">背景：同じGeoJSONの会場輪郭・建物（収録分）</text>',
        '<text x="40" y="726" class="small">地図・施設データ © OpenStreetMap contributors（ODbL）</text>',
        '</svg>', ''
    ].join('\n');
    return { svg, counts };
}

if (require.main === module) {
    const result = renderExample(JSON.parse(fs.readFileSync(SOURCE, 'utf8')));
    fs.writeFileSync(OUTPUT, result.svg);
    console.log(`Generated ${OUTPUT}: ${JSON.stringify(result.counts)}`);
}
module.exports = { renderExample };
