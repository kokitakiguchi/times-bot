# times-bot

Discord server 内の特定チャンネルに投稿したユーザーのメッセージを自動的に個人用の `times-<username>` チャンネルに転送し、SQLite で永続化する Bot です。

## 特徴

- **自動ユーザー登録**: `sourceChannelId` に投稿したユーザーは自動的に登録されます
- **自動チャンネル作成**: ユーザー初回投稿時に `times-<username>` という専用チャンネルが自動作成されます
- **メッセージ永続化**: すべてのメッセージを SQLite に保存し、編集・削除の履歴も記録します
- **ユーザー情報スナップショット**: username や displayName の変更を追跡しつつ、チャンネル名は固定に保ちます
- **タイムライン集約**: 各 times チャンネルへの投稿を1つの集約チャンネルにまとめて表示します（オプション）
- **ロールベースカテゴリ振り分け**: ユーザーの Discord ロールに応じて、チャンネルを配置するカテゴリを動的に切り替えられます（オプション）

## 最短手順

1. `env.example` をコピーして `.env` を作る
2. `routes.example.yaml` をコピーして `routes.yaml` を作る
3. 各ID、トークン、カテゴリを埋める
4. Docker Compose が使える環境で `docker compose up --build` を実行する

```bash
cp env.example .env
cp routes.example.yaml routes.yaml
docker compose up --build
```

Compose は手元の `.env` を `env_file` で読み込み、`routes.yaml` を `/app/routes.yaml` に read-only mount して起動します。SQLite ファイル（デフォルト `data/times.sqlite`）は volume を通じて永続化されます。秘密情報はイメージに焼き込まれません。

## 設定するもの

実際に動かすには、次の情報を自分で用意します。

### 必須環境変数 (`.env`)

- `DISCORD_TOKEN`
  - Discord Developer Portal で作成した Bot のトークン
- `GUILD_ID`
  - Bot を動かす Discord サーバーのID
- `TIMES_CATEGORY_ID`
  - 自動作成される `times-<username>` チャンネルを配置するカテゴリID
  - カテゴリに対して以下の権限が必要です
    - Manage Channels (チャンネル作成)
    - View Channels (チャンネル閲覧)
    - Send Messages (メッセージ送信)
    - Attach Files (ファイル添付)

### オプション環境変数

- `DISCORD_ENABLE_MESSAGE_CONTENT_INTENT` (デフォルト: `true`)
  - メッセージ本文を転送するかどうか
  - SQLite による永続化を行う都合上、`true` が必須です
  - `false` を設定すると起動エラーになります
- `TIMES_DB_PATH` (デフォルト: `data/times.sqlite`)
  - SQLite ファイルの保存先パス
- `TIMES_AGGREGATE_CHANNEL_ID` (省略可)
  - 全 times チャンネルの投稿を集約して表示するチャンネルのID
  - 設定すると、各 `times-<username>` チャンネルへの投稿が Embed 形式でこのチャンネルにも転送されます
  - Embed にはアバター・表示名・投稿元チャンネルへのリンク・タイムスタンプが含まれます
  - 未設定の場合、集約機能は無効になります

### routes.yaml

- `sourceChannelId`: 監視対象チャンネルの ID
  - テキストチャンネルまたはスレッドのみ対応
  - forum/media 親チャンネルは非対応です（起動時にエラーになります）
- `roleCategoryMappings` (省略可): ロール別のカテゴリ振り分け設定
  - `roleId`: 振り分けに使う Discord ロールの ID
  - `categoryId`: 振り分け先カテゴリの ID
  - リスト上位のエントリが優先されます（ユーザーが複数の対象ロールを持つ場合、最初に一致したエントリが使われます）
  - 一致するロールがない場合は `TIMES_CATEGORY_ID` にフォールバックします
  - 省略した場合はすべてのユーザーが `TIMES_CATEGORY_ID` に配置されます（従来どおり）

IDを調べるには、Discord の `詳細設定 > 開発者モード` をONにして、サーバー・チャンネル・ユーザーを右クリックし `IDをコピー` を使います。

`.env` の例:

```env
DISCORD_TOKEN=your_bot_token_here
GUILD_ID=123456789012345678
TIMES_CATEGORY_ID=987654321098765432
DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=true
TIMES_DB_PATH=data/times.sqlite
# 集約チャンネルを使う場合のみ設定
TIMES_AGGREGATE_CHANNEL_ID=111222333444555666
```

`routes.yaml` の例（ロール振り分けなし）:

```yaml
sourceChannelId: "123456789012345678"
```

`routes.yaml` の例（ロール振り分けあり）:

```yaml
sourceChannelId: "123456789012345678"
roleCategoryMappings:
  - roleId: "111111111111111111"   # Engineer ロール
    categoryId: "222222222222222222"  # Engineering カテゴリ
  - roleId: "333333333333333333"   # Designer ロール
    categoryId: "444444444444444444"  # Design カテゴリ
```

雛形として [env.example](env.example) と [routes.example.yaml](routes.example.yaml) があります。

## 自動登録フロー

1. ユーザーが `sourceChannelId` のチャンネルにメッセージを投稿します
2. Bot は投稿を検出し、DB にユーザー情報を記録します
3. ユーザーのロールと `roleCategoryMappings` を照合してカテゴリを決定します（一致するロールがない場合は `TIMES_CATEGORY_ID` を使用）。決定したカテゴリ配下に `times-<sanitized_username>` という新しいテキストチャンネルを作成します
4. 元のメッセージを転送先チャンネルに送信し、DB に記録します
5. 以降、同じユーザーの投稿はすべて同じ転送先チャンネルに送信されます

## ロールベースのカテゴリ振り分け

`routes.yaml` に `roleCategoryMappings` を設定すると、ユーザーが持つ Discord ロールに応じて `times-<username>` チャンネルの配置先カテゴリを自動的に振り分けられます。

### カテゴリ決定ロジック

1. ユーザーの初回投稿時に、Bot がそのメンバーのロール一覧を取得します
2. `roleCategoryMappings` のエントリを**上から順に**照合します
3. 最初に一致したエントリの `categoryId` を振り分け先カテゴリとして使います
4. どのロールも一致しない場合は `TIMES_CATEGORY_ID` にフォールバックします

### 複数ロールを持つユーザーの扱い

ユーザーが `roleCategoryMappings` に登録された複数のロールを同時に持っている場合、**リスト上位のエントリが優先**されます。エントリの並び順で振り分け先を制御できます。

```yaml
roleCategoryMappings:
  - roleId: "111111111111111111"   # このロールが最優先
    categoryId: "222222222222222222"
  - roleId: "333333333333333333"   # 上記ロールを持たない場合に適用
    categoryId: "444444444444444444"
```

### 設定しない場合の動作

`roleCategoryMappings` を省略した場合、すべてのユーザーのチャンネルが `TIMES_CATEGORY_ID` に配置されます。既存の設定に変更は不要です。

### 必要な権限

`roleCategoryMappings` を使う場合、`TIMES_CATEGORY_ID` に加えて**振り分け先カテゴリすべてに**以下の権限を付与してください。

- Manage Channels: チャンネル作成に必須
- View Channels: チャンネル閲覧に必須
- Send Messages: メッセージ送信に必須
- Attach Files: ファイル転送が必要な場合に必須

## メッセージ履歴の管理

- **作成**: メッセージが投稿されるたびに DB に記録されます
- **編集**: Source channel でメッセージが編集されると、DB の `source_edited_at` と `content` が更新されます（転送先メッセージは更新されません）
- **削除**: Source channel でメッセージが削除されると、DB に `source_deleted_at` が記録されます（転送先メッセージは削除されません）

添付ファイルは転送時に Discord CDN からダウンロードされて転送先に添付されますが、DB には本文のみ保存されます。`has_attachments` フラグで「このメッセージには添付があった」ことを追跡できます。

## ユーザーとチャンネル名について

- ユーザー初回投稿時に `times-<sanitized_username>` という形式でチャンネルが作成されます
- Username に特殊文字が含まれる場合は、英数字とハイフンのみの形式に sanitize されます
- Sanitize 後に空になるか、既に同じ名前のチャンネルが存在する場合は `times-<username>-<userId末尾6桁>` にフォールバックします
- ユーザーが Discord 上で username を変更しても、**チャンネル名は変わりません** （既に作成されたチャンネルを rename しないため）
- DB 上の username と displayName は最新の値に更新されます

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
- Botを対象サーバーに招待する（権限には `Manage Channels`, `View Channels`, `Send Messages`, `Attach Files` を含める）
- 監視元チャンネル（`sourceChannelId`）でBotがメッセージを読めるようにする
- TIMES_CATEGORY_ID カテゴリで以下の権限を付与する
  - Manage Channels: 自動チャンネル作成に必須
  - View Channels: チャンネル閲覧に必須
  - Send Messages: メッセージ送信に必須
  - Attach Files: ファイル転送が必要な場合に必須
- Bot のロールがカテゴリの権限設定より上位にあることを確認（ロールの順序が重要）
- `roleCategoryMappings` を使う場合は、`TIMES_CATEGORY_ID` に加えて振り分け先カテゴリすべてに上記と同じ権限を付与する

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

- `sourceChannelId` のチャンネルにメッセージを投稿すると、未登録ユーザーは自動登録される
- BotやWebhookの投稿は転送されない
- メンションは転送時に除去される
- 本文が空でも添付ファイルがあれば転送される
- `DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=false` の場合、Botは起動エラーになる
- `TIMES_AGGREGATE_CHANNEL_ID` を設定した場合、各 times チャンネルへの投稿が集約チャンネルに Embed で表示される
  - Embed 内のチャンネルリンクをクリックすると投稿元チャンネルに飛べる
  - ユーザーごとに異なる色で表示される
- `roleCategoryMappings` を設定した場合
  - 対象ロールを持つユーザーの初回投稿で、対応カテゴリにチャンネルが作成される
  - どのロールも持たないユーザーは `TIMES_CATEGORY_ID` にフォールバックされる
  - ロールを複数持つ場合はリスト上位のエントリが優先される

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
- `Could not locate the bindings file.`
  `better-sqlite3` のネイティブバインディングが見つかりません。以下を確認してください
  - Docker イメージを再ビルドしてください: `docker compose down && docker compose up --build`
  - ホスト環境の Node.js バージョンと Docker の Node.js バージョン（22.x）が一致しているか確認してください
  - ローカルで実行する場合は、`pnpm rebuild` を実行してネイティブモジュールを再構築してください
  - `pnpm install` 直後に `pnpm build` を実行してください
- チャンネルが作成されない
  `times-<username>` チャンネルが自動作成されない場合、ログを確認してください
  - `event: "channel_creation_starting"` ログで、channel name と category ID が正しいか確認
  - `event: "channel_created"` ログがない場合は、以下の権限を確認してください：
    - Bot に対して: `Manage Channels`, `View Channels` 権限
    - TIMES_CATEGORY_ID カテゴリに対して: 上記と同じ権限、さらに `Send Messages` 権限
  - Bot のロール が category の権限より上にあるか確認してください
  - `event: "user_registration_failed"` ログに詳細なエラーが出ている場合、その内容を確認
- `roleCategoryMappings` を設定したのにデフォルトカテゴリに作成される
  - `roleId` が正しいか確認してください（開発者モードでロールを右クリック → ID をコピー）
  - ユーザーが該当ロールを実際に持っているか確認してください
  - リスト上位のエントリが先に一致していないか確認してください
- ロール振り分け先カテゴリにチャンネルが作成されない
  - 振り分け先カテゴリに `Manage Channels`, `View Channels`, `Send Messages` 権限が付与されているか確認してください
  - `categoryId` が有効なカテゴリチャンネルのIDか確認してください
