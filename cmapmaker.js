/*	Main Process */
"use strict";

// Global Variable
var Conf = {}; // Config Praams
const LANG = window.APP_LANGUAGE || ((window.navigator.language || window.navigator.userLanguage || window.navigator.browserLanguage || "en").toLowerCase().startsWith("ja") ? "ja" : "en");
const MAP_TITLE_DISPLAY_DELAY_MS = 500;
const glot = new Glottologist();
glot.lang = LANG;
let modalActs = null;
let osmBasic = null;
const basic = new Basic();
const poiStatusCont = new PoiStatusCont();
const overPassCont = new OverPassControl();
const mapLibre = new Maplibre();
const geoCont = new GeoCont();
const listTable = new ListTable();
const poiCont = new PoiCont();
const feature3d = new MapFeature3D({
    modelFactories: PlaygroundModelFactories,
    getSelectionTitle: () => glot.get("mapFeatureSelect"),
    getFeatureLabel: id => {
        const poi = poiCont.get_osmid(id);
        if (!poi) return id;
        const props = poi.geojson.properties ?? {};
        const tags = props.tags && typeof props.tags === "object" ? props.tags : props;
        const category = poiCont.getCatnames(tags).find(Boolean) || "";
        const name = poiCont.getOSMname(tags, glot.lang);
        return name && name !== category ? `${category}: ${name}` : (name || category || id);
    },
    onSelect: async id => {
        const poi = poiCont.get_osmid(id);
        await cMapMaker.viewDetail(id);
        if (poi) {
            geoCont.flashPolygon(poi.geojson);
            geoCont.writePoiCircle(poi.geojson);
        }
    }
});
const gSheet = new GoogleSpreadSheet();
const newsTicker = new HistoricalNewsController();
const changeTicker = new NewsTicker();
const changesController = new ChangeController();
window.previewRandomChanges = count => {
    const results = changesController.previewRandom(count);
    cMapMaker.showChangeTicker();
    return results;
};
const areaFeatureLinker = new AreaFeatureLinker();
window.areaFeatureLinker = areaFeatureLinker;
const areaSearchController = new AreaSearchController(areaFeatureLinker);
window.areaSearchController = areaSearchController;
// Generic POI filter entry point; area search remains the data/search engine.
window.poiFilterController = areaSearchController;
const placeDiscovery = typeof PlaceDiscoveryController === "function" ? new PlaceDiscoveryController() : null;
window.placeDiscovery = placeDiscovery;
const listActions = new ListActionButtons();
window.listActions = listActions;
let wikimedia = null;
let wikimediaPromise = null;
const getWikimedia = () => {
    if (wikimedia) return Promise.resolve(wikimedia);
    if (!wikimediaPromise) {
        wikimediaPromise = window.loadLazyScriptGroup("wikimedia")
            .then(() => {
                wikimedia = new WikimediaLib();
                return wikimedia;
            })
            .catch((error) => {
                wikimediaPromise = null;
                throw error;
            });
    }
    return wikimediaPromise;
};
var PoiStatusIndex = { VISITED: 0, FAVORITE: 1, MEMO: 2 };
var PoiStatusCsvIndex = { KEY: 0, CATEGORY: 1, NAME: 2, VISITED: 3, FAVORITE: 4, MEMO: 5 };
var PoiStatusCsvIndexOld = { KEY: 0, CATEGORY: 1, NAME: 2, VISITED: 3, MEMO: 4 };

class CMapMaker extends IndoorControl {

    constructor() {
        super();
        this.status = "initialize";         // 状態フラグ / initialize changeMode normal playback
        this.mode = "map";
        this.moveMapBusy = false;
        this.moveMapPending = false;
        this.changeKeywordWaitTime;
        this.scrollHints = 0;
        this.thumbnailRowsKey = "";
        this.thumbnailRows = [];
        this.detailLibrariesPromise = null;
        this.favoriteFilter = null;
        this.visitedFilterStatus = null;
        this.openOSMid = null;
        this.updateViewRequestId = 0;
        this.mapTitleRequestId = 0;
        this.activityRequestId = 0;
        this.lastActivityBbox = null;
    }

    loadDetailLibraries() {
        if (modalActs && osmBasic && wikimedia) return Promise.resolve();
        if (!this.detailLibrariesPromise) {
            this.detailLibrariesPromise = Promise.all([
                window.loadLazyScriptGroup("detail"),
                getWikimedia()
            ]).then(() => {
                modalActs ??= new Activities();
                osmBasic ??= new OSMbasic();
            }).catch((error) => {
                this.detailLibrariesPromise = null;
                throw error;
            });
        }
        return this.detailLibrariesPromise;
    }

    showChangeTicker() {
        const setting = Conf.changes?.ticker;
        if (setting?.use !== true || !mapLibre.map) return;
        const items = changesController.tickerItems(setting.maxItems);
        changeTicker.init(mapLibre.map.getContainer(), {
            id: "changesTicker",
            collapsible: true,
            modal: true,
            buttonHosts: { desktop: "changesButtonDesktop", mobile: "changesButtonMobile" },
            seenStorageKey: `${Conf.etc?.localSave || "cmapmaker"}.changes-seen-items`,
            groupByPlace: true,
            // Opening/reordering the panel must not initiate a refresh request.
            itemsProvider: () => changesController.tickerItems(setting.maxItems),
            onSelect: async (event) => {
                if (!/^(node|way|relation)\/\d+$/.test(event.osmId || "")) return false;
                if (event.activityId && !poiCont.adata.some(row => row.id === event.activityId)) {
                    const url = new URL(Conf.activity.url, location.href);
                    ["summary", "limit", "updated_since", "bbox", "osmids", "id"].forEach(key => url.searchParams.delete(key));
                    url.searchParams.set("osmid", event.osmId);
                    const rows = await gSheet.get(url.href, { throwOnError: true });
                    poiCont.setActdata([...poiCont.adata.filter(row => row.osmid !== event.osmId), ...rows]);
                }
                await poiCont.select(event.osmId, true, 0, event.coordinates);
                if (event.activityId) await this.viewDetail(event.osmId, event.activityId);
                return true;
            },
            displayDuration: setting.displayDuration,
            mobileLabel: (setting.mobileLabelKey ? glot.get(setting.mobileLabelKey) : setting.mobileLabel) || glot.get("changeFeed_updatesTitle"),
            sourceHref: setting.sourceHref || "https://www.openstreetmap.org/",
            sourceLabel: setting.sourceLabel || "OpenStreetMap"
        });
        changeTicker.setItems(items, { ariaLabel: (setting.mobileLabelKey ? glot.get(setting.mobileLabelKey) : setting.mobileLabel) || glot.get("changeFeed_updatesTitle") });
    }

    async autoShowChangeModal(regionCode) {
        const setting = Conf.changes?.ticker;
        if (Conf.changes?.use !== true || setting?.use !== true || setting.autoOpen === false
            || !regionCode || this.changeAutoOpening || changeTicker.isOpen || changeTicker.opening) return false;
        this.changeAutoOpening = true;
        try {
            const map = mapLibre.map;
            if (map?.isMoving?.()) await new Promise(resolve => map.once("moveend", resolve));
            const region = await changesController.region();
            if (region.code !== regionCode || changeTicker.isOpen || changeTicker.opening
                || !changeTicker.unreadEvents().length) return false;
            const today = changesController.localDate();
            const storageKey = changesController.key(`auto-shown.${regionCode}`);
            this.changeAutoShownDates ??= new Map();
            if (this.changeAutoShownDates.get(storageKey) === today
                || changesController.read(storageKey) === today) return false;
            // Reserve this attempt so overlapping startup/move events cannot open twice.
            await changeTicker.toggle();
            if (!changeTicker.isOpen) return false;
            this.changeAutoShownDates.set(storageKey, today);
            changesController.write(storageKey, today);
            return true;
        } finally {
            this.changeAutoOpening = false;
        }
    }

    async refreshChangeRegion() {
        if (Conf.changes?.use !== true) return;
        this.changeRegionPending = true;
        if (this.changeRegionRefresh) return this.changeRegionRefresh;
        this.changeRegionRefresh = (async () => {
            while (this.changeRegionPending) {
                this.changeRegionPending = false;
                const region = await changesController.region();
                if (this.displayedChangeRegion === region.code) continue;
                changesController.results = [];
                changeTicker.hide();
                await changesController.checkOnStartup();
                await changesController.checkActivityChanges?.(Conf.activity);
                this.displayedChangeRegion = region.code;
                this.showChangeTicker();
                await this.autoShowChangeModal(region.code);
            }
        })().catch(error => console.warn("Change region refresh failed", error))
            .finally(() => { this.changeRegionRefresh = null; });
        return this.changeRegionRefresh;
    }

    async initDailyIntro() {
        const intro = document.getElementById("cMapIntro");
        const closeButton = document.getElementById("cMapIntroClose");
        if (!intro || !closeButton) return;

        const introConfig = Conf?.intro ?? {};
        const now = new Date();
        const today = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0")
        ].join("-");
        const storageKey = introConfig.storageKey
            || Conf?.etc?.storageKey
            || "cmapmaker-intro-last-shown";
        let shownToday = false;

        try {
            shownToday = window.localStorage.getItem(storageKey) === today;
        } catch (error) {
            console.info("cMapMaker: 案内の表示履歴を読み込めませんでした。", error);
        }

        changesController.config = Conf.changes ?? {};
        const changeResult = await changesController.checkOnStartup();
        await changesController.checkActivityChanges?.(Conf.activity);
        this.displayedChangeRegion = changesController.read?.(changesController.key("last-region"));
        if (Conf.changes?.ticker?.use === true) {
            this.showChangeTicker();
            await this.autoShowChangeModal(this.displayedChangeRegion);
        }
        if (Conf.changes?.ticker?.use === true && changesController.results.length) {
            intro.hidden = true;
            return;
        }
        if (shownToday) {
            intro.hidden = true;
            return;
        }
        if (["empty", "error", "already"].includes(changeResult.state)
            || (introConfig.use === false && changeResult.state !== "changes")) {
            intro.hidden = true;
            return;
        }
        if (changeResult.state === "changes") {
            intro.querySelector("h2").textContent = glot.get("intro_changes");
            intro.querySelector("p").textContent = changesController.groups()
                .map(group => glot.get("intro_groupCount").replace("{label}", group.label).replace("{count}", String(group.count))).join("　");
            const viewButton = document.createElement("button");
            viewButton.type = "button";
            viewButton.className = "btn btn-sm btn-primary ms-2";
            viewButton.textContent = glot.get("intro_viewList");
            viewButton.addEventListener("click", () => {
                changesController.showList();
                intro.hidden = true;
                stopPositionTracking();
            });
            intro.querySelector(".cMap-intro__body").appendChild(viewButton);
        }

        const positionBelowMenu = () => {
            const menu = document.querySelector(".basemenu");
            const map = document.getElementById("mapid");
            if (!menu || !map) return;
            const menuRect = menu.getBoundingClientRect();
            const mapRect = map.getBoundingClientRect();
            const top = Math.max(8, Math.ceil(menuRect.bottom - mapRect.top + 8));
            intro.style.setProperty("--cmap-intro-top", `${top}px`);
        };
        const resizeObserver = typeof ResizeObserver === "function"
            ? new ResizeObserver(positionBelowMenu)
            : null;
        const menu = document.querySelector(".basemenu");
        if (menu) resizeObserver?.observe(menu);
        window.addEventListener("resize", positionBelowMenu);
        const stopPositionTracking = () => {
            resizeObserver?.disconnect();
            window.removeEventListener("resize", positionBelowMenu);
        };

        positionBelowMenu();
        intro.hidden = false;
        window.requestAnimationFrame(positionBelowMenu);
        try {
            window.localStorage.setItem(storageKey, today);
        } catch (error) {
            console.info("cMapMaker: 案内の表示履歴を保存できませんでした。", error);
        }

        closeButton.addEventListener("click", () => {
            intro.hidden = true;
            stopPositionTracking();
        }, { once: true });
    }

    // Normalize legacy settings without migrating or overwriting the site's files.
    prepareConfig() {
        Conf.activity = {
            url: Conf.google?.AppScript || "",
            authMode: "legacy",
            targetName: Conf.google?.targetName || "activity",
            ...Conf.activity
        };
        // Dedicated applications opt in to new services and area/model definitions.
        for (const name of ["news", "changes", "intro", "areaFeatureLinker", "areaSearch",
            "discovery", "listActions", "feature3d", "directions"]) {
            Conf[name] = { use: false, ...Conf[name] };
        }
    }

    init() {        // initialize
        console.log("Welcome to Community Map Maker.");
        console.log("initialize: Start.");
        window.setStartupStatus?.(window.startupText("config"));
        const FILES = [
            "./baselist.html", "./data/config-user.jsonc", "./data/config-system.jsonc",
            "./data/config-activities.jsonc", `./data/marker.jsonc`,
            `./data/category-${LANG}.jsonc`, `./data/listtable.jsonc`,
            "./data/overpass-system.jsonc", `./data/overpass-custom.jsonc`,
            `./data/glot-custom.jsonc`, `./data/glot-system.jsonc`,
        ];
        const fetchText = async (url, maxAttempts = 3) => {
            let lastError;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status} ${response.statusText}`);
                    }
                    return await response.text();
                } catch (error) {
                    lastError = error;
                    if (attempt < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, attempt * 250));
                    }
                }
            }
            throw new Error(`Failed to load ${url}: ${lastError?.message ?? "Unknown fetch error"}`);
        };
        const fetchUrls = FILES.map(url => fetchText(window.withAppAssetVersion(url)));
        const setUrlParams = function () {  // URLから引数を取得して返す関数
            let keyValue = {};
            let search = location.search.replace(/[?&]fbclid.*/, "").replace(/%2F/g, "/").slice(1); // facebook対策
            search = search.slice(-1) == "/" ? search.slice(0, -1) : search; // facebook対策(/が挿入される)
            let params = search.split("&"); // -= -> / and split param
            history.replaceState("", "", location.pathname + "?" + search + location.hash); // fixURL
            for (const param of params) {
                let delimiter = param.includes("=") ? "=" : "/";
                let keyv = param.split(delimiter);
                keyValue[keyv[0]] = keyv[1];
            }
            return keyValue;
        }
        const loadStatic = async function () {
            if (!Conf.static.use) return;

            console.log("cMapMaker: Static mode");
            const datas = await Promise.all(Conf.static.osmjsons.map(async (url) => {
                const response = await fetch(window.withAppAssetVersion(url));
                if (!response.ok) throw new Error(`Static data load failed: ${url} (${response.status})`);
                return response.text();
            }));

            datas.forEach(data => {
                let json = JSON5.parse(data)
                let ovanswer = overPassCont.setOsmJson(json);
                poiCont.addGeojson(ovanswer);
            })
            poiCont.setActlnglat();
            console.log("cMapMaker: Static load done.");
        }
        const setBGImage = function (imgUrl) {  // basemenuの背景画像設定
            const test = new Image();
            const versionedImgUrl = window.withAppAssetVersion(imgUrl);
            test.onload = () => document.body.style.setProperty("--bg-url", `url(${versionedImgUrl})`);
            test.onerror = () => document.body.style.setProperty("--bg-url", "none");
            test.src = versionedImgUrl;
        }

        const localActivityUrl = function (rawUrl) {
            const url = new URL(rawUrl, location.href);
            if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(location.hostname)) {
                url.hostname = location.hostname;
            }
            return url;
        }

        const configureLocalActivityBackend = function () {
            const settings = Conf.activity?.local;
            if (!settings?.use || !(settings.hosts || []).includes(location.hostname)) return null;
            if (settings.url) {
                Conf.activity.url = localActivityUrl(settings.url).href;
                console.info(`Activity API endpoint configured (no request yet): ${Conf.activity.url}`);
            }
            return settings;
        }

        const loadLocalActivitySchema = async function (settings) {
            if (!settings) return;
            const url = localActivityUrl(settings.schemaUrl);
            if (settings.app) url.searchParams.set("app", settings.app);
            const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
            if (!response.ok) throw new Error(`Activity Schema load failed: HTTP ${response.status}`);
            const schema = await response.json();
            const adapted = ActivitySchemaAdapter.apply(Conf.activities, schema, settings);
            Conf.activities = adapted.activities;
            glot.data = Object.assign(glot.data, adapted.labels);
            console.info(`Activity Schema: local API (${url.href})`);
        }

        Promise.all(fetchUrls)
            .then(async (texts) => {
                let basehtml = texts[0]; // Get Menu HTML
                for (let i = 1; i <= 7; i++) {
                    Conf = Object.assign(Conf, JSON5.parse(texts[i]));
                }
                this.prepareConfig();
                Conf.osm = Object.assign(Conf.osm, JSON5.parse(texts[8]).osm);
                Conf.category_keys = Object.keys(Conf.category); // Make Conf.category_keys
                Conf.category_subkeys = Object.keys(Conf.category_sub); // Make Conf.category_subkeys
                glot.data = Object.assign(glot.data, JSON5.parse(texts[10])); // shared labels
                glot.data = Object.assign(glot.data, JSON5.parse(texts[9])); // app labels override shared labels
                const localActivitySettings = configureLocalActivityBackend();
                try {
                    await loadLocalActivitySchema(localActivitySettings);
                } catch (error) {
                    console.warn("Activity Schema: local API unavailable; using bundled configuration.", error);
                }
                let UrlParams = setUrlParams();
                if (Conf.selectItem.action === "ChangeMap"
                    && UrlParams.category
                    && Conf.tile[UrlParams.category]) {
                    Conf.map.tileName = UrlParams.category;
                }
                if (UrlParams.edit) Conf.etc["editMode"] = true;
                if (UrlParams.static !== undefined) {
                    const staticMode = basic.parseBoolean(UrlParams.static);
                    if (staticMode !== null) Conf.static.use = staticMode;
                }

                listTable.init();
                poiCont.init(Conf.minimap.use);

                // 初期HTMLのスプラッシュを、地図UIの準備が完了するまで表示し続ける。
                // MapLibreを非表示・0サイズの要素内で初期化すると、Firefoxでは初回の
                // スタイル／タイル読み込みが遅延することがある。進捗画面の背後で先に
                // 実寸レイアウトを確定してから地図を作る。
                article.classList.remove("d-none");
                article.style.removeProperty("display");
                winCont.resizeWindow();
                mapLibre.init(Conf).then(() => { // GASの応答を待たず、地図を先に初期化する
                    // MapLibre add control
                    console.log("initialize: MapLibre OK.");
                    feature3d.init(mapLibre.map, Conf.feature3d || {}).then(ready => {
                        if (ready) cMapMaker.viewPoi(listTable.getSelCategory());
                    }).catch(error => console.warn("MapFeature3D: marker refresh failed", error));
                    mapLibre.addControl("top-left", "baselist", basehtml, "mapLibre-control m-0 p-0"); // Make: base list
                    setBGImage(Conf.listTable.backgroundImage)
                    mapLibre.addControl("bottom-right", "dummy", " ", "");

                    if (Conf.map.changeMap) mapLibre.addControl("bottom-right", "maplist", "<button onclick='cMapMaker.changeMap()'><i class='fas fa-layer-group fa-lg'></i></button>", "maplibregl-ctrl-group");
                    mapLibre.addControl("bottom-left", "images", "", "showcase"); // add images
                    mapLibre.addNavigation("bottom-right");
                    mapLibre.addControl("bottom-left", "globalStatus", "", "m-0");
                    globalStatus.innerHTML = '<div class="global-status-message" role="status" aria-live="polite"><div id="globalSpinner" class="spinner-border text-primary d-none" aria-hidden="true"></div><span id="globalMessage" class="globalMessage"></span></div>';
                    globalStatus.appendChild(document.getElementById("mapDisplayStatus"));
                    mapLibre.setGlobalStatusControlPosition(globalStatus);
                    newsTicker.init(Conf.news, mapLibre, Conf.tile);
                    cMapMaker.initIndoorControl(UrlParams.level);
                    winCont.playback(Conf.listTable.playback.view); // playback control view:true/false
                    winCont.download(Conf.listTable.download); // download view:true/false
                    cMapMaker.changeMode("list");
                    cMapMaker.showMapTitleWhenReady(mapLibre.selectStyle);
                    const mergedMenu = [...Conf.menu.main, ...Conf.menu.mainSystem];
                    winCont.menu_make(mergedMenu, "main_menu");
                    winCont.mouseDragScroll(images, cMapMaker.eventViewThumb); // set Drag Scroll on images
                    winCont.initSidebarResize();
                    glot.render();
                    document.querySelectorAll("[data-glot-title], [data-glot-aria-label]").forEach(element => {
                        for (const attribute of ["title", "aria-label"]) {
                            const key = element.getAttribute(`data-glot-${attribute}`);
                            if (key) element.setAttribute(attribute, glot.get(key));
                        }
                    });
                    areaSearchController.init();
                    const filterButton = document.getElementById("poiFilterButton");
                    if (filterButton) filterButton.hidden = Conf.areaSearch.use !== true && !Conf.etc.localSave;
                    const listModes = document.querySelector(".place-list-mode");
                    if (listModes) listModes.hidden = !Conf.etc.localSave;
                    listActions.init(Conf.listActions ?? Conf.system?.listActions);
                    list_keyword.setAttribute("placeholder", glot.get("searchKeyword"));
                    listTitle.innerHTML = glot.get("listTitle");
                    let resizeWaitTime;
                    window.onresize = () => { // 画面サイズに合わせたコンテンツ表示切り替え
                        winCont.resizeWindow();
                        clearTimeout(resizeWaitTime);
                        resizeWaitTime = setTimeout(() => {
                            winCont.setSidebar("redraw").then(() => {
                                cMapMaker.makeImages(Conf.thumbnail.use);
                            });
                        }, 100);
                    };
                    if (LANG === "en") document.title = glot.get("site_title");
                    cMapMaker.clearDatail() // 詳細モーダルの内容をクリア

                    const initialCategory = decodeURI(
                        (UrlParams.category !== "" && UrlParams.category !== undefined) ? UrlParams.category : Conf.selectItem.default
                    );
                    let resolveInitialView;
                    const initialViewReady = new Promise((resolve) => { resolveInitialView = resolve; });
                    const applicationReady = winCont.setSidebar(Conf.sideBar.initView).then(() => {
                        // 地図操作イベントは先に登録する。ただし初回データ取得が終わるまでは
                        // status=initialize のため、パン／ズームによる重複取得は発生しない。
                        cMapMaker.status = "initialize";
                        cMapMaker.addEvents();
                        window.hideStartupStatus?.();
                        cMapMaker.initDailyIntro();
                    });
                    // 外部のActivityデータも地図が操作可能になってから取得する。
                    const activityDataPromise = cMapMaker.usesActivityBbox()
                        ? null : applicationReady.then(() => gSheet.get(Conf.activity.url));
                    let initialLoadStarted = false;
                    const init_close = function () {
                        if (initialLoadStarted) return;
                        initialLoadStarted = true;
                        applicationReady.then(() => {
                            // スプラッシュが閉じて地図が描画された次のフレームから、
                            // 操作を妨げない状態で周辺データの取得を始める。
                            requestAnimationFrame(() => requestAnimationFrame(() => {
                                cMapMaker.updateView(initialCategory).then(() => {     // 初期データロード
                                    mapLibre.addCountryFlagsImage(poiCont.getAllOSMCountryCode())
                                    winCont.resizeWindow()
                                    if (UrlParams.node || UrlParams.way || UrlParams.relation) {
                                        let keyv = Object.entries(UrlParams).find(([key, value]) => value !== undefined)
                                        let param = keyv[0] + "/" + keyv[1]
                                        let subparam = param.split(".") // split child elements(.)
                                        let osmdata = poiCont.get_osmid(subparam[0])
                                        let geojson = osmdata !== undefined ? osmdata.geojson : undefined
                                        if (osmdata !== undefined) {
                                            cMapMaker.viewDetail(subparam[0], subparam[1])
                                                .then(() => {
                                                    geoCont.flashPolygon(geojson)
                                                    geoCont.writePoiCircle(geojson)
                                                    const detailZoom = Math.max(mapLibre.getZoom(true), Conf.map.detailZoom)
                                                    mapLibre.flyTo(osmdata.lnglat, detailZoom)
                                                })
                                                .catch((e) => {
                                                    console.warn("cMapMaker.init: viewDetail failed", e);
                                                });
                                        } else {
                                            console.warn("cMapMaker.init: No OSM data found for ID:", subparam[0]);
                                        }
                                    }
                                }).catch((error) => {
                                    console.error("cMapMaker.init: Initial view load failed.", error);
                                }).finally(() => {
                                    cMapMaker.status = "normal";
                                    resolveInitialView();
                                    // Firefoxではサイドバー確定後の再描画が必要。
                                    setTimeout(() => { cMapMaker.eventMoveMap() }, 300)
                                });
                            }));
                        });
                    }

                    poiCont.setActdata([]);
                    if (Conf.poiView.poiActLoad) {
                        let osmids = poiCont.pois().acts.map((act) => { return act.osmid; });
                        osmids = osmids.filter(Boolean);
                        if (osmids.length > 0 && !Conf.static.use) {   // osmidsがある&非static時
                            overPassCont.getOsmIds(osmids)
                                .then((geojson) => {
                                    if (geojson) poiCont.addGeojson(geojson)
                                    poiCont.setActlnglat()
                                })
                                .catch((error) => {
                                    console.error("cMapMaker.init: Initial Overpass load failed.", error);
                                })
                                .finally(() => {
                                    init_close();
                                });
                        } else {    // static時
                            loadStatic()
                                .catch((error) => {
                                    console.error("cMapMaker.init: Static data load failed.", error);
                                })
                                .finally(() => {
                                    poiCont.setActlnglat()
                                    init_close()
                                })
                        }
                    } else if (Conf.static.use) {       // actLoadしない&Static時
                        loadStatic()
                            .catch((error) => {
                                console.error("cMapMaker.init: Static data load failed.", error);
                            })
                            .finally(() => init_close())
                    } else {
                        init_close()
                    }
                    activityDataPromise?.then(async (activities) => {
                        await initialViewReady;
                        if (!Conf.activity.url || activities.length === 0) return;
                        poiCont.setActdata(activities);

                        if (Conf.poiView.poiActLoad && !Conf.static.use) {
                            const osmids = activities.map((act) => act.osmid).filter(Boolean);
                            if (osmids.length > 0) {
                                try {
                                    const geojson = await overPassCont.getOsmIds(osmids);
                                    if (geojson) poiCont.addGeojson(geojson);
                                } catch (error) {
                                    console.error("cMapMaker.init: Deferred Overpass load failed.", error);
                                }
                            }
                        }

                        poiCont.setActlnglat();
                        await cMapMaker.updateView(initialCategory);
                        if (cMapMaker.openOSMid) await cMapMaker.viewDetail(cMapMaker.openOSMid);
                        if (!Conf.static.use) mapLibre.addCountryFlagsImage(poiCont.getAllOSMCountryCode());
                        console.log("initialize: Deferred activity data loaded.");
                    }).catch((error) => {
                        console.error("cMapMaker.init: Deferred activity data load failed.", error);
                    });
                }).catch((e) => {
                    console.error("cMapMaker.init: MapLibre init failed", e);
                    window.setStartupStatus?.(window.startupText("mapFailed"), true);
                });
            }).catch((e) => {
                console.error("cMapMaker.init: initial file load failed", e);
                window.setStartupStatus?.(window.startupText("configFailed"), true);
            });
    }

    addEvents() {
        mapLibre.on('moveend', this.eventMoveMap.bind(cMapMaker))   		// マップ移動時の処理
        mapLibre.on('moveend', () => newsTicker.update())
        mapLibre.on('zoomend', this.eventZoomMap.bind(cMapMaker))			// ズーム終了時に表示更新
        list_category.addEventListener('change', this.eventChangeCategory.bind(cMapMaker))	// category change
        list_keyword.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            cMapMaker.searchKeyword(list_keyword.value);
        });
    }

    // about Map
    about() {
        let msg = glot.get("about_message");
        msg = msg.replace(/\n/g, "<br>")  // 改行コードを<br>に変換
        msg = "<span class=`fs-5`>" + msg + "</span>"
        mapLibre.viewMiniMap(false)
        winCont.makeDetail({ "title": glot.get("about"), "message": msg, "mode": "close", "menu": false })
        cMapMaker.changeMode("map")
        winCont.setSidebar("view")
    }

    // About license
    licence() {
        let msg = glot.get("licence_message") + glot.get("more_message");
        msg = msg.replace(/\n/g, "<br>")  // 改行コードを<br>に変換
        msg = "<span class=`fs-5`>" + msg + "</span>"
        mapLibre.viewMiniMap(false)
        winCont.makeDetail({ "title": glot.get("licence_title"), "message": msg, "mode": "close", "menu": false });
        cMapMaker.changeMode("map")
        winCont.setSidebar("view")
    }

    changeMode(newmode) {	// mode change(list or map or edit)
        this.mode = newmode ? newmode : (this.mode == "map" ? "list" : "map");
        basic.openAccordion(!["map", "edit"].includes(this.mode) ? "listAccordion" : "detailArea")	// アコーディオン切り替え
        basic.closeAccordion(["map", "edit"].includes(this.mode) ? "listAccordion" : "detailArea")	// アコーディオン切り替え
        if (this.mode == "list") {
            geoCont.writePoiCircle()
            cMapMaker.clearDatail()
        }
        //closeDetail.classList.toggle("d-none", this.mode == "list") // 詳細モーダルの閉じるボタンを非表示
    }

    showMapTitleWhenReady(styleName) {
        const map = mapLibre.map;
        const requestId = ++this.mapTitleRequestId;
        const showTitle = () => {
            if (requestId !== this.mapTitleRequestId || mapLibre.selectStyle !== styleName) return;
            requestAnimationFrame(() => {
                setTimeout(() => {
                    if (requestId !== this.mapTitleRequestId || mapLibre.selectStyle !== styleName) return;
                    winCont.showMessage(Conf.tile[styleName].name);
                }, MAP_TITLE_DISPLAY_DELAY_MS);
            });
        };

        if (map?.loaded()) {
            showTitle();
        } else {
            map?.once("idle", showTitle);
        }
    }

    changeMap() {	// Change Map Style(rotation)
        let styleName = mapLibre.changeMap()
        newsTicker.update()
        this.showMapTitleWhenReady(styleName)
        setTimeout(() => {
            this.eventMoveMap()
            let snow = styleName.indexOf("SNOW") > -1;      // SNOWの文字列があれば雪を降らす
            winCont.fallsSnow(snow)
        }, 1000)
    }

    // OverPassキャッシュモード設定
    setCacheMode(mode) {
        let UseCache = overPassCont.useCache(mode)
        globalMessage.innerHTML = glot.get(UseCache ? "UseOVCacheYes" : "UseOVCacheNo");
        setTimeout(() => { globalMessage.innerHTML = "" }, 4000)
    }

    getPoiZoom(target) {
        const defaultZoom = Conf.poiView?.poiZoom?.[target];
        const isMobile = basic.isSmartPhone()
            || (window.matchMedia && window.matchMedia("(max-width: 640px)").matches);
        const mobileZoom = Conf.poiView?.mobilePoiZoom?.[target];
        return isMobile && mobileZoom !== undefined ? mobileZoom : defaultZoom;
    }

    setVisitedFilter(visitedFilterStatus) {
        console.log(`cMapMaker: setVisitedFilter: ${visitedFilterStatus}`);
        this.visitedFilterStatus = visitedFilterStatus;
        this.refreshLocalFilters();
    }

    toggleFavoriteFilter(checked) {
        console.log(`cMapMaker: toggleFavoriteFilter: ${checked}`);
        this.favoriteFilter = checked;
        this.refreshLocalFilters();
    }

    refreshLocalFilters() {
        // Personal filters change presentation, not the loaded geographic extent.
        listTable.makeList(false);
        listTable.filterByPoiStatus(this.visitedFilterStatus, this.favoriteFilter, false);
        listTable.renderList();
        areaSearchController.renderSummary();
        this.makeImages(Conf.thumbnail.use);
        this.viewArea();
        this.viewPoi(listTable.getSelCategory());
        feature3d.sync();
    }

    viewArea() {			// Area(敷地など)を表示させる refタグがあれば()表記
        let targets = poiCont.getTargets()  //
        console.log("viewArea: " + targets.join())
        targets.forEach((target) => {
            const osmConf = Conf.osm[target]
            if (!osmConf) return
            if (osmConf.expression.viewArea) {   // viewArea: trueが対象
                if (osmConf.expression.renderer !== "indoor"
                    && mapLibre.isPolygonSourceCurrent(target, poiCont.revision)) return;
                let pois = poiCont.getPois(target, false)
                if (osmConf.expression.renderer === "indoor") {
                    const controlPois = poiCont.getPois("-", false);
                    this.syncIndoorLevelControl(controlPois.geojson, controlPois.targets);
                    mapLibre.addIndoor({
                        "type": "FeatureCollection",
                        "features": this.getIndoorRenderFeatures(pois)
                    }, target, this.indoorLevel);
                    return;
                }
                let titleTag = "";
                if (!osmConf.expression.poiView) {  // poiViewがfalseの時(true時はpoiView側で表示するため)
                    titleTag = ["format", ["case", ["all", ["has", "ref"], ["!=", ["get", "ref"], ""]],
                        ["case", ["has", "local_ref"],
                            ["concat", "(", ["get", "ref"], "/", ["get", "local_ref"], ") ", ["coalesce", ["get", "name"], ""]],
                            ["concat", "(", ["get", "ref"], ") ", ["coalesce", ["get", "name"], ""]]
                        ], ["coalesce", ["get", "name"], ""]
                    ], {}];
                }
                mapLibre.addPolygon(
                    { "type": "FeatureCollection", "features": pois.geojson },
                    target,
                    titleTag,
                    poiCont.revision
                )
            }
        })
    }

    viewPoi(targets) {		// Poiを表示させる
        let nowselect = listTable.getSelCategory()          // tags,key=valueの複数値
        nowselect = nowselect[0] == "" ? "-" : nowselect[nowselect.length - 1]
        //console.log(`viewPoi: Start(now select ${nowselect}).`)
        targets = targets[0] == "-" || targets[0] == "" ? poiCont.getTargets() : targets;		// '-' or ''はすべて表示
        targets = targets.filter(target => {                                                    // poiView=trueのみ返す
            return Conf.osm[target] !== undefined ? Conf.osm[target].expression.poiView : false;
        })
        targets = Object.keys(Conf.poiView.poiZoom).indexOf("activity") > -1 ? targets.concat("activity") : targets;
        targets = Conf.etc.editMode ? targets.concat(Object.keys(Conf.poiView.editZoom)) : targets	// 編集時はeditZoom追加
        targets = [...new Set(targets)];    // 重複削除
        const markerList = listTable.getMarkerList();

        let subcategory = poiCont.getTargets().indexOf(nowselect) > -1 || nowselect == "-" ? false : true;	// サブカテゴリ選択時はtrue
        if (subcategory) {	// targets 内に選択肢が含まれていない場合（サブカテゴリ選択時）
            poiCont.setPoi(markerList, false)
        } else {			// targets 内に選択肢が含まれている場合
            let nowzoom = mapLibre.getZoom(false)
            //targets = targets.filter(target => target !== "activity");  // activiyがあれば削除 // 2025/08/20 一旦false
            targets = targets.filter(s => s !== "");
            if (nowselect === "-") {
                poiCont.setPoi(markerList, false) //nowselect == Conf.activity.targetName) // 2025/08/20 一旦false
            } else {
                for (let target of targets) {
                    console.log("viewPoi: " + target)
                    let poiView = Conf.activity.targetName == target ? true : Conf.osm[target].expression.poiView	// activity以外はexp.poiViewを利用
                    let flag = nowzoom >= this.getPoiZoom(target)
                        || (Conf.etc.editMode && nowzoom >= Conf.poiView.editZoom[target])
                    if ((target == nowselect) && flag && poiView) {	// 選択している種別の場合
                        poiCont.setPoi(markerList, false) // target == Conf.activity.targetName) // 2025/08/20 一旦false
                        break
                    }
                }
            }
        }
    }

    // 画面内のActivity画像・OSMのCommons画像を表示させる(view: true=表示)
    makeImages(view) {
        if (view) {
            let acts = []
            const filteredRows = listTable.getFilterList();
            const rowsKey = filteredRows.map((row) => row[0]).join("\u0000");
            if (rowsKey !== this.thumbnailRowsKey) {
                this.thumbnailRowsKey = rowsKey;
                this.thumbnailRows = basic.shuffleArray(filteredRows.slice());
            }
            const rows = this.thumbnailRows;
            listTable.getThumbnailActivities(rows).forEach(act => {
                if (act !== undefined) {
                    let urls = []
                    let actname = act.id.split("/")[0]
                    if (Conf.activities[actname] !== undefined) {
                        let forms = Conf.activities[actname].form
                        for (const key of Object.keys(forms)) { // 複数あっても一つだけとする
                            if (forms[key].type === "image_url" && String(act[key] ?? "").trim()) {
                                urls.push(act[key]);
                                break;
                            }
                        }
                    } else {
                        console.warn("cMapmaker.makeImage: No Activity Name");
                    }
                    if (urls.length) acts.push({ "src": urls, "osmid": act.osmid, "title": act.title })
                }
            })
            const imageKeys = new Set(acts.flatMap(act =>
                act.src.map(src => JSON.stringify([act.osmid, String(src).trim()]))));
            for (const osmImage of listTable.getThumbnailOsmImages()) {
                const key = JSON.stringify([osmImage.osmid, osmImage.src[0]]);
                if (imageKeys.has(key)) continue;
                imageKeys.add(key);
                acts.push(osmImage);
            }
            if (acts.length > 0) {
                images.classList.remove("d-none");
                winCont.setImages(images, acts, Conf.etc.loadingUrl, Conf.thumbnail.limits)
                requestAnimationFrame(() => {
                    const imageHeight = images.classList.contains("d-none") ? 0 : images.offsetHeight;
                    dummy.style.height = imageHeight + "px";	// 画像表示領域の高さをダミーに設定
                });
                if (this.scrollHints == 0) winCont.scrollHint(); this.scrollHints++;
            } else {
                winCont.disconnectImageObserver();
                images.classList.add("d-none");
                dummy.style.height = "0px";
            }
        } else {
            winCont.disconnectImageObserver();
            images.classList.add("d-none");
            dummy.style.height = "0px";
        }
    }

    usesActivityBbox() {
        return Conf.activity?.authMode === "basic" && Boolean(Conf.activity?.url)
            && !gSheet._isGAS(Conf.activity.url);
    }

    async loadActivitiesForView(force = false) {
        if (!this.usesActivityBbox()) return false;
        // A date-line crossing view cannot be represented by one API BBOX.
        const viewportBbox = areaSearchController.searchBbox();
        const bbox = viewportBbox ?? "-180,-90,180,90";
        if (!force && bbox === this.lastActivityBbox) return false;
        const requestId = ++this.activityRequestId;
        const url = new URL(Conf.activity.url, location.href);
        url.searchParams.set("bbox", bbox);
        console.info(viewportBbox === null
            ? "Activity BBOX request (full-world fallback):"
            : "Activity BBOX request (viewport):", url.href);
        try {
            const activities = await gSheet.get(url.href, { throwOnError: true });
            if (requestId !== this.activityRequestId) return false;
            if (Conf.poiView.poiActLoad && !Conf.static.use) {
                // Coordinate-less rows are returned in every BBOX. Let the viewport OSM query resolve them.
                const osmids = [...new Set(activities.filter(act =>
                    act.latitude !== null && act.longitude !== null
                    && Number.isFinite(Number(act.latitude)) && Number.isFinite(Number(act.longitude))
                ).map(act => act.osmid).filter(Boolean))]
                    .filter(osmid => !poiCont.get_osmid(osmid));
                if (osmids.length) {
                    try {
                        const geojson = await overPassCont.getOsmIds(osmids);
                        if (requestId !== this.activityRequestId) return false;
                        if (geojson) poiCont.addGeojson(geojson);
                    } catch (error) {
                        console.warn("cMapMaker: Activity OSM load failed", error);
                    }
                }
            }
            if (requestId !== this.activityRequestId) return false;
            poiCont.setActdata(activities);
            this.lastActivityBbox = bbox;
            poiCont.setActlnglat();
            console.info(`Activity BBOX applied: ${activities.length} rows (${bbox})`);
            return true;
        } catch (error) {
            console.warn("cMapMaker: Activity BBOX load failed", error);
            return false;
        }
    }

    async reloadActivitiesForView() {
        if (this.usesActivityBbox()) {
            if (!await this.loadActivitiesForView(true)) throw new Error("Activity reload failed");
        } else {
            const activities = await gSheet.get(Conf.activity.url);
            poiCont.setActdata(activities);
            poiCont.setActlnglat();
        }
        return this.updateView();
    }

    // OSMとGoogle SpreadSheetからPoiを取得してリスト化
    updateOsmPoi(targets) {
        const progressUnitBytes = 1024 * 1024;
        let displayedProgressTenths = 0;
        return new Promise((resolve) => {
            console.log("cMapMaker: updateOsmPoi: Start");
            winCont.spinner(true);
            var keys = (targets !== undefined && targets !== "") ? targets : poiCont.getTargets();
            let PoiLoadZoom = 99;
            for (let key of Object.keys(Conf.poiView.poiZoom)) {
                const value = this.getPoiZoom(key);
                if (key !== Conf.activity.targetName) PoiLoadZoom = value < PoiLoadZoom ? value : PoiLoadZoom;
            };
            if (Conf.etc.editMode) {
                for (let [key, value] of Object.entries(Conf.poiView.editZoom)) {
                    if (key !== Conf.activity.targetName) PoiLoadZoom = value < PoiLoadZoom ? value : PoiLoadZoom;
                }
            }
            if ((mapLibre.getZoom(true) < PoiLoadZoom)) {
                winCont.spinner(false);
                console.log("[success]cMapMaker: updateOsmPoi End(more zoom).");
                resolve({ "update": true });
            } else {
                overPassCont.getGeojson(keys, status_write).then(ovanswer => {
                    winCont.spinner(false);
                    console.log("[success]cMapMaker: updateOsmPoi End.");
                    resolve({ "update": true, "geojson": ovanswer });
                }).catch(() => {
                    winCont.spinner(false);
                    console.log("[error]cMapMaker: updateOsmPoi end.");
                    resolve({ "update": false });
                });
            }
        })

        function status_write(progress) {
            const progressTenths = Math.floor(progress * 10 / progressUnitBytes);
            if (progressTenths < 1 || progressTenths === displayedProgressTenths) return;
            displayedProgressTenths = progressTenths;
            winCont.setLoadingStatus(`${glot.get("loading_message")} ${(progressTenths / 10).toFixed(1)} MB`);
        }
    }

    // 通信完了が次のドラッグ開始と重なった場合は、操作を先に完了させる。
    waitForMapInteractionEnd() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                const map = mapLibre.map;
                if (!map?.isMoving?.()) {
                    resolve();
                    return;
                }
                map.once("moveend", resolve);
            });
        });
    }

    // OSMデータを取得して画面表示
    updateView(cat) {
        console.log("updateView Start.")
        const requestId = ++this.updateViewRequestId;
        const activityPromise = this.loadActivitiesForView();
        return new Promise((resolve) => {
            this.updateOsmPoi().then(async (status) => {
                await activityPromise;
                if (requestId !== this.updateViewRequestId) {
                    console.log("updateView: Ignore stale response.");
                    resolve({ "update": false, "stale": true });
                    return;
                }
                switch (status.update) {
                    case true:
                        await this.waitForMapInteractionEnd();
                        if (requestId !== this.updateViewRequestId) {
                            resolve({ "update": false, "stale": true });
                            return;
                        }
                        if (status.geojson) {
                            poiCont.addGeojson(status.geojson);
                            poiCont.setActlnglat();
                        }
                        // 新しい移動が予約済みなら、古い範囲のDOM更新は行わない。
                        if (this.moveMapPending) {
                            resolve({ "update": false, "deferred": true });
                            return;
                        }
                        await areaSearchController.syncSearch();
                        if (requestId !== this.updateViewRequestId) {
                            resolve({ "update": false, "stale": true });
                            return;
                        }
                        let targets = listTable.getSelCategory();
                        targets = (targets[0] == '' && cat !== undefined) ? [cat] : targets;
                        listTable.makeList(false)
                        listTable.makeSelectList(Conf.listTable.category)
                        listTable.selectCategory(targets, false)
                        listTable.filterByPoiStatus(this.visitedFilterStatus, this.favoriteFilter, false);
                        listTable.renderList();
                        if (Conf.changes?.ticker?.use === true) this.showChangeTicker();
                        areaSearchController.renderSummary();
                        if (window.getSelection) window.getSelection().removeAllRanges()
                        this.makeImages(Conf.thumbnail.use)
                        this.viewArea()	        // 入手したgeoJsonを追加
                        this.viewPoi(targets)	// in targets
                        feature3d.sync()
                        resolve({ "update": true })
                        break
                    default:
                        console.log("updateView Error.")
                        resolve({ "update": false })
                        break
                }
            }).catch((error) => {
                console.warn("cMapMaker.updateView failed", error);
                resolve({ "update": false, "error": true });
            })
        })
    }

    // キーワード検索
    searchKeyword(keyword) {
        if (keyword !== null) {
            const div = document.createElement("div");             // サニタイズ処理
            div.appendChild(document.createTextNode(keyword));
            this.changeMode('list')
            setTimeout(() => { listTable.filterKeyword(div.innerHTML) }, 300)
            areaSearchController.renderDisplayStatus();
        }
    }

    // 詳細モーダル表示
    viewDetail(osmid, openid) {	// PopUpを表示(marker,openid=actlst.id)]
        console.log("viewDatail: Start");

        return new Promise((resolve, reject) => {
            const makeFlag = (country) => {     // 旗アイコンを追加
                if (country == undefined) return ""
                let title = "", countries = country.split(";")
                const flagPath = (Conf.icon?.flagPath ?? "https://flagcdn.com/h20").replace(/\/$/, "");
                countries.forEach(CCode => {
                    const code = CCode.trim().toLowerCase();
                    if (!/^[a-z0-9_-]+$/.test(code)) return;
                    title += `<img src="${flagPath}/${code}.png" class="ms-1 me-1" height="16" alt="${code} Flag">`;
                })
                return title
            }

            const makeDatail = (osmid, openid) => {
                if (osmid == "" || osmid == undefined) {    // OSMIDが空の時はクリアして終了
                    cMapMaker.clearDatail()
                    geoCont.writePoiCircle()
                    resolve()
                    return
                }

                winCont.setSidebar("view").then(() => {
                    console.log("viewDatail: Get OSM Data.");
                    let osmobj = poiCont.get_osmid(osmid);
                    if (osmobj == undefined) { console.log("Error: No osmobj / ID: " + osmid); reject(); return }	// Error

                    let tags = osmobj.geojson.properties;
                    let target = osmobj.targets[0];
                    tags["*"] = "*";
                    target = target == undefined ? "*" : target;			// targetが取得出来ない実在POI対応
                    let category = poiCont.getCatnames(tags);
                    let flagsHTML = makeFlag(tags.country);
                    if (flagsHTML !== "") { // 国旗がある場合はminiMapを設定してHTML追加
                        mapLibre.addMiniMap()
                            .then(() => {
                                flags.innerHTML = flagsHTML;
                                mapLibre.showCountryByCode(tags.country);
                            })
                            .catch((e) => {
                                console.warn("cMapMaker.viewDetail: addMiniMap failed", e);
                            });
                    }

                    let title = `<img src="./${Conf.icon.fgPath}/${poiCont.getIcon(tags)}" class="ms-1 me-1" height="28">`
                    let message = "";
                    let name = poiCont.getOSMname(tags, glot.lang);
                    name = name == "" ? poiCont.getCatnames(tags)[0] : name;   // 名前がある場合は「: 名前」とする
                    title += name;

                    if (title == "") title = category[0] + category[1] !== "" ? "(" + category[1] + ")" : "";   // サブカテゴリ時は追加
                    if (title == "") title = glot.get("undefined");
                    winCont.menu_make(Conf.menu.modal, "btnMenu");
                    winCont.setProgress(0);

                    console.log("viewDatail: Make OSM Basic Info.");
                    message += osmBasic.make(tags);
                    message += osmBasic.makeAreaFacilities(osmid);
                    message += areaSearchController.matchReasonHtml(osmid);
                    if (tags.wikipedia !== undefined) {
                        message += wikimedia.makeWikipediaOverView(tags.wikipedia)
                    }

                    // append activity
                    let catname = listTable.getSelCategory() !== "-" ? `&category=${listTable.getSelCategory()}` : "";
                    let actlists = poiCont.getActlistByOsmid(osmid);
                    const detailUrl = this.withIndoorLevel(location.pathname + "?" + osmid + (!openid ? "" : "." + openid) + catname);
                    history.replaceState('', '', detailUrl + location.hash);
                    if (actlists.length > 0) {	// アクティビティ有り
                        message += modalActs.make(actlists);
                        winCont.makeDetail({ "title": title, "message": message, "append": Conf.menu.activities, "menu": true, "openid": openid });
                    } else {					// アクティビティ無し
                        winCont.makeDetail({ "title": title, "message": message, "append": Conf.menu.activities, "menu": true, "openid": openid });
                    }
                    mapLibre.viewMiniMap(tags.country)
                    cMapMaker.changeMode("map")
                    this.detail = true
                    this.openOSMid = osmid
                    listTable.recordView(osmid, name);
                    const element = document.getElementById('btmHeader');
                    element.scrollTo({ top: 0, behavior: 'smooth' });
                    resolve()
                })
            }

            if (this.mode == "edit") {    // 編集モード時は閉じるか確認する
                winCont.confirm({
                    title: glot.get("confirmCloseTitle"),
                    message: glot.get("confirmCloseDetail"),
                    callback: (answer) => {
                        if (answer) {
                            cMapMaker.clearDatail()
                            this.loadDetailLibraries()
                                .then(() => makeDatail(osmid, openid))
                                .catch((error) => {
                                    console.warn("viewDetail: Failed to load detail libraries.", error);
                                    reject(error);
                                });
                        } else {
                            console.log("viewDatail: Cancel.");
                            reject()
                        }
                    }
                });
            } else {
                this.loadDetailLibraries()
                    .then(() => makeDatail(osmid, openid))
                    .catch((error) => {
                        console.warn("viewDetail: Failed to load detail libraries.", error);
                        reject(error);
                    });
            }
        })
    }

    togglePoiStatus(id) {
        const button = document.getElementById(id);
        if (!button) return;
        const pressed = button.getAttribute("aria-pressed") !== "true";
        button.setAttribute("aria-pressed", String(pressed));
        button.querySelector("i").classList.toggle("fa-solid", pressed);
        button.querySelector("i").classList.toggle("fa-regular", !pressed);
        this.savePoiStatus(true);
    }

    savePoiStatus(refreshMarkers = false) {
        if (!Conf.etc.localSave) return;
        const visited = document.getElementById("visited");
        const favorite = document.getElementById("favorite");
        const memo = document.getElementById("visited-memo");
        if (!visited || !favorite || !memo) return;
        poiStatusCont.setValueByOSMID(visited.name, visited.getAttribute("aria-pressed") === "true", favorite.getAttribute("aria-pressed") === "true", memo.value);
        if (refreshMarkers) {
            this.viewPoi(listTable.getSelCategory());
            listTable.renderList();
        }
    }

    clearDatail() {
        const visited = document.getElementById("visited")
        const favorite = document.getElementById("favorite")
        const memo = document.getElementById("visited-memo")
        const mmap = document.getElementById("mini-map")
        const menu = document.getElementById("btnMenu")
        const detailMenu = document.getElementById("detailMenu")
        if (Conf.etc.localSave !== "" && visited !== null) {    // 訪問機能が有効＆訪問済みチェックの場合
            this.savePoiStatus()
            cMapMaker.eventMoveMap()                            // アイコン表示を更新
        }
        mmap.classList.add("d-none")
        detailMenu.classList.add("d-none")
        winCont.setDetailHeaderMode(false)

        if (this.status !== "initialize") {
            const selectedCategory = listTable.getSelCategory().join(",");
            const catname = selectedCategory !== "" && selectedCategory !== "-"
                ? `?category=${encodeURIComponent(selectedCategory)}` : "";
            history.replaceState('', '', this.withIndoorLevel(location.pathname + catname) + location.hash)
        }
        this.openOSMid = null
        this.detail = false
        btmWindow_title.innerHTML = ""
        btmWindow_message.innerHTML = ""
        return winCont.setSidebar()
    }

    getDirectionsUrl(osmid) {
        if (Conf.directions?.use !== true) return "";
        const linker = window.areaFeatureLinker;
        const areaId = linker?.resolveAreaId(osmid) || osmid;
        const area = linker?.getAreaRecord(osmid);
        const positions = [poiCont.get_osmid(areaId)?.lnglat,
            area ? [area.lng, area.lat] : null, poiCont.get_osmid(osmid)?.lnglat];
        for (const position of positions) {
            if (!Array.isArray(position) || position.length < 2
                || position.slice(0, 2).some(value => value == null || String(value).trim() === "")) continue;
            const [lng, lat] = position.map(Number);
            if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) continue;
            const url = new URL("https://www.google.com/maps/dir/");
            url.searchParams.set("api", "1");
            url.searchParams.set("destination", `${lat},${lng}`);
            return url.href;
        }
        return "";
    }

    async shareURL(actid) { // URL共有機能
        const url = new URL(Conf.etc.publicUrl || location.origin + location.pathname);
        url.search = location.search + (actid == undefined ? "" : "." + actid);
        url.hash = location.hash;
        try {
            await navigator.clipboard.writeText(url.href);
            winCont.showMessage(glot.get("share_url_copied"));
            return true;
        } catch (_) {
            window.prompt(glot.get("share_url_copy_failed"), url.href);
            return false;
        }
    }

    playback() {		// 指定したリストを連続再生()
        const view_control = (list, idx) => {
            if (list.length >= (idx + 1)) {
                listTable.select(list[idx][0]);
                poiCont.select(list[idx][0], false);
                if (this.status == "playback") {
                    setTimeout(view_control, speed_calc(), list, idx + 1);
                };
            } else {
                listTable.disabled(false);
                listTable.heightSet(listTable.height + "px");	// mode end
                this.status = "normal";							// mode stop
                icon_change("play");
            }
        }
        const icon_change = (mode) => { list_playback.className = 'fas fa-' + mode };
        const speed_calc = () => { return ((parseInt(list_speed.value) / 100) * Conf.listTable.playback.timer) + 100 };
        if (this.status !== "playback") {
            listTable.disabled(true);
            listTable.heightSet(listTable.height / 4 + "px");
            mapLibre.setZoom(Conf.listTable.playback.zoomLevel);
            this.changeMode("list");
            this.status = "playback";
            icon_change("stop");
            setTimeout(view_control, speed_calc(), listTable.getDisplayList(), 0);
        } else {
            listTable.disabled(false);
            listTable.heightSet(listTable.height + "px");		// mode end
            this.status = "normal";								// mode stop
            icon_change("play");
        }
    }

    download() {
        const linkid = "temp_download";

        const originalLists = listTable.getFilterList();

        if (originalLists.length == 0) {
            globalMessage.innerHTML = glot.get("noDataDownload");
            setTimeout(() => { globalMessage.innerHTML = ""; }, 4000);
        } else {
            const lists = listTable.getExportData();
            const csv = basic.makeArray2CSV(lists);
            const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
            const blob = new Blob([bom, csv], { type: "text/csv" });
            const link = document.getElementById(linkid) ? document.getElementById(linkid) : document.createElement("a");
            link.id = linkid;
            link.href = URL.createObjectURL(blob);
            link.download = "my_data.csv";
            link.dataset.downloadurl = ["text/plain", link.download, link.href].join(":");
            document.body.appendChild(link);
            link.click();
            URL.revokeObjectURL(link.href);
        }
        return;
    }

    // EVENT: イメージを選択した時のイベント処理
    eventViewThumb(imgdom) {
        console.log("eventViewThumb: Start.");

        const osmid = imgdom.getAttribute("osmid");
        const poi = poiCont.get_osmid(osmid);
        const zoomlv = Math.max(mapLibre.getZoom(true), Conf.map.detailZoom);

        if (zoomlv === undefined) console.log("No " + Conf.map.detailZoom);
        if (poi === undefined) return;

        cMapMaker.viewDetail(osmid).then(() => {
            if (poi.geojson !== undefined) geoCont.flashPolygon(poi.geojson);
            mapLibre.flyTo(poi.lnglat, zoomlv);
            console.log("eventViewThumb: View OK.");
        }).catch((e) => {
            console.warn("cMapMaker.eventViewThumb: failed", e);
        })
    }

    // EVENT: map moveend発生時のイベント
    eventMoveMap() {
        if (cMapMaker.status !== "normal") return;
        void this.refreshChangeRegion();
        if (cMapMaker.moveMapBusy) {
            cMapMaker.moveMapPending = true;
            console.log("eventMoveMap: Queue latest move.");
            return;
        }
        //console.log("eventMoveMap: Start. ");
        cMapMaker.moveMapBusy = true;
        cMapMaker.moveMapPending = false;

        const zoom = mapLibre.getZoom(false);
        const zoomLevels = Object.keys(Conf.poiView.poiZoom).map(target => this.getPoiZoom(target));
        if (Conf.etc.editMode) zoomLevels.push(...Object.values(Conf.poiView.editZoom))
        const poizoom = zoomLevels.some(level => zoom >= level);

        if (!poizoom && !this.usesActivityBbox()
            && !(areaSearchController.activeCriteria && areaSearchController.usesSearchApi())) {
            console.log("eventMoveMap: Cancel(Busy or MoreZoom).");
            this.makeImages(false);                             // イメージリストを非表示
            this.viewIndoor();
            this.viewPoi(listTable.getSelCategory());
            cMapMaker.moveMapBusy = false
            return;
        }
        //cMapMaker.updateView().then(() => cMapMaker.moveMapBusy = false)
        cMapMaker.updateView()
            .catch((e) => {
                console.warn("cMapMaker.eventMoveMap: updateView failed", e);
            })
            .finally(() => {
                cMapMaker.moveMapBusy = false;
                if (!cMapMaker.moveMapPending) return;
                cMapMaker.moveMapPending = false;
                console.log("eventMoveMap: Replay queued move.");
                setTimeout(() => cMapMaker.eventMoveMap(), 0);
            });
    }

    // EVENT: カテゴリ変更時のイベント
    eventChangeCategory() {
        list_keyword.value = "";
        let catname, selcategory = listTable.getSelCategory()
        console.log("eventChange: " + selcategory)
        const listAccordion = document.getElementById("listAccordion")
        if (listAccordion && !listAccordion.classList.contains("show")) {
            basic.openAccordion("listAccordion")
        }
        switch (Conf.selectItem.action) {
            case "ChangeMap":                               // 背景地図切り替え
                this.showMapTitleWhenReady(mapLibre.changeMap(list_category.value))
                newsTicker.update()
                break;
            case "ChangePoi":
                cMapMaker.updateView()
                break;
        }
        catname = selcategory !== "-" ? `?category=${selcategory}` : ""
        history.replaceState('', '', this.withIndoorLevel(location.pathname + catname) + location.hash)
        cMapMaker.clearDatail()
        geoCont.writePoiCircle()
        mapLibre.map.redraw()
        areaSearchController.renderDisplayStatus();

    }

    // EVENT: View Zoom Level & Status Comment
    eventZoomMap() {
        let morezoom = 0;
        for (let key of Object.keys(Conf.poiView.poiZoom)) {
            const value = this.getPoiZoom(key);
            morezoom = value >= morezoom ? value : morezoom
        }
        if (Conf.etc.editMode) {
            for (let [key, value] of Object.entries(Conf.poiView.editZoom)) {
                morezoom = value >= morezoom ? value : morezoom
            }
        }
        const configuredMessageZoom = Number(Conf.map?.zoomMessageThreshold);
        if (Number.isFinite(configuredMessageZoom)
            && configuredMessageZoom >= 0 && configuredMessageZoom <= 24) {
            morezoom = configuredMessageZoom;
        }
        let poizoom = mapLibre.getZoom(true) >= morezoom ? false : true
        if (poizoom) {
            cMapMaker.changeMode("list")    // ズームレベルがpoi表示の閾値以下の時はリストを開く
            cMapMaker.clearDatail()         // 詳細画面を閉じる
        }
        winCont.setMapStatus("");
        areaSearchController.renderDisplayStatus();
    }
}
const cMapMaker = new CMapMaker();
window.cMapMaker = cMapMaker;
