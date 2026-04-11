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

**ブラウザでサインイン** — トークンのコピペ不要:

```bash
ldash setup
```

ブラウザで Lightdash が開きます。「Authorize」をクリックするだけで完了です。ldash がセッションを受け取り、プロジェクト一覧を取得して選択できるようにします。API キーを手動で扱う必要はありません。

特定のインスタンスに対して:

```bash
ldash setup https://your-instance.com
```

### 代替: Personal Access Token を貼り付け

OAuth が使えない場合 (古いセルフホスト Lightdash、制限された社内ネットワーク等):

```bash
ldash setup --pat                         # トークン発行ページを開き、貼り付けを待つ
```

### コーディングエージェント・CI 向け (非対話)

エージェントはブラウザをクリックできないので、環境変数かフラグで設定します:

```bash
# 方法 A — 環境変数
export LIGHTDASH_API_URL=https://app.lightdash.cloud
export LIGHTDASH_API_KEY=<token>
export LIGHTDASH_PROJECT_UUID=<uuid>
ldash explore list                        # setup コマンドなしで動く

# 方法 B — ワンショット
ldash setup https://app.lightdash.cloud \
  --api-key <token> \
  --project-uuid <uuid>
```

Personal Access Token は `<your-instance>/generalSettings/personalAccessTokens` で発行できます。

### 設定の優先順位

1. 環境変数 (`LIGHTDASH_API_KEY`, `LIGHTDASH_API_URL`, `LIGHTDASH_PROJECT_UUID`)
2. 設定ファイル `~/.config/ldash/config.json` (`ldash setup` で書き込まれる)
3. 組み込みのデフォルト値

`ldash config show` で実効設定と各値の出所を確認できます。

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
| **認証**                    | ログイン (email/token) | ブラウザ OAuth / 環境変数            |
| **対象ユーザー**            | dbt 開発者             | コーディングエージェント・アナリスト |

両方を組み合わせて使えます。

## ライセンス

MIT
