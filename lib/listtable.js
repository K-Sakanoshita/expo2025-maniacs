"use strict";

// listTable管理(イベントやPoi情報を表示)
class ListTable {
    #list;
    #flist;
    #displayList;
    #activityCountById;
    #categorys;
    #rowRecordById;
    #hoveredListId = null;
    #fallbackNameIds = new Set();

    // dataListに必要な初期化
    init() {
        console.log("listTable: init.")
        this.lock = false		// true then disable listtable
        this.#list = []			// リストデータ本体
        this.#flist = [];
        this.#displayList = [];
        this.#activityCountById = new Map();
        this.#rowRecordById = new Map();
        this.#categorys;
        this.areaFilterActive = false;
        this.currentView = Conf.listTable?.viewBindings?.default ?? Conf.listTable?.defaultView ?? "";
        this.displayMode = "nearby";
        this.externalItems = [];

        // カードクリックイベント
        this.lock = false;
        const listArea = document.getElementById("listArea");
        listArea.addEventListener("click", (event) => {
            if (event.target.closest(".list-group-item")?.dataset.id?.startsWith("mock/")) {
                event.preventDefault();
                return;
            }
            const statusButton = event.target.closest(".list-status-button");
            if (statusButton) {
                event.preventDefault();
                event.stopPropagation();
                const id = statusButton.closest(".list-group-item")?.dataset.id;
                if (id) {
                    const status = poiStatusCont.getRecord(id);
                    const visited = statusButton.classList.contains("list-visited") ? !status.visited : status.visited;
                    const favorite = statusButton.classList.contains("list-favorite") ? !status.favorite : status.favorite;
                    poiStatusCont.setValueByOSMID(id, visited, favorite, status.memo);
                    this.renderList();
                    cMapMaker.viewPoi(this.getSelCategory());
                }
                return;
            }
            const item = event.target.closest(".list-group-item");
            if (!item || !listArea.contains(item)) return;
            if (this.lock) return;
            this.lock = true;
            this.select(item.dataset.id);
        });
        listArea.addEventListener("mouseover", (event) => {
            if (!window.matchMedia("(min-width: 768px) and (hover: hover) and (pointer: fine)").matches) return;
            const item = event.target.closest(".list-group-item");
            if (!item || !listArea.contains(item) || item.contains(event.relatedTarget)) return;
            this.#showHoverCircle(item.dataset.id);
        });
        listArea.addEventListener("mouseout", (event) => {
            const item = event.target.closest(".list-group-item");
            if (item && !item.contains(event.relatedTarget)) this.#clearHoverCircle();
        });
    }

    #showHoverCircle(id) {
        if (this.#hoveredListId === id) return;
        this.#clearHoverCircle();
        const poi = poiCont.get_osmid(id) ?? poiCont.get_osmid(poiCont.get_actid(id)?.osmid);
        const coordinates = poi?.lnglat;
        const map = mapLibre.map;
        if (!map || !coordinates) return;
        const sourceId = "list-hover-circle-source";
        const layerId = "list-hover-circle-layer";
        map.addSource(sourceId, {
            type: "geojson",
            data: { type: "Point", coordinates }
        });
        map.addLayer({
            id: layerId,
            type: "circle",
            source: sourceId,
            paint: {
                "circle-radius": Conf.map.pointMarkerRadius ?? 48,
                "circle-color": Conf.map.polygonMarker["fill-color"],
                "circle-opacity": Conf.map.polygonMarker["fill-opacity"]
            }
        });
        this.#hoveredListId = id;
    }

    #clearHoverCircle() {
        this.#hoveredListId = null;
        const map = mapLibre.map;
        if (!map) return;
        if (map.getLayer("list-hover-circle-layer")) map.removeLayer("list-hover-circle-layer");
        if (map.getSource("list-hover-circle-source")) map.removeSource("list-hover-circle-source");
    }

    // 現在選択しているカテゴリを返す(表示とvalueが違う場合はvalue)
    getSelCategory() {
        return list_category.value.split(",")
    }

    // 表示しているリストを返す
    getFilterList() {
        return this.#flist
    }

    // 表示行はActivity IDとは限らない。敷地に集約された投稿も画像候補に含める。
    getThumbnailActivities(rows = this.#flist) {
        const bounds = mapLibre.get_LL();
        const byId = new Map();
        const byOsmid = new Map();
        for (const activity of poiCont.pois().acts ?? []) {
            byId.set(activity.id, activity);
            if (!byOsmid.has(activity.osmid)) byOsmid.set(activity.osmid, []);
            byOsmid.get(activity.osmid).push(activity);
        }
        const result = new Map();
        for (const [id] of rows) {
            const record = this.#rowRecordById.get(String(id));
            const direct = byId.get(id);
            const activities = direct ? [direct] : [
                ...(record?.activities ?? []),
                ...(byOsmid.get(record?.areaId ?? id) ?? [])
            ];
            for (const activity of activities) {
                const osm = poiCont.get_osmid(activity.osmid);
                const visibleTargets = (osm?.targets ?? []).filter(target =>
                    Conf.osm?.[target]?.expression?.poiView === true
                    && Number.isFinite(cMapMaker.getPoiZoom(target)));
                const targets = visibleTargets.length ? visibleTargets
                    : osm ? [] : [Conf.activity?.targetName ?? "activity"];
                if (!targets.some(target => mapLibre.getZoom(false) >= cMapMaker.getPoiZoom(target))) continue;
                const lnglat = osm?.lnglat ?? activity.lnglat;
                // 検索結果は全地域を含む場合があるが、画像は現在の表示範囲に限定する。
                // 位置が未取得の投稿も、遠近を判定できないため表示しない。
                if (!bounds || !Array.isArray(lnglat) || lnglat.length < 2
                    || !lnglat.slice(0, 2).every(Number.isFinite)
                    || !geoCont.checkInner(lnglat, bounds)) continue;
                result.set(activity.id, activity);
            }
        }
        return [...result.values()];
    }

    // 表示対象のOSM施設から、Commonsの単一画像だけを取得する。
    getThumbnailOsmImages() {
        const bounds = mapLibre.get_LL();
        const zoom = mapLibre.getZoom(false);
        const result = new Map();
        for (const [id] of this.getMarkerList()) {
            const osm = poiCont.get_osmid(id);
            const tags = osm?.geojson?.properties;
            const file = String(tags?.wikimedia_commons ?? '').trim();
            if (!file.startsWith('File:') || !file.slice(5).trim()) continue;
            if (!(osm.targets ?? []).some(target =>
                Conf.osm?.[target]?.expression?.poiView === true
                && zoom >= cMapMaker.getPoiZoom(target))) continue;
            const lnglat = osm.lnglat;
            if (!bounds || !Array.isArray(lnglat) || lnglat.length < 2
                || !lnglat.slice(0, 2).every(Number.isFinite)
                || !geoCont.checkInner(lnglat, bounds)) continue;
            result.set(id, {
                src: [file], osmid: id,
                title: poiCont.getOSMname(tags, glot.lang) || poiCont.getCatnames(tags)[0]
            });
        }
        return [...result.values()];
    }

    // 地図描画用の行を返す。敷地ビューでは親敷地と紐づく地物を展開する。
    getMarkerList() {
        if (this.getViewConfig()?.source !== "areaFeatureLinker") return this.#flist;

        const rows = [];
        const usedIds = new Set();
        const selected = this.getSelCategory();
        const categoryTag = selected[0] === "tags" ? (selected[1] ?? "").replace(".", "=") : "";
        const zoom = mapLibre.getZoom(false);
        const addRow = (id, parentId = null, isFilteredArea = false) => {
            const normalizedId = String(id ?? "");
            if (!normalizedId || usedIds.has(normalizedId)) return;
            // The area row has already passed the list category filter. Keep its
            // marker even though the matching tag belongs to a linked feature.
            if (categoryTag && !isFilteredArea) {
                const poi = poiCont.get_osmid(normalizedId);
                const feature = poi?.geojson;
                if (!feature) return;
                const category = poiCont.getCatnames(feature.properties ?? {});
                if (category[2] !== categoryTag && category[3] !== categoryTag) return;
                const fallbackTargets = Conf.areaFeatureLinker?.parentMarkerBelowZoomTargets ?? [];
                const equipmentTargets = (poi.targets ?? []).filter(target =>
                    fallbackTargets.includes(target));
                if (parentId && equipmentTargets.length && !equipmentTargets.some(target =>
                    zoom >= cMapMaker.getPoiZoom(target))) {
                    // 遊具・設備の表示ズーム未満では、それを含む公園を代表表示する。
                    if (!usedIds.has(parentId)) {
                        usedIds.add(parentId);
                        rows.push([parentId]);
                    }
                    return;
                }
            }
            usedIds.add(normalizedId);
            rows.push([normalizedId]);
        };

        this.#flist.forEach(row => {
            const record = this.#rowRecordById.get(String(row[0]));
            addRow(record?.areaId ?? row[0], null, true);
            (record?.linkedFeatures ?? []).forEach(feature => addRow(feature.featureId, record.areaId));
        });
        if (!this.areaFilterActive
            && Conf.areaFeatureLinker?.mapMode === "allVisibleFeatures") {
            this.#makeAllVisibleMarkerRows().forEach(row => {
                const id = String(row[0] ?? "");
                if (!id || window.areaFeatureLinker?.isAreaId(id)) return;
                if (window.areaFeatureLinker?.resolveAreaId(id) !== id) return;
                addRow(id);
            });
        }
        return rows;
    }

    // 敷地単位のリストとは独立して、通常のPOI表示条件を満たす地物を地図へ渡す。
    #makeAllVisibleMarkerRows() {
        const rows = this.#makePoiRows();
        const categories = this.getSelCategory();
        const isTags = categories[0] === "tags";
        const fieldName = Conf.listTable.category === "activity" ? "actFields" : "poiFields";
        const categoryColumn = isTags
            ? Conf.list.columns.poiFields.length
            : Conf.list.columns[fieldName].indexOf("category");
        const keyword = isTags
            ? (categories[1] || "").replace(".", "=")
            : categories[categories.length - 1];
        const filtered = keyword && keyword !== "-"
            ? this.#filter(rows, keyword, categoryColumn, null)
            : rows;
        return filtered.map(row => [row[0]]);
    }

    // 画面に表示しているリストを返す（Activity集約設定を反映）
    getDisplayList() {
        return this.#displayList
    }

    // 表示しているリスト数を返す
    getFlistCount() {
        return this.#displayList.length
    }

    getCurrentView() {
        return this.currentView;
    }

    setDisplayMode(mode) {
        if (!["nearby", "favorite", "recent", "changes"].includes(mode)) return;
        this.displayMode = mode;
        cMapMaker.favoriteFilter = false;
        this.renderList();
    }

    showExternalRows(items) {
        this.externalItems = Array.isArray(items) ? items : [];
        this.setDisplayMode("changes");
    }

    recentKey() { return `${Conf.etc.localSave || "cmapmaker"}-recent`; }

    getRecent() {
        if (!Conf.etc?.localSave) return [];
        try {
            const records = JSON.parse(localStorage.getItem(this.recentKey()) || "[]");
            return Array.isArray(records) ? records.filter(item => item && typeof item.id === "string"
                && Number.isFinite(Date.parse(item.viewedAt))) : [];
        } catch { return []; }
    }

    recordView(id, name) {
        if (!id || !Conf.etc?.localSave) return;
        try {
            const records = this.getRecent().filter(item => item.id !== id);
            records.unshift({ id, name: String(name || "").trim(), viewedAt: new Date().toISOString() });
            localStorage.setItem(this.recentKey(), JSON.stringify(records.slice(0, 30)));
            if (this.displayMode === "recent") this.renderList();
        } catch { /* localStorage may be unavailable */ }
    }

    getViewConfig(name = this.currentView) {
        return Conf.list?.views?.[name];
    }

    setViewBinding(binding) {
        const nextView = Conf.listTable?.viewBindings?.[binding] ?? binding;
        if (nextView === this.currentView) return false;
        this.currentView = nextView;
        this.#rowRecordById = new Map();
        return true;
    }

    refreshDerivedValues() {
        if (!this.getViewConfig()) return;
        this.makeList();
        this.filterByPoiStatus(cMapMaker.visitedFilterStatus, cMapMaker.favoriteFilter);
    }

    getExportData() {
        if (Conf.listTable?.exportSource === "poi") {
            let rows = this.#makePoiRows();
            const keyword = String(list_keyword?.value ?? "").trim();
            if (keyword) rows = this.#filter(rows, keyword, -1, null);
            const exportRows = rows.map(row => {
                const copy = [...row];
                copy.push(...(poiCont.getLnglatbyId(copy[0]) ?? ["", ""]));
                return copy;
            });
            return [[...(Conf.listTable.csvColumn ?? [])], ...exportRows];
        }

        const view = this.getViewConfig();
        const exportColumns = view?.export?.columns;
        if (Array.isArray(exportColumns) && exportColumns.length) {
            const rows = this.#flist.map(row => {
                const record = this.#rowRecordById.get(String(row[0]));
                return exportColumns.map(column => this.#formatRecordValue(record, this.#mergeColumnOptions(column, view), view));
            });
            return [exportColumns.map(column => String(column.label ?? column.id ?? column.value ?? "")), ...rows];
        }

        const rows = this.#flist.map(row => {
            const copy = [...row];
            copy.push(...(poiCont.getLnglatbyId(copy[0]) ?? ["", ""]));
            return copy;
        });
        return [[...(Conf.listTable.csvColumn ?? [])], ...rows];
    }

    // 無効化(選択できなくする or 有効化)
    disabled(mode) {
        list_category.disabled = mode
        list_keyword.disabled = mode
        this.lock = mode
    }

    // make Select list
    makeSelectList(target) {
        //let oldselect = list_category.value == "" ? Conf.selectItem.default : list_category.value;
        let oldselect = list_category.value;
        let domSel = [];
        this.#categorys = [["-", ""]];

        if (this.getViewConfig() && target === "tags") {
            const structuredShowAutoOption = Conf.selectItem?.showAutoOption !== false;
            winCont.clearSelect(`list_category`, structuredShowAutoOption);
            const categories = new Map();
            const bounds = mapLibre.get_LL();
            for (const record of this.#rowRecordById.values()) {
                const features = [record.feature, ...(record.linkedFeatures ?? []).map(item => item.feature)];
                for (const feature of features) {
                    if (!feature) continue;
                    const id = feature.properties?.id ?? feature.id;
                    const lnglat = poiCont.get_osmid(id)?.lnglat;
                    if (!bounds || !lnglat || !geoCont.checkInner(lnglat, bounds)) continue;
                    const [main, sub, mainTag, subTag] = poiCont.getCatnames(feature.properties ?? {});
                    for (const [label, tag] of [[main, mainTag], [sub, subTag]]) {
                        if (label && tag && tag !== "*=*") categories.set(`tags,${tag.replace("=", ".")}`, label);
                    }
                }
            }
            for (const [value, label] of [...categories].sort((a, b) => a[1].localeCompare(b[1]))) {
                winCont.addSelect("list_category", label, value);
                this.#categorys.push([label, value]);
            }
            list_category.value = categories.has(oldselect) ? oldselect : "";
            if (!structuredShowAutoOption && !list_category.value && list_category.options.length) {
                list_category.value = list_category.options[0].value;
            }
            return;
        }

        const showAutoOption = Conf.selectItem?.showAutoOption !== false;
        winCont.clearSelect(`list_category`, showAutoOption);
        switch (target) {
            case "activity":	// アクティビティリストのカテゴリを表示
                let acts = new Map;
                for (const act of poiCont.pois().acts) {
                    if (act.category !== "") {
                        act.category.split(",").forEach(cat => acts.set(cat, true)); // 同じキーに何度も値を設定しても問題ない
                    }
                }
                acts = Array.from(acts.keys())
                for (const category of acts) {
                    if (category !== "") {
                        domSel.push([category, category])
                        this.#categorys.push(["activity", category])
                    }
                }
                domSel = domSel.sort();
                break
            case "tags":		// タグからカテゴリを表示
                let pois = this.#list.map(data => {
                    let rets = []
                    data.forEach(col => rets.push(col == undefined ? "" : col))
                    return rets
                })
                pois = [...new Set(pois.map(JSON.stringify))].map(JSON.parse)       // 重複削除
                let categoryCol = Conf.list.columns.poiFields.indexOf("#category")  // #categoryの場所を探す
                pois.filter(Boolean).sort().map(poi => {
                    let poiview = false;
                    poi[poi.length - 2].forEach(a => {  // カテゴリの追加が必要ならpoiview = true
                        if (Conf.osm[a] !== undefined && Conf.poiView.poiZoom[a] !== undefined) {
                            poiview = Conf.osm[a].expression.poiView ? true : poiview;
                        }
                    })
                    if (poiview) {
                        let kv = target + "," + poi[poi.length - 3].replace("=", ".")
                        domSel.push([poi[categoryCol], kv])
                        if (!this.#categorys.some(category => category[1] === kv)) {
                            this.#categorys.push([poi[categoryCol], kv])
                        }
                    }
                })
                domSel = domSel.sort();
                break
            case "menu":        // メニューからカテゴリを表示
                Object.keys(Conf.selectItem.menu).forEach((key) => {
                    domSel.push([key, Conf.selectItem.menu[key]])
                    this.#categorys.push([key, Conf.selectItem.menu[key]])
                })
                break
        }
        domSel.forEach(sel => winCont.addSelect(`list_category`, sel[0], sel[1]))
        const selectedValue = oldselect || (!showAutoOption ? Conf.selectItem?.default : "");
        list_category.value = selectedValue;
        if (!showAutoOption && list_category.value === "" && list_category.options.length > 0) {
            list_category.value = list_category.options[0].value;
        }
        this.#categorys = basic.uniq(this.#categorys)
    }

    // リスト作成
    makeList(render = true) {
        const view = this.getViewConfig();
        if (view?.source === "areaFeatureLinker") {
            this.#list = this.#makeAreaRows(view);
            this.#flist = this.#applyAreaFilter(this.#filterAreaCategory(this.#list, this.getSelCategory()));
            const keyword = String(list_keyword?.value ?? "").trim();
            if (keyword) this.#flist = this.#filter(this.#flist, keyword, -1);
            if (render) this.makeListArea(this.#flist);
            return;
        }

        this.#rowRecordById = new Map();
        this.#list = this.#makePoiRows();
        let categorys = this.getSelCategory(), keyword = "";
        if (categorys[0] == "tags") {
            keyword = categorys[1].replace(".", "=")    // タグ時はtagを元に戻す
        } else {
            keyword = categorys[categorys.length - 1]   // 配列時は最後のデータをキーワード
        }
        let fieldName = Conf.listTable.category == "activity" ? "actFields" : "poiFields"
        // Manual menu values refer to target names, stored after the category tags.
        let ccol = Conf.list.columns[fieldName].length + (Conf.listTable.category === "menu" ? 1 : 0);
        this.#flist = this.#applyAreaFilter(this.#filter(this.#list, keyword, ccol));	    // カテゴリ名でフィルタ
        const searchKeyword = String(globalThis.list_keyword?.value ?? "").trim();
        if (searchKeyword) this.#flist = this.#filter(this.#flist, searchKeyword, -1);
        if (render) this.makeListArea(this.#flist);
    };

    #makePoiRows() {
        this.#fallbackNameIds.clear();
        let targets = []
        switch (Conf.listTable.target) {
            case "targets":
                targets = poiCont.getTargets().filter(target => {                                                    // poiView=trueのみ返す
                    return Conf.osm[target] !== undefined ? Conf.osm[target].expression.poiView : false;
                })
                break
            case "activity": targets = ["activity"]; break
            default:
                targets = Object.keys(Conf.osm).filter(key => Conf.osm[key].expression?.poiView === true); // リストに掲載するPoi種別
                targets.push("activity")
                break
        }
        const rows = poiCont.makeList(targets, Conf.listTable.allActs); // 全て表示時はtrue
        let already = {};	// 重複するidは最初だけに絞るとしたが、(2025/11/09)
        return rows.filter(row => {
            already[row[0]] = already[row[0]] !== undefined ? false : true;
            return already[row[0]];
        }).map(row => {
            const nameColumn = this.#nameColumn();
            if (Conf.listTable.nameFallback !== "category" || nameColumn < 0
                || String(row[nameColumn] ?? "").trim()) return row;
            const copy = [...row];
            copy[nameColumn] = this.#fallbackName(row[0]);
            this.#fallbackNameIds.add(String(row[0]));
            return copy;
        });
    }

    #nameColumn() {
        const fields = Conf.listTable.category === "activity"
            ? Conf.list.columns.actFields : Conf.list.columns.poiFields;
        const index = (fields ?? []).findIndex(field => field === "name" || field === "#name");
        return index < 0 ? -1 : index;
    }

    #fallbackName(id) {
        const activity = poiCont.get_actid?.(id);
        const tags = (poiCont.get_osmid(id) ?? poiCont.get_osmid(activity?.osmid))?.geojson?.properties;
        const category = String(poiCont.getCatnames?.(tags ?? {})?.[0] ?? "").trim();
        return category && category !== "-" && category !== glot.get("undefined")
            ? category : glot.get("listUnnamed");
    }

    #makeAreaRows(view) {
        const rowId = String(view.rowId ?? "areaId");
        const columns = Array.isArray(view.columns) ? view.columns : [];
        const records = this.#sortAreaRecords([...(window.areaSearchController?.listRecords
            ?? window.areaFeatureLinker?.records ?? [])], view);
        this.#rowRecordById = new Map();

        return records.map(record => {
            const id = String(record?.[rowId] ?? "");
            this.#rowRecordById.set(id, record);
            const values = columns.map(column => this.#formatRecordValue(record, column, view));
            const area = poiCont.get_osmid(id);
            const featureCategories = (record.linkedFeatures ?? []).flatMap(item => {
                const category = poiCont.getCatnames(item.feature?.properties ?? {});
                return [category[2], category[3]].filter(Boolean);
            });
            const areaCategory = poiCont.getCatnames(record.feature?.properties ?? {});
            const categoryData = [...new Set([areaCategory[2], areaCategory[3], ...featureCategories].filter(Boolean))].join(",");
            const targets = [...(area?.targets ?? [])];
            const icon = poiCont.getIcon(record.feature?.properties ?? {});
            return [id, ...values, categoryData, targets, icon];
        });
    }

    #mergeColumnOptions(column, view) {
        const displayColumn = view?.columns?.find(item => item.value === column.value && item.formatter === column.formatter)
            ?? view?.columns?.find(item => item.value === column.value)
            ?? {};
        return {
            ...displayColumn,
            ...column,
            options: { ...(displayColumn.options ?? {}), ...(column.options ?? {}) }
        };
    }

    #formatRecordValue(record, column, view) {
        if (!record) return "";
        const formatter = String(column.formatter ?? "text");
        if (formatter === "featureList") return this.#formatFeatureList(record, column.options ?? {});
        if (formatter === "distance") return this.#formatDistance(record, column.options ?? {});
        const value = record?.[column.value];
        if (value == null) return "";
        return Array.isArray(value) ? value.join(String(column.options?.separator ?? "・")) : String(value);
    }

    #formatFeatureList(record, options) {
        const configuredTargets = Array.isArray(options.targets)
            ? new Set(options.targets.map(String))
            : null;
        const labelMode = String(options.label ?? "nameOrCategory");
        let labels = (record.linkedFeatures ?? []).filter(item => {
            if (options.excludeAmenities?.includes(item.feature?.properties?.amenity)) return false;
            if (!configuredTargets?.size) return true;
            return (item.targets ?? []).some(target => configuredTargets.has(String(target)));
        }).map(item => {
            const tags = item.feature?.properties ?? {};
            const name = poiCont.getOSMname(tags, glot.lang);
            const category = poiCont.getCatnames(tags);
            const categoryName = category[1] || category[0] || "";
            if (labelMode === "name") return name;
            if (labelMode === "category") return categoryName;
            return name || categoryName;
        }).filter(Boolean);

        if (options.unique !== false) labels = [...new Set(labels)];
        const maxItems = Number(options.maxItems);
        if (Number.isFinite(maxItems) && maxItems >= 0 && labels.length > maxItems) {
            const remaining = labels.length - maxItems;
            labels = labels.slice(0, maxItems);
            labels.push(String((options.moreLabelKey ? glot.get(options.moreLabelKey) : options.moreLabel) ?? "+{count}").replace("{count}", String(remaining)));
        }
        return labels.join(String(options.separator ?? "・"));
    }

    #distanceMeters(record, options) {
        let origin = null;
        if (options.origin === "mapCenter") {
            const center = mapLibre.map?.getCenter?.();
            if (center) origin = [center.lng, center.lat];
        } else {
            origin = mapLibre.getUserLocation?.();
            if (!origin && options.unavailable === "mapCenter") {
                const center = mapLibre.map?.getCenter?.();
                if (center) origin = [center.lng, center.lat];
            }
        }
        if (!origin || !Number.isFinite(Number(record.lng)) || !Number.isFinite(Number(record.lat))) return null;

        const toRadians = degrees => degrees * Math.PI / 180;
        const lat1 = toRadians(Number(origin[1]));
        const lat2 = toRadians(Number(record.lat));
        const deltaLat = lat2 - lat1;
        const deltaLng = toRadians(Number(record.lng) - Number(origin[0]));
        const a = Math.sin(deltaLat / 2) ** 2
            + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
        return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    #formatDistance(record, options) {
        const distance = this.#distanceMeters(record, options);
        if (distance == null) return "";
        const roundMeters = Number(options.roundMeters);
        const meters = Number.isFinite(roundMeters) && roundMeters > 0
            ? Math.round(distance / roundMeters) * roundMeters
            : Math.round(distance);
        const prefix = String(options.prefixGlotKey ? glot.get(options.prefixGlotKey) : options.prefix ?? "");
        const units = String(options.units ?? "auto");
        if (units === "kilometers" || (units === "auto" && meters >= 1000)) {
            const decimals = Math.max(0, Number(options.kilometerDecimals ?? 1));
            return `${prefix}${Number((meters / 1000).toFixed(decimals))}km`;
        }
        return `${prefix}${meters}m`;
    }

    #sortAreaRecords(records, view) {
        const rules = Array.isArray(view.sort) ? view.sort : [];
        if (!rules.length) return records;
        const indexed = records.map((record, index) => ({ record, index }));
        indexed.sort((left, right) => {
            for (const rule of rules) {
                const direction = rule.order === "desc" ? -1 : 1;
                const options = this.#mergeColumnOptions({ value: rule.value }, view).options ?? {};
                const leftValue = rule.value === "distance"
                    ? this.#distanceMeters(left.record, options)
                    : left.record?.[rule.value];
                const rightValue = rule.value === "distance"
                    ? this.#distanceMeters(right.record, options)
                    : right.record?.[rule.value];
                const leftMissing = leftValue == null || leftValue === "";
                const rightMissing = rightValue == null || rightValue === "";
                if (leftMissing !== rightMissing) return (rule.missing === "first" ? -1 : 1) * (leftMissing ? 1 : -1);
                if (leftMissing) continue;
                const comparison = typeof leftValue === "number" && typeof rightValue === "number"
                    ? leftValue - rightValue
                    : String(leftValue).localeCompare(String(rightValue), glot.lang);
                if (comparison !== 0) return comparison * direction;
            }
            return left.index - right.index;
        });
        return indexed.map(item => item.record);
    }

    // リストを作成
    makeListArea(flist) {
        const listArea = document.getElementById("listArea");
        this.#clearHoverCircle();
        listArea.innerHTML = ""; // 既存のカードをクリア

        let visibleRows = this.#makeDisplayList(flist);
        if (this.displayMode === "nearby" && this.getViewConfig()?.source === "areaFeatureLinker") {
            // The map canvas can extend behind the sidebar. Show only rows whose
            // representative marker is inside the part of the map actually visible.
            const map = mapLibre.map;
            const mapRect = map?.getContainer?.().getBoundingClientRect();
            const paneRect = document.getElementById("top-pane")?.getBoundingClientRect();
            // A maximized list hides the pane, but still represents the last map viewport.
            const clipRect = paneRect?.width > 0 && paneRect?.height > 0 ? paneRect : mapRect;
            if (mapRect && clipRect && map?.project) {
                const left = Math.max(mapRect.left, clipRect.left, 0);
                const right = Math.min(mapRect.right, clipRect.right, window.innerWidth);
                const top = Math.max(mapRect.top, clipRect.top, 0);
                const bottom = Math.min(mapRect.bottom, clipRect.bottom, window.innerHeight);
                visibleRows = visibleRows.filter(row => {
                    const id = String(row[0]);
                    const record = this.#rowRecordById.get(id);
                    const lnglat = poiCont.get_osmid(id)?.lnglat
                        ?? (record ? [record.lng, record.lat] : null);
                    if (!lnglat || !lnglat.slice(0, 2).every(Number.isFinite)) return false;
                    const point = map.project(lnglat);
                    const x = mapRect.left + point.x;
                    const y = mapRect.top + point.y;
                    return left <= x && x <= right && top <= y && y <= bottom;
                });
            }
        }
        if (this.displayMode === "changes") {
            visibleRows = this.externalItems.map(item => [
                `${item.type}/${item.id}`, item.name || `${item.type}/${item.id}`]);
        } else if (this.displayMode === "favorite") {
            visibleRows = visibleRows.filter(row => poiStatusCont.getRecord(String(row[0])).favorite);
        } else if (this.displayMode === "recent") {
            const order = new Map(this.getRecent().map((item, index) => [item.id, index]));
            visibleRows = visibleRows.filter(row => order.has(String(row[0])))
                .sort((a, b) => order.get(String(a[0])) - order.get(String(b[0])));
        }
        if (this.displayMode === "favorite" || this.displayMode === "recent") {
            let ids = [];
            try {
                ids = this.displayMode === "favorite"
                    ? poiStatusCont.getAllFavorite().map(([key]) => key.slice(`${Conf.etc.localSave}.`.length))
                    : this.getRecent().map(item => item.id);
            } catch { /* storage unavailable */ }
            const seen = new Set(visibleRows.map(row => String(row[0])));
            const keyword = String(list_keyword?.value ?? "").trim().toLowerCase();
            for (const id of ids) if (!seen.has(id)) {
                if (window.areaSearchController?.localOnly
                    && !window.areaSearchController.shouldIncludeListRow(id)) continue;
                const tags = poiCont.get_osmid(id)?.geojson?.properties;
                const recentName = this.displayMode === "recent"
                    ? this.getRecent().find(item => item.id === id)?.name : "";
                const name = (tags && (poiCont.getOSMname(tags, glot.lang)
                    || poiCont.getCatnames(tags)[0])) || recentName || glot.get("undefined");
                let displayName = name;
                if (Conf.listTable.nameFallback === "category" && tags
                    && !String(poiCont.getOSMname(tags, glot.lang) ?? "").trim()) {
                    displayName = this.#fallbackName(id);
                    this.#fallbackNameIds.add(String(id));
                }
                if (keyword && !`${displayName} ${id}`.toLowerCase().includes(keyword)) continue;
                visibleRows.push([id, displayName]);
                seen.add(id);
            }
            if (this.displayMode === "recent") {
                const order = new Map(ids.map((id, index) => [id, index]));
                visibleRows.sort((a, b) => order.get(String(a[0])) - order.get(String(b[0])));
            }
        }
        this.#displayList = visibleRows;
        const modeSelect = document.getElementById("listDisplayMode");
        if (modeSelect) modeSelect.value = this.displayMode === "changes" ? "nearby" : this.displayMode;
        const origin = document.getElementById("listDistanceOrigin");
        if (origin) origin.textContent = mapLibre.getUserLocation?.()
            ? glot.get("placeListFromLocation") : glot.get("placeListFromCenter");
        if (origin && window.areaSearchController?.localOnly) origin.textContent += ` · ${glot.get("discovery_loadedScope")}`;
        const modeButtons = document.querySelectorAll("[data-list-mode]");
        modeButtons.forEach(button => {
            const selected = button.dataset.listMode === this.displayMode;
            button.classList.toggle("active", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
        if (!visibleRows.length && (this.displayMode !== "nearby" || window.areaSearchController?.localOnly)) {
            const empty = document.createElement("p");
            empty.className = "p-3 text-muted";
            empty.textContent = glot.get(window.areaSearchController?.localOnly ? "discovery_noMatches"
                : this.displayMode === "favorite" ? "placeListNoFavorites" : "placeListNoRecent");
            listArea.appendChild(empty);
        }

        let listGroup = document.createElement("div");
        listGroup.className = "list-group";

        this.#displayList.forEach(row => {
            let list = document.createElement("a");
            list.dataset.id = row[0]; // OSMIDをdata-id属性に保存
            list.className = "list-group-item list-group-item-action";
            if (this.getViewConfig()?.source === "areaFeatureLinker") list.classList.add("list-area-item");
            list.href = "#"; // リンクとして機能させる

            let items = document.createElement("div");
            items.className = "row";
            list.appendChild(items);
            const toilets = (this.#rowRecordById.get(String(row[0]))?.linkedFeatures ?? [])
                .map(item => item.feature?.properties ?? {})
                .filter(tags => tags.amenity === "toilets");
            const status = poiStatusCont.getRecord(String(row[0]));
            if (!String(row[0]).startsWith("mock/")) for (const [kind, selected, icon, label] of [
                ["visited", status.visited, "circle-check", "visited"],
                ["favorite", status.favorite, "heart", "favorite"]
            ]) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = `poi-status-toggle list-status-button list-${kind} btn btn-sm`;
                button.innerHTML = `<i class="${selected ? "fa-solid" : "fa-regular"} fa-${icon} fa-fw" aria-hidden="true"></i>`;
                button.setAttribute("aria-label", glot.get(label));
                button.setAttribute("aria-pressed", String(Boolean(selected)));
                list.appendChild(button);
            }
            if (this.displayMode === "recent") {
                const viewed = this.getRecent().find(item => item.id === String(row[0]))?.viewedAt;
                if (viewed) {
                    const now = new Date();
                    const seenAt = new Date(viewed);
                    const dayStart = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
                    const days = Math.round((dayStart(now) - dayStart(seenAt)) / 86400000);
                    const stamp = document.createElement("small");
                    stamp.className = "text-muted d-block";
                    stamp.textContent = days <= 0 ? glot.get("placeListToday")
                        : days === 1 ? glot.get("placeListYesterday")
                            : days < 7 ? glot.get("placeListDaysAgo").replace("{days}", String(days))
                                : new Date(viewed).toLocaleDateString(glot.lang === "en" ? "en-US" : "ja-JP");
                    list.appendChild(stamp);
                }
            }

            const viewColumns = this.getViewConfig()?.columns ?? Conf.list.columns.style;
            const isFallbackName = this.#fallbackNameIds.has(String(row[0]));
            const fallbackColumn = isFallbackName
                ? viewColumns.findIndex(column => column.fallbackName === true) : -1;
            if (!this.#rowRecordById.has(String(row[0])) && row.length === 2) {
                const name = document.createElement("span");
                name.textContent = row[1];
                if (this.#fallbackNameIds.has(String(row[0]))) name.classList.add("list-name-fallback");
                items.appendChild(name);
            } else viewColumns.forEach((col, index) => {
                // Display a substituted facility name once, in the configured category column.
                if (fallbackColumn >= 0 && index + 1 === this.#nameColumn()) return;
                let name = col.glotName ? glot.get(col.glotName) : "";
                let value = row[index + 1] !== undefined && row[index + 1] !== "" ? row[index + 1] : "";
                if (index === fallbackColumn && (!String(value).trim() || value === "-")) {
                    value = row[this.#nameColumn()];
                }
                let part = document.createElement("div");
                part.className = col.className ? col.className : "";
                if (col.icon == true) {
                    let icon = document.createElement("img");
                    icon.src = window.withAppAssetVersion(`./icon/${row[row.length - 1]}`);
                    icon.className = "list-icon";
                    part.prepend(icon);
                }
                if (value !== "") {
                    let span = document.createElement("span");
                    span.className = "align-middle";
                    if (isFallbackName && (index + 1 === this.#nameColumn() || index === fallbackColumn)) {
                        span.classList.add("list-name-fallback");
                    }
                    span.textContent = name + value;
                    part.appendChild(span);
                }
                if (value !== "" || col.preserveSpace === true) {
                    items.appendChild(part);
                }
            })
            if (toilets.length) {
                const summary = document.createElement("span");
                summary.className = "align-middle text-nowrap";
                const wheelchair = toilets.some(tags => tags.wheelchair === "yes") ? "yes"
                    : toilets.some(tags => tags.wheelchair === "limited") ? "limited" : null;
                const toiletName = toilets.length === 1 ? glot.get("facility_toilet")
                    : glot.get("facility_toilet_count").replace("{count}", String(toilets.length));
                const toiletDetails = [
                    wheelchair ? glot.get(wheelchair === "yes"
                        ? "facility_wheelchair_yes" : "facility_wheelchair_limited") : "",
                    toilets.some(tags => tags.changing_table === "yes")
                        ? glot.get("facility_changing_table") : ""
                ].filter(Boolean).join(glot.get("facility_separator"));
                summary.textContent = toiletDetails
                    ? glot.get("facility_toilet_with_details")
                        .replace("{name}", toiletName).replace("{details}", toiletDetails)
                    : toiletName;
                const features = items.querySelector(".list-area-features");
                if (features) {
                    if (features.textContent.trim()) summary.prepend(glot.get("facility_separator"));
                    features.append(summary);
                } else {
                    const part = document.createElement("div");
                    part.className = "col-9 list-area-features";
                    part.appendChild(summary);
                    items.appendChild(part);
                }
            }
            /*
            const activityCount = this.#activityCountById.get(String(row[0])) ?? 0;
            if (activityCount > 1) {
                const countArea = document.createElement("div");
                countArea.className = "col-12 list-activity-count";
                const badge = document.createElement("span");
                badge.className = "activity-count-badge";
                badge.textContent = String(Conf.listTable?.activityCountLabel ?? "情報{count}件")
                    .replace("{count}", String(activityCount));
                countArea.appendChild(badge);
                items.appendChild(countArea);
            }
            */
            listGroup.appendChild(list);
            window.placeDiscovery?.decorate(list, this.#rowRecordById.get(String(row[0])));
            window.areaSearchController?.decorateListItem(list, row[0]);
        })
        listArea.appendChild(listGroup);
        window.placeDiscovery?.render();
    }

    #makeDisplayList(rows) {
        this.#activityCountById = new Map();
        if (this.getViewConfig()?.source === "areaFeatureLinker") {
            if (Conf.listTable?.groupActivitiesByOsmid === true) {
                rows.forEach(row => {
                    const count = this.#rowRecordById.get(String(row[0]))?.activities?.length ?? 0;
                    if (count) this.#activityCountById.set(String(row[0]), count);
                });
            }
            return rows;
        }
        if (Conf.listTable?.groupActivitiesByOsmid !== true) return rows;

        const activities = poiCont.pois()?.acts ?? [];
        const activityById = new Map(activities.map(activity => [String(activity.id ?? ""), activity]));
        activities.forEach(activity => {
            const osmid = String(activity?.osmid ?? "");
            if (osmid) this.#activityCountById.set(osmid, (this.#activityCountById.get(osmid) ?? 0) + 1);
        });

        const grouped = new Map();
        rows.forEach(row => {
            const activity = activityById.get(String(row[0]));
            if (!activity?.osmid) {
                const key = `entity:${row[0]}`;
                if (!grouped.has(key)) grouped.set(key, { row, activity: null });
                return;
            }

            const osmid = String(activity.osmid);
            const key = `entity:${osmid}`;
            const current = grouped.get(key);
            if (!current || this.#isNewerActivity(activity, current.activity)) {
                const representative = [...row];
                representative[0] = osmid;
                grouped.set(key, { row: representative, activity });
            }
        });
        return [...grouped.values()].map(group => group.row);
    }

    #isNewerActivity(candidate, current) {
        if (!current) return true;
        const timestamp = activity => Date.parse(activity?.updatetime || activity?.actdate || "") || 0;
        const timeDiff = timestamp(candidate) - timestamp(current);
        if (timeDiff !== 0) return timeDiff > 0;
        return String(candidate?.id ?? "").localeCompare(String(current?.id ?? "")) > 0;
    }

    // リスト選択
    select(id) {
        let row = document.querySelector(`[data-id="${id}"]`);
        row?.classList.add("selected");
        row?.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
        poiCont.select(id, true)
            .catch(err => { console.error(err); })
            .finally(() => { this.lock = false; });
    }

    // subset of change list_keyword
    filterKeyword(keyword) {
        if (this.#list.length > 0) {
            if (this.getViewConfig()) {
                this.#flist = this.#filter(this.#applyAreaFilter(
                    this.#filterAreaCategory(this.#list, this.getSelCategory())), keyword, -1);
                this.makeListArea(this.#flist);
                return;
            }
            this.filterCategory(this.getSelCategory());       // 一旦、今の選択肢でフィルタ
            this.#flist = this.#applyAreaFilter(this.#filter(this.#flist, keyword, -1));
            this.makeListArea(this.#flist);
        };
    };

    // subset of change list_category / categorys:select array(main,sub key)
    #filterAreaCategory(rows, categories) {
        if (!categories?.[0] || categories[0] === "-") return rows;
        if (categories[0] === "tags") {
            const tag = (categories[1] ?? "").replace(".", "=");
            if (!tag) return rows;
            return rows.filter(row => String(row[row.length - 3] ?? "").split(",").includes(tag));
        }
        const value = categories[categories.length - 1];
        return rows.filter(row => (row[row.length - 2] ?? []).includes(value));
    }

    filterCategory(categorys, render = true) {
        //console.log("listTable: filterCategory")
        if (this.#list.length > 0) {
            if (this.getViewConfig()) {
                this.#flist = this.#applyAreaFilter(this.#filterAreaCategory(this.#list, categorys));
                const keyword = String(list_keyword?.value ?? "").trim();
                if (keyword) this.#flist = this.#filter(this.#flist, keyword, -1);
                if (render) this.makeListArea(this.#flist);
                return;
            }
            const isTags = categorys[0] == "tags";
            const fieldName = Conf.listTable.category == "activity" ? "actFields" : "poiFields";
            const ccol = isTags
                ? Conf.list.columns.poiFields.length
                : Conf.list.columns[fieldName].indexOf("category");
            const keyword = isTags
                ? (categorys[1] || "").replace(".", "=")
                : categorys[categorys.length - 1];
            const categoryList = keyword !== "-" ? this.#filter(this.#list, keyword, ccol) : this.#list;
            this.#flist = this.#applyAreaFilter(categoryList);
            if (render) this.makeListArea(this.#flist);
        };
    };

    setAreaFilter(active) {
        this.areaFilterActive = Boolean(active);
    }

    #applyAreaFilter(rows) {
        if (!this.areaFilterActive || !window.areaSearchController) return rows;
        return rows.filter(row => window.areaSearchController.shouldIncludeListRow(row[0]));
    }

    // 指定したキーワードで絞り込み col: 列番号(-1は全て)
    // targetList: OSMID, CategoryName, SubCategory or Names, MainTag, SubTag, Targets(配列)
    #filter(targetList, keyword, col, view = this.getViewConfig()) {
        if (targetList == undefined) return [];
        if (keyword == "") return targetList;
        if (!view) {
            let fieldName = Conf.listTable.category == "activity" ? "actFields" : "poiFields"
            let ccol = Conf.list.columns[fieldName].findIndex(key => key === "id" || key === "#id");
            if (ccol == -1) {
                console.log(`Not Found.Conf.list.columns.${fieldName}.id`)
                return []
            }
        }
        let retval = targetList.filter((row) => {
            const record = this.#rowRecordById.get(String(row[0]));
            let cols = view && col == -1 && Array.isArray(view.searchFields)
                ? view.searchFields.map(value => this.#formatRecordValue(
                    record,
                    this.#mergeColumnOptions({ value }, view),
                    view
                )).join(",")
                : (col == -1 ? row.join(',') : row[col]);
            cols = Array.isArray(cols) ? cols.join(",") : cols;
            let osm = poiCont.get_osmid(row[0])
            if (osm == undefined) {
                let act = poiCont.get_actid(row[0])
                if (act !== undefined) osm = poiCont.get_osmid(act.osmid)
            }
            let prop = osm?.geojson?.properties ?? {}       // geoJsonからも検索
            cols += "," + Object.entries(prop)
                .filter(([key, value]) => key.startsWith("name") || key.endsWith("name"))
                .map(([key, value]) => value)
                .filter(value => value !== undefined && value !== null && value !== "")
                .join(", ");
            cols = cols.toLowerCase()
            return (cols.indexOf(keyword.trim().replace('.', '=').toLowerCase()) > -1) || keyword == "-";
        });
        return retval;
    };

    filterByPoiStatus(visitedFilterStatus, favoriteFilter, render = true) {
        //console.log("listTable: filterByPoiStatus");
        if (this.#list.length > 0) {
            const statusFor = osmid => poiStatusCont.getRecord(String(Array.isArray(osmid) ? osmid[0] : osmid));
            if (visitedFilterStatus === "visited") {
                this.#flist = this.#flist.filter(osmid => statusFor(osmid).visited);
            } else if (visitedFilterStatus === "unvisited") {
                this.#flist = this.#flist.filter(osmid => !statusFor(osmid).visited);
            }
            if (favoriteFilter) {
                this.#flist = this.#flist.filter(osmid => statusFor(osmid).favorite);
            }
            if (render) this.makeListArea(this.#flist);
        }
    }

    renderList() {
        this.makeListArea(this.#flist);
    }

    // select category
    selectCategory(catname, render = true) {
        const selectedValue = Array.isArray(catname) ? catname.join(",") : String(catname ?? "");
        for (const category of this.#categorys) {
            if (category[1] === selectedValue) {
                list_category.value = category[1];
                break
            };
        };
        // 範囲外のカテゴリが選択肢から消えた場合も、現在の選択で一覧を更新する。
        this.filterCategory(this.getSelCategory(), render);
    };
}
