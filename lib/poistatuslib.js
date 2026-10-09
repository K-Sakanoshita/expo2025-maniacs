
class PoiStatusCont {

    // The public array API is retained for map markers and existing callers. New
    // records are objects so visit metadata can be added without changing slots.
    getValueByOSMID(osmid) {
        const record = this.getRecord(osmid);
        return [record.visited, record.favorite, record.memo];
    }

    getRecord(osmid) {
        const empty = { visited: false, favorite: false, memo: "" };
        if (!Conf.etc.localSave) return empty;
        let raw;
        try { raw = localStorage.getItem(`${Conf.etc.localSave}.${osmid}`); }
        catch { return empty; }
        if (!raw) return empty;
        if (raw.startsWith("{")) {
            try {
                const record = JSON.parse(raw);
                if (!record || typeof record !== "object" || Array.isArray(record)) return empty;
                return { ...record, visited: record.visited === true,
                    favorite: record.favorite === true, memo: String(record.memo ?? "") };
            } catch { return empty; }
        }
        const [visited, favorite, ...memo] = raw.split(",");
        return { visited: visited?.toLowerCase() === "true",
            favorite: favorite?.toLowerCase() === "true", memo: memo.join(",").replace(/\r/g, "") };
    }

    setValueByOSMID(osmid, visited, favorite, memo) {
        if (!Conf.etc.localSave) return;
        const previous = this.getRecord(osmid);
        try {
            localStorage.setItem(`${Conf.etc.localSave}.${osmid}`, JSON.stringify({
                ...previous, visited: Boolean(visited), favorite: Boolean(favorite), memo: String(memo ?? "")
            }));
        } catch { /* Storage may be disabled; keep map use available. */ }
    }

    getAllVisited() { return this.#getAllLocalStorage(record => record.visited); }
    getAllFavorite() { return this.#getAllLocalStorage(record => record.favorite); }

    #getAllLocalStorage(conditionFn) {
        if (!Conf.etc.localSave) return [];
        const prefix = `${Conf.etc.localSave}.`;
        const matched = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key?.startsWith(prefix)) continue;
                const record = this.getRecord(key.slice(prefix.length));
                if (conditionFn(record)) matched.push([key, record]);
            }
        } catch { /* Storage may be disabled; return no saved records. */ }
        return matched;
    }

    export() {
        console.log("export POI status:")
        let csvContent = "key,category,name,visited,favorite,memo\n";
        const prefix = `${Conf.etc.localSave}.`;
        const csvCell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key.startsWith(prefix)) continue;
            const osmid = key.slice(prefix.length);
            const pois = poiCont.get_osmid(osmid);
            if (pois === undefined) continue;
            const category = poiCont.getCatnames(pois.geojson.properties)[0];
            const name = pois.geojson.properties.name ?? "";
            const record = this.getRecord(osmid);
            csvContent += [key, category, name, record.visited, record.favorite, record.memo]
                .map(csvCell).join(",") + "\n";
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
                        if (key?.startsWith(`${Conf.etc.localSave}.`)) localStorage.setItem(key, poiStatusCSV);
                    })
                } else if (header.startsWith("key,category,name,visited,favorite,memo")) {
                    lines.forEach(line => {
                        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s =>
                            s.replace(/^"|"$/g, "").replace(/""/g, '"').replace(/\r/g, '')  // CSVエスケープ解除
                        );
                        const key = values[PoiStatusCsvIndex.KEY];
                        const poiStatusCSV = values[PoiStatusCsvIndex.VISITED].toLowerCase() + "," + values[PoiStatusCsvIndex.FAVORITE].toLowerCase() + "," + values[PoiStatusCsvIndex.MEMO];
                        if (key?.startsWith(`${Conf.etc.localSave}.`)) localStorage.setItem(key, poiStatusCSV);
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
}
