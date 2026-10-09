"use strict";

// Daily, configuration-driven OSM change lookup. No application-specific targets live here.
class ChangeController {
    constructor(config = {}, dependencies = {}) {
        this.config = config;
        this.fetch = dependencies.fetch ?? ((...args) => window.fetch(...args));
        try { this.storage = dependencies.storage ?? window.localStorage; }
        catch { this.storage = null; }
        this.now = dependencies.now ?? (() => new Date());
        this.results = [];
    }

    label(key, fallback) {
        const value = typeof glot === "undefined" ? null : glot.get(key);
        return value && value !== key ? value : fallback;
    }
    targetLabel(target = {}) {
        return target.glotLabel ? this.label(target.glotLabel, target.label || "")
            : target.id === "review" || target.label === "口コミ"
                ? this.label("changeFeed_reviewLabel", "口コミ") : target.label || "";
    }
    changeLabel(kind) {
        const fallback = this.config.labels?.[kind]
            || ({ reviewCreated: "新しい口コミ", reviewUpdated: "口コミ更新" })[kind] || kind;
        const key = this.config.labelKeys?.[kind]
            || ({ reviewCreated: "changeFeed_reviewCreatedLabel", reviewUpdated: "changeFeed_reviewUpdatedLabel" })[kind];
        return key ? this.label(key, fallback) : fallback;
    }

    key(suffix) { return `${this.config.storageKeyPrefix || "cmapmaker-changes"}.${suffix}`; }
    read(key) { try { return this.storage.getItem(key); } catch { return null; } }
    write(key, value) { try { this.storage.setItem(key, value); return true; } catch { return false; } }
    localDate(date = this.now()) {
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0")].join("-");
    }
    targets() { return (this.config.targets ?? []).filter(target => target.use !== false); }
    monthsAgo(date, months) {
        const result = new Date(date);
        const day = result.getDate();
        result.setDate(1);
        result.setMonth(result.getMonth() - months);
        const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
        result.setDate(Math.min(day, lastDay));
        return result.getTime();
    }
    lookbackStart(now, lastCheckedAt) {
        const minimumMonths = Math.max(1, Number(this.config.minLookbackMonths) || 1);
        const maximumMonths = Math.max(minimumMonths, Number(this.config.maxLookbackMonths) || 6);
        const minimumStart = this.monthsAgo(now, minimumMonths);
        const maximumStart = this.monthsAgo(now, maximumMonths);
        return Math.max(maximumStart, Math.min(lastCheckedAt ?? minimumStart, minimumStart));
    }
    osmId(item) {
        if (typeof item.osmid === "string") return item.osmid;
        if (item.type != null && item.id != null) return `${item.type}/${item.id}`;
        return "";
    }
    timestamp(value) {
        if (!value) return NaN;
        // The API sends UTC timestamps with a space separator and no timezone.
        const normalized = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
            ? value.replace(" ", "T") + "Z" : value;
        return Date.parse(normalized);
    }
    tags(item) {
        if (item.tags && typeof item.tags === "object") return item.tags;
        try { return JSON.parse(item.tags || "{}"); } catch { return {}; }
    }
    matches(target, item) {
        const tags = this.tags(item);
        const matchesTags = Object.entries(target.matchTags ?? {}).every(([key, allowed]) =>
            (Array.isArray(allowed) ? allowed : [allowed]).includes(tags[key]));
        if (!matchesTags) return false;
        return (target.queries ?? []).some(query =>
            (!query.tag_key || tags[query.tag_key] != null)
            && (!query.tag_value || tags[query.tag_key] === query.tag_value)
            && (!query.category || item.type2 === query.category
                || item.category === query.category || tags[query.category] != null)
            && (!query.category_value || item.kind === query.category_value
                || tags[query.category] === query.category_value));
    }
    async json(url) {
        const response = await this.fetch(url.href);
        if (!response.ok) throw new Error(`Change API: ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data?.items)) throw new Error("Change API: invalid items");
        return data;
    }
    async query(parameters) {
        const items = [];
        let cursor = null;
        for (let page = 0; page < 50; page++) {
            const url = new URL(this.config.apiUrl, location.href);
            Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, String(value)));
            if (cursor) url.searchParams.set("cursor", cursor);
            const data = await this.json(url);
            items.push(...data.items);
            cursor = data.meta?.nextCursor;
            if (!cursor) return items;
        }
        throw new Error("Change API: pagination limit reached");
    }
    async region() {
        const setting = this.config.region ?? {};
        if (setting.scope !== "prefecture" || setting.source !== "mapCenter")
            throw new Error("Unsupported change region");
        if (!this.prefectureData || this.prefectureUrl !== setting.prefectureFile) {
            const response = await this.fetch(setting.prefectureFile);
            if (!response.ok) throw new Error(`Prefecture data: ${response.status}`);
            this.prefectureData = await response.json();
            this.prefectureUrl = setting.prefectureFile;
        }
        const data = this.prefectureData;
        const center = mapLibre.map?.getCenter?.();
        if (!center || !data?.features || typeof turf === "undefined")
            throw new Error("Prefecture lookup unavailable");
        const point = turf.point([center.lng, center.lat]);
        const feature = data.features.find(item => turf.booleanPointInPolygon(point, item));
        const iso = feature?.properties?.["ISO3166-2"];
        if (!/^JP-\d\d$/.test(iso ?? "")) throw new Error("Map center outside supported region");
        return { code: iso.slice(3), name: feature.properties["name:ja"] || feature.properties.name || iso, feature };
    }
    async checkActivityChanges(activity, { force = false } = {}) {
        if (this.config.reviews?.use !== true || activity?.authMode !== "basic" || !activity.url) return;
        let region;
        try { region = await this.region(); }
        catch (error) { console.warn("Review region unavailable", error); return; }
        const regionKey = region.code || region.name;
        const cacheKey = this.key("review-results");
        const today = this.localDate();
        let cached;
        try { cached = JSON.parse(this.read(cacheKey)); } catch { cached = null; }
        this.results = this.results.filter(result => !["reviewCreated", "reviewUpdated"].includes(result.kind));
        if (!force && cached?.version === 2 && cached.day === today && cached.url === activity.url && cached.regionKey === regionKey && Array.isArray(cached.results)
            && this.now().getTime() - cached.fetchedAt >= 0
            && this.now().getTime() - cached.fetchedAt < 10 * 60 * 1000) {
            await this.resolveReviewNames(cached.results);
            this.write(cacheKey, JSON.stringify({ ...cached, results: cached.results }));
            this.results.push(...cached.results);
            return;
        }
        const results = [];
        try {
            const since = this.lookbackStart(this.now(), null);
            const fetchSummary = async filters => {
                const url = new URL(activity.url, location.href);
                ["id", "osmid", "bbox", "osmids", "format"].forEach(key => url.searchParams.delete(key));
                Object.entries({ ...filters, updated_since: new Date(since).toISOString(), limit: 30, summary: 1 })
                    .forEach(([key, value]) => url.searchParams.set(key, value));
                const response = await this.fetch(url.href);
                if (!response.ok) throw new Error(`Review API: ${response.status}`);
                const rows = await response.json();
                const allowed = new Set(["id", "osmid", "created_at", "updated_at", "latitude", "longitude", "form_key", "name", "updated_by_username", "updated_by_userid"]);
                if (!Array.isArray(rows) || rows.length > 30 || rows.some(row => !row
                    || Object.keys(row).some(key => !allowed.has(key))
                    || !Number.isFinite(this.timestamp(row.updated_at)) || this.timestamp(row.updated_at) < since))
                    throw new Error("Review API does not support summary filters");
                return rows;
            };
            const favorites = typeof poiStatusCont === "undefined" ? [] : poiStatusCont.getAllFavorite()
                .map(([key]) => key.slice(`${Conf.etc.localSave}.`.length))
                .filter(id => /^(node|way|relation)\/\d+$/.test(id)).slice(0, 1000);
            const rows = await fetchSummary({ bbox: turf.bbox(region.feature).join(",") });
            const regional = rows.filter(row => {
                const coordinates = this.coordinates({ lon: row.longitude, lat: row.latitude });
                return coordinates && turf.booleanPointInPolygon(turf.point(coordinates), region.feature);
            });
            const favoriteRows = favorites.length ? await fetchSummary({ osmids: favorites.join(",") }) : [];
            const unique = new Map([...regional, ...favoriteRows].map(row => [row.id, row]));
            for (const row of unique.values()) {
                results.push({ kind: this.timestamp(row.created_at) === this.timestamp(row.updated_at)
                    ? "reviewCreated" : "reviewUpdated", target: { label: "口コミ" },
                    region: { name: regional.some(item => item.id === row.id) ? region.name : "お気に入り" },
                    item: { osmid: row.osmid, activityId: row.id, name: row.name || "", updated_by_username: row.updated_by_username,
                        updated_by_userid: row.updated_by_userid,
                        createdAt: row.created_at, date: row.updated_at, lon: row.longitude, lat: row.latitude } });
            }
        } catch (error) {
            console.warn("Review changes unavailable", error);
            return;
        }
        await this.resolveReviewNames(results);
        this.write(cacheKey, JSON.stringify({ version: 2, day: today, url: activity.url, regionKey, fetchedAt: this.now().getTime(), results }));
        this.results.push(...results);
    }
    loadedPlace(id) {
        if (typeof poiCont === "undefined") return null;
        const indexed = poiCont.get_osmid?.(id);
        if (indexed?.geojson) return indexed;
        const feature = poiCont.pdata?.geojson?.find(feature => feature.id === id);
        return feature ? { geojson: feature, lnglat: poiCont.lnglats?.[id] } : null;
    }
    async resolveReviewNames(results) {
        if (this.reviewNamePending) await this.reviewNamePending;
        let cache;
        try { cache = JSON.parse(this.read(this.key("review-places"))) || {}; } catch { cache = {}; }
        const missing = new Map();
        for (const result of results) {
            const id = this.osmId(result.item ?? {});
            const place = this.loadedPlace(id);
            const known = this.results.find(entry => !entry.item?.activityId && this.osmId(entry.item ?? {}) === id)?.item;
            const parent = typeof poiCont === "undefined" ? null : poiCont.get_parent?.(id);
            const name = place?.geojson?.properties?.name || parent?.properties?.name || known?.name || cache[id]?.name;
            if (name) result.item.name = name;
            const unnamed = !result.item.name || /^(口コミのある公園・遊具|公園・遊具の口コミ|(?:名前未登録の)?公園・遊具（)/.test(result.item.name);
            if (unnamed) result.item.name = "公園・遊具の口コミ";
            if (unnamed && !place && !cache[id] && /^(node|way|relation)\/\d+$/.test(id)) missing.set(id, result.item);
        }
        if (!missing.size || typeof overPassCont === "undefined") return;
        for (const id of missing.keys()) cache[id] = { attempted: true };
        this.write(this.key("review-places"), JSON.stringify(cache));
        this.reviewNamePending = (async () => {
            const points = [...missing.values()].map(item => this.coordinates(item)).filter(Boolean);
            let bounds = null;
            if (points.length === missing.size) {
                const west = Math.min(...points.map(p => p[0])), east = Math.max(...points.map(p => p[0]));
                const south = Math.min(...points.map(p => p[1])), north = Math.max(...points.map(p => p[1]));
                if (east-west <= 1 && north-south <= 1) bounds = [south-0.1, west-0.1, north+0.1, east+0.1];
            }
            try {
                const data = await overPassCont.getOsmIds([...missing.keys()], null, bounds, { retry: false });
                if (data && typeof poiCont !== "undefined") poiCont.addGeojson?.(data);
                for (const feature of data?.geojson ?? []) {
                    if (missing.has(feature.id)) cache[feature.id] = { attempted: true, name: feature.properties?.name || "" };
                }
                this.write(this.key("review-places"), JSON.stringify(cache));
                for (const result of results) {
                    const name = cache[this.osmId(result.item)]?.name;
                    if (name) result.item.name = name;
                }
            } catch (error) { console.warn("Initial review place lookup failed", error); }
        })();
        try { await this.reviewNamePending; } finally { this.reviewNamePending = null; }
    }
    async collect(since, selectedRegion = null) {
        const region = selectedRegion || await this.region();
        const japanDate = timestamp => {
            const parts = new Intl.DateTimeFormat("en-US", {
                timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
            }).formatToParts(new Date(timestamp));
            const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
            return `${value.year}-${value.month}-${value.day}`;
        };
        const range = { from: japanDate(since), to: japanDate(this.now().getTime()) };
        const found = new Map();
        for (const target of this.targets()) {
            if (!target.notify?.regionalCreated && !target.notify?.regionalUpdated) continue;
            for (const query of target.queries ?? []) {
                for (const period of ["new_days", "days"]) {
                    if (period === "new_days" && !target.notify.regionalCreated) continue;
                    if (period === "days" && !target.notify.regionalUpdated) continue;
                    const periodParameters = period === "days" ? range
                        : { created_from: range.from, created_to: range.to };
                    const items = await this.query({ mode: "pois", ...periodParameters,
                        prefecture_code: region.code, ...query });
                    for (const item of items) {
                        if (!this.matches(target, item)) continue;
                        const id = this.osmId(item);
                        if (!id) continue;
                        const created = this.timestamp(item.createdAt);
                        const updated = this.timestamp(item.date);
                        const kind = Number.isFinite(created) && created > since ? "regionalCreated"
                            : Number.isFinite(updated) && updated > since
                                && (!Number.isFinite(created) || created <= since) ? "regionalUpdated" : null;
                        if (!kind || !target.notify[kind]) continue;
                        const key = `${kind}:${id}`;
                        if (!found.has(key)) found.set(key, { id, item, target, kind, region });
                    }
                }
            }
        }
        const favoriteIds = typeof poiStatusCont === "undefined" ? []
            : poiStatusCont.getAllFavorite().map(([key]) => key.slice(`${Conf.etc.localSave}.`.length))
                .filter(id => /^(node|way|relation)\/\d+$/.test(id));
        for (let i = 0; i < favoriteIds.length; i += 100) {
            const items = await this.query({ mode: "objects", ids: favoriteIds.slice(i, i + 100).join(",") });
            for (const item of items) {
                const id = this.osmId(item);
                if (!id || this.timestamp(item.date) <= since) continue;
                const target = this.targets().find(candidate =>
                    candidate.notify?.favoriteUpdated && this.matches(candidate, item));
                if (target) found.set(`favoriteUpdated:${id}`,
                    { id, item, target, kind: "favoriteUpdated", region });
            }
        }
        this.results = [...found.values()];
        return this.results;
    }
    async checkOnStartup() {
        if (this.config.use !== true || !this.config.apiUrl) return { state: "disabled" };
        let region;
        try { region = await this.region(); } catch { return { state: "error" }; }
        const today = this.localDate();
        const cachedText = this.read(this.key("last-results"));
        if (this.read(this.key("last-shown-date")) === today && cachedText !== null
            && this.read(this.key("last-region")) === region.code
            && this.read(this.key("osm-cache-version")) === "2") {
            try {
                const cached = JSON.parse(cachedText);
                this.results = Array.isArray(cached) ? cached : [];
                const missing = this.results.filter(result => !this.coordinates(result.item)
                    || (result.target?.label === "遊具" && !result.item?.tags));
                const ids = [...new Set(missing.map(result => this.osmId(result.item ?? {})))].filter(Boolean);
                if (ids.length) {
                    try {
                        const items = await this.query({ mode: "objects", ids: ids.join(",") });
                        const byId = new Map(items.map(item => [this.osmId(item), item]));
                        for (const result of missing) {
                            const item = byId.get(this.osmId(result.item ?? {}));
                            if (item) result.item = { ...result.item, ...item };
                        }
                        this.write(this.key("last-results"), JSON.stringify(this.results));
                    } catch (error) { console.warn("Change location lookup failed", error); }
                }
            } catch { this.results = []; }
            return { state: "already", results: this.results };
        }
        const last = this.read(this.key("last-checked-at"));
        const lastCheckedAt = last ? this.timestamp(last) : null;
        if (last && !Number.isFinite(lastCheckedAt)) return { state: "error" };
        try {
            // Use the scan start as the checkpoint so changes made during requests are retried.
            const checkedAt = this.now();
            const since = this.lookbackStart(checkedAt, lastCheckedAt);
            const results = await this.collect(since, region);
            const recentResults = [...results].sort((a, b) =>
                this.resultTimestamp(b) - this.resultTimestamp(a)).slice(0, 30)
                .map(result => ({
                    kind: result.kind,
                    target: { label: result.target?.label || "" },
                    region: { name: result.region?.name || "" },
                    item: Object.fromEntries(["osmid", "type", "id", "name", "tags", "type2", "kind", "editorName", "createdAt", "date", "lnglat", "lng", "lon", "lat"]
                        .filter(key => result.item?.[key] != null)
                        .map(key => [key, result.item[key]]))
                }));
            this.write(this.key("last-results"), JSON.stringify(recentResults));
            this.write(this.key("last-checked-at"), checkedAt.toISOString());
            this.write(this.key("last-shown-date"), today);
            this.write(this.key("last-region"), region.code);
            this.write(this.key("osm-cache-version"), "2");
            return { state: results.length ? "changes" : "empty", results };
        } catch (error) {
            console.warn("Change lookup failed", error);
            return { state: "error" };
        }
    }
    previewRandom(count = 8) {
        const total = Number(count);
        if (!Number.isInteger(total) || total < 1 || total > 30)
            throw new RangeError("count must be an integer from 1 to 30");
        const targets = this.targets().filter(target => target.notify?.regionalCreated);
        if (!targets.length) throw new Error("No enabled new-item targets");
        const names = ["さくら", "ひまわり", "みどり", "こもれび", "青空", "なかよし"];
        const batch = Math.floor(this.now().getTime() % 1000000000);
        this.results = Array.from({ length: total }, (_, index) => {
            const target = targets[Math.floor(Math.random() * targets.length)];
            const kind = "regionalCreated";
            const id = `mock/${batch}-${index + 1}`;
            const name = `【テスト】${names[Math.floor(Math.random() * names.length)]}${target.label} ${index + 1}`;
            return { id, kind, target, region: { code: "00", name: "テスト地域" },
                item: { osmid: id, type: "mock", id: `${batch}-${index + 1}`, name } };
        });
        return this.results;
    }
    resultTimestamp(result) {
        const item = result.item ?? {};
        const created = this.timestamp(item.createdAt);
        const updated = this.timestamp(item.date);
        return result.kind === "regionalCreated" && Number.isFinite(created) ? created
            : Number.isFinite(updated) ? updated : 0;
    }
    coordinates(item = {}) {
        const raw = Array.isArray(item.lnglat) ? item.lnglat : [item.lng ?? item.lon, item.lat];
        const values = raw.slice(0, 2).map(value =>
            value === null || value === undefined || value === "" ? NaN : Number(value));
        return values.length === 2 && values.every(Number.isFinite)
            && Math.abs(values[0]) <= 180 && Math.abs(values[1]) <= 90 ? values : null;
    }
    tickerItems(maxItems = 30) {
        const areas = (typeof poiCont === "undefined" ? [] : poiCont.pdata?.geojson ?? []).filter((feature, index) =>
            ["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
            && typeof areaFeatureLinker !== "undefined"
            && areaFeatureLinker.hasConfiguredTarget(poiCont.pdata?.targets?.[index], "areaTargets"));
        const activities = new Map((typeof poiCont === "undefined" ? [] : poiCont.adata ?? [])
            .map(activity => [activity.id, activity]));
        const labels = this.config.labels ?? {};
        const limit = Number.isInteger(Number(maxItems)) && Number(maxItems) > 0 ? Number(maxItems) : 30;
        const japanDate = timestamp => new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
        }).format(new Date(timestamp));
        return [...this.results].sort((a, b) => this.resultTimestamp(b) - this.resultTimestamp(a))
            .slice(0, limit).map(result => {
                const id = this.osmId(result.item ?? {});
                const timestamp = this.resultTimestamp(result);
                const typeLabel = this.changeLabel(result.kind);
                const place = this.loadedPlace(id);
                const tags = place?.geojson?.properties || this.tags(result.item ?? {});
                if (!place && result.item?.type2 && result.item?.kind && !tags[result.item.type2])
                    tags[result.item.type2] = result.item.kind;
                const categoryName = typeof poiCont === "undefined" ? "" : poiCont.getCatnames?.(tags)?.[0];
                const storedPlaceName = /^(名前|名称)未登録の遊具$/.test(result.item?.name || "") ? "" : result.item?.name;
                const activity = result.item?.activityId ? activities.get(result.item.activityId) : null;
                const text = value => typeof value === "string" ? value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : "";
                const body = text(activity?.body);
                const storedName = /^(?:名前未登録の)?公園・遊具（(?:node|way|relation)\//.test(result.item?.name || "")
                    ? "" : result.item?.name;
                const parentName = typeof poiCont === "undefined" ? "" : poiCont.get_parent?.(id)?.properties?.name;
                const linkedArea = typeof areaFeatureLinker === "undefined" ? null : areaFeatureLinker.getAreaRecord?.(id);
                const placeId = linkedArea?.areaId
                    || (typeof poiCont === "undefined" ? "" : poiCont.get_parent?.(id)?.properties?.id) || id;
                let parkName = linkedArea?.feature?.properties?.name || parentName || "";
                const coordinates = this.coordinates(place ?? {}) || this.coordinates(result.item);
                if (!parkName && coordinates && typeof turf !== "undefined" && turf.booleanPointInPolygon) {
                    parkName = areas.find(area => {
                        try { return turf.booleanPointInPolygon(turf.point(coordinates), area); }
                        catch { return false; }
                    })?.properties?.name || "";
                }
                const reviewName = place?.geojson?.properties?.name || parentName
                    || (storedName && storedName !== "公園・遊具の口コミ" && storedName !== "口コミのある公園・遊具" ? storedName : "")
                    || text(activity?.title) || this.label("changeFeed_reviewPlace", "公園・遊具の口コミ");
                const displayName = result.item?.activityId ? reviewName
                    : place?.geojson?.properties?.name || storedPlaceName || categoryName
                        || this.targetLabel(result.target) || this.label("changeFeed_facility", "施設");
                return {
                    section: (() => {
                        const record = typeof poiStatusCont === "undefined" ? null : poiStatusCont.getRecord?.(id);
                        const areaId = linkedArea?.areaId || (typeof poiCont === "undefined" ? "" : poiCont.get_parent?.(id)?.properties?.id);
                        const areaRecord = areaId && typeof poiStatusCont !== "undefined" ? poiStatusCont.getRecord?.(areaId) : null;
                        return record?.favorite || areaRecord?.favorite ? "favorite"
                            : record?.visited || areaRecord?.visited ? "visited" : "other";
                    })(),
                    timestamp,
                    thumbnail: activity ? [1, 2, 3, 4, 5].map(number => text(activity[`picture_url${number}`]))
                        .find(value => /^https?:\/\//i.test(value) || /^File:/i.test(value)) || "" : "",
                    editorName: result.item?.activityId
                        ? text(activity?.updated_by_username || activity?.updated_by_userid
                            || result.item?.updated_by_username || result.item?.updated_by_userid)
                        : text(result.item?.editorName),
                    parkName,
                    review: activity ? {
                        title: text(activity.title),
                        excerpt: Array.from(body).slice(0, 80).join("") + (Array.from(body).length > 80 ? "…" : ""),
                        score: /^act_score_[2-6]$/.test(activity.score || "") ? Number(activity.score.slice(-1)) - 1 : null,
                        hasPhoto: [1, 2, 3, 4, 5].some(number => Boolean(text(activity[`picture_url${number}`])))
                    } : null,
                    osmId: id,
                    placeId,
                    activityId: result.item?.activityId,
                    name: displayName,
                    kind: result.kind,
                    changeLabel: typeLabel,
                    category: this.targetLabel(result.target),
                    coordinates: this.coordinates(place ?? {}) || this.coordinates(result.item),
                    headline: `${typeLabel} · ${this.targetLabel(result.target)}: ${displayName || this.label("changeFeed_unknownName", "名称不明")}`,
                    date: timestamp ? japanDate(timestamp) : "",
                    region: result.kind === "favoriteUpdated" ? "" : result.region?.name === "お気に入り"
                        ? this.label("changeFeed_favorite", "お気に入り") : result.region?.name || "",
                    url: /^(node|way|relation)\/\d+$/.test(id)
                        ? `https://www.openstreetmap.org/${id}` : ""
                };
            });
    }
    groups() {
        const labels = this.config.labels ?? {};
        const counts = new Map();
        for (const result of this.results) {
            const key = `${result.kind}:${result.target.id}`;
            counts.set(key, { label: `${this.changeLabel(result.kind)} · ${this.targetLabel(result.target)}`,
                count: (counts.get(key)?.count ?? 0) + 1 });
        }
        return [...counts.values()];
    }
    showList() {
        cMapMaker.changeMode("list");
        listTable.showExternalRows(this.results.map(result => result.item));
        winCont.setSidebar("list");
    }
}
