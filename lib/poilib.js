"use strict"

// PoiData Control
class PoiCont {

    #layerMatch = {};

    constructor() {
        this.pdata = { geojson: [], targets: [] }		//poi data variable
        this.adata = []									//act data variable /  poi's lnglat & geoidx
        this.cat_cache = {}
        this.lnglats = {}
        this.geoidx = {}
        this.parent = []		// (Poiのみ)親ポリゴンを示す
        this.polygons = []		// Polygon内に含まれるか調べるためのポリゴン一覧
        this.tiles = {}			// polygonsと同じキーのタイル番号を記録
    }

    init() {
        const generateIconImageExpression = function (markerJson) {
            const expression = ["case"];
            const subtagMap = markerJson.subtag;
            const tagIconMap = markerJson.tag;

            for (const keyEqVal in subtagMap) {             // subtag (key=value形式) 優先評価
                const [key, val] = keyEqVal.split("=");     // 例: ["tourism", "artwork"]
                const subKeyMap = subtagMap[keyEqVal];
                for (const subKey in subKeyMap) {
                    const valueMap = subKeyMap[subKey];
                    for (const subVal in valueMap) {
                        const icon = valueMap[subVal].replace(".svg", ".png");
                        // 条件: 親タグ key=val かつ subKey=subVal のとき
                        expression.push(["all", ["==", ["get", key], val], ["==", ["get", subKey], subVal]], icon);
                    }
                }
            }
            for (const key in tagIconMap) {                 // 通常の tag fallback
                const tagValues = tagIconMap[key];
                if (tagValues["*"]) continue;
                const matchExpr = ["match", ["get", key]];
                for (const tag in tagValues) {
                    if (tag === "*") continue;
                    const icon = tagValues[tag].replace(".svg", ".png");
                    matchExpr.push(tag, icon);
                }
                matchExpr.push("default-icon");
                expression.push(["has", key], matchExpr);
            }
            expression.push("default-icon");
            return expression;
        };
        this.#layerMatch = generateIconImageExpression(Conf.marker)
    }

    delete_all() { poiCont.pdata = { geojson: [], targets: [] } };

    pois() { return { pois: poiCont.pdata, acts: poiCont.adata, lnglats: poiCont.lnglats } };

    getTargets() {      // Conf.view.poiZoomのtargetを返す(edit時はpoiEditも合成)
        let targets = Object.keys(Conf.view.poiZoom)
        targets = Conf.etc.editMode ? targets.concat(Object.keys(Conf.view.editZoom)) : targets	// 編集時はeditZoom追加
        return [...new Set(targets)];
    }

    setActdata(json) { poiCont.adata = json };		// set GoogleSpreadSheetから帰ってきたJson

    setActlnglat() {								// set Act LngLat by OSMID
        poiCont.adata.forEach((act) => {
            let osmdata = poiCont.get_osmid(act.osmid)
            if (osmdata !== undefined) { act.lnglat = osmdata.lnglat }
        })
    }

    addGeojson(pois) {								// add geojson pois / pois: {geojson: [],targets: []}
        let children = []

        function setGeojson(poi) {								// addGeojsonのサブ機能
            let cidx = poiCont.pdata.geojson.findIndex((val) => val.id == poi.geojson.id);
            if (cidx === -1) {       	                   	    // 無い時は追加
                poiCont.pdata.geojson.push(poi.geojson);
                poiCont.pdata.targets.push(poi.targets);
                cidx = poiCont.pdata.targets.length - 1;
            } else if (poiCont.pdata.targets[cidx].indexOf(poi.targets) > -1) {
                poiCont.pdata.targets[cidx].push(poi.targets);
            };
        };
        pois.geojson.forEach((node, node_idx) => {			    // 既存Poiに追加
            let poi = { "geojson": pois.geojson[node_idx], "targets": pois.targets[node_idx] }
            setGeojson(poi)
            if (poiCont.lnglats[node.id] == undefined) {	    // 初期登録時
                let ll = geoCont.flat2single(node.geometry.coordinates, node.geometry.type)
                poiCont.lnglats[node.id] = [ll[0], ll[1]]
                poiCont.tiles[node.id] = geoCont.ll2tile({ lng: ll[0], lat: ll[1] }, 14)	// タイル番号を保存
                poiCont.geoidx[node.id] = node_idx
                if (node.geometry.type == "Polygon") poiCont.polygons[node.id] = node	// 後でPolygon内のPoi検索に利用
                children[node.id] = node												// Polygonもchildrenに追加
            }
        })

        let pt1 = { "type": "Feature", "properties": {}, "geometry": { "type": "Point", "coordinates": [0, 0] } }
        for (const child in children) { // childrenがポリゴンに含まれているか確認
            pt1.geometry.coordinates[1] = poiCont.lnglats[child][1]
            pt1.geometry.coordinates[0] = poiCont.lnglats[child][0]
            if (!isNaN(pt1.geometry.coordinates[0])) {
                for (const polygon of Object.values(poiCont.polygons)) {
                    let polyT = poiCont.tiles[polygon.id]
                    let chldT = poiCont.tiles[child]
                    let diff = Math.abs(polyT.tileX - chldT.tileX) + Math.abs(polyT.tileY - chldT.tileY)
                    if (child !== polygon.id && diff <= 2) { // 同一要素&遠いタイルはチェックしない
                        if (turf.booleanPointInPolygon(pt1, poiCont.polygons[polygon.id])) { // ポリゴン内に存在すれば親を設定する
                            //console.log("addGeojson: " + child + " in " + polygon.id)
                            poiCont.parent[child] = poiCont.polygons[polygon.id]
                        }
                    }
                }
            }
        }
        console.log("PoiCont: addGeojson: " + Object.keys(children).length + " Counts.")
    }

    get_parent(osmid) { return poiCont.parent[osmid]; };		// osmidを元に親geojson全体を返す

    get_osmid(osmid) {           								// osmidを元にgeojsonと緯度経度、targetを返す
        let idx = poiCont.geoidx[osmid];
        return idx == undefined ? undefined : {
            geojson: poiCont.pdata.geojson[idx], lnglat: poiCont.lnglats[osmid], targets: poiCont.pdata.targets[idx]
        }
    }

    get_actid(actid) {
        let act = poiCont.adata.filter(line => actid == line.id);
        return act == undefined ? undefined : act[0];
    }

    getActlistByOsmid(osmid) { return poiCont.adata.filter(a => a.osmid == osmid); };	// get activities by osmid

    // get Category Name & subname & tag
    // [catname, subcatname, maintag, subtag]
    getCatnames(tags) {
        if (poiCont.cat_cache[tags.id] !== undefined) return Array.from(poiCont.cat_cache[tags.id]);  // 配列をコピーして返す(参照返しだと値が壊れる)
        let catname = "", mainkey = "", mainval = "";
        let mainkeys = Conf.category_keys.filter(key => (tags[key] !== undefined) && key !== "*");	// srarch tags
        if (mainkeys == undefined) return Conf.category.tag['*']['*'];
        for (mainkey of mainkeys) {
            mainval = tags[mainkey] == undefined ? "*" : tags[mainkey];
            catname = Conf.category[mainkey][mainval];
            catname = (catname !== undefined) ? catname : "";
            if (catname !== "") break;		// if found catname then break
        }

        let subcatname = "", subkeyval = ""
        let subtag = Conf.category_sub[mainkey]										// ex: subtag = {"religion": {"shinto":"a.svg","buddhist":"b.svg"}}
        if (subtag !== undefined) {
            for (let subkey of Object.keys(subtag)) {								// subkey: ex: religion
                if (subcatname !== "") break
                for (let subval of Object.keys(subtag[subkey])) { 					// subval: ex: shinto
                    subcatname = (tags[subkey] == subval) ? subtag[subkey][subval] : ""
                    if (subcatname !== "") subkeyval = subkey + "=" + subval
                }
            }
        }
        if (catname == "") {
            console.log("poiCont: getCatnames: no key: " + mainkey + "," + mainval + " / " + tags.id);
            catname = glot.get("undefined");
        };
        poiCont.cat_cache[tags.id] = [catname, subcatname, mainkey + "=" + mainval, subkeyval];
        return poiCont.cat_cache[tags.id];
    };

    get_wikiname(tags) {          													// get Wikipedia Name from tag
        let wikiname = tags["wikipedia"] ? tags["wikipedia"].split(':')[1] : "";	// value値の":"の右側を返す
        return wikiname;
    };

    getTarget(target) {											// 指定したtargetのpoisとactsを返す
        let pois = poiCont.getPois(target);
        let acts = [];
        switch (target) {
            case "activity":
                acts = poiCont.adata;
                break;
            default:
                acts = poiCont.adata.filter(a => { return a.category == target });
                break;
        };
        return { "pois": pois, "acts": acts };
    };

    getPois(targets) {		// 指定したtargetsのpoisを返す
        let tars = [], lls = [], geojson = poiCont.pdata.geojson;
        if (targets.length > 0) {
            geojson = geojson.filter((geojson_val, geojson_idx) => {
                let found = false;
                for (let target_idx in poiCont.pdata.targets[geojson_idx]) {
                    if (targets.includes(poiCont.pdata.targets[geojson_idx][target_idx]) || targets == "-") {
                        tars.push(poiCont.pdata.targets[geojson_idx]);
                        lls.push(poiCont.lnglats[geojson_val.id]);
                        found = true;
                        break;
                    };
                }
                return found;
            });
        }
        return { geojson: geojson, lnglat: lls, targets: tars };
    }

    // Grid.js向きの配列を出力 / リストの最後に カテゴリ名の元タグ と targets を追加
    makeList(targets, noInner) {
        let LL = mapLibre.get_LL();
        let pois = poiCont.getPois(targets), datas = [], listed = {};				// targetsに指定されたpoiのみフィルター
        for (const [idx, node] of pois.geojson.entries()) {
            let tags = node.properties, data = []
            let names = poiCont.getCatnames(tags)
            if (noInner ? true : geoCont.checkInner(pois.lnglat[idx], LL)) {        // noInner = falseならInnerCheck
                listed[tags.id] = true
                Conf.list.columns.poiFields.forEach(key => {
                    if (key == "#category") {										// #は内部データを利用する意味
                        let vName = names[1] !== "" ? `${names[0]}(${names[1]})` : names[0]
                        data.push(vName);										// category追加
                    } else if (key.indexOf("#parent") > -1) {						// 親データを使う意味
                        let keys = key.substring(key.indexOf(".") + 1).split(",")	// キー取得(複数の可能性あり)
                        let ptag, pGeo = poiCont.get_parent(tags.id)
                        ptag = pGeo ? pGeo.properties[keys[0]] : tags[keys[1]]
                        data.push(ptag == undefined ? "" : ptag)					// osmtag追加
                    } else if (key == "reservation") {                          // 予約の時
                        let reserv = "";
                        switch (tags["reservation"]) {
                            case "yes": reserv = glot.get("reservation_yes"); break;
                            //case "no": reserv = glot.get("reservation_no"); break;    // 予約不要は書かない
                            case "recommended": reserv = glot.get("reservation_recommended"); break;
                        }
                        data.push(reserv);
                    } else {
                        data.push(tags[key] == undefined ? "-" : tags[key])			// osmtag追加
                    }
                })
                data.push(names[2] + (names[3] !== "" ? `,${names[3]}` : ""))		// カテゴリ名の元タグ(サブも)を追加
                data.push(pois.targets[idx])										// listの最後にtargetを追加
                datas.push(data)
            }
        }
        if (targets.indexOf(Conf.google.targetName) > -1 || targets.indexOf("-") > -1) {				    // targetsにgSheet名があればリストに追加
            poiCont.adata.forEach((line) => {
                if (line !== undefined) {
                    let data = [], poi = poiCont.get_osmid(line.osmid);
                    if (poi !== undefined) {
                        let allActs = Conf.listTable.allActs ? true : geoCont.checkInner(poi.lnglat, LL);
                        if (allActs && listed[poi.geojson.properties.id] !== true) {
                            let names = poiCont.getCatnames(poi.geojson.properties)
                            Conf.list.columns.actFields.forEach(key => {
                                if (key.indexOf("datetime") > -1) {											// フィールド名に日時を含む場合
                                    data.push(basic.formatDate(new Date(line.updatetime), "YYYY/MM/DD"))
                                } else if (key.indexOf("#category") > -1) {
                                    data.push(names[0] + (names[1] !== "" ? `(${names[1]})` : "")) 			// category追加
                                } else if (key.indexOf("#") > -1) {											// #が付いている場合はOSMタグを取得
                                    let tagname = key.substring(key.indexOf("#") + 1)
                                    let osmtag = poi !== undefined ? poi.geojson.properties[tagname] : ""	// OSM tag名を指定した場合
                                    data.push(osmtag)
                                } else {
                                    data.push(line[key] == undefined ? "-" : line[key])						// gsheet追加
                                }
                            })
                            data.push(names[2]);											// listにカテゴリ名の元タグを追加
                            data.push(poi.targets.concat(targets));							// listの最後にtargetを追加
                            datas.push(data);
                        }
                    } else {
                        console.log("poiCont.makeList: No OSMID: " + line.osmid);
                    };
                };
            });
        };
        datas.sort((a, b) => { return (a[0] > b[0]) ? 1 : -1 });
        return datas;
    }

    getIcon(tags) {		// get icon filename
        let mainico = "", subicon = "", mainkey = "", mainval = "";
        let mainkeys = Conf.category_keys.filter(key => (tags[key] !== undefined) && key !== "*");	// srarch tags
        if (mainkeys == undefined) return Conf.marker.tag['*']['*'];
        for (mainkey of mainkeys) {
            mainval = tags[mainkey] == undefined ? "*" : tags[mainkey];
            try {
                mainico = Conf.marker.tag[mainkey][mainval];
            } catch {
                mainico = "";
            }
            mainico = (mainico !== undefined) ? mainico : "";
            if (mainico !== "") break;		// if found icon then break
        }

        let subtag = Conf.marker.subtag[mainval];					// ex: subtag = {"religion": {"shinto":"a.svg","buddhist":"b.svg"}}
        if (subtag !== undefined) {
            for (let subkey of Object.keys(subtag)) {				// subkey: ex: religion
                if (subicon !== "") break;
                for (let subval of Object.keys(subtag[subkey])) { 	// subval: ex: shinto
                    subicon = (tags[subkey] == subval) ? subtag[subkey][subval] : "";
                    if (subicon !== "") break;
                };
            };
        };
        mainico = subicon !== "" ? subicon : mainico;
        return mainico == "" ? Conf.marker.tag['*']['*'] : mainico;
    }

    // Poi表示(actonly:true時はGSheetデータが無いと非表示)
    // params{flist, actonly}
    setPoi(flist, actonly) {

        const checkMarker = function (poi) {    // 画面範囲内&ズームチェック
            let zoomlv = mapLibre.getZoom(true), LL = mapLibre.get_LL(), params = {};
            if (geoCont.checkInner(poi.lnglat, LL)) {
                let actlists = poiCont.getActlistByOsmid(poi.geojson.id)
                let viewflag = (actonly && actlists.length > 0) ? true : !actonly
                let tg1 = actlists.length > 0 ? [Conf.google.targetName] : poi.targets		// activity or target指定
                let tg2 = tg1.filter(item => poiCont.getTargets().includes(item))	        // 重複targetsを取得
                let tgv = false
                for (let tg3 of tg2) { if (zoomlv >= Conf.view.poiZoom[tg3] || zoomlv >= Conf.view.editZoom[tg3]) tgv = true }	// ズーム範囲内がチェック
                if (viewflag && tgv) params = { poi: poi, actlists: actlists }  // act ok and 未表示の場合
            }
            return params
        }

        const saveMarker = function (params) {              // params内のgeojsonをgeojson変数に保存
            let tags = params.poi.geojson.properties.tags == null ? params.poi.geojson.properties : params.poi.geojson.properties.tags;
            let wiki = tags.wikipedia, name = tags.name
            let lcal = Conf.etc.localSave !== "" ? localStorage.getItem(Conf.etc.localSave + "." + tags.id) : "";     // 有効時はtags.idの情報取得、他は""
            lcal = (lcal === undefined || lcal === null) ? "" : lcal
            /*if (Conf.etc.localSave !== "" && lcal == "") {                          // 接頭子が無いバックアップへのフォロー
                lcal = localStorage.getItem(tags.id)                                    // 旧型式のデータを取得
                if (lcal !== undefined && lcal !== null) {                              // 旧型式データが見つかった場合
                    localStorage.setItem(Conf.etc.localSave + "." + tags.id, lcal);         // 新形式のデータへ変換する
                    localStorage.removeItem(tags.id)                                        // 旧型式のデータを削除する
                }
            }*/
            name = tags["bridge:name"] == null ? name : tags["bridge:name"];	// 橋の名称があれば優先
            name = (name == "" || name == null) ? "" : name;
            let css_name = "normal";
            switch (tags["reservation"]) {  // 予約の有無
                case "yes":
                    name += "\n(" + glot.get("reservation_yes") + ")"; break;
                case "no":
                    css_name = "green"; break
                case "recommended":
                    name += "\n(" + glot.get("reservation_recommended") + ")"; css_name = "middle"; break;
            }
            if (params.actlists.length > 0) {
                css_name = "attention"
            } else if (wiki != undefined) {     // wikipedia記事あり
                css_name = "normal"
            } else if (lcal.slice(0, 4) == "true") {
                css_name = "visited"
            }
            let lval = lcal.split(",")[1]
            name += (lval !== undefined && lval !== "") ? `\n(${lval})` : "";
            params.poi.geojson.properties.expo2025_name = name
            geojson[css_name].features.push(params.poi.geojson)
            if (tags.level !== undefined) {   //2F以上の影つけ
                let level = Number(tags.level)
                if (level > 0) geojson["shadow"].features.push(params.poi.geojson)
            }
        }

        let geojson = {
            shadow: { "type": "FeatureCollection", "features": [] },
            attention: { "type": "FeatureCollection", "features": [] },
            green: { "type": "FeatureCollection", "features": [] },
            middle: { "type": "FeatureCollection", "features": [] },
            normal: { "type": "FeatureCollection", "features": [] },
            visited: { "type": "FeatureCollection", "features": [] }
        }

        if (flist !== undefined) {	// set flist
            console.log("poiCont: setPoi: " + flist.length + " counts");
            flist.forEach(list => {
                let inActs = Object.keys(Conf.activities).indexOf(list[0].split("/")[0]);
                let osmid = inActs > -1 ? poiCont.get_actid(list[0]).osmid : list[0];
                let poi = poiCont.get_osmid(osmid);
                if (poi !== undefined) {
                    let params = checkMarker(poi);
                    if (Object.keys(params).length > 0) saveMarker(params);
                } else {
                    console.log("poiCont: no load osm data: " + list[0]);
                }
            })
        } else {					                // set target(activityはマーカーを手間表示で後回し)
            let poisOrder = []
            let allPois = poiCont.getPois("-");         // 全データを取得
            if (allPois.geojson !== undefined) {	// pois表示
                allPois.geojson.forEach(function (geojson, idx) {
                    let poi = { "geojson": geojson, "targets": allPois.targets[idx], "lnglat": allPois.lnglat[idx] };
                    let params = checkMarker(poi);
                    if (Object.keys(params).length > 0 && params.actlists.length == 0) poisOrder.push(params)
                })
            }
            allPois = poiCont.getPois("activity");  // Activityを取得
            if (allPois.length > 0) {				// acts表示
                allPois.forEach((act) => {
                    let osm = poiCont.get_osmid(act.osmid);
                    if (osm !== undefined && (act.category == org_target || org_target == "activity")) {
                        let poi = { "geojson": osm.geojson, "targets": osm.targets, "lnglat": osm.lnglat };
                        let params = { target: target, poi: poi };
                        if (geoCont.checkInner(poi)) poisOrder.unshift(params);
                    };
                });
            };
            poisOrder.forEach(params => saveMarker(params))
        }
        Object.keys(geojson).forEach(marker => {
            // ソースの設定
            let source = mapLibre.map.getSource('marker-' + marker)
            if (source !== undefined) {
                source.setData(geojson[marker]);
            } else {
                mapLibre.map.addSource('marker-' + marker, { type: 'geojson', data: geojson[marker] });
            }

            // 影レイヤーの新規作成
            if (!mapLibre.map.getLayer('marker-shadow-' + marker)) {
                mapLibre.map.addLayer({
                    id: 'marker-shadow-' + marker, type: 'symbol', source: 'marker-' + marker,
                    layout: {
                        'symbol-placement': 'point', 'symbol-sort-key': 0, "icon-offset": [0, 32],
                        'icon-allow-overlap': true, 'icon-ignore-placement': true,
                        'icon-image': ['case', ['all', ['has', 'level'], ['>=', ['to-number', ['get', 'level']], 1]],
                            'circle_shadow.png', ''], 'icon-size':
                            [
                                'step', ['zoom'], Conf.icon[marker] * 0.6,    // ズーム13以下は 0.6 倍
                                16, Conf.icon[marker] * 0.8,    // ズーム15以下は 0.8 倍
                                17, Conf.icon[marker] * 1.0     // ズーム16以上は 1.0 倍
                            ]
                    }, paint: {
                        'icon-opacity': 0.5  // 50%の不透明度（半透明）
                    }
                })
            }

            // 背景アイコンの新規作成
            if (!mapLibre.map.getLayer('marker-bg-' + marker)) {
                mapLibre.map.addLayer({
                    id: 'marker-bg-' + marker, type: 'symbol', source: 'marker-' + marker,
                    layout: {
                        'symbol-placement': 'point', 'symbol-sort-key': 0,
                        'icon-allow-overlap': true, 'icon-ignore-placement': true,
                        'icon-image': 'circle_' + marker + '.png', 'icon-size':
                            [
                                'step', ['zoom'], Conf.icon[marker] * 0.6,    // ズーム13以下は 0.6 倍
                                16, Conf.icon[marker] * 0.8,    // ズーム15以下は 0.8 倍
                                17, Conf.icon[marker] * 1.0     // ズーム16以上は 1.0 倍
                            ]
                    }
                })
            }

            // 前景アイコンとテキストの新規作成
            if (!mapLibre.map.getLayer('marker-fg-' + marker)) {
                mapLibre.map.addLayer({
                    id: 'marker-fg-' + marker, type: 'symbol', source: 'marker-' + marker,
                    layout: {
                        "text-field": ['step', ['zoom'], '', Conf.icon.textViewZoom, ['get', 'expo2025_name']],
                        "text-font": Conf.icon.textFont, "text-size": Conf.icon.textSize,
                        "text-anchor": "top", "text-offset": [0, 1.8],  // テキスト位置、アイコンのオフセット
                        'symbol-placement': 'point', 'symbol-sort-key': 1,
                        'icon-allow-overlap': true, 'icon-ignore-placement': true,
                        'text-allow-overlap': true, 'text-ignore-placement': true,
                        'text-line-height': 1.4,
                        'icon-image': this.#layerMatch, 'icon-size':
                            [
                                'step', ['zoom'], Conf.icon[marker] * 0.35,
                                16, Conf.icon[marker] * 0.45,    // ズーム15以下は 0.6 倍
                                17, Conf.icon[marker] * 0.65     // ズーム16以上は 1.0 倍
                            ]
                    },
                    paint: {
                        "text-color": "#000000", "text-halo-color": "#ffffff", "text-halo-width": 1
                    }
                })

                mapLibre.map.on('click', 'marker-fg-' + marker, (e) => {        // クリックイベント登録
                    const props = e.features[0].properties;
                    cMapMaker.viewDetail(props.id)
                });
                mapLibre.map.on('mouseenter', 'marker-fg-' + marker, () => { mapLibre.map.getCanvas().style.cursor = 'pointer' });
                mapLibre.map.on('mouseleave', 'marker-fg-' + marker, () => { mapLibre.map.getCanvas().style.cursor = '' });

            }
        })
    }

    select(poiid, detail) {								// Map move to PoiId & Zoom(config)
        return new Promise((resolve, reject) => {
            let zoomlv = Math.max(mapLibre.getZoom(true), Conf.map.modalZoom)
            let poi = poiCont.get_osmid(poiid)
            if (poi == undefined) {
                let act = poiCont.get_actid(poiid);
                if (act !== undefined) poi = poiCont.get_osmid(act.osmid)
            }
            if (poi !== undefined) {	// Poiが見つかった場合
                mapLibre.flyTo(poi.lnglat, zoomlv)
                geoCont.flashPolygon(poi.geojson)
                if (detail) cMapMaker.viewDetail(poi.geojson.id)
                resolve()
            } else {					// Poiが見つからなかった場合
                winCont.spinner(true)
                overPassCont.getOsmIds([poi.osmid]).then((geojson) => {
                    poiCont.addGeojson(geojson)
                    osmid = poiCont.get_osmid(poi.osmid)
                    mapLibre.flyTo({ center: osmid.lnglat }, zoomlv)
                    geoCont.flashPolygon(poi.geojson)
                    if (detail) cMapMaker.viewDetail(poi.osmid)
                    winCont.spinner(false)
                    resolve()
                }).catch((e) => {
                    console.log("poiCont: Error: " + e)
                    winCont.spinner(false)
                    reject()
                })
            }
        })
    }
}
