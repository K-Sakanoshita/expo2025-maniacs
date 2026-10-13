document.querySelectorAll('a[download]').forEach(link => {
    link.addEventListener('click', () => {
        const status = link.closest('header, section')?.querySelector('.download-status');
        if (!status) return;
        const filename = new URL(link.href).pathname.split('/').pop();
        status.querySelector('span').textContent = `${filename}：ブラウザーのダウンロード一覧をご確認ください。`;
        status.querySelector('a').href = link.href;
        status.hidden = false;
    });
});

function openLinkedDetails() {
    const id = location.hash.slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    for (let parent = target.parentElement; parent; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS') parent.open = true;
    }
}
window.addEventListener('hashchange', openLinkedDetails);
openLinkedDetails();

function referenceUrl(key, value) {
    if (key === 'wikipedia') {
        const match = /^([a-z][a-z0-9-]*):(.+)$/i.exec(value);
        if (!match) return null;
        const [title, ...section] = match[2].split('#');
        return `https://${match[1]}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`
            + (section.length ? `#${encodeURIComponent(section.join('#').replaceAll(' ', '_'))}` : '');
    }
    if (key === 'wikidata' && /^Q\d+$/.test(value)) return `https://www.wikidata.org/wiki/${value}`;
    if (key === 'wikimedia_commons' && /^(File|Category):.+/.test(value)) {
        return `https://commons.wikimedia.org/wiki/${encodeURIComponent(value.replaceAll(' ', '_'))}`;
    }
    return null;
}

(async () => {
    const status = document.getElementById('demo-status');
    const results = document.getElementById('demo-results');
    const query = document.getElementById('demo-query');
    const referenceFilters = ['wikipedia', 'wikidata', 'wikimedia_commons']
        .map(key => ({ key, input: document.getElementById(`demo-${key}`) }));
    try {
        const [data, dictionary] = await Promise.all([
            './data/releases/2026-10-12/expo2025.geojson', './data/category-ja.jsonc'
        ].map(async url => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        }));
        const search = new PublicDataSearch(data.features, 'ja', dictionary.category);
        const render = () => {
            const selected = referenceFilters.filter(filter => filter.input.checked);
            const matches = search.search(query.value).filter(feature =>
                selected.every(filter => Boolean(feature.properties.tags[filter.key]?.trim())));
            status.textContent = `${matches.length}件`;
            results.replaceChildren();
            for (const feature of matches) {
                const item = document.createElement('tr');
                const description = document.createElement('td');
                const name = document.createElement('strong');
                name.textContent = search.displayName(feature);
                description.append(name);
                const countries = search.countryNames(feature.properties.tags)
                    .filter(country => country !== feature.properties.name);
                if (countries.length) {
                    const country = document.createElement('span');
                    country.className = 'd-block small text-body-secondary';
                    country.textContent = countries.join('・');
                    description.append(country);
                }
                item.append(description);
                for (const key of ['wikipedia', 'wikidata', 'wikimedia_commons']) {
                    const cell = document.createElement('td');
                    const value = feature.properties.tags[key] || '';
                    const url = referenceUrl(key, value);
                    if (url) {
                        const reference = document.createElement('a');
                        reference.href = url;
                        reference.target = '_blank';
                        reference.rel = 'noopener noreferrer';
                        reference.textContent = key === 'wikipedia' ? value.replace(/^[^:]+:/, '') : value;
                        reference.setAttribute('aria-label', `${name.textContent}の${key}`);
                        cell.append(reference);
                    } else {
                        cell.textContent = value || '—';
                    }
                    item.append(cell);
                }
                results.append(item);
            }
        };
        query.addEventListener('input', render);
        referenceFilters.forEach(filter => filter.input.addEventListener('change', render));
        render();
    } catch {
        status.textContent = '検索データを読み込めませんでした。ページを再読み込みするか、下のダウンロードリンクを利用してください。';
    }
})();
