"use strict";
// MapLibre Control
class Maplibre {

    constructor() {
        this.map;
        this.minimap;
        this.Control = { "locate": "", "maps": "" };    // MapLibre object
        this.popup = null;
        this.styles = {};
        this.selectStyle;
        this.TriggerRepaint;
    }

    init(Conf) {
        function extractFilenamesFromTag(tag) { // タグからファイル名を返す
            const result = new Set()
            for (const key in tag) {
                const valueMap = tag[key]
                for (const val in valueMap) result.add(valueMap[val])
            }
            return result
        }

        function extractFilenamesFromSubtag(subtag) {
            const result = new Set()
            for (const keyEqVal in subtag) {
                const valueMap = subtag[keyEqVal]
                for (const subkey in valueMap) {
                    const icons = valueMap[subkey]
                    for (const subval in icons) result.add(icons[subval])
                }
            }
            return result
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
            this.TriggerRepaint = this.map.triggerRepaint;
            const fnames1 = new Set([...extractFilenamesFromTag(Conf.marker.tag), ...extractFilenamesFromSubtag(Conf.marker.subtag)]);
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
        if (this.map !== undefined) {
            this.map.getCanvas().style.pointerEvents = "";
            this.map.triggerRepaint = this.TriggerRepaint;
            //this.map.triggerRepaint(); // 即時再描画
        }
        if (this.minimap !== undefined) {
            this.minimap.resize()
            this.minimap.getCanvas().style.pointerEvents = "";
            this.minimap.triggerRepaint = this.TriggerRepaint;
            this.minimap.triggerRepaint(); // 即時再描画
        }
    };

    stop() {
        if (this.map !== undefined) {
            this.map.getCanvas().style.pointerEvents = "none";
            this.map.triggerRepaint = () => { };
        }
        if (this.minimap !== undefined) {
            this.minimap.getCanvas().style.pointerEvents = "none";
            this.minimap.triggerRepaint = () => { };
        }
    };

    // Change Map Style / tilename:タイル名。空欄の時は設定された次のスタイル
    changeMap(tilename) {
        let styles = Object.keys(this.styles);
        let nextSt = (styles.indexOf(this.selectStyle) + 1) % styles.length;
        while (Conf.tile[styles[nextSt]].skip == true) {
            nextSt = (nextSt + 1) % styles.length;
        }
        this.selectStyle = !tilename ? styles[nextSt] : tilename;
        mapLibre.map.setStyle(this.styles[this.selectStyle]);
        setTimeout(() => {
            mapLibre.map.setSky({ "sky-color": "#5090D0" });
            mapLibre.map.setSky(Conf.skyStyle);
        }, 1000)
        return this.selectStyle;
    };

    on(event, callback) { this.map.on(event, callback); };

    openPopup(marker, params) {
        if (this.popup !== null) this.popup.close();
        setTimeout((() => { this.popup = L.popup(marker.getLngLat(), params).openOn(this.map); }).bind(this), 100);
    };

    flyTo(ll, zoomlv) { this.map.flyTo({ center: ll, zoom: zoomlv, speed: 2 }); };

    // return Zoom Level / round: Math.Round(true or false)
    getZoom(round) { return round ? Math.round(this.map.getZoom() * 10) / 10 : this.map.getZoom(); };

    setZoom(zoomlv) { this.map.flyTo({ center: this.map.getCenter(), zoom: zoomlv, speed: 0.5 }); };

    getCenter() { return this.map.getBounds().getCenter(); };

    get_LL(lll) {			// LngLatエリアの設定 [経度lng,緯度lat] lll:少し大きめにする
        let ll = { "NW": this.map.getBounds().getNorthWest(), "SE": this.map.getBounds().getSouthEast() };
        if (lll) {
            ll.NW.lng = ll.NW.lng * 0.999997;
            ll.SE.lng = ll.SE.lng * 1.000003;
            ll.SE.lat = ll.SE.lat * 0.999997;
            ll.NW.lat = ll.NW.lat * 1.000003;
        }
        return ll;
    };

    getMiniLL(lll) {
        if (this.minimap == undefined) return undefined
        let ll = { "NW": this.minimap.getBounds().getNorthWest(), "SE": this.minimap.getBounds().getSouthEast() };
        if (lll) {
            ll.NW.lng = ll.NW.lng * 0.999997;
            ll.SE.lng = ll.SE.lng * 1.000003;
            ll.SE.lat = ll.SE.lat * 0.999997;
            ll.NW.lat = ll.NW.lat * 1.000003;
        }
        return ll;
    }

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
        this.map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), position);
    };

    addScale(position) { this.map.addControl(new maplibregl.ScaleControl(), position); };

    //
    updateVisitedCountry() {
        let visitedcountory = poiCont.getPolygonVisitedCountory()
        let viss = this.minimap.getSource("viss");
        if (viss !== undefined) viss.setData({ type: 'FeatureCollection', features: visitedcountory })
    }

    // ミニマップ表示(初期設定)
    addMiniMap() {
        return new Promise((resolve) => {
            console.log("addMiniMap: Start")
            const mmap = document.getElementById("mini-map")
            if (this.minimap === null || this.minimap === undefined) {  // 初回設定
                let planet = Conf.tile.miniMap.style
                this.minimap = new maplibregl.Map({ container: 'mini-map', style: planet, interactive: true, attributionControl: false })
                this.minimap.on('style.load', () => {
                    let allcountry = []
                    let visitedcountory = poiCont.getPolygonVisitedCountory()
                    let countries = poiCont.getAllOSMCountryCode()      // 国コードがある施設一覧
                    if (countries.length > 0) {
                        countries.forEach((CCode) => {
                            let CPoly = poiCont.getPolygonByCountryCode(CCode)
                            if (CPoly !== undefined) allcountry.push(CPoly[0])
                        })
                    }
                    this.minimap.addSource("alls", { type: 'geojson', data: { type: 'FeatureCollection', features: allcountry } })
                    this.minimap.addSource("viss", { type: 'geojson', data: { type: 'FeatureCollection', features: visitedcountory } })
                    this.minimap.addSource("sels", { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
                    this.minimap.addLayer({ id: 'alls-fill', type: 'fill', source: 'alls', paint: { 'fill-color': '#002200', 'fill-opacity': 0.2 } })
                    this.minimap.addLayer({ id: 'viss-fill', type: 'fill', source: 'viss', paint: { 'fill-color': '#88FF88', 'fill-opacity': 0.3 } })
                    this.minimap.addLayer({ id: 'sels-fill', type: 'fill', source: 'sels', paint: { 'fill-color': '#FF8844', 'fill-opacity': 0.6 } })
                    this.minimap.setProjection({ "type": "globe" }) // globe表示には fog が必要
                    mapLibre.addMiniMapControl("top-left", "flags", "");
                    mmap.classList.remove("d-none")
                    this.minimap.setCenter(Conf.map.viewCenter)
                    this.minimap.setZoom(Conf.minimap.initZoom)
                    this.minimap.on('click', this.#miniMapClick)
                    console.log("addMiniMap: End")
                    resolve(true)
                })
            } else {
                resolve(true)
            }
        })
    }

    addMiniMapControl(position, domid, html, cname) {     // add MapLibre control for MiniMap
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
        this.minimap.addControl(new HTMLControl(), position);
    }

    viewMiniMap(view) {
        const method = view ? "remove" : "add"
        document.getElementById("mini-map").classList[method]("d-none")
    }

    #miniMapClick(e) {
        console.log("#miniMapClick: Start")
        const pt = turf.point([e.lngLat.lng, e.lngLat.lat])
        const matches = poiCont.getPolygonByPoint(pt)  // 国判定
        if (matches.length > 0) {               // 地図移動（miniMapとmapの両方）
            let CCode = matches[0].properties["ISO3166-1-Alpha-2"];
            let OSMID = poiCont.getOsmidByCountryCode(CCode);
            if (OSMID !== "") {
                poiCont.select(OSMID, !cMapMaker.minimap, cMapMaker.minimap ? -1 : 0);
                mapLibre.#highlightCountry(matches)
                let geojson = poiCont.get_osmid(OSMID).geojson
                geoCont.writePoiCircle(geojson)
                geoCont.flashPolygon(geojson)
                console.log("#miniMapClick: End")
            }
        }
    }

    // ISO-3166 Alpha-2に基づいてminimapを移動してハイライト化
    showCountryByCode(CCode) {
        let matches = []
        console.log("showCountryByCode");
        let countries = CCode.split(";")
        this.addMiniMap().then(() => {
            this.updateVisitedCountry()
            for (let cno = 0; cno < countries.length; cno++) {
                const match = poiCont.getPolygonByCountryCode(countries[cno]);
                if (match.length == 0) { console.warn("showCountryByCode: Not found: ", countries[cno]); continue }
                matches.push(match[0])
            }
            this.#highlightCountry(matches)
        })
    }

    // 指定したGeoJsonから一番大きいポリゴンを返す
    #getLargestPolygonFromMultiPolygon(feature) {
        if (feature.geometry.type !== "MultiPolygon") return feature;
        const polygons = feature.geometry.coordinates.map(coords => turf.polygon(coords, feature.properties));
        let largest = polygons[0];
        let maxArea = turf.area(largest);
        for (let i = 1; i < polygons.length; i++) {
            const area = turf.area(polygons[i]);
            if (area > maxArea) { largest = polygons[i]; maxArea = area; }
        }
        return largest;
    }

    // 指定したgeoJsonをハイライト
    #highlightCountry(feature) {
        const highlight = function () {
            console.log("geoLib: #highlightCountry: " + feature[0].properties["ISO3166-1-Alpha-2"])
            this.minimap.getSource("sels").setData({ type: 'FeatureCollection', features: feature })
            let largestFeature = this.#getLargestPolygonFromMultiPolygon(feature[0])
            let maxArea = turf.area(largestFeature)
            for (let i = 1; i < feature.length; i++) {
                const candidate = this.#getLargestPolygonFromMultiPolygon(feature[i])
                const area = turf.area(candidate)
                if (area > maxArea) largestFeature = candidate; maxArea = area
            }
            const bbox = turf.bbox(largestFeature)
            const bboxCenter = function (bbox) {
                const [minX, minY, maxX, maxY] = bbox
                return [(minX + maxX) / 2, (minY + maxY) / 2]
            }
            const area = turf.area(largestFeature)
            const center = bboxCenter(bbox)
            const zoom = area < 5e9 ? 4.5 : area < 1e11 ? 3.5 : area < 1e12 ? 3 : 2
            this.minimap.flyTo({ center, zoom: zoom, duration: 1000, essential: true })
        }.bind(this)
        if (feature.length > 0) highlight()
    }

    // 指定した国コードリストの画像を読み込む
    async addCountryFlagsImage(countries) {
        async function loadFlagIcons() {
            const images = await Promise.all(
                countries.map(async (CCode) => {
                    let image;
                    const url = `https://flagcdn.com/w40/${CCode.toLowerCase()}.png`;
                    try {
                        image = await mapLibre.map.loadImage(url)
                        return { status: true, file: `flag-${CCode}`, image: image.data };
                    } catch (err) {
                        console.log("addCountryFlagsImage: Error. " + CCode);
                        return { status: false };
                    }
                })
            );
            for (const { file, image } of images) mapLibre.map.addImage(file, image);
        }
        await loadFlagIcons();
    }

    addPolygon(data, target, titleTag) {
        //console.log("geolib: addPolygon: " + target)
        let source = this.map.getSource(target)
        if (source !== undefined) {
            source.setData(data);       // 2回目以降の呼び出しはデータ設定のみ
        } else if (Conf.osm[target] !== undefined) {
            let exp = Conf.osm[target].expression;
            let zoom = Conf.poiView.poiZoom[target]
            this.map.addSource(target, { "type": "geojson", "data": data });
            this.map.addLayer({
                'id': target + "-lines", 'type': 'line', 'source': target,
                'layout': { 'line-cap': 'round', 'line-join': 'round' },
                'paint': { 'line-color': exp.stroke, 'line-width': exp["stroke-width"], 'line-opacity': exp["fill-opacity"] }
            });
            if (zoom !== undefined) this.map.setLayerZoomRange(target + '-lines', zoom, 23);

            if (Conf.map.textSize > 0) {        // fontsizeが0より上の場合
                mapLibre.map.addLayer({
                    id: target + "-text", type: 'symbol', source: target,
                    layout: {
                        "text-field": titleTag,             // 指定されたルールに沿う
                        "text-font": Conf.map.textFont,     // 使用可能なフォント（spriteに依存）
                        "text-size": Conf.map.textSize,
                        "text-anchor": "center",            // テキストの位置（上、中央、下など）
                        'symbol-placement': 'point', 'symbol-sort-key': 1,
                        'text-allow-overlap': true, 'text-ignore-placement': true,
                        'text-offset': [0, 1]
                    },
                    paint: { "text-color": "#000000", "text-halo-color": "#ffffff", "text-halo-width": 2 }
                })
                if (zoom !== undefined) this.map.setLayerZoomRange(target + '-text', zoom, 23)
            }

            let icon = Conf.osm[target].expression.imageIcon
            let size = Conf.osm[target].expression.imageSize
            if (icon !== undefined) {
                mapLibre.map.addLayer({
                    id: target + "-icon", type: 'symbol', source: target, minzoom: 12,
                    layout: {
                        'icon-anchor': 'top-left',
                        'symbol-placement': 'point', 'symbol-sort-key': 0, "icon-offset": [-80, -50],
                        'icon-allow-overlap': true, 'icon-ignore-placement': true,
                        'icon-image': icon, 'icon-size': size == undefined ? 1 : size,
                    }
                })
            }

            this.map.addLayer({
                'id': target + "-fills", 'type': 'fill', 'source': target, 'filter': ['==', '$type', 'Polygon'],
                'paint': { 'fill-color': exp.stroke, 'fill-opacity': exp["fill-opacity"] }
            });
            if (zoom !== undefined) this.map.setLayerZoomRange(target + '-fills', zoom, 23)
            if (!exp.poiView) {         // アイコン非表示のポイントはCircle表示
                this.map.addLayer({
                    id: target + '-points', type: 'circle', source: target,
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

    #flashing = null;  // 印をつけている間は1以上の数値
    #fadeing = null

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
        if (!lnglat) return false;
        const [lng, lat] = lnglat;
        const insideLat = LL.SE.lat <= lat && lat <= LL.NW.lat;        // 緯度が南端以上かつ北端以下
        const insideLng = LL.NW.lng <= lng && lng <= LL.SE.lng;        // 経度が西端以上かつ東端以下
        return insideLat && insideLng;
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

    // geojsonを元に赤点線のマーカーを表示
    writePoiCircle(geojson) {
        const sourceID = "marker-source"
        const layerID = "marker-layer"
        let source = mapLibre.map.getSource(sourceID)
        let layer = mapLibre.map.getLayer(layerID)
        if (geojson !== "" && geojson !== undefined) {
            console.log("writePoiCircle Start: " + geojson.properties.name)
            let marker = { "type": "FeatureCollection", "features": [geojson] }
            if (source !== undefined) {
                source.setData(marker)
            } else {
                mapLibre.map.addSource(sourceID, { type: 'geojson', data: marker })
                if (!layer) {
                    mapLibre.map.addLayer({
                        id: layerID, type: 'symbol', source: sourceID,
                        layout: {
                            'symbol-placement': 'point', 'symbol-sort-key': 0,
                            'icon-allow-overlap': true, 'icon-ignore-placement': true,
                            'icon-image': 'circle_marker.png', 'visibility': 'visible',
                            'icon-size': ['step', ['zoom'], 0.6, 16, 0.8, 17, 1.0]
                        }
                    }, 'marker-fg-attention')
                }
            }
            mapLibre.map.setLayoutProperty(layerID, 'visibility', 'visible');
        } else {
            console.log("writePoiCircle Clear")
            if (layer) mapLibre.map.setLayoutProperty(layerID, 'visibility', 'none');
        }
    }

    // 指定したgeojsonを描画
    writePolygon(geojson) {
        const sourceId = "temp-polygon-source";
        const layerId = "temp-polygon-layer";
        const params = { id: layerId, type: "fill", source: sourceId, paint: Conf.map.polygonMarker }
        const processedFeature = (geojson.geometry.type === "Point")
            ? turf.circle(geojson.geometry.coordinates, 12, { steps: 64, units: "meters" }) : geojson;
        let source = mapLibre.map.getSource("temp-polygon-source")
        if (source == undefined) {
            mapLibre.map.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [processedFeature] } });
            mapLibre.map.addLayer(params);
        } else {      // 印が表示されている最中の呼び出し
            clearTimeout(this.#flashing);
            clearInterval(this.#fadeing);
            if (mapLibre.map.getLayer(layerId)) mapLibre.map.removeLayer(layerId);
            if (mapLibre.map.getSource(sourceId)) mapLibre.map.removeSource(sourceId);
            mapLibre.map.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [processedFeature] } });
            mapLibre.map.addLayer(params);
        }
    }

    // writePolygonで描いたポリゴンを削除
    clearPolygon() {
        const sourceId = "temp-polygon-source";
        const layerId = "temp-polygon-layer";
        let source = mapLibre.map.getSource(sourceId)
        if (source !== undefined) {
            clearTimeout(this.#flashing);
            clearInterval(this.#fadeing);
            if (mapLibre.map.getLayer(layerId)) mapLibre.map.removeLayer(layerId);
            mapLibre.map.removeSource(sourceId);
        }
    }

    flashPolygon(geojson, fadetime = 4000) {        // 数秒間だけ指定したポリゴンを描写
        const sourceId = "temp-polygon-source";
        const layerId = "temp-polygon-layer";
        const fadeOutLayer = function (map, layerId, sourceId, duration, steps) {            // フェードアウト関数
            let currentStep = 0;
            geoCont.#fadeing = setInterval(() => {
                const value = Math.round((0.2 - currentStep / steps) * 100) / 100;      // 小数第2位で四捨五入
                const opacity = Math.max(0, Math.min(1, value))
                map.setPaintProperty(layerId, "fill-opacity", opacity);
                currentStep++;
                if (currentStep > steps) {
                    clearInterval(geoCont.#fadeing);
                    if (map.getLayer(layerId)) map.removeLayer(layerId);
                    if (map.getSource(sourceId)) map.removeSource(sourceId);
                }
            }, duration / steps);
        }
        this.writePolygon(geojson)
        this.#flashing = setTimeout(() => { fadeOutLayer(mapLibre.map, layerId, sourceId, 1500, 30) }, fadetime);    // 5秒後にフェードアウト
    }

    writeBbox(LL) {
        let map = mapLibre.map;        // 表示範囲の座標を取得
        let coords = [[LL.NW.lng, LL.NW.lat], [LL.SE.lng, LL.NW.lat], [LL.SE.lng, LL.SE.lat], [LL.NW.lng, LL.SE.lat], [LL.NW.lng, LL.NW.lat]];
        const geojson2 = { "type": "Feature", "geometry": { "type": "Polygon", "coordinates": [coords] } };
        if (map.getSource("bbox-black")) {
            map.removeLayer("bbox-black-line");
            map.removeSource("bbox-black");
        }
        map.addSource("bbox-black", { "type": "geojson", "data": geojson2 });
        map.addLayer({ "id": "bbox-black-line", "type": "line", "source": "bbox-black", "paint": { "line-color": "black", "line-width": 4 } });
    }
}

