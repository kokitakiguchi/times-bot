# times-bot

Discord server内の特定チャンネルで、特定ユーザーの投稿だけを別チャンネルへ転送するBotです。

## 必要なもの

実際に動かすには、次の情報を自分で用意する必要があります。

- `DISCORD_TOKEN`
  - Discord Developer Portalで作成したBotのトークン
- `GUILD_ID`
  - Botを動かすDiscordサーバーのID
- `sourceChannelId`
  - 監視元チャンネルのID
- `routes[].userId`
  - 転送対象ユーザーのID
- `routes[].destinationChannelId`
  - そのユーザーの転送先チャンネルID

IDを調べるには、Discordの `詳細設定 > 開発者モード` をONにして、サーバー・チャンネル・ユーザーを右クリックして `IDをコピー` を使います。

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

## 設定ファイル

`.env` を作成します。

```env
DISCORD_TOKEN=your_bot_token_here
GUILD_ID=123456789012345678
DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=true
```

`routes.yaml` を作成します。

```yaml
sourceChannelId: "123456789012345678"
routes:
  - userId: "111111111111111111"
    destinationChannelId: "222222222222222222"
    enabled: true
```

雛形として [env.example](/workspaces/times-bot/env.example) と [routes.example.yaml](/workspaces/times-bot/routes.example.yaml) があります。

## 起動手順

Node.js 22系と `pnpm` を使います。

```bash
pnpm install
pnpm test
pnpm dev
```

本番相当で試すなら次でも動きます。

```bash
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
  - `.env` がないか、値が空です
- `GUILD_ID must be a valid Discord snowflake.`
  - IDの形式が不正です
- `Used disallowed intents`
  - Developer Portalで `Message Content Intent` を有効化するか、ローカル確認だけなら `.env` に `DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=false` を追加してください
- `sourceChannelId ... is not a text-based channel`
  - フォーラムや対象外チャンネルを指定している可能性があります
- `destinationChannelId ... is not a sendable text channel`
  - 転送先が送信可能なテキストチャンネルではないか、Bot権限が不足しています
