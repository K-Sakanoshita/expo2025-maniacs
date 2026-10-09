class OSMbasic {
    // make modal html for OSM basic tags

    make(tags) {
        let catname = poiCont.getCatnames(tags);
        let elements = 0;
        let html = `<div class="d-flex justify-content-between align-items-center flex-wrap m-1">`;

        // write type
        if (catname[0] !== undefined) {
            html += `<div class="flex-row mt-1 me-3"> <i class="fas fa-square"></i> ${catname[0]}${catname[1] !== "" ? "(" + catname[1] + ")" : ""}</div>`;
            elements++;
        }

        // write brand
        let brand = [tags["brand:ja"], tags.brand].filter((a) => a !== undefined)[0];
        if (brand !== undefined) {
            html += `<div class="flex-row mt-1 me-3"> <i class="fa-solid fa-building"></i>${brand}</div>`;
            elements++;
        }

        // write changing_table
        if (tags.changing_table === "yes" || tags.changing_table === "no") {
            const available = glot.get(tags.changing_table === "yes" ? "available" : "unavailable");
            const label = tags.amenity === "toilets"
                ? glot.get(tags.changing_table === "yes" ? "toilet_changing_yes" : "toilet_changing_no")
                : `${glot.get("changing_table")}:${available}`;
            html += `<div class="flex-row mt-1 me-3"> <i class="fas fa-baby"></i> ${label}</div>`;
            elements++;
        }

        // write wheelchair
        if (tags.wheelchair !== undefined) {
            let test = { yes: "available", no: "unavailable", limited: "limited" };
            if (test[tags.wheelchair] !== undefined) {
                let available = glot.get(test[tags.wheelchair]);
                const label = tags.amenity === "toilets"
                    ? glot.get({ yes: "facility_wheelchair_yes", limited: "facility_wheelchair_limited", no: "toilet_wheelchair_no" }[tags.wheelchair])
                    : available;
                html += `<div class="flex-row mt-1 me-3"> <i class="fas fa-wheelchair"></i> ${label}</div>`;
                elements++;
            }
        }

        // write bottle
        if (tags.bottle !== undefined) {
            let test = { yes: "available", no: "unavailable", limited: "limited" };
            if (test[tags.bottle] !== undefined) {
                let available = glot.get(test[tags.bottle]);
                html += `<div class="flex-row mt-1 me-3"> <i class="fas fa-wine-bottle"></i> ${available}</div>`;
                elements++;
            }
        }

        // write website
        let website = [tags.website, tags["contact:website"], tags["brand:website"]].filter((a) => a !== undefined)[0];
        if (website !== undefined) {
            let httpn = website.replace(/^https?:\/\//, "");
            let trunc = httpn.length > 19 ? httpn.substring(0, 29) + "..." : httpn;
            html += `<div class="flex-row mt-1 me-3"> <i class="fas fa-globe"></i> <a href="${website}" target="_new">${trunc}</a></div>`;
            elements++;
        }

        // opening_hours
        if (tags.opening_hours !== undefined) {
            let opening = basic.parseOpeningHours(tags.opening_hours)
            if (opening !== "") html += `<div class="flex-row mt-1 me-3"><i class="fa-solid fa-clock"></i>${opening}</div>`;
        }

        // write reservation
        if (tags.reservation !== undefined) {
            let reserve;
            switch (tags["reservation"]) {
                case "yes": reserve = glot.get("reservation_yes"); break;
                case "no": reserve = glot.get("reservation_no"); break;
                case "recommended": reserve = glot.get("reservation_recommended"); break;
            }
            html += `<div class="flex-row mt-1 me-3"> <i class="fa-solid fa-ticket"></i> ${reserve}</div>`;
            elements++;
        }

        // write instagram
        let instagram = [tags.instagram, tags["contact:instagram"]].filter((a) => a !== undefined)[0];
        if (instagram !== undefined) {
            instagram = this.getInstagramProfileUrl(instagram);
            if (instagram !== null) {
                html += `<div class="flex-row mt-1 me-3"> <i class="fa-brands fa-instagram"></i> <a href="${instagram[0]}" target="_new">${instagram[1]}</a></div>`;
                elements++;
            }
        }

        // write twitter(X)
        let twitter = [tags.twitter, tags["contact:twitter"]].filter((a) => a !== undefined)[0];
        if (twitter !== undefined) {
            twitter = this.getTwitterProfileUrl(twitter);
            if (twitter !== null) {
                html += `<div class="flex-row mt-1 me-3"> <i class="fa-brands fa-twitter"></i> <a href="${twitter[0]}" target="_new">${twitter[1]}</a></div>`;
                elements++;
            }
        }

        // write tel
        if (tags.phone !== undefined) {
            let phone = tags.phone
            phone = phone.startsWith("+81") ? "0" + phone.slice(3) : phone;
            html += `<div class="flex-row mt-1 me-3"> <i class="fas fa-phone-alt"></i> <a href="tel:${phone}">${phone}</a></div>`;
            elements++;
        }

        // write artist_name
        if (tags.artist_name !== undefined) {
            html += `<div class="flex-row mt-1 me-3"> <i class="fas fa-file-signature"></i> ${tags.artist_name}</div>`;
            elements++;
        }

        // Individual toilet: distinguish explicit "no" from missing tags.
        if (tags.amenity === "toilets") {
            const entries = [["female", "capacity:women", `🚺 ${glot.get("toilet_female")}`],
                ["male", "capacity:men", `🚹 ${glot.get("toilet_male")}`],
                ["unisex", "capacity:unisex", `🚻 ${glot.get("toilet_unisex")}`]];
            const known = entries.filter(([key]) => tags[key] === "yes" || tags[key] === "no");
            if (!known.length) {
                html += `<div class="flex-row mt-1 me-3">${glot.get("toilet_unknown")}</div>`;
            }
            for (const [key, capacityKey, label] of known) {
                const capacity = Number(tags[capacityKey]);
                const value = tags[key] === "no" ? glot.get("toilet_none")
                    : Number.isFinite(capacity) && capacity > 0 ? String(capacity) : glot.get("toilet_available");
                html += `<div class="flex-row mt-1 me-3">${label} ${value}</div>`;
            }
            elements++;
        }

        // write level
        if (tags.level !== undefined) {
            const level = cMapMaker.formatIndoorLevel(tags.level);
            html += `<div class="flex-row mt-1 me-3"> <i class="fa-solid fa-stairs"></i> ${level}</div>`;
            elements++;
        }

        // write location=roof
        if (tags.location == "roof" || tags.location == "rooftop") {
            html += `<div class="flex-row mt-1 me-3"> <i class="fa-solid fa-stairs"></i> ${glot.get("rooftop")}</div>`;
            elements++;
        }

        // write note
        if (tags.note !== undefined) {
            html += `<div class="flex-row mt-1 me-3"> <i class="fas fa-sticky-note"></i> ${tags.note}</div>`;
            elements++;
        }

        // write description
        if (tags.description !== undefined) {
            html += `<div class="flex-row mt-1 me-3"> <i class="fas fa-sticky-note"></i> ${tags.description}</div>`;
            elements++;
        }

        const directionsUrl = cMapMaker.getDirectionsUrl?.(tags.id);
        const directionsHtml = directionsUrl
            ? `<div class="flex-row mt-1 me-3"><a class="btn btn-sm btn-outline-primary" href="${directionsUrl.replace(/&/g, "&amp;")}" target="_blank" rel="noopener noreferrer" title="${glot.get("directions_google_maps")}"><i class="fa-solid fa-route me-1" aria-hidden="true"></i>${glot.get("directions_open")}</a></div>`
            : "";

        // 既に行ったかチェック
        if (Conf.etc.localSave !== "") {
            let poiStatus = poiStatusCont.getValueByOSMID(tags.id)
            const escapeAttr = value => String(value).replace(/[&"<>']/g, char =>
                ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;", "'": "&#39;" })[char]);
            html += `<div class="flex-row mt-1 me-3"><button type="button" id="visited" class="poi-status-toggle btn btn-sm" name="${escapeAttr(tags.id)}" aria-pressed="${Boolean(poiStatus[PoiStatusIndex.VISITED])}" onclick="cMapMaker.togglePoiStatus('visited')"><i class="${poiStatus[PoiStatusIndex.VISITED] ? "fa-solid" : "fa-regular"} fa-circle-check fa-fw" aria-hidden="true"></i> ${glot.get("visited")}</button>`;
            html += `</div><div class="flex-row mt-1 me-3"><button type="button" id="favorite" class="poi-status-toggle btn btn-sm" name="${escapeAttr(tags.id)}" aria-pressed="${Boolean(poiStatus[PoiStatusIndex.FAVORITE])}" onclick="cMapMaker.togglePoiStatus('favorite')"><i class="${poiStatus[PoiStatusIndex.FAVORITE] ? "fa-solid" : "fa-regular"} fa-heart fa-fw" aria-hidden="true"></i> ${glot.get("favorite")}</button>`;
            html += `</div>${directionsHtml}<div class="flex-row mt-1 me-3 d-flex text-nowrap align-items-center w-100">`;
            let memo = poiStatus[PoiStatusIndex.MEMO] !== undefined ? poiStatus[PoiStatusIndex.MEMO] : "";
            html += `<label for="visited-memo" class="ms-2 me-2">${glot.get("personal_memo_label")}</label>`;
            html += `<input type="text" id="visited-memo" aria-describedby="personal-memo-help" maxlength="140" size="20" class="form-control" oninput="cMapMaker.savePoiStatus()" value="${escapeAttr(memo)}" /></div>`
            html += `<div id="personal-memo-help" class="form-text w-100 mt-1 mb-2">${glot.get("personal_memo_help")}</div>`;
            elements++;
        }

        if (directionsHtml) {
            if (Conf.etc.localSave === "") html += directionsHtml;
            elements++;
        }

        // wikimedia画像の追加
        if (tags.wikimedia_commons !== undefined) {
            let wikimq = [], wikim = tags.wikimedia_commons;
            if (wikim.slice(0, 5) == "File:") {     // File:のみ対応
                let id = tags.id;
                wikimq.push([wikim, id]);
                html += `<div class="col-12 mt-3 mb-3 text-center"><img class="thumbnail" onclick="modalActs.viewImage(this)" id="${id}"><span id="${id}-copyright"></span></div>`;
                wikimq.forEach((q) => wikimedia.getWikiMediaImage(q[0], Conf.thumbnail.modalThumbWidth, q[1])); // WikiMedia Image 遅延読み込み
                elements++;
            }
        }
        return elements > 0 ? html + "</div>" : "";
    }

    makeAreaFacilities(osmid) {
        if (!/^(?:way|relation)\/\d+$/.test(String(osmid ?? ""))) return "";
        const linker = window.areaFeatureLinker;
        const area = linker?.getAreaRecord(osmid);
        if (!area || String(area.areaId) !== String(osmid)) return "";
        const linked = area.linkedFeatures ?? [];
        const playTargets = new Set(Conf.areaFeatureLinker?.detailPlayTargets ?? []);
        const play = new Map();
        const other = new Map();
        const toilets = [];
        const seen = new Set();
        for (const item of linked) {
            const id = String(item?.featureId ?? "");
            if (id && seen.has(id)) continue;
            if (id) seen.add(id);
            const properties = item?.feature?.properties ?? {};
            const tags = properties.tags && typeof properties.tags === "object"
                ? properties.tags : properties;
            if (tags.amenity === "toilets") {
                toilets.push(tags);
                continue;
            }
            const category = poiCont.getCatnames(tags);
            const label = String(category[1] || category[0] || "").trim();
            if (!label || label === glot.get("undefined")) continue;
            const group = (item.targets ?? []).some(target => playTargets.has(target)) ? play : other;
            group.set(label, (group.get(label) ?? 0) + 1);
        }
        if (!play.size && !other.size && !toilets.length) return "";

        const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
        const formatEntries = group => [...group].map(([label, count]) =>
            `<li>${escapeHtml(label)}${count > 1 ? ` ×${count}` : ""}</li>`).join("");
        const items = [];
        if (play.size)
            items.push(`<li>${escapeHtml(glot.get("facility_play_equipment"))}<ul>${formatEntries(play)}</ul></li>`);
        if (toilets.length) {
            const details = [];
            const wheelchair = toilets.some(tags => tags.wheelchair === "yes") ? "yes"
                : toilets.some(tags => tags.wheelchair === "limited") ? "limited" : null;
            if (wheelchair)
                details.push(`<li>${escapeHtml(glot.get(wheelchair === "yes"
                    ? "facility_wheelchair_yes" : "facility_wheelchair_limited"))}</li>`);
            if (toilets.some(tags => tags.changing_table === "yes"))
                details.push(`<li>${escapeHtml(glot.get("facility_changing_table"))}</li>`);
            items.push(`<li>${escapeHtml(toilets.length === 1 ? glot.get("facility_toilet")
                : glot.get("facility_toilet_count").replace("{count}", String(toilets.length)))}`
                + (details.length ? `<ul>${details.join("")}</ul>` : "") + "</li>");
        }
        if (other.size) items.push(formatEntries(other));
        return `<section class="m-2"><strong>${escapeHtml(glot.get("facility_section_title"))}</strong>`
            + `<ul class="mb-0">${items.join("")}</ul></section>`;
    }

    // instagramのURLとユーザーネームを取得
    getInstagramProfileUrl(input) {
        const urlPattern = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)/;
        const usernamePattern = /^[a-zA-Z0-9._]+$/;
        const match = input.match(urlPattern);

        if (match && match[1]) {
            // 入力がURLの場合、ユーザー名を抽出し、配列にして返す
            return [input, match[1]];
        } else if (input.match(usernamePattern)) {
            // 入力がユーザー名の場合、URLを生成して配列にして返す
            return [`https://www.instagram.com/${input}/`, input];
        } else {
            // 入力がどちらでもない場合、nullを返す
            return null;
        }
    }

    // twitterのURLとユーザーネームを取得
    getTwitterProfileUrl(input) {
        const urlPattern = /(?:https?:\/\/)?(?:www\.)?x\.com\/([a-zA-Z0-9_]+)/;
        const usernamePattern = /^[a-zA-Z0-9_]+$/;
        const match = input.match(urlPattern);

        if (match && match[1]) {
            // 入力がURLの場合、ユーザー名を抽出し、配列にして返す
            return [input, match[1]];
        } else if (input.match(usernamePattern)) {
            // 入力がユーザー名の場合、URLを生成して配列にして返す
            return [`https://x.com/${input}/`, input];
        } else {
            // 入力がどちらでもない場合、nullを返す
            return null;
        }
    }

    // X/TwitterのURLとユーザーネームを取得
    getTwitterProfileUrl(input) {
        if (!input || typeof input !== 'string') return null;

        const value = input.trim();
        const usernamePattern = /^@?([a-zA-Z0-9_]{1,15})$/;         // @username に対応
        const urlPattern = /^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})(?:\/)?(?:\?.*)?$/;        // x.com / twitter.com のプロフィールURLに対応
        const urlMatch = value.match(urlPattern);

        if (urlMatch && urlMatch[1]) {
            const username = urlMatch[1];
            const reservedNames = ['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'login'];            // 予約っぽいパスは除外
            if (reservedNames.includes(username.toLowerCase())) return null;
            return [`https://x.com/${username}/`, username];
        }

        const usernameMatch = value.match(usernamePattern);
        if (usernameMatch && usernameMatch[1]) {
            const username = usernameMatch[1];
            return [`https://x.com/${username}/`, username];
        }
        return null;
    }

}
