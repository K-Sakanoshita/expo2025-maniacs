"use strict";
// OverPass Server Control(With easy cache)
class OverPassControl {

    constructor() {
        this.Cache = { "geojson": [], "targets": [] };   // Cache variable
        this.LLc = {};
        this.CacheZoom = 14;
        this.UseServer = 0;
        this.CacheIdxs = {};		// 連想配列にtargets内のidxを保存
    }

    // Overpass APIからデータ取得
    // targets: Conf.osm内の目標 / progress: 処理中に呼び出すプログラム
    getGeojson(targets, progress) {
        return new Promise((resolve, reject) => {
            var LL = mapLibre.get_LL()
            let CT = geoCont.ll2tile(mapLibre.getCenter(), overPassCont.CacheZoom)
            console.log("overPassCont: Check:" + CT.tileX + "." + CT.tileY)
            if (overPassCont.LLc[CT.tileX + "." + CT.tileY] !== void 0 || Conf.static.mode) {
                console.log("overPassCont: Cache Hit.")       // Within Cache range
                resolve(overPassCont.Cache)
            } else {
                let tileNW = geoCont.ll2tile(LL.NW, overPassCont.CacheZoom)	// 緯度経度→タイル座標(左上、右下)→緯度経度
                let tileSE = geoCont.ll2tile(LL.SE, overPassCont.CacheZoom)
                let NW = geoCont.tile2ll(tileNW, overPassCont.CacheZoom, "NW")
                let SE = geoCont.tile2ll(tileSE, overPassCont.CacheZoom, "SE")
                let maparea = SE.lat + ',' + NW.lng + ',' + NW.lat + ',' + SE.lng
                let query = ""
                targets.forEach(key => {
                    if (Conf.osm[key] !== undefined) Conf.osm[key].overpass.forEach(val => query += val + ";")
                })
                let url = Conf.system.OverPassServer[overPassCont.UseServer] + `?data=[out:json][timeout:30][bbox:${maparea}];(${query});out body meta;>;out skel;`
                console.log("overPassCont: GET: " + url)
                $.ajax({
                    "type": 'GET', "dataType": 'json', "url": url, "cache": false, "xhr": () => {
                        var xhr = new window.XMLHttpRequest();
                        xhr.addEventListener("progress", (evt) => {
                            console.log("overPassCont: Progress: " + evt.loaded);
                            if (progress !== undefined) progress(evt.loaded);
                        }, false);
                        return xhr;
                    }
                }).done(function (data) {
                    console.log("overPassCont: done.")
                    // geoCont.box_write(NW, SE);		// Cache View
                    for (let y = tileNW.tileY; y < tileSE.tileY; y++) {
                        for (let x = tileNW.tileX; x < tileSE.tileX; x++) {
                            overPassCont.LLc[x + "." + y] = true
                        }
                    }
                    if (data.elements.length == 0) { resolve(); return };
                    let osmxml = data;
                    let geojson = osmtogeojson(osmxml, { flatProperties: true });
                    overPassCont.setCache(geojson.features);
                    overPassCont.Cache.geojson.forEach((key, idx) => {	// no target no geojson
                        if (overPassCont.Cache.targets[idx] == undefined) {
                            delete overPassCont.Cache.geojson[idx];
                            delete overPassCont.Cache.targets[idx];
                        };
                    });
                    console.log("overPassCont: Cache Update");
                    resolve(overPassCont.Cache);
                }).fail(function (jqXHR, statusText, errorThrown) {
                    console.log("overPassCont: " + statusText);
                    overPassCont.UseServer = (overPassCont.UseServer + 1) % Conf.system.OverPassServer.length;
                    reject(jqXHR, statusText, errorThrown);
                });
            };
        });
    }

    getOsmIds(osmids) {
        osmids = [...new Set(osmids)];
        return new Promise((resolve, reject) => {
            let params = "(", pois = { node: "", way: "", relation: "" };
            osmids.forEach(id => {
                let query = id.split("/");
                pois[query[0]] += query[1] + ",";
            });
            Object.keys(pois).forEach(category => {
                if (pois[category] !== "") params += `${category}(id:${pois[category].slice(0, -1)});`;
            });
            const query = `[out:json][timeout:20];${params});out body meta;>;out skel;`;
            const url = Conf.system.OverPassServer[overPassCont.UseServer]; // ベースURLのみ

            console.log("overPassCont: POST to: " + url);
            console.log("overPassCont: query: " + query);

            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: query,
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(osmxml => {
                    console.log("overPassCont: getOsmIds: done.");
                    if (!osmxml.elements || osmxml.elements.length === 0) {
                        resolve();
                        return;
                    }
                    const geojson = osmtogeojson(osmxml, { flatProperties: true });
                    overPassCont.setCache(geojson.features);
                    console.log("overPassCont: Cache Update");
                    resolve(overPassCont.Cache);
                })
                .catch(error => {
                    console.error("overPassCont: fetch error:", error);
                    overPassCont.UseServer = (overPassCont.UseServer + 1) % Conf.system.OverPassServer.length;
                    reject(error);
                });
        });
    }


    // 指定したpropertiesがtagsに含まれるか判定
    isTagsInclude(properties, tags) {
        for (let key in properties) {
            const tagWithEqual = `${key}=${properties[key]}`	// `key=value`の形式をチェック
            const tagWithNoEqual = `${key}!=${properties[key]}`	// `key!=value`の形式をチェック
            if (tags.includes(tagWithEqual)) return true
            if (tags.includes(tagWithNoEqual)) return false
            if (tags.includes(key)) return true					// `key`のみの形式をチェック
        }
        return false;
    }

    // tagsを元にキャッシュセット
    setCache(geojson) {
        let osmkeys = Object.keys(Conf.osm).filter(key => Conf.osm[key].file == undefined);
        osmkeys.forEach(target => {
            geojson.forEach((val) => {
                let isTarget = overPassCont.isTagsInclude(val.properties, Conf.osm[target].tags)
                let cidx = overPassCont.CacheIdxs[val.properties.id];
                if (cidx == undefined && isTarget) { // キャッシュが無い&ターゲット時は更新
                    overPassCont.Cache.geojson.push(val);
                    overPassCont.Cache.targets.push([target]);
                    cidx = overPassCont.Cache.geojson.length - 1;
                    overPassCont.CacheIdxs[val.properties.id] = cidx;
                } else if (isTarget) {
                    let ot = overPassCont.Cache.targets[cidx]
                    overPassCont.Cache.targets[cidx] = ot.concat(target);
                }
            });
        })
    }

    getTarget(ovanswer, target) {
        let geojson = ovanswer.geojson.filter(function (val, gidx) {
            let found = false
            for (let tidx in ovanswer.targets[gidx]) {
                if (ovanswer.targets[gidx][tidx] == target) { found = true; break }
            };
            return found
        });
        return geojson
    }

    setOsmJson(osmjson) {		// set Static osmjson
        let geojson = osmtogeojson(osmjson, { flatProperties: true });
        overPassCont.setCache(geojson.features);
        return overPassCont.Cache;
    }

}
