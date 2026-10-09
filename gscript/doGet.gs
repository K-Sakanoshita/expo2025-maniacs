// activity 全件取得用キャッシュ
var ACTIVITY_CACHE_KEY = "activity_all_v1";
var ACTIVITY_CACHE_SECONDS = 60; // 秒。必要なら 300 などに変更
var ACTIVITY_DELETE_MODE = "activity_delete";
var ACTIVITY_DELETED_COLUMN = "is_deleted";
var ACTIVITY_DELETED_AT_COLUMN = "deleted_at";
var ACTIVITY_DELETED_BY_COLUMN = "deleted_by";

function doGet(e) {

  // シート取得&データ入力
  // update: 2026/08/01
  // Count normal data requests and added a read-only access counter mode.

  var ss = SpreadsheetApp.openById(SpreadsheetApp.getActiveSpreadsheet().getId());
  var sheet, idsheet;

  var jsonSt = (e && e.parameter && e.parameter.json) ? e.parameter.json : "";
  var modeSt = (e && e.parameter && e.parameter.mode) ? e.parameter.mode : "";
  var userid = (e && e.parameter && e.parameter.userid) ? e.parameter.userid : "";
  var passwd = (e && e.parameter && e.parameter.passwd) ? e.parameter.passwd : "";

  var params = [];
  var retdata = "";
  var userrow = 0;
  var nowdt = new Date();

  if (modeSt === "counter_read") {
    retdata = JSON.stringify({ count: getAccessCounter_() });
    return makeOutput_(e, retdata);
  }

  // 引数なしの全データ取得だけキャッシュ対象にする
  var isReadOnlyRequest =
    jsonSt === "" &&
    modeSt === "" &&
    userid === "" &&
    passwd === "";

  if (isReadOnlyRequest) {
    incrementAccessCounter_();

    var cached = getActivityCache_();
    if (cached !== null) {
      Logger.log("Cache hit: " + ACTIVITY_CACHE_KEY);
      return makeOutput_(e, cached);
    }
    Logger.log("Cache miss: " + ACTIVITY_CACHE_KEY);
  }

  // \uXXXX形式を通常の文字に戻す関数
  function unescapeUnicode(str) {
    return str.replace(/\\u([0-9A-Fa-f]{4})/g, function (match, grp) {
      return String.fromCharCode(parseInt(grp, 16));
    });
  }

  // エスケープされたUnicode JSONをパースする関数
  function parseEscapedUnicodeJSON(escaped) {
    try {
      // エスケープ解除後にJSON.parse
      var unescape = unescapeUnicode(escaped);
      var jsonData = JSON.parse(unescape);
      Logger.log("unescapeUnicode: OK");
      Logger.log("Parsed JSON data: " + JSON.stringify(jsonData));
      return jsonData;
    } catch (err) {
      Logger.log("JSON parse error: " + err.message);
      return null;
    }
  }

  sheet = ss.getSheetByName("activity");
  idsheet = ss.getSheetByName("user");

  if (jsonSt !== "") {
    var parsed = parseEscapedUnicodeJSON(jsonSt);

    if (Array.isArray(parsed)) {
      params = parsed;
    } else if (parsed !== null && typeof parsed === "object") {
      // 1件だけ送られてきた場合にも対応
      params = [parsed];
    } else {
      params = [];
    }
  }

  if (userid !== "") {
    userrow = findRow(idsheet, userid, 1);
  }

  Logger.log("jsonp: " + jsonSt);
  Logger.log("userid: rownum: " + userrow);

  // useridはあるがpasswdが無い場合
  // ソルトを計算して返す処理
  if (userid !== "" && passwd === "") {

    var ramdomstr = makeSalt();

    if (userrow > 0) {
      idsheet.getRange(userrow, 3).setValue(ramdomstr);
      retdata = JSON.stringify({
        status: "ok",
        salt: ramdomstr
      });
    } else {
      retdata = JSON.stringify({
        status: "ng(no user)"
      });
    }

  } else if (params.length > 0) {

    // jsonがある場合はデータ更新

    // userrow = 0 のまま getRange() するとエラーになるため先に判定
    if (userrow <= 0) {

      retdata = JSON.stringify({
        status: "ng(no user)"
      });

    } else {

      // ユーザー認証
      var mtpass = idsheet.getRange(userrow, 2).getValue();
      var mtsalt = idsheet.getRange(userrow, 3).getValue();
      var digest = makeSHA256(mtpass + mtsalt);

      if (digest == passwd) {

        if (modeSt === ACTIVITY_DELETE_MODE) {
          var deleteColumns = ensureActivityDeleteColumns_(sheet);
          var deleteSucceeded = true;

          params.forEach(function (param) {
            var deleteRow = findRow(sheet, param["id"], 1);
            if (deleteRow <= 0 || isActivityDeleted_(sheet, deleteRow, deleteColumns.deleted)) {
              deleteSucceeded = false;
              return;
            }
            sheet.getRange(deleteRow, deleteColumns.deleted).setValue(1);
            sheet.getRange(deleteRow, deleteColumns.deletedAt).setValue(nowdt);
            sheet.getRange(deleteRow, deleteColumns.deletedBy).setValue(userid);
          });

          if (deleteSucceeded) {
            clearActivityCache_();
            retdata = JSON.stringify({ status: "ok" });
          } else {
            retdata = JSON.stringify({ status: "ng(no data)" });
          }
          idsheet.getRange(userrow, 3).setValue("");
          return makeOutput_(e, retdata);
        }

        if (params.some(function (param) {
          return param.latitude !== undefined || param.longitude !== undefined;
        })) {
          ensureActivityCoordinateColumns_(sheet);
        }

        var rows = sheet.getDataRange().getValues();
        var keys = rows.splice(0, 1)[0];
        var updateSucceeded = true;

        params.forEach(function (param) {

          // idで検索
          var rownum = findRow(sheet, param["id"], 1);
          var row = [];

          var deletedColumn = keys.indexOf(ACTIVITY_DELETED_COLUMN) + 1;
          if (rownum > 0 && deletedColumn > 0 && isActivityDeleted_(sheet, rownum, deletedColumn)) {
            updateSucceeded = false;
            return;
          }

          keys.forEach(function (key, keyIndex) {

            if (key == "updatetime") {

              row.push(nowdt);

            } else if (key == "updateuser") {

              row.push(userid);

            } else if (key === ACTIVITY_DELETED_COLUMN || key === ACTIVITY_DELETED_AT_COLUMN || key === ACTIVITY_DELETED_BY_COLUMN) {

              row.push(rownum > 0 ? sheet.getRange(rownum, keyIndex + 1).getValue() : "");

            } else if ((key === "latitude" || key === "longitude") && param[key] === undefined && rownum > 0) {

              row.push(sheet.getRange(rownum, keyIndex + 1).getValue());

            } else {

              var value = param[key];

              try {
                value = value !== "" && value !== undefined && value !== null
                  ? String(value).replace(/<br\s*\/?>/gi, "\n")
                  : "";
              } catch (err) {
                value = param[key];
              }

              row.push(value);
            }
          });

          Logger.log("Params: id " + param.id + " / ROWNUM:" + rownum);

          if (rownum > 0) {

            sheet.getRange(rownum, 1, 1, row.length).setValues([row]);
            Logger.log("Update: " + row[0]);

          } else {

            rownum = maxRow(sheet, 1);
            row[0] = modeSt + "/" + ("0000" + rownum).slice(-4);

            Logger.log("Append: " + row[0]);

            sheet.appendRow(row);
          }
        });

        // 更新成功時は全件取得キャッシュを破棄
        clearActivityCache_();

        retdata = JSON.stringify({
          status: updateSucceeded ? "ok" : "ng(no data)"
        });

        idsheet.getRange(userrow, 3).setValue("");

      } else {

        retdata = JSON.stringify({
          status: "ng(no auth)"
        });

        idsheet.getRange(userrow, 3).setValue("");
      }
    }

  } else {

    // 何も指定が無いとき（全データ取得）
    // キャッシュ未ヒット時のみシートから読む
    retdata = JSON.stringify(getData(sheet));

    // キャッシュ保存
    // 100KBを超える場合などは失敗する可能性があるため try/catch 側で処理
    putActivityCache_(retdata);
  }

  Logger.log(retdata);

  return makeOutput_(e, retdata);
}

function getData(sheet) {
  var rows = sheet.getDataRange().getValues();
  var keys = rows.splice(0, 1)[0];
  var deletedIndex = keys.indexOf(ACTIVITY_DELETED_COLUMN);

  return rows.filter(function (row) {
    return deletedIndex < 0 || !isDeletedValue_(row[deletedIndex]);
  }).map(function (row) {
    var obj = {};

    row.map(function (item, index) {
      var key = keys[index];
      if (key !== ACTIVITY_DELETED_COLUMN && key !== ACTIVITY_DELETED_AT_COLUMN && key !== ACTIVITY_DELETED_BY_COLUMN) {
        obj[key] = item;
      }
    });

    return obj;
  });
}

function ensureActivityCoordinateColumns_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  ["latitude", "longitude"].forEach(function (name) {
    if (headers.indexOf(name) >= 0) return;
    headers.push(name);
    sheet.getRange(1, headers.length).setValue(name);
  });
}

function ensureActivityDeleteColumns_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  function ensureColumn(name) {
    var index = headers.indexOf(name);
    if (index >= 0) return index + 1;
    headers.push(name);
    var column = headers.length;
    sheet.getRange(1, column).setValue(name);
    return column;
  }

  return {
    deleted: ensureColumn(ACTIVITY_DELETED_COLUMN),
    deletedAt: ensureColumn(ACTIVITY_DELETED_AT_COLUMN),
    deletedBy: ensureColumn(ACTIVITY_DELETED_BY_COLUMN)
  };
}

function isActivityDeleted_(sheet, row, deletedColumn) {
  return isDeletedValue_(sheet.getRange(row, deletedColumn).getValue());
}

function isDeletedValue_(value) {
  return value === true || value === 1 || String(value).toLowerCase() === "true";
}

function findRow(sh, val, col) {
  var dat = sh.getDataRange().getValues();

  for (var i = 1; i < dat.length; i++) {
    if (dat[i][col - 1] == val) {
      Logger.log("findRow: FOUND " + i + " " + val);
      return i + 1;
    }
  }

  return 0;
}

function maxRow(sheet, col) {
  var maxnum = 0;
  var nownum = 0;
  var dat = sheet.getDataRange().getValues();

  for (var i = 1; i < dat.length; i++) {
    var id = String(dat[i][col - 1] || "");
    var match = id.match(/(\d{4})$/);

    if (match) {
      nownum = parseInt(match[1], 10);

      if (nownum > maxnum) {
        maxnum = nownum;
      }
    }
  }

  Logger.log("maxRow: " + maxnum);

  return maxnum + 1;
}

function makeSHA256(input) {
  var rawHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    input,
    Utilities.Charset.UTF_8
  );

  var txtHash = "";

  for (var i = 0; i < rawHash.length; i++) {
    var hashVal = rawHash[i];

    if (hashVal < 0) {
      hashVal += 256;
    }

    if (hashVal.toString(16).length == 1) {
      txtHash += "0";
    }

    txtHash += hashVal.toString(16);
  }

  return txtHash;
}

function makeSalt() {
  var m = 15;
  var s = "";
  var r = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < m; i++) {
    s += r.charAt(Math.floor(Math.random() * r.length));
  }

  return s;
}

function getActivityCache_() {
  try {
    return CacheService
      .getScriptCache()
      .get(ACTIVITY_CACHE_KEY);
  } catch (err) {
    Logger.log("Cache get error: " + err.message);
    return null;
  }
}

function putActivityCache_(retdata) {
  try {
    CacheService
      .getScriptCache()
      .put(ACTIVITY_CACHE_KEY, retdata, ACTIVITY_CACHE_SECONDS);

    Logger.log("Cache put: " + ACTIVITY_CACHE_KEY);

  } catch (err) {
    // データが100KBを超える場合などはここに来る
    // キャッシュできなくてもレスポンス自体は返す
    Logger.log("Cache put error: " + err.message);
  }
}

function clearActivityCache_() {
  try {
    CacheService
      .getScriptCache()
      .remove(ACTIVITY_CACHE_KEY);

    Logger.log("Cache removed: " + ACTIVITY_CACHE_KEY);

  } catch (err) {
    Logger.log("Cache remove error: " + err.message);
  }
}

function incrementAccessCounter_() {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    var properties = PropertiesService.getScriptProperties();
    var count = Number(properties.getProperty("ACCESS_COUNT") || 0) + 1;
    properties.setProperty("ACCESS_COUNT", String(count));

    return count;
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function getAccessCounter_() {
  var properties = PropertiesService.getScriptProperties();
  return Number(properties.getProperty("ACCESS_COUNT") || 0);
}

function makeOutput_(e, retdata) {
  var callback = (e && e.parameter && e.parameter.callback)
    ? String(e.parameter.callback)
    : "";

  // JSONPのコールバック名チェック
  // foo / foo.bar / jQuery123 のような形式を許可
  var isValidCallback =
    /^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback);

  var output = ContentService.createTextOutput();

  if (callback && isValidCallback) {
    output.setMimeType(ContentService.MimeType.JAVASCRIPT);
    output.setContent(callback + "(" + retdata + ")");
  } else {
    output.setMimeType(ContentService.MimeType.JSON);
    output.setContent(retdata);
  }

  return output;
}
