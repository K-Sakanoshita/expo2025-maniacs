# Community Map Maker

OpenStreetMapのOverpass APIやGoogle Spreadsheetのデータを地図上に表示し、設定ファイルを編集してさまざまなコミュニティマップを作成できるWebアプリです。

## ローカルでの確認

静的Webサイトのため、リポジトリのルートでHTTPサーバーを起動して確認できます。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開いてください。

## 共通システムの更新元と互換性

「遊具のある公園マップ」を共通システムの最新開発版として、
[armd-02/Playgrounds](https://github.com/armd-02/Playgrounds) の
`79ba3a229f7b06f6765e239560794de8cbc40995`（2026年10月8日取り込み）から共通コードを更新しています。

サイドバー操作、共有URL、経路検索、投稿API・スキーマ対応、更新情報、敷地と地物の関連付け、検索、設定ベースの3D表示などの実装を取り込みました。
MapLibre GL JSは5.24.0を使用します。公園専用の公開URL・Analytics・投稿先・遊具モデル素材は引き継いでいません。

デモの初期位置・ズーム・カテゴリ・Overpass取得対象・投稿フォーム・背景地図・インドア表示と、サイト名・画像・独自CSSは従来の設定を維持しています。
追加の共通UIスタイルは `common-ui.css` に分離し、既存の `user.css` を後から読み込んで上書きします。
新しい共通文言は `data/glot-system.jsonc` に追加し、`data/glot-custom.jsonc` を優先します。

従来の `google.AppScript` / `google.targetName` は起動時に `activity` 設定へ対応付けるため、設定ファイルの移行は不要です。
明示した `activity` 設定がある場合はそちらを優先します。新しいJSON APIを利用する場合は、例えば次の設定を `data/config-user.jsonc` に追加できます（URLは自分のサーバーへ変更してください）。

```json
"activity": {
    "url": "https://example.com/api/activities.php?app=my-map",
    "authMode": "basic",
    "targetName": "activity"
}
```

`news`、`changes`、`intro`、`areaFeatureLinker`、`areaSearch`、`discovery`、`listActions`、`feature3d`、`directions` は、未設定の場合は無効です。
利用したい機能に `"use": true` と、その地図に合う設定を追加してください。
例えば経路検索は `"directions": { "use": true }` で有効になります。
敷地の関連付けは `areaFeatureLinker.areaTargets` / `featureTargets` に既存のOverpass対象名を指定し、一覧の `list.views` / `listTable.viewBindings` も設定します。
3D表示は `feature3d.models` / `rules` に任意のモデルURLとタグ条件を指定します。遊具向けの手続き型モデル生成関数も利用できますが、モデル素材や公園専用のルールは同梱していません。
新しい `icon.zoomSteps` を指定しない場合は、従来のマーカー倍率を使用します。

## テスト

リポジトリのルートで、Node.jsの標準ライブラリだけを使う回帰テストを実行できます。

```bash
node tests/run.cjs
```

上流から取り込んだ公園向けの設定を使うテストは `tests/fixtures/` を参照し、デモの実設定と分離しています。
`tests/generic-config.cjs` では、既存設定の維持、Google Apps Scriptとの互換性、追加機能の初期無効化と明示設定の優先を確認します。
テスト内のHTTP 500や未対応APIのログは、障害時の処理を検証するための模擬応答です。

## 主な設定

* `data/config-user.jsonc`: 初期表示、サイドバー、一覧、外部データ、メニュー
* `data/config-system.jsonc`: Overpass API、背景地図、共通表示設定
* `data/overpass-custom.jsonc`: 表示するOSM地物
* `data/category-ja.jsonc` / `data/category-en.jsonc`: カテゴリ名
* `data/marker.jsonc`: マーカー画像の対応
* `data/glot-custom.jsonc`: サイト固有の表示文言
* `manifest.json`: 読み込むCSS、JavaScript、Analytics ID

マーカー画像は `icon/` に配置します。静的GeoJSONを利用する場合は `data/config-user.jsonc` の `static` を設定してください。

`map.zoomMessageThreshold` は「もっとズームしてください」を消すズームレベルです。POI自体の取得・表示開始ズームは、従来どおり `poiView.poiZoom` と `poiView.mobilePoiZoom` で対象ごとに設定します。

## 起動とOverpass取得

初期HTMLにスプラッシュと進捗を直接配置し、外部CSSとJavaScriptを並列に読み込みます。地図と操作UIの準備が完了した時点でスプラッシュを閉じ、その次の描画フレームからOverpassによる周辺データ取得を開始するため、データ取得中も先に地図を操作できます。読み込み失敗時はスプラッシュに再読み込みボタンを表示します。

Overpassのダウンロード中は受信量を0.1MB単位で `Loading...` に表示します。HTTP 408/425や一時的な応答異常は同じサーバーで一度再試行し、HTTP 429、5xx、タイムアウトなどは別の設定済みサーバーへ切り替えます。構文・クエリエラーに相当する4xxは別サーバーへ送っても改善しないため、そのまま終了します。429を返したサーバーにはクールダウンを設けます。

動的取得のキャッシュはズーム14のタイル範囲と取得対象の組み合わせで管理します。画面の中心、表示範囲、ズーム、傾き、方角が同じ連続更新だけを重複処理として抑止し、地図を別地域へ移動した場合は新しい範囲をOverpassから取得します。

## POIデータの保持上限

動的なOverpass取得では、`data/config-user.jsonc` の `poiData.maxFeatures` を`pdata`の保持上限、`poiData.pruneThreshold` を整理開始件数として使います。既定では15,000件を超えた時だけ現在地に近い12,000件へ整理し、毎回の追加時には全件ソートしません。表示中の詳細POIとActivityに紐づくPOIは優先して保持します。データ整理後はタイルの取得済み判定を無効化し、同一の表示範囲・中心座標・ズーム・傾き・方角で続けて発生する重複更新だけを抑止します。地図を移動した場合はOverpassから取得し直します。`poiData.applyToStatic` が `false` の場合、静的データには上限を適用しません。

## インドア表示

`data/config-user.jsonc` の `indoor.use` を `true` にすると、建物内の部屋、壁、通路とドアを階別に表示します。`indoor=corridor` と `highway=corridor` の両方を通路として扱い、`highway=corridor` に `level` がなければ1Fとして表示します。インドアの面地物は塗りつぶさず、部屋・通路・共用エリアを輪郭線と名称で描画します。`level` の単一値、セミコロン区切り、数値範囲、`repeat_on` を解釈します。`level` のないPOIはOSMの `level=0` と同じ1F扱いです。

`poiView=true` の取得対象に属する `level=*` 付きPOIだけが画面内にある場合は「階層表示」とし、ズームレベルに関係なく階選択と階別表示を有効にします。設定した `indoor=room/area/corridor/wall` または `highway=corridor` がある場合を「インドア表示」とし、部屋、通路、壁などを表示します。どちらの状態でも背景3D建物の不透明度は変更しません。建物を使う従来判定では通常は `poiView.poiZoom.indoor`、モバイルは `poiView.mobilePoiZoom.indoor` のズームレベルを使います。小規模な建物は `indoor.buildingGroup` の面積・距離条件で複数棟をまとめられ、画面を覆う大規模建物は `indoor.largeBuildingActivation` の条件でズーム15から判定できます。

階層表示へ初めて入る時は、URLに `indoor.control.urlParameter` の階指定があればその値を優先し、未指定なら `indoor.defaultLevel` を使います。詳細URLを開き直した場合や再読み込みした場合も指定階を保持します。指定階が対象データにない場合は、表示可能な最初の階へ切り替えます。階数切り替えは開始時から5段の縦スクロール式階選択を展開し、現在階だけを表示する折りたたみボタンは置きません。階の選択肢をクリックまたはタップすると即時に切り替わり、続けて別の階を選べます。フロアを変更すると、選択中のPOI、詳細表示、地図上の選択強調を解除します。マウスホイール、スワイプ、上下キーは候補を移動するだけで、スクロール終了時には確定しません。キーボードではEnterで中央候補を確定できます。POIがなくても部屋、通路、壁などのインドア地物がある階は選択でき、POIとインドア地物のどちらもない推定階は薄く表示して選択不可にします。表示中の階はURLにも保存されます。

階数推定用の建物形状は `indoor.buildingSource` で指定したベクタータイルの `building` レイヤーだけから取得します。現在の背景地図に同じソースがあれば再利用し、ラスタースタイルでは判定専用の非表示ソースを追加します。建物形状は地図には描画せず、`render_height` を3.66m/階で四捨五入して最高階を推定します。地物に推定値を超える `level` がある場合は、明示された階を優先して階選択を延長します。Overpassからは建物way・relationを取得しません。インドア用の面・線・点は表示専用で選択できません。`indoor` 描画の対象は `data/overpass-custom.jsonc` の `expression.renderTags` で設定し、標準では `indoor=room/area/corridor/wall` または `highway=corridor` の面・線を輪郭表示し、Pointの青点は `door=*` だけを表示します。POIアイコンと施設リストへの掲載は各取得対象の `poiView` / `listView` に従い、階層表示中も `poiView.poiZoom` / `mobilePoiZoom` のズーム条件を維持します。POIマーカーと施設リストは選択階に合うものだけを表示し、インドア時はマーカー名の階数表記、重複するOSM点名、2F以上で使う影レイヤーを非表示にします。

主な設定項目は次のとおりです。

* `indoor.defaultLevel`: インドア表示開始時のOSM階番号
* `indoor.floorHeightMeters` / `floorOffsetMeters`: 傾斜表示時の階高（標準3.66m）と1階のオフセット。階別の輪郭・名称は階空間の中央高を基準にし、見分けやすくするため画面上の浮上量を2倍に補正
* `indoor.backgroundTransportationOpacity`: インドア表示中のベクタータイル上のレール、プラットフォーム、`highway=footway` の不透明度（標準0.08、終了時は元の値へ復元）
* `indoor.buildingLevelHeightMeters`: ベクタータイルの建物高さを階数へ戻す換算値
* `indoor.buildingSource`: 階数推定に使う建物タイルソース、ソースレイヤー、高さ属性
* `indoor.fallbackLevels`: `level` がない特定タグへ補う階番号
* `indoor.buildingGroup`: 小規模建物をまとめる面積、距離、屋内POI必須条件
* `indoor.underground`: 建物未選択時に地下施設からインドア表示を開始する条件
* `indoor.largeBuildingActivation`: 大規模建物を低いズームから判定する条件
* `indoor.levels`: データからの階数検出と階順
* `indoor.control`: 階数切り替えUIとURLパラメーター

取得対象と描画色は `data/overpass-custom.jsonc` の `osm.indoor` で設定します。`expression.poiView` と `expression.listView` はインドア地物そのもののマーカー・リスト表示を制御し、`expression.styles` で部屋、通路、壁、扉の色や線幅を変更できます。

## 経歴

* 2020/11/23 開発開始
* 2021/04/07 「大阪思い出のこしマップ」をリリース
* 2021/08/05 「くさつお宝マップ」をリリース
* 2021/10/02 「図書館年表マップ」をリリース
* 2022/03/04 「Open History & Culture Map」をリリース
* 2022/05/02 「設備管理MAP(デモ)」をリリース
* 2023/01/25 「遊具のある公園マップ(β版)」をもとに本家を更新
* 2024/05/18 「東淀川区新歓祭マップ2024」をもとに本家を更新
* 2026/08/22 「長浜城下町遺産マップ」の実装をもとに本家を更新
* 2026/08/24 起動処理、Overpass取得・キャッシュ、POI保持上限、階層・インドア表示を改善
* 2026/10/08 「遊具のある公園マップ」の最新共通コードを取り込み、汎用デモ設定と従来の設定形式を維持
