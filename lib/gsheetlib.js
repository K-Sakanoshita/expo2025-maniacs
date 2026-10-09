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
        // GETにContent-Typeを付けるとCORSのpreflightが発生するため、共通ヘッダーはAcceptだけにする。
        // Basic認証のJSON書き込みでは_setWithBasicAuth()側でContent-Typeを追加する。
        this._headers = { "Accept": "application/json" };
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

    async _fetchJson(url, options = {}) {
        const response = await fetch(url, {
            mode: "cors",
            ...options,
            headers: { ...this._headers, ...(options.headers || {}) }
        });
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`);
            error.response = data;
            throw error;
        }
        return data;
    }

    _basicAuthorization(userid, passwd) {
        const bytes = new TextEncoder().encode(`${userid}:${passwd}`);
        let binary = "";
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        return `Basic ${btoa(binary)}`;
    }

    async _setWithBasicAuth(url, json, mode, userid, passwd) {
        const endpoint = new URL(url, location.href);
        const payload = { ...json };
        const activityId = String(payload.id || "").trim();
        const app = endpoint.searchParams.get("app") || String(payload.app || "").trim();

        if (app) payload.app = app;
        if (mode) payload.form_key = mode;

        let method = "POST";
        if (activityId) {
            method = "PUT";
            endpoint.searchParams.set("id", activityId);
        } else {
            delete payload.id;
        }

        const data = await this._fetchJson(endpoint.href, {
            method,
            headers: {
                "Authorization": this._basicAuthorization(userid, passwd),
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        return data && typeof data === "object" && !Array.isArray(data)
            ? { ...data, status: data.status || "ok" }
            : { status: "ok", data };
    }

    _jsonp(url, params = {}, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            const cb = "__jsonp_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
            params.callback = cb;
            const qs = new URLSearchParams(params);
            const s = document.createElement("script");
            s.src = url + (url.includes("?") ? "&" : "?") + qs.toString();
            let settled = false;
            const finish = (callback, keepLateCallback = false) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (keepLateCallback) {
                    window[cb] = () => { };
                    setTimeout(() => { delete window[cb]; }, 60000);
                } else {
                    delete window[cb];
                }
                s.remove();
                callback();
            };
            const timer = setTimeout(() => {
                finish(() => reject(new Error(`JSONP timeout after ${timeoutMs}ms`)), true);
            }, timeoutMs);
            s.onerror = () => finish(() => reject(new Error("JSONP load error")));
            window[cb] = (payload) => finish(() => resolve(payload));
            document.head.appendChild(s);
        });
    }

    // ===== 互換API =====

    // サーバーからデータを収集する（互換）
    async get(GET_Url, options = {}) {
        if (!GET_Url) return [];
        console.log("GoogleSpreadSheet: GET:", GET_Url);

        try {
            const data = this._shouldUseJsonp(GET_Url)
                ? await this._jsonp(GET_Url)
                : await this._fetchJson(GET_Url);

            if (options.throwOnError && !Array.isArray(data)) throw new Error("Invalid Activity response");
            const json = Array.isArray(data) ? data : [];
            this.last_getdate = new Date();
            console.log("[success]GoogleSpreadSheet: GET OK");
            return this._sanitizeRows(json);
        } catch (err) {
            console.error("GoogleSpreadSheet: GET NG", err);
            if (options.throwOnError) throw err;
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
    async set(GET_Url, json, mode, userid, passwd, options = {}) {
        if (!GET_Url) return [];
        const authMode = String(options.authMode || "legacy").toLowerCase();
        if (authMode === "basic") {
            console.log("GoogleSpreadSheet: SET:", { mode, authMode, id: json?.id || "" });
            try {
                const data = await this._setWithBasicAuth(GET_Url, json, mode, userid, passwd);
                console.log("[success]GoogleSpreadSheet: SET OK");
                return data;
            } catch (err) {
                console.error("GoogleSpreadSheet: SET NG", err);
                return {
                    status: "error",
                    code: err?.response?.code || "request_failed",
                    errors: err?.response?.errors || {}
                };
            }
        }

        // 元の実装と同じく配列化＆&をエスケープ
        let payload = JSON.stringify([json]).replace(/\&/g, "%26");
        const params = { json: payload, mode, userid, passwd };
        console.log("GoogleSpreadSheet: SET:", { mode, authMode, id: json?.id || "" });

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

    // Activityを論理削除する。Basic認証APIはDELETE、従来GASは認証済みJSONPを使う。
    async remove(GET_Url, id, userid, passwd, options = {}) {
        if (!GET_Url || !id) return { status: "error", code: "invalid_request" };
        const authMode = String(options.authMode || "legacy").toLowerCase();
        if (authMode === "legacy") {
            const params = {
                json: JSON.stringify([{ id }]),
                mode: "activity_delete",
                userid,
                passwd
            };
            console.log("GoogleSpreadSheet: DELETE:", { authMode, id });
            try {
                const data = this._shouldUseJsonp(GET_Url)
                    ? await this._jsonp(GET_Url, params)
                    : await this._fetchJson(GET_Url + (GET_Url.includes("?") ? "&" : "?") + new URLSearchParams(params));
                console.log("[success]GoogleSpreadSheet: DELETE OK");
                return data;
            } catch (err) {
                console.error("GoogleSpreadSheet: DELETE NG", err);
                return { status: "error", code: "request_failed" };
            }
        }

        const endpoint = new URL(GET_Url, location.href);
        endpoint.searchParams.set("id", id);
        console.log("GoogleSpreadSheet: DELETE:", { authMode, id });
        try {
            const data = await this._fetchJson(endpoint.href, {
                method: "DELETE",
                headers: { "Authorization": this._basicAuthorization(userid, passwd) }
            });
            console.log("[success]GoogleSpreadSheet: DELETE OK");
            return data && typeof data === "object"
                ? { ...data, status: data.status || "ok" }
                : { status: "ok" };
        } catch (err) {
            console.error("GoogleSpreadSheet: DELETE NG", err);
            return {
                status: "error",
                code: err?.response?.code || "request_failed",
                errors: err?.response?.errors || {}
            };
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
