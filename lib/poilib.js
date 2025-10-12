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
        this.countries = []     // 国のポリゴンと名称データ
    }

    init(useCountries) {
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

        // 国コードとポリゴン情報を取得
        if (useCountries) {
            fetch('./data/countries.min.json').then((res) => {
                res.json().then((json) => { this.countries = json.features.filter(f => f.properties["ISO3166-1-Alpha-2"] !== "-99"); })
            })
        }

    }

    deleteAll() { poiCont.pdata = { geojson: [], targets: [] } }

    pois() { return { pois: poiCont.pdata, acts: poiCont.adata, lnglats: poiCont.lnglats } };

    getTargets() {      // Conf.view.poiZoomのtargetを返す(edit時はpoiEditも合成)
        let targets = Object.keys(Conf.poiView.poiZoom)
        targets = Conf.etc.editMode ? targets.concat(Object.keys(Conf.poiView.editZoom)) : targets	// 編集時はeditZoom追加
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

    getOsmidByCountryCode(CCode) {       // 国コードからOSMIDを返す
        let osm = poiCont.pdata.geojson.filter(line => {
            let country = line.properties.country !== undefined ? line.properties.country : ""
            let countries = country.split(";")
            return countries.indexOf(CCode) > -1
        });
        return osm.length > 0 ? osm[0].id : ""
    }

    getPolygonByCountryCode(CCode) {    // 国コードから国ポリゴンを返す
        let geojson = poiCont.countries.filter(line => CCode == line.properties["ISO3166-1-Alpha-2"]);
        return geojson.length > 0 ? geojson : ""
    }

    getPolygonByPoint(pt) {                // 与えられたPoint Geojsonが何処の国を指しているか返す
        const matches = this.countries.filter(f => turf.booleanPointInPolygon(pt, f))   // 国判定
        if (matches.length > 0) console.log(`CountryCode: ${matches[0].properties["ISO3166-1-Alpha-2"]}`)
        return matches
    }

    getAllOSMCountryCode() {    // OSMの全ての国コードを返す
        let osm = poiCont.pdata.geojson.filter(line => line.properties.country !== undefined);
        osm = osm.flatMap(line => line.properties.country.split(";"))
        return osm.length > 0 ? basic.uniq(osm) : []
    }

    // 訪問済みの国ポリゴンを返す
    getPolygonVisitedCountory() {
        let visitedcountory = [], allVisiteds = poiStatusCont.getAllVisited()
        allVisiteds.forEach(line => {
            let CCode = "", osm = poiCont.get_osmid(line[0].split(".")[1]);
            if (osm !== undefined) {    // OSMIDのデータを持っている場合
                CCode = osm.geojson.properties.country
                CCode = CCode !== undefined ? CCode : ""
            }
            if (CCode !== "") { // CCodeが見つかった場合
                let CPoly = poiCont.getPolygonByCountryCode(CCode)
                if (CPoly !== undefined && CPoly !== "") visitedcountory.push(CPoly[0])
            }
        })
        return visitedcountory
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

        // activityを元にリスト作成
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
                        listed[poi.geojson.properties.id] = true    // 画面範囲外であってもフラグは付ける
                    } else {
                        console.log("poiCont.makeList: No OSMID: " + line.osmid);
                    };
                };
            });
        };

        // target(tag)を元にリスト追加
        for (const [idx, node] of pois.geojson.entries()) {
            let tags = node.properties, data = []
            let names = poiCont.getCatnames(tags)
            if ((noInner ? true : geoCont.checkInner(pois.lnglat[idx], LL)) && listed[tags.id] !== true) {        // noInner = falseならInnerCheck
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

    // OSMタグからnameを取得
    getOSMname(tags, lang) {    // tags:OSMタグ(geoJsonのproperties相当)、lang:言語(ISO 639-1)
        if (!tags) return "";
        if (tags["bridge:name"]) return tags["bridge:name"];	                 // 橋の名称
        if (tags[`name:${lang}`]) return tags[`name:${lang}`];                   // 指定言語の name タグを優先
        if (tags[`alt_name:${lang}`]) return tags[`alt_name:${lang}`];           // alt_name の言語別タグがあれば次に優先
        if (tags[`loc_name:${lang}`]) return tags[`loc_name:${lang}`];           // loc_name や official_name の言語別タグもチェック
        if (tags[`official_name:${lang}`]) return tags[`official_name:${lang}`];
        if (tags.name) return tags.name;                                         // デフォルトの name
        if (tags.alt_name) return tags.alt_name.split(";")[0];                   // alt_name（カンマ区切りになることが多い）
        if (tags.official_name) return tags.official_name;                       // official_name や loc_name
        if (tags.loc_name) return tags.loc_name.split(";")[0];                   // ローカルネーム
        return "";
    }

    // Poi表示(actonly:true時はGSheetデータが無いと非表示)
    // params{flist, actonly}
    setPoi(flist, actonly) {
        const checkMarker = function (poi) {    // 画面範囲内&ズームチェック
            let zoomlv = mapLibre.getZoom(true), LL = mapLibre.get_LL(), params = {};
            if (geoCont.checkInner(poi.lnglat, LL)) {
                let actlists = poiCont.getActlistByOsmid(poi.geojson.id)
                let viewflag = (actonly && actlists.length > 0) ? true : !actonly
                let tg1 = actlists.length > 0 ? [Conf.google.targetName, ...poi.targets] : poi.targets		// activity or target指定
                let tg2 = tg1.filter(item => poiCont.getTargets().includes(item))	        // 重複targetsを取得
                let tgv = false
                for (let tg3 of tg2) { if (zoomlv >= Conf.poiView.poiZoom[tg3] || zoomlv >= Conf.poiView.editZoom[tg3]) tgv = true }	// ズーム範囲内がチェック
                if (viewflag && tgv) params = { poi: poi, actlists: actlists }  // act ok and 未表示の場合
            }
            return params
        }

        // アイコン作成
        const saveMarker = function (params) {              // params内のgeojsonをgeojson変数に保存
            let tags = params.poi.geojson.properties.tags == null ? params.poi.geojson.properties : params.poi.geojson.properties.tags;
            let wiki = tags.wikipedia, isOpenNow = false;
            let poiStatus = poiStatusCont.getValueByOSMID(tags.id)
            let name = poiCont.getOSMname(tags, glot.lang)
            let css_name = "normal";
            if (Number(tags.level) >= 1) {  // 階数追加
                name += `\n(${Number(tags.level) + 1}F)`
            }
            switch (tags["reservation"]) {  // 予約の有無
                case "yes":
                    name += "\n(" + glot.get("reservation_yes") + ")"; break;
                case "no":
                    css_name = "green"; break
                case "recommended":
                    name += "\n(" + glot.get("reservation_recommended") + ")"; css_name = "middle"; break;
            }
            if (tags["opening_hours"] && Conf.map.openNow) {
                isOpenNow = basic.isOpenNow(tags["opening_hours"]);
                if (isOpenNow) name += `\n(${glot.get("opening")})`;
            }
            if (params.actlists.length > 0 || isOpenNow) {
                css_name = "attention"
            } else if (wiki != undefined) {     // wikipedia記事あり
                css_name = "normal"
            } else if (poiStatus[PoiStatusIndex.VISITED]) {
                css_name = "visited"
            }
            if (tags.landuse == "retail") {         // 商業地域(商店街など)
                css_name = "middle"
            }
            name += (poiStatus[PoiStatusIndex.MEMO] !== "" && poiStatus[PoiStatusIndex.MEMO] !== undefined) ? `\n(${poiStatus[PoiStatusIndex.MEMO]})` : "";
            let ref = (tags.local_ref !== undefined) ? tags.local_ref : (tags.ref !== undefined ? tags.ref : "")
            name = ref !== "" ? `(${ref}) ${name}` : name;
            if (name == "") {   // 最後まで処理して名前が無い場合、actを探して最初のタイトルを取得する
                let act = poiCont.getActlistByOsmid(tags.id)
                if (act.length > 0) name = act[0][Conf.google.actTitle]
            }
            params.poi.geojson.properties.cmapmaker_name = name
            geojson[css_name].features.push(params.poi.geojson)
            if (tags.level !== undefined) {   //2F以上の影つけ
                let level = Number(tags.level)
                if (level > 0) geojson["shadow"].features.push(params.poi.geojson)
            }
        }

        // マーカークリック時の処理
        const selectMarker = function (e) {
            const props = e.features[0].properties;
            let geojson = poiCont.get_osmid(props.id).geojson
            cMapMaker.viewDetail(props.id).then(() => {
                if (geojson !== undefined) {
                    geoCont.flashPolygon(geojson)
                    geoCont.writePoiCircle(geojson)
                }
            })
        }

        let geojson = {
            shadow: { "type": "FeatureCollection", "features": [] },    // 影
            attention: { "type": "FeatureCollection", "features": [] }, // Acts時
            green: { "type": "FeatureCollection", "features": [] },     // 予約不要時
            middle: { "type": "FeatureCollection", "features": [] },    // 予約推奨時
            normal: { "type": "FeatureCollection", "features": [] },    // Wikipedia記事
            visited: { "type": "FeatureCollection", "features": [] }   // 訪問済み
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
            let allPois = poiCont.getPois("-")      // 全データを取得
            if (allPois.geojson !== undefined) {	// pois表示
                allPois.geojson.forEach(function (geojson, idx) {
                    let poi = { "geojson": geojson, "targets": allPois.targets[idx], "lnglat": allPois.lnglat[idx] }
                    let params = checkMarker(poi)
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

        // 影レイヤーの新規作成
        let source = mapLibre.map.getSource('marker-shadow')
        if (source == undefined) {
            mapLibre.map.addSource('marker-shadow', { type: 'geojson', data: geojson.shadow, promoteId: 'id' });
        } else {
            source.setData(geojson.shadow);
        }
        if (!mapLibre.map.getLayer('marker-shadow')) {
            mapLibre.map.addLayer({
                id: 'marker-shadow', type: 'symbol', source: 'marker-shadow',
                layout: {
                    'symbol-placement': 'point', 'symbol-sort-key': 0, "icon-offset": [0, 32],
                    'icon-allow-overlap': true, 'icon-ignore-placement': true,
                    'icon-image': ['case', ['all', ['has', 'level'], ['>=', ['to-number', ['get', 'level']], 1]],
                        'circle_shadow.png', ''], 'icon-size':
                        [
                            'step', ['zoom'], Conf.icon["shadow"] * 0.9,
                            16, Conf.icon["shadow"] * 1.0,      // ズーム15以上
                            17, Conf.icon["shadow"] * 1.1       // ズーム16以上
                        ]
                }, paint: { 'icon-opacity': 0.8 }               // 50%の不透明度（半透明）
            })
        }

        let markers = ["attention", "green", "middle", "normal", "visited"];
        markers.forEach(marker => {
            // ソースの設定
            let source = mapLibre.map.getSource('marker-' + marker)
            if (source !== undefined) {
                source.setData(geojson[marker]);
            } else {
                mapLibre.map.addSource('marker-' + marker, { type: 'geojson', data: geojson[marker], generateId: true });
            }

            // 背景アイコンの新規作成
            if (!mapLibre.map.getLayer('marker-bg-' + marker)) {
                mapLibre.map.addLayer({
                    id: 'marker-bg-' + marker, type: 'symbol', source: 'marker-' + marker,
                    layout: {
                        'symbol-placement': 'point', 'symbol-sort-key': 0, 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                        'icon-image': 'circle_' + marker + '.png', 'icon-size':
                            [
                                'step', ['zoom'], Conf.icon[marker] * 0.9,
                                16, Conf.icon[marker] * 1.0,    // ズーム15以上
                                17, Conf.icon[marker] * 1.1     // ズーム16以上
                            ]
                    }
                })
            }

            // 前景アイコンの新規作成
            if (!mapLibre.map.getLayer('marker-fg-' + marker)) {
                mapLibre.map.addLayer({
                    id: 'marker-fg-' + marker, type: 'symbol', source: 'marker-' + marker,
                    layout: {
                        'symbol-placement': 'point', 'symbol-sort-key': 1, 'icon-allow-overlap': true, 'icon-ignore-placement': true,
                        'icon-image': this.#layerMatch, 'icon-size':
                            [
                                'step', ['zoom'], Conf.icon[marker] * 0.5,
                                16, Conf.icon[marker] * 0.6,    // ズーム15以上
                                17, Conf.icon[marker] * 0.7     // ズーム16以上
                            ]
                    }
                })
                mapLibre.map.on('click', 'marker-fg-' + marker, (e) => { selectMarker(e) });   // クリックイベント登録
                mapLibre.map.on('mouseenter', 'marker-fg-' + marker, () => { mapLibre.map.getCanvas().style.cursor = 'pointer' });
                mapLibre.map.on('mouseleave', 'marker-fg-' + marker, () => { mapLibre.map.getCanvas().style.cursor = '' });
            }

            // 前景アイコンのテキスト新規作成
            if (!mapLibre.map.getLayer('marker-text-' + marker)) {
                mapLibre.map.addLayer({
                    id: 'marker-text-' + marker, type: 'symbol', source: 'marker-' + marker,
                    layout: {
                        'text-variable-anchor': ['top', 'left'], 'text-radial-offset': 2, 'text-justify': 'auto', 'text-padding': 1,
                        "text-field": ['step', ['zoom'], '', Conf.icon.textViewZoom, ['get', 'cmapmaker_name']],
                        "text-font": Conf.icon.textFont, "text-size":
                            [
                                'step', ['zoom'], Conf.icon.textSize,
                                14, Conf.icon.textSize * 0.9, 15, Conf.icon.textSize * 1.0,
                                16, Conf.icon.textSize * 1.1, 17, Conf.icon.textSize * 1.2,
                                18, Conf.icon.textSize * 1.3, 19, Conf.icon.textSize * 1.4
                            ],
                        "text-anchor": "left", "text-offset": [0, 0],  // テキスト位置、アイコンのオフセット
                        'symbol-placement': 'point', 'symbol-sort-key': 1,
                        'text-line-height': 1.2,
                    },
                    paint: {
                        "text-color": "#000000", "text-halo-color": "#ffffff", "text-halo-width": 2
                    }
                })
            }

            // 国旗アイコンの新規作成
            if (!mapLibre.map.getLayer('marker-flag-' + marker)) {
                mapLibre.map.addLayer({
                    id: 'marker-flag-' + marker, type: 'symbol', source: 'marker-' + marker,
                    minzoom: 17,
                    layout: {
                        'icon-anchor': 'top-left',
                        'symbol-placement': 'point', 'symbol-sort-key': 0, "icon-offset": [-80, -50],
                        'icon-allow-overlap': true, 'icon-ignore-placement': true,
                        'icon-image': ["concat", "flag-", ["get", "country"]], 'icon-size': Conf.icon.flag,
                    }
                })
            }
        })
    }

    select(poiid, detail, zoomOffset = 0) {					// Map move to PoiId & Zoom(config)
        return new Promise((resolve, reject) => {
            let zoomlv = Math.max(mapLibre.getZoom(true), Conf.map.detailZoom) + zoomOffset
            let poi = poiCont.get_osmid(poiid)
            if (poi == undefined) {
                let act = poiCont.get_actid(poiid);
                if (act !== undefined) poi = poiCont.get_osmid(act.osmid)
            }
            if (poi !== undefined) {	// Poiが見つかった場合
                geoCont.flashPolygon(poi.geojson)
                if (detail) {
                    cMapMaker.viewDetail(poi.geojson.id).then(() => {
                        mapLibre.flyTo(poi.lnglat, zoomlv)
                        geoCont.flashPolygon(poi.geojson)
                        geoCont.writePoiCircle(poi.geojson)
                        resolve()
                    })
                } else {
                    mapLibre.flyTo(poi.lnglat, zoomlv)
                    resolve()
                }
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
