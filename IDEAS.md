# 機能アイディア集

times-bot に追加すると面白そう・実用的な機能をまとめたメモです。優先度や難易度の目安付き。

---

## 🪵 ロギング・運用

### 構造化ログの永続化
- 現状 `pino` でログ出力しているが、コンテナ再起動で消える
- ファイル出力 (`pino/file`) + ローテーション (`logrotate` or `pino-roll`) で永続化
- もしくは Loki / CloudWatch Logs / BetterStack へ送信
- 難易度: 低 / 効果: 中

### メトリクス収集
- Prometheus 形式の `/metrics` エンドポイントを生やす
- 送信メッセージ数、チャンネル作成数、エラー数、レイテンシなど
- Grafana ダッシュボードのテンプレも同梱
- 難易度: 中 / 効果: 中

### ヘルスチェックエンドポイント
- `/healthz` `/readyz` を expose (Discord Gateway 接続状態を反映)
- compose / k8s の liveness/readiness probe で利用
- 難易度: 低

### Sentry 等への例外送信
- `message_forward_failed` などの error ログを Sentry に飛ばす
- スタックトレース + 文脈 (userId, channelId) を添える
- 難易度: 低

---

## 🚀 CI/CD

### GitHub Actions: テスト & 型チェック
- push / PR で `pnpm install && pnpm test && pnpm build` を実行
- Node 22 マトリクス、キャッシュ有効化
- 難易度: 低 / 効果: 高

### GitHub Actions: Docker イメージビルド & push
- main へのマージで GHCR にイメージを push (`ghcr.io/<owner>/times-bot:latest` + SHA タグ)
- マルチアーキ (amd64/arm64) ビルド
- 難易度: 低〜中

### Renovate / Dependabot
- 依存ライブラリ自動更新 PR
- discord.js のバージョンアップに追従しやすくなる
- 難易度: 低

### リリース自動化
- `changesets` か `release-please` でバージョニング + CHANGELOG 生成
- タグ push で GitHub Release 作成
- 難易度: 中

### Lint / Format CI
- `biome` か `eslint + prettier` を導入して PR で自動チェック
- 難易度: 低

---

## 🏗 IaC 化

### Terraform / Pulumi で Discord サーバー側構成を管理
- カテゴリ、ロール、`roleCategoryMappings` を IaC で記述
- `discord` Terraform Provider あり (Lucky3028/discord 等)
- 難易度: 中

### ホスティング環境の IaC
- Fly.io / Railway / Cloud Run / ECS など、デプロイ先を IaC 化
- 例: Fly.io なら `fly.toml`、AWS なら CDK / Terraform
- SQLite ボリュームの永続化も含めて宣言的に
- 難易度: 中〜高

### Ansible / Nix で VPS デプロイ自動化
- セルフホスト派向け
- 難易度: 中

---

## 💬 Discord 機能拡張

### リアクション(スタンプ)同期
- 元メッセージにリアクションが付いたら、転送先メッセージにも同じリアクションを付ける（逆方向も可）
- `MessageReactionAdd` / `Remove` イベントをハンドル
- カスタム絵文字は同じサーバー内なら ID で参照可
- 難易度: 中 / 効果: 高（ユーザー体験が良くなる）

### 編集の双方向同期
- 現状: 元メッセージ編集時に DB のみ更新（転送先は据え置き）
- 元メッセージを編集したら転送先メッセージも `edit()` する
- 転送先メッセージの編集を元へ反映する逆方向は要検討（権限・誤操作の懸念）
- 難易度: 低〜中

### 削除の同期
- 元メッセージ削除時に転送先も削除（または「削除されました」プレースホルダに置換）
- DB の `source_deleted_at` を活用
- 難易度: 低

### スレッド対応
- ソースチャンネルのスレッド内投稿も拾う / 転送先にもスレッドを再現
- 難易度: 中〜高

### Embed / リンクプレビュー保持
- 現状は `content` のみ転送、Embed は落ちる
- 元メッセージの Embed も転送 (`message.embeds` をそのまま渡す)
- 難易度: 低

### Slash コマンド
- `/times stats` 個人の投稿数を表示
- `/times search <keyword>` 自分の過去投稿を全文検索
- `/times export` 自分の times を JSON / Markdown で DM 送信
- `/times link <userId>` 別の times チャンネルを購読
- 難易度: 中

### ピン留めまとめ
- 各 times チャンネルでピン留めされたメッセージを集約チャンネルに表示
- 「今週のハイライト」的に使える
- 難易度: 中

### 投稿の絵文字リアクションでタグ付け
- 特定のリアクション (例: 📌, ⭐) で DB にタグを追加
- あとから検索しやすくなる
- 難易度: 中

---

## 🔍 検索・分析

### 全文検索
- SQLite FTS5 を有効化して過去投稿を全文検索
- Slash コマンドや Web UI と組み合わせ
- 難易度: 中

### Web ダッシュボード
- Next.js / SvelteKit で小さな Web UI
- ユーザー別投稿数推移、よく使う単語、時間帯別投稿頻度
- OAuth で本人のみ自分の times を閲覧可
- 難易度: 高 / 効果: 高

### 週次サマリー bot
- 毎週月曜の朝に「先週の自分の投稿数 / よく書いた話題」を DM
- LLM で要約させても面白い
- 難易度: 中

### LLM による話題要約
- 各 times の直近 1 週間を Claude / GPT に要約させる
- 集約チャンネルに「今週の話題」として投稿
- 難易度: 中

---

## 🔐 セキュリティ・運用堅牢化

### Rate limit ハンドリングの可視化
- discord.js の rate limit イベントをログ出力 + メトリクス化
- 難易度: 低

### Secret 管理
- `.env` ではなく AWS Secrets Manager / Doppler / SOPS
- 難易度: 中

### バックアップ自動化
- SQLite を定期的に S3 / R2 に snapshot
- `litestream` を使えばリアルタイムレプリケーション可
- 難易度: 低〜中 / 効果: 高

### マルチインスタンス対応
- 現状単一インスタンス前提。sharding 対応で大規模サーバーにも
- 難易度: 高

---

## 🧪 テスト・品質

### E2E テスト
- Discord のテスト用サーバーに対して実 bot を動かす E2E
- 難易度: 高

### カバレッジ可視化
- `vitest --coverage` + Codecov で PR にコメント
- 難易度: 低

### Mutation testing
- `stryker-mutator` で実テストの厳しさを測る
- 難易度: 中

---

## 🎨 UX 改善

### チャンネル作成時のテンプレ拡充
- 現状「チャンネルを作りました」のみ
- ピン留めで「使い方ガイド」を自動投稿
- チャンネルトピックに本人のプロフィール (display name, joined at) をセット
- 難易度: 低

### ユーザー名変更追従オプション
- 現状: username 変更してもチャンネル名は変わらない
- オプションで rename する設定を追加
- 難易度: 低

### Opt-out コマンド
- ユーザーが「自分の投稿を転送しないで」と指定できる
- `/times pause` `/times resume`
- 難易度: 低

---

## 優先度の個人的おすすめ

1. **GitHub Actions の CI** (test + build) — まず入れて損なし
2. **リアクション同期** — ユーザー体験のインパクトが大きい
3. **SQLite バックアップ (litestream)** — 運用上の安心感
4. **Embed 転送 / 削除同期** — 既存機能の素直な拡張
5. **Slash コマンド `/times search`** — DB に貯めてる価値を引き出せる
