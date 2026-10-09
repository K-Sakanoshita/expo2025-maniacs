// News display only. Data loading and map-based selection live in HistoricalNewsController.
class NewsTicker {
    constructor() {
        this.config = {};
        this.container = null;
        this.element = null;
        this.content = null;
        this.activeItem = null;
        this.sourceLink = null;
        this.previousButton = null;
        this.nextButton = null;
        this.currentEvents = [];
        this.resizeHandler = null;
        this.timer = null;
        this.currentKey = "";
        this.currentIndex = 0;
        this.dragState = null;
        this.suppressClickUntil = 0;
        this.toggleButton = null;
        this.isOpen = false;
    }

    init(container, config = {}) {
        this.container = container;
        this.config = config;
        this.createElement();
    }

    setItems(events, { key = "", ariaLabel = this.label("news", "ニュース") } = {}) {
        if (!Array.isArray(events) || (events.length === 0 && !this.config.buttonHosts)) {
            this.hide();
            return;
        }
        if (!this.element) this.createElement();
        if (!this.element || (key && key === this.currentKey && this.currentEvents.length)) return;
        this.stopTimer();
        this.currentKey = key;
        this.currentIndex = 0;
        this.currentEvents = events;
        this.updateNavigationButtons();
        this.element.setAttribute("aria-label", ariaLabel);
        if (this.config.modal) {
            this.toggleButton.hidden = false;
            this.updateModalButton();
            this.renderList();
            return;
        }
        if (this.config.collapsible) {
            this.toggleButton.hidden = false;
            this.toggleButton.textContent = this.isOpen ? this.label("close", "閉じる") : this.label("newCount", "新着 {count}件", { count: events.length });
            this.toggleButton.setAttribute("aria-expanded", String(this.isOpen));
            this.element.hidden = !this.isOpen;
            this.renderList();
            return;
        }
        this.element.hidden = false;
        this.render(events[0]);
        this.startTimer();
    }

    createElement() {
        if (this.element || !this.container) return;
        if (this.config.modal) {
            this.createModal();
            return;
        }

        this.element = document.createElement("aside");
        this.element.id = this.config.id || "newsTicker";
        this.element.className = this.config.collapsible ? "news-ticker news-ticker--collapsible" : "news-ticker";
        this.element.hidden = true;
        this.element.setAttribute("aria-label", this.config.ariaLabel || this.label("news", "ニュース"));

        this.previousButton = this.createNavigationButton("◀", "▲", this.label("previous", "前のニュースを表示"));
        this.previousButton.addEventListener("click", () => this.showPrevious());

        this.content = document.createElement("div");
        this.content.className = "news-ticker__content";
        this.content.setAttribute("aria-live", "polite");
        this.content.addEventListener("pointerdown", (event) => this.startDrag(event));
        this.content.addEventListener("pointermove", (event) => this.moveDrag(event));
        this.content.addEventListener("pointerup", (event) => this.endDrag(event));
        this.content.addEventListener("pointercancel", (event) => this.cancelDrag(event));
        this.content.addEventListener("dragstart", (event) => event.preventDefault());
        this.content.addEventListener("click", (event) => {
            if (Date.now() > this.suppressClickUntil) return;
            event.preventDefault();
            event.stopPropagation();
            this.suppressClickUntil = 0;
        }, true);

        this.nextButton = this.createNavigationButton("▶", "▼", this.label("next", "次のニュースを表示"));
        this.nextButton.addEventListener("click", () => this.showNext());

        this.sourceLink = document.createElement("a");
        this.sourceLink.className = "news-ticker__source";
        this.sourceLink.href = this.config.sourceHref || "";
        this.sourceLink.target = "_blank";
        this.sourceLink.rel = "noopener noreferrer";
        this.sourceLink.textContent = this.config.sourceLabel || "";
        this.element.append(this.previousButton, this.content, this.nextButton);
        if (this.config.sourceHref) this.element.appendChild(this.sourceLink);
        if (this.config.collapsible) {
            this.content.classList.add("news-ticker__content--list");
            this.toggleButton = document.createElement("button");
            this.toggleButton.type = "button";
            this.toggleButton.className = "news-ticker-toggle";
            this.toggleButton.hidden = true;
            this.toggleButton.setAttribute("aria-controls", this.element.id);
            this.toggleButton.setAttribute("aria-expanded", "false");
            this.toggleButton.addEventListener("click", () => this.toggle());
            this.container.appendChild(this.toggleButton);
        }
        this.container.appendChild(this.element);

        this.resizeHandler = () => this.updateHeadlineScroll();
        window.addEventListener("resize", this.resizeHandler);
    }

    createModal() {
        this.element = document.createElement("div");
        this.element.id = this.config.id || "changesModal";
        this.element.className = "modal changes-modal";
        this.element.tabIndex = -1;
        this.element.setAttribute("aria-hidden", "true");
        const dialog = document.createElement("div");
        dialog.className = "modal-dialog modal-dialog-centered modal-dialog-scrollable";
        const panel = document.createElement("div");
        panel.className = "modal-content";
        const title = document.createElement("h2");
        title.id = `${this.element.id}Title`;
        title.textContent = this.config.mobileLabel || this.label("updatesTitle", "新着情報");
        this.element.setAttribute("aria-labelledby", title.id);
        const header = document.createElement("div");
        header.className = "modal-header app-modal-header changes-modal__header";
        const close = document.createElement("button");
        close.type = "button";
        close.className = "btn btn-light border-secondary app-modal-close";
        close.setAttribute("data-bs-dismiss", "modal");
        close.setAttribute("aria-label", this.label("close", "閉じる"));
        const closeIcon = document.createElement("i");
        closeIcon.className = "fas fa-xmark";
        closeIcon.setAttribute("aria-hidden", "true");
        close.appendChild(closeIcon);
        close.addEventListener("click", () => this.modalInstance.hide());
        header.append(title, close);
        this.content = document.createElement("div");
        this.content.className = "modal-body changes-modal__list";
        const guide = document.createElement("p");
        guide.className = "changes-modal__guide";
        guide.textContent = this.label("guide", "項目を押すと地図と詳細を表示します");
        panel.append(header, guide, this.content);
        dialog.appendChild(panel);
        this.element.appendChild(dialog);
        this.element.addEventListener("hidden.bs.modal", () => {
            this.isOpen = false;
            this.seenObserver?.disconnect();
            this.toggleButton.setAttribute("aria-expanded", "false");
            this.toggleButton.focus();
        });
        this.toggleButton = document.createElement("button");
        this.toggleButton.type = "button";
        this.toggleButton.className = this.config.buttonHosts ? "changes-button poi-toolbar-button btn btn-sm btn-outline-primary" : "news-ticker-toggle";
        this.toggleButton.hidden = true;
        this.toggleButton.setAttribute("aria-controls", this.element.id);
        this.toggleButton.setAttribute("aria-haspopup", "dialog");
        this.toggleButton.setAttribute("aria-expanded", "false");
        this.toggleButton.addEventListener("click", () => this.toggle());
        this.container.appendChild(this.toggleButton);
        if (this.config.buttonHosts) {
            this.buttonMedia = window.matchMedia("(min-width: 1080px)");
            this.placeModalButton();
            this.buttonMedia.addEventListener?.("change", () => this.placeModalButton());
        }
        document.body.appendChild(this.element);
        this.modalInstance = bootstrap.Modal.getOrCreateInstance(this.element);
        this.element.addEventListener("show.bs.modal", () => {
            this.isOpen = true;
            this.toggleButton.setAttribute("aria-expanded", "true");
        });
        this.element.addEventListener("shown.bs.modal", () => this.observeVisibleItems());
    }

    placeModalButton() {
        const hostId = this.buttonMedia.matches ? this.config.buttonHosts.desktop : this.config.buttonHosts.mobile;
        const host = document.getElementById?.(hostId);
        if (host) host.appendChild(this.toggleButton);
    }

    itemSignature() {
        return JSON.stringify(this.currentEvents.map(event => [event.osmId, event.activityId, event.timestamp, event.date, event.headline]).sort());
    }

    label(key, fallback, params = {}) {
        const value = typeof glot === "undefined" ? null : glot.get(`changeFeed_${key}`);
        const template = value && value !== `changeFeed_${key}` ? value : fallback;
        return String(template).replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match);
    }

    eventKey(event) {
        return JSON.stringify([event.osmId, event.activityId || "", event.kind, event.timestamp || event.date]);
    }

    seenEvents() {
        if (this.seenKeys) return this.seenKeys;
        let saved;
        try { saved = JSON.parse(window.localStorage?.getItem(this.config.seenStorageKey)); } catch {}
        this.seenKeys = new Set(Array.isArray(saved) ? saved.filter(key => typeof key === "string") : []);
        return this.seenKeys;
    }

    unreadEvents(events = this.currentEvents) {
        const seen = this.seenEvents();
        return [...new Map(events.map(event => [this.eventKey(event), event])).values()]
            .filter(event => !seen.has(this.eventKey(event)));
    }

    markEventsSeen(events) {
        const seen = this.seenEvents();
        events.forEach(event => { const key = this.eventKey(event); seen.delete(key); seen.add(key); });
        this.seenKeys = new Set([...seen].slice(-1000));
        if (this.config.seenStorageKey) {
            try { window.localStorage?.setItem(this.config.seenStorageKey, JSON.stringify([...this.seenKeys])); } catch {}
        }
        this.updateModalButton();
    }

    eventGroups() {
        const groups = new Map();
        for (const event of this.currentEvents) {
            const key = event.placeId || event.osmId || this.eventKey(event);
            if (!groups.has(key)) groups.set(key, []);
            const events = groups.get(key);
            if (!events.some(item => this.eventKey(item) === this.eventKey(event))) events.push(event);
        }
        const origin = typeof mapLibre === "undefined" ? null : mapLibre.getUserLocation?.()
            || (() => { const center = mapLibre.map?.getCenter?.(); return center ? [center.lng, center.lat] : null; })();
        const distance = event => {
            const coordinates = event.coordinates;
            if (!origin || !Array.isArray(coordinates) || !coordinates.every(Number.isFinite)) return Infinity;
            const rad = value => value * Math.PI / 180;
            const a = Math.sin(rad(coordinates[1] - origin[1]) / 2) ** 2
                + Math.cos(rad(origin[1])) * Math.cos(rad(coordinates[1]))
                * Math.sin(rad(coordinates[0] - origin[0]) / 2) ** 2;
            return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
        };
        return [...groups.values()].map(events => {
            events.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const section = events.some(event => event.section === "favorite") ? "favorite"
                : events.some(event => event.section === "visited") ? "visited" : "other";
            return { events, section, distance: distance(events.find(event => event.coordinates) || events[0]) };
        }).sort((a, b) => Number(Boolean(this.unreadEvents(b.events).length)) - Number(Boolean(this.unreadEvents(a.events).length))
            || a.distance - b.distance || (b.events[0].timestamp || 0) - (a.events[0].timestamp || 0));
    }

    observeVisibleItems() {
        this.seenObserver?.disconnect();
        if (!this.isOpen || !this.config.groupByPlace || typeof IntersectionObserver === "undefined") return;
        this.seenObserver = new IntersectionObserver(entries => {
            if (!this.isOpen) return;
            const visible = entries.filter(entry => entry.isIntersecting && entry.intersectionRatio >= 0.25)
                .flatMap(entry => entry.target.changeEvents || [entry.target.changeEvent]).filter(Boolean);
            if (visible.length) this.markEventsSeen(visible);
        }, { root: this.content, threshold: 0.25 });
        this.content.querySelectorAll(".changes-modal__item").forEach(item => this.seenObserver.observe(item));
    }

    updateModalButton() {
        if (this.config.groupByPlace) {
            const unread = this.unreadEvents().length;
            const count = document.createElement("span");
            count.className = "changes-button__count";
            count.textContent = String(unread);
            const label = document.createElement("span");
            label.textContent = this.label("button", "更新") + " ";
            this.toggleButton.replaceChildren(label, count);
            this.toggleButton.classList.toggle("has-unread", unread > 0);
            this.toggleButton.setAttribute("aria-label", this.label("unreadCount", "未確認の更新 {count}件").replace("{count}", String(unread)));
            this.toggleButton.title = this.label("scope", "取得済みの更新情報。近所の更新をすべて含むとは限りません");
            return;
        }
        if (!this.config.buttonHosts) {
            this.toggleButton.textContent = this.label("newCount", "新着 {count}件", { count: this.currentEvents.length });
            return;
        }
        let seen = "";
        try { seen = window.localStorage?.getItem(this.config.seenStorageKey) || ""; } catch (_) {}
        const unread = this.currentEvents.length > 0 && seen !== this.itemSignature();
        this.toggleButton.classList.toggle("has-unread", unread);
        this.toggleButton.setAttribute("aria-label", this.label("newCount", "新着 {count}件", { count: this.currentEvents.length }) + (unread ? ` · ${this.label("unseenNotice", "未確認の更新があります")}` : ""));
        const count = document.createElement("span");
        count.className = "changes-button__count";
        count.textContent = String(this.currentEvents.length);
        const label = document.createElement("span");
        label.textContent = this.label("newPrefix", "新着 ");
        this.toggleButton.replaceChildren(label, count);
        this.toggleButton.title = unread ? this.label("unseenNotice", "未確認の更新があります") : this.label("reviewsTitle", "公園／遊具の口コミや情報更新");
    }

    markModalSeen() {
        if (!this.config.seenStorageKey) return;
        try { window.localStorage?.setItem(this.config.seenStorageKey, this.itemSignature()); } catch (_) {}
        this.updateModalButton();
    }

    createNavigationButton(desktopLabel, mobileLabel, ariaLabel) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "news-ticker__button";
        button.setAttribute("aria-label", ariaLabel);

        const desktopIcon = document.createElement("span");
        desktopIcon.className = "news-ticker__button-icon news-ticker__button-icon--desktop";
        desktopIcon.textContent = desktopLabel;
        desktopIcon.setAttribute("aria-hidden", "true");

        const mobileIcon = document.createElement("span");
        mobileIcon.className = "news-ticker__button-icon news-ticker__button-icon--mobile";
        mobileIcon.textContent = mobileLabel;
        mobileIcon.setAttribute("aria-hidden", "true");

        button.append(desktopIcon, mobileIcon);
        button.disabled = true;
        return button;
    }

    async toggle() {
        if (this.opening) return;
        if (!this.currentEvents.length && !this.config.buttonHosts) return;
        if (this.config.modal) {
            if (!this.isOpen && this.config.itemsProvider) {
                this.opening = true;
                this.toggleButton.disabled = true;
                try {
                    this.setItems(await this.config.itemsProvider(), { ariaLabel: this.config.mobileLabel || this.label("updatesTitle", "新着情報") });
                } finally {
                    this.opening = false;
                    this.toggleButton.disabled = false;
                }
                if (!this.currentEvents.length && !this.config.buttonHosts) return;
            }
            if (this.isOpen) this.modalInstance.hide();
            else {
                this.modalInstance.show();
                this.isOpen = true;
                if (!this.config.groupByPlace) this.markModalSeen();
                this.renderList();
                this.toggleButton.setAttribute("aria-expanded", "true");
            }
            return;
        }
        this.isOpen = !this.isOpen;
        this.element.hidden = !this.isOpen;
        this.toggleButton.textContent = this.isOpen ? this.label("close", "閉じる") : this.label("newCount", "新着 {count}件", { count: this.currentEvents.length });
        this.toggleButton.setAttribute("aria-expanded", String(this.isOpen));
    }

    renderList() {
        if (this.config.groupByPlace) {
            const sections = [];
            const notice = document.createElement("p");
            notice.className = "changes-modal__empty";
            notice.textContent = this.label("scope", "取得済みの更新情報。近所の更新をすべて含むとは限りません");
            sections.push(notice);
            const groups = this.eventGroups();
            for (const key of ["favorite", "visited", "other"]) {
                const selected = groups.filter(group => group.section === key);
                if (!selected.length) continue;
                const section = document.createElement("section");
                const heading = document.createElement("h3");
                heading.className = "changes-modal__section-title";
                heading.textContent = `${this.label(key, key)} (${selected.length})`;
                section.appendChild(heading);
                for (const group of selected) {
                    const container = document.createElement("div");
                    container.className = "change-feed-group";
                    const item = this.createItem(group.events[0], group.events);
                    if (group.events.length > 1) {
                        const summary = document.createElement("small");
                        const reviews = group.events.filter(event => event.activityId).length;
                        summary.className = "change-feed-summary";
                        summary.textContent = [reviews ? this.label("reviewCount", "口コミ {count}件").replace("{count}", String(reviews)) : "",
                            group.events.length > reviews ? this.label("mapCount", "地図情報 {count}件").replace("{count}", String(group.events.length - reviews)) : ""].filter(Boolean).join(" · ");
                        item.appendChild(summary);
                    }
                    container.appendChild(item);
                    if (group.events.length > 1) {
                        const details = document.createElement("details");
                        const summary = document.createElement("summary");
                        summary.textContent = this.label("details", "更新の内訳");
                        details.appendChild(summary);
                        details.addEventListener("toggle", () => {
                            if (details.open && !details.dataset.loaded) {
                                details.append(...group.events.slice(1).map(event => this.createItem(event)));
                                details.dataset.loaded = "true";
                            }
                            this.observeVisibleItems();
                        });
                        container.appendChild(details);
                    }
                    section.appendChild(container);
                }
                sections.push(section);
            }
            if (!groups.length) {
                const empty = document.createElement("p");
                empty.className = "changes-modal__empty";
                empty.textContent = this.label("empty", "取得済みの更新情報はありません");
                sections.push(empty);
            }
            this.content.replaceChildren(...sections);
            this.observeVisibleItems();
            return;
        }
        if (this.config.buttonHosts && !this.currentEvents.length) {
            const empty = document.createElement("p");
            empty.className = "changes-modal__empty";
            empty.textContent = this.label("emptyRegion", "この地域の新着はありません");
            this.content.replaceChildren(empty);
            return;
        }
        if (this.config.modal && this.currentEvents.some(event => event.section)) {
            const sections = [["favorite", "お気に入り"], ["visited", "訪問済み"], ["other", "その他"]].map(([key, label]) => {
                const section = document.createElement("section");
                const heading = document.createElement("h3");
                heading.className = "changes-modal__section-title";
                const events = this.currentEvents.filter(event => (event.section || "other") === key)
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                if (key !== "other" && !events.length) return null;
                heading.textContent = this.label("sectionCount", "{label}（{count}件）", { label: this.label(key, label), count: events.length });
                section.appendChild(heading);
                section.append(...events.map(event => this.createItem(event)));
                if (!events.length) {
                    const empty = document.createElement("p");
                    empty.className = "changes-modal__empty";
                    empty.textContent = this.label("emptySection", "新着はありません");
                    section.appendChild(empty);
                }
                return section;
            });
            this.content.replaceChildren(...sections.filter(Boolean));
            return;
        }
        this.content.replaceChildren(...this.currentEvents.map(event => this.createItem(event)));
    }

    render(event, direction = 0) {
        if (!this.content) return;
        const item = this.createItem(event);
        const previousItem = this.activeItem;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        this.activeItem = item;

        if (previousItem?.isConnected && direction !== 0 && !reduceMotion) {
            previousItem.classList.remove(
                "news-ticker__item--entering-next",
                "news-ticker__item--entering-previous"
            );
            previousItem.classList.add(direction > 0
                ? "news-ticker__item--leaving-next"
                : "news-ticker__item--leaving-previous");
            item.classList.add(direction > 0
                ? "news-ticker__item--entering-next"
                : "news-ticker__item--entering-previous");
            this.content.appendChild(item);

            const removePreviousItem = () => previousItem.remove();
            previousItem.addEventListener("animationend", (event) => {
                if (event.target === previousItem) removePreviousItem();
            });
            window.setTimeout(removePreviousItem, 600);
        } else {
            this.content.replaceChildren(item);
        }

        window.requestAnimationFrame(() => this.updateHeadlineScroll(item));
    }

    createItem(event, representedEvents = [event]) {
        if (this.config.modal && event.name) return this.createChangeItem(event, representedEvents);
        const itemUrl = String(event.url || event.wikipedia_url || "");
        const hasLink = /^https?:\/\//i.test(itemUrl);
        const item = hasLink ? document.createElement("a") : document.createElement("div");
        item.className = "news-ticker__item";
        if (hasLink) {
            item.href = itemUrl;
            item.target = "_blank";
            item.rel = "noopener noreferrer";
            item.draggable = false;
        }

        const year = document.createElement("span");
        year.className = "news-ticker__year";
        year.textContent = event.year ? this.label("year", "{year}年", { year: event.year }) : "";

        const date = document.createElement("span");
        date.className = "news-ticker__date";
        date.textContent = this.formatDate(event.date);

        const region = document.createElement("span");
        region.className = "news-ticker__region";
        if (event.scope === "national") region.classList.add("news-ticker__region--national");
        region.textContent = event.displayRegion || event.region || "";

        const mobileLabel = document.createElement("span");
        mobileLabel.className = "news-ticker__mobile-label";
        mobileLabel.textContent = this.config.mobileLabel || this.label("news", "ニュース");

        const meta = document.createElement("span");
        meta.className = "news-ticker__meta";
        meta.append(mobileLabel);
        if (event.year) meta.appendChild(year);
        if (event.date) meta.appendChild(date);
        if (region.textContent) meta.appendChild(region);

        const headline = document.createElement("span");
        headline.className = "news-ticker__headline";

        const headlineTrack = document.createElement("span");
        headlineTrack.className = "news-ticker__headline-track";

        const headlineText = document.createElement("span");
        headlineText.className = "news-ticker__headline-text news-ticker__headline-text--primary";
        headlineText.textContent = event.headline || event.title || "";

        const headlineClone = document.createElement("span");
        headlineClone.className = "news-ticker__headline-text news-ticker__headline-text--clone";
        headlineClone.textContent = headlineText.textContent;
        headlineClone.setAttribute("aria-hidden", "true");

        headlineTrack.append(headlineText, headlineClone);
        headline.appendChild(headlineTrack);

        item.append(meta, headline);
        return item;
    }

    changeHeadline(event) {
        const name = event.name || event.category || this.label("feature", "地物");
        const place = event.parkName && event.parkName !== name
            ? this.label("placeFeature", "{park}の{name}", { park: event.parkName, name }) : name;
        if (event.kind === "regionalCreated") return this.label("mapCreated", "{place}が地図に追加されました", { place });
        if (event.kind === "regionalUpdated" || event.kind === "favoriteUpdated")
            return this.label("mapUpdated", "{place}の地図情報が更新されました", { place });
        if (event.kind === "reviewCreated" || event.kind === "reviewUpdated") {
            const subject = event.parkName || (name === event.review?.title
                || name === "公園・遊具の口コミ" || name === this.label("reviewPlace", "公園・遊具の口コミ")
                ? this.label("parkEquipment", "公園・遊具") : name);
            return this.label(event.kind === "reviewCreated" ? "reviewCreated" : "reviewUpdated",
                event.kind === "reviewCreated" ? "{place}に新しい口コミが投稿されました" : "{place}の口コミが更新されました",
                { place: subject });
        }
        return place;
    }

    createChangeItem(event, representedEvents = [event]) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "changes-modal__item";
        item.changeEvent = event;
        item.changeEvents = representedEvents;
        const meta = document.createElement("div");
        meta.className = "changes-modal__meta";
        const badge = document.createElement("span");
        badge.className = event.kind === "regionalCreated" || event.kind === "reviewCreated"
            ? "changes-modal__badge changes-modal__badge--new" : "changes-modal__badge";
        badge.textContent = event.changeLabel;
        const date = document.createElement("span");
        date.textContent = [this.formatDate(event.date), event.region].filter(Boolean).join(" · ");
        meta.append(badge, date);
        if (this.config.groupByPlace && this.unreadEvents(representedEvents).length) {
            const unread = document.createElement("span");
            unread.className = "change-feed-unread";
            unread.textContent = this.label("unread", "未確認");
            meta.appendChild(unread);
        }
        if (event.editorName) {
            const editor = document.createElement("span");
            editor.className = "changes-modal__editor";
            editor.textContent = this.label("editor", "編集：{name}", { name: event.editorName });
            meta.appendChild(editor);
        }
        const name = document.createElement("strong");
        name.className = "changes-modal__name";
        name.textContent = this.changeHeadline(event);
        const hint = document.createElement("span");
        hint.className = "changes-modal__hint";
        hint.hidden = true;
        item.append(meta, name);
        const thumbnail = this.config.groupByPlace && /^File:/i.test(event.thumbnail || "")
            ? [...(document.querySelectorAll?.("#images img") ?? [])].find(image =>
                image.dataset.lazySrc === event.thumbnail && image.complete && image.naturalWidth > 0
                && (image.getAttribute("src_thumb") || image.getAttribute("src_org")))?.src || ""
            : event.thumbnail;
        if (thumbnail && this.isOpen) {
            const image = document.createElement("img");
            image.className = "changes-modal__thumbnail";
            image.alt = this.label("reviewPhoto", "口コミの写真");
            image.loading = "lazy";
            image.width = 112;
            image.height = 84;
            image.addEventListener("error", () => { image.hidden = true; });
            item.appendChild(image);
            if (/^https?:\/\//i.test(thumbnail) || /^blob:/i.test(thumbnail)) image.src = thumbnail;
            else if (/^File:/i.test(thumbnail) && typeof getWikimedia === "function") {
                getWikimedia().then(media => media.queueGetWikiMediaImage(thumbnail, 160, image))
                    .catch(() => { image.hidden = true; });
            } else image.hidden = true;
        }
        if (event.review) {
            const { title, excerpt, score, hasPhoto } = event.review;
            const titleDuplicatesPlace = title && [event.name, event.parkName]
                .some(place => typeof place === "string" && place.trim() === title.trim()
                    && name.textContent.includes(place.trim()));
            if (title && !titleDuplicatesPlace) {
                const heading = document.createElement("span");
                heading.className = "changes-modal__review-title";
                heading.textContent = title;
                item.appendChild(heading);
            }
            if (excerpt) {
                const body = document.createElement("span");
                body.className = "changes-modal__review-body";
                body.textContent = excerpt;
                item.appendChild(body);
            }
            const facts = document.createElement("span");
            facts.className = "changes-modal__review-facts";
            facts.textContent = [score ? this.label("rating", "評価 {stars}", { stars: "★".repeat(score) + "☆".repeat(5 - score) }) : "", hasPhoto ? this.label("hasPhoto", "写真あり") : ""].filter(Boolean).join(" · ");
            if (facts.textContent) item.appendChild(facts);
        }
        item.appendChild(hint);
        item.addEventListener("click", async () => {
            if (this.config.groupByPlace) this.markEventsSeen(representedEvents);
            item.disabled = true;
            hint.hidden = false;
            hint.textContent = `${event.category} · ${this.label("loading", "読み込み中…")}`;
            try {
                if (await this.config.onSelect?.(event) === true) {
                    this.modalInstance.hide();
                    hint.hidden = true;
                    hint.textContent = "";
                } else hint.textContent = `${event.category} · ${this.label("cannotShow", "この地物を表示できませんでした")}`;
            } catch (error) {
                console.warn("Change selection failed", error);
                hint.textContent = `${event.category} · ${this.label("loadFailed", "読み込めませんでした。もう一度お試しください")}`;
            } finally { item.disabled = false; }
        });
        return item;
    }

    updateHeadlineScroll(item = this.activeItem) {
        const headline = item?.querySelector(".news-ticker__headline");
        const primaryText = headline?.querySelector(".news-ticker__headline-text--primary");
        if (!headline || !primaryText) return;

        headline.classList.remove("is-scrolling");
        if (!window.matchMedia("(max-width: 575px)").matches) return;
        const textWidth = primaryText.getBoundingClientRect().width;
        headline.classList.toggle("is-scrolling", textWidth > headline.clientWidth);
    }

    startDrag(event) {
        if (this.config.collapsible || event.button !== 0 || event.isPrimary === false || this.currentEvents.length <= 1) return;

        this.stopTimer();
        this.dragState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            axis: null,
            item: this.activeItem
        };
    }

    moveDrag(event) {
        const state = this.dragState;
        if (!state || event.pointerId !== state.pointerId) return;

        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        if (!state.axis) {
            if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
            state.axis = Math.abs(deltaX) >= Math.abs(deltaY) ? "x" : "y";
            this.content?.setPointerCapture?.(event.pointerId);
            this.content?.classList.add("is-dragging");
        }

        event.preventDefault();
        const distance = state.axis === "x" ? deltaX : deltaY;
        if (state.item) {
            state.item.style.transform = state.axis === "x"
                ? `translateX(${distance}px)`
                : `translateY(${distance}px)`;
            state.item.style.opacity = String(Math.max(0.55, 1 - Math.abs(distance) / 500));
        }
    }

    endDrag(event) {
        const state = this.dragState;
        if (!state || event.pointerId !== state.pointerId) return;

        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        const distance = state.axis === "y" ? deltaY : deltaX;
        const size = state.axis === "y" ? this.content?.clientHeight : this.content?.clientWidth;
        const threshold = Math.max(40, Math.min(80, Number(size || 0) * 0.15));
        const shouldChange = state.axis !== null && Math.abs(distance) >= threshold;

        this.resetDragState(state);
        if (shouldChange) {
            this.suppressClickUntil = Date.now() + 500;
            this.moveNews(distance < 0 ? 1 : -1, true);
        } else {
            this.startTimer();
        }
    }

    cancelDrag(event) {
        const state = this.dragState;
        if (!state || event.pointerId !== state.pointerId) return;
        this.resetDragState(state);
        this.startTimer();
    }

    resetDragState(state) {
        if (state.item) {
            state.item.style.removeProperty("transform");
            state.item.style.removeProperty("opacity");
        }
        this.content?.classList.remove("is-dragging");
        if (this.content?.hasPointerCapture?.(state.pointerId)) {
            this.content.releasePointerCapture(state.pointerId);
        }
        this.dragState = null;
    }

    showPrevious(restartTimer = true) {
        this.moveNews(-1, restartTimer);
    }

    showNext(restartTimer = true) {
        this.moveNews(1, restartTimer);
    }

    moveNews(offset, restartTimer) {
        if (this.currentEvents.length === 0) return;
        this.currentIndex = (this.currentIndex + offset + this.currentEvents.length) % this.currentEvents.length;
        this.render(this.currentEvents[this.currentIndex], offset);
        if (restartTimer) this.startTimer();
    }

    startTimer() {
        this.stopTimer();
        if (this.currentEvents.length <= 1) return;

        const interval = Math.max(Number(this.config.displayDuration) || Number(this.config.interval) || 6500, 3000);
        this.timer = window.setInterval(() => this.showNext(false), interval);
    }

    updateNavigationButtons() {
        const disabled = this.currentEvents.length <= 1;
        if (this.previousButton) this.previousButton.disabled = disabled;
        if (this.nextButton) this.nextButton.disabled = disabled;
    }

    formatDate(value) {
        const match = String(value || "").match(/^\d{4}-(\d{2})(?:-(\d{2}))?$/);
        if (!match) return String(value || "");
        if (typeof glot !== "undefined" && glot.lang !== "ja") {
            const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" })
                .format(new Date(Date.UTC(2000, Number(match[1]) - 1, 1)));
            return month + (match[2] ? ` ${Number(match[2])}` : "");
        }
        return `${Number(match[1])}月${match[2] ? `${Number(match[2])}日` : ""}`;
    }

    hide() {
        this.stopTimer();
        this.currentKey = "";
        this.currentIndex = 0;
        this.currentEvents = [];
        this.activeItem = null;
        this.content?.replaceChildren();
        this.updateNavigationButtons();
        if (this.config.modal) {
            this.modalInstance?.hide();
        } else if (this.element) this.element.hidden = true;
        if (this.toggleButton) this.toggleButton.hidden = true;
        this.isOpen = false;
    }

    stopTimer() {
        if (this.timer !== null) {
            window.clearInterval(this.timer);
            this.timer = null;
        }
    }
}
