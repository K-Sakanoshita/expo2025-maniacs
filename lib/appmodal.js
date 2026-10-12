// Shared read-only Bootstrap modal. HTML must be trusted, site-authored content.
class AppModal {
    static nextId = 0;

    constructor(options = {}) {
        this.options = options;
        this.isOpen = false;
        this.element = document.createElement("div");
        this.element.id = options.id || `appModal${++AppModal.nextId}`;
        this.element.className = ["modal app-modal", options.className].filter(Boolean).join(" ");
        this.element.tabIndex = -1;
        this.element.setAttribute("aria-hidden", "true");
        this.dialog = document.createElement("div");
        this.dialog.className = "modal-dialog modal-dialog-centered modal-dialog-scrollable";
        if (["sm", "lg", "xl"].includes(options.size)) this.dialog.classList.add(`modal-${options.size}`);
        const panel = document.createElement("div");
        panel.className = "modal-content";
        const header = document.createElement("div");
        header.className = ["modal-header app-modal-header", options.headerClass].filter(Boolean).join(" ");
        this.title = document.createElement("h2");
        this.title.id = `${this.element.id}Title`;
        this.title.className = "modal-title fs-5";
        this.setTitle(options.title || "");
        this.element.setAttribute("aria-labelledby", this.title.id);
        this.closeButton = document.createElement("button");
        this.closeButton.type = "button";
        this.closeButton.className = "btn-close app-modal-close";
        const localizedClose = typeof glot === "undefined" ? null : glot.get("button_close");
        this.closeButton.setAttribute("aria-label", options.closeLabel || localizedClose || "Close");
        this.closeButton.addEventListener("click", () => this.hide());
        header.append(this.title, this.closeButton);
        this.body = document.createElement("div");
        this.body.className = ["modal-body", options.bodyClass].filter(Boolean).join(" ");
        panel.appendChild(header);
        if (options.intro) panel.appendChild(options.intro);
        panel.appendChild(this.body);
        this.dialog.appendChild(panel);
        this.element.appendChild(this.dialog);
        this.setContent(options.content ?? options.html ?? "");
        document.body.appendChild(this.element);
        this.instance = bootstrap.Modal.getOrCreateInstance(this.element);
        this.element.addEventListener("show.bs.modal", () => {
            this.focusTarget = typeof options.returnFocus === "function"
                ? options.returnFocus() : options.returnFocus || document.activeElement;
            this.isOpen = true;
            options.onShow?.(this);
        });
        this.element.addEventListener("shown.bs.modal", () => options.onShown?.(this));
        this.element.addEventListener("hidden.bs.modal", () => {
            this.isOpen = false;
            options.onHidden?.(this);
            if (this.focusTarget?.isConnected !== false) this.focusTarget?.focus?.();
        });
    }

    setTitle(title) {
        this.title.textContent = title;
        return this;
    }

    // A string is HTML; a DOM node preserves its listeners and interactive controls.
    setContent(content) {
        if (typeof content === "string") this.body.innerHTML = content;
        else this.body.replaceChildren(content);
        return this;
    }

    show() { this.instance.show(); }
    hide() { this.instance.hide(); }
    toggle() { this.isOpen ? this.hide() : this.show(); }

    // Wait until Bootstrap has removed its backdrop and restored scrolling.
    dispose() {
        const remove = () => {
            this.instance.dispose();
            this.element.remove();
        };
        if (this.isOpen) {
            this.element.addEventListener("hidden.bs.modal", remove, { once: true });
            this.hide();
        } else remove();
    }
}
