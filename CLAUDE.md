# CLAUDE.md

このリポジトリで Claude Code が作業する際の前提と作法をまとめたメモ。人間向けの全体像は [README.md](README.md)、開発フローは [DEVELOPMENT.md](DEVELOPMENT.md)、機能アイディアは [IDEAS.md](IDEAS.md) を参照。

## プロジェクト概要

Discord Bot。特定チャンネルへの投稿を検知して、ユーザーごとに `times-<username>` チャンネルを自動作成し、メッセージを転送・SQLite に永続化する。Node 22 + TypeScript + discord.js v14 + better-sqlite3。

## ディレクトリと主要ファイル

- [src/index.ts](src/index.ts): エントリポイント、Client 初期化とイベント登録
- [src/bot.ts](src/bot.ts): ランタイム解決、メッセージハンドリング、チャンネル作成、集約転送
- [src/forwarding.ts](src/forwarding.ts): 転送判定とサニタイズの純粋ロジック（テスト対象）
- [src/config.ts](src/config.ts): `.env` + `routes.yaml` の読み込みとバリデーション
- [src/db.ts](src/db.ts): SQLite (better-sqlite3) スキーマと CRUD
- [src/types.ts](src/types.ts): 共通型
- [src/logger.ts](src/logger.ts): pino logger
- [test/forwarding.test.ts](test/forwarding.test.ts), [test/config.test.ts](test/config.test.ts): vitest 単体テスト
- [Dockerfile](Dockerfile) / [compose.yaml](compose.yaml): 実行環境
- [.github/workflows/ci.yml](.github/workflows/ci.yml): CI

## コマンド

```bash
pnpm install --frozen-lockfile   # 依存セットアップ
pnpm dev                          # tsx watch でホットリロード
pnpm test                         # vitest run
pnpm typecheck                    # tsc --noEmit
pnpm build                        # dist/ に出力
pnpm start                        # dist/index.js を実行
docker compose up --build         # 本番相当で起動
```

## 設計上の重要ポイント

- **転送判定は純粋関数に閉じる**: `decideForward` は副作用を持たない。Discord API を叩く処理は [src/bot.ts](src/bot.ts) 側に分離。テストは純粋関数側で書く
- **DB 操作は store 経由**: 直接 SQL を書かず [src/db.ts](src/db.ts) の関数を呼ぶ
- **ログは構造化**: `logger.info({ event: "...", ... })` の形式。`event` 名は既存のもの (`message_forwarded` `channel_created` `user_registered` `aggregate_forwarded` `message_skipped` `*_failed`) と一貫させる
- **`allowedMentions: { parse: [] }` を必ず付ける**: 転送時のメンション暴発を防ぐ。新規送信ロジックを足す時も同様
- **添付ファイルは URL 経由で再添付**: ダウンロード→再アップロードではなく `attachment: url` を渡す
- **ユーザー名サニタイズ**: チャンネル名は英数字とハイフンのみ、`times-` プレフィックス必須。既存の `sanitizeUsername` を使う
- **role mapping の優先順位**: `routes.yaml` の `roleCategoryMappings` は上から順に一致判定。仕様変更時は README とテストを揃える

## 作業の進め方

- ブランチ戦略は [DEVELOPMENT.md](DEVELOPMENT.md) 参照。`main` 直 push 禁止、`develop` 経由
- バージョニングは SemVer。設定スキーマや DB 互換性に影響する変更は MAJOR 候補
- 変更前にテストが通ることを確認 (`pnpm test`)、変更後も同様
- 設定スキーマを変えた場合は `env.example` / `routes.example.yaml` / [README.md](README.md) を必ず同時更新
- DB スキーマを変える時はマイグレーション戦略を PR 本文に書く
- 新しい権限が必要な機能を足したら [README.md](README.md) の権限セクションを更新

## やってはいけないこと

- `.env` / `routes.yaml` / `data/` をコミットしない（`.gitignore` 済み）
- `node_modules` や `dist` をコミットしない
- `git push --force` を main / develop に行わない
- `git commit --amend` で既に push 済みのコミットを書き換えない
- discord.js の rate limit を無視した一括処理を書かない（特にチャンネル作成や bulk fetch）
- `better-sqlite3` を直接 require/import するのではなく [src/db.ts](src/db.ts) の抽象越しに使う

## よく使う調査クエリ

- イベントログの一覧: `grep -rn 'event: "' src/`
- DB スキーマ確認: [src/db.ts](src/db.ts) の `CREATE TABLE` 周辺
- 環境変数のバリデーション: [src/config.ts](src/config.ts)

## 既知の落とし穴

- ローカル Node が 22 以外だと `better-sqlite3` のネイティブビルドで詰まる。`pnpm rebuild better-sqlite3` で再構築
- Docker で起動した SQLite と pnpm で起動した SQLite はネイティブバイナリが別。compose で起動した後にローカル pnpm を使うとバインディングエラーになりがち
- `DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=false` は起動エラーになる仕様（永続化要件のため）
