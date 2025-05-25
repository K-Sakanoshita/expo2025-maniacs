// Window Control(progress&message)
class WinCont {
    constructor() {
        this.modalMode = false;
        this.modal;
        this.events = {}; // save EventsListners
    }

    playback(view) {
        let display = view ? "remove" : "add";
        list_playback_control.classList[display]("d-none");
    }

    download(view) {
        let display = view ? "remove" : "add";
        list_download.classList[display]("d-none");
    }

    splash(mode) {
        if (window == window.parent) {
            splash_image.setAttribute("src", Conf.etc.splashUrl);
            if (mode) {
                this.modal = new bootstrap.Modal(modal_splash, { backdrop: "static", keyboard: false });
                this.modal.show();
            } else {
                this.modal.hide();
            }
        }
    }

    spinner(view) {
        try {
            let display = view ? "remove" : "add";
            global_spinner.classList[display]("d-none");
            list_spinner.classList[display]("d-none");
            image_spinner.classList[display]("d-none");
        } catch (error) {
            console.log("no spinner");
        }
    }

    scrollHint() {
        let img = document.querySelector("#scrollHand img");
        if (images.scrollWidth > images.clientWidth) {
            console.log("scrollHint: Start.");
            const rect = images.getBoundingClientRect();            // 対象要素の座標を取得
            scrollHand.style.top = `${rect.top + window.scrollY + rect.height / 2 - 8}px`;
            scrollHand.style.animation = "swing 0.8s infinite";
            scrollHand.classList.remove("d-none")
            setTimeout(() => {
                scrollHand.classList.add("d-none")
                console.log("scrollHint: End.");
            }, 2000); // フェードアウト後の待機時間を追加
        }
    }

    // open modal window(p: title,message,mode(yes no close),callback_yes,callback_no,callback_close,append,openid)
    // append: append button(Conf.menu.modalButton)
    modal_open(p) {
        let MW = "modal_window";
        if (winCont.modalMode) {
            // 既に開いている場合はイベント削除
            let dom = document.getElementById(MW);
            dom.removeEventListener("hidden.bs.modal", winCont.events["close"]);
        }
        document.getElementById(MW + `_title`).innerHTML = p.title;
        document.getElementById(MW + `_message`).innerHTML = p.message;
        document.getElementById(MW + `_menu`).hidden = p.menu ? false : true;
        const addButton = function (keyn) {
            let dom = document.getElementById(MW + `_` + keyn);
            dom.classList.add("d-none");
            if (p.mode.indexOf(keyn) > -1) {
                dom.innerHTML = glot.get(`button_` + keyn);
                winCont.events[`callback_${keyn}`] = p[`callback_${keyn}`];
                dom.removeEventListener("click", winCont.events[`callback_${keyn}`]);
                dom.addEventListener("click", winCont.events[`callback_${keyn}`]);
                dom.classList.remove("d-none");
            }
        };
        ["yes", "no", "close"].forEach((keyn) => addButton(keyn));
        winCont.modal_progress(0);
        this.modal = new bootstrap.Modal(document.getElementById(MW), { backdrop: true, keyboard: true });
        this.modal.show();
        winCont.modalMode = true;
        let dom = document.getElementById(MW);
        winCont.events["setScroll"] = function (ev) {
            ev.srcElement.removeEventListener(ev.type, winCont.events["setScroll"]);
            if (p.openid !== undefined) {
                let act = document.getElementById(p.openid.replace("/", ""));
                if (act !== null) act.scrollIntoView(); // 指定したidのactivityがあればスクロール
            }
        };
        dom.addEventListener("shown.bs.modal", winCont.events["setScroll"], false);
        winCont.events["close"] = function (ev) {
            console.log("close");
            ev.srcElement.removeEventListener(ev.type, winCont.events["close"]);
            ["yes", "no", "close"].forEach((keyn) => {
                let dom = document.getElementById(MW + `_` + keyn);
                dom.replaceWith(dom.cloneNode(true));
            });
            if (p.callback_close !== undefined) p.callback_close();
        };
        dom.addEventListener("hidden.bs.modal", winCont.events["close"], false);
        let chtml = "";
        if (p.append !== undefined) {
            // append button
            p.append.forEach((p) => {
                if (p.editMode == Conf.etc.editMode || p.editMode == undefined) {
                    chtml += `<button class="${p.btn_class}" onclick="${p.code}"><i class="${p.icon_class}"></i>`;
                    chtml += ` <span>${glot.get(p.btn_glot_name)}</span></button>`;
                }
            });
        }
        modal_footer.innerHTML = chtml;
    }

    // 開いているモーダルにメッセージを追加
    addModalMessage(addText, br) {
        modal_window_message.innerHTML += `${br ? "<br>" : ""}${addText}`
    }

    modal_progress(percent) {
        percent = percent == 0 ? 0.1 : percent;
        $(`#modal_window_progress`).css("width", parseInt(percent) + "%");
    }

    // close modal window(note: change this)
    closeModal() {
        let visited = document.getElementById("visited")
        let memo = document.getElementById("visited-memo")
        if (Conf.etc.localSave !== "" && visited !== null) {    // 訪問機能が有効＆訪問済みチェックの場合
            let value = visited.checked ? "true," : "false,"
            value += memo.value.replaceAll(",", " ");
            localStorage.setItem(Conf.etc.localSave + "." + visited.name, value); // チェック時はtrue
            cMapMaker.eventMoveMap();       // アイコン表示を更新
        }
        winCont.modalMode = false;
        winCont.modal.hide();
        let dom = document.getElementsByClassName("modal-backdrop")[0];
        if (dom !== undefined) dom.remove(); // モーダルを閉じた時に操作できない場合へのアドホックな対処
    }

    osm_open(param_text) {
        // open osm window
        window.open(`https://osm.org/${param_text.replace(/[?&]*/, "", "")}`, "_blank");
    }

    menu_make(menulist, domid) {
        let dom = document.getElementById(domid);
        dom.innerHTML = Conf.menu_list.template;
        Object.keys(menulist).forEach((key) => {
            let link,
                confkey = menulist[key];
            if (confkey.linkto.indexOf("html:") > -1) {
                let span = dom.querySelector("span:first-child");
                span.innerHTML = confkey.linkto.substring(5);
                link = span.cloneNode(true);
            } else {
                let alink = dom.querySelector("a:first-child");
                alink.setAttribute("href", confkey.linkto);
                alink.setAttribute("target", confkey.linkto.indexOf("javascript:") == -1 ? "_blank" : "");
                alink.querySelector("span").innerHTML = glot.get(confkey["glot-model"]);
                link = alink.cloneNode(true);
            }
            dom.appendChild(link);
            if (confkey["divider"]) dom.insertAdjacentHTML("beforeend", Conf.menu_list.divider);
        });
        dom.querySelector("a:first-child").remove();
        dom.querySelector("span:first-child").remove();
    }

    // メニューにカテゴリ追加 / 既に存在する時はtrueを返す
    addSelect(domid, text, value) {
        let dom = document.getElementById(domid);
        let newopt = document.createElement("option");
        var optlst = Array.prototype.slice.call(dom.options);
        let already = false;
        newopt.text = text;
        newopt.value = value;
        already = optlst.some((opt) => opt.value == value);
        if (!already) dom.appendChild(newopt);
        return already;
    }

    clearSelect(domid) {
        const select = document.getElementById(domid);
        while (select.options.length > 0) select.remove(0);     // すべてのoptionを削除
        const placeholder = document.createElement("option");   // プレースホルダー的な "---" を追加
        placeholder.textContent = "---";
        placeholder.value = "";
        select.appendChild(placeholder);
    }

    window_resize() {
        console.log("Window: resize.");
        let mapWidth = basic.isSmartPhone() ? window.innerWidth : window.innerWidth * 0.3;
        mapWidth = mapWidth < 350 ? 350 : mapWidth;
        if (typeof baselist !== "undefined") baselist.style.width = mapWidth + "px";
        if (typeof mapid !== "undefined") mapid.style.height = window.innerHeight + "px";
    }

    // 画像を表示させる
    // dom: 操作対象のDOM / acts: [{src: ImageURL,osmid: osmid}]
    setImages(dom, acts, loadingUrl) {
        dom.innerHTML = "";
        acts.forEach((act) => {
            act.src.forEach((src) => {
                if (src !== "" && typeof src !== "undefined") {
                    let image = document.createElement("img");
                    image.loading = "lazy";
                    image.className = "slide";
                    image.setAttribute("osmid", act.osmid);
                    image.setAttribute("title", act.title);
                    image.src = loadingUrl;
                    dom.append(image);
                    if (src.slice(0, 5) == "File:") {
                        basic.queueGetWikiMediaImage(src, Conf.etc.slideThumbWidth, image); // Wikimedia Commons
                    } else {
                        image.src = src;
                    }
                }
            });
        });
    }

    // 指定したDOMを横スクロール対応にする
    mouseDragScroll(element, callback) {
        let target;
        element.addEventListener("mousedown", function (evt) {
            console.log("down");
            evt.preventDefault();
            target = element;
            target.dataset.down = "true";
            target.dataset.move = "false";
            target.dataset.x = evt.clientX;
            target.dataset.scrollleft = target.scrollLeft;
            evt.stopPropagation();
        });
        document.addEventListener("mousemove", function (evt) {
            if (target != null && target.dataset.down == "true") {
                evt.preventDefault();
                let move_x = parseInt(target.dataset.x) - evt.clientX;
                if (Math.abs(move_x) > 2) {
                    target.dataset.move = "true";
                } else {
                    return;
                }
                target.scrollLeft = parseInt(target.dataset.scrollleft) + move_x;
                evt.stopPropagation();
            }
        });
        document.addEventListener("mouseup", function (evt) {
            if (target != null && target.dataset.down == "true") {
                target.dataset.down = "false";
                if (target.dataset.move !== "true") callback(evt.target);
                evt.stopPropagation();
            }
        });
    }
}
const winCont = new WinCont();
