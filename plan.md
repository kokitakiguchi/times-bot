# Discordユーザー別転送Botの技術選定

## Summary
- **採用技術**: **Node.js 22 LTS + TypeScript + `discord.js` v14**
- **運用形態**: **常時起動のコンテナ**（Railway / Render / Fly.io / 自前VPSのいずれでも載せられる Docker 前提）
- **設定方式**: **設定ファイル管理**。v1 は DB を入れず、**`.env` + `routes.yaml`** で完結させる
- **選定理由**: この要件は Discord Gateway の常時接続が前提で、`discord.js` は Discord Bot 向けの情報量・保守性・API追従が強い。Go / Rust でも実装は可能だが、v1 の立ち上がり速度と保守のしやすさでは TypeScript が最も堅い

## Key Changes / Interfaces
- **ランタイム/ツール**
  - Node.js 22 系
  - TypeScript
  - パッケージ管理は `pnpm`
  - 開発実行は `tsx`
  - テストは `vitest`
  - ログは `pino`
  - 環境変数読み込みは `dotenv`
- **Discord ライブラリ**
  - `discord.js` を使って Gateway 接続とメッセージ送信を管理
  - 必要 Intent は `Guilds`, `GuildMessages`, `MessageContent`
- **設定インターフェース**
  - `.env`
    - `DISCORD_TOKEN`
    - `GUILD_ID`（v1 は単一サーバー前提なので固定）
  - `routes.yaml`
    - `sourceChannelId`
    - `routes[]`
      - `userId`
      - `destinationChannelId`
      - `enabled`
- **転送仕様**
  - 監視対象は **1つの送信元チャンネル**
  - そのチャンネルに投稿されたメッセージを、**投稿者ユーザーIDで判定して個別の転送先チャンネルへ送る**
  - v1 では **本文 + 添付ファイル** を転送対象にする
  - **bot / webhook の投稿は無視**して転送ループを防ぐ
  - 転送時の `allowed_mentions` は絞って、不要なメンション拡散を防ぐ
- **非採用**
  - Python は使わない
  - v1 では DB / Prisma / 管理用 Slash Command は入れない
  - Serverless は採らない。Discord Bot は Gateway の持続接続前提なので、常駐プロセスのほうが素直

## Test Plan
- 監視対象チャンネルの投稿が、対応する転送先に届く
- 対応表にないユーザーの投稿は転送されない
- `enabled: false` のユーザーは転送されない
- bot / webhook メッセージが無視される
- 添付ファイル付きメッセージが転送される
- メンションが意図せず再通知されない
- 再起動後に設定ファイルを正しく読み込める

## Assumptions
- v1 は **単一 Guild / 単一 source channel**
- 転送先は **ユーザーごとに 1 チャンネル**
- 設定変更は **ファイル編集 + Bot 再起動** で反映
- 将来、運用者が Discord 上で設定を変えたくなったら、次段階で **Slash Command + DB** に拡張する

## References
- [`discord.js` docs](https://discord.js.org/docs)  
- [Discord Gateway official docs](https://docs.discord.com/developers/events/gateway)  
- [Discord Message Content intent](https://docs.discord.com/developers/events/gateway#message-content-intent)  
- [Node.js release policy](https://nodejs.org/en/about/releases/)  
