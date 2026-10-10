# 汎用モーダル

`lib/appmodal.js` の `AppModal` は、Bootstrapを使って任意のHTMLまたはDOM要素を表示します。
アプリの通常のローダーから読み込まれるため、追加のライブラリ読み込みは不要です。

```js
const updatesModal = new AppModal({
    id: 'siteUpdatesModal',
    title: 'マップの更新履歴',
    html: '<h3>2026年10月</h3><p>会場・施設のオープンデータを公開しました。</p>'
});
updatesModal.show();
```

- `title`：プレーンテキストのタイトル。
- `html`：サイト側で管理するHTML。利用者が入力した文章には `textContent` を使ってDOM要素を作り、`content` に渡してください。
- `content`：HTML文字列またはDOM要素。`html` より優先します。DOM要素のイベントリスナーは維持されます。
- `size`：`sm` / `lg` / `xl`。省略時は標準サイズ。
- `closeLabel`：閉じるボタンの読み上げ名。省略時は共通の翻訳を使用。
- `returnFocus`：閉じた後にフォーカスを戻す要素、またはその要素を返す関数。省略時は開いた時点のフォーカスを記録します。
- `onShow` / `onShown` / `onHidden`：Bootstrapの表示開始・表示完了・非表示完了時の処理。引数はモーダル自身です。
- `className` / `headerClass` / `bodyClass`：追加のCSSクラス。
- `intro`：本文の前に置く説明用DOM要素（任意）。

`setTitle(text)`、`setContent(htmlOrNode)` で表示内容を更新できます。
`show()`、`hide()`、`toggle()` で開閉し、不要になったら `dispose()` で削除します。
`element` と `body` はDOM要素として参照できます。本文はスクロールでき、Escapeキーや背景のクリックでも閉じられます。

新着情報の `NewsTicker` は同じ `AppModal` を使用しています。未読状態の管理、一覧の生成、地図への移動は新着情報側が担当します。
この部品自体は、自動表示や既読管理、お知らせ内容の取得を行いません。

検証：`node tests/appmodal.cjs`、`node tests/news-separation.cjs`、`node tests/change-feed-state.cjs`。
