// loader_module_fast_v2.js
const STARTUP_STATUS_MIN_VISIBLE_MS = 2000;
const startupStatusShownAt = Date.now();
let startupStatusHideTimer = null;

const setStartupStatus = (message, error = false) => {
    const status = document.getElementById("startupStatus");
    const text = document.getElementById("startupStatusMessage");
    if (!status || !text) return;
    if (startupStatusHideTimer !== null) {
        clearTimeout(startupStatusHideTimer);
        startupStatusHideTimer = null;
    }
    text.textContent = message;
    status.dataset.error = String(error);
    status.hidden = false;
};
const hideStartupStatus = () => {
    const status = document.getElementById("startupStatus");
    if (!status) return;

    const hide = () => {
        status.hidden = true;
        startupStatusHideTimer = null;
    };
    const remaining = STARTUP_STATUS_MIN_VISIBLE_MS - (Date.now() - startupStatusShownAt);
    if (remaining <= 0) {
        hide();
    } else {
        startupStatusHideTimer = setTimeout(hide, remaining);
    }
};
window.setStartupStatus = setStartupStatus;
window.hideStartupStatus = hideStartupStatus;

(async () => {
    const loaderUrl = new URL(import.meta.url);
    const assetVersion = loaderUrl.searchParams.get("ver") || "";
    const manifestUrl = new URL("./manifest.json", loaderUrl);
    if (assetVersion) manifestUrl.searchParams.set("ver", assetVersion);

    const withAssetVersion = (rawUrl) => {
        const url = new URL(rawUrl, loaderUrl);
        if (!assetVersion || url.origin !== location.origin) return rawUrl;
        url.searchParams.set("ver", assetVersion);
        return url.href;
    };
    window.APP_ASSET_VERSION = assetVersion;
    window.withAppAssetVersion = withAssetVersion;

    // no-cache は毎回 manifest を取りに行くので、通常は避ける。
    // 更新反映を確実にしたい場合は loader_module_fast_v2.js?ver=20260429 のように
    // HTML側でクエリ文字列を付ける方が扱いやすい。
    setStartupStatus(window.startupText("files"));
    const res = await fetch(manifestUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`manifest load failed: ${res.status}`);

    const manifest = await res.json();
    const {
        styles = [],
        scripts = [],
        scriptGroups = [],
        lazyScriptGroups = {},
        gId = ""
    } = manifest;

    const trimNonEmpty = (items) =>
        (items || []).map(v => String(v).trim()).filter(Boolean);

    function loadStyle(href) {
        return new Promise((resolve, reject) => {
            const rawUrl = href.trim();
            if (!rawUrl) return resolve();
            const url = withAssetVersion(rawUrl);

            // 二重読み込み防止
            if (document.querySelector(`link[rel="stylesheet"][href="${CSS.escape(url)}"]`)) {
                return resolve();
            }

            const l = document.createElement("link");
            l.rel = "stylesheet";
            l.href = url;
            l.crossOrigin = "anonymous";
            const timer = setTimeout(() => {
                l.remove();
                reject(new Error(`Stylesheet load timed out: ${url}`));
            }, 30000);
            l.onload = () => {
                clearTimeout(timer);
                resolve();
            };
            l.onerror = () => {
                clearTimeout(timer);
                reject(new Error(`Failed to load stylesheet: ${url}`));
            };
            document.head.appendChild(l);
        });
    }

    function loadScript(src, { ordered = false } = {}) {
        return new Promise((resolve, reject) => {
            const rawUrl = src.trim();
            if (!rawUrl) return resolve();
            const url = withAssetVersion(rawUrl);

            // 二重読み込み防止
            if (document.querySelector(`script[src="${CSS.escape(url)}"]`)) {
                return resolve();
            }

            const s = document.createElement("script");
            s.src = url;

            // 動的追加 script は async 扱いになりやすい。
            // 依存順を維持したいものは async=false にしておく。
            s.async = !ordered;
            s.defer = true;

            const timer = setTimeout(() => {
                s.remove();
                reject(new Error(`Script load timed out: ${url}`));
            }, 30000);
            s.onload = () => {
                clearTimeout(timer);
                resolve();
            };
            s.onerror = () => {
                clearTimeout(timer);
                reject(new Error(`Failed to load script: ${url}`));
            };
            document.head.appendChild(s);
        });
    }

    const lazyGroupPromises = new Map();
    window.loadLazyScriptGroup = (name) => {
        if (lazyGroupPromises.has(name)) return lazyGroupPromises.get(name);

        const group = lazyScriptGroups[name];
        if (!group) return Promise.reject(new Error(`Unknown lazy script group: ${name}`));

        const groupScripts = trimNonEmpty(group.scripts);
        const promise = group.parallel
            ? Promise.all(groupScripts.map(src => loadScript(src, { ordered: false })))
            : groupScripts.reduce(
                (chain, src) => chain.then(() => loadScript(src, { ordered: true })),
                Promise.resolve()
            );

        lazyGroupPromises.set(name, promise);
        promise.catch(() => lazyGroupPromises.delete(name));
        return promise;
    };

    // CSSとJSの通信を同時に開始し、初回読み込みの直列待ちをなくす。
    const stylesReady = Promise.all(trimNonEmpty(styles).map(loadStyle));
    setStartupStatus(window.startupText("libraries"));

    const scriptsReady = (async () => {
        // 後方互換: scriptGroups が無い場合は従来通り scripts を順番に読む。
        if (scriptGroups.length === 0) {
            for (const src of trimNonEmpty(scripts)) {
                await loadScript(src, { ordered: true });
            }
        } else {
            for (const group of scriptGroups) {
                const groupScripts = trimNonEmpty(group.scripts);
                if (group.parallel) {
                    await Promise.all(groupScripts.map(src => loadScript(src, { ordered: false })));
                } else {
                    for (const src of groupScripts) {
                        await loadScript(src, { ordered: true });
                    }
                }
            }
        }
    })();

    // 初期化時にはCSSとJSの両方が揃っていることを保証する。
    await Promise.all([stylesReady, scriptsReady]);

    // Google Analytics は本体初期化を待たせない。
    // gtag.js の URL は ?id=G-XXXX が正しい。
    if (gId) {
        window.dataLayer = window.dataLayer || [];
        window.gtag = window.gtag || function () {
            window.dataLayer.push(arguments);
        };

        window.gtag("js", new Date());
        window.gtag("config", gId);

        loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gId)}`, {
            ordered: false
        }).catch(err => {
            console.warn(err);
        });
    }

    setStartupStatus(window.startupText("settings"));
    cMapMaker.init();
})().catch((error) => {
    console.error("Application loader failed", error);
    setStartupStatus(window.startupText("failed"), true);
});
