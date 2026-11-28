# 02. 人間が用意する入力物と配置場所

[← ルートガイドへ戻る](../../README.ja.md) | [← 01. 導入手順](01-setup.ja.md)

AI-DLC の Angular 開発フローでは、AI が推測で仕様を埋めないようにするため、人間が事前に用意した仕様・モックアップ・受け入れ試験仕様を「正本（ソース・オブ・トゥルース）」として扱います。

---

## 対象 Angular リポジトリの全体レイアウト

```text
your-angular-app/
├── angular.json                         # 既存の Angular ワークスペース設定
├── package.json                         # Angular / TypeScript バージョンと build/lint/test スクリプト
├── src/                                 # 既存の Angular ソースコード
├── e2e/ (または playwright/ 等)          # 既存の E2E テストフォルダ（Build & Test で受け入れ試験を追加）
│
├── .claude/ (または .kiro/ .codex/ 等)   # AI-DLC ハーネス設定・合成済みプラグイン
├── .mcp.json (または各ハーネスの MCP 設定) # `aidlc angular-mcp` が追記
│
├── docs/                                # ★ 人間が用意する入力物の推奨配置場所（パスは任意）
│   ├── specs/requirements.md            #   1. 要件ドキュメント（FR / AC 番号付き）
│   ├── api/openapi.yaml                 #   2. OpenAPI 仕様（operationId 付き）
│   ├── design/<screen>.html             #   3. デザインモックアップ HTML/CSS（data-ui-id 付き）
│   └── tests/acceptance-cases.xlsx      #   4. 人間が書いた受け入れ試験仕様（.xlsx / .csv / .md）
│
└── aidlc/                               # AI-DLC の記録・成果物（git 管理対象）
    ├── codebase-atlas/graph/<repo>/     # `aidlc atlas-graph build` の出力（graph.json, build-info.json）
    └── spaces/<space>/
        ├── memory/
        │   ├── team.md                  # ★ チーム固有の規約（必要に応じて人間が追記）
        │   └── project.md               # ★ プロジェクト固有の規約・制約（必要に応じて人間が追記）
        ├── knowledge/                   # ★ 製品固有のドメイン知識（必要に応じて人間が配置）
        └── intents/<intent-id>/
            ├── inception/
            │   ├── requirements-analysis/requirements.md
            │   ├── contract-design/contract-summary.md
            │   └── refined-mockups/     # 精錬モックアップの配置先（UI Bindings からも自動探索される）
            └── construction/
                ├── <unit>/
                │   ├── functional-design/frontend-components.md  # `## UI Bindings` を含む
                │   └── code-generation/code-generation-plan.md   # `## Change Impact Map` を含む
                └── build-and-test/
                    ├── angular-acceptance-cases.json             # `aidlc angular-cases` の変換結果
                    ├── angular-acceptance-cases.md               # 可読チェックリスト
                    └── angular-acceptance-results.json           # 受け入れ試験の実行結果（センサー入力）
```

> **配置パスの考え方**: 人間が用意する入力ファイルは、対象リポジトリ内の任意のフォルダ（例: `docs/specs/`, `docs/api/`, `docs/design/`, `docs/tests/`）に置いて構いません。AI-DLC を開始するときにパスを伝えるか、`## UI Bindings` 内でプロジェクト相対パスとして指定します。

---

## 人間が用意する 4 つの入力物

### 1. 要件ドキュメント（必須）

- **形式**: Markdown 等のテキスト（またはチャットでの要件説明）
- **推奨配置場所**: `docs/specs/<feature>.md` 等
- **書いておくとよい内容**:
  - 機能要件 ID（例: `FR1`, `FR2`）と受け入れ基準 ID（例: `AC1.2.1`）
  - 画面一覧、期待する振る舞い、権限・前提条件、対象外スコープ
- **使われ方**: Inception の `requirements-analysis` で `requirements.md` に整理され、Construction の `## UI Bindings`（`requirements: [FR1, AC1.2.1]`）と突き合わせられます（一致しない ID は警告が出ます）。

### 2. OpenAPI 仕様（API がある場合は推奨）

- **形式**: OpenAPI 3.x の `.yaml` または `.json`
- **推奨配置場所**: `docs/api/openapi.yaml` 等（プロジェクト相対パス）
- **必須の書き方**:
  - すべての対象エンドポイントに一意の **`operationId`** を付けること（1 `operationId` = API サービスの 1 メソッドになり、`## UI Bindings` の `call:` から参照されます）
  - リクエストボディの `properties` / `required` と、想定エラーの HTTP ステータスコード（`400`/`422` → `validation`、`409`/`503` → `busy`、`404` → `not-found`）を明記すること
  - 全画面共通の API（ヘッダの常駐ポーリング等）で特定 Unit の `## UI Bindings` に紐づけたくない操作には、拡張属性 `x-ui-binding: shared` を付けると「未結合」警告を抑止できます
- **参照のされ方**:
  - `## UI Bindings` の `apiSpecs: [docs/api/openapi.yaml]` にプロジェクト相対パスで指定する
  - `apiSpecs` を省略した場合は、`inception/contract-design/contract-summary.md` 内の `openapi` コードブロックが自動参照されます

### 3. デザインモックアップ HTML/CSS（UI 画面がある場合は推奨）

- **形式**: HTML（＋CSS）ファイル
- **推奨配置場所**: `docs/design/<screen>.html` 等（または `aidlc/spaces/<space>/intents/<intent>/inception/refined-mockups/`）
- **必須の書き方**:
  - テストや振る舞い定義で参照するすべての要素に、一意の **`data-ui-id="<kebab-case>"`** を付けること（形式: `^[a-z][a-z0-9-]*$`、同一ファイル内で重複禁止）
  - 装飾目的など振る舞いを持たない要素に `data-ui-id` を付けた場合は、`## UI Bindings` の `static: [<ui-id>]` に列挙します
  - ラベル文言・ボタン文言・エラーメッセージは、そのまま実装へ転記されるため正確な文言を記載します
- **参照のされ方**: `## UI Bindings` の `screens.<screen-id>.design` にプロジェクト相対パスで指定します。`angular-ui-bindings` センサーがモックアップ内の `data-ui-id` と表の定義が 1 対 1 で一致しているか検査します。

### 4. 人間が書いた受け入れ試験仕様（最終ゲート・推奨）

- **形式**: `.xlsx`（Excel）、`.csv`、または Markdown テーブル（`.md`）
  - 古い `.xls` 形式は非対応です。Excel 等で `.xlsx` として保存してから配置してください。
- **推奨配置場所**: `docs/tests/acceptance-cases.xlsx` 等（複数ファイル指定も可）
- **自動認識される列見出し（大文字小文字・全角半角・空白は無視されます）**:

| フィールド名 (`--alias` 用) | 既定で認識される日本語見出し | 既定で認識される英語見出し |
| --- | --- | --- |
| `id`（必須） | `テストID`, `テストNo`, `テスト番号`, `項番`, `ケースID` | `Test ID`, `Case ID`, `ID` |
| `steps`（必須） | `操作手順`, `手順`, `フロントパネル操作手順` | `Steps`, `Procedure`, `Operation` |
| `category` | `大項目`, `機能`, `分類` | `Category`, `Feature` |
| `title` | `テスト項目`, `確認項目`, `中項目`, `テスト名` | `Title`, `Test Item`, `Test Name` |
| `priority` | `優先度`, `重要度` | `Priority` |
| `preconditions` | `前提条件` | `Preconditions`, `Precondition` |
| `initialDeviceState` | `機器初期状態`, `初期状態`, `機器状態` | `Initial Device State`, `Device State`, `Initial State` |
| `mockApi` | `API応答`, `モック応答`, `API応答(モック)` | `API Responses`, `Mock Responses`, `API Mock` |
| `expectedUi` | `期待画面表示`, `期待結果`, `期待値(画面)` | `Expected UI`, `Expected Display`, `Expected Result` |
| `expectedCss` | `期待CSS状態`, `期待CSS`, `期待スタイル` | `Expected CSS`, `Expected Style` |
| `expectedApi` | `期待APIリクエスト`, `期待API` | `Expected API Request`, `Expected Request`, `Expected API` |
| `notes` | `備考` | `Notes`, `Remarks` |

> 最低限「`id` 列 + `steps` 列 + 既知の列をもう 1 つ以上」が見出し行にあれば自動認識されます。独自の列名を使う場合は `aidlc angular-cases` に `--alias "<見出し>=<フィールド名>"` を渡します。

- **セル内の推奨記法**（自動化しやすい書き方）:

| 列 | 記法例 |
| --- | --- |
| テスト ID | `ST-NET-003`（全ファイルを通じて一意） |
| 操作手順 | 番号付き行。画面要素は `@<ui-id>` で表記（例: `1. @save-btn をクリックする`） |
| API 応答（モック） | 呼び出し順に 1 行 1 件：`GET /api/v1/network -> 200 {"dhcp": true}` |
| 期待画面表示 | `@<ui-id>` を含めた期待表示（例: `@status-badge に "保存済み" と表示される`） |
| 期待 CSS | `@<ui-id> { color: rgb(220, 38, 38) }` |
| 期待 API リクエスト | `PUT /api/v1/network {"dhcp": false}`、または送らない場合は「送信されない」 |
| 備考 | トレーサビリティ用の要件 ID（例: `FR1, AC1.2.1`） |

- **重要ルール（改ざん防止）**:
  - `@<ui-id>` は `## UI Bindings` に存在する ID と一致させてください（存在しない ID は `angular-acceptance-gate` センサーが検出します）。
  - テスト実行開始後に試験仕様ファイルを変更すると、`angular-acceptance-gate` センサーが SHA-256 ハッシュ不一致として検出します。修正が必要な場合は人間が合意の上で元ファイルを直し、`aidlc angular-cases` を再実行してください。

---

## 入力同士が食い違ったときの優先順位

要件・デザイン・OpenAPI・`## UI Bindings` の間で食い違いが見つかった場合、プラグインは以下の優先順位を規約として適用します。

| 観点 | 決定権を持つ入力 |
| --- | --- |
| 振る舞い（クリック時の動作、状態遷移、活性条件、エラー処理） | `## UI Bindings` |
| 見た目（レイアウト、スタイル、ラベル文言） | デザインモックアップ HTML/CSS |
| 通信形式（パス、メソッド、JSON スキーマ、ステータスコード） | OpenAPI 仕様 |

AI が勝手に判断して埋めることは禁止されており、ギャップは必ず計画や設計の `Assumptions` に記録して人間へ提示します。

---

## プロジェクト固有の規約・知識を置く場所（任意）

組み込み機器の画面サイズ制約や社内共通コンポーネントの使い方など、プロジェクト固有のルールはプラグイン本体ではなく対象リポジトリの `aidlc/` 配下に置きます。

- チーム規約: `aidlc/spaces/<space>/memory/team.md`
- プロジェクト固有の制約・カバレッジ閾値の上書き等: `aidlc/spaces/<space>/memory/project.md`
- 製品固有の参考資料: `aidlc/spaces/<space>/knowledge/`

---

**次のステップ**: [03. 開発フローと各ゲートでの確認事項](03-workflow.ja.md)
