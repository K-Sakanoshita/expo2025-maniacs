"use strict";

// listTable管理(イベントやPoi情報を表示)
class ListTable {

    // dataListに必要な初期化
    init() {
        console.log("listTable: init.")
        this.columns = Conf.list.columns.common
        this.height = window.innerHeight * Conf.list.height
        this.grid
        this.lock = false		// true then disable listtable
        this.list = []			// リストデータ本体
        this.flist
        this.categorys = []
    };

    // 現在選択しているカテゴリを返す(表示とvalueが違う場合はvalue)
    getSelCategory() {
        return list_category.value.split(",")
    }

    // 表示しているリストを返す
    getFilterList() {
        return this.flist
    }

    // 表示しているリスト数を返す
    getFlistCount() {
        return this.flist.length
    }

    // 無効化(選択できなくする or 有効化)
    disabled(mode) {
        list_category.disabled = mode
        list_keyword.disabled = mode
        this.lock = mode
    }

    // リスト作成
    // columns: id,category, [user_defines] ,カテゴリ名の元タグ, targets
    makeList() {
        let targets = []
        switch (Conf.listTable.target) {
            case "targets": targets = poiCont.getTargets(); break
            case "activity": targets = ["activity"]; break
            default:
                targets = Object.keys(Conf.osm).filter(key => Conf.osm[key].expression?.poiView === true); // リストに掲載するPoi種別
                break
        }
        this.list = poiCont.makeList(targets);

        let already = {};	// 重複するidは最初だけに絞る
        this.list = this.list.filter(row => {
            already[row[0]] = already[row[0]] !== undefined ? false : true;
            return already[row[0]];
        });

        this.flist = this.#filter(list_category.value, 1);	// カテゴリ名でフィルタ
        let option = { "columns": this.columns, "data": this.flist, "height": this.height, sort: true, fixedHeader: true, "autoWidth": false };
        if (this.grid !== undefined) {
            this.grid.updateConfig(option).forceRender(document.getElementById("tableid"))
        } else {
            this.grid = new gridjs.Grid(option).render(document.getElementById("tableid"))
        };
        if (this.grid.callbacks == undefined) {
            this.grid.on('rowClick', (...args) => {
                console.log("listTable: rowClick start")
                if (!this.lock) {
                    this.lock = true;
                    winCont.spinner(true);
                    try {
                        let actid = args[1].cell(0).data;
                        this.select(actid);
                        poiMarker.select(actid, true).then(() => {
                            console.log("listTable: rowClick OK");
                        }) //.catch(() => {
                            //	console.log("listTable: rowClick NG");
                            .then(() => { this.lock = false });
                    } catch (error) {
                        winCont.spinner(false);
                        this.lock = false;
                    };
                };
            });
        };
    };

    // リスト選択
    select(actid) {
        let rows = document.getElementsByClassName('gridjs-tr selected');
        if (rows.length > 0) Array.from(rows).forEach(row => { row.classList.remove("selected") });
        let lstidx = this.flist.findIndex(elm => elm[0] === actid);
        if (lstidx > -1) {
            let row = document.querySelector("#tableid table").rows[lstidx + 1];
            row.classList.add("selected");
            row.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
        }
    }

    // subset of change list_keyword
    filterKeyword(keyword) {
        if (this.list.length > 0) {
            this.flist = this.#filter(keyword, -1);
            this.grid.updateConfig({ "data": this.flist }).forceRender(document.getElementById("tableid"));
        };
    };

    // subset of change list_category / categorys:select array(main,sub key)
    filterCategory(categorys) {
        if (this.list.length > 0) {
            let ccol = Conf.listTable.category == "activity" ? 1 : this.list[0].length - 2	// activity:1 / tags:cols-2
            categorys = categorys[categorys.length - 1];		// 複数値は最後の値（表示名）を使う
            this.flist = categorys !== "-" ? this.#filter(categorys, ccol) : this.list;	// 最後-2列を指定してフィルタリング
            this.grid.updateConfig({ "data": this.flist, "autoWidth": false }).forceRender(document.getElementById("tableid"));
        };
    };

    // 指定したキーワードで絞り込み col: 列番号(-1は全て)
    #filter(keyword, col) {
        if (this.list == undefined) return [];
        return this.list.filter((row) => {
            let cols = col == -1 ? row.join(',') : row[col];
            cols = Array.isArray(cols) ? cols.join(",") : cols;
            return (cols.indexOf(keyword.replace('.', '=')) > -1) || keyword == "-";
        });
    };

    // make category list
    makeSelectList(target) {
        let oldselect = list_category.value == "" ? "-" : list_category.value;
        let domSel = [];
        console.log(`listtable: makeSelectList(now ${oldselect})`);
        winCont.select_clear(`list_category`);
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
                        this.categorys.push("activity," + category)
                    }
                }
                break
            case "tags":		// タグからカテゴリを表示
                let pois = []
                pois = this.list.map(data => {
                    let rets = []
                    data.forEach(col => rets.push(col == undefined ? "" : col))
                    return rets
                })
                pois = [...new Set(pois.map(JSON.stringify))].map(JSON.parse)
                pois.filter(Boolean).sort().map(poi => {
                    let kv = target + "," + poi[poi.length - 2].replace("=", ".")
                    domSel.push([poi[1], kv])
                    this.categorys.push(kv)
                })
                break
        }
        domSel.sort().forEach(sel => winCont.select_add(`list_category`, sel[0], sel[1]))
        list_category.value = oldselect
        this.categorys = basic.uniq(this.categorys)
        console.log(`listtable: makeSelectList End.`)
    }

    // select category
    selectCategory(catname) {
        for (const category of this.categorys) {
            if (category == catname) list_category.value = category; break;
        };
    };

    heightSet(height) {								// set table height
        this.grid.updateConfig({ "height": height }).forceRender(document.getElementById("tableid"));
        cMapMaker.mode_change('list');
    };

}
