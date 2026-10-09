"use strict";

class OverpassRequestError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = "OverpassRequestError";
        Object.assign(this, details);
    }
}

// OverPass Server Control(With easy cache)
class OverPassControl {
    #UseChache = true;

    constructor() {
        this.Cache = { "geojson": [], "targets": [] };   // Cache variable
        this.LLc = {};
        this.CacheZoom = 14;
        this.UseServer = 0;
        this.CacheIdxs = {};		// 連想配列にtargets内のidxを保存
        this.ServerCooldowns = new Map();
        this.SameServerRetryDelay = 750;
        this.LastCompletedViewKey = "";
        this.PrunedViewKey = "";
        this.#UseChache = true
    }

    // キャッシュモード設定(キャッシュ無効時は)
    useCache(mode) {
        this.#UseChache = mode == false ? false : true;
        this.Cache = { "geojson": [], "targets": [] };   // Cache variable
        this.LLc = {};
        this.CacheIdxs = {};		// 連想配列にtargets内のidxを保存
        this.LastCompletedViewKey = "";
        this.PrunedViewKey = "";
        return this.#UseChache;
    }

    getViewRequestKey(targetKey, bounds, tileNorthWest, tileSouthEast) {
        const center = mapLibre.getCenter();
        const map = mapLibre.map;
        const round = (value, digits) => {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric.toFixed(digits) : "";
        };
        return [
            targetKey,
            `${tileNorthWest.tileX}.${tileNorthWest.tileY}`,
            `${tileSouthEast.tileX}.${tileSouthEast.tileY}`,
            round(center.lng, 5), round(center.lat, 5),
            round(bounds.NW.lng, 5), round(bounds.NW.lat, 5),
            round(bounds.SE.lng, 5), round(bounds.SE.lat, 5),
            round(mapLibre.getZoom(false), 3),
            round(map?.getPitch?.(), 1),
            round(map?.getBearing?.(), 1)
        ].join("|");
    }

    // Overpass APIからデータ取得
    // targets: Conf.osm内の目標 / progress: 処理中に呼び出すプログラム
    getGeojson(targets, progress) {
        return new Promise((resolve, reject) => {
            const url = this.#UseChache ? Conf.system.OverPassServer[overPassCont.UseServer] : Conf.system.NoChacheServer;
            const requestedTargets = [...new Set((Array.isArray(targets) ? targets : [targets]).filter(Boolean))];
            const targetKey = requestedTargets.slice().sort().join("|");
            var LL = mapLibre.get_LL()
            let CT = geoCont.ll2tile(mapLibre.getCenter(), overPassCont.CacheZoom)
            let tileNW = geoCont.ll2tile(LL.NW, overPassCont.CacheZoom)
            let tileSE = geoCont.ll2tile(LL.SE, overPassCont.CacheZoom)
            const viewRequestKey = this.getViewRequestKey(targetKey, LL, tileNW, tileSE);
            const isSamePrunedView = this.PrunedViewKey !== ""
                && this.PrunedViewKey === viewRequestKey;
            if (!isSamePrunedView) this.PrunedViewKey = "";
            const isViewportCached = () => {
                for (let y = tileNW.tileY; y <= tileSE.tileY; y++) {
                    for (let x = tileNW.tileX; x <= tileSE.tileX; x++) {
                        const cachedTargets = overPassCont.LLc[x + "." + y];
                        if (!(cachedTargets instanceof Set) || !cachedTargets.has(targetKey)) return false;
                    }
                }
                return true;
            };
            console.log("overPassCont: Check:" + CT.tileX + "." + CT.tileY)
            if (Conf.static.use || (this.#UseChache && isViewportCached())) {
                console.log("overPassCont: Cache Hit.")       // Within Cache range
                // poiContには取得済みデータが反映されているため、キャッシュ全件を
                // 再投入して数千件を走査し直す必要はない。
                resolve()
            } else if (this.#UseChache && isSamePrunedView) {
                // pdata整理直後に同じ画面で発生する重複updateだけを抑止する。
                // タイル自体は未取得扱いなので、中心・範囲・角度が変われば再取得する。
                console.log("overPassCont: Skip duplicate pruned view.");
                resolve()
            } else {
                let query = "";
                let scopeStatements = "";
                let NW = geoCont.tile2ll(tileNW, overPassCont.CacheZoom, "NW")
                let SE = geoCont.tile2ll(tileSE, overPassCont.CacheZoom, "SE")
                let maparea = "[bbox:" + SE.lat + ',' + NW.lng + ',' + NW.lat + ',' + SE.lng + "]";
                requestedTargets.forEach(key => {
                    const osmConf = Conf.osm[key];
                    if (osmConf === undefined) return;

                    const scope = osmConf.scope;
                    let selectorScope = "";
                    if (scope?.type === "osmArea") {
                        const match = String(scope.osmId ?? "").match(/^(way|relation)\/(\d+)$/);
                        if (!match) throw new Error(`Invalid OSM area scope for ${key}: ${scope.osmId}`);

                        const [, osmType, osmId] = match;
                        const areaName = `cmap_${key}`.replace(/[^A-Za-z0-9_]/g, "_");
                        scopeStatements += `${osmType}(${osmId});map_to_area->.${areaName};`;
                        selectorScope = `(area.${areaName})`;
                    }

                    const selectors = osmConf.overpass
                        .map(selector => `${selector}${selectorScope};`).join("");
                    query += selectors;
                })
                query = `[out:json][timeout:60]${maparea};${scopeStatements}(${query});out body;>;out skel;`
                console.log("overPassCont: POST: " + url + "?data=" + query)
                const data = new URLSearchParams();
                data.set('data', query);
                this.fetchOverpass(data, progress, url, this.#UseChache).then(data => {
                    console.log("overPassCont: done.")
                    //geoCont.box_write(NW, SE);		// Cache View
                    if (this.#UseChache) {
                        for (let y = tileNW.tileY; y <= tileSE.tileY; y++) {
                            for (let x = tileNW.tileX; x <= tileSE.tileX; x++) {
                                const tileKey = x + "." + y;
                                if (!(overPassCont.LLc[tileKey] instanceof Set)) overPassCont.LLc[tileKey] = new Set();
                                overPassCont.LLc[tileKey].add(targetKey);
                            }
                        }
                    }
                    this.LastCompletedViewKey = viewRequestKey;
                    if (data.elements.length == 0) { resolve(); return };
                    const cacheStart = performance.now();
                    let osmxml = data;
                    let geojson = osmtogeojson(osmxml, { flatProperties: true });
                    const changedGeojson = overPassCont.setCache(geojson);
                    console.log(`overPassCont: Cache Update (${Math.round(performance.now() - cacheStart)}ms)`);
                    // poiContへは蓄積キャッシュ全件ではなく、今回取得した差分だけを渡す。
                    resolve(changedGeojson);
                }).catch(err => {
                    console.log("overPassCont: " + err);
                    reject(err);
                });
            };
        });
    }

    getOsmIds(osmids, coordinates = null, bounds = null, { retry = true } = {}) {
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
            // Keep ID lookups with a known location inside a modest routing bbox.
            // Recursion still returns the complete nodes of selected ways.
            let bbox = "";
            if (Array.isArray(coordinates) && coordinates.length >= 2
                && coordinates.slice(0, 2).every(Number.isFinite)) {
                const [lng, lat] = coordinates;
                if (Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
                    bbox = `[bbox:${Math.max(-90, lat - 0.1)},${Math.max(-180, lng - 0.1)},${Math.min(90, lat + 0.1)},${Math.min(180, lng + 0.1)}]`;
                }
            }
            if (Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite)
                && bounds[0] < bounds[2] && bounds[1] < bounds[3]
                && bounds[0] >= -90 && bounds[2] <= 90 && bounds[1] >= -180 && bounds[3] <= 180) {
                bbox = `[bbox:${bounds.join(",")}]`;
            }
            const query = `[out:json][timeout:60]${bbox};${params});out body;>;out skel;`;
            const url = Conf.system.OverPassServer[overPassCont.UseServer]; // ベースURLのみ

            console.log("overPassCont: POST to: " + url);
            console.log("overPassCont: query: " + query);

            const data = new URLSearchParams();
            data.set("data", query);
            (retry ? this.fetchOverpass(data, undefined, url, true) : this.fetchOverpassOnce(data, undefined, url))
                .then(osmxml => {
                    console.log("overPassCont: getOsmIds: done.");
                    if (!osmxml.elements || osmxml.elements.length === 0) { resolve(); return; }
                    const geojson = osmtogeojson(osmxml, { flatProperties: true });
                    overPassCont.setCache(geojson);
                    console.log("overPassCont: Cache Update");
                    resolve(overPassCont.Cache);
                })
                .catch(error => {
                    console.error("overPassCont: fetch error:", error);
                    reject(error);
                });
        });
    }

    async fetchOverpass(data, progress, preferredUrl = Conf.system.OverPassServer[overPassCont.UseServer], allowAlternate = true) {
        const servers = this.getOverpassServers(preferredUrl, allowAlternate);
        const attemptedServers = new Set();
        let url = servers[0];
        let retriedSameServer = false;
        let lastError;

        while (url) {
            attemptedServers.add(url);
            this.setCurrentServer(url);
            try {
                const json = await this.fetchOverpassOnce(data, progress, url);
                this.ServerCooldowns.delete(url);
                return json;
            } catch (error) {
                lastError = error;
                const decision = this.classifyOverpassError(error);
                error.retryAction = decision.action;
                error.retryReason = decision.reason;
                error.serverUrl = url;

                if (error.status === 429) {
                    const cooldown = Math.max(error.retryAfterMs || 0, 60000);
                    this.ServerCooldowns.set(url, Date.now() + cooldown);
                }

                if (decision.action === "stop") {
                    console.error(`overPassCont: ${decision.reason}; retry stopped: ${url}`);
                    throw error;
                }

                if (decision.action === "same" && !retriedSameServer) {
                    retriedSameServer = true;
                    console.warn(`overPassCont: ${decision.reason}; retry same server: ${url}`);
                    await this.wait(this.SameServerRetryDelay);
                    continue;
                }

                const nextUrl = servers.find(server => !attemptedServers.has(server));
                if (!nextUrl) {
                    console.error(`overPassCont: ${decision.reason}; no retry server remains.`);
                    throw error;
                }

                console.warn(`overPassCont: ${decision.reason}; switch server: ${url} -> ${nextUrl}`);
                url = nextUrl;
                retriedSameServer = false;
            }
        }

        throw lastError ?? new OverpassRequestError("No Overpass server is available", { kind: "configuration" });
    }

    getOverpassServers(preferredUrl, allowAlternate) {
        const configured = Array.isArray(Conf.system.OverPassServer)
            ? Conf.system.OverPassServer.filter(url => typeof url === "string" && url !== "")
            : [];
        if (!allowAlternate) return preferredUrl ? [preferredUrl] : [];

        const preferredIndex = configured.indexOf(preferredUrl);
        const ordered = preferredIndex >= 0
            ? configured.slice(preferredIndex).concat(configured.slice(0, preferredIndex))
            : [preferredUrl, ...configured];
        const unique = [...new Set(ordered.filter(Boolean))];
        const now = Date.now();
        const ready = unique.filter(url => (this.ServerCooldowns.get(url) || 0) <= now);
        return ready.length > 0 ? ready : unique;
    }

    setCurrentServer(url) {
        const index = Conf.system.OverPassServer.indexOf(url);
        if (index >= 0) this.UseServer = index;
    }

    wait(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    async fetchOverpassOnce(data, progress, url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 70000);
        try {
            const response = await fetch(url, {
                method: "POST",
                body: data,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                signal: controller.signal
            });
            if (!response.ok) {
                const body = await response.text().catch(() => "");
                const detail = body.replace(/\s+/g, " ").trim().slice(0, 240);
                throw new OverpassRequestError(
                    `Overpass HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
                    {
                        kind: "http",
                        status: response.status,
                        retryAfterMs: this.getRetryAfterMilliseconds(response.headers?.get?.("Retry-After"))
                    }
                );
            }

            const json = await this.readOverpassJson(response, progress);
            if (typeof json?.remark === "string" && json.remark.trim() !== "") {
                throw new OverpassRequestError(`Overpass remark: ${json.remark.trim()}`, {
                    kind: "remark",
                    remark: json.remark.trim()
                });
            }
            if (!json || !Array.isArray(json.elements)) {
                throw new OverpassRequestError("Overpass response has no elements array", {
                    kind: "invalid_response"
                });
            }
            return json;
        } catch (error) {
            if (error instanceof OverpassRequestError) throw error;
            if (error?.name === "AbortError") {
                throw new OverpassRequestError("Overpass request timed out after 70 seconds", {
                    kind: "timeout",
                    cause: error
                });
            }
            throw new OverpassRequestError(`Overpass network error: ${error?.message ?? error}`, {
                kind: "network",
                cause: error
            });
        } finally {
            clearTimeout(timer);
        }
    }

    async readOverpassJson(response, progress) {
        if (!response.body?.getReader) {
            const text = await response.text();
            return this.parseOverpassJson(text);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        const textChunks = [];
        let receivedLength = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedLength += value.length;
            if (progress !== undefined) progress(receivedLength);
            textChunks.push(decoder.decode(value, { stream: true }));
        }
        textChunks.push(decoder.decode());
        return this.parseOverpassJson(textChunks.join(""));
    }

    parseOverpassJson(text) {
        if (typeof text !== "string" || text.trim() === "") {
            throw new OverpassRequestError("Overpass response body is empty", { kind: "empty_response" });
        }
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new OverpassRequestError(`Overpass returned invalid JSON: ${error.message}`, {
                kind: "invalid_json",
                cause: error
            });
        }
    }

    getRetryAfterMilliseconds(value) {
        if (!value) return 0;
        const seconds = Number(value);
        if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
        const retryAt = Date.parse(value);
        return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : 0;
    }

    classifyOverpassError(error) {
        const status = Number(error?.status);
        if (Number.isFinite(status) && status > 0) {
            if (status === 408 || status === 425) {
                return { action: "same", reason: `HTTP ${status} transient request error` };
            }
            if (status === 429) {
                return { action: "switch", reason: "HTTP 429 rate limit" };
            }
            if (status >= 500) {
                return { action: "switch", reason: `HTTP ${status} server error` };
            }
            if (status >= 400) {
                return { action: "stop", reason: `HTTP ${status} query/client error` };
            }
        }

        if (error?.kind === "timeout") {
            return { action: "switch", reason: "request timeout" };
        }
        if (error?.kind === "remark") {
            const remark = String(error.remark || error.message || "");
            if (/parse error|static error|syntax error|invalid (query|statement|bbox|id)|unknown (type|query|statement)/i.test(remark)) {
                return { action: "stop", reason: "Overpass query error" };
            }
            if (/timed? out|timeout|out of memory|rate limit|too many requests|dispatcher|server.{0,20}(busy|load)|runtime error/i.test(remark)) {
                return { action: "switch", reason: "Overpass runtime/server error" };
            }
            return { action: "same", reason: "unknown Overpass remark" };
        }
        if (["network", "invalid_json", "invalid_response", "empty_response"].includes(error?.kind)) {
            return { action: "same", reason: `transient ${error.kind.replaceAll("_", " ")}` };
        }
        return { action: "same", reason: "unknown transient error" };
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

    // 指定したidがpoiCont.adataに含まれるか判定
    isIdInclude(adata, osmid) {
        if (!adata || !osmid) return false;
        if (Array.isArray(adata)) return adata.some(obj => obj.osmid === osmid);  // 配列の場合
        if (typeof adata === "object" && adata.osmid) return adata.osmid === osmid;  // 単一オブジェクトの場合
        return false;
    }

    // tagsを元にキャッシュセット
    setCache(geojson) {
        const changed = { geojson: [], targets: [] };
        if (!Array.isArray(geojson.features) || geojson.features.length === 0) return changed;
        const features = geojson.features;		// アイコン重なり回避のオフセット追加なし
        const osmkeys = Object.keys(Conf.osm).filter(k => Conf.osm[k].file == undefined);
        const activeOsmIds = new Set((poiCont.adata ?? [])
            .map(activity => activity?.osmid)
            .filter(id => id != null && id !== "")
            .map(String));

        // id 正規化（feature.id / properties.id を必ず揃える）
        for (const f of features) {
            if (!f || !f.properties) continue;
            const id = f.properties.id ?? f.id;
            if (id != null) {
                f.properties.id = f.properties.id ?? id;
                f.id = f.id ?? id;
            }
        }

        for (const f of features) {
            if (!f || !f.properties) continue;
            const id = f.properties.id;
            if (id == null) continue;
            const key = String(id);
            const hitTargets = [];            // 対象 target 抽出
            for (const t of osmkeys) {
                if (this.isTagsInclude(f.properties, Conf.osm[t].tags)) hitTargets.push(t);
            }
            if (hitTargets.length === 0) continue;

            const isActive = activeOsmIds.has(key);
            let idx = this.CacheIdxs[key];

            if (idx == null) {
                // 新規
                const targets = isActive ? [...hitTargets, "activity"] : [...hitTargets];
                this.Cache.geojson.push(f);
                this.Cache.targets.push([...new Set(targets)]);
                this.CacheIdxs[key] = this.Cache.geojson.length - 1;
            } else {
                // 既存
                this.Cache.geojson[idx] = f;
                const merged = new Set(this.Cache.targets[idx] ?? []);
                hitTargets.forEach(t => merged.add(t));
                if (isActive) merged.add("activity");
                this.Cache.targets[idx] = Array.from(merged);
            }

            changed.geojson.push(f);
            changed.targets.push([...(this.Cache.targets[this.CacheIdxs[key]] ?? [])]);
        }
        return changed;
    }

    // poiContの保持上限に合わせてOverpassキャッシュも縮小する。
    // 地物を破棄した地域は再訪時に取得し直せるよう、タイル取得済み判定を破棄する。
    pruneCacheToIds(retainedIds) {
        if (!retainedIds || typeof retainedIds.has !== "function") return;
        const geojson = [];
        const targets = [];
        const indexes = {};

        for (let index = 0; index < this.Cache.geojson.length; index++) {
            const feature = this.Cache.geojson[index];
            const id = feature?.properties?.id ?? feature?.id;
            if (id == null || !retainedIds.has(String(id))) continue;
            indexes[String(id)] = geojson.length;
            geojson.push(feature);
            targets.push(this.Cache.targets[index] ?? []);
        }

        this.Cache = { geojson, targets };
        this.CacheIdxs = indexes;
        // pdataから一部を削除した時点で、既存タイルは完全なキャッシュではない。
        // 同一画面の重複更新だけはview keyで抑止し、移動後は必ず再取得できるようにする。
        this.LLc = {};
        this.PrunedViewKey = this.LastCompletedViewKey;
    }

    // 穴あき除去・targets未定義除去・CacheIdxs再構築
    #compactCache() {
        const newGeo = [];
        const newTgt = [];
        const newIdx = {};

        for (let i = 0; i < this.Cache.geojson.length; i++) {
            const f = this.Cache.geojson[i];
            const t = this.Cache.targets[i];

            if (!f || !f.properties) continue;
            if (!Array.isArray(t) || t.length === 0) continue;

            const id = f.properties.id ?? f.id;
            if (id == null) continue;

            f.properties.id = f.properties.id ?? id;
            f.id = f.id ?? id;

            const idx = newGeo.length;
            newGeo.push(f);
            newTgt.push([...new Set(t)]);
            newIdx[String(id)] = idx;
        }
        this.Cache.geojson = newGeo;
        this.Cache.targets = newTgt;
        this.CacheIdxs = newIdx;
    }

    // CacheIdxs だけを既存キャッシュから再構築
    #rebuildCacheIndex() {
        const idx = {};
        for (let i = 0; i < this.Cache.geojson.length; i++) {
            const f = this.Cache.geojson[i];
            if (!f || !f.properties) continue;
            const id = f.properties.id ?? f.id;
            if (id == null) continue;
            f.properties.id = f.properties.id ?? id;
            f.id = f.id ?? id;
            idx[String(id)] = i;
        }
        this.CacheIdxs = idx;
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
        overPassCont.setCache(geojson);
        return overPassCont.Cache;
    }

}
