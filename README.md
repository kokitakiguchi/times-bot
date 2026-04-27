# times-bot

Discord server内の特定チャンネルで、特定ユーザーの投稿だけを別チャンネルへ転送するBotです。

## 最短手順

1. `env.example` をコピーして `.env` を作る
2. `routes.example.yaml` をコピーして `routes.yaml` を作る
3. 各IDとトークンを埋める
4. Docker Compose が使える環境で `docker compose up --build` を実行する

```bash
cp env.example .env
cp routes.example.yaml routes.yaml
docker compose up --build
```

Compose は手元の `.env` を `env_file` で読み込み、`routes.yaml` を `/app/routes.yaml` に read-only mount して起動します。秘密情報はイメージに焼き込まれません。

## 設定するもの

実際に動かすには、次の情報を自分で用意します。

- `DISCORD_TOKEN`
  Discord Developer Portalで作成したBotのトークン
- `GUILD_ID`
  Botを動かすDiscordサーバーのID
- `sourceChannelId`
  監視元チャンネルのID
- `routes[].userId`
  転送対象ユーザーのID
- `routes[].destinationChannelId`
  そのユーザーの転送先チャンネルID

IDを調べるには、Discordの `詳細設定 > 開発者モード` をONにして、サーバー・チャンネル・ユーザーを右クリックし `IDをコピー` を使います。

`.env` の例:

```env
DISCORD_TOKEN=your_bot_token_here
GUILD_ID=123456789012345678
DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=true
```

`DISCORD_ENABLE_MESSAGE_CONTENT_INTENT` は通常 `true` のままで構いません。Developer Portal 側で Message Content Intent を有効化できない暫定確認だけ `false` を使います。その場合は本文転送が制限される可能性があります。

`routes.yaml` の例:

```yaml
sourceChannelId: "123456789012345678"
routes:
  - userId: "111111111111111111"
    destinationChannelId: "222222222222222222"
    enabled: true
```

雛形として [env.example](/workspaces/times-bot/env.example) と [routes.example.yaml](/workspaces/times-bot/routes.example.yaml) があります。

## Dockerで実行する

正規の実行導線は `docker compose up --build` です。Docker Engine と Compose v2 が使える環境で実行してください。

```bash
docker compose up --build
```

よく使うコマンド:

```bash
docker compose logs -f
docker compose restart
docker compose down
```

初回起動時はイメージのビルドが走ります。正常に起動するとログに `bot_ready` が出ます。

## Discord側の設定

Botを作成したら、少なくとも次を確認してください。

- Developer Portalの `Bot` 設定で `Message Content Intent` を有効化する
- Botを対象サーバーに招待する
- 監視元チャンネルでBotがメッセージを読めるようにする
- 転送先チャンネルでBotが送信できるようにする
- 添付ファイルも転送したい場合は、転送先で `Attach Files` 権限も付与する

このBotはコード上で次のIntentを使っています。

- `Guilds`
- `GuildMessages`
- `MessageContent`

## devcontainerとローカル実行

`.devcontainer/` は開発作業用です。実行だけなら Compose を使い、コード修正やテストをしたいときだけ devcontainer やローカル Node.js 環境を使います。Compose 実行は Docker が使えるホスト環境を前提にしています。

ローカルで直接動かす場合は Node.js 22系と `pnpm` を使います。

```bash
pnpm install
pnpm test
pnpm build
pnpm start
```

## 動作確認のポイント

- `sourceChannelId` のチャンネルで、`routes` に登録したユーザー本人が投稿する
- BotやWebhookの投稿は転送されない
- メンションは転送時に除去される
- 本文が空でも添付ファイルがあれば転送される
- `enabled: false` のルートは転送されない
- `DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=false` の場合、Botは起動できるが本文の転送は制限される可能性がある

## よくある詰まりどころ

- `DISCORD_TOKEN is required.`
  `.env` がないか、値が空です
- `GUILD_ID must be a valid Discord snowflake.`
  IDの形式が不正です
- `Used disallowed intents`
  Developer Portalで `Message Content Intent` を有効化するか、暫定確認だけなら `.env` に `DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=false` を設定してください
- `Unknown Guild`
  `GUILD_ID` が違うか、Botがそのサーバーに招待されていません
- `sourceChannelId ... is not a text-based channel`
  フォーラムや対象外チャンネルを指定している可能性があります
- `destinationChannelId ... is not a sendable text channel`
  転送先が送信可能なテキストチャンネルではないか、Bot権限が不足しています
