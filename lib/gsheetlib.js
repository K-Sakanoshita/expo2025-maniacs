// Google Spreadsheet Class Library Script.
"use strict";
const headers = { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' };

class GoogleSpreadSheet {

    constructor() {
        this.last_getdate = "";
    };

    get(GET_Url) {				// サーバーからデータを収集する
        return new Promise(function (resolve, reject) {
            if (GET_Url == "") {
                resolve([]);
            } else {
                console.log("GoogleSpreadSheet: GET: " + GET_Url);
                fetch(GET_Url, { "mode": 'cors', "headers": headers })
                    .then(res => res.json())
                    .then(json => {
                        console.log("[success]GoogleSpreadSheet: GET: OK");
                        let pattern = /on[\w]+=[\"\']?[^>]*[\"\']?>/si;
                        json.forEach(val => {
                            Object.keys(val).forEach(key => { val[key] = typeof val[key] == "string" ? val[key].replace(pattern, '>') : val[key] });
                        });	// Minimal sanitization for "on~" tags(onclick,onload etc)
                        gSheet.last_getdate = new Date(Date.now());
                        resolve(json);
                    }, () => {
                        console.log("GoogleSpreadSheet: GET: NG");
                        reject([]);
                    });
            }
        });
    };

    get_salt(GET_Url, userid) {			// サーバーからSaltを取得する
        return new Promise(function (resolve, reject) {
            if (GET_Url == "") {
                resolve([]);
            } else {
                let ggeturl = GET_Url + '?userid=' + userid;
                console.log("GoogleSpreadSheet: GET_SALT: " + ggeturl);
                fetch(ggeturl, { "mode": 'cors', "headers": headers })
                    .then(res => res.json())
                    .then(json => {
                        console.log("[success]GoogleSpreadSheet: GET_SALT: OK");
                        resolve(json);
                    }, json => {
                        reject(json);
                    });
            }
        });
    };

    set(GET_Url, json, mode, userid, passwd) {	// サーバーにデータを投稿する(1件)
        return new Promise(function (resolve, reject) {
            json = JSON.stringify([json]);
            json = json.replace(/\&/g, '%26');
            let ggeturl = GET_Url + '?json=' + json + '&mode=' + mode + '&userid=' + userid + '&passwd=' + passwd;
            console.log("GoogleSpreadSheet: SET: " + ggeturl);
            fetch(ggeturl, { "mode": 'cors', "headers": headers })
                .then(res => res.json())
                .then(json => {
                    console.log("[success]GoogleSpreadSheet: SET: OK");
                    resolve(json);
                }, json => {
                    reject(json);
                });
        });
    };

    sets(GET_Url, commits) {				// サーバーにデータを投稿する(複数)
        return new Promise(function (resolve, reject) {
            let ggeturl = GET_Url + '?json=' + JSON.stringify(commits);
            fetch(ggeturl, { "mode": 'cors', "headers": headers })
                .then(res => res.json())
                .then(json => {
                    resolve(json);
                }, json => {
                    reject(json);
                });
        });
    };
};
