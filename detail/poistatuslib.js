
class PoiStatusCont {

    // 指定したosmidのvalueを配列で返す [0](訪問済みフラグ):true or false / [1](お気に入りフラグ):true or false /  [2]:memo
    getValueByOSMID(osmid) {
        let lcal = Conf.etc.localSave !== "" ? localStorage.getItem(Conf.etc.localSave + "." + osmid) : "";     // 有効時はtags.idの情報取得、他は""
        let poiStatus = lcal == null ? ["false", ""] : lcal.split(",")
        poiStatus[PoiStatusIndex.VISITED] = poiStatus[PoiStatusIndex.VISITED].toLowerCase() === "true"        // true時はboolean型のtrueを返し、他はfalse
        poiStatus[PoiStatusIndex.FAVORITE] = poiStatus[PoiStatusIndex.FAVORITE].toLowerCase() === "true";
        poiStatus[PoiStatusIndex.MEMO] = poiStatus[PoiStatusIndex.MEMO] !== undefined ? poiStatus[PoiStatusIndex.MEMO].replace(/\r/g, "") : "";
        return poiStatus
    }

    // 指定したidに訪問済みflag、お気に入りflag、memoを保存
    setValueByOSMID(osmid, visited, favorite, memo) {
        let value = visited.toString() + "," + favorite.toString() + "," + memo.replaceAll(",", " ")
        localStorage.setItem(Conf.etc.localSave + "." + osmid, value)   // チェック時はtrue
    }

    // 訪問済みの全てのkeyを返す
    getAllVisited() {
        return this.#getAllLocalStorage((key, value) => { return value.split(",")[0].toLowerCase() == "true" });
    }

    // 渡した関数の引数1と2の結果が一致した[key,value]を返す関数
    #getAllLocalStorage(conditionFn) {
        const matched = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            if (conditionFn(key, value)) matched.push([key, value]);  // 条件関数に合致した場合に追加
        }
        return matched;
    }

    export() {
        console.log("export POI status:")
        let csvContent = "key,category,name,visited,favorite,memo\n";
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const osmid = key.replace(Conf.etc.localSave + ".", "");
            const pois = poiCont.get_osmid(osmid);
            if (pois !== undefined) {
                const category = poiCont.getCatnames(pois.geojson.properties)[0];
                const name = pois.geojson.properties.name == undefined ? "" : pois.geojson.properties.name;
                let value = localStorage.getItem(key);
                value = value.replace(/TRUE,/g, 'true,');
                value = value.replace(/FALSE,/g, 'false,');
                const escapedKey = `"${key.replace(/"/g, '""')}"`;            // CSV形式にエスケープ
                //const escapedValue = `"${value.replace(/"/g, '""')}"`;
                csvContent += `${escapedKey},${category},${name},${value}\n`;
            }
        }

        // CSVをダウンロードさせる
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "localStorage_export.csv";
        a.click();
        URL.revokeObjectURL(url);
    }

    import() {
        let msg = { msg: glot.get("file_select"), ttl: glot.get("file_select") }
        winCont.setSidebar("view")
        mapLibre.viewMiniMap(false)
        winCont.makeDetail({
            "title": msg.ttl, "mode": ["yes", "no"], callback_yes: this.import_load, "menu": false,
            "message": '<input type="file" id="csvInput" class="form-control" accept=".csv,text/csv">',
            "append": Conf.menu.visited
        });
    }

    import_load() {
        console.log("import POI status:")
        if (csvInput.files.length > 0) {    // ファイルが選択された時
            let file = csvInput.files[0];
            const reader = new FileReader();
            reader.readAsText(file, "utf-8");
            reader.onload = function (e) {
                const text = e.target.result;
                const lines = text.trim().split("\n");
                const header = lines.shift(); // ヘッダーを削除

                if (header.startsWith("key,category,name,visited,memo")) {
                    lines.forEach(line => {
                        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s =>
                            s.replace(/^"|"$/g, "").replace(/""/g, '"').replace(/\r/g, '')  // CSVエスケープ解除
                        );
                        const key = values[PoiStatusCsvIndexOld.KEY];
                        const poiStatusCSV = values[PoiStatusCsvIndexOld.VISITED].toLowerCase() + ",false," + values[PoiStatusCsvIndexOld.MEMO];
                        if (key && poiStatusCSV !== undefined) localStorage.setItem(key, poiStatusCSV);
                    })
                } else if (header.startsWith("key,category,name,visited,favorite,memo")) {
                    lines.forEach(line => {
                        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s =>
                            s.replace(/^"|"$/g, "").replace(/""/g, '"').replace(/\r/g, '')  // CSVエスケープ解除
                        );
                        const key = values[PoiStatusCsvIndex.KEY];
                        const poiStatusCSV = values[PoiStatusCsvIndex.VISITED].toLowerCase() + "," + values[PoiStatusCsvIndex.FAVORITE].toLowerCase() + "," + values[PoiStatusCsvIndex.MEMO];
                        if (key && poiStatusCSV !== undefined) localStorage.setItem(key, poiStatusCSV);
                    })
                } else {
                    winCont.addDetailMessage(glot.get("file_error"), true)
                    return;
                }
                setTimeout(() => {
                    let msg = { ttl: glot.get("results"), txt: glot.get("file_loaded") };
                    winCont.makeDetail({ "title": msg.ttl, "message": msg.txt, "menu": false, "mode": "close", "callback_close": winCont.closeModal });
                }, 500);
            }
        } else {
            winCont.addDetailMessage(glot.get("file_notfound"), true)
        }
        console.log("import  POI status: End")
    }

    migrateLocalStorageData() {
        console.log("poistatuslib: migrateLocalStorageData Start");
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);

            const poiStatus = value.split(",");
            if (poiStatus.length === 2) {
                // 旧バージョンではpoiStatus[0]が訪問済みフラグ、poiStatus[1]がメモ。新バージョンではその間にお気に入りフラグを追加
                const newValue = poiStatus[0] + ",false," + poiStatus[1];
                localStorage.setItem(key, newValue);
                console.log("Migrated key:", key, "old value:", value, "new value:", newValue);
            } else {
                break;  // 既に新しいバージョンの場合は処理を終了
            }
        }
        console.log("poistatuslib: migrateLocalStorageData End");
    }

}
