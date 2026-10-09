"use strict";

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

    // Pointは代表座標、Polygon/MultiPolygonは画面範囲との交差で表示対象を判定する。
    // 大きな公園内を拡大したとき、代表点が画面外でも公園をリストから消さない。
    checkFeatureInner(feature, lnglat, LL) {
        if (this.checkInner(lnglat, LL)) return true;
        const type = feature?.geometry?.type;
        if (type !== "Polygon" && type !== "MultiPolygon") return false;
        if (typeof turf === "undefined"
            || typeof turf.bboxPolygon !== "function"
            || typeof turf.booleanIntersects !== "function") return false;
        try {
            const viewport = turf.bboxPolygon([LL.NW.lng, LL.SE.lat, LL.SE.lng, LL.NW.lat]);
            return turf.booleanIntersects(feature, viewport);
        } catch (error) {
            console.warn("GeoCont.checkFeatureInner: polygon intersection failed", error);
            return false;
        }
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

    // 既存の選択・解除呼び出しとの互換用。選択は一時ハイライトで示し、輪は描画しない。
    writePoiCircle() {
        const map = mapLibre.map;
        if (!map) return;
        if (map.getLayer("marker-layer")) map.removeLayer("marker-layer");
        if (map.getSource("marker-source")) map.removeSource("marker-source");
    }


    // 指定したgeojsonを描画
    writePolygon(geojson) {
        const sourceId = "temp-polygon-source";
        const layerId = "temp-polygon-layer";
        const isPoint = geojson.geometry.type === "Point";
        const params = isPoint
            ? {
                id: layerId, type: "circle", source: sourceId,
                paint: {
                    "circle-radius": Conf.map.pointMarkerRadius ?? 48,
                    "circle-color": Conf.map.polygonMarker["fill-color"],
                    "circle-opacity": Conf.map.polygonMarker["fill-opacity"]
                }
            }
            : { id: layerId, type: "fill", source: sourceId, paint: Conf.map.polygonMarker };
        const processedFeature = geojson;
        clearTimeout(this.#flashing);
        clearInterval(this.#fadeing);
        this.#flashing = null;
        this.#fadeing = null;
        let source = mapLibre.map.getSource("temp-polygon-source")
        if (source == undefined) {
            mapLibre.map.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [processedFeature] } });
            mapLibre.map.addLayer(params);
        } else {      // 印が表示されている最中の呼び出し
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
        clearTimeout(this.#flashing);
        clearInterval(this.#fadeing);
        this.#flashing = null;
        this.#fadeing = null;
        let source = mapLibre.map.getSource(sourceId)
        if (source !== undefined) {
            if (mapLibre.map.getLayer(layerId)) mapLibre.map.removeLayer(layerId);
            mapLibre.map.removeSource(sourceId);
        }
    }

    flashPolygon(geojson, fadetime = 4000) {        // 数秒間だけ指定したポリゴンを描写
        const sourceId = "temp-polygon-source";
        const layerId = "temp-polygon-layer";
        const fadeOutLayer = function (map, layerId, sourceId, duration, steps) {            // フェードアウト関数
            const hasLayer = () => {
                try {
                    return Boolean(map && map.getLayer(layerId));
                } catch (error) {
                    return false;
                }
            };
            let currentStep = 0;
            geoCont.#fadeing = setInterval(() => {
                if (!hasLayer()) {
                    clearInterval(geoCont.#fadeing);
                    geoCont.#fadeing = null;
                    return;
                }
                const value = Math.round((0.2 - currentStep / steps) * 100) / 100;      // 小数第2位で四捨五入
                const opacity = Math.max(0, Math.min(1, value))
                const opacityProperty = map.getLayer(layerId)?.type === "circle" ? "circle-opacity" : "fill-opacity";
                map.setPaintProperty(layerId, opacityProperty, opacity);
                currentStep++;
                if (opacity === 0 || currentStep > steps) {
                    clearInterval(geoCont.#fadeing);
                    geoCont.#fadeing = null;
                    if (hasLayer()) map.removeLayer(layerId);
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

