class modal_OSMbasic {
    // make modal html for OSM basic tags

    make(tags) {
        let catname = poiCont.getCatnames(tags);
        let elements = 0;
        let html = `<div class="d-flex justify-content-between align-items-center flex-wrap mb-1">`;

        // write type
        if (catname[0] !== undefined) {
            html += `<div class="flex-row mt-2"> <i class="fas fa-square"></i> ${catname[0]}${catname[1] !== "" ? "(" + catname[1] + ")" : ""}</div>`;
            elements++;
        }

        // write brand
        let brand = [tags["brand:ja"], tags.brand].filter((a) => a !== undefined)[0];
        if (brand !== undefined) {
            html += `<div class="flex-row mt-2"> <i class="fa-solid fa-building"></i>${brand}</div>`;
            elements++;
        }

        // write changing_table
        if (tags.changing_table !== undefined) {
            let available = tags.changing_table == "yes" ? glot.get("available") : glot.get("unavailable");
            html += `<div class="flex-row mt-2"> <i class="fas fa-baby"></i> ${glot.get("changing_table")}:${available}</div>`;
            elements++;
        }

        // write wheelchair
        if (tags.wheelchair !== undefined) {
            let test = { yes: "available", no: "unavailable", limited: "limited" };
            if (test[tags.wheelchair] !== undefined) {
                let available = glot.get(test[tags.wheelchair]);
                html += `<div class="flex-row mt-2"> <i class="fas fa-wheelchair"></i> ${available}</div>`;
                elements++;
            }
        }

        // write bottle
        if (tags.bottle !== undefined) {
            let test = { yes: "available", no: "unavailable", limited: "limited" };
            if (test[tags.bottle] !== undefined) {
                let available = glot.get(test[tags.bottle]);
                html += `<div class="flex-row mt-2"> <i class="fas fa-wine-bottle"></i> ${available}</div>`;
                elements++;
            }
        }

        // write website
        let website = [tags.website, tags["contact:website"], tags["brand:website"]].filter((a) => a !== undefined)[0];
        if (website !== undefined) {
            let httpn = website.replace(/^https?:\/\//, "");
            let trunc = httpn.length > 22 ? httpn.substring(0, 19) + "..." : httpn;
            html += `<div class="flex-row mt-2"> <i class="fas fa-globe"></i> <a href="${website}" target="_blank">${trunc}</a></div>`;
            elements++;
        }

        // opening_hours
        if (tags.opening_hours !== undefined) {
            let opening = basic.parseOpeningHours(tags.opening_hours)
            if (opening !== "") html += `<i class="fa-solid fa-clock"></i> ${opening}`;
        }

        // write reservation
        if (tags.reservation !== undefined) {
            let reserve;
            switch (tags["reservation"]) {
                case "yes": reserve = glot.get("reservation_yes"); break;
                case "no": reserve = glot.get("reservation_no"); break;
                case "recommended": reserve = glot.get("reservation_recommended"); break;
            }
            html += `<div class="flex-row mt-2"> <i class="fa-solid fa-ticket"></i> ${reserve}</div>`;
            elements++;
        }

        // write instagram
        let instagram = [tags.instagram, tags["contact:instagram"]].filter((a) => a !== undefined)[0];
        if (instagram !== undefined) {
            instagram = this.getInstagramProfileUrl(instagram);
            if (instagram !== null) {
                html += `<div class="flex-row mt-2"> <i class="fa-brands fa-instagram"></i> <a href="${instagram[0]}" target="_blank">${instagram[1]}</a></div>`;
                elements++;
            }
        }

        // write tel
        if (tags.phone !== undefined) {
            let phone = tags.phone
            phone = phone.startsWith("+81") ? "0" + phone.slice(3) : phone;
            html += `<div class="flex-row mt-2"> <i class="fas fa-phone-alt"></i> <a href="tel:${phone}">${phone}</a></div>`;
            elements++;
        }

        // write artist_name
        if (tags.artist_name !== undefined) {
            html += `<div class="flex-row mt-2"> <i class="fas fa-file-signature"></i> ${tags.artist_name}</div>`;
            elements++;
        }

        // write toilets
        if (tags.amenity == "toilets") {
            let test = { yes: "available", no: "unavailable", limited: "limited" };
            html += `<div class="flex-row mt-2"> `
            if (tags.female == "yes") {
                html += `<i class="fa-solid fa-venus"></i> `;
                let capacity = Number(tags["capacity:women"])
                if (capacity > 0 && capacity !== NaN) {
                    html += `:${capacity} `;
                } else {
                    html += `:${glot.get("available")} `;
                }
            }
            if (tags.male == "yes") {
                html += `<i class="fa-solid fa-mars"></i> `;
                let capacity = Number(tags["capacity:men"])
                if (capacity > 0 && capacity !== NaN) {
                    html += `:${capacity} `;
                } else {
                    html += `:${glot.get("available")} `;
                }
            }
            if (tags.unisex == "yes") {
                html += `<i class="fa-solid fa-mars-and-venus"></i> `;
                let capacity = Number(tags["capacity:unisex"])
                if (capacity > 0 && capacity !== NaN) {
                    html += `:${capacity} `;
                } else {
                    html += `:${glot.get("available")} `;
                }
            }
            html += `</div>`
            elements++;
        }

        // write level
        if (tags.level !== undefined) {
            let level = Number(tags.level)
            if (level > 0) {
                html += `<div class="flex-row mt-2"> <i class="fa-solid fa-stairs"></i> ${level + 1}F</div>`;
            } else if (level < 0) {
                html += `<div class="flex-row mt-2"> <i class="fa-solid fa-stairs"></i> ${level}F</div>`;
            }
            elements++;
        }

        // write note
        if (tags.note !== undefined) {
            html += `<div class="flex-row mt-2"> <i class="fas fa-sticky-note"></i> ${tags.note}</div>`;
            elements++;
        }

        // write description
        if (tags.description !== undefined) {
            html += `<div class="flex-row mt-2"> <i class="fas fa-sticky-note"></i> ${tags.description}</div>`;
            elements++;
        }

        // 既に行ったかチェック
        if (Conf.etc.localSave !== "") {
            let data = localStorage.getItem(Conf.etc.localSave + "." + tags.id); // == 'true' ? "checked" : "";
            let already = data == undefined ? ["", undefined] : data.split(",");
            already[0] = already[0] == 'true' ? "checked" : "";
            already[1] = already[1] == undefined ? "" : already[1]
            html += `<div class="flex-row mt-2 d-flex text-nowrap align-items-center"><i class="fa-solid fa-person-walking me-1"></i>`;
            html += `${glot.get("visited")} <input type="checkbox" id="visited" class="m-2" name="${tags.id}" ${already[0]}/>`;
            html += `<input type="text" id="visited-memo" maxlength="140" size="20" class="form-control ms-2" placeholder="${glot.get("reservation_memo")}" value="${already[1]}" /></div>`
            elements++;
        }

        // wikimedia画像の追加
        if (tags.wikimedia_commons !== undefined) {
            let wikimq = [], wikim = tags.wikimedia_commons;
            if (wikim.slice(0, 5) == "File:") {     // File:のみ対応
                let id = tags.id;
                wikimq.push([wikim, id]);
                html += `<div class="col-12 mt-3 text-center"><img class="thumbnail" onclick="modalActs.viewImage(this)" id="${id}"><span id="${id}-copyright"></span></div>`;
                wikimq.forEach((q) => basic.getWikiMediaImage(q[0], Conf.etc.modalThumbWidth, q[1])); // WikiMedia Image 遅延読み込み
                elements++;
            }
        }

        return elements > 0 ? html + "</div>" : "";
    }

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
}
