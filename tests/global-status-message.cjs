const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const winlib = fs.readFileSync(path.join(root, "lib/winlib.js"), "utf8");
const cmapmaker = fs.readFileSync(path.join(root, "cmapmaker.js"), "utf8");
const systemCss = fs.readFileSync(path.join(root, "system.css"), "utf8");

assert.match(winlib, /\[this\.loadingStatusMessage, this\.mapStatusMessage\][\s\S]*\.filter\(Boolean\)[\s\S]*\.join\(" \/ "\)/);
assert.match(cmapmaker, /winCont\.setLoadingStatus\(`/);
assert.match(cmapmaker, /winCont\.setMapStatus\(""\)/);
assert.match(cmapmaker, /areaSearchController\.renderDisplayStatus\(\)/);
assert.doesNotMatch(cmapmaker, /winCont\.spinner\(false\);[\s\S]{0,160}globalMessage\.innerHTML = ""/);
assert.match(systemCss, /#globalStatus\s*\{[^}]*width:\s*max-content;[^}]*max-width:\s*calc\(100% - 24px\);/s);

console.log("zoom status uses the configured display indicator");
