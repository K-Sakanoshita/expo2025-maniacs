// Historical Wikidata news loading and selection for the map.
class HistoricalNewsController {
    constructor(ticker = new NewsTicker()) {
        this.config = {};
        this.mapLibre = null;
        this.tiles = {};
        this.events = [];
        this.nationalEvents = [];
        this.availableMonths = new Set();
        this.prefectures = [];
        this.loaded = false;
        this.loadedYears = new Set();
        this.loadingYears = new Map();
        this.ticker = ticker;
    }

    init(config, mapLibre, tiles) {
        this.config = config || {};
        this.mapLibre = mapLibre;
        this.tiles = tiles || {};
        if (this.config.use !== true) {
            this.hide();
            return;
        }
        this.ticker.init(this.mapLibre?.map?.getContainer(), {
            displayDuration: this.config.displayDuration,
            sourceHref: "https://www.wikidata.org/",
            sourceLabel: "News from Wikidata",
            mobileLabel: "当時のニュース"
        });
        return this.load().catch(error => {
            console.warn("NewsTicker: ニュース表示の初期化に失敗しました。", error);
            this.hide();
        });
    }

    async load() {
        const baseUrl = String(this.config.sourceBaseUrl || "").replace(/\/$/, "");
        const prefectureFile = String(this.config.prefectureFile || "");

        if (!baseUrl || !prefectureFile) {
            console.warn("NewsTicker: ニュースデータまたは都道府県境界のURLが設定されていません。");
            return;
        }

        const [prefectureResponse, indexResponse] = await Promise.all([
            fetch(window.withAppAssetVersion ? window.withAppAssetVersion(prefectureFile) : prefectureFile),
            fetch(`${baseUrl}/index.json`)
        ]);
        if (!prefectureResponse.ok) throw new Error(`${prefectureResponse.status} ${prefectureResponse.statusText}`);
        if (!indexResponse.ok) throw new Error(`index.json: ${indexResponse.status} ${indexResponse.statusText}`);
        const prefectureResult = await prefectureResponse.json();
        const indexResult = await indexResponse.json();

        if (prefectureResult?.type !== "FeatureCollection" || !Array.isArray(prefectureResult.features)) {
            console.warn("NewsTicker: 都道府県境界データの形式が不正です。");
            return;
        }
        if (!Array.isArray(indexResult?.months)) {
            console.warn("NewsTicker: index.json の形式が不正です。");
            return;
        }
        this.prefectures = prefectureResult.features;
        this.availableMonths = new Set(indexResult.months
            .map((month) => String(month))
            .filter((month) => /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)));
        this.loaded = true;

        const targetYear = this.tiles[this.mapLibre?.selectStyle]?.year;
        if (this.hasAvailableYear(targetYear)) await this.loadYear(targetYear);
        this.update();
    }

    getAvailableMonths(year) {
        if (!Number.isInteger(year)) return [];
        const prefix = `${year}-`;
        return [...this.availableMonths]
            .filter((month) => month.startsWith(prefix))
            .sort();
    }

    hasAvailableYear(year) {
        return this.getAvailableMonths(year).length > 0;
    }

    loadYear(year) {
        if (!this.hasAvailableYear(year) || this.loadedYears.has(year)) return Promise.resolve();
        if (this.loadingYears.has(year)) return this.loadingYears.get(year);

        const request = this.fetchYear(year).finally(() => this.loadingYears.delete(year));
        this.loadingYears.set(year, request);
        return request;
    }

    async fetchYear(year) {
        const baseUrl = String(this.config.sourceBaseUrl || "").replace(/\/$/, "");
        const urls = this.getAvailableMonths(year).map((month) => `${baseUrl}/${month}.json`);
        const results = await Promise.allSettled(urls.map(async (url) => {
            const response = await fetch(url);
            if (!response.ok) {
                const error = new Error(`${response.status} ${response.statusText}`);
                error.status = response.status;
                throw error;
            }
            return response.json();
        }));

        const uniqueEvents = new Map(this.events.map((event) => [this.getRegionalStorageKey(event), event]));
        const uniqueNationalEvents = new Map(this.nationalEvents.map((event) => [this.getEventIdentity(event), event]));
        results.forEach((result, index) => {
            if (result.status === "rejected") {
                if (result.reason?.status === 404) {
                    console.info(`NewsTicker: ${urls[index]} はまだ公開されていません。`);
                } else {
                    console.warn(`NewsTicker: ${urls[index]} の取得に失敗しました。`, result.reason);
                }
                return;
            }

            const data = result.value;
            if (data?.year !== year || !data?.regions || typeof data.regions !== "object") {
                console.warn(`NewsTicker: ${urls[index]} の形式が不正です。`);
                return;
            }

            Object.entries(data.regions).forEach(([region, events]) => {
                if (!Array.isArray(events)) return;
                events.forEach((event) => {
                    const latitude = this.toFiniteCoordinate(event.latitude);
                    const longitude = this.toFiniteCoordinate(event.longitude);
                    if (latitude === null || longitude === null) return;

                    const item = {
                        ...event,
                        year: data.year,
                        month: data.month,
                        region,
                        scope: "regional",
                        latitude,
                        longitude
                    };
                    uniqueEvents.set(this.getRegionalStorageKey(item), item);
                });
            });

            if (Array.isArray(data.national)) {
                data.national.forEach((event) => {
                    if (!event || typeof event !== "object" || !(event.headline || event.title)) return;

                    const latitude = this.toFiniteCoordinate(event.latitude);
                    const longitude = this.toFiniteCoordinate(event.longitude);
                    const item = {
                        ...event,
                        year: data.year,
                        month: data.month,
                        sourceRegion: String(event.region || ""),
                        displayRegion: "全国",
                        scope: "national"
                    };
                    if (latitude !== null) item.latitude = latitude;
                    if (longitude !== null) item.longitude = longitude;

                    uniqueNationalEvents.set(this.getEventIdentity(item), item);
                });
            }
        });

        this.events = [...uniqueEvents.values()];
        this.nationalEvents = [...uniqueNationalEvents.values()];
        this.loadedYears.add(year);
    }

    update() {
        if (this.config.use !== true || !this.loaded || !this.mapLibre?.map) return;

        const selectedTile = this.tiles[this.mapLibre.selectStyle];
        const targetYear = selectedTile?.year;
        if (!this.hasAvailableYear(targetYear)) {
            this.hide();
            return;
        }

        if (!this.loadedYears.has(targetYear)) {
            this.hide();
            this.loadYear(targetYear)
                .then(() => this.update())
                .catch((error) => console.warn(`NewsTicker: ${targetYear}年のニュース取得に失敗しました。`, error));
            return;
        }

        const configuredRegionalMinZoom = Number(this.config.regionalMinZoom ?? this.config.minZoom);
        const regionalMinZoom = Number.isFinite(configuredRegionalMinZoom) ? configuredRegionalMinZoom : 9.5;
        const scope = this.mapLibre.getZoom() >= regionalMinZoom ? "regional" : "national";
        const currentRegion = scope === "regional" ? this.getCurrentRegion() : "";
        const visibleEvents = this.getVisibleEvents(targetYear, currentRegion, scope);

        if (visibleEvents.length === 0) {
            this.hide();
            return;
        }

        const nextKey = `${targetYear}:${scope}:${currentRegion}:${visibleEvents.map((event) => `${this.getEventIdentity(event)}:${event.date || ""}`).join("|")}`;
        this.ticker.setItems(visibleEvents, {
            key: nextKey,
            ariaLabel: scope === "national" ? "全国ニュース" : "この地域のニュース"
        });
    }

    getVisibleEvents(targetYear, currentRegion, scope) {
        if (scope === "regional") {
            if (!currentRegion) return [];
            return this.events
                .filter((event) => event.year === targetYear && event.region === currentRegion)
                .sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))
                    || String(a.headline || a.title || "").localeCompare(String(b.headline || b.title || "")));
        }

        const configuredLimit = Number(this.config.nationalLimitPerMonth);
        const nationalLimitPerMonth = Number.isInteger(configuredLimit) && configuredLimit >= 0 ? configuredLimit : 5;
        const nationalCountByMonth = new Map();
        const nationalEvents = this.nationalEvents
            .filter((event) => event.year === targetYear)
            .sort((a, b) => Number(a.month || 0) - Number(b.month || 0)
                || Number(b.score || 0) - Number(a.score || 0)
                || String(a.date || "").localeCompare(String(b.date || "")))
            .filter((event) => {
                const month = Number(event.month || 0);
                const count = nationalCountByMonth.get(month) || 0;
                if (count >= nationalLimitPerMonth) return false;
                nationalCountByMonth.set(month, count + 1);
                return true;
            });

        return nationalEvents
            .sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))
                || String(a.headline || a.title || "").localeCompare(String(b.headline || b.title || "")));
    }

    getEventIdentity(event) {
        const year = Number(event?.year || 0);
        const wikidataId = String(event?.wikidata_id || "");
        if (wikidataId) return `${year}:${wikidataId}`;
        return `${year}:${event?.date || ""}:${event?.headline || event?.title || ""}`;
    }

    getRegionalStorageKey(event) {
        return `${event?.year || ""}:${event?.wikidata_id || ""}:${event?.date || ""}:${event?.latitude ?? ""}:${event?.longitude ?? ""}:${event?.headline || event?.title || ""}`;
    }

    toFiniteCoordinate(value) {
        if (value === null || value === "" || typeof value === "boolean") return null;
        const coordinate = Number(value);
        return Number.isFinite(coordinate) ? coordinate : null;
    }

    getCurrentRegion() {
        if (!this.mapLibre?.map || !Array.isArray(this.prefectures) || typeof turf === "undefined") return "";

        const center = this.mapLibre.map.getCenter();
        const point = turf.point([center.lng, center.lat]);
        const feature = this.prefectures.find((prefecture) => {
            try {
                return turf.booleanPointInPolygon(point, prefecture);
            } catch (error) {
                console.warn("NewsTicker: 都道府県境界の判定に失敗しました。", error);
                return false;
            }
        });
        return String(feature?.properties?.["name:ja"] || feature?.properties?.name || "");
    }

    hide() {
        this.ticker.hide();
    }
}
