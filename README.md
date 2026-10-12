# 大阪・関西万博2025マニアックマップ

万博開催時から使われてきたマップを継続して提供するとともに、当時の会場・施設の地理空間データを公開しています。
当時の資料として、別のアプリやサービスにも活用してください。

- [万博マップを開く](https://k-sakanoshita.github.io/expo2025-maniacs/)
- [データ公開・AI向け開発ガイド](https://k-sakanoshita.github.io/expo2025-maniacs/data.html)
- [閉幕日の背景地図（Japan PMTiles）](https://armd-01.sakura.ne.jp/tiles/)

## 主な表示対象
- パビリオン、ホール
- 店舗（飲食店、売店、コンビニ）
- 各エリアのゾーン（色分け）
- フェンスによる移動可否（ゲートを可視化）
- ゴミ箱、水飲み場、飲料自動販売機
- 案内板、パブリックアート、建物の入口
- 建物、静けさの森（「休憩/トイレ・給水」カテゴリ）

## 地図・一覧の使い方

- カテゴリの「🗺️すべて表示」で、表示対象の施設をカテゴリ横断で探せます。アイコンの表示にはズーム条件があります。
- 施設一覧では、名前やキーワードで検索し、訪問済み・お気に入りを記録できます。「最近見た」から詳細を開き直せます。
- 一覧・詳細パネルは、最小化・最大化や境界のドラッグでサイズを変更できます。
- 地図下の写真は横にスクロールできます。写真が表示されてスクロール可能になったときに案内を表示し、最大40枚を並べます。
- データ公開ページにも施設検索があり、「地図で見る」から「すべて表示」を選択した地図を開きます。

## 公開データ

最新の公開版は **2026-10-12**、タグを持つ地物は **3,450件**です。GeoJSON・CSV・Overpass JSON形式と、ファイルサイズ・SHA-256を記録したメタデータを提供しています。

- [データの説明・検索・設備の地図例](https://k-sakanoshita.github.io/expo2025-maniacs/data.html)
- [公開版ファイル](data/releases/2026-10-12/)
- [公開版メタデータ](data/releases/2026-10-12/metadata.json)
- [Wikipedia掲載写真から補完したCommonsタグ10件](docs/wikimedia-commons-wikipedia-2026-10-12.md)

基となるOSMデータは2025年10月末時点のものです。その後、Wikipedia・Wikimedia Commonsの写真タグなどを補完しています。写真の実ファイルは配布に含みません。

元データは `data/expo2025.json`、地図が読み込む軽量版は `data/expo2025.min.json` です。公開版を作成するときは両者の内容を揃え、既存の公開版を上書きせず、新しい版名を指定します。

```bash
node scripts/export-public-data.cjs data/expo2025.min.json data/releases/YYYY-MM-DD YYYY-MM-DD
```

エクスポート後、`data.html`・`data-page.js`・`examples/expo-facilities.js` の取得先と、関連テストの参照先を新しい公開版に更新してください。

## 使用技術
- **背景地図**: [Japan PMTiles](https://armd-01.sakura.ne.jp/tiles/) の2025年10月13日版
- **施設データ**: [Overpass API](https://overpass-turbo.eu/)で取得したOpenStreetMapデータを静的ファイルとして使用
- **地図描画**: [コミュニティマップメーカー](https://github.com/K-Sakanoshita/community_mapmaker) をベースにカスタマイズ
- **写真表示**: [Wikimedia Commons](https://commons.wikimedia.org/)

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
- 2026/10/09 ベースシステムを更新し、施設一覧・検索・詳細画面の操作性を改善
             パビリオンの写真・公式サイト情報を充実させ、世界地図や国旗の表示を改善
- 2026/10/10 自動販売機・水飲み場・ベンチ・遊具などの3D表示と遊具データを追加
             地図の色合いと写真の読み込み表示を調整し、スマホで詳細画面を広げた際の世界地図の余白を修正
- 2026/10/11 水域・森林208件を追加し、会場・施設オープンデータを更新
- 2026/10/12 Commons写真タグ10件を補完し、静けさの森を休憩カテゴリに追加
             「すべて表示」とデータ検索からの地図連携を追加。一覧の配置・余白・角丸を調整
             写真のスクロール案内・表示サイズ・読み込みを改善し、表示上限を40枚へ拡張
             パネルのサイズ変更中の地図表示を改善。データ公開ページの地図例をページ内に統合し、CSSを整理
             ブラウザの言語に合わせてメニュー・カテゴリ・英語名のある施設を表示。施設の英語名とCommons写真を追加
             EXPOアリーナ「Matsuri」を統合し、名前付きの池を施設カテゴリで表示。建物より施設用途のアイコンを優先
             ころころひろばを茶色の網目のトランポリンへ変更。メニューボタンのCSSを共通化し、スマホのドラッグハンドルもこみゃく柄に統一
             地図切り替えの案内を一行表示に調整。公開データを最新の追加情報で再生成

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
