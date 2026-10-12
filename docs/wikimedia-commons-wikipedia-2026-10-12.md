# Wikipedia掲載写真からのWikimedia Commonsタグ補完

確認日: 2026-10-12。対象: `data/expo2025.json` と `data/expo2025.min.json`。

施設名・写真キャプションは[大阪・関西万博の施設](https://ja.wikipedia.org/wiki/%E5%A4%A7%E9%98%AA%E3%83%BB%E9%96%A2%E8%A5%BF%E4%B8%87%E5%8D%9A%E3%81%AE%E6%96%BD%E8%A8%AD)で照合し、Commons APIでファイル存在と説明を確認。既存タグは変更せず、未設定の10地物に `wikimedia_commons` を追加。公開用データも2026-10-12版に更新。OSM本体への送信は行っていない。

| 地物 | 施設・建物 | 追加したタグ |
|---|---|---|
| node/12769694181 | ロボット＆モビリティステーション | [File:ロボット＆モビリティーステーションexpo2025.jpg](https://commons.wikimedia.org/wiki/File:%E3%83%AD%E3%83%9C%E3%83%83%E3%83%88%EF%BC%86%E3%83%A2%E3%83%93%E3%83%AA%E3%83%86%E3%82%A3%E3%83%BC%E3%82%B9%E3%83%86%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3expo2025.jpg) |
| node/12790712846 | 国際機関館 | [File:Expo 2025 International Organization Pavilion 01.JPG](https://commons.wikimedia.org/wiki/File:Expo_2025_International_Organization_Pavilion_01.JPG) |
| way/1366032374 | XD HALL | [File:Osaka Expo2025 Osaka Healthcare Pavilion XD HALL.jpg](https://commons.wikimedia.org/wiki/File:Osaka_Expo2025_Osaka_Healthcare_Pavilion_XD_HALL.jpg) |
| way/1366073334 | 静けさの森 | [File:Expo2025静けさの森、中心部の池.jpg](https://commons.wikimedia.org/wiki/File:Expo2025%E9%9D%99%E3%81%91%E3%81%95%E3%81%AE%E6%A3%AE%E3%80%81%E4%B8%AD%E5%BF%83%E9%83%A8%E3%81%AE%E6%B1%A0.jpg) |
| way/1384371897 | ジュニアSDGsキャンプ | [File:Sustainadome 20250830 162141.jpg](https://commons.wikimedia.org/wiki/File:Sustainadome_20250830_162141.jpg) |
| way/1385379785 | 文明の森 | [File:Les civilizaci Expo 2025.jpg](https://commons.wikimedia.org/wiki/File:Les_civilizaci_Expo_2025.jpg) |
| way/1441738955 | 休憩所2 | [File:Expo 2025 Rest Area-2 01.JPG](https://commons.wikimedia.org/wiki/File:Expo_2025_Rest_Area-2_01.JPG) |
| node/12787702955 | OFFICIAL STORE 西ゲート店 JR西日本グループ | [File:大阪・関西万博 EXPO 2025 (54848537525).jpg](https://commons.wikimedia.org/wiki/File:%E5%A4%A7%E9%98%AA%E3%83%BB%E9%96%A2%E8%A5%BF%E4%B8%87%E5%8D%9A_EXPO_2025_(54848537525).jpg) |
| node/12874967016 | Green Park Bus | [File:Hyundai ELEC CITY TOWN Osaka 1.jpg](https://commons.wikimedia.org/wiki/File:Hyundai_ELEC_CITY_TOWN_Osaka_1.jpg) |
| relation/18047883 | 大屋根リング | [File:Expo 2025 Grand Ring20250716b.jpg](https://commons.wikimedia.org/wiki/File:Expo_2025_Grand_Ring20250716b.jpg) |

## 保留・除外

- RX-78F00/E ガンダム: 記事掲載の `File:GUNDAM NEXT FUTURE PAVILION Statue at night.jpg` はCommons APIで存在を確認できなかったため未追加。
- ミャクミャクHOUSE: 掲載写真はベトナム館・ロボット＆モビリティステーションも含むため、従来の保留を継続。
- 案内板、館内マップ、併設ショップ、広場やマーケットプレイスなどは、似た名前の施設全景写真を流用していない。
- 個々のトイレ・給水所・建物に、場所を特定できない一般的な写真を付けていない。

本文・画像は転載せず、出典リンクと確認したファイル名を記録。写真の権利情報は各Commonsページを参照。
