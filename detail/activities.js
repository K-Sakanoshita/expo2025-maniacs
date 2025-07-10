class Activities {
    // make modal html for Activities

    constructor() {
        this.busy = false;
        this.html = "";
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "./detail/activities.html", true);
        xhr.onerror = function () {
            console.log("[error]Detail Activities:");
            console.log(xhr);
        };
        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 400) {
                this.html = xhr.response;
            } else {
                console.log("[error]Detail Activities:");
                console.log(xhr);
            }
        }.bind(this);
        xhr.send();
    }

    // make activity detail list
    make(actlists) {
        let ymd = "YYYY/MM/DD";
        let tModal = document.createElement("div");
        let template = document.createElement("div");
        let result = "", newmode = "", wikimq = [];
        let makehtml = function (form, act) {
            let chtml = "";
            Object.keys(form).forEach((key) => {
                if (form[key].viewHidden !== true) {
                    //chtml += `<div class='row'>`;
                    let gdata = act[form[key].gsheet] == undefined ? "" : String(act[form[key].gsheet]);
                    gdata = basic.htmlspecialchars(gdata).replace(/\r?\n/g, "<br>");
                    switch (form[key].type) {
                        case "date":
                            chtml += `<div class='col-12'><p><span class="fw-bold"><small>${glot.get(form[key].glot)}</span></small> ${basic.formatDate(new Date(gdata), "YYYY/MM/DD")}</div>`;
                            break;
                        case "textarea":
                            gdata = basic.autoLink(gdata);
                            chtml += `<div class='col-12'><p><span class="fw-bold"><small>${glot.get(form[key].glot)}</span></small><big> ${gdata.replace(/\r?\n/g, "<br>")}</big></p></div>`;
                            break;
                        case "select":
                        case "text":
                        case "quiz_choice":
                            if (key !== "quiz_answer" && key !== "title" && gdata !== "") {
                                gdata = basic.autoLink(gdata);
                                chtml += `<div class='col-12'><p><span class="fw-bold"><small>${glot.get(form[key].glot)}</span></small> ${gdata.replace(/\r?\n/g, "<br>")}</p></div>`;
                            }
                            break;
                        case "quiz_textarea":
                            chtml += `<div class='col-12 p-1'>${glot.get(form[key].glot)}</div><div class='col-12'>${gdata.replace(/\r?\n/g, "<br>")}</div>`;
                            break;
                        case "url":
                            if (gdata !== "http://" && gdata !== "https://" && gdata !== "") {
                                chtml += `<div class='col-12'><p><span class="fw-bold"><small>${glot.get(form[key].glot)}</span></small><a href="${gdata}">${gdata}</a></p></div>`;
                            }
                            break;
                        case "image_url":
                            if (gdata !== "http://" && gdata !== "https://" && gdata !== "") {
                                if (gdata.slice(0, 5) == "File:") {
                                    // Wikimedia Commons
                                    let id = act.id.replace("/", "") + "_" + key;
                                    wikimq.push([gdata, id]);
                                    chtml += `<div class="col-12"><img class="thumbnail" onclick="modalActs.viewImage(this)" id="${id}"><span id="${id}-copyright"></span></div>`;
                                } else {
                                    chtml += `<div class="col-12"><img class="thumbnail" onclick="modalActs.viewImage(this)" src="${gdata}"></div>`;
                                }
                            }
                            break;
                        default: // 何もしない
                            break;
                    }
                    //chtml += "</div>";
                }
            });
            return chtml;
        };
        template.innerHTML = this.html;
        actlists.sort((a, b) => {
            return a.updatetime < b.updatetime ? -1 : 1;
        }); // sort by update.
        result = modalActs.makeActivityList(actlists);
        actlists.forEach((act, idx) => {
            if (act.id !== "") {
                let clone = template.querySelector("div.body").cloneNode(true);
                let head = clone.querySelector("h5");
                let body = clone.querySelector("div.p-1");
                let updated = basic.formatDate(new Date(act.updatetime), ymd);
                newmode = act.id.split("/")[0];
                let form = Conf.activities[newmode].form;
                head.innerHTML =
                    act.title +
                    ` <button type="button" class="btn btn-sm me-1 ps-1 pe-2 pt-0 pb-0" onclick="cMapMaker.shareURL('${act.id}')">
             <i class="fa-solid fa-clone text-secondary;"></i></button>`;
                head.setAttribute("id", act.id.replace("/", ""));
                let edit = Conf.etc.editMode ? `[<a href="javascript:modalActs.edit({id:'${act.id}',form:'${newmode}'})">${glot.get("act_edit")}</a>]` : "";
                let chtml = Conf.etc.editMode ? `<div class="float-end">${glot.get("update")} ${updated}${edit}</div><br>` : "";
                chtml += makehtml(form, act);
                body.innerHTML = chtml;
                result += clone.outerHTML;
            }
        });
        wikimq.forEach((q) => {
            basic.getWikiMediaImage(q[0], Conf.etc.modalThumbWidth, q[1]);
        }); // WikiMedia Image 遅延読み込み
        tModal.remove();
        template.remove();
        return result;
    }

    // make activity list
    makeActivityList(actlists) {
        if (actlists.length > 1) {
            let html = "<div class='list-group mb-2'>";
            for (let act of actlists) {
                html += `<a href="#" class="list-group-item list-group-item-action" onclick="modalActs.moveTo('${act.id.replace("/", "")}')">${act.title}</a>`;
            }
            return html + "</div>";
        }
        return "";
    }

    // move linkto
    moveTo(id) {
        document.getElementById(id).scrollIntoView({ behavior: "smooth" });
    }

    // edit activity
    // params {id: undefined時はnew, form: フォーム名、空白時は一番上を自動取得}
    edit(params = {}) {
        let title = glot.get(params.id === void 0 ? "act_add" : "act_edit");
        let html = "", act = Conf.activities;
        let data = params.id === void 0 ? { osmid: cMapMaker.open_osmid } : poiCont.get_actid(params.id);
        let fname = params.form == undefined ? Object.keys(Conf.activities)[0] : params.form;

        html = "<div class='container'>";
        Object.keys(act[fname].form).forEach((key) => {
            let akey = "act_" + key;
            html += "<div class='row mb-1 align-items-center'>";
            let defvalue = data[act[fname].form[key].gsheet] || "";
            let form = act[fname].form[key];
            switch (form.type) {
                case "date":
                    html += `<div class='col-2 p-1'>${glot.get(`${form.glot}`)}</div>`;
                    let gdate = basic.formatDate(new Date(defvalue), "YYYY-MM-DD");
                    html += `<div class="col-10 p-1"><input type="date" id="${akey}" class="form-control form-control-sm" value="${gdate}"></div>`;
                    break;
                case "select":
                    html += `<div class='col-2 p-1'>${glot.get(`${form.glot}`)}</div>`;
                    let selects = "",
                        category = form.category;
                    for (let idx in form.category) {
                        let selected = category[idx] !== data.category ? "" : "selected";
                        selects += `<option value="${category[idx]}" ${selected}>${category[idx]}</option>`;
                    }
                    html += `<div class="col-10 p-1"><select id="${akey}" class="form-control form-control-sm">${selects}</select></div>`;
                    break;
                case "textarea":
                case "quiz_textarea":
                    html += `<div class='col-2 p-1'>${glot.get(`${form.glot}`)}</div>`;
                    html += `<div class="col-10 p-1"><textarea id="${akey}" rows="8" class="form-control form-control-sm">${defvalue}</textarea></div>`;
                    break;
                case "quiz_choice":
                case "text":
                    html += `<div class='col-2 p-1'>${glot.get(`${form.glot}`)}</div>`;
                    html += `<div class="col-10 p-1"><input type="text" id="${akey}" maxlength="80" class="form-control form-control-sm" value="${defvalue}"></div>`;
                    break;
                case "quiz_hint_url":
                case "image_url":
                case "url":
                    html += `<div class='col-2 p-1'>${glot.get(`${form.glot}`)}</div>`;
                    html += `<div class="col-10 p-1"><input type="text" id="${akey}" class="form-control form-control-sm" value="${defvalue}"></div>`;
                    break;
                case "comment":
                    html += `<div class='col-2 p-1'>${glot.get(`${form.glot}`)}</div>`;
                    html += `<div class='col-10 p-1'><h5>${glot.get(`${form.glot}`)}</h5></div>`;
                    break;
                case "attention":
                    html += `<div class='col-12 p-1'>${glot.get(`${form.glot}`)}</div>`;
                    break;
            }
            html += "</div>";
        });
        html += "<hr>";
        html += `<div class="row mb-1 align-items-center">`;
        html += `<div class="col-12 p-1"><h5>${glot.get("act_confirm")}</h5></div>`;
        html += `<div class="col-4 p-1">${glot.get("act_userid")}</div>`;
        html += `<div class="col-8 p-1"><input type="text" id="act_userid" class="form-control form-control-sm"></input></div>`;
        html += `<div class="col-4 p-1">${glot.get("act_passwd")}</div>`;
        html += `<div class="col-8 p-1"><input type="password" id="act_passwd" class="form-control form-control-sm"></input></div>`;
        html += `</div></div>`;
        html += `<input type="hidden" id="act_id" value="${params.id === void 0 ? "" : params.id}"></input>`;
        html += `<input type="hidden" id="act_osmid" value="${data.osmid}"></input>`;

        winCont.setProgress(0);
        mapLibre.viewMiniMap(false)
        winCont.makeDetail({ title: title, message: html, menu: true, append: Conf.menu.editActivity });
    }

    save() {
        let act = Conf.activities;
        let fname = Object.keys(Conf.activities)[0];
        winCont.setProgress(0);
        let userid = document.getElementById("act_userid").value;
        let passwd = document.getElementById("act_passwd").value;
        if (!modalActs.busy && userid !== "" && passwd !== "") {
            winCont.setProgress(10);
            modalActs.busy = true;
            let senddata = { id: act_id.value, osmid: act_osmid.value };
            Object.keys(act[fname].form).forEach((key) => {
                let field = act[fname].form[key];
                if (field.gsheet !== "" && field.gsheet !== undefined) senddata[field.gsheet] = document.getElementById("act_" + key).value;
            });
            gSheet
                .get_salt(Conf.google.AppScript, userid)
                .then((e) => {
                    winCont.setProgress(40);
                    console.log("salt: " + e.salt);
                    return basic.makeSHA256(passwd + e.salt);
                })
                .then((hashpw) => {
                    winCont.setProgress(70);
                    console.log("hashpw: " + hashpw);
                    return gSheet.set(Conf.google.AppScript, senddata, fname, userid, hashpw);
                })
                .then((e) => {
                    winCont.setProgress(100);
                    if (e.status.indexOf("ok") > -1) {
                        console.log("save: ok");
                        winCont.clearDatail();
                        gSheet.get(Conf.google.AppScript).then((jsonp) => {
                            poiCont.setActdata(jsonp);
                            let targets = Conf.listTable.target == "targets" ? [listTable.getSelCategory()] : ["-"];
                            cMapMaker.viewArea();
                            cMapMaker.viewPoi(targets); // in targets
                            modalActs.busy = false;
                        });
                    } else {
                        console.log("save: ng");
                        alert(glot.get("act_error"));
                        modalActs.busy = false;
                    }
                    //}).catch(() => {
                    //    winCont.setProgress(0);
                    //    modalActs.busy = false;
                });
        } else if (userid == "" || passwd == "") {
            alert(glot.get("act_error"));
        }
    }

    viewImage(e) {
        const loadImage = async (e) => {
            let image = document.getElementById("PinchImage");
            let src_thumb = e.getAttribute("src_thumb");          // サムネイル画像を表示させる
            image.src = src_thumb == null ? e.src : src_thumb;
            try {
                PinchImageBK.style.display = "block"
                winCont.spinner(true)
                await image.decode();
                let xy = basic.calcImageSize(image.naturalWidth, image.naturalHeight, window.innerWidth, window.innerHeight)
                image.style.width = xy[0] + "px";
                image.style.height = xy[1] + "px";
                xy[0] = (window.innerWidth / 2) - xy[0] / 2;
                xy[1] = (window.innerHeight / 2) - xy[1] / 2;
                image.style.left = xy[0] + "px";
                image.style.top = xy[1] + "px";
                image.style.display = "block";
                image.style.transform = `translate(0px, 0px) scale(1)`;
                console.log("block: " + xy[0] + "px, " + xy[1] + "px");
                winCont.spinner(false)
                modalActs.pinchImage(true)
            } catch (encodingError) {
                console.log("viewImage: decode error.");
                winCont.spinner(false)
            }
        }
        loadImage(e);
    }

    pinchImage(view) {
        let scale = 1, x = 0, y = 0, initX = 0, initY = 0, realX = 0, realY = 0, org_W = 0, org_H = 0,
            pinchStartDistance = null, pinchStartMove = null,
            image = document.getElementById("PinchImage");
        realX = parseInt(image.style.left) || 0;
        realY = parseInt(image.style.top) || 0;
        org_W = image.offsetWidth;
        org_H = image.offsetHeight;

        function handleTouchMove(e) {
            console.log("handleTouchMove");
            let orgX = x, orgY = y;

            if (e.touches.length == 1) {  // 1本指の時
                if (pinchStartMove === null) {
                    pinchStartMove = true
                    initX = e.touches[0].pageX
                    initY = e.touches[0].pageY
                }
                x = e.touches[0].pageX - initX + realX
                y = e.touches[0].pageY - initY + realY
                x = x < (image.width * -1 + 10) ? orgX : x						// マイナス補正
                x = x > (window.innerWidth - 10) ? orgX : x		// プラス補正
                y = (y + image.height - 10) < 10 ? orgY : y						// マイナス補正
                y = y > (window.innerHeight - 10) ? orgY : y					// プラス補正
                image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
            } else if (e.touches.length == 2) {  // 2本指でピンチ操作
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];

                // 2本指の間の距離を計算
                let distance = Math.hypot(touch1.pageX - touch2.pageX, touch1.pageY - touch2.pageY);

                // 最初の距離を記録
                if (pinchStartDistance === null) {
                    pinchStartDistance = distance;
                    return;
                }

                // スケール計算
                let scaleChange = distance / pinchStartDistance;
                let newScale = scale * scaleChange;

                // スケールが小さすぎないように制限
                if (newScale < 0.5) newScale = 0.5;
                if (newScale > 3) newScale = 3;  // スケールの上限設定

                // ピンチ中心を基準に画像を拡大・縮小
                let pinchCenterX = (touch1.pageX + touch2.pageX) / 4;
                let pinchCenterY = (touch1.pageY + touch2.pageY) / 4;

                // 画像の拡大・縮小に合わせて位置を補正
                let deltaX = (pinchCenterX - x) * (newScale - scale) * 0.5;
                let deltaY = (pinchCenterY - y) * (newScale - scale) * 0.5;

                x -= deltaX;
                y -= deltaY;

                // 画面範囲を超えないように調整
                x = Math.min(Math.max(x, (window.innerWidth - org_W * newScale)), 0);
                y = Math.min(Math.max(y, (window.innerHeight - org_H * newScale)), 0);

                // 画像のスタイル更新
                image.style.transform = `translate(${x}px, ${y}px) scale(${newScale})`;

                // 更新されたスケールと位置を反映
                scale = newScale;
                pinchStartDistance = distance;
            }
        }

        function handleTouchEnd() {
            pinchStartDistance = null;
            pinchStartMove = null;
            realX = x;
            realY = y;
        }

        if (view) {
            image.removeEventListener("touchmove", handleTouchMove);
            image.removeEventListener("touchend", handleTouchEnd);
            image.removeEventListener("touchcancel", handleTouchEnd);
            image.addEventListener("touchmove", handleTouchMove);
            image.addEventListener("touchend", handleTouchEnd);
            image.addEventListener("touchcancel", handleTouchEnd);
        } else {
            image.removeEventListener("touchmove", handleTouchMove);
            image.removeEventListener("touchend", handleTouchEnd);
            image.removeEventListener("touchcancel", handleTouchEnd);
            image.style.display = "none";
            image.setAttribute("src", "");
            PinchImageBK.style.display = "none";
            console.log("close");
        }
    }
}
