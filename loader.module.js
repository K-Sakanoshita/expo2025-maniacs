// loader.module.js
(async () => {
    // このファイルの場所を基準に manifest.json を解決
    const manifestUrl = new URL("./manifest.json", import.meta.url);
    const res = await fetch(manifestUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error(`manifest.json load failed: ${res.status}`);
    const { styles = [], scripts = [], gId = "" } = await res.json();

    // 1) CSS を追加
    for (const href of styles) {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href.trim();
        l.crossOrigin = "anonymous";
        document.head.appendChild(l);
    }

    // 2) 従来（非モジュール）JSを順にロード（依存順を維持）
    scripts.push("https://www.googletagmanager.com/gtag/js?" + gId)
    for (const src of scripts) {
        await new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src.trim();
            s.defer = true;                 // HTMLをブロックしない
            s.onload = resolve;
            s.onerror = () => reject(new Error(`Failed to load: ${src}`));
            document.head.appendChild(s);
        });
    }

    // 3) Google Analyticsの設定
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', gId, { 'cookie_domain': 'armd-02.github.io' });

    // 4) 初期化
    cMapMaker.init();

})();