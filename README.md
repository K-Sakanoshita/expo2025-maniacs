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
- **地図描画**: [コミュニティマップメーカー](https://github.com/gsi-cyberjapan/CommunityMapMaker) をベースにカスタマイズ
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
             お気に入りのチェックボックスにアイコン表示、メモ欄を長く見直し
             OpenStreetMapデータの更新（店舗やパビリオン写真の追加・見直し）

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
  nwr["amenity"="smoking_area"](area.yume);
  nwr["amenity"="place_of_worship"](area.yume);
  nwr["amenity"="exhibition_centre"](area.yume);
  nwr["amenity"="drinking_water"](area.yume);
  nwr["amenity"="vending_machine"](area.yume);
  nwr["amenity"="post_office"](area.yume);
  nwr["amenity"="ferry_terminal"](34.6570488832774, 135.37857824056903, 34.660596217537034, 135.40079835085356);
  
  nwr["building"]["name"](area.yume);

  nwr["tourism"="information"](area.yume);
  nwr["tourism"="artwork"](area.yume);
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
