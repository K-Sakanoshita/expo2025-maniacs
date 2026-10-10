// Search example for the published GeoJSON. No basemap or external API is needed.
class PublicDataSearch {
    constructor(features, locale = 'ja', categories = {}) {
        this.features = features;
        this.categories = categories;
        this.regions = typeof Intl.DisplayNames === 'function'
            ? new Intl.DisplayNames([locale], { type: 'region' }) : null;
    }

    displayName(feature) {
        const { name, kind, tags } = feature.properties;
        if (name?.trim()) return name;
        const keys = ['information', 'playground', 'amenity', 'shop', 'tourism', 'leisure',
            'entrance', 'barrier', 'highway', 'man_made', 'natural', 'building'];
        for (const key of [...keys, ...Object.keys(tags)]) {
            const label = this.categories[key]?.[tags[key]];
            if (label && label !== '-') return label;
        }
        return kind || '名称不明';
    }

    countryNames(tags) {
        return (tags.country || '').split(';').map(value => {
            const code = value.trim().toUpperCase();
            if (!code) return '';
            if (code === 'EU') return '欧州連合';
            if (code === 'ASEAN') return '東南アジア諸国連合';
            try { return this.regions?.of(code) || code; } catch { return code; }
        }).filter(Boolean);
    }

    search(query = '') {
        const needle = query.trim().normalize('NFKC').toLocaleLowerCase();
        return this.features.filter(feature => {
            const tags = feature.properties.tags;
            const text = [this.displayName(feature), tags.alt_name, tags['name:ja'], tags['name:en'], tags.country, ...this.countryNames(tags)].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
            return !needle || text.includes(needle);
        });
    }
}
