// Window Control(progress&message)
class WinCont {
    constructor() {
        this.splashObj;
        this.detail = false;				// viewDetail表示中はtrue
    }

    playback(view) {
        let display = view ? "remove" : "add";
        list_playback_control.classList[display]("d-none");
    }

    download(view) {
        let display = view ? "remove" : "add";
        list_download.classList[display]("d-none");
    }

    viewSplash(mode) {
        if (window == window.parent) {
            splashSrc.setAttribute("src", Conf.etc.splashUrl);
            if (mode) {
                this.splashObj = new bootstrap.Modal(splashImage, { backdrop: "static", keyboard: false });
                this.splashObj.show();
            } else {
                this.splashObj.hide();
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

    // open modal window(p: title,message,mode(yes no),callback,append,openid)
    // append: append button(Conf.menu.modalButton)
    makeDetail(p) {
        document.getElementById("btmWindow_title").innerHTML = p.title;
        document.getElementById("btmWindow_message").innerHTML = p.message;

        winCont.setProgress(0);
        let chtml = "";
        if (p.append !== undefined) {
            p.append.forEach((p) => {        // append button
                let glotName = glot.get(p.btn_glot_name)
                if (p.editMode == Conf.etc.editMode || p.editMode == undefined) {
                    chtml += `<button class="${p.btn_class}" onclick="${p.code}"><i class="${p.icon_class}"></i>`;
                    chtml += ` <span>${glotName == null ? "" : glotName}</span></button>`;
                }
            })
        }
        sideBarPanel.innerHTML = chtml;
        if (p.openid !== undefined) {
            let act = document.getElementById(p.openid.replace("/", ""));
            if (act !== null) act.scrollIntoView(); // 指定したidのactivityがあればスクロール
        }
    }


    clearDatail() {
        let visited = document.getElementById("visited")
        let memo = document.getElementById("visited-memo")
        let mmap = document.getElementById("mini-map")
        let menu = document.getElementById("btnMenu")
        if (Conf.etc.localSave !== "" && visited !== null) {    // 訪問機能が有効＆訪問済みチェックの場合
            visitedCont.setValueByOSMID(visited.name, visited.checked, memo.value)
            cMapMaker.eventMoveMap()                            // アイコン表示を更新
        }
        mmap.classList.add("d-none")

        let catname = listTable.getSelCategory() !== "-" ? `?category=${listTable.getSelCategory()}` : ""
        history.replaceState('', '', location.pathname + catname + location.hash)
        this.open_osmid = ""
        this.detail = false
        sideBarPanel.innerHTML = ""
        btmWindow_title.innerHTML = ""
        btmWindow_message.innerHTML = ""
        menu.nextElementSibling.classList.add("d-none")
        cMapMaker.setSidebar()
    }

    // 開いているモーダルにメッセージを追加
    addDetailMessage(addText, br) {
        btmWindow_message.innerHTML += `${br ? "<br>" : ""}${addText}`
    }

    setProgress(percent) {
        percent = percent == 0 ? 0.1 : percent;
        $(`#btmWindow_progress`).css("width", parseInt(percent) + "%");
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

    resizeWindow() {
        console.log("Window: resize.");
        let mapWidth = basic.isSmartPhone() ? window.innerWidth : window.innerWidth * 0.3;
        mapWidth = mapWidth < 350 ? 350 : mapWidth;
        if (typeof baselist !== "undefined") baselist.style.width = mapWidth + "px";
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
