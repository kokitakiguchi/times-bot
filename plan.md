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
  - ストア層を分けて、`users` と `messages` の upsert/update をトランザクションで処理する
  - 主要参照用の index を追加する
  - DB ファイル親ディレクトリがなければ起動時に作成する

- Docker / devcontainer / ドキュメント
  - `better-sqlite3` 用に Dockerfile の依存インストール手順を見直し、ネイティブ依存で失敗しない構成にする
  - Compose では `TIMES_DB_PATH` が永続化されるよう volume 前提を README に明記する
  - `env.example` と `routes.example.yaml` を新構成に更新する
  - README に以下を追記する
  - 自動登録フロー
  - category 権限要件 (`Manage Channels`, `View Channels`, `Send Messages`, `Attach Files`)
  - SQLite ファイルの場所
  - forum/media 親チャンネル非対応
  - username 変更時にチャンネル名は固定であること

## Public Interfaces / Schema

- `.env`
  - 必須追加: `TIMES_CATEGORY_ID`
  - 追加: `TIMES_DB_PATH` 既定値 `data/times.sqlite`

- `routes.yaml`
  - 必須: `sourceChannelId`
  - 廃止: `routes[].destinationChannelId`, `routes[].userId`, `routes[].enabled`

- SQLite テーブル
  - `users`
    - `user_id TEXT PRIMARY KEY`
    - `guild_id TEXT NOT NULL`
    - `username TEXT NOT NULL`
    - `display_name TEXT`
    - `destination_channel_id TEXT NOT NULL UNIQUE`
    - `destination_channel_name TEXT NOT NULL`
    - `is_active INTEGER NOT NULL DEFAULT 1`
    - `first_seen_at TEXT NOT NULL`
    - `last_seen_at TEXT NOT NULL`
    - `created_at TEXT NOT NULL`
    - `updated_at TEXT NOT NULL`
  - `messages`
    - `source_message_id TEXT PRIMARY KEY`
    - `user_id TEXT NOT NULL`
    - `guild_id TEXT NOT NULL`
    - `source_channel_id TEXT NOT NULL`
    - `destination_channel_id TEXT NOT NULL`
    - `forwarded_message_id TEXT NOT NULL`
    - `content TEXT NOT NULL`
    - `has_attachments INTEGER NOT NULL DEFAULT 0`
    - `source_created_at TEXT NOT NULL`
    - `source_edited_at TEXT`
    - `source_deleted_at TEXT`
    - `record_created_at TEXT NOT NULL`
    - `record_updated_at TEXT NOT NULL`

- 今回の要件に対して追加で必要な項目
  - `user_id`: username は変わるため、安定キーとして必須
  - `source_message_id`: 編集・削除追跡に必須
  - `forwarded_message_id`: 実際にどの転送メッセージを作ったか追跡するために必要
  - `has_attachments`: 本文のみ保存でも、履歴が不完全であることを判別するために必要
  - `first_seen_at` / `last_seen_at` / `source_edited_at` / `source_deleted_at`: 運用時系列を失わないために必要
  - `is_active`: 将来、特定ユーザーだけ停止したくなった時の逃げ道として必要

## Test Plan

- 設定・バリデーション
  - `TIMES_CATEGORY_ID` 未設定で失敗する
  - `TIMES_CATEGORY_ID` がカテゴリでない場合に失敗する
  - `DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=false` で失敗する
  - forum/media 親チャンネルを `sourceChannelId` にすると失敗する

- ユーザー登録とチャンネル作成
  - 未登録ユーザーの初回投稿で `users` 行と転送先チャンネルが作成される
  - 2 回目以降は既存チャンネルを再利用する
  - username sanitize と衝突フォールバックが正しく動く
  - username 変更後も既存チャンネル名は変わらず、DB の username/displayName は更新される

- メッセージ保存
  - `MessageCreate` で `messages` 行が作成される
  - `MessageUpdate` で同じ行の `content` と `source_edited_at` が更新される
  - `MessageDelete` で `source_deleted_at` が入る
  - 添付付き投稿は `has_attachments=1` になるが、本文のみ保存される
  - 編集・削除があっても転送先 Discord メッセージは更新されない

- 既存転送動作
  - source channel 以外は無視される
  - bot / webhook 投稿は無視される
  - `pnpm test`
  - `pnpm build`

- 実装完了時の Git 手順
  - 作業ブランチは `feature/sqlite-times-history`
  - 実装後に `pnpm test` と `pnpm build` を実行
  - 成功後に 1 コミットでまとめる

## Assumptions

- 対象ユーザーは `sourceChannelId` に投稿した全ユーザーを自動登録する
- 単一 guild / 単一 source channel 前提は維持する
- 添付の中身や URL は DB に保存しない
- 転送先メッセージの編集・削除同期は行わない
- 既存の `routes[].destinationChannelId` ベース設定から SQLite への自動データ移行は行わない
- SQLite はローカル単一プロセス前提で使い、外部 DB への拡張は今回の範囲外とする
