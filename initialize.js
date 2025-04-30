/*	Main Process */
"use strict";

// Global Variable
var Conf = {}; // Config Praams
const GTAG = '<script async src="https://www.googletagmanager.com/gtag/js?id=';
const LANG = (window.navigator.userLanguage || window.navigator.language || window.navigator.browserLanguage).substr(0, 2) == "ja" ? "ja" : "en";
const FILES = [
    "./baselist.html",
    "./data/config-user.jsonc",
    "./data/config-system.jsonc",
    "./data/config-activities.jsonc",
    `./data/marker.jsonc`,
    `./data/category-${LANG}.jsonc`,
    `data/listtable-${LANG}.jsonc`,
    "./data/overpass-system.jsonc",
    `./data/overpass-custom.jsonc`,
    `./data/glot-custom.jsonc`,
    `data/glot-system.jsonc`,
];
const glot = new Glottologist();
var modalActs = new modal_Activities();
var modal_wikipedia = new modal_Wikipedia();
var modal_osmbasic = new modal_OSMbasic();
var basic = new Basic();
var overPassCont = new OverPassControl();
var mapLibre = new Maplibre();
var geoCont = new GeoCont();
var listTable = new ListTable();
var poiMarker = new PoiMarker();
var cMapMaker = new CMapMaker();
var poiCont = new PoiCont();
var gSheet = new GoogleSpreadSheet();

// initialize
console.log("Welcome to Community Map Maker.");
console.log("initialize: Start.");
window.addEventListener("DOMContentLoaded", function () {
    const fetchUrls = FILES.map((url) => fetch(url).then((res) => res.text()));
    const setUrlParams = function () {
        // URLから引数を取得して返す関数
        let keyValue = {};
        let search = location.search
            .replace(/[?&]fbclid.*/, "")
            .replace(/%2F/g, "/")
            .slice(1); // facebook対策
        search = search.slice(-1) == "/" ? search.slice(0, -1) : search; // facebook対策(/が挿入される)
        let params = search.split("&"); // -= -> / and split param
        history.replaceState("", "", location.pathname + "?" + search + location.hash); // fixURL
        for (const param of params) {
            let delimiter = param.includes("=") ? "=" : "/";
            let keyv = param.split(delimiter);
            keyValue[keyv[0]] = keyv[1];
        }
        return keyValue;
    };

    Promise.all(fetchUrls).then((texts) => {
        let basehtml = texts[0]; // Get Menu HTML
        for (let i = 1; i <= 7; i++) {
            Conf = Object.assign(Conf, JSON5.parse(texts[i]));
        }
        Conf.osm = Object.assign(Conf.osm, JSON5.parse(texts[8]).osm);
        Conf.category_keys = Object.keys(Conf.category); // Make Conf.category_keys
        Conf.category_subkeys = Object.keys(Conf.category_sub); // Make Conf.category_subkeys
        glot.data = Object.assign(glot.data, JSON5.parse(texts[9])); // import glot data
        glot.data = Object.assign(glot.data, JSON5.parse(texts[10])); // import glot data
        window.onresize = winCont.window_resize; // 画面サイズに合わせたコンテンツ表示切り替え
        // document.title = glot.get("site_title"); // Google検索のインデックス反映が読めないので一旦なし
        let UrlParams = setUrlParams();
        if (UrlParams.edit) Conf.etc["editMode"] = true;
        winCont.splash(true);
        listTable.init();
        winCont.window_resize(); // Set Window Size(mapidのサイズ指定が目的)

        Promise.all([
            gSheet.get(Conf.google.AppScript),
            cMapMaker.load_static(),
            mapLibre.init(Conf), // get_zoomなどMapLibreの情報が必要なためMapLibre.init後に実行
        ]).then((results) => {
            // MapLibre add control
            console.log("initialize: gSheet, static, MapLibre OK.");
            mapLibre.addControl("top-left", "baselist", basehtml, "mapLibre-control m-0 p-0"); // Make: base list
            mapLibre.addNavigation("bottom-right");
            mapLibre.addControl("bottom-right", "maplist", "<button onclick='cMapMaker.changeMap()'><i class='fas fa-layer-group fa-lg'></i></button>", "maplibregl-ctrl-group");
            mapLibre.addControl("bottom-right", "global_status", "", "text-information"); // Make: progress
            mapLibre.addControl("bottom-right", "global_spinner", "", "spinner-border text-primary d-none");
            mapLibre.addControl("bottom-left", "images", "", "showcase"); // add images
            mapLibre.addControl("bottom-left", "zoomlevel", "");
            winCont.playback(Conf.listTable.playback.view); // playback control view:true/false
            winCont.download(Conf.listTable.download); // download view:true/false
            cMapMaker.mode_change("map"); // initialize last_modetime
            winCont.menu_make(Conf.menu.main, "main_menu");
            winCont.mouseDragScroll(images, cMapMaker.viewImageList); // set Drag Scroll on images
            glot.render();

            const init_close = function () {
                if (Conf.selectItem.menu == "") {
                    listTable.makeSelectList(Conf.listTable.category); // Must be executed before eventMoveMap
                } else {
                    // Make SelectItem(Manual)
                    Object.keys(Conf.selectItem.menu).forEach((key) => {
                        winCont.select_add("list_category", key, Conf.selectItem.menu[key]);
                    });
                }
                let eventMoveMap = cMapMaker.eventMoveMap.bind(cMapMaker);
                eventMoveMap().then(() => {
                    winCont.splash(false);
                    if (UrlParams.category) {
                        if (Conf.selectItem.menu == "") {
                            // listTableリンク時
                            listTable.selectCategory(UrlParams.category);
                        } else {
                            // 手動時は直接指定
                            list_category.value = UrlParams.category;
                        }
                        cMapMaker.eventChangeCategory();
                        delete UrlParams.category;
                    }
                    if (UrlParams.node || UrlParams.way || UrlParams.relation) {
                        let keyv = Object.entries(UrlParams).find(([key, value]) => value !== undefined);
                        let param = keyv[0] + "/" + keyv[1];
                        let subparam = param.split("."); // split child elements(.)
                        cMapMaker.viewDetail(subparam[0], subparam[1]);
                    }
                    cMapMaker.addEvents();
                });
            };

            // Load gSheet's OSM Data(件数が増えるとサーバから拒否されるので停止)
            poiCont.setActdata(results[0]); // gSheetをPoiContにセット(座標は無いのでOSM読み込み時にマッチング)
            if (Conf.view.poiActLoad) {
                let osmids = poiCont.pois().acts.map((act) => {
                    return act.osmid;
                });
                osmids = osmids.filter(Boolean);
                if (osmids.length > 0 && !Conf.static.mode) {
                    basic
                        .retry(() => overPassCont.getOsmIds(osmids), 5)
                        .then((geojson) => {
                            poiCont.addGeojson(geojson);
                            poiCont.setActlnglat();
                            init_close();
                        });
                } else {
                    poiCont.setActlnglat();
                    init_close();
                }
            } else {
                init_close();
            }
        });
    });
});
