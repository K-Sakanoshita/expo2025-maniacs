# 更新履歴の表示

一般向けの更新履歴は `data/updates-ja.html` と `data/updates-en.html` で管理します。
READMEの技術的な更新履歴とは別に、利用者にとって変わったことを短く書きます。
本文は汎用モーダル `AppModal` で表示します。

`data/config-user.jsonc` の `siteUpdates` で表示タイミングを設定できます。

```json
{
    "use": true,
    "autoOpen": "daily",
    "delayMs": 0,
    "version": "20261011-01",
    "storageKey": "expo2025.site-updates",
    "title": { "ja": "マップの更新履歴", "en": "Map updates" },
    "contentUrl": { "ja": "./data/updates-ja.html", "en": "./data/updates-en.html" }
}
```

| 設定 | 表示タイミング |
| --- | --- |
| `autoOpen: "daily"` | そのブラウザーで、端末の現地日付ごとに最初に開いたとき |
| `autoOpen: "version"` | `version` が前回表示した版と異なるとき |
| `autoOpen: "always"` | マップを開くたび |
| `autoOpen: "never"` | 自動表示しない |
| `use: false` | 更新履歴機能を無効化 |

`delayMs` は、起動中の読み込み画面が消えた後の追加待ち時間（ミリ秒）です。
本文を更新するときは `version` も更新してください。本文URLのキャッシュ更新にも使います。
`title` と `contentUrl` は言語別のオブジェクト、または共通の文字列を指定できます。
`size` に `sm` / `lg` / `xl` を指定するとモーダルの幅を変更できます。

表示履歴は `storageKey` を接頭辞としてブラウザーのlocalStorageに保存します。
実際に表示が完了した時点で記録するため、本文の取得に失敗しても表示済みにはなりません。
別の端末・ブラウザーや、保存情報を消した場合は再表示されます。保存が禁止されている場合は、開いているページ内だけで表示履歴を保持します。
新着情報や起動時の案内が有効な場合は、更新履歴を閉じた後にそれらの初期化を行います。

検証：`node tests/site-updates.cjs`。
