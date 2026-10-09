# 旗画像

`data/expo2025.min.json` の `country` タグにある164種類をローカル配信します。
地図上の旗と詳細画面の旗は、`data/config-user.jsonc` の `icon.flagPath` に指定した
`./flags/w40` を参照します。ページ表示時に旗画像CDNへの通信は発生しません。

- 追加した162種類のPNGは https://flagcdn.com/w40/{国コード}.png から取得しました。
  配布元の説明: https://flagpedia.net/download/api
- EUとASEANは、このリポジトリに既に含まれていた画像をそのまま使用しています。
- `h20` の既存画像も保持しています。

OSMデータに新しい国コードを追加する場合は、対応する小文字のPNGも追加してください。
`node tests/local-country-flags.cjs` で全コードに対応する画像の存在を確認できます。
