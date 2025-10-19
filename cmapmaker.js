class CMapMaker {

    constructor() {
        this.status = "initialize";         // 状態フラグ / initialize changeMode normal playback
        this.open_osmid = "";				// viewDetail表示中はosmid
        this.last_modetime = 0;
        this.mode = "map";
        this.id = 0;
        this.moveMapBusy = 0;
        this.changeKeywordWaitTime;
        this.scrollHints = 0;
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
        setTimeout(() => {
            this.eventMoveMap()
        }, 1000)
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
        //console.log(`viewArea: Start.`)
        let targets = poiCont.getTargets()  //
        console.log("viewArea: " + targets.join())
        targets.forEach((target) => {
            let osmConf = Conf.osm[target] == undefined ? { expression: { viewArea: true } } : Conf.osm[target]
            if (osmConf.expression.viewArea) {   // viewArea: trueが対象
                let pois = poiCont.getPois(target)
                let titleTag = ["format", ["case",
                    ["all", ["has", "ref"], ["!=", ["get", "ref"], ""]],
                    ["case", ["has", "local_ref"],
                        ["concat", "(", ["get", "ref"], "/", ["get", "local_ref"], ") ", ["coalesce", ["get", "name"], ""]],
                        ["concat", "(", ["get", "ref"], ") ", ["coalesce", ["get", "name"], ""]]
                    ],
                    ["coalesce", ["get", "name"], ""]
                ],
                    {}
                ];
                mapLibre.addPolygon({ "type": "FeatureCollection", "features": pois.geojson }, target, titleTag)
            }
        })
        //console.log("viewArea: End.")
    }

    viewPoi(targets) {		// Poiを表示させる
        let nowselect = listTable.getSelCategory()          // tags,key=valueの複数値
        nowselect = nowselect[0] == "" ? "-" : nowselect[nowselect.length - 1]
        console.log(`viewPoi: Start(now select ${nowselect}).`)
        targets = targets[0] == "-" || targets[0] == "" ? poiCont.getTargets() : targets;		// '-' or ''はすべて表示
        targets = targets.filter(target => {                                                    // poiView=trueのみ返す
            return Conf.osm[target] !== undefined ? Conf.osm[target].expression.poiView : false;
        })
        targets = Conf.etc.editMode ? targets.concat(Object.keys(Conf.poiView.editZoom)) : targets	// 編集時はeditZoom追加
        targets = [...new Set(targets)];    // 重複削除
        poiCont.setPoi(listTable.getFilterList(), false)

        let subcategory = poiCont.getTargets().indexOf(nowselect) > -1 || nowselect == "-" ? false : true;	// サブカテゴリ選択時はtrue
        if (subcategory) {	// targets 内に選択肢が含まれていない場合（サブカテゴリ選択時）
            poiCont.setPoi(listTable.getFilterList(), false)
        } else {			// targets 内に選択肢が含まれている場合
            console.log("viewPoi: " + targets.concat())
            let nowzoom = mapLibre.getZoom(false)
            //targets = targets.filter(target => target !== "activity");  // activiyがあれば削除 // 2025/08/20 一旦false
            targets = targets.filter(s => s !== "");
            if (nowselect = "-") {
                poiCont.setPoi(listTable.getFilterList(), false) //nowselect == Conf.google.targetName) // 2025/08/20 一旦false
            } else {
                for (let target of targets) {
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
            let LL = mapLibre.get_LL(true);
            let nowZoom = mapLibre.getZoom()
            let selectCategory = listTable.getSelCategory()[0]
            //let nowViewTargets = Object.entries(Conf.poiView.poiZoom).filter(([key, value]) => value <= nowZoom).map(([key]) => key)
            /*
            if (selectCategory !== "") {   // カテゴリ指定時
                nowViewTargets = nowViewTargets.indexOf(selectCategory) > -1 ? selectCategory : []
            }
            */
            let acts = poiCont.adata.filter(act => geoCont.checkInner(act.lnglat, LL) && act.picture_url1 !== "");
            acts = acts.filter(act => {
                return act.category == selectCategory || selectCategory == ""
                /*
                let targets = poiCont.get_osmid(act.osmid).targets
                return targets.some(el => nowViewTargets.includes(el))
                */
            }).map(act => {
                let urls = []
                let actname = act.id.split("/")[0]
                let forms = Conf.activities[actname].form
                for (const key of Object.keys(forms)) { // 複数あっても一つだけとする
                    if (forms[key].type === "image_url") { urls.push(act[key]); break }
                }
                return { "src": urls, "osmid": act.osmid, "title": act.title }
            })
            if (acts.length > 0) {
                images.classList.remove("d-none");
                winCont.setImages(images, acts, Conf.etc.loadingUrl)
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
        return new Promise((resolve) => {
            this.updateOsmPoi().then((status) => {
                switch (status.update) {
                    case true:
                        let targets = listTable.getSelCategory();
                        targets = (targets[0] == '' && cat !== undefined) ? [cat] : targets;
                        listTable.makeSelectList(Conf.listTable.category)
                        listTable.makeList(Conf.poiView.poiFilter)
                        listTable.selectCategory(targets)
                        listTable.filterByPoiStatus(this.visitedFilterStatus, this.favoriteFilter);
                        if (window.getSelection) window.getSelection().removeAllRanges()
                        this.makeImages(Conf.thumbnail.use)
                        this.viewArea()	        // 入手したgeoJsonを追加
                        this.viewPoi(targets)	// in targets
                        resolve({ "update": true })
                        break
                    default:
                        let bindMoveMapPromise = MoveMapPromise.bind(this)
                        bindMoveMapPromise(resolve, reject)	// 失敗時はリトライ(接続先はoverpass.jsで変更)
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
            return;
        }
        cMapMaker.updateView().then(() => cMapMaker.moveMapBusy = false)
    }

    // EVENT: カテゴリ変更時のイベント
    eventChangeCategory() {
        let catname, selcategory = listTable.getSelCategory()
        console.log("eventChange: " + selcategory)
        cMapMaker.updateView().then(() => {
            switch (Conf.selectItem.action) {
                case "ChangeMap":                               // 背景地図切り替え
                    mapLibre.changeMap(list_category.value); break;
            }
            catname = selcategory !== "-" ? `?category=${selcategory}` : ""
            history.replaceState('', '', location.pathname + catname + location.hash)
            winCont.clearDatail().then(() => {
                geoCont.writePoiCircle()
                mapLibre.map.redraw()
            })
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
