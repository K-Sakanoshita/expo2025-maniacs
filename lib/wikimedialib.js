// wikimedialib.js
// Wikimedia Commons 用ユーティリティクラス
// - Commons API から画像URL・ライセンス情報を取得
// - Cache Storage に API JSON と画像本体を保存
// - getWikiMediaImage / queueGetWikiMediaImage を提供

class WikimediaLib {
    constructor(options = {}) {
        this.infoCacheName = options.infoCacheName || "wikimedia-image-info-v1";
        this.imageCacheName = options.imageCacheName || "wikimedia-image-file-v1";

        // Commons API のJSON情報を保持する期間
        // ライセンスや作者名が更新される可能性があるため、永久保存は避ける
        this.infoTtlMs = options.infoTtlMs ?? (7 * 24 * 60 * 60 * 1000); // 7日

        // true の場合、Cache Storage の画像を blob: URL として img.src に設定する
        // false の場合、画像URL自体は通常URLを使う
        this.useBlobUrl = options.useBlobUrl ?? true;

        this.requestQueue = new WikimediaLib.RequestQueue(options.maxConcurrent || 4);
    }

    // make html(After processing) / 詳細モーダルのHTMLを生成 / wiki:Article_Title(tags.wikipedia)
    makeWikipediaOverView(wiki) {
        if (!wiki) throw new Error("wikipedia tag is empty");

        const sep = wiki.indexOf(":");
        if (sep < 0) throw new Error(`Invalid wikipedia tag: ${wiki}`);

        const lang = wiki.slice(0, sep);
        const title = wiki.slice(sep + 1);
        const url = `https://${lang}.${Conf.wikipedia.domain}/wiki/${encodeURIComponent(title)}`;

        wikimedia.getWikipedia(lang, title).then(([extract, thumbnail]) => {
            const image = thumbnail.source ? `<br><a href="${url}" target="_blank"><img class="thumbnail" width="${thumbnail.width}" height="${thumbnail.height}" src="${thumbnail.source}"></a>` : ""
            const html = `<span>${extract}</span><a href="${url}" target="_blank">${glot.get("source_wikipedia")}</a>` + image;
            const setDom = (html) => {
                let wikidom = document.getElementById("wikipedia");
                if (wikidom == undefined) {
                    setTimeout(() => setDom(html), 200);
                } else {
                    wikidom.innerHTML = html;
                };
            };
            setDom(html);
            resolve();
        }).catch((e) => {
            console.warn("Failed to get Wikipedia overview:", e);
            return ["", null];
        });

        return `<div class="bg-light bg-light bg-gradient border rounded p-1" id="wikipedia"></div>`;

    }

    // get wikipedia contents / wikipediaの内容を取得(extract:要約テキスト, thumbnail:サムネイル情報)
    async getWikipedia(lang, title) {
        const apiUrl = `https://${lang}.wikipedia.org/w/api.php`;
        const params = new URLSearchParams({
            action: "query", format: "json", origin: "*", prop: "extracts|pageimages", exintro: "1",
            explaintext: "1", redirects: "1", piprop: "thumbnail", pithumbsize: "400", titles: title
        });

        const url = `${apiUrl}?${params.toString()}`;
        console.log(url);

        const response = await fetch(url);

        if (!response.ok) {
            const error = new Error(`Wikipedia API error: HTTP ${response.status}`);
            error.status = response.status;
            error.title = title;
            throw error;
        }

        const data = await response.json();
        const pages = data.query?.pages;
        const page = pages ? Object.values(pages)[0] : null;

        if (!page || page.missing !== undefined) {
            const error = new Error(`Wikipedia page not found: ${title}`);
            error.status = 404;
            error.title = title;
            throw error;
        }

        return [page.extract ?? "", page.thumbnail ?? null];
    }

    // キュー経由で画像取得
    queueGetWikiMediaImage(fileTitle, thumbnailWidth, imageDom) {
        return this.requestQueue.enqueue(() => {
            return this.getWikiMediaImage(fileTitle, thumbnailWidth, imageDom);
        });
    }

    // Wikimedia Commons 画像取得処理
    async getWikiMediaImage(fileTitle, thumbnailWidth = "", imageDom = null) {
        imageDom = typeof imageDom === "string"
            ? document.getElementById(imageDom)
            : imageDom;

        if (!imageDom) {
            console.warn("getWikiMediaImage: imageDom is not found.", fileTitle);
            return null;
        }

        const apiUrl = this.makeImageInfoApiUrl(fileTitle, thumbnailWidth);
        //console.log("getWikiMediaImage:", apiUrl);

        const data = await this.fetchJsonWithCache(apiUrl);
        const info = this.extractImageInfo(data, fileTitle);

        if (!info) {
            console.log("getWikiMediaImage: File Not Found or imageinfo missing.", fileTitle);
            return null;
        }

        const fileUrl = this.selectImageUrl(info, thumbnailWidth);

        if (!fileUrl) {
            console.log("getWikiMediaImage: image URL not found.", fileTitle);
            return null;
        }

        this.revokeImageBlobUrl(imageDom);

        let imageSrc = fileUrl;

        if (this.useBlobUrl) {
            imageSrc = await this.getCachedImageSrc(fileUrl);
        } else {
            // blob化しない場合でも、先に Cache Storage へ保存しておく
            await this.cacheImageFile(fileUrl);
        }

        imageDom.src = imageSrc;

        if (imageSrc.startsWith("blob:")) {
            imageDom.dataset.wikimediaBlobUrl = imageSrc;
        }

        imageDom.setAttribute("src_org", info.url || "");
        imageDom.setAttribute("src_thumb", info.thumburl || "");

        this.renderCopyright(imageDom, info);

        return {
            info,
            src: imageSrc,
            originalUrl: info.url || "",
            thumbUrl: info.thumburl || "",
            descriptionUrl: info.descriptionurl || ""
        };
    }

    // Commons API URL生成
    makeImageInfoApiUrl(fileTitle, thumbnailWidth = "") {
        const params = new URLSearchParams({
            action: "query",
            titles: fileTitle,
            format: "json",
            prop: "imageinfo",
            iiprop: "url|extmetadata",
            origin: "*"
        });

        if (thumbnailWidth !== "" && thumbnailWidth !== null && thumbnailWidth !== undefined) {
            params.set("iiurlwidth", String(thumbnailWidth));
        }

        return `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
    }

    // APIレスポンスから imageinfo を取り出す
    extractImageInfo(data, fileTitle = "") {
        const pages = data?.query?.pages;

        if (!pages) {
            console.warn("extractImageInfo: invalid API response.", fileTitle);
            return null;
        }

        const pageId = Object.keys(pages)[0];
        const page = pages[pageId];

        if (!page || page.missing !== undefined || !page.imageinfo) {
            return null;
        }

        return page.imageinfo[0] || null;
    }

    // サムネイル指定の有無に応じて使う画像URLを決める
    selectImageUrl(info, thumbnailWidth = "") {
        if (thumbnailWidth === "" || thumbnailWidth === null || thumbnailWidth === undefined) {
            return info.url || "";
        }

        return info.thumburl || info.url || "";
    }

    // Commons API のJSONを Cache Storage に保存して使う
    async fetchJsonWithCache(url, ttlMs = this.infoTtlMs) {
        if (!("caches" in window)) {
            const res = await fetch(url, { cache: "force-cache" });
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
            return await res.json();
        }

        const cache = await caches.open(this.infoCacheName);
        const cached = await cache.match(url);

        let staleData = null;

        if (cached) {
            try {
                const wrapped = await cached.json();

                if (wrapped && wrapped.cachedAt && wrapped.data) {
                    const age = Date.now() - wrapped.cachedAt;

                    if (age < ttlMs) {
                        //console.log("Wikimedia API cache hit:", url);
                        return wrapped.data;
                    }

                    // 期限切れでも、ネットワーク失敗時の保険として保持
                    staleData = wrapped.data;
                }
            } catch (e) {
                console.warn("Invalid Wikimedia API cache:", e);
            }
        }

        try {
            const res = await fetch(url, { cache: "force-cache" });
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);

            const data = await res.json();

            await cache.put(
                url,
                new Response(JSON.stringify({
                    cachedAt: Date.now(),
                    data
                }), {
                    headers: {
                        "Content-Type": "application/json"
                    }
                })
            );

            console.log("Wikimedia API cache stored:", url);
            return data;

        } catch (e) {
            if (staleData) {
                console.warn("Wikimedia API fetch failed. Use stale cache:", e);
                return staleData;
            }

            throw e;
        }
    }

    // 画像本体を Cache Storage に保存し、blob: URL として返す
    async getCachedImageSrc(imageUrl) {
        if (!imageUrl) return "";

        if (!("caches" in window)) {
            return imageUrl;
        }

        try {
            const res = await this.cacheImageFile(imageUrl);
            const blob = await res.blob();

            if (!blob || blob.size === 0) {
                throw new Error("Cached image blob is empty.");
            }

            return URL.createObjectURL(blob);

        } catch (e) {
            console.warn("Image Cache API failed. Fallback to original URL:", e);
            return imageUrl;
        }
    }

    // 画像本体を Cache Storage に保存し、Responseを返す
    async cacheImageFile(imageUrl) {
        if (!("caches" in window)) {
            const res = await fetch(imageUrl, {
                mode: "cors",
                cache: "force-cache"
            });

            if (!res.ok) {
                throw new Error(`Image HTTP error: ${res.status}`);
            }

            return res;
        }

        const cache = await caches.open(this.imageCacheName);
        let res = await cache.match(imageUrl);

        if (res) {
            //console.log("Wikimedia image cache hit:", imageUrl);
            return res;
        }

        res = await fetch(imageUrl, {
            mode: "cors",
            cache: "force-cache"
        });

        if (!res.ok) {
            throw new Error(`Image HTTP error: ${res.status}`);
        }

        await cache.put(imageUrl, res.clone());
        console.log("Wikimedia image cache stored:", imageUrl);

        return res;
    }

    // 画像に紐づく著作権表示を出力
    renderCopyright(imageDom, info) {
        if (!imageDom || !imageDom.id || !info) return;

        const copyright = document.getElementById(imageDom.id + "-copyright");
        if (copyright === null) return;

        const artist = info.extmetadata?.Artist?.value || "Unknown";
        const license = info.extmetadata?.LicenseShortName?.value || "Unknown";
        const descriptionUrl = info.descriptionurl || "#";

        copyright.innerHTML =
            `Image by ${artist} <a href="${descriptionUrl}" target="_blank" rel="noopener noreferrer">${license}</a>`;
    }

    // img要素に設定していた blob: URL を解放
    revokeImageBlobUrl(imageDom) {
        if (!imageDom?.dataset?.wikimediaBlobUrl) return;

        URL.revokeObjectURL(imageDom.dataset.wikimediaBlobUrl);
        delete imageDom.dataset.wikimediaBlobUrl;
    }

    // Wikimedia系キャッシュを削除
    async clearCache(options = {}) {
        const clearInfo = options.info ?? true;
        const clearImage = options.image ?? true;

        if (!("caches" in window)) return false;

        if (clearInfo) {
            await caches.delete(this.infoCacheName);
        }

        if (clearImage) {
            await caches.delete(this.imageCacheName);
        }

        console.log("Wikimedia caches cleared.", {
            info: clearInfo,
            image: clearImage
        });

        return true;
    }

    // キャッシュ名確認用
    getCacheNames() {
        return {
            info: this.infoCacheName,
            image: this.imageCacheName
        };
    }

    // リクエストキュー
    static RequestQueue = class {
        constructor(maxConcurrent = 4) {
            this.maxConcurrent = maxConcurrent;
            this.queue = [];
            this.activeCount = 0;
        }

        enqueue(task) {
            return new Promise((resolve, reject) => {
                this.queue.push(() => {
                    return task()
                        .then(resolve)
                        .catch(reject);
                });

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
    };
}

// window に明示的に公開
// 通常の <script src="./wikimedia-cachelib.js"></script> で利用する想定
window.WikimediaLib = WikimediaLib;
