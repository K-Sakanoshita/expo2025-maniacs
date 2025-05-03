# Expo 2025 Maniacs Map

**非公式ファンによる、万博2025のマニアックWebマップです。**

このプロジェクトでは、OSMFJ（OpenStreetMap Foundation Japan）提供のタイルサーバーを背景地図に使用し、  
POI（Point of Interest）情報をOverpass APIから取得・表示します。

## 主な表示対象

- パビリオン、ホール
- 店舗（飲食店、売店、コンビニ）
- 各エリアのゾーン（色分け）
- フェンスによる移動可否（ゲートを可視化）
- ゴミ箱、AED、水飲み場、飲料自動販売機
- 案内板、パブリックアート、建物の入口

## 使用技術

- **タイルサーバー**: [OSMFJ提供タイル](https://wiki.openstreetmap.org/wiki/Japan/OSMFJ_Tileserver)
- **POI取得**: [Overpass API](https://overpass-turbo.eu/)
- **地図描画**: [コミュニティマップメーカー](https://github.com/gsi-cyberjapan/CommunityMapMaker) をベースにカスタマイズ

## ライセンス

このプロジェクトのソースコードは [MITライセンス](LICENSE) のもとで提供されます。  
ただし、背景地図および取得するデータ（OSMデータ）はそれぞれのライセンスに従います。

- OpenStreetMapデータ: [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/)
- OSMFJタイルサーバー利用規約に準拠

## 注意事項

- このサイトは万博公式とは一切関係ありません。
- 表示するデータはリアルタイムの状況を反映するものではない場合があります。

## 更新履歴
- 2025/04/30 仮公開
- 2025/05/04 公開
