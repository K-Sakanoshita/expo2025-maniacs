class CMapMaker {

    constructor() {
        this.status = "initialize";
        this.detail = false;				// viewDetail表示中はtrue
        this.open_osmid = "";				// viewDetail表示中はosmid
        this.last_modetime = 0;
        this.mode = "map";
        this.id = 0;
        this.moveMapBusy = 0;
        this.changeKeywordWaitTime;
    }

    addEvents() {
        console.log("CMapMaker: init.")
        mapLibre.on('moveend', this.eventMoveMap.bind(cMapMaker))   		// マップ移動時の処理
        mapLibre.on('zoomend', this.eventZoomMap.bind(cMapMaker))			// ズーム終了時に表示更新
        //list_keyword.addEventListener('keydown', this.eventSearchKeyword.bind(cMapMaker))	// 
        list_category.addEventListener('change', this.eventChangeCategory.bind(cMapMaker))	// category change
        //this.eventMoveMap();
        //this.eventZoomMap();
    }

    about() {
        let msg = { msg: glot.get("about_message"), ttl: glot.get("about") }
        winCont.modal_open({ "title": msg.ttl, "message": msg.msg, "mode": "close", callback_close: winCont.closeModal, "menu": false });
    }

    licence() {			// About license
        let msg = { msg: glot.get("licence_message") + glot.get("more_message"), ttl: glot.get("licence_title") };
        winCont.modal_open({ "title": msg.ttl, "message": msg.msg, "mode": "close", callback_close: winCont.closeModal, "menu": false });
    };

    mode_change(newmode) {	// mode change(list or map)
        if (this.status !== "mode_change" && (this.last_modetime + 300) < Date.now()) {
            this.status = "mode_change";
            let params = { 'map': ['fas fa-list', 'remove', 'start'], 'list': ['fas fa-map', 'add', 'stop'] };
            this.mode = !newmode ? (list_collapse.classList.contains('show') ? 'map' : 'list') : newmode;
            console.log('mode_change: ' + this.mode + ' : ' + this.last_modetime + " : " + Date.now());
            list_collapse_icon.className = params[this.mode][0];
            list_collapse.classList[params[this.mode][1]]('show');
            this.last_modetime = Date.now();
            this.status = "normal";
            winCont.window_resize();
        }
    }

    changeMap() {	// Change Map Style(rotation)
        mapLibre.changeMap();
    }

    async load_static() {
        if (!Conf.static.mode) {
            console.log("cMapMaker: no static mode");
            return;
        }

        try {
            const response = await fetch(Conf.static.osmjson, { cache: "no-store" });
            if (!response.ok) throw new Error(`cMapMaker: HTTP error ${response.status}`);

            const data = await response.json();
            let ovanswer = overPassCont.setOsmJson(data);
            poiCont.addGeojson(ovanswer);
            poiCont.setActlnglat();
            console.log("cMapMaker: static load done.");
            return ovanswer;
        } catch (err) {
            console.error("cMapMaker:", err);
            throw err;
        }
    }

    viewArea() {			// Area(敷地など)を表示させる
        console.log(`viewArea: Start.`)
        let targets = poiCont.getTargets()  // 
        targets.forEach((target) => {
            if (!Conf.osm["green_area"].expression.poiView) {   // poiView == falseが対象
                console.log("viewArea: " + target)
                let pois = poiCont.getPois(target)
                mapLibre.addPolygon({ "type": "FeatureCollection", "features": pois.geojson }, target)
            }
        })
        console.log("viewArea: End.")
    }

    viewPoi(targets) {		// Poiを表示させる
        let setcount = 0
        let nowselect = listTable.getSelCategory()
        nowselect = nowselect[0] == "" ? "-" : nowselect[nowselect.length - 1]
        console.log(`viewPoi: Start(now select ${nowselect}).`)
        targets = targets[0] == "-" || targets[0] == "" ? poiCont.getTargets() : targets;		// '-' or ''はすべて表示
        targets = Conf.etc.editMode ? targets.concat(Object.keys(Conf.view.editZoom)) : targets	// 編集時はeditZoom追加
        targets = [...new Set(targets)];
        let subcategory = poiCont.getTargets().indexOf(nowselect) > -1 || nowselect == "-" ? false : true;	// サブカテゴリ選択時はtrue
        if (subcategory) {	// targets 内に選択肢が含まれていない場合（サブカテゴリ選択時）
            poiMarker.setPoi("", false, listTable.getFilterList())
            setcount = setcount + listTable.getFilterList().length
        } else {			// targets 内に選択肢が含まれている場合
            console.log("viewPoi: " + targets.concat())
            let nowzoom = mapLibre.getZoom(false)
            targets = targets.filter(target => target !== "activity");  // activiyがあれば削除
            targets.forEach((target) => {
                if (target !== "") {        // targetが無い場合を考慮
                    if (Conf.osm[target].expression == undefined) console.log("???: target")
                    let poiView = Conf.google.targetName == target ? true : Conf.osm[target].expression.poiView	// activity以外はexp.poiViewを利用
                    let flag = nowzoom >= Conf.view.poiZoom[target] || (Conf.etc.editMode && nowzoom >= Conf.view.editZoom[target])
                    if ((target == nowselect || nowselect == "-") && flag && poiView) {	// 選択している種別の場合
                        poiMarker.setPoi(target, target == Conf.google.targetName)
                        setcount++
                    }
                }
            })
        }
        console.log("viewPoi: End.")
    }

    // 画面内のActivity画像を表示させる(view: true=表示)
    makeImages(view) {
        let LL = mapLibre.get_LL(true);
        if (view) {
            let acts = poiCont.adata.filter(act => { return geoCont.checkInner(act.lnglat, LL) && act.picture_url1 !== "" });
            acts = acts.map(act => {
                let urls = []
                let actname = act.id.split("/")[0]
                let forms = Conf.activities[actname].form
                Object.keys(forms).forEach(key => { if (forms[key].type == "image_url") urls.push(act[key]) })
                return { "src": urls, "osmid": act.osmid, "title": act.title }
            })
            if (acts.length > 0) {
                images.classList.remove("d-none");
                winCont.setImages(images, acts, Conf.etc.loadingUrl)
                winCont.scrollHint()
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
            for (let [key, value] of Object.entries(Conf.view.poiZoom)) {
                if (key !== Conf.google.targetName) PoiLoadZoom = value < PoiLoadZoom ? value : PoiLoadZoom;
            };
            if (Conf.etc.editMode) {
                for (let [key, value] of Object.entries(Conf.view.editZoom)) {
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
                }) /*.catch(() => {
                    winCont.spinner(false);
                    console.log("[error]cMapMaker: updateOsmPoi end.");
                    global_status.innerHTML = "";
                    resolve({ "update": false });
                });*/
            };
        });

        function status_write(progress) {
            global_status.innerHTML = progress;
        };
    };

    // キーワード検索
    searchKeyword(keyword) {
        if (keyword !== null) {
            const div = document.createElement("div");             // サニタイズ処理
            div.appendChild(document.createTextNode(keyword));
            this.mode_change('list');
            listTable.filterKeyword(div.innerHTML);
        }
    }

    viewDetail(osmid, openid) {	// PopUpを表示(marker,openid=actlst.id)
        const detail_close = () => {
            let catname = listTable.getSelCategory() !== "-" ? `?category=${listTable.getSelCategory()}` : "";
            winCont.closeModal();
            history.replaceState('', '', location.pathname + catname + location.hash);
            this.open_osmid = "";
            this.detail = false;
            mapid.focus();
        };
        if (this.detail) detail_close();
        let osmobj = poiCont.get_osmid(osmid);
        if (osmobj == undefined) { console.log("Error: No osmobj"); return }	// Error

        let tags = osmobj.geojson.properties;
        let target = osmobj.targets[0];
        tags["*"] = "*";
        target = target == undefined ? "*" : target;					// targetが取得出来ない実在POI対応
        let category = poiCont.getCatnames(tags);
        let title = `<img src="./${Conf.icon.fgPath}/${poiMarker.getIcon(tags)}">`, message = "";

        for (let i = 0; i < Conf.osm[target].titles.length; i++) {
            if (tags[Conf.osm[target].titles[i]] !== void 0) {
                title += `${tags[Conf.osm[target].titles[i]]}`;
                break;
            };
        };
        if (title == "") title = category[0] + category[1] !== "" ? "(" + category[1] + ")" : "";   // サブカテゴリ時は追加
        if (title == "") title = glot.get("undefined");
        winCont.menu_make(Conf.menu.modal, "modal_menu");
        winCont.modal_progress(0);
        this.open_osmid = osmid;

        message += modal_osmbasic.make(tags);		// append OSM Tags(仮…テイクアウトなど判別した上で最終的には分ける)
        if (tags.wikipedia !== undefined) {			// append wikipedia
            message += modal_wikipedia.element();
            winCont.modal_progress(100);
            modal_wikipedia.make(tags, Conf.wikipedia.image).then(html => {
                modal_wikipedia.set_dom(html);
                winCont.modal_progress(0);
            });
        };

        // append activity
        let catname = listTable.getSelCategory() !== "-" ? `&category=${listTable.getSelCategory()}` : "";
        let actlists = poiCont.getActlistByOsmid(osmid);
        history.replaceState('', '', location.pathname + "?" + osmid + (!openid ? "" : "." + openid) + catname + location.hash);
        if (actlists.length > 0) {	// アクティビティ有り
            message += modalActs.make(actlists);
            winCont.modal_open({ "title": title, "message": message, "append": Conf.menu.buttons, "mode": "close", "callback_close": detail_close, "menu": true, "openid": openid });
        } else {					// アクティビティ無し
            winCont.modal_open({ "title": title, "message": message, "append": Conf.menu.buttons, "mode": "close", "callback_close": detail_close, "menu": true, "openid": openid });
        }
        this.detail = true;
        this.mode_change('map');
    };

    shareURL(actid) {	// URL共有機能
        actid = actid == undefined ? "" : "." + actid;
        let url = location.origin + location.pathname + location.search + actid + location.hash;
        navigator.clipboard.writeText(url);
    };

    playback() {		// 指定したリストを連続再生()
        const view_control = (list, idx) => {
            if (list.length >= (idx + 1)) {
                listTable.select(list[idx][0]);
                poiMarker.select(list[idx][0], false);
                if (this.status == "playback") {
                    setTimeout(view_control, speed_calc(), list, idx + 1);
                };
            } else {
                listTable.disabled(false);
                listTable.heightSet(listTable.height + "px");	// mode end
                this.status = "normal";							// mode stop
                icon_change("play");
            };
        };
        const icon_change = (mode) => { list_playback.className = 'fas fa-' + mode };
        const speed_calc = () => { return ((parseInt(list_speed.value) / 100) * Conf.listTable.playback.timer) + 100 };
        if (this.status !== "playback") {
            listTable.disabled(true);
            listTable.heightSet(listTable.height / 4 + "px");
            mapLibre.setZoom(Conf.listTable.playback.zoomLevel);
            this.mode_change("list");
            this.status = "playback";
            icon_change("stop");
            setTimeout(view_control, speed_calc(), listTable.getFilterList(), 0);
        } else {
            listTable.disabled(false);
            listTable.heightSet(listTable.height + "px");		// mode end
            this.status = "normal";								// mode stop
            icon_change("play");
        };
    };

    download() {
        const linkid = "temp_download"
        let csv = basic.makeArray2CSV(poiCont.makeList([list_category.value]))
        let bom = new Uint8Array([0xEF, 0xBB, 0xBF])
        let blob = new Blob([bom, csv], { 'type': 'text/csv' })
        let link = document.getElementById(linkid) ? document.getElementById(linkid) : document.createElement("a")
        link.id = linkid
        link.href = URL.createObjectURL(blob)
        link.download = "my_data.csv"
        link.dataset.downloadurl = ['text/plain', link.download, link.href].join(':')
        document.body.appendChild(link)
        link.click()
    };

    // イメージを選択した時のイベント処理
    viewImageList(imgdom) {
        console.log("viewImageList: Start.");
        let osmid = imgdom.getAttribute("osmid");
        let poi = poiCont.get_osmid(osmid);
        let zoomlv = Math.max(mapLibre.getZoom(true), Conf.map.modalZoom);
        if (poi !== undefined) {
            mapLibre.flyTo(poi.lnglat, zoomlv);
            cMapMaker.viewDetail(osmid);
            console.log("viewImageList: View OK.");
        }
    }

    // EVENT: map moveend発生時のイベント
    eventMoveMap() {
        const MoveMapPromise = function (resolve, reject) {
            let poizoom = false;	// 一つでもズーム表示かチェック
            for (let [key, value] of Object.entries(Conf.view.poiZoom)) {
                if (mapLibre.getZoom(false) >= value) poizoom = true
            }
            if (Conf.etc.editMode) {
                for (let [key, value] of Object.entries(Conf.view.editZoom)) {
                    if (mapLibre.getZoom(false) >= value) poizoom = true
                }
            }
            if (this.moveMapBusy > 1 || !poizoom) {            	// 処理中 or 表示ズーム未満の時は戻る
                console.log("eventMoveMap: Cancel(Busy or MoreZoom). ");
                this.makeImages(false)
                resolve()
                return
            }
            if (this.moveMapBusy == 1) {                        			// no break and cancel old timer.
                clearTimeout(this.id);
                console.log("eventMoveMap: Reset(Busy).");
            } else {
                console.log("eventMoveMap: Start. ");
            }
            this.moveMapBusy = 1;
            this.id = setTimeout(() => {
                console.log("eventMoveMap: End.");
                this.moveMapBusy = 2;
                this.updateOsmPoi().then((status) => {
                    this.moveMapBusy = 0
                    switch (status.update) {
                        case true:
                            this.moveMapBusy = 0;
                            let targets = [listTable.getSelCategory()];
                            console.log("eventMoveMap:" + targets)
                            switch (Conf.view.poiFilter) {
                                case "all":                                     // 全て表示
                                case "fillter":                                 // 画面内で絞り込み
                                    listTable.makeList(Conf.view.poiFilter);	// view all list
                                    if (Conf.selectItem.menu == "") listTable.makeSelectList(Conf.listTable.category)   // カスタム時
                                    listTable.filterCategory(listTable.getSelCategory())
                                    if (window.getSelection) window.getSelection().removeAllRanges();
                                    break;
                                case "":
                                    break;
                            }
                            this.viewArea()	        // 入手したgeoJsonを追加
                            this.viewPoi(targets)	// in targets
                            this.makeImages(true)
                            resolve()
                            break
                        default:
                            let bindMoveMapPromise = MoveMapPromise.bind(this)
                            bindMoveMapPromise(resolve, reject)	// 失敗時はリトライ(接続先はoverpass.jsで変更)
                            break
                    }
                })/*.catch(() => {
					this.moveMapBusy = 0;
					console.log("eventMoveMap: Reject");
					reject();
				});*/
            }, 500);
        };
        return new Promise((resolve, reject) => {
            if (this.moveMapBusy < 2) {
                let bindMoveMapPromise = MoveMapPromise.bind(cMapMaker);
                bindMoveMapPromise(resolve, reject);
            } else {
                resolve();
            }
        });
    };

    // EVENT: View Zoom Level & Status Comment
    eventZoomMap() {
        let morezoom = 0;
        for (let [key, value] of Object.entries(Conf.view.poiZoom)) {
            morezoom = value > morezoom ? value : morezoom
        }
        if (Conf.etc.editMode) {
            for (let [key, value] of Object.entries(Conf.view.editZoom)) {
                morezoom = value > morezoom ? value : morezoom
            }
        }
        let poizoom = mapLibre.getZoom(true) >= morezoom ? false : true
        let message = `${glot.get("zoomlevel")}${mapLibre.getZoom(true)} `
        if (poizoom) message += `<br>${glot.get("morezoom")}`
        zoomlevel.innerHTML = "<h2 class='zoom'>" + message + "</h2>"
    }

    // EVENT: キーワード検索
    /*
    eventSearchKeyword(event) {
        if (event.key === 'Enter') this.searchKeyword(list_keyword.value);
    };
    */

    // EVENT: カテゴリ変更時のイベント
    eventChangeCategory() {
        console.log("eventChange.")
        if (Conf.selectItem.menu == "") {	// listTableリンク時
            let selcategory = listTable.getSelCategory()
            let targets = Conf.listTable.target == "targets" ? [selcategory] : ["-"]
            listTable.filterCategory(selcategory)
            if (Conf.view.poiFilter == "filter") { this.viewPoi(targets) }	// in targets
            let catname = selcategory !== "-" ? `?category=${selcategory}` : ""
            history.replaceState('', '', location.pathname + catname + location.hash)
        } else {	// 手動時
            switch (Conf.selectItem.action) {
                case "ChangeMap":
                    mapLibre.changeMap(list_category.value)
            }
            let catname = `?category=${list_category.value}`
            history.replaceState('', '', location.pathname + catname + location.hash)
        }
        this.eventMoveMap();    // ViewPoi
    };
};
