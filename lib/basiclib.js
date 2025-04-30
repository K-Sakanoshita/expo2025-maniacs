// Basic Closure
class Basic {

    constructor() {
        this.requestQueue = new this.RequestQueue(24); // 最大同時4件
    }

    getDate() {							                // Overpass Queryに付ける日付指定
        let seldate = $("#Select_Date").val();
        return seldate ? '[date:"' + (new Date(seldate)).toISOString() + '"]' : "";
    }

    formatDate(date, format) {
        // date format
        if (Number.isNaN(date.getDate())) return "";
        try {
            format = format.replace(/YYYY/g, date.getFullYear());
            format = format.replace(/YY/g, date.getFullYear().toString().slice(-2));
            format = format.replace(/MM/g, ('0' + (date.getMonth() + 1)).slice(-2));
            format = format.replace(/DD/g, ('0' + date.getDate()).slice(-2));
            format = format.replace(/hh/g, ('0' + date.getHours()).slice(-2));
            format = format.replace(/mm/g, ('0' + date.getMinutes()).slice(-2));
            format = format.replace(/ss/g, ('0' + date.getSeconds()).slice(-2));
        } catch {
            format = "";
        };
        return format;
    }

    dataURItoBlob(dataURI) {                               // DataURIからBlobへ変換（ファイルサイズ2MB超過対応）
        const b64 = atob(dataURI.split(',')[1]);
        const u8 = Uint8Array.from(b64.split(""), function (e) { return e.charCodeAt() });
        return new Blob([u8], { type: "image/png" });
    }

    concatTwoDimensionalArray(array1, array2, axis) {      // 2次元配列の合成
        if (axis != 1) axis = 0;
        var array3 = [];
        if (axis == 0) {    //　縦方向の結合
            array3 = array1.slice();
            for (var i = 0; i < array2.length; i++) {
                array3.push(array2[i]);
            }
        } else {              //　横方向の結合
            for (var i = 0; i < array1.length; i++) {
                array3[i] = array1[i].concat(array2[i]);
            };
        };
        return array3;
    }

    unicodeUnescape(str) {     // \uxxx形式→文字列変換
        let result = "", strs = str.match(/\\u.{4}/ig);
        if (!strs) return '';
        for (var i = 0, len = strs.length; i < len; i++) {
            result += String.fromCharCode(strs[i].replace('\\u', '0x'));
        };
        return result;
    }

    uniq(array) {
        let elems = new Map();
        for (let elem of array) elems.set(elem, true); // 同じキーに何度も値を設定しても問題ない
        return Array.from(elems.keys()).filter(Boolean);
    }

    retry(func, retryCount) {   // Promise失敗時にリトライする
        let promise = func();
        for (let i = 1; i <= retryCount; ++i) {
            promise = promise.catch(func);
        }
        return promise;
    }

    calcImageSize(imgX, imgY, winX, winY) {
        const imgAspect = imgX / imgY;          // 画像の縦横比を計算
        const winAspect = winX / winY;
        let newX, newY;
        if (imgAspect > winAspect) {            // 画面の縦横比に基づいて画像を調整
            newX = winX;						// 横長の画像: 横幅を画面の横幅に合わせる
            newY = winX / imgAspect;
        } else {
            newY = winY;						// 縦長の画像: 高さを画面の高さに合わせる
            newX = winY * imgAspect;
        }
        return [newX, newY];
    }

    getWikipedia(lang, url) {      // get wikipedia contents
        return new Promise((resolve, reject) => {
            let encurl = encodeURI(url);
            encurl = "https://" + lang + "." + Conf.wikipedia.api + encurl + "?origin=*";
            console.log(encurl);
            $.get({ url: encurl, dataType: "json" }, function (data) {
                console.log(data.extract);
                resolve([data.extract, data.thumbnail]);
            });
        });
    }

    isSmartPhone() {
        if (window.matchMedia && window.matchMedia('(max-device-width: 640px)').matches) {
            return true;
        } else {
            return false;
        };
    }

    autoLink(str) {
        var regexp_url = /((h?)(ttps?:\/\/[a-zA-Z0-9.\-_@:/~?%&;=+#',()*!]+))/g; // ']))/;
        var regexp_makeLink = function (all, url, h, href) {
            return '<a href="h' + href + '" target="_blank">' + url + '</a>';
        }
        return str.replace(regexp_url, regexp_makeLink);
    }

    getStyleSheetValue(cssname, property) {
        let element = document.querySelector(cssname);
        if (!element || !property) return null;
        let style = window.getComputedStyle(element);
        return style.getPropertyValue(property);
    }

    async makeSHA256(text) {
        const uint8 = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest('SHA-256', uint8);
        return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('');
    }

    htmlspecialchars(str) {
        return String(str).replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
    }

    //二次元配列 -> CSV形式の文字列に変換
    makeArray2CSV(arr, col = ',', row = '\n') {
        const escape = (s) => { return `"${s.replace(/\"/g, '\"\"')}"` };
        return arr.map((row) => row.map((cell) => escape(Array.isArray(cell) ? cell.join("//") : cell)).join(col)).join(row);
    }

    //指定したWikimedia Commons画像を取得 / fileTitle:ページ名 / thumbnailWidth:サイズ / imageDom:dom or id名
    //id名を指定した場合、同id + "-copyright"のid要素(span想定)に著作権表示を実施する
    /* getWikiMediaImage(fileTitle, thumbnailWidth, imageDom) {
        const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${fileTitle}&format=json&prop=imageinfo&iiprop=url|extmetadata&origin=*`;
        let apiThumUrl = apiUrl + (thumbnailWidth == "" ? "" : `&iiurlwidth=${thumbnailWidth}`);
        console.log("getWikiMediaImage: " + apiUrl);
        fetch(apiThumUrl)
            .then(response => response.json())
            .then(data => {
                const pages = data.query.pages;
                const pageId = Object.keys(pages)[0];
                const urlCat = thumbnailWidth == "" ? "url" : "thumburl";
                if (pages[pageId].imageinfo !== undefined) {
                    const fileUrl = pages[pageId].imageinfo[0][urlCat];
                    const copyright = typeof (imageDom) == "string" ? document.getElementById(imageDom + "-copyright") : undefined
                    imageDom = typeof (imageDom) == "string" ? document.getElementById(imageDom) : imageDom;
                    imageDom.src = fileUrl;
                    imageDom.setAttribute("src_org", pages[pageId].imageinfo[0].url);
                    imageDom.setAttribute("src_thumb", pages[pageId].imageinfo[0].thumburl);
                    if (copyright !== undefined) {
                        let artist = pages[pageId].imageinfo[0].extmetadata.Artist.value
                        let license = pages[pageId].imageinfo[0].extmetadata.LicenseShortName.value
                        let html = `Image by ${artist} <a href="${pages[pageId].imageinfo[0].descriptionurl}">${license}</a>`
                        copyright.innerHTML = html
                    }
                } else {
                    console.log("getWikiMediaImage: File Not Found. " + pages[pageId].title);
                }
            })
    }
    */

    // キューラッパー
    queueGetWikiMediaImage(fileTitle, thumbnailWidth, imageDom) {
        return this.requestQueue.enqueue(() => this.getWikiMediaImage(fileTitle, thumbnailWidth, imageDom));
    }

    // 画像取得処理（非同期対応）
    async getWikiMediaImage(fileTitle, thumbnailWidth, imageDom) {
        const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${fileTitle}&format=json&prop=imageinfo&iiprop=url|extmetadata&origin=*`;
        const apiThumUrl = apiUrl + (thumbnailWidth === "" ? "" : `&iiurlwidth=${thumbnailWidth}`);
        console.log("getWikiMediaImage: " + apiThumUrl);

        try {
            const res = await fetch(apiThumUrl);
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
            const data = await res.json();

            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];
            const urlCat = thumbnailWidth === "" ? "url" : "thumburl";

            if (pages[pageId].imageinfo !== undefined) {
                const info = pages[pageId].imageinfo[0];
                const fileUrl = info[urlCat];

                const copyright = typeof imageDom === "string"
                    ? document.getElementById(imageDom + "-copyright")
                    : undefined;

                imageDom = typeof imageDom === "string"
                    ? document.getElementById(imageDom)
                    : imageDom;

                imageDom.src = fileUrl;
                imageDom.setAttribute("src_org", info.url);
                imageDom.setAttribute("src_thumb", info.thumburl);

                if (copyright !== undefined) {
                    let artist = info.extmetadata.Artist?.value || "Unknown";
                    let license = info.extmetadata.LicenseShortName?.value || "Unknown";
                    let html = `Image by ${artist} <a href="${info.descriptionurl}">${license}</a>`;
                    copyright.innerHTML = html;
                }
            } else {
                console.log("getWikiMediaImage: File Not Found. " + pages[pageId].title);
            }
        } catch (err) {
            console.error("getWikiMediaImage error:", err);
        }
    }

    // リクエストキュークラス（内部クラスとして定義）
    RequestQueue = class {
        constructor(maxConcurrent = 4) {
            this.maxConcurrent = maxConcurrent;
            this.queue = [];
            this.activeCount = 0;
        }

        enqueue(task) {
            return new Promise((resolve, reject) => {
                this.queue.push(() => task().then(resolve).catch(reject));
                this.dequeue();
            });
        }

        dequeue() {
            if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) return;

            const task = this.queue.shift();
            this.activeCount++;
            task().finally(() => {
                this.activeCount--;
                this.dequeue();
            });
        }
    }
}

class OpeningHours {
    constructor(openingHoursString) {
        this.schedule = this.parseOpeningHours(openingHoursString);
    }

    // opening_hours文字列を解析してスケジュールを生成
    parseOpeningHours(openingHoursString) {
        const daysMapping = { 'Mo': 1, 'Tu': 2, 'We': 3, 'Th': 4, 'Fr': 5, 'Sa': 6, 'Su': 0 }
        const schedule = {}, ranges = openingHoursString.split(';').map(s => s.trim())
        ranges.forEach(range => {
            const [daysPart, timePart] = range.split(' ')
            const days = daysPart.split('-')
            const times = timePart.split('-')
            const startDay = daysMapping[days[0]]
            const endDay = daysMapping[days[1] || days[0]]
            for (let d = startDay; d <= endDay; d++) {
                if (!schedule[d]) schedule[d] = []
                if (times.length === 2) {
                    schedule[d].push({ start: times[0], end: times[1] })
                } else if (times[0] === 'off') {
                    schedule[d] = [];
                }
            }
        })
        return schedule
    }

    // 指定した日時が営業中かどうかを確認
    isOpen(date) {
        const day = date.getDay();
        const time = date.toTimeString().substring(0, 5);
        if (!this.schedule[day] || this.schedule[day].length === 0) return false
        return this.schedule[day].some(range => { return range.start <= time && time <= range.end })
    }
}
