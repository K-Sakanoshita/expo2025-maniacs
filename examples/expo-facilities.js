/* MIT License. Uses the published GeoJSON only; no background tile service is required. */
(function () {
    // Save this script beside expo-facilities.html to reproduce the map.
    // To use your own data, replace DATA_URL with e.g. './expo2025.geojson'.
    const DATA_URL = 'https://k-sakanoshita.github.io/expo2025-maniacs/data/releases/2026-10-10-2/expo2025.geojson';
    const MAP_URL = 'https://k-sakanoshita.github.io/expo2025-maniacs/';
    const STATIC_MAP_URL = 'https://k-sakanoshita.github.io/expo2025-maniacs/examples/expo-facilities.svg';
    // Change the amenity values, labels and colors here to adapt the example.
    const TYPES = [
        { tag: 'toilets', label: 'トイレ', color: '#254da3', shape: '●', className: 'toilets' },
        { tag: 'drinking_water', label: '給水所', color: '#007c83', shape: '◆', className: 'water' },
        { tag: 'vending_machine', label: '自動販売機', color: '#b96516', shape: '■', className: 'vending' }
    ];
    function coordinates(geometry) {
        const points = [];
        function visit(value) {
            if (typeof value[0] === 'number') points.push(value);
            else value.forEach(visit);
        }
        visit(geometry.coordinates);
        return points;
    }
    function bounds(points) {
        const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
        return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
    }
    function prepareData(data) {
        const markers = [], venues = [], buildings = [];
        const counts = Object.fromEntries(TYPES.map(type => [type.tag, 0]));
        for (const feature of data.features) {
            const tags = feature.properties.tags || {};
            const type = TYPES.find(type => type.tag === tags.amenity);
            if (type) {
                const box = bounds(coordinates(feature.geometry));
                markers.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [
                    (box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2
                ] }, properties: { osm_id: feature.properties.osm_id, name: feature.properties.name,
                    category: type.tag, label: type.label, original_geometry: feature.geometry.type } });
                counts[type.tag]++;
            }
            if (['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
                if (tags.tourism === 'theme_park') venues.push(feature);
                if (feature.properties.osm_id === 'relation/18047883') buildings.push(feature);
            }
        }
        if (!markers.length) throw new Error('対象の施設がありません');
        const collection = features => ({ type: 'FeatureCollection', features });
        return { markers: collection(markers), venues: collection(venues), buildings: collection(buildings), counts,
            bounds: bounds([...markers.map(f => f.geometry.coordinates), ...venues.flatMap(f => coordinates(f.geometry))]) };
    }
    function icon(type) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = type.color; ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
        ctx.beginPath();
        if (type.shape === '●') ctx.arc(16, 16, 11, 0, Math.PI * 2);
        else if (type.shape === '◆') {
            ctx.moveTo(16, 3); ctx.lineTo(29, 16); ctx.lineTo(16, 29); ctx.lineTo(3, 16); ctx.closePath();
        } else ctx.rect(7, 7, 18, 18);
        ctx.fill(); ctx.stroke();
        return ctx.getImageData(0, 0, 32, 32);
    }
    function popupContent(properties) {
        const content = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = properties.name || properties.label;
        const type = document.createElement('p');
        type.textContent = properties.label;
        const note = document.createElement('p');
        note.textContent = properties.original_geometry === 'Point' ? '記録された位置' : '境界ボックスの中心（入口の位置ではありません）';
        content.append(name);
        if (properties.name && properties.name !== properties.label) content.append(type);
        content.append(note);
        if (/^(node|way|relation)\/\d+$/.test(properties.osm_id)) {
            const link = document.createElement('a');
            link.href = `${MAP_URL}?${properties.osm_id}`;
            link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.textContent = '万博マニアックマップで見る';
            content.append(link);
        }
        return content;
    }
    async function initialize() {
        const status = document.getElementById('status');
        // Our data page supplies the same date note in its caption.
        const dateNote = document.getElementById('data-note');
        if (dateNote && typeof window !== 'undefined' && window.frameElement?.classList.contains('facility-map')) dateNote.hidden = true;
        const showError = () => {
            status.dataset.error = 'true';
            status.replaceChildren(document.createTextNode('地図を表示できませんでした。通信やWebGLの対応をご確認ください。 '));
            const link = document.createElement('a');
            link.href = STATIC_MAP_URL; link.textContent = '静止図を見る'; link.target = '_blank';
            link.rel = 'noopener noreferrer'; status.append(link);
        };
        try {
            if (typeof maplibregl === 'undefined') throw new Error('MapLibre not loaded');
            const response = await fetch(DATA_URL);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = prepareData(await response.json());
            const legend = document.getElementById('legend');
            const filters = new Map();
            for (const type of TYPES) {
                const item = document.createElement('li'), label = document.createElement('label');
                const checkbox = document.createElement('input'), symbol = document.createElement('span');
                checkbox.type = 'checkbox'; checkbox.checked = true; checkbox.disabled = true;
                checkbox.value = type.tag;
                symbol.className = type.className; symbol.textContent = type.shape; symbol.setAttribute('aria-hidden', 'true');
                label.append(checkbox, symbol, document.createTextNode(`${type.label} ${data.counts[type.tag]}件`));
                item.append(label); legend.append(item);
                filters.set(type.tag, checkbox);
            }
            const map = new maplibregl.Map({ container: 'map', center: [135.3836, 34.6499], zoom: 14,
                cooperativeGestures: true, locale: { 'NavigationControl.ZoomIn': '拡大', 'NavigationControl.ZoomOut': '縮小',
                    'Popup.Close': '閉じる', 'AttributionControl.ToggleAttribution': '出典を表示',
                    'CooperativeGesturesHandler.WindowsHelpText': 'Ctrlキーを押しながらスクロールすると拡大・縮小できます',
                    'CooperativeGesturesHandler.MacHelpText': '⌘キーを押しながらスクロールすると拡大・縮小できます',
                    'CooperativeGesturesHandler.MobileHelpText': '2本の指で地図を移動できます' },
                style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#edf1f4' } }] }
            });
            map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
            map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
            map.on('error', showError);
            map.on('load', () => {
                try {
                    const attribution = '施設データ © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL)';
                    map.addSource('venues', { type: 'geojson', data: data.venues, attribution });
                    map.addSource('buildings', { type: 'geojson', data: data.buildings });
                    map.addSource('facilities', { type: 'geojson', data: data.markers });
                    map.addLayer({ id: 'venues', type: 'fill', source: 'venues', paint: { 'fill-color': '#fffdf5', 'fill-outline-color': '#a5afb9' } });
                    map.addLayer({ id: 'buildings', type: 'fill', source: 'buildings', paint: { 'fill-color': '#d9dfe5', 'fill-outline-color': '#bbc5cf' } });
                    for (const type of [...TYPES].reverse()) {
                        map.addImage(type.tag, icon(type));
                        map.addLayer({ id: type.tag, type: 'symbol', source: 'facilities', filter: ['==', ['get', 'category'], type.tag],
                            layout: { 'icon-image': type.tag, 'icon-size': 0.65, 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
                    }
                    let activePopup = null;
                    const updateStatus = () => {
                        if (status.dataset.error) return;
                        const count = TYPES.reduce((total, type) => total + (filters.get(type.tag).checked ? data.counts[type.tag] : 0), 0);
                        status.textContent = count ? `${count}件を表示。施設を押すと詳細を確認できます。`
                            : '表示中の設備はありません。チェックを入れると表示できます。';
                    };
                    for (const type of TYPES) {
                        const checkbox = filters.get(type.tag);
                        checkbox.disabled = false;
                        checkbox.addEventListener('change', () => {
                            map.setLayoutProperty(type.tag, 'visibility', checkbox.checked ? 'visible' : 'none');
                            activePopup?.remove();
                            map.getCanvas().style.cursor = '';
                            updateStatus();
                        });
                    }
                    map.on('click', event => {
                        const feature = map.queryRenderedFeatures(event.point, { layers: TYPES.map(type => type.tag) })[0];
                        if (!feature) return;
                        activePopup?.remove();
                        activePopup = new maplibregl.Popup().setLngLat(feature.geometry.coordinates).setDOMContent(popupContent(feature.properties)).addTo(map);
                    });
                    for (const type of TYPES) {
                        map.on('mouseenter', type.tag, () => { map.getCanvas().style.cursor = 'pointer'; });
                        map.on('mouseleave', type.tag, () => { map.getCanvas().style.cursor = ''; });
                    }
                    const reset = () => map.fitBounds(data.bounds, { padding: 32, duration: 0 });
                    document.getElementById('reset-view').disabled = false;
                    document.getElementById('reset-view').addEventListener('click', reset);
                    reset();
                    updateStatus();
                } catch { showError(); }
            });
            return map;
        } catch { showError(); }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { prepareData, popupContent, initialize };
    else initialize();
})();
