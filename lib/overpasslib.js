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
            const controller = new AbortController();
            const signal = controller.signal;
            let url = Conf.system.OverPassServer[overPassCont.UseServer];
            var LL = mapLibre.get_LL()
            let CT = geoCont.ll2tile(mapLibre.getCenter(), overPassCont.CacheZoom)
            console.log("overPassCont: Check:" + CT.tileX + "." + CT.tileY)
            if (overPassCont.LLc[CT.tileX + "." + CT.tileY] !== void 0 || Conf.static.mode) {
                console.log("overPassCont: Cache Hit.")       // Within Cache range
                resolve(overPassCont.Cache)
            } else {
                let query = "";
                let tileNW = geoCont.ll2tile(LL.NW, overPassCont.CacheZoom)	// 緯度経度→タイル座標(左上、右下)→緯度経度
                let tileSE = geoCont.ll2tile(LL.SE, overPassCont.CacheZoom)
                let NW = geoCont.tile2ll(tileNW, overPassCont.CacheZoom, "NW")
                let SE = geoCont.tile2ll(tileSE, overPassCont.CacheZoom, "SE")
                let maparea = "[bbox:" + SE.lat + ',' + NW.lng + ',' + NW.lat + ',' + SE.lng + "]";
                targets.forEach(key => {
                    if (Conf.osm[key] !== undefined) Conf.osm[key].overpass.forEach(val => query += val + ";")
                })
                query = `[out:json][timeout:30]${maparea};(${query});out body meta;>;out skel;`
                console.log("overPassCont: GET: " + url)
                const data = new URLSearchParams();
                data.set('data', query);
                this.fetchOverpass(data, (loaded) => {
                    if (progress !== undefined) progress(loaded);
                    console.log("Loaded bytes:", loaded);
                }).then(data => {
                    console.log("overPassCont: done.")
                    //geoCont.box_write(NW, SE);		// Cache View
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
                }).catch(err => {
                    console.log("overPassCont: " + err);
                    overPassCont.UseServer = (overPassCont.UseServer + 1) % Conf.system.OverPassServer.length;
                    reject(err);
                });
            };
        });
    }

    getOsmIds(osmids) {
        const query = `[out:json][timeout:20];${params});out body meta;>;out skel;`;
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
            console.log("getOsmIds: query: " + query);
            this.fetchOverpass(data, (loaded) => {
                if (progress !== undefined) progress(loaded);
                console.log("Loaded bytes:", loaded);
            }).then(osmxml => {
                console.log("getOsmIds: getOsmIds: done.");
                if (!osmxml.elements || osmxml.elements.length === 0) {
                    resolve();
                    return;
                }
                const geojson = osmtogeojson(osmxml, { flatProperties: true });
                overPassCont.setCache(geojson.features);
                console.log("getOsmIds: Cache Update");
                resolve(overPassCont.Cache);
            }).catch(error => {
                console.error("getOsmIds: fetch error:", error);
                overPassCont.UseServer = (overPassCont.UseServer + 1) % Conf.system.OverPassServer.length;
                reject(error);
            });
        });
    }

    fetchOverpass(data, progress) {
        const url = Conf.system.OverPassServer[overPassCont.UseServer]; // ベースURLのみ
        return fetch(url, {
            method: 'POST',
            body: data,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }).then(response => {
            const reader = response.body.getReader();
            let receivedLength = 0;
            const chunks = [];
            const decoder = new TextDecoder("utf-8");
            return new Promise((resolve, reject) => {
                function read() {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            const full = decoder.decode(new Uint8Array(chunks.flat()));
                            try {
                                const json = JSON.parse(full);
                                resolve(json);
                            } catch (err) {
                                reject(err);
                            }
                            return;
                        }
                        receivedLength += value.length;
                        if (progress !== undefined) progress(receivedLength);
                        chunks.push(Array.from(value));
                        read();
                    }).catch(reject);
                }
                read();
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
