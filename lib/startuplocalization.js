// Startup text must be available before the translation library or configuration loads.
(() => {
    const language = window.navigator.language || window.navigator.userLanguage || window.navigator.browserLanguage || "en";
    const lang = language.toLowerCase().startsWith("ja") ? "ja" : "en";
    const messages = {
        "app": ["アプリを読み込んでいます…", "Loading the app…"],
        "files": ["必要なファイルを確認しています…", "Checking required files…"],
        "libraries": ["地図ライブラリを読み込んでいます…", "Loading map libraries…"],
        "settings": ["設定を読み込んでいます…", "Loading settings…"],
        "config": ["設定ファイルを読み込んでいます…", "Loading configuration files…"],
        "failed": ["読み込みに失敗しました。通信を確認して再読み込みしてください。", "Loading failed. Check your connection and reload."],
        "mapFailed": ["地図の読み込みに失敗しました。通信を確認して再読み込みしてください。", "The map could not load. Check your connection and reload."],
        "configFailed": ["設定ファイルの読み込みに失敗しました。再読み込みしてください。", "Configuration files could not load. Please reload."],
        "retry": ["再読み込み", "Reload"],
        "title": [document.title || "Community Map Maker", document.title || "Community Map Maker"]
    };
    window.APP_LANGUAGE = lang;
    window.startupText = key => messages[key]?.[lang === "ja" ? 0 : 1] || key;
    document.documentElement.lang = lang;
    if (lang === "en") document.title = window.startupText("title");
    window.initStartupLocalization = () => {
        document.getElementById("startupStatusMessage").textContent = window.startupText("app");
        document.getElementById("startupRetry").textContent = window.startupText("retry");
        const image = document.querySelector(".startup-splash-image");
        image.alt = window.startupText("title");
    };
})();
