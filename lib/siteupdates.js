// Site-authored notices, separate from the geographic change feed.
class SiteUpdatesController {
    constructor(config, language = "ja") {
        this.config = config;
        this.language = language;
        this.saved = new Map();
        this.opening = false;
    }

    localDate() {
        const now = new Date();
        return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"),
            String(now.getDate()).padStart(2, "0")].join("-");
    }

    key(suffix) { return `${this.config.storageKey || "cmapmaker.site-updates"}.${suffix}`; }

    read(suffix) {
        try { return window.localStorage.getItem(this.key(suffix)) || this.saved.get(suffix); }
        catch { return this.saved.get(suffix); }
    }

    write(suffix, value) {
        this.saved.set(suffix, value);
        try { window.localStorage.setItem(this.key(suffix), value); } catch {}
    }

    shouldShow() {
        if (this.config.use !== true) return false;
        switch (this.config.autoOpen) {
            case "daily": return this.read("date") !== this.localDate();
            case "version": return Boolean(this.config.version) && this.read("version") !== this.config.version;
            case "always": return true;
            default: return false;
        }
    }

    localized(value) {
        return typeof value === "string" ? value : value?.[this.language] || value?.en || value?.ja || "";
    }

    async prepare() {
        if (this.modal) return;
        const rawUrl = this.localized(this.config.contentUrl);
        if (!rawUrl) throw new Error("siteUpdates.contentUrl is missing");
        const url = new URL(rawUrl, location.href);
        if (this.config.version) url.searchParams.set("ver", this.config.version);
        const response = await fetch(url.href, { cache: "no-cache" });
        if (!response.ok) throw new Error(`Site updates load failed: HTTP ${response.status}`);
        this.modal = new AppModal({
            id: "siteUpdatesModal",
            title: this.localized(this.config.title),
            html: await response.text(),
            closeLabel: typeof glot === "undefined" ? undefined : glot.get("button_close"),
            size: this.config.size,
            onShown: () => {
                this.write("date", this.localDate());
                if (this.config.version) this.write("version", this.config.version);
            }
        });
    }

    async autoShow() {
        if (this.opening || this.modal?.isOpen || !this.shouldShow()) return false;
        this.opening = true;
        try {
            await this.prepare();
            // Do not cover the startup splash or another modal.
            const waitForScreen = () => new Promise(resolve => {
                const check = () => {
                    const splash = document.getElementById("startupStatus");
                    if ((!splash || splash.hidden) && !document.querySelector(".modal.show")) resolve();
                    else window.requestAnimationFrame(check);
                };
                check();
            });
            await waitForScreen();
            const delay = Math.max(0, Number(this.config.delayMs) || 0);
            if (delay) {
                await new Promise(resolve => window.setTimeout(resolve, delay));
                await waitForScreen();
            }
            if (!this.shouldShow()) return false;
            this.modal.show();
            return true;
        } catch (error) {
            console.warn("Site updates could not be displayed", error);
            return false;
        } finally { this.opening = false; }
    }
}
