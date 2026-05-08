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

スクリプトから準備状態を確認:

```bash
ldash setup --check                       # 未設定なら exit 1
ldash config show --json | jq .ready      # ワンライナーの readiness チェック
ldash doctor                              # フル診断: URL → トークン → プロジェクト
```

### 設定の優先順位

1. 環境変数 (`LIGHTDASH_API_KEY`, `LIGHTDASH_API_URL`, `LIGHTDASH_PROJECT_UUID`)
2. 設定ファイル `~/.config/ldash/config.json` (`ldash setup` で書き込まれる)
3. 組み込みのデフォルト値

`ldash config show` で実効設定と各値の出所を確認できます。

## クイックスタート

```bash
# 何でも横断的に名前で検索 (テーブル、フィールド、チャート、ダッシュボード等)
ldash search "<query>"

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

# エンドツーエンドのヘルスチェック (URL → トークン → プロジェクト)
ldash doctor
```

## コマンド

```
ldash <グループ> <コマンド> [引数...] [--json]
```

| グループ    | 説明                                                             |
| ----------- | ---------------------------------------------------------------- |
| `explore`   | データモデル (テーブル、ディメンション、メトリクス)              |
| `query`     | クエリ実行 (メトリクスクエリ、SQL、集計、フィルタ演算子一覧)     |
| `chart`     | 保存済みチャートとデータ                                         |
| `dashboard` | ダッシュボード (タイル、フィルター、レイアウト)                  |
| `catalog`   | データカタログとメトリクス                                       |
| `search`    | 横断検索 (テーブル、フィールド、チャート、ダッシュボード、…)     |
| `project`   | プロジェクトとバリデーション                                     |
| `space`     | スペース (フォルダ)                                              |
| `org`       | 組織設定                                                         |
| `api`       | API 直接アクセス (エスケープハッチ)                              |
| `config`    | CLI 設定の管理                                                   |
| `setup`     | セットアップウィザード                                           |
| `doctor`    | エンドツーエンドのヘルスチェック (URL → トークン → プロジェクト) |

### エスケープハッチ

任意の Lightdash API エンドポイントに直接アクセス:

```bash
ldash api GET /api/v1/org/projects
ldash api POST /api/v1/projects/{uuid}/sqlQuery --body '{"sql":"SELECT 1"}'
```

### 出力

- デフォルト: 整形された JSON
- `--json`: パイプ用のコンパクト JSON
- `--fields a,b,c`: リスト/オブジェクト結果を指定キーに射影
- `--compact`: コマンドごとの妥当なデフォルト部分集合 (`uuid,name,description` など)

```bash
ldash chart list --json | jq '.[].name'
ldash chart list --compact                # uuid + name + description
ldash chart list --fields uuid,name,spaceName
```

### Stdin / ファイル入力

JSON を渡す全フラグ (`--filters`, `--sorts`, `--dimensions`, `--metrics`, `--body`) と `query sql` の位置引数で以下が使えます:

- `-` で stdin から読み取り
- `@path/to/file` でファイルから読み取り

```bash
echo '{"sql":"SELECT 1"}' | ldash api POST /api/v1/projects/<uuid>/sqlQuery --body -
ldash query run orders --filters @./filters.json
ldash query sql @./query.sql
```

### 安定したエラーエンベロープ

`--json` 時、エラーは安定した `code` 付きの構造化エンベロープで返ります。エージェントはメッセージ文字列を解析せずに `code` で分岐できます:

```json
{
  "ok": false,
  "error": {
    "code": "EXPLORE_NOT_FOUND",
    "what": "...",
    "why": "...",
    "hint": "..."
  }
}
```

`hint` は具体的な次のコマンドを指し示します（例: `EXPLORE_NOT_FOUND` → `Run "ldash explore list"`）。全コードは [`src/errors.ts`](src/errors.ts) を参照。

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
