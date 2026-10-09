const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("baselist.html", "utf8");
const css = fs.readFileSync("common-ui.css", "utf8");
const actionContainer = html.match(/<div id="listActionButtons"[^>]*>/)?.[0] ?? "";
const searchContainer = html.match(/<!-- 検索 -->\s*<div[^>]*>/)?.[0] ?? "";

const categoryContainer = html.match(/<!--セレクト&ボタン-->\s*<div[^>]*>/)?.[0] ?? "";
const mobileColumns = container => Number(container.match(/\bcol-(\d+)\b/)?.[1]);
assert.ok(mobileColumns(searchContainer) >= 6, "search has usable mobile width");
assert.equal(mobileColumns(categoryContainer) + mobileColumns(searchContainer), 12,
    "category and search fill one grid row");
assert.match(actionContainer, /\bhidden\b/, "optional action column starts hidden");
assert.match(actionContainer, /\bcol-2\b/);
assert.match(actionContainer, /\bcol-sm-1\b/);
assert.match(css, /@media \(max-width: 575\.98px\)[\s\S]*?\.list-actions \.btn\s*\{[^}]*min-width:\s*44px;/);

console.log("PASS: mobile list action column and button have usable width");
