"use strict"

// PoiData Control
class PoiCont {

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

    pois() { return { pois: poiCont.pdata, acts: poiCont.adata, lnglats: poiCont.lnglats } };

    // Conf.view.poiZoomのtargetを返す(edit時はpoiEditも合成)
    getTargets() {
        let targets = Object.keys(Conf.view.poiZoom)
        targets = Conf.etc.editMode ? targets.concat(Object.keys(Conf.view.editZoom)) : targets	// 編集時はeditZoom追加
        return [...new Set(targets)];
    }

    delete_all() { poiCont.pdata = { geojson: [], targets: [] } };

    setActdata(json) { poiCont.adata = json };		// set GoogleSpreadSheetから帰ってきたJson

    setActlnglat() {								// set Act LngLat by OSMID
        poiCont.adata.forEach((act) => {
            let osmdata = poiCont.get_osmid(act.osmid)
            if (osmdata !== undefined) {
                act.lnglat = osmdata.lnglat
                //} else {
                //    console.log("setActlnglat: no load osm data: " + act.osmid)
            }
        })
    }

    addGeojson(pois) {								// add geojson pois / pois: {geojson: [],targets: []}
        let children = []
        pois.geojson.forEach((node, node_idx) => {			// 既存Poiに追加
            let poi = { "geojson": pois.geojson[node_idx], "targets": pois.targets[node_idx] }
            poiCont.set_geojson(poi)
            if (poiCont.lnglats[node.id] == undefined) {	// 初期登録時
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

    set_geojson(poi) {								// addGeojsonのサブ機能
        let cidx = poiCont.pdata.geojson.findIndex((val) => val.id == poi.geojson.id);
        if (cidx === -1) {       	                   	// 無い時は追加
            poiCont.pdata.geojson.push(poi.geojson);
            poiCont.pdata.targets.push(poi.targets);
            cidx = poiCont.pdata.targets.length - 1;
        } else if (poiCont.pdata.targets[cidx].indexOf(poi.targets) > -1) {
            poiCont.pdata.targets[cidx].push(poi.targets);
        };
    };

    get_parent(osmid) { return poiCont.parent[osmid]; };		// osmidを元に親geojson全体を返す

    get_osmid(osmid) {           								// osmidを元にgeojsonと緯度経度、targetを返す
        let idx = poiCont.geoidx[osmid];
        return idx == undefined ? undefined : {
            geojson: poiCont.pdata.geojson[idx], lnglat: poiCont.lnglats[osmid], targets: poiCont.pdata.targets[idx]
        };
    };

    get_actid(actid) {
        let act = poiCont.adata.filter(line => actid == line.id);
        return act == undefined ? undefined : act[0];
    };
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
            console.log("poiMarker: getCatnames: no key: " + mainkey + "," + mainval + " / " + tags.id);
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
            case "":
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
        let tars = [], lls = [];
        let geojson = poiCont.pdata.geojson.filter((geojson_val, geojson_idx) => {
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
                    } else {
                        data.push(tags[key] == undefined ? "-" : tags[key])			// osmtag追加
                    }
                })
                data.push(names[2] + (names[3] !== "" ? `,${names[3]}` : ""))		    // カテゴリ名の元タグ(サブも)を追加
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
}

class PoiMarker {

    #markers = {};
    #osmpois = [];		// アイコン表示させたOSMIDリスト

    get_icon(tags) {		// get icon filename
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
    // params{ target, actonly, flist } / flist指定時はtargetを無視
    setPoi(target, actonly, flist) {

        const checkMarker = function (poi, LL, zoomlv) {
            let params = {}
            if (geoCont.checkInner(poi.lnglat, LL)) {
                let actlists = poiCont.getActlistByOsmid(poi.geojson.id)
                let viewflag = (actonly && actlists.length > 0) ? true : !actonly
                let tg1 = actlists.length > 0 ? [Conf.google.targetName] : poi.targets		// activity or target指定
                let tg2 = tg1.filter(item => poiCont.getTargets().includes(item))	// 重複targetsを取得
                let tgv = false
                for (let tg3 of tg2) { if (zoomlv >= Conf.view.poiZoom[tg3] || zoomlv >= Conf.view.editZoom[tg3]) tgv = true }	// ズーム範囲内がチェック
                if (viewflag && !poiMarker.#osmpois.includes(poi.geojson.id) && tgv) {		// act ok and 未表示の場合
                    params = { id: poi.geojson.id, target: target, poi: poi, langname: 'name', actlists: actlists }
                }
            }
            return params
        }

        const makeMarker = function (params) {		// Make Marker(Sometimes multiple markers are returned)
            if (params.poi.geojson.id == "node/5502987824") {
                console.log("makeMarker: " + params.poi.geojson.id)
            }
            return new Promise((resolve, reject) => {
                let tags = params.poi.geojson.properties.tags == null ? params.poi.geojson.properties : params.poi.geojson.properties.tags;
                let wiki = tags.wikipedia;
                let name = tags[params.langname] == null ? tags.name : tags[params.langname];
                name = tags["bridge:name"] == null ? name : tags["bridge:name"];	// 橋の名称があれば優先
                name = (name == "" || name == null) ? "" : name;
                let actlists = poiCont.getActlistByOsmid(params.poi.geojson.id);
                params.html = `<div class="d-flex flex-column align-items-center">`;
                params.span_width = name !== "" ? name.length * Conf.effect.text.size : 0;
                let css_name = actlists.length > 0 ? "attention" : (wiki != undefined ? "middle" : "normal");
                params.size = Conf.icon[css_name];
                params.html += `<img class="${css_name}" src="./${Conf.icon.path}/${poiMarker.get_icon(tags)}" icon-name="${name}" onclick="cMapMaker.viewDetail('${params.poi.geojson.id}')">`;
                let span = `<span class="${css_name} fs-${Conf.effect.text.size}">${name}</span>`;
                if (name !== "" && Conf.effect.text.view) params.html += span;
                //console.log("makeMaker: " + name)
                resolve([mapLibre.addMarker(params)]);
            });
        };

        const saveMarker = function (params) {
            if (poiMarker.#osmpois.indexOf(params.poi.geojson.id) == -1) {
                poiMarker.#osmpois.push(params.poi.geojson.id);
                makeMarker(params).then(marker => {
                    if (marker !== null) marker.forEach(val => poiMarker.#markers[target].push(val));	// 複数Marker対応
                });
            }
        };

        let zoomlv = mapLibre.getZoom(true);
        let LL = mapLibre.get_LL();
        console.log("poiMarker: setPoi: target=" + target);
        if (flist !== undefined) {	// set flist
            console.log("poiMarker: setPoi: " + flist.length + " counts");
            target = "flist";
            poiMarker.delete_all();
            poiMarker.#markers.flist = [];
            flist.forEach(list => {
                let inActs = Object.keys(Conf.activities).indexOf(list[0].split("/")[0]);
                let osmid = inActs > -1 ? poiCont.get_actid(list[0]).osmid : list[0];
                let poi = poiCont.get_osmid(osmid);
                if (poi !== undefined) {
                    let params = checkMarker(poi, LL, zoomlv);
                    if (Object.keys(params).length > 0) saveMarker(params);
                } else {
                    console.log("poiMarker: no load osm data: " + list[0]);
                };
            });
        } else {					// set target(activityはマーカーを手間表示で後回し)
            let org_target = target, poisOrder = []
            let targets = poiCont.getTargets()	// editZoomとpoiZoomを足す
            target = target == "-" ? "" : target
            if (target !== "") target = (targets.indexOf(target) > -1) ? target : "activity";
            console.log("poiMarker: set: " + target);
            poiMarker.delete(target);
            poiMarker.#markers[target] = [];
            let all = poiCont.getTarget(target);
            if (all.pois.geojson !== undefined) {	// pois表示
                all.pois.geojson.forEach(function (geojson, idx) {
                    let poi = { "geojson": geojson, "targets": all.pois.targets[idx], "lnglat": all.pois.lnglat[idx] };
                    let params = checkMarker(poi, LL, zoomlv);
                    if (Object.keys(params).length > 0 && params.actlists.length == 0) {		// check ok(params内容あり)
                        poisOrder.push(params)
                    };
                });
            }
            if (all.acts.length > 0) {				// acts表示
                all.acts.forEach((act) => {
                    if (!poiMarker.#osmpois.includes(act.osmid)) {
                        let osm = poiCont.get_osmid(act.osmid);
                        if (osm !== undefined && (act.category == org_target || org_target == "activity")) {
                            let poi = { "geojson": osm.geojson, "targets": osm.targets, "lnglat": osm.lnglat };
                            let params = { target: target, poi: poi, langname: 'name' };
                            if (geoCont.checkInner(poi.lnglat, LL)) poisOrder.unshift(params);
                            //} else {
                            //    console.log("poiMarker: no load osm data: " + act.osmid);
                        };
                    }
                });
            };
            poisOrder.forEach(params => saveMarker(params))
        };
    };

    get_osmid(osmid) {				// Poi取得
        let marker = undefined;
        for (let target of poiCont.getTargets()) {
            if (poiMarker.#markers[target] !== undefined) {
                let idx = poiMarker.#markers[target].findIndex(val => val.mapmaker_id == osmid);
                if (idx > -1) marker = poiMarker.#markers[target][idx]; break;
            }
            if (marker !== undefined) break;
        };
        return marker;
    }

    select(poiid, detail) {								// Map move to PoiId & Zoom(config)
        return new Promise((resolve, reject) => {
            let zoomlv = Math.max(mapLibre.getZoom(true), Conf.map.modalZoom);
            let poi = poiCont.get_osmid(poiid);
            if (poi == undefined) {
                let act = poiCont.get_actid(poiid);
                if (act !== undefined) poi = poiCont.get_osmid(act.osmid);
            }
            if (poi !== undefined) {	// Poiが見つかった場合
                mapLibre.flyTo(poi.lnglat, zoomlv);
                if (detail) cMapMaker.viewDetail(poi.geojson.id);
                resolve();
            } else {					// Poiが見つからなかった場合
                winCont.spinner(true);
                overPassCont.getOsmIds([poi.osmid]).then((geojson) => {
                    poiCont.addGeojson(geojson);
                    osmid = poiCont.get_osmid(poi.osmid);
                    mapLibre.flyTo({ center: osmid.lnglat }, zoomlv);
                    if (detail) cMapMaker.viewDetail(poi.osmid);
                    winCont.spinner(false);
                    resolve();
                }).catch((e) => {
                    console.log("poiMarker: Error: " + e);
                    winCont.spinner(false);
                    reject();
                });
            }
        });
    }

    delete_all() {
        poiCont.getTargets().forEach((target) => poiMarker.delete(target));
        poiMarker.delete("flist");
        poiMarker.#osmpois = [];
    }

    delete(target, osmid) {					// Marker delete * don't set pdata
        if (osmid == null || osmid == "") {	// all osmid
            if (poiMarker.#markers[target] !== undefined) {
                poiMarker.#markers[target].forEach(marker => {
                    poiMarker.#osmpois = poiMarker.#osmpois.filter(n => n !== marker.mapmaker_id);
                    mapLibre.delMaker(marker);
                });
                poiMarker.#markers[target] = [];
            };
        } else {									// delete osmid
            let idx = poiMarker.#markers[target].findIndex(vals => {
                let val = vals.length == undefined ? vals : vals[0];
                return val.mapmaker_id == osmid;
            });
            poiMarker.#osmpois = poiMarker.#osmpois.filter(n => n !== poiMarker.#markers[target][idx].mapmaker_id);
            mapLibre.delMaker(poiMarker.#markers[target][idx]);
        };
    }
};
