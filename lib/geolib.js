"use strict";
// MapLibre Control
class Maplibre {

    constructor() {
        this.map;
        this.Control = { "locate": "", "maps": "" };    // MapLibre object
        this.popup = null;
        this.styles = {};
        this.selectStyle;
    };

    init(Conf) {
        function extractFilenamesFromTag(tag) {
            const result = new Set();
            for (const key in tag) {
                const valueMap = tag[key];
                for (const val in valueMap) {
                    result.add(valueMap[val]);
                }
            }
            return result;
        }

        function extractFilenamesFromSubtag(subtag) {
            const result = new Set();
            for (const keyEqVal in subtag) {
                const valueMap = subtag[keyEqVal];
                for (const subkey in valueMap) {
                    const icons = valueMap[subkey];
                    for (const subval in icons) {
                        result.add(icons[subval]);
                    }
                }
            }
            return result;
        }

        return new Promise((resolve, reject) => {
            console.log("Maplibre: init start.");
            this.selectStyle = Conf.map.tileName;
            Object.keys(Conf.tile).forEach(key => this.styles[key] = Conf.tile[key].style)
            let protocol = new pmtiles.Protocol()
            maplibregl.addProtocol("pmtiles", protocol.tile)
            this.map = new maplibregl.Map({
                container: 'mapid', style: this.styles[this.selectStyle], "maxZoom": Conf.map.maxZoom, "zoom": Conf.map.initZoom,
                antialias: true, hash: true, maxBounds: Conf.map.maxBounds, center: Conf.map.viewCenter,
                pitch: Conf.map.viewPitch, maxPitch: Conf.map.maxPitch, attributionControl: false
            });
            this.map.scrollZoom.setWheelZoomRate(1 / 420);
            this.map.scrollZoom.setZoomRate(1 / 420);
            const fnames1 = new Set([
                ...extractFilenamesFromTag(Conf.marker.tag),
                ...extractFilenamesFromSubtag(Conf.marker.subtag)
            ]);
            const fnames2 = [...fnames1].map(file => file.replace(/\.svg$/i, ".png"));
            console.log(`Maplibre: new Map(${Conf.map.tileName})`);
            this.map.on('load', async () => {
                setTimeout(() => {
                    mapLibre.map.setSky({ "sky-color": "#5090D0" });
                    mapLibre.map.setSky(Conf.skyStyle);
                }, 1000)
                for (let file of Conf.marker.background) {
                    let image = await this.map.loadImage("./" + Conf.icon.bgPath + "/" + file)
                    this.map.addImage(file, image.data)
                }
                const images = await Promise.all(
                    fnames2.map(async (file) => {
                        const image = await this.map.loadImage("./" + Conf.icon.fgPath + "/" + file);
                        return { file, image: image.data };
                    })
                );
                for (const { file, image } of images) this.map.addImage(file, image);
                console.log("Maplibre: init end.")
                resolve()
            });
        });
    };

    enable(flag) {
        if (flag) {
            this.map.scrollWheelZoom.enable();
            this.map.dragging.enable();
        } else {
            this.map.scrollWheelZoom.disable();
            this.map.dragging.disable();
        }
    };

    start() {
        ["dragging", "touchZoom"].forEach(key => map[key].enable());
        this.Control["maps"].addTo(map);
        this.Control["locate"].addTo(map);
        this.map.zoomControl.addTo(map);
        if (this.map.tap) this.map.tap.enable();
        document.getElementById('mapid').style.cursor = 'grab';
    };

    stop() {
        ["dragging", "touchZoom"].forEach(key => map[key].disable());
        this.Control["maps"].remove(map);
        this.Control["locate"].remove(map);
        this.map.zoomControl.remove(map);
        if (this.map.tap) this.map.tap.disable();
        document.getElementById('mapid').style.cursor = 'default';
    };

    // Change Map Style / tilename:タイル名。空欄の時は設定された次のスタイル
    changeMap(tilename) {
        let styles = Object.keys(this.styles);
        let nextSt = (styles.indexOf(this.selectStyle) + 1) % styles.length;
        this.selectStyle = !tilename ? styles[nextSt] : tilename;
        mapLibre.map.setStyle(this.styles[this.selectStyle]);
        setTimeout(() => {
            mapLibre.map.setSky({ "sky-color": "#5090D0" });
            mapLibre.map.setSky(Conf.skyStyle);
        }, 1000)
    };

    on(event, callback) {
        this.map.on(event, callback);
    };

    openPopup(marker, params) {
        if (this.popup !== null) this.popup.close();
        setTimeout((() => { this.popup = L.popup(marker.getLngLat(), params).openOn(this.map); }).bind(this), 100);
    };

    flyTo(ll, zoomlv) {
        this.map.flyTo({ center: ll, zoom: zoomlv, speed: 2 });
    };

    // return Zoom Level / round: Math.Round(true or false)
    getZoom(round) {
        return round ? Math.round(this.map.getZoom() * 10) / 10 : this.map.getZoom();
    };

    setZoom(zoomlv) {
        this.map.flyTo({ center: this.map.getCenter(), zoom: zoomlv, speed: 0.5 });
    };

    getCenter() {
        return this.map.getBounds().getCenter();
    };

    get_LL(lll) {			// LngLatエリアの設定 [経度lng,緯度lat] lll:少し大きめにする
        let ll = { "NW": this.map.getBounds().getNorthWest(), "SE": this.map.getBounds().getSouthEast() };
        if (lll) {
            ll.NW.lng = ll.NW.lng * 0.99997;
            ll.SE.lng = ll.SE.lng * 1.00003;
            ll.SE.lat = ll.SE.lat * 0.99992;
            ll.NW.lat = ll.NW.lat * 1.00008;
        }
        return ll;
    };

    addControl(position, domid, html, cname) {     // add MapLibre control
        class HTMLControl {
            onAdd(map) {
                this._map = map;
                this._container = document.createElement('div');
                this._container.id = domid;
                this._container.className = 'maplibregl-ctrl ' + cname;
                this._container.innerHTML = html;
                this._container.style = "transform: initial;";
                return this._container;
            }
            onRemove() {
                this._container.parentNode.removeChild(this._container);
                this._map = undefined;
            }
        }
        this.map.addControl(new HTMLControl(), position);
    };

    addNavigation(position) {                               // add location
        this.map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '' }));
        this.map.addControl(new maplibregl.NavigationControl(), position);
        this.map.addControl(new maplibregl.GeolocateControl({
            trackUserLocation: true
        }), position);
    };

    addScale(position) {
        this.map.addControl(new maplibregl.ScaleControl(), position);
    };

    addPolygon(data, target, titleTag) {
        //console.log("geolib: addPolygon: " + target)
        let source = this.map.getSource(target)
        if (source !== undefined) {
            source.setData(data);       // 2回目以降の呼び出しはデータ設定のみ
        } else if (Conf.osm[target] !== undefined) {
            let exp = Conf.osm[target].expression;
            let zoom = Conf.view.poiZoom[target]
            this.map.addSource(target, { "type": "geojson", "data": data });
            this.map.addLayer({
                'id': target + "-lines", 'type': 'line', 'source': target,
                'layout': {
                    'line-cap': 'round',
                    'line-join': 'round'
                },
                'paint': {
                    'line-color': exp.stroke,
                    'line-width': exp["stroke-width"],
                    'line-opacity': exp["fill-opacity"]
                }
            });
            if (zoom !== undefined) this.map.setLayerZoomRange(target + '-lines', zoom, 23);

            mapLibre.map.addLayer({
                id: target + "-text", type: 'symbol', source: target,
                layout: {
                    "text-field": titleTag,             // 指定されたルールに沿う
                    "text-font": Conf.map.textFont,     // 使用可能なフォント（spriteに依存）
                    "text-size": Conf.map.textSize,
                    "text-anchor": "center",            // テキストの位置（上、中央、下など）
                    'symbol-placement': 'point', 'symbol-sort-key': 1,
                    'text-allow-overlap': true, 'text-ignore-placement': true
                },
                paint: {
                    "text-color": "#000000",
                    "text-halo-color": "#ffffff",
                    "text-halo-width": 2
                }
            })
            if (zoom !== undefined) this.map.setLayerZoomRange(target + '-lines', zoom, 23);

            this.map.addLayer({
                'id': target + "-fills",
                'type': 'fill',
                'source': target,
                'filter': ['==', '$type', 'Polygon'],
                'paint': {
                    'fill-color': exp.stroke,
                    'fill-opacity': exp["fill-opacity"]
                }
            });
            if (zoom !== undefined) this.map.setLayerZoomRange(target + '-fills', zoom, 23);
            if (!exp.poiView) {         // アイコン非表示のポイントはCircle表示
                this.map.addLayer({
                    id: target + '-points',
                    type: 'circle',
                    source: target,
                    filter: ['==', '$type', 'Point'], // ★ポイントだけ抽出
                    minzoom: 12,
                    paint: {
                        'circle-radius': [
                            'interpolate', ['linear'], ['zoom'],
                            12, exp["stroke-width"] / 2,
                            16, exp["stroke-width"],
                            20, exp["stroke-width"] * 2
                        ],
                        'circle-color': exp.stroke,
                        'circle-opacity': exp["fill-opacity"]
                    }
                });
                if (zoom !== undefined) this.map.setLayerZoomRange(target + '-points', zoom, 23);
            }
        }
    }
}
// GeoJson Control
class GeoCont {

    // csv(「”」で囲われたカンマ区切りテキスト)をConf.markerのcolumns、tagsをもとにgeojsonへ変換
    csv2geojson(csv, key) {
        let tag_key = [], columns = Conf.osm[key].columns;
        let texts = csv.split(/\r\n|\r|\n/).filter(val => val !== "");
        cols = texts[0].split('","').map(col => col.replace(/^"|"$|/g, ''));
        for (let i = 0; i < cols.length; i++) {
            if (columns[cols[i]] !== undefined) tag_key[i] = columns[cols[i]];
        };
        texts.shift();
        let geojsons = texts.map((text, line) => {
            cols = text.split('","').map(col => col.replace(/^"|"$/g, ''));
            let geojson = { "type": "Feature", "geometry": { "type": "Point", "coordinates": [] }, "properties": {} };
            let tag_val = {};
            for (let i = 0; i < cols.length; i++) {
                if (tag_key[i] !== undefined) {
                    tag_val[tag_key[i]] = tag_val[tag_key[i]] == undefined ? cols[i] : tag_val[tag_key[i]] + cols[i];
                };
            };
            geojson.geometry.coordinates = [tag_val._lng, tag_val._lat];
            geojson.id = `${key}/${line}`;
            Object.keys(tag_val).forEach((idx) => {
                if (idx.slice(0, 1) !== "_") geojson.properties[idx] = tag_val[idx];
            });
            Object.keys(Conf.osm[key].add_tag).forEach(tkey => {
                geojson.properties[tkey] = Conf.osm[key].add_tag[tkey];
            });
            return geojson;
        });
        return geojsons;
    }

    // 2線の交差チェック 線分ab(x,y)とcd(x,y) true:交差 / false:非交差
    judgeIentersected(a, b, c, d) {
        let ta = (c[0] - d[0]) * (a[1] - c[1]) + (c[1] - d[1]) * (c[0] - a[0]);
        let tb = (c[0] - d[0]) * (b[1] - c[1]) + (c[1] - d[1]) * (c[0] - b[0]);
        let tc = (a[0] - b[0]) * (c[1] - a[1]) + (a[1] - b[1]) * (a[0] - c[0]);
        let td = (a[0] - b[0]) * (d[1] - a[1]) + (a[1] - b[1]) * (a[0] - d[0]);
        return tc * td <= 0 && ta * tb <= 0; // 端点を含む
    }

    bboxclip(cords, lll) { // geojsonは[経度lng,緯度lat]
        let LL = mapLibre.get_LL(lll);
        new_cords = cords.filter((cord) => {
            if (cord[0] < (LL.NW.lng)) return false;
            if (cord[0] > (LL.SE.lng)) return false;
            if (cord[1] < (LL.SE.lat)) return false;
            if (cord[1] > (LL.NW.lat)) return false;
            return true;
        });
        return new_cords;
    }

    multi2flat(cords, type) {     // MultiPoylgon MultiString -> Polygon(broken) String
        let flats;
        switch (type) {
            case "Point":
                flats = cords;
                break;
            case "LineString":
                flats = [cords];
                break;
            case "MultiPolygon":
                flats = cords.flat();
                break;
            default:
                flats = [cords.flat()];
                break;
        };
        return flats;
    }

    flat2single(cords, type) {  // flat cordsの平均値(Poiの座標計算用)
        let cord;
        const calc_cord = function (cords) {
            let lat = 0, lng = 0, counts = cords.length;
            for (let cord of cords) {
                lat += cord[0];
                lng += cord[1];
            };
            return [lat / counts, lng / counts];
        };
        let lat = 0, lng = 0;
        switch (type) {
            case "Point":
                cord = [cords[0], cords[1]];
                break;
            case "LineString":
                cord = calc_cord(cords);
                break;
            case "MultiPolygon":
                let counts = 0
                for (let mcords of cords) {
                    for (let idx in mcords) {
                        cord = calc_cord(mcords[idx])
                        counts++
                        lat += cord[0], lng += cord[1]
                    }
                }
                cord = [lat / counts, lng / counts];
                break;
            default:        // Polygon
                for (let idx in cords) {
                    cord = calc_cord(cords[idx]);
                    lat += cord[0];
                    lng += cord[1];
                }
                cord = [lat / cords.length, lng / cords.length];
                break;
        };
        return cord;
    }

    // 指定した方位の衝突するcords内のidxを返す
    get_maxll(st_cord, cords, exc_idx, orient) {
        let LLL = mapLibre.get_LL(true), idx, ed_cord = [], found = -1;
        if (orient == "N") ed_cord = [st_cord[0], LLL.NW.lat]; // [経度lng,緯度lat]
        if (orient == "S") ed_cord = [st_cord[0], LLL.SE.lat];
        if (orient == "W") ed_cord = [LLL.NW.lng, st_cord[1]];
        if (orient == "E") ed_cord = [LLL.SE.lng, st_cord[1]];

        for (idx = 0; idx < cords.length; idx++) {  //
            if (cords[idx] !== undefined && exc_idx !== idx) {  //
                found = cords[idx].findIndex((ck_cord, ck_id) => {
                    if (ck_id < cords[idx].length - 1) return geoCont.judgeIentersected(st_cord, ed_cord, ck_cord, cords[idx][ck_id + 1]);
                    return false;
                });
            };
            if (found > -1) break;
        };
        return (found > -1) ? idx : false;
    }

    // lnglatがLL(get_LL)範囲内であれば true
    checkInner(lnglat, LL) {
        return lnglat !== undefined ? (LL.NW.lat > lnglat[1] && LL.SE.lat < lnglat[1] && LL.NW.lng < lnglat[0] && LL.SE.lng > lnglat[0]) : false
    }

    ll2tile(ll, zoom) {
        const maxLat = 85.05112878;     // 最大緯度
        zoom = parseInt(zoom);
        let lat = parseFloat(ll.lat);       // 緯度
        let lng = parseFloat(ll.lng);       // 経度
        let pixelX = parseInt(Math.pow(2, zoom + 7) * (lng / 180 + 1));
        let tileX = parseInt(pixelX / 256);
        let pixelY = parseInt((Math.pow(2, zoom + 7) / Math.PI) * ((-1 * Math.atanh(Math.sin((Math.PI / 180) * lat))) + Math.atanh(Math.sin((Math.PI / 180) * maxLat))));
        let tileY = parseInt(pixelY / 256);
        return { tileX, tileY };
    }

    tile2ll(tt, zoom, direction) {
        const maxLat = 85.05112878;     // 最大緯度
        zoom = parseInt(zoom);
        if (direction == "SE") {
            tt.tileX++;
            tt.tileY++;
        }
        let pixelX = parseInt(tt.tileX * 256); // タイル座標X→ピクセル座標Y
        let pixelY = parseInt(tt.tileY * 256); // タイル座標Y→ピクセル座標Y
        let lng = 180 * (pixelX / Math.pow(2, zoom + 7) - 1);
        let lat = (180 / Math.PI) * (Math.asin(Math.tanh((-1 * Math.PI / Math.pow(2, zoom + 7) * pixelY) + Math.atanh(Math.sin(Math.PI / 180 * maxLat)))));
        return { lat, lng };
    }

    get_maparea(mode) {	// OverPassクエリのエリア指定
        let LL;
        if (mode == "LLL") {
            LL = mapLibre.get_LL(true);
        } else {
            LL = mapLibre.get_LL();
        };
        return `(${LL.SE.lat},${LL.NW.lng},${LL.NW.lat},${LL.SE.lng});`;
    }

    // Debug Code
    ccircle(cords) {   // view cord in map
        let geojson = {
            features: [{
                geometry: { coordinates: cords },
                properties: {},
                type: "Feature"
            }]
        };
        geoCont.gcircle(geojson);
    }

    box_write(NW, SE) {  // view box
        let bcords = [[NW.lat, NW.lng], [NW.lat, SE.lng], [SE.lat, SE.lng], [SE.lat, NW.lng], [NW.lat, NW.lng]];
        let coords = bcords.map(p => [p[1], p[0]]);        // 緯度経度を [lng, lat] に変換（GeoJSON仕様）
        let rectGeoJSON = { "type": "Feature", "geometry": { "type": "Polygon", "coordinates": [coords] }, "properties": {} };
        if (mapLibre.map.getSource('viewbox')) {
            mapLibre.map.getSource('viewbox').setData(rectGeoJSON);
        } else {
            mapLibre.map.addSource('viewbox', { "type": "geojson", "data": rectGeoJSON });
        }
        mapLibre.map.addLayer({
            'id': 'viewbox', 'type': 'line', 'source': 'viewbox', 'layout': { 'line-cap': 'round', 'line-join': 'round' },
            'paint': { 'line-color': "#000000", 'line-width': 4 }
        });
    }

    bbox_write() { // view maparea
        let LL = mapLibre.get_LL();
        let bcords = [[LL.NW.lat, LL.NW.lng], [LL.NW.lat, LL.SE.lng], [LL.SE.lat, LL.SE.lng], [LL.SE.lat, LL.NW.lng], [LL.NW.lat, LL.NW.lng]];
        L.polyline(bcords, { color: 'red', weight: 4 }).addTo(map);

        LL = mapLibre.get_LL(true);
        bcords = [[LL.NW.lat, LL.NW.lng], [LL.NW.lat, LL.SE.lng], [LL.SE.lat, LL.SE.lng], [LL.SE.lat, LL.NW.lng], [LL.NW.lat, LL.NW.lng]];
        L.polyline(bcords, { color: 'black', weight: 4 }).addTo(map);
    }
}

