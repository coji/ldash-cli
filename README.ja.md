# ldash

[Lightdash](https://www.lightdash.com/) API の CLI ツール。ターミナルからデータのクエリ、モデルの探索、ダッシュボードやチャートの閲覧ができます。

コーディングエージェント (Cursor, Claude Code など) と人間の両方で使えるように設計されています。

## インストール

```bash
npx @coji/ldash-cli --help

# またはグローバルインストール
npm install -g @coji/ldash-cli
```

## セットアップ

対話式ウィザード:

```bash
ldash setup
```

ステップごと (エージェント向け):

```bash
ldash setup https://your-instance.com     # URL 保存 + ブラウザで PAT ページを開く
ldash setup --api-key <token>             # API キー保存 + プロジェクト一覧表示
ldash setup --project-uuid <uuid>         # プロジェクト UUID 保存、完了
```

設定は `~/.config/ldash/config.json` に保存されます。
環境変数 (`LIGHTDASH_API_KEY`, `LIGHTDASH_PROJECT_UUID`, `LIGHTDASH_API_URL`) が設定されている場合はそちらが優先されます。

## クイックスタート

```bash
# データモデルを探索
ldash explore list
ldash explore get <exploreId>

# データをクエリ
ldash query run <exploreId> \
  --dimensions '["orders_status"]' \
  --metrics '["orders_count"]' \
  --limit 10

# SQL を直接実行
ldash query sql "SELECT * FROM orders LIMIT 10"

# ダッシュボード・チャートを閲覧
ldash dashboard list
ldash chart get <chartUuid>
```

## コマンド

```
ldash <グループ> <コマンド> [引数...] [--json]
```

| グループ    | 説明                                                |
| ----------- | --------------------------------------------------- |
| `explore`   | データモデル (テーブル、ディメンション、メトリクス) |
| `query`     | クエリ実行 (メトリクスクエリ、SQL、集計)            |
| `chart`     | 保存済みチャートとデータ                            |
| `dashboard` | ダッシュボード (タイル、フィルター、レイアウト)     |
| `catalog`   | データカタログとメトリクス                          |
| `project`   | プロジェクトとバリデーション                        |
| `space`     | スペース (フォルダ)                                 |
| `org`       | 組織設定                                            |
| `api`       | API 直接アクセス (エスケープハッチ)                 |
| `config`    | CLI 設定の管理                                      |
| `setup`     | セットアップウィザード                              |

### エスケープハッチ

任意の Lightdash API エンドポイントに直接アクセス:

```bash
ldash api GET /api/v1/org/projects
ldash api POST /api/v1/projects/{uuid}/sqlQuery --body '{"sql":"SELECT 1"}'
```

### 出力

- デフォルト: 整形された JSON
- `--json`: パイプ用のコンパクト JSON

```bash
ldash chart list --json | jq '.[].name'
```

### ヘルプ

3 階層のヘルプ (使用例と次のステップ付き):

```bash
ldash --help                    # 全グループ
ldash explore --help            # グループ内のコマンド
ldash explore get --help        # 使い方、例、次のステップ
```

## 公式 Lightdash CLI との違い

公式の [`@lightdash/cli`](https://www.npmjs.com/package/@lightdash/cli) は **dbt 開発ワークフロー** (コンパイル、デプロイ、プレビュー、スキーマ生成) に特化しています。

`ldash` は **データアクセス** (クエリ、探索、チャート/ダッシュボードの閲覧) に特化しています。

|                             | `@lightdash/cli`       | `ldash`                              |
| --------------------------- | ---------------------- | ------------------------------------ |
| **用途**                    | dbt 開発・デプロイ     | データアクセス・クエリ               |
| **dbt コンパイル/デプロイ** | Yes                    | No                                   |
| **データモデル探索**        | No                     | Yes                                  |
| **メトリクスクエリ**        | No                     | Yes                                  |
| **チャート/ダッシュボード** | No                     | Yes                                  |
| **SQL 実行**                | DWH 直接 (dbt profile) | API 経由                             |
| **認証**                    | ログイン (email/token) | 設定ファイル / 環境変数              |
| **対象ユーザー**            | dbt 開発者             | コーディングエージェント・アナリスト |

両方を組み合わせて使えます。

## ライセンス

MIT
