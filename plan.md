# SQLite ベースの times 自動作成とメッセージ保存

## Summary

`routes.yaml` のユーザー別転送設定をやめ、`sourceChannelId` に投稿したユーザーを自動登録して、`TIMES_CATEGORY_ID` 配下に `times-<username>` チャンネルを自動作成する構成へ移行する。  
永続化は `better-sqlite3` を採用し、`作成したチャンネルID`、`username/displayName`、`メッセージ内容` を保存する。メッセージは全件保持するが、各メッセージの編集履歴は別バージョン化せず、同じ行を更新して `edited/deleted` 状態を持つ。編集・削除は SQLite にだけ反映し、転送先 Discord メッセージは更新しない。

レビュー指摘の不具合も同時に修正し、`sourceChannelId` に forum/media の親チャンネルを指定した場合は起動時に失敗させる。

## Implementation Changes

- 設定と起動時バリデーション
  - `.env` に `TIMES_CATEGORY_ID` を必須追加する
  - `.env` に `TIMES_DB_PATH` を追加し、既定値は `data/times.sqlite` にする
  - `routes.yaml` は `sourceChannelId` のみ必須とし、既存の `routes[]` 前提を廃止する
  - `TIMES_CATEGORY_ID` は guild 内のカテゴリチャンネルであることを起動時に検証する
  - `DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=false` の場合は、今回の SQLite メッセージ保存要件と矛盾するため起動エラーにする
  - `sourceChannelId` は text channel/thread のみ許可し、forum/media の親チャンネルは明示的に拒否する

- ユーザー登録と times チャンネル作成
  - `MessageCreate` で対象 source channel に投稿したユーザーを自動登録する
  - ユーザー未登録時は `users` テーブルに upsert し、同時に `TIMES_CATEGORY_ID` 配下へ転送先 text channel を自動作成する
  - チャンネル名は `times-<sanitized username>` を基本とし、sanitize 後に空になる場合や衝突する場合は `times-<username>-<userId末尾6桁>` にフォールバックする
  - 作成済みチャンネル名は固定し、username 変更時も rename しない
  - 以後の投稿で `username` と `displayName` のスナップショットは更新する

- 転送とメッセージ保存
  - `MessageCreate` 時は従来どおり転送し、その結果を SQLite に保存する
  - `MessageUpdate` 時は対象メッセージ行の `content` と `source_edited_at` を更新する
  - `MessageDelete` 時は対象メッセージ行に `source_deleted_at` を記録し、削除済みフラグを立てる
  - 編集・削除イベントでは Discord 上の転送先メッセージは変更しない
  - 添付ファイルは転送は継続するが、SQLite には本文のみ保存する
  - ただし DB 上で本文だけでは不完全になるため、`has_attachments` は保持して「添付ありの投稿だった」ことだけ分かるようにする

- SQLite ストア
  - `better-sqlite3` を導入し、起動時にテーブル作成と軽い migration を実行する
  - ストア層を分けて�