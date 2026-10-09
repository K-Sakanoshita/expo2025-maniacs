"use strict";

// 設定ファイルからリスト上部の汎用アクションボタンを生成する。
class ListActionButtons {
    constructor(root = window, logger = console) {
        this.root = root;
        this.logger = logger;
    }

    init(config, container = document.getElementById("listActionButtons")) {
        if (!container) return;
        container.replaceChildren();
        container.hidden = true;

        if (config?.use !== true || !Array.isArray(config.items)) return;

        const buttons = config.items
            .filter(item => item?.use !== false)
            .map(item => this.makeButton(item))
            .filter(Boolean);

        if (!buttons.length) return;
        container.append(...buttons);
        container.hidden = false;
    }

    makeButton(item) {
        const label = this.localizedText(item, "glotLabel", "label");
        const handler = String(item?.handler ?? "").trim();
        if (!handler) {
            this.logger.warn("ListActionButtons: handler が空の項目をスキップしました。", item);
            return null;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-sm flex-fill";
        String(item.buttonClass ?? "btn-light border-secondary")
            .split(/\s+/)
            .filter(Boolean)
            .forEach(className => button.classList.add(className));
        if (item.id) button.dataset.listActionId = String(item.id);
        const title = this.localizedText(item, "glotTitle", "title");
        if (title) button.title = title;
        const ariaLabel = this.localizedText(item, "glotAriaLabel", "ariaLabel") || label;
        button.setAttribute("aria-label", ariaLabel);

        const iconClass = String(item.icon ?? "").trim();
        if (iconClass) {
            const icon = document.createElement("i");
            icon.className = `${iconClass} me-1`;
            icon.setAttribute("aria-hidden", "true");
            button.append(icon);
        }
        const labelNode = document.createElement("span");
        labelNode.className = "list-action-label";
        labelNode.textContent = label;
        button.append(labelNode);
        button.addEventListener("click", () => this.run(item));
        return button;
    }

    localizedText(item, glotKeyName, fallbackName) {
        const glotKey = String(item?.[glotKeyName] ?? "").trim();
        if (glotKey && typeof glot !== "undefined" && typeof glot.get === "function") {
            const translated = glot.get(glotKey);
            if (translated != null) return String(translated).trim();
        }
        return String(item?.[fallbackName] ?? "").trim();
    }

    setLabel(id, label, ariaLabel = label) {
        const button = document.querySelector(`[data-list-action-id="${CSS.escape(String(id))}"]`);
        const labelNode = button?.querySelector(".list-action-label");
        if (!button || !labelNode) return false;
        labelNode.textContent = String(label);
        button.setAttribute("aria-label", String(ariaLabel));
        return true;
    }

    resolve(handler) {
        const path = String(handler ?? "").trim();
        if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(path)) return null;

        const parts = path.split(".");
        const method = parts.pop();
        let context = this.root;
        for (const part of parts) {
            context = context?.[part];
            if (context == null) return null;
        }
        const callback = context?.[method];
        return typeof callback === "function" ? { callback, context } : null;
    }

    run(item) {
        const resolved = this.resolve(item?.handler);
        if (!resolved) {
            this.logger.error(`ListActionButtons: handler が見つかりません: ${item?.handler ?? ""}`);
            return;
        }
        const args = Array.isArray(item.args) ? item.args : [];
        return resolved.callback.apply(resolved.context, args);
    }
}

window.ListActionButtons = ListActionButtons;
