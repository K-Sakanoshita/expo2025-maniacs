# 大阪・関西万博2025マニアックマップ

このプロジェクトでは、OSMFJ（OpenStreetMap Foundation Japan）提供のタイルサーバーを背景地図に使用し、  
POI（Point of Interest）情報をOverpass APIから取得・表示します。

## 主な表示対象
- パビリオン、ホール
- 店舗（飲食店、売店、コンビニ）
- 各エリアのゾーン（色分け）
- フェンスによる移動可否（ゲートを可視化）
- ゴミ箱、水飲み場、飲料自動販売機
- 案内板、パブリックアート、建物の入口

## 使用技術
- **タイルサーバー**: [OSMFJ提供タイル](https://wiki.openstreetmap.org/wiki/Japan/OSMFJ_Tileserver)
- **POI取得**: [Overpass API](https://overpass-turbo.eu/)
- **地図描画**: [コミュニティマップメーカー](https://github.com/K-Sakanoshita/community_mapmaker) をベースにカスタマイズ
- **写真表示**: [Wikimedia Commons](https://commons.wikimedia.org/)

## 開発と共通システムの更新

静的Webサイトなので、リポジトリのルートで次のコマンドを実行して確認できます。

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

共通システムは `K-Sakanoshita/community_mapmaker` の
`aa671638c0d2c5da1d0965ca3efdd1421abbd1eb`（2026年10月8日取り込み）です。
未使用機能を含め、JavaScript、Google Apps Script、共通HTML・CSS、テストと不足していた画像を取り込んでいます。
共通のJavaScript・Apps Scriptは更新元をベースに使い、万博向けの差分は主に設定ファイルとHTMLのサイト情報に置いています。
`lib/areasearchcontroller.js` と `lib/listtable.js` には、敷地検索を無効にした場合の共通UI・訪問フィルターと、手動カテゴリ一覧の互換性修正を加えています。
訪問フィルター適用時も選択カテゴリと検索キーワードを維持し、一覧を再描画します。

初期位置、2025年10月13日の背景地図、静的OSMデータ、万博カテゴリ、国旗・地球儀、雪景色、Analytics IDを維持しています。
訪問履歴の保存キーは従来の `expo2025.*` を使い、以前のCSV形式の履歴も読み込みます。
POIの表示ズームは従来設定を維持しているため、初期位置から拡大するとパビリオンのアイコンと一覧が表示されます。
旗画像は `flags/w40` からローカル配信し、地図と詳細画面の取得先を `icon.flagPath` で指定しています。
EU・ASEANの既存画像を保持し、万博データで使用する全164種類を同梱しています。取得元は [旗画像の説明](flags/README.md) を参照してください。

一覧はGrid.jsの表から共通システムのカード表示へ更新し、新しい `data/listtable.jsonc` に管理番号・名前・アイコン付き種別・予約情報の列を定義しています。
同ファイルの `listTable.nameFallback` を `category` に設定すると、名前のない施設は種別名、種別も不明なら「名称不明」を薄いグレーで表示します。検索にもこの表示名を使い、元の施設データは変更しません。
旧 `data/listtable-ja.jsonc` / `data/listtable-en.jsonc` は新しい起動処理では読み込みません。
`data/config-user.jsonc` にサイドバー・マーカー色などを設定し、サイト固有の文言は `data/glot-custom.jsonc` で共通文言を上書きします。
OSM詳細リンクは新しい `cMapMaker.openOSMid` を参照します。

カテゴリ辞書（`category-ja.jsonc` / `category-en.jsonc`）、マーカー対応（`marker.jsonc`）、共通文言（`glot-system.jsonc`）も更新元の最新版を反映しています。
共通項目は更新元を優先し、万博向けの `information` カテゴリ・マーカーなど更新元にない項目を追加しています。
Overpassの接続先は最新の共通設定を使い、万博固有の背景地図・表示設定は保持しています。
国境データ（`countries.json` / `countries.min.json`）と `overpass-system.jsonc` は更新元と同じ内容です。
万博の取得対象は `data/overpass-custom.jsonc` を維持し、更新元の汎用取得定義は `data/overpass-generic.jsonc` にそのまま保存しています。
このテンプレートは自動では読み込みません。汎用の施設・インドアなどの取得を有効化する際に必要な定義を `overpass-custom.jsonc` へ追加し、表示ズームなどを設定してください。

経路検索、インドア、3Dモデル、ニュース、更新情報、敷地関連付け、敷地検索、発見機能、一覧アクションのコードも含みます。
これらは初期状態では無効です。各機能の有効化と必要な設定は、[更新元の説明](docs/community-mapmaker.md)を参照してください。
Google Apps Scriptとの連携は従来の `google.AppScript` / `google.targetName` を利用できます。

回帰テストはNode.jsの標準ライブラリだけで実行できます。

```bash
node tests/run.cjs
```

更新元のテスト一式を含み、`tests/generic-config.cjs` は万博の設定と静的データ・訪問履歴の保存先が維持されることを確認します。
`tests/expo-disabled-search-ui.cjs` と `tests/expo-menu-list.cjs` は、敷地検索を使わない場合の個人フィルターと、カテゴリ・キーワード・訪問状態の絞り込みを確認します。
公園向けのテスト設定は `tests/fixtures/` に置き、万博の実設定と分離しています。

## ライセンス
このプロジェクトのソースコードは [MITライセンス](LICENSE) のもとで提供されます。  
ただし、背景地図および取得するデータ（OSMデータ）はそれぞれのライセンスに従います。
- OpenStreetMapデータ: [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/)
- OSMFJタイルサーバー利用規約に準拠
- スプラッシュ画像はいらすとやを利用しているので、MITライセンスには含めません

## 注意事項
- このサイトは万博公式とは一切関係ありません。
- 表示するデータはリアルタイムの状況を反映するものではない場合があります。

## 更新履歴
- 2025/04/30 仮公開
- 2025/05/04 正式公開、検索機能の不具合があったためシンプル化して改善、訪問管理機能を追加
- 2025/05/06 マーカー表示の改善（DOMからSymbolへ変更、アニメーションを削除）
             localStorageの保存キー名を変更（頭にexpo2025.を追加など）
- 2025/05/10 POIの表現力を向上、内部処理の見直し、メニュー機能の拡張（課題は日本語のみ）
             予約の必要性を表示するように改修(reservationタグ)
- 2025/05/16 給水所のボトル有無をアイコン表示、ページリロード時のカテゴリ保持（バグ修正）
             訪問済みにメモを残す、2F以上の地物は浮かばせる、エリアにrefタグも表示させる
             広場の名前を表示、リスト選択時に強調表示、掲示板のアイコン表示を詳細化、
             背景地図の地名表示をなくす、OpenStreetMapデータの更新
- 2025/05/25 訪問履歴とメモも保存、取り込み機能を追加
             営業時間の表示、トイレのキャパシティを表示、大屋根リングの番号を表示
             Wikimedia Commonsからパビリオンの表示、OpenStreetMapデータの更新
- 2025/05/28 訪問履歴のインポート時に改行をなくす処理を追加、OpenStreetMapデータの更新
- 2025/06/01 地球儀モードを追加、訪問済みアイコンを地味にする、メニューの見直し
             細かいバグ取り、OpenStreetMapデータの更新
- 2025/06/04 地球儀の国名を日本語化、未訪問と訪問済みの国を地球儀上にも反映させる
             国旗を表示、管理番号(ref/local_ref)を表示、バス/フェリーターミナル名表示
             OpenStreetMapデータの更新
- 2025/06/24 情報表示をモーダルからサイドパネルへ変更。UI周りを全般的に改善
             絞り込みのセレクトボックスを見直し（一つ削減）、OpenStreetMapデータの更新
- 2025/07/11 PC横画面の場合はサイドバーを表示させ、地球儀を大きく表示するよう変更
             樹木と広場を地図に表示、アイコン/地域クリック時の強調表示の方法を見直し
             複数国で運用しているパビリオンの地球儀表示に対応（EUや北欧館など）
             旗の表示方式を見直し（地球儀内に配置）、表示する店舗種別を追加
             OpenStreetMapデータの更新
- 2025/07/12 ブルーインパルス飛行おめでとう！アップデート
             サイドバーにコンパクトモード追加して、目的地のマーカーをオンにした状態で
             地図を見ながら移動することが出来るように。あと、樹木を少し控えめに表現
             2F以上の地物には階数も表示するよう変更
- 2025/07/13 訪問チェックライブラリのバグを修正
- 2025/08/11 お気に入りと訪問済みの非表示オプションを追加(Thanks! Koji Matsuda)
             メニュー構成の見直し、OpenStreetMapデータの更新
- 2025/10/13 ベースシステム更新によるバグ修正（北欧館の訪問済みバグはまだ未対応）
             お気に入りにアイコン表示、メモ欄を長く見直し、休憩所を表示
             OpenStreetMapデータの更新（店舗やパビリオン写真の追加・見直し）
- 2025/10/19 訪問済みアイコンのサイズを大きくし、未訪問のアイコンを小さく（思い出）
             3Dマップを10月13日時点の状態へ静止（新しくPMTilesを作成して利用）
             マップ表示時にマップの種類や時期を表示する。Favicon更新
- 2025/10/31 OSMにWikipedia/Wikidataタグが追加されたため最新データを取り込む
             Wikipedia記事の表示デザインを少し見直し、旗竿と国旗を表示させる
- 2025/12/25 ベースシステムを更新とバグ取り。メニューの背景画像を作成
             背景地図の切り替えで、雪景色（昼間と夜）を追加。雪も降らしてみる

## 参考
### expo2025.json を作るOverpass QL

```overpass ql:expo2025
[out:json][timeout:120];

area(131094702)->.yume;

(
  nwr["natural"](area.yume);
  nwr["barrier"="hedge"](area.yume);
  way["tourism"="theme_park"](area.yume);
  way["place"="locality"](area.yume);

  way["area:highway"]["access"="no"](area.yume);
  way["area:highway"]["access"="private"](area.yume);

  way["barrier"="wall"](area.yume);
  way["barrier"="fence"](area.yume);

  nwr["amenity"="bar"](area.yume);
  nwr["amenity"="bench"](area.yume);
  nwr["amenity"="cafe"](area.yume);
  nwr["amenity"="pub"](area.yume);
  nwr["amenity"="luggage_locker"](area.yume);
  nwr["amenity"="waste_basket"](area.yume);
  nwr["amenity"="stage"](area.yume);
  nwr["amenity"="taxi"](area.yume);
  nwr["amenity"="toilets"](area.yume);
  nwr["amenity"="bus_station"](area.yume);
  nwr["amenity"="shelter"](area.yume);
  nwr["amenity"="picnic_site"](area.yume);
  nwr["amenity"="fast_food"](area.yume);
  nwr["amenity"="ferry_terminal"](area.yume);
  nwr["amenity"="food_court"](area.yume);
  nwr["amenity"="restaurant"](area.yume);
  nwr["amenity"="theatre"]["access"!~"^private$"](area.yume);
  nwr["amenity"="smoking_area"]["access\"!~"^private$"](area.yume);
  nwr["amenity"="place_of_worship"](area.yume);
  nwr["amenity"="exhibition_centre"](area.yume);
  nwr["amenity"="drinking_water"](area.yume);
  nwr["amenity"="vending_machine"](area.yume);
  nwr["amenity"="post_office"](area.yume);
  nwr["amenity"="ferry_terminal"](34.6570488832774, 135.37857824056903, 34.660596217537034, 135.40079835085356);
  
  nwr["building"]["name"](area.yume);

  nwr["tourism"](area.yume);
  nwr["office"](area.yume);
  nwr["leisure"](area.yume);
  nwr["shop"](area.yume);
  nwr["craft"](area.yume);

  nwr["man_made"="water_tap"](area.yume);

  node["highway"="elevator"](area.yume);
  node["highway"="bus_stop"](area.yume);
  node["entrance"](area.yume);
);

out body meta;
>;
out skel;
```
