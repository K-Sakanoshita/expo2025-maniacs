/*	Main Process */
"use strict";

// Global Variable
var Conf = {}; // Config Praams
const LANG = (window.navigator.userLanguage || window.navigator.language || window.navigator.browserLanguage).substr(0, 2) == "ja" ? "ja" : "en";
const glot = new Glottologist();
const modalActs = new Activities();
const wikipedia = new Wikipedia();
const osmBasic = new OSMbasic();
const basic = new Basic();
const poiStatusCont = new PoiStatusCont();
const overPassCont = new OverPassControl();
const mapLibre = new Maplibre();
const geoCont = new GeoCont();
const listTable = new ListTable();
const poiCont = new PoiCont();
const gSheet = new GoogleSpreadSheet();
var PoiStatusIndex = { VISITED: 0, FAVORITE: 1, MEMO: 2 };
var PoiStatusCsvIndex = { KEY: 0, CATEGORY: 1, NAME: 2, VISITED: 3, FAVORITE: 4, MEMO: 5 };
var PoiStatusCsvIndexOld = { KEY: 0, CATEGORY: 1, NAME: 2, VISITED: 3, MEMO: 4 };

class CMapMaker {

    constructor() {
        this.status = "initialize";         // 状態フラグ / initialize changeMode normal playback
        this.open_osmid = "";				// viewDetail表示中はosmid
        this.last_modetime = 0;
        this.mode = "map";
        this.id = 0;
        this.moveMapBusy = false;
        this.changeKeywordWaitTime;
        this.scrollHints = 0;
        this.favoriteFilter = null;
        this.visitedFilterStatus = null;
    }

    init() {        // initialize
        console.log("Welcome to Community Map Maker.");
        console.log("initialize: Start.");
        const FILES = [
            "./baselist.html", "./data/config-user.jsonc", "./data/config-system.jsonc",
            "./data/config-activities.jsonc", `./data/marker.jsonc`,
            `./data/category-${LANG}.jsonc`, `./data/listtable-${LANG}.jsonc`,
            "./data/overpass-system.jsonc", `./data/overpass-custom.jsonc`,
            `./data/glot-custom.jsonc`, `./data/glot-system.jsonc`,
        ];
        const fetchUrls = FILES.map((url) => fetch(url).then((res) => res.text()));
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
        const loadStatic = function () {
            return new Promise((resolve, reject) => {
                if (!Conf.static.use) {
                    resolve();
                } else {
                    console.log("cMapMaker: Static mode");
                    const fetchUrls = Conf.static.osmjsons.map((url) => fetch(url).then((res) => res.text()));
                    Promise.all(fetchUrls).then((datas) => {
                        datas.forEach(data => {
                            let json = JSON5.parse(data)
                            let ovanswer = overPassCont.setOsmJson(json);
                            poiCont.addGeojson(ovanswer);
                        })
                        poiCont.setActlnglat();
                        console.log("cMapMaker: Static load done.");
                        resolve();
                    })
                }
            })
        }
        const setBGImage = function (imgUrl) {  // basemenuの背景画像設定
            const test = new Image();
            test.onload = () => document.body.style.setProperty("--bg-url", `url(${imgUrl})`);
            test.onerror = () => document.body.style.setProperty("--bg-url", "none");
            test.src = imgUrl;
        }

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
            let UrlParams = setUrlParams();
            if (UrlParams.edit) Conf.etc["editMode"] = true;
            if (UrlParams.static) Conf.static["mode"] = basic.parseBoolean(UrlParams.static);

            winCont.viewSplash(true);
            listTable.init();
            poiCont.init(Conf.minimap.use);

            Promise.all([
                gSheet.get(Conf.google.AppScript),
                mapLibre.init(Conf), // get_zoomなどMapLibreの情報が必要なためMapLibre.init後に実行
            ]).then((results) => {
                // MapLibre add control
                console.log("initialize: gSheet, static, MapLibre OK.");
                mapLibre.addControl("top-left", "baselist", basehtml, "mapLibre-control m-0 p-0"); // Make: base list
                setBGImage(Conf.listTable.backgroundImage)
                if (Conf.etc.localSave !== "") filter_menu.classList.remove('d-none')
                mapLibre.addNavigation("bottom-right");
                if (Conf.map.changeMap) mapLibre.addControl("bottom-right", "maplist", "<button onclick='cMapMaker.changeMap()'><i class='fas fa-layer-group fa-lg'></i></button>", "maplibregl-ctrl-group");
                mapLibre.addControl("bottom-right", "global_status", "", "text-information"); // Make: progress
                mapLibre.addControl("bottom-right", "global_spinner", "", "spinner-border text-primary d-none");
                mapLibre.addControl("bottom-left", "images", "", "showcase"); // add images
                mapLibre.addControl("bottom-left", "zoomlevel", "");
                winCont.playback(Conf.listTable.playback.view); // playback control view:true/false
                winCont.download(Conf.listTable.download); // download view:true/false
                cMapMaker.changeMode("map"); // initialize last_modetime
                winCont.showMessage(Conf.tile[mapLibre.selectStyle].name);
                const mergedMenu = [...Conf.menu.main, ...Conf.menu.mainSystem];
                winCont.menu_make(mergedMenu, "main_menu");
                winCont.mouseDragScroll(images, cMapMaker.eventViewThumb); // set Drag Scroll on images
                glot.render()
                list_keyword.setAttribute("placeholder", glot.get("searchKeyword"));
                window.onresize = winCont.resizeWindow; // 画面サイズに合わせたコンテンツ表示切り替え
                // document.title = glot.get("site_title"); // Google検索のインデックス反映が読めないので一旦なし
                winCont.resizeWindow()
                winCont.setSidebar("")

                const init_close = function () {
                    let cat = (UrlParams.category !== "" && UrlParams.category !== undefined) ? UrlParams.category : Conf.selectItem.default;
                    cat = decodeURI(cat);
                    cMapMaker.updateView(cat).then(() => {     // 初期データロード
                        mapLibre.addCountryFlagsImage(poiCont.getAllOSMCountryCode())
                        cMapMaker.addEvents()
                        winCont.viewSplash(false)
                        setTimeout(() => { cMapMaker.eventMoveMap() }, 300) // 本来なら不要だがfirefoxだとタイミングの関係で必要
                        if (UrlParams.node || UrlParams.way || UrlParams.relation) {
                            let keyv = Object.entries(UrlParams).find(([key, value]) => value !== undefined)
                            let param = keyv[0] + "/" + keyv[1]
                            let subparam = param.split(".") // split child elements(.)
                            let geojson = poiCont.get_osmid(subparam[0]).geojson
                            cMapMaker.viewDetail(subparam[0], subparam[1]).then(() => {
                                if (geojson !== undefined) {
                                    geoCont.flashPolygon(geojson)
                                    geoCont.writePoiCircle(geojson)
                                }
                            })
                        }
                    })
                }

                poiCont.setActdata(results[0]); // gSheetをPoiContにセット(座標は無いのでOSM読み込み時にマッチング)
                if (Conf.poiView.poiActLoad) {
                    let osmids = poiCont.pois().acts.map((act) => { return act.osmid; });
                    osmids = osmids.filter(Boolean);
                    if (osmids.length > 0 && !Conf.static.use) {   // osmidsがある&非static時
                        basic.retry(() => overPassCont.getOsmIds(osmids), 5).then((geojson) => {
                            poiCont.addGeojson(geojson)
                            poiCont.setActlnglat()
                            init_close();
                        });
                    } else {    // static時
                        loadStatic().then(() => {
                            poiCont.setActlnglat();
                            init_close()
                        })
                    }
                } else if (Conf.static.use) {       // actLoadしない&Static時
                    loadStatic().then(() => init_close())
                } else {
                    init_close()
                }
            })
        })
    }

    addEvents() {
        mapLibre.on('moveend', this.eventMoveMap.bind(cMapMaker))   		// マップ移動時の処理
        mapLibre.on('zoomend', this.eventZoomMap.bind(cMapMaker))			// ズーム終了時に表示更新
        list_category.addEventListener('change', this.eventChangeCategory.bind(cMapMaker))	// category change
    }

    about() {
        let msg = { msg: glot.get("about_message"), ttl: glot.get("about") }
        mapLibre.viewMiniMap(false)
        winCont.makeDetail({ "title": msg.ttl, "message": msg.msg, "mode": "close", "menu": false })
        winCont.setSidebar("view")
    }

    licence() {			// About license
        let msg = { msg: glot.get("licence_message") + glot.get("more_message"), ttl: glot.get("licence_title") };
        mapLibre.viewMiniMap(false)
        winCont.makeDetail({ "title": msg.ttl, "message": msg.msg, "mode": "close", "menu": false });
        winCont.setSidebar("view")
    }

    changeMode(newmode) {	// mode change(list or map)
        if (this.status !== "changeMode" && (this.last_modetime + 300) < Date.now()) {
            this.status = "changeMode";
            let params = { 'map': ['fas fa-list', 'remove', 'start'], 'list': ['fas fa-map', 'add', 'stop'] };
            this.mode = !newmode ? (list_collapse.classList.contains('show') ? 'map' : 'list') : newmode;
            console.log('changeMode: ' + this.mode + ' : ' + this.last_modetime + " : " + Date.now());
            list_collapse_icon.className = params[this.mode][0];
            list_collapse.classList[params[this.mode][1]]('show');
            this.last_modetime = Date.now();
            this.status = "normal";
            if (cMapMaker.mode == "list") winCont.clearDatail()
        }
    }

    changeMap() {	// Change Map Style(rotation)
        let styleName = mapLibre.changeMap()
        winCont.showMessage(Conf.tile[styleName].name);
        let snow = styleName.indexOf("SNOW") > -1;      // SNOWの文字列があれば雪を降らす
        winCont.fallsSnow(snow)
        setTimeout(() => { this.eventMoveMap() }, 1000)
    }

    setVisitedFilter(visitedFilterStatus) {
        console.log(`cMapMaker: setVisitedFilter: ${visitedFilterStatus}`);
        this.visitedFilterStatus = visitedFilterStatus;
        this.updateView();
    }

    toggleFavoriteFilter(checked) {
        console.log(`cMapMaker: toggleFavoriteFilter: ${checked}`);
        this.favoriteFilter = checked;
        this.updateView();
    }

    viewArea() {			// Area(敷地など)を表示させる refタグがあれば()表記
        let targets = poiCont.getTargets()  //
        console.log("viewArea: " + targets.join())
        targets.forEach((target) => {
            let osmConf = Conf.osm[target] == undefined ? { expression: { viewArea: true } } : Conf.osm[target]
            if (osmConf.expression.viewArea) {   // viewArea: trueが対象
                let pois = poiCont.getPois(target, false)
                let titleTag = "";
                if (!osmConf.expression.poiView) {  // poiViewがfalseの時(true時はpoiView側で表示するため)
                    titleTag = ["format", ["case", ["all", ["has", "ref"], ["!=", ["get", "ref"], ""]],
                        ["case", ["has", "local_ref"],
                            ["concat", "(", ["get", "ref"], "/", ["get", "local_ref"], ") ", ["coalesce", ["get", "name"], ""]],
                            ["concat", "(", ["get", "ref"], ") ", ["coalesce", ["get", "name"], ""]]
                        ], ["coalesce", ["get", "name"], ""]
                    ], {}];
                }
                mapLibre.addPolygon({ "type": "FeatureCollection", "features": pois.geojson }, target, titleTag)
            }
        })
    }

    viewPoi(targets) {		// Poiを表示させる
        let nowselect = listTable.getSelCategory()          // tags,key=valueの複数値
        nowselect = nowselect[0] == "" ? "-" : nowselect[nowselect.length - 1]
        console.log(`viewPoi: Start(now select ${nowselect}).`)
        targets = targets[0] == "-" || targets[0] == "" ? poiCont.getTargets() : targets;		// '-' or ''はすべて表示
        targets = targets.filter(target => {                                                    // poiView=trueのみ返す
            return Conf.osm[target] !== undefined ? Conf.osm[target].expression.poiView : false;
        })
        targets = Object.keys(Conf.poiView.poiZoom).indexOf("activity") > -1 ? targets.concat("activity") : targets;
        targets = Conf.etc.editMode ? targets.concat(Object.keys(Conf.poiView.editZoom)) : targets	// 編集時はeditZoom追加
        targets = [...new Set(targets)];    // 重複削除
        //poiCont.setPoi(listTable.getFilterList(), false)

        let subcategory = poiCont.getTargets().indexOf(nowselect) > -1 || nowselect == "-" ? false : true;	// サブカテゴリ選択時はtrue
        if (subcategory) {	// targets 内に選択肢が含まれていない場合（サブカテゴリ選択時）
            poiCont.setPoi(listTable.getFilterList(), false)
        } else {			// targets 内に選択肢が含まれている場合
            let nowzoom = mapLibre.getZoom(false)
            //targets = targets.filter(target => target !== "activity");  // activiyがあれば削除 // 2025/08/20 一旦false
            targets = targets.filter(s => s !== "");
            if (nowselect = "-") {
                poiCont.setPoi(listTable.getFilterList(), false) //nowselect == Conf.google.targetName) // 2025/08/20 一旦false
            } else {
                for (let target of targets) {
                    console.log("viewPoi: " + target)
                    let poiView = Conf.google.targetName == target ? true : Conf.osm[target].expression.poiView	// activity以外はexp.poiViewを利用
                    let flag = nowzoom >= Conf.poiView.poiZoom[target] || (Conf.etc.editMode && nowzoom >= Conf.poiView.editZoom[target])
                    if ((target == nowselect) && flag && poiView) {	// 選択している種別の場合
                        poiCont.setPoi(listTable.getFilterList(), false) // target == Conf.google.targetName) // 2025/08/20 一旦false
                        break
                    }
                }
            }
        }
    }

    // 画面内のActivity画像を表示させる(view: true=表示)
    makeImages(view) {
        if (view) {
            let acts = []
            let rows = listTable.getFilterList()
            rows.forEach(row => {
                let act = poiCont.get_actid(row[0])
                if (act !== undefined) {
                    let urls = []
                    let actname = act.id.split("/")[0]
                    if (Conf.activities[actname] !== undefined) {
                        let forms = Conf.activities[actname].form
                        for (const key of Object.keys(forms)) { // 複数あっても一つだけとする
                            if (forms[key].type === "image_url") { urls.push(act[key]); break }
                        }
                    } else {
                        console.warn("cMapmaker.makeImage: No Activity Name");
                    }
                    acts.push({ "src": urls, "osmid": act.osmid, "title": act.title })
                }
            })
            if (acts.length > 0) {
                images.classList.remove("d-none");
                winCont.setImages(images, acts, Conf.etc.loadingUrl, Conf.thumbnail.limits)
                if (this.scrollHints == 0) winCont.scrollHint(); this.scrollHints++;
            } else {
                images.classList.add("d-none");
            }
        } else {
            images.classList.add("d-none");
        }
    }

    // OSMとGoogle SpreadSheetからPoiを取得してリスト化
    updateOsmPoi(targets) {
        return new Promise((resolve) => {
            console.log("cMapMaker: updateOsmPoi: Start");
            winCont.spinner(true);
            var keys = (targets !== undefined && targets !== "") ? targets : poiCont.getTargets();
            let PoiLoadZoom = 99;
            for (let [key, value] of Object.entries(Conf.poiView.poiZoom)) {
                if (key !== Conf.google.targetName) PoiLoadZoom = value < PoiLoadZoom ? value : PoiLoadZoom;
            };
            if (Conf.etc.editMode) {
                for (let [key, value] of Object.entries(Conf.poiView.editZoom)) {
                    if (key !== Conf.google.targetName) PoiLoadZoom = value < PoiLoadZoom ? value : PoiLoadZoom;
                }
            }
            if ((mapLibre.getZoom(true) < PoiLoadZoom)) {
                winCont.spinner(false);
                console.log("[success]cMapMaker: updateOsmPoi End(more zoom).");
                resolve({ "update": true });
            } else {
                overPassCont.getGeojson(keys, status_write).then(ovanswer => {
                    winCont.spinner(false);
                    if (ovanswer) {
                        poiCont.addGeojson(ovanswer)
                        poiCont.setActlnglat()
                    };
                    console.log("[success]cMapMaker: updateOsmPoi End.");
                    global_status.innerHTML = "";
                    resolve({ "update": true });
                }).catch(() => {
                    winCont.spinner(false);
                    console.log("[error]cMapMaker: updateOsmPoi end.");
                    global_status.innerHTML = "";
                    resolve({ "update": false });
                });
            }
        })

        function status_write(progress) {
            global_status.innerHTML = progress;
        }
    }

    // OSMデータを取得して画面表示
    updateView(cat) {
        console.log("updateView Start.")
        return new Promise((resolve) => {
            this.updateOsmPoi().then((status) => {
                switch (status.update) {
                    case true:
                        let targets = listTable.getSelCategory();
                        targets = (targets[0] == '' && cat !== undefined) ? [cat] : targets;
                        listTable.makeSelectList(Conf.listTable.category)
                        listTable.makeList()
                        listTable.selectCategory(targets)
                        listTable.filterByPoiStatus(this.visitedFilterStatus, this.favoriteFilter);
                        if (window.getSelection) window.getSelection().removeAllRanges()
                        this.makeImages(Conf.thumbnail.use)
                        this.viewArea()	        // 入手したgeoJsonを追加
                        this.viewPoi(targets)	// in targets
                        resolve({ "update": true })
                        break
                    default:
                        console.log("updateView Error.")
                        resolve({ "update": false })
                        break
                }
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
        }
    }

    // 詳細モーダル表示
    viewDetail(osmid, openid) {	// PopUpを表示(marker,openid=actlst.id)]
        console.log("viewDatail")
        return new Promise((resolve, reject) => {
            const makeFlag = (country) => {     // 旗アイコンを追加
                if (country == undefined) return ""
                let title = "", countries = country.split(";")
                countries.forEach(CCode => { title += `<img src="https://flagcdn.com/h20/${CCode.toLowerCase()}.png" class="ms-1 me-1" height="16" alt="${CCode} Flag">` })
                return title
            }

            if (osmid == "" || osmid == undefined) {    // OSMIDが空の時はクリアして終了
                winCont.clearDatail()
                geoCont.writePoiCircle()
                resolve()
                return
            }
            let osmobj = poiCont.get_osmid(osmid);
            if (osmobj == undefined) { console.log("Error: No osmobj"); reject(); return }	// Error

            let tags = osmobj.geojson.properties;
            let target = osmobj.targets[0];
            tags["*"] = "*";
            target = target == undefined ? "*" : target;			// targetが取得出来ない実在POI対応
            let category = poiCont.getCatnames(tags);
            let flagsHTML = makeFlag(tags.country);
            if (flagsHTML !== "") { // 国旗がある場合はminiMapを設定してHTML追加
                mapLibre.addMiniMap().then(() => {
                    flags.innerHTML = flagsHTML
                    mapLibre.showCountryByCode(tags.country)  // Detail内にminiMapを表示
                })
            }

            let title = `<img src="./${Conf.icon.fgPath}/${poiCont.getIcon(tags)}" height="16">`
            let message = "";
            title += poiCont.getOSMname(tags, glot.lang);

            if (title == "") title = category[0] + category[1] !== "" ? "(" + category[1] + ")" : "";   // サブカテゴリ時は追加
            if (title == "") title = glot.get("undefined");
            winCont.menu_make(Conf.menu.modal, "btnMenu");
            btnMenu.nextElementSibling.classList.remove("d-none")
            winCont.setProgress(0);
            this.open_osmid = osmid;

            message += osmBasic.make(tags);		// append OSM Tags(仮…テイクアウトなど判別した上で最終的には分ける)
            if (tags.wikipedia !== undefined) {			// append wikipedia
                message += wikipedia.element();
                winCont.setProgress(100);
                wikipedia.make(tags, Conf.wikipedia.image).then(html => {
                    wikipedia.set_dom(html);
                    winCont.setProgress(0);
                })
            }

            // append activity
            let catname = listTable.getSelCategory() !== "-" ? `&category=${listTable.getSelCategory()}` : "";
            let actlists = poiCont.getActlistByOsmid(osmid);
            history.replaceState('', '', location.pathname + "?" + osmid + (!openid ? "" : "." + openid) + catname + location.hash);
            if (actlists.length > 0) {	// アクティビティ有り
                message += modalActs.make(actlists);
                winCont.makeDetail({ "title": title, "message": message, "append": Conf.menu.activities, "menu": true, "openid": openid });
            } else {					// アクティビティ無し
                winCont.makeDetail({ "title": title, "message": message, "append": Conf.menu.activities, "menu": true, "openid": openid });
            }

            mapLibre.viewMiniMap(tags.country)
            winCont.setSidebar("view").then(() => {
                this.detail = true
                this.changeMode('map')
                resolve()
            })
        })
    }

    shareURL(actid) {	// URL共有機能
        actid = actid == undefined ? "" : "." + actid;
        let url = location.origin + location.pathname + location.search + actid + location.hash;
        navigator.clipboard.writeText(url);
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
            setTimeout(view_control, speed_calc(), listTable.getFilterList(), 0);
        } else {
            listTable.disabled(false);
            listTable.heightSet(listTable.height + "px");		// mode end
            this.status = "normal";								// mode stop
            icon_change("play");
        }
    }

    download() {
        const linkid = "temp_download"
        let csv = basic.makeArray2CSV(listTable.makeList([list_category.value]))
        let bom = new Uint8Array([0xEF, 0xBB, 0xBF])
        let blob = new Blob([bom, csv], { 'type': 'text/csv' })
        let link = document.getElementById(linkid) ? document.getElementById(linkid) : document.createElement("a")
        link.id = linkid
        link.href = URL.createObjectURL(blob)
        link.download = "my_data.csv"
        link.dataset.downloadurl = ['text/plain', link.download, link.href].join(':')
        document.body.appendChild(link)
        link.click()
    }

    // EVENT: イメージを選択した時のイベント処理
    eventViewThumb(imgdom) {
        console.log("eventViewThumb: Start.");
        let osmid = imgdom.getAttribute("osmid");
        let poi = poiCont.get_osmid(osmid);
        let zoomlv = Math.max(mapLibre.getZoom(true), Conf.map.detailZoom);
        if (zoomlv == undefined) console.log("No " + Conf.map.detailZoom)
        if (poi !== undefined) {
            winCont.setSidebar()
            cMapMaker.viewDetail(osmid).then(() => {
                if (poi.geojson !== undefined) geoCont.flashPolygon(poi.geojson)
                mapLibre.flyTo(poi.lnglat, zoomlv);
                console.log("eventViewThumb: View OK.");
            })
        }
    }

    // EVENT: map moveend発生時のイベント
    eventMoveMap() {
        if (cMapMaker.moveMapBusy || cMapMaker.status !== "normal") return;
        console.log("eventMoveMap: Start. ");
        cMapMaker.moveMapBusy = true;

        const zoom = mapLibre.getZoom(false);
        const zoomLevels = Object.values(Conf.poiView.poiZoom);
        if (Conf.etc.editMode) zoomLevels.push(...Object.values(Conf.poiView.editZoom))
        const poizoom = zoomLevels.some(level => zoom >= level);

        if (!poizoom) {
            console.log("eventMoveMap: Cancel(Busy or MoreZoom).");
            this.makeImages(false);                             // イメージリストを非表示
            cMapMaker.moveMapBusy = false
            return;
        }
        cMapMaker.updateView().then(() => cMapMaker.moveMapBusy = false)
    }

    // EVENT: カテゴリ変更時のイベント
    eventChangeCategory() {
        let catname, selcategory = listTable.getSelCategory()
        console.log("eventChange: " + selcategory)
        switch (Conf.selectItem.action) {
            case "ChangeMap":                               // 背景地図切り替え
                mapLibre.changeMap(list_category.value)
                break;
            case "ChangePoi":
                cMapMaker.updateView()
                break;
        }
        catname = selcategory !== "-" ? `?category=${selcategory}` : ""
        history.replaceState('', '', location.pathname + catname + location.hash)
        winCont.clearDatail().then(() => {
            geoCont.writePoiCircle()
            mapLibre.map.redraw()
        })

    }

    // EVENT: View Zoom Level & Status Comment
    eventZoomMap() {
        let morezoom = 0;
        for (let [key, value] of Object.entries(Conf.poiView.poiZoom)) {
            morezoom = value > morezoom ? value : morezoom
        }
        if (Conf.etc.editMode) {
            for (let [key, value] of Object.entries(Conf.poiView.editZoom)) {
                morezoom = value > morezoom ? value : morezoom
            }
        }
        let poizoom = mapLibre.getZoom(true) >= morezoom ? false : true
        let message = `${glot.get("zoomlevel")}${mapLibre.getZoom(true)} `
        if (poizoom) message += `(${glot.get("morezoom")})`
        zoomlevel.innerHTML = "<span class='zoom'>" + message + "</span>"
    }
}
const cMapMaker = new CMapMaker();
