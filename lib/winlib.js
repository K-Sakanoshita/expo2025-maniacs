// Window Control(progress&message)
class WinCont {
    constructor() {
        this.splashObj;
        this.detail = false;				// viewDetail表示中はtrue
        this.sidebarSize = 0;
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
                    chtml += ` ${glotName == null ? "" : glotName}</button>`;
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
        let favorite = document.getElementById("favorite")
        let memo = document.getElementById("visited-memo")
        let mmap = document.getElementById("mini-map")
        let menu = document.getElementById("btnMenu")
        if (Conf.etc.localSave !== "" && visited !== null) {    // 訪問機能が有効＆訪問済みチェックの場合
            poiStatusCont.setValueByOSMID(visited.name, visited.checked, favorite.checked, memo.value)
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
        return winCont.setSidebar()
    }

    // サイドバーのサイズ設定(mode:空は非表示(0) / view:初期値1 / change:2<->3 / mini:1 )
    setSidebar(mode) {
        return new Promise((resolve, reject) => {
            const topPane = document.getElementById("top-pane");
            const btmPane = document.getElementById("bottom-pane");
            const sideCnt = document.getElementById("sidebarCont");
            const sideChg = document.getElementById("sidebarChange");
            const minimap = document.getElementById("mini-map");

            this.sidebarSize =
                mode === "mini" ? 1 :
                    mode === "view" ? 2 :
                        mode === "change" && this.sidebarSize <= 2 ? 3 :
                            mode === "change" && this.sidebarSize == 3 ? 2 :
                                mode === "" || mode == undefined ? 0 : this.sidebarSize;
            sideCnt.classList.toggle("d-none", this.sidebarSize == 0);  // サイドバー操作表示/非表示
            if (this.sidebarSize == 0) geoCont.clearPolygon()

            const isWide = window.matchMedia('(min-width: 1080px)').matches;
            if (!isWide) {  // 縦長画面の場合
                mapid.style.removeProperty('height');
                const maxHeight = window.innerHeight;
                let btmHeight, topHeight
                const icon = this.sidebarSize < 3 ? "up" : "down"
                sideChg.innerHTML = `<i class='fa-solid fa-chevron-${icon}'></i>`

                let mapsize = 0;
                switch (this.sidebarSize) {
                    case 0: mapsize = 0; break;
                    case 1: mapsize = 0; break;
                    case 2: mapsize = Math.max(maxHeight / 6, Conf.minimap.height); break;
                    case 3: mapsize = maxHeight - (btmPane.clientHeight); break;
                }
                minimap.style.height = `${mapsize}px`

                switch (this.sidebarSize) {
                    case 0: btmHeight = 0; break;
                    case 1: btmHeight = maxHeight * 0.1; break;
                    case 2: btmHeight = maxHeight * 0.4; break;
                    case 3: btmHeight = maxHeight; break;
                }
                if (btmWindow.clientHeight < btmHeight && this.sidebarSize == 1) btmHeight = btmWindow.clientHeight
                topHeight = maxHeight - btmHeight;

                cMapMaker.status = "moveing"
                mapLibre.stop()
                console.log("top: " + topPane.offsetHeight + "px -> " + topHeight + "px")
                console.log("btm: " + (maxHeight - topPane.offsetHeight) + "px -> " + btmHeight + "px")
                let startHeight = topPane.offsetHeight > maxHeight ? 0 : maxHeight - topPane.offsetHeight
                btmPane.animate([
                    { height: startHeight + "px" }, { height: btmHeight + "px" }
                ], { duration: 200, easing: 'ease-out', fill: 'forwards' });
                topPane.animate([
                    { height: topPane.offsetHeight + "px" }, { height: topHeight + "px" }
                ], { duration: 200, easing: 'ease-out', fill: 'forwards' }).finished.then(() => {
                    topPane.style.height = `${topHeight}px`;  // 念のため明示
                    btmPane.style.height = `${btmHeight}px`;  // 念のため明示
                    mapLibre.start()
                    mapLibre.map.resize()
                    cMapMaker.status = "normal"
                    resolve()
                })
            } else {    // 横長画面の場合
                mapid.style.height = "100vh"
                btmPane.style.height = "100vh"

                const icon = this.sidebarSize < 3 ? "left" : "right"
                sideChg.innerHTML = `<i class='fa-solid fa-chevron-${icon}'></i>`

                const maxWidth = window.innerWidth;
                let btmWidth, topWidth
                switch (this.sidebarSize) {
                    case 0: btmWidth = 0; break;
                    case 1: btmWidth = 0; break;        // 非表示だけどフォーカスは合わす
                    case 2: btmWidth = 480; break;
                    case 3: btmWidth = maxWidth; break;
                }

                topWidth = maxWidth - btmWidth;
                minimap.style.height = (btmPane.clientHeight * 0.7) + "px"

                cMapMaker.status = "moveing"
                mapLibre.stop()
                btmPane.animate([
                    { flex: `0 0 ${maxWidth - topPane.offsetWidth + "px"}` }, { flex: `0 0 ${btmWidth + "px"}` }
                ], { duration: 200, easing: 'ease-out', fill: 'forwards' });
                topPane.animate([
                    { flex: `0 0 ${topPane.offsetWidth + "px"}` }, { flex: `0 0 ${topWidth + "px"}` }
                ], { duration: 200, easing: 'ease-out', fill: 'forwards' }).finished.then(() => {
                    btmPane.style.flex = `0 0 ${btmWidth}px`
                    mapLibre.start()
                    cMapMaker.status = "normal"
                    resolve()
                });
            }
        })
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

    // ウインドウサイズ変更時の処理
    resizeWindow() {
        console.log("Window: resize.");
        let mapWidth = basic.isSmartPhone() ? window.innerWidth : window.innerWidth * 0.3;  // トップメニューの横サイズ
        mapWidth = mapWidth < 350 ? 350 : mapWidth;
        if (typeof baselist !== "undefined") baselist.style.width = mapWidth + "px";
        document.getElementById("mapid").style.height = window.innerHeight + "px"
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
                        basic.queueGetWikiMediaImage(src, Conf.thumbnail.slideThumbWidth, image); // Wikimedia Commons
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

    // 画面中央にメッセージを表示し、2秒かけてフェードアウトする関数
    showMessage(text) {
        // 既存のメッセージ要素を削除（重複防止）
        const existing = document.querySelector(".fade-message");
        if (existing) existing.remove();

        // 新しいメッセージ要素を作成
        const msg = document.createElement("div");
        msg.className = "fade-message";
        msg.textContent = text;
        document.body.appendChild(msg);

        // 一瞬待ってからフェードアウト開始
        setTimeout(() => msg.classList.add("hide"), 1000);

        // 完全に消えたら要素を削除
        setTimeout(() => msg.remove(), 3000);
    }
}
const winCont = new WinCont();
