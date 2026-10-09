class ActivitySchemaAdapter {
    static frontendType(type) {
        const normalized = String(type || "text").toLowerCase();
        if (["wikimedia", "image"].includes(normalized)) return "image_url";
        if (["text", "textarea", "date", "select", "checkbox", "url"].includes(normalized)) return normalized;
        return "text";
    }

    static apply(activities, schema, options = {}) {
        if (!schema || typeof schema.fields !== "object" || Array.isArray(schema.fields)) {
            throw new Error("Activity Schema must contain a fields object.");
        }

        const formName = String(options.formName || Object.keys(activities || {})[0] || "");
        const currentActivity = activities?.[formName];
        if (!formName || !currentActivity || typeof currentActivity.form !== "object") {
            throw new Error("Activity form configuration is not available.");
        }

        const excluded = new Set((options.excludeFields || []).map(String));
        const currentEntries = Object.entries(currentActivity.form);
        const byStorageName = new Map();
        currentEntries.forEach(([key, field]) => {
            if (field?.gsheet) byStorageName.set(String(field.gsheet), [key, field]);
        });

        // attention等の表示専用行は、従来フォームで次に続くデータ項目の直前へ残す。
        const beforeField = new Map();
        const trailingPresentation = [];
        currentEntries.forEach(([key, field], index) => {
            if (field?.gsheet) return;
            const next = currentEntries.slice(index + 1).find(([, candidate]) => candidate?.gsheet);
            if (next) {
                const storageName = String(next[1].gsheet);
                if (!beforeField.has(storageName)) beforeField.set(storageName, []);
                beforeField.get(storageName).push([key, field]);
            } else {
                trailingPresentation.push([key, field]);
            }
        });

        const orderedFields = Object.entries(schema.fields)
            .filter(([name]) => !excluded.has(name))
            .sort(([, a], [, b]) => Number(a?.order ?? Number.MAX_SAFE_INTEGER) - Number(b?.order ?? Number.MAX_SAFE_INTEGER));
        const form = {};
        const labels = {};

        orderedFields.forEach(([storageName, definition]) => {
            (beforeField.get(storageName) || []).forEach(([key, field]) => { form[key] = { ...field }; });

            const existing = byStorageName.get(storageName);
            const fieldKey = existing?.[0] || storageName;
            const current = existing?.[1] || {};
            const glotKey = current.glot || `activity_schema_${storageName}`;
            const label = definition?.label;
            if (!current.glot && label !== undefined) {
                labels[glotKey] = typeof label === "object"
                    ? { ...label }
                    : { ja: String(label), en: String(label) };
            }

            const converted = {
                ...current,
                glot: glotKey,
                type: this.frontendType(definition?.type),
                gsheet: storageName
            };
            if (Array.isArray(definition?.options)) converted.values = definition.options.map(String);
            else delete converted.values;
            if (definition?.required !== undefined) converted.required = Boolean(definition.required);
            if (definition?.maxLength !== undefined) converted.maxLength = Number(definition.maxLength);
            form[fieldKey] = converted;
        });

        trailingPresentation.forEach(([key, field]) => { form[key] = { ...field }; });
        return {
            activities: {
                ...activities,
                [formName]: { ...currentActivity, form }
            },
            labels
        };
    }
}
