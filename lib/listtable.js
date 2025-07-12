"use strict";

// listTable管理(イベントやPoi情報を表示)
class ListTable {
    #list;
    #flist;
    #categorys;

    // dataListに必要な初期化
    init() {
        console.log("listTable: init.")
        this.columns = Conf.list.columns.common
        this.height = window.innerHeight * Conf.listTable.height
        this.grid
        this.lock = false		// true then disable listtable
        this.#list = []			// リストデータ本体
        this.#flist;
        this.#categorys;
    }

    // 現在選択しているカテゴリを返す(表示とvalueが違う場合はvalue)
    getSelCategory() {
        return list_category.value.split(",")
    }

    // 表示しているリストを返す
    getFilterList() {
        return this.#flist
    }

    // 表示しているリスト数を返す
    getFlistCount() {
        return this.#flist.length
    }

    // 無効化(選択できなくする or 有効化)
    disabled(mode) {
        list_category.disabled = mode
        list_keyword.disabled = mode
        this.lock = mode
    }

    // make category list
    makeSelectList(target) {
        //let oldselect = list_category.value == "" ? Conf.selectItem.default : list_category.value;
        let oldselect = list_category.value;
        let domSel = [];
        this.#categorys = [["-", ""]];

        console.log(`listtable: makeSelectList(now ${oldselect})`);
        winCont.clearSelect(`list_category`);
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
                let pois = []
                pois = this.#list.map(data => {
                    let rets = []
                    data.forEach(col => rets.push(col == undefined ? "" : col))
                    return rets
                })
                pois = [...new Set(pois.map(JSON.stringify))].map(JSON.parse)       // 重複削除
                pois.filter(Boolean).sort().map(poi => {
                    let poiview = false;
                    poi[poi.length - 1].forEach(a => {  // カテゴリの追加が必要ならpoiview = true
                        poiview = Conf.osm[a].expression.poiView ? true : poiview;
                    })
                    if (poiview) {
                        let kv = target + "," + poi[3].replace("=", ".")
                        domSel.push([poi[1], kv])
                        if (this.#categorys.indexOf(kv) == -1) this.#categorys.push(kv)
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
        list_category.value = oldselect
        this.#categorys = basic.uniq(this.#categorys)
        console.log(`listtable: makeSelectList End.`)
    }

    // リスト作成
    // columns: id,category, [user_defines] ,カテゴリ名の元タグ, targets
    makeList(poiFilter) {
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
                break
        }
        this.#list = poiCont.makeList(targets, poiFilter == "all"); // 全て表示時はtrue
        let already = {};	// 重複するidは最初だけに絞る
        this.#list = this.#list.filter(row => {
            already[row[0]] = already[row[0]] !== undefined ? false : true;
            return already[row[0]];
        })
        let categorys = this.getSelCategory();
        categorys = categorys[categorys.length - 1];		            // 複数値は最後の値（表示名）を使う
        // 以下の#filstをコメントアウトしていたのはselectItemのmenu？(2025/06/28)
        this.#flist = this.#filter(this.#list, categorys, 3);	        // カテゴリ名でフィルタ
        this.#flist.forEach(row => row[2] === "" && (row[2] = "-"));    // 名前が空欄なら"-"へ"
        let option = { "columns": this.columns, "data": this.#flist, "height": this.height, sort: true, fixedHeader: true, "autoWidth": false };
        if (this.grid !== undefined) {
            this.grid.updateConfig(option).forceRender(document.getElementById("tableid"))
        } else {
            this.grid = new gridjs.Grid(option).render(document.getElementById("tableid"))
        }
        if (this.grid.callbacks == undefined) {
            this.grid.on('rowClick', (...args) => {
                console.log("listTable: rowClick start")
                if (!this.lock) {
                    this.lock = true;
                    winCont.spinner(true);
                    let actid = args[1].cell(0).data;
                    this.select(actid);
                    poiCont.select(actid, true).then(() => {
                        console.log("listTable: rowClick OK");
                        cMapMaker.eventChangeCategory()
                        winCont.spinner(false);
                        this.lock = false;
                    });
                };
            });
        };
    };

    // リスト選択
    select(actid) {
        let rows = document.getElementsByClassName('gridjs-tr selected');
        if (rows.length > 0) Array.from(rows).forEach(row => { row.classList.remove("selected") });
        let lstidx = this.#flist.findIndex(elm => elm[0] === actid);
        if (lstidx > -1) {
            let row = document.querySelector("#tableid table").rows[lstidx + 1];
            row.classList.add("selected");
            row.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
        }
    }

    // subset of change list_keyword
    filterKeyword(keyword) {
        if (this.#list.length > 0) {
            this.filterCategory(this.getSelCategory());       // 一旦、今の選択肢でフィルタ
            this.#flist = this.#filter(this.#flist, keyword, -1);
            this.grid.updateConfig({ "data": this.#flist }).forceRender(document.getElementById("tableid"));
        };
    };

    // subset of change list_category / categorys:select array(main,sub key)
    filterCategory(categorys) {
        console.log("listTable: filterCategory")
        if (this.#list.length > 0) {
            let ccol = Conf.listTable.category == "activity" ? 1 : 3    // activity:1 / tags:cols-3(Main)
            if (Conf.listTable.category == "menu") { ccol = 5 }         // 手動メニュー時
            categorys = categorys[categorys.length - 1];		        // カテゴリ複数値は後ろを使う(tags,amenity=toiletsなら後ろ)
            this.#flist = categorys !== "-" ? this.#filter(this.#list, categorys, ccol) : this.#list;	// 最後-2列を指定してフィルタリング
            this.grid.updateConfig({ "data": this.#flist, "autoWidth": false }).forceRender(document.getElementById("tableid"));
        };
    };

    // 指定したキーワードで絞り込み col: 列番号(-1は全て)
    // targetList: OSMID, CategoryName, SubCategory or Names, MainTag, SubTag, Targets(配列)
    #filter(targetList, keyword, col) {
        if (targetList == undefined) return [];
        if (keyword == "") return targetList;
        let retval = targetList.filter((row) => {
            let cols = col == -1 ? row.join(',') : row[col];
            cols = Array.isArray(cols) ? cols.join(",") : cols;
            let prop = poiCont.get_osmid(row[0]).geojson.properties       // geoJsonからも検索
            cols += "," + Object.entries(prop)
                .filter(([key, value]) => key.startsWith("name") || key.endsWith("name"))
                .map(([key, value]) => value)
                .filter(value => value !== undefined && value !== null && value !== "")
                .join(", ");
            cols = cols.toLowerCase()
            return (cols.indexOf(keyword.replace('.', '=').toLowerCase()) > -1) || keyword == "-";
        });
        return retval;
    };

    // select category
    selectCategory(catname) {
        for (const category of this.#categorys) {
            if (category[1] == catname) {
                list_category.value = category[1];
                this.filterCategory(listTable.getSelCategory())
                break
            };
        };
    };

    heightSet(height) {								// set table height
        this.grid.updateConfig({ "height": height }).forceRender(document.getElementById("tableid"));
        cMapMaker.changeMode('list');
    };

}
