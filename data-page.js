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

document.getElementById('copy-prompt').addEventListener('click', async () => {
    const prompt = document.getElementById('ai-prompt');
    const status = document.getElementById('copy-status');
    try {
        await navigator.clipboard.writeText(prompt.textContent.trim());
        status.textContent = 'コピーしました。AIに貼り付けて、作りたい内容を書き換えてください。';
    } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(prompt);
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = '依頼文を選択しました。手動でコピーしてください。';
    }
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

(async () => {
    const status = document.getElementById('demo-status');
    const results = document.getElementById('demo-results');
    const query = document.getElementById('demo-query');
    try {
        const [data, dictionary] = await Promise.all([
            './data/releases/2026-10-10/expo2025.geojson', './data/category-ja.jsonc'
        ].map(async url => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        }));
        const search = new PublicDataSearch(data.features, 'ja', dictionary.category);
        const render = () => {
            const matches = search.search(query.value);
            status.textContent = `${matches.length}件`;
            results.replaceChildren();
            for (const feature of matches) {
                const item = document.createElement('li');
                const description = document.createElement('div');
                const name = document.createElement('strong');
                name.textContent = search.displayName(feature);
                description.append(name);
                const countries = search.countryNames(feature.properties.tags)
                    .filter(country => country !== feature.properties.name);
                if (countries.length) {
                    const country = document.createElement('span');
                    country.className = 'small';
                    country.textContent = countries.join('・');
                    description.append(country);
                }
                const link = document.createElement('a');
                link.href = `./?${feature.properties.osm_id}`;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = '地図で見る';
                link.setAttribute('aria-label', `${name.textContent}を地図で見る`);
                item.append(description, link);
                results.append(item);
            }
        };
        query.addEventListener('input', render);
        render();
    } catch {
        status.textContent = '検索データを読み込めませんでした。ページを再読み込みするか、下のダウンロードリンクを利用してください。';
    }
})();
