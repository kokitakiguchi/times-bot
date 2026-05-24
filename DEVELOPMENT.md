# 開発ガイド

開発・リリースの進め方をまとめたドキュメントです。Bot の使い方は [README.md](README.md)、機能アイディアは [IDEAS.md](IDEAS.md) を参照してください。

---

## ブランチ戦略

GitHub Flow を少し拡張した3層構成です。

| ブランチ | 役割 | push 元 | マージ先 |
| --- | --- | --- | --- |
| `main` | 本番相当・常にデプロイ可能な状態 | リリース時のみ | (なし) |
| `develop` | 次リリースの統合先・QA 用 | feature ブランチ | `main` |
| `feature/<topic>` | 機能開発・修正 | 各開発者 | `develop` |

### ルール

- **`main` への直接 push は禁止**。`develop` から PR 経由でのみマージする
- **`develop` への直接 push も原則禁止**。`feature/**` から PR 経由でマージする
- `feature/**` の命名は短く具体的に: `feature/ci`, `feature/reaction-sync`, `feature/sqlite-backup` など
- 大きな変更を分割する場合は `feature/<topic>-part1`, `-part2` のように suffix を付ける
- バグ修正は `fix/<short-desc>`、ドキュメントのみは `docs/<short-desc>` を使ってもよい

### マージ方針

- PR は **Squash merge** を基本とする（履歴を読みやすく保つため）
- 大きな機能で履歴を残したい場合のみ Merge commit を選択
- マージ後は feature ブランチを削除する

---

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) が以下を実行します。

- **トリガー**: `main` / `develop` / `feature/**` への push、`main` / `develop` への PR
- **node ジョブ**: Node 22 + pnpm 10.11 → `pnpm install --frozen-lockfile` → `pnpm rebuild better-sqlite3` → `pnpm typecheck` → `pnpm test` → `pnpm build`
- **docker ジョブ**: Dockerfile からイメージビルド（push なし、GHA キャッシュ利用）

PR は全ジョブ green でマージ可能とします。

### ローカルで CI と同じチェックを走らせる

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
docker build -t times-bot:local .
```

---

## バージョニング方針

[Semantic Versioning 2.0.0](https://semver.org/lang/ja/) (SemVer) に従います。

```
MAJOR.MINOR.PATCH
```

このリポジトリはライブラリではなく Bot サービスですが、運用者が変更影響を把握しやすいよう SemVer を採用します。

### バージョンの上げ方

| 種別 | 上げる桁 | 例 |
| --- | --- | --- |
| **MAJOR** | 互換性のない設定変更・運用フロー変更 | `.env` の必須キー追加、`routes.yaml` スキーマ破壊的変更、DB スキーマの非互換マイグレーション |
| **MINOR** | 後方互換のある機能追加 | 新しい Slash コマンド、新しいオプション環境変数、リアクション同期機能の追加 |
| **PATCH** | 後方互換のあるバグ修正・内部改善 | エラーハンドリング修正、ログ改善、依存パッケージのマイナー更新 |

### 0.x 系の扱い

現在は `0.1.0`。`1.0.0` 到達前は以下のルールを適用します。

- `0.MINOR.PATCH` の **MINOR** を破壊的変更にも使う（SemVer 仕様準拠）
- 機能追加・バグ修正は **PATCH** を上げる
- 本番運用が安定し、設定スキーマが固まったタイミングで `1.0.0` に上げる

### バージョンが宣言される場所

- [package.json](package.json) の `version`
- Git タグ: `v0.2.0` のように `v` プレフィックス付き
- (将来) GitHub Releases

### リリースフロー

1. `develop` で機能を統合し、CI が green であることを確認
2. `develop` → `main` の PR を作成。タイトルは `release: vX.Y.Z` 形式
3. PR 内で以下を実施
   - [package.json](package.json) の `version` を更新
   - `CHANGELOG.md` に変更内容を追記（後述）
4. PR マージ後、`main` で git tag を打つ

   ```bash
   git checkout main && git pull
   git tag -a v0.2.0 -m "v0.2.0"
   git push origin v0.2.0
   ```

5. GitHub Releases にタグを紐づけてリリースノートを書く（将来は `release-please` 等で自動化検討）

### CHANGELOG

[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 形式の `CHANGELOG.md` を `1.0.0` 到達までに整備します。当面はリリース PR の本文 + GitHub Releases のリリースノートで代用可。

セクション:

- `Added`: 新機能
- `Changed`: 既存機能の変更
- `Deprecated`: 将来削除予定
- `Removed`: 削除済み
- `Fixed`: バグ修正
- `Security`: セキュリティ修正

---

## コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/ja/v1.0.0/) を推奨します（必須ではない）。

| prefix | 用途 |
| --- | --- |
| `feat:` | 新機能（MINOR を上げる候補） |
| `fix:` | バグ修正（PATCH を上げる候補） |
| `docs:` | ドキュメントのみ |
| `chore:` | ビルド・依存・雑務 |
| `ci:` | CI 設定 |
| `refactor:` | 機能変更を伴わないコード整理 |
| `test:` | テスト追加・修正 |

破壊的変更は本文に `BREAKING CHANGE:` を含めるか、prefix に `!` を付けます (`feat!:`)。

---

## ローカル開発

詳細は [README.md](README.md) を参照。要点だけ:

```bash
pnpm install
cp env.example .env
cp routes.example.yaml routes.yaml
# .env と routes.yaml を埋める
pnpm dev      # ホットリロード
pnpm test     # vitest
```

Docker で動作確認:

```bash
docker compose up --build
```

---

## レビュー観点

PR レビューで特に見る項目:

- 設定スキーマ (`.env` / `routes.yaml`) を変える場合、example ファイルと README を同時更新しているか
- DB スキーマを変える場合、マイグレーション戦略があるか
- 新しい権限が必要な場合、README の権限セクションを更新しているか
- ログイベント名 (`event: ...`) が他と一貫しているか
- 添付・メンション・Embed のサニタイズが既存パターンに従っているか
