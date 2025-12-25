// Google Spreadsheet Class Library Script (compat w/ CORS & JSONP)
// drop-in replacement
"use strict";

class GoogleSpreadSheet {
    /**
     * @param {{transport?: 'auto'|'fetch'|'jsonp'}} [opts]
     *   transport: 'auto' (default) = URLに応じて自動選択
     *              'fetch'           = 常にfetch
     *              'jsonp'           = 常にJSONP
     */
    constructor(opts = {}) {
        this.last_getdate = "";
        this.transport = opts.transport || "auto";
        this._headers = { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" };
    }

    // ===== 内部ユーティリティ =====
    _isGAS(url) {
        try {
            const u = new URL(url, location.href);
            // Apps Script の exec エンドポイントを判定
            return /(^|\.)script\.google\.com$/i.test(u.hostname) && /\/exec$/.test(u.pathname);
        } catch {
            return false;
        }
    }

    _shouldUseJsonp(url) {
        if (this.transport === "jsonp") return true;
        if (this.transport === "fetch") return false;
        // auto: GAS は JSONP、それ以外は fetch を試みる
        return this._isGAS(url);
    }

    _sanitizeRows(json) {
        const pattern = /on[\w]+=[\"\']?[^>]*[\"\']?>/si;
        json.forEach(val => {
            Object.keys(val).forEach(key => {
                if (typeof val[key] === "string") {
                    val[key] = val[key].replace(pattern, ">");
                }
            });
        });
        return json;
    }

    _fetchJson(url) {
        return fetch(url, { mode: "cors", headers: this._headers }).then(r => r.json());
    }

    _jsonp(url, params = {}) {
        return new Promise((resolve, reject) => {
            const cb = "__jsonp_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
            params.callback = cb;
            const qs = new URLSearchParams(params);
            const s = document.createElement("script");
            s.src = url + (url.includes("?") ? "&" : "?") + qs.toString();
            s.onerror = () => { delete window[cb]; reject(new Error("JSONP load error")); };
            window[cb] = (payload) => { try { resolve(payload); } finally { delete window[cb]; s.remove(); } };
            document.head.appendChild(s);
        });
    }

    // ===== 互換API =====

    // サーバーからデータを収集する（互換）
    async get(GET_Url) {
        if (!GET_Url) return [];
        console.log("GoogleSpreadSheet: GET:", GET_Url);

        try {
            const data = this._shouldUseJsonp(GET_Url)
                ? await this._jsonp(GET_Url)
                : await this._fetchJson(GET_Url);

            const json = Array.isArray(data) ? data : [];
            this.last_getdate = new Date();
            console.log("[success]GoogleSpreadSheet: GET OK");
            return this._sanitizeRows(json);
        } catch (err) {
            console.error("GoogleSpreadSheet: GET NG", err);
            return [];
        }
    }

    // サーバーからSaltを取得する（互換）
    async get_salt(GET_Url, userid) {
        if (!GET_Url) return [];
        const params = { userid };
        console.log("GoogleSpreadSheet: GET_SALT:", GET_Url, params);

        try {
            const data = this._shouldUseJsonp(GET_Url)
                ? await this._jsonp(GET_Url, params)
                : await this._fetchJson(GET_Url + (GET_Url.includes("?") ? "&" : "?") + new URLSearchParams(params));

            console.log("[success]GoogleSpreadSheet: GET_SALT OK");
            return data;
        } catch (err) {
            console.error("GoogleSpreadSheet: GET_SALT NG", err);
            return [];
        }
    }

    // サーバーにデータを投稿する(1件)（互換：GETクエリ送信）
    async set(GET_Url, json, mode, userid, passwd) {
        if (!GET_Url) return [];
        // 元の実装と同じく配列化＆&をエスケープ
        let payload = JSON.stringify([json]).replace(/\&/g, "%26");
        const params = { json: payload, mode, userid, passwd };
        console.log("GoogleSpreadSheet: SET:", params);

        try {
            const data = this._shouldUseJsonp(GET_Url)
                ? await this._jsonp(GET_Url, params)
                : await this._fetchJson(GET_Url + (GET_Url.includes("?") ? "&" : "?") + new URLSearchParams(params));

            console.log("[success]GoogleSpreadSheet: SET OK");
            return data;
        } catch (err) {
            console.error("GoogleSpreadSheet: SET NG", err);
            return [];
        }
    }

    // サーバーにデータを投稿する(複数)（互換：GETクエリ送信）
    async sets(GET_Url, commits) {
        if (!GET_Url) return [];
        const params = { json: JSON.stringify(commits) };
        console.log("GoogleSpreadSheet: SETS:", commits?.length ?? 0);

        try {
            const data = this._shouldUseJsonp(GET_Url)
                ? await this._jsonp(GET_Url, params)
                : await this._fetchJson(GET_Url + (GET_Url.includes("?") ? "&" : "?") + new URLSearchParams(params));

            console.log("[success]GoogleSpreadSheet: SETS OK");
            return data;
        } catch (err) {
            console.error("GoogleSpreadSheet: SETS NG", err);
            return [];
        }
    }
}