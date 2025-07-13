class Wikipedia {
    // make modal html for Wikipedia

    // return elements(Before processing)
    element() {
        return `<div class="mb-3" id="wikipedia"></div>`;
    };

    // make html(After processing)
    make(tags, image) {
        return new Promise((resolve, reject) => {
            let wiki = tags.wikipedia.split(':');
            let url = encodeURI(`https://${wiki[0]}.${Conf.wikipedia.domain}/wiki/${wiki[1]}`);
            basic.getWikipedia(wiki[0], wiki[1]).then(datas => {
                let html = `<span>${datas[0]}</span><a href="${url}" target="_blank">${glot.get("source_wikipedia")}</a>`;
                if (image) {
                    html += datas[1] !== undefined ? `<br><a href="${url}" target="_blank"><img class="thumbnail" width="${datas[1].width}" height="${datas[1].height}" src="${datas[1].source}"></a>` : "";
                }
                resolve(html);
            }).catch(e => reject(e));
        });
    };

    // set dom from html(make result)
    set_dom(html) {
        let wikidom = document.getElementById("wikipedia");
        if (wikidom == undefined) {
            setTimeout(() => wikipedia.set_dom(html), 500);
        } else {
            wikidom.innerHTML = html;
        };
    };
}
