# 03. 開発フローと各ゲートでの確認事項

[← ルートガイドへ戻る](../../README.ja.md) | [← 02. 入力物と配置場所](02-inputs.ja.md)

このページでは、チャットで `/aidlc`（Codex は `$aidlc`）を起動してから実装・受け入れ試験が完了するまで、**各ステージでプラグインが何を行い、人間が承認ゲートで何を確認すればよいか**を時系列で整理します。

---

## ワークフローの開始

対象 Angular プロジェクトでハーネスを起動し、チャットから依頼します。用意した入力ファイルのパスを最初から渡すとスムーズです。

```text
/aidlc docs/specs/network-settings.md の要件を実装したい。
OpenAPI は docs/api/openapi.yaml、モックアップは docs/design/network-settings.html、
受け入れ試験仕様は docs/tests/acceptance-cases.xlsx にある。
```

以降、AI-DLC のエンジンがステージを順に進め、重要な節目（承認ゲート）で人間に判断を求めます。プラグインが追加するセンサーはすべて **advisory（助言型）** であり、ゲートを開く前に AI へ指摘を返して自律修正させます（人間の操作自体はブロックしません）。

---

## Stage 1: Inception — `reverse-engineering`（既存コード解析）

既存 Angular プロジェクトの現状を `codekb`（9 つの成果物）としてまとめる段です。

### プラグインが自動で行うこと

- **`codebase-atlas`**:
  1. `aidlc atlas-graph build --repo <repo>` を実行し、`graphify` で全ソースファイルの独立カウントを `aidlc/codebase-atlas/graph/<repo>/` に生成します（`graphify` 未導入時は 1 行だけ通知して続行）。
  2. 全主張に `path:line` の根拠を付け、事実・推測・`UNKNOWN` を分けて記述します。
  3. `component-inventory.md` の各コンポーネントに `**Paths**:` 行を、対象外ファイルに `## Outside Components` 節を書きます。
  4. 公開前に `aidlc atlas-graph check` を実行し（最大 3 回）、引用切れや未割り当てファイルを修正します。
- **`angular`**:
  - `angular-cli` MCP が有効なら `list_projects` と `onpush_zoneless_migration` を呼び出し、アプリ/ライブラリ構成と変更検知負債（非 `OnPush` / zone.js 依存箇所）を事実として記録します。

### 人間がゲートで確認すること

- [ ] `atlas-citations` / `atlas-coverage` センサーの指摘が残っていないか（残っている場合は未解決点として納得できるか）
- [ ] `component-inventory.md` の `**Paths**:` と `## Outside Components` に、重要な業務コードが漏れ落ちていないか
- [ ] 記録された Angular / TypeScript バージョンと既存ビルド・テストコマンドが実態と合っているか
- [ ] `UNKNOWN` として挙げられた項目に、人間が補足すべき仕様がないか

---

## Stage 2: Inception — `requirements-analysis` / `contract-design`

要件と API 契約を確定する段です。

### 人間がゲートで確認すること

- [ ] `requirements.md` に、用意した要件 ID（`FR*` / `AC*`）と受け入れ条件が漏れなく反映されているか
- [ ] `contract-summary.md`（または参照する OpenAPI ファイル）に、画面から呼ぶすべての `operationId` とエラーレスポンスが定義されているか

---

## Stage 3: Construction — `functional-design`（機能設計・UI Bindings）

画面要素・API 操作・状態遷移・エラー処理を 1 枚の表に固定する段です。

### プラグインが自動で行うこと

- **`angular`**:
  - `frontend-components.md` に `## UI Bindings` 節（YAML ブロック）を作成します。
  - ゲートで **`angular-ui-bindings`** センサーが以下を自動検証します（相手が無いレベルは `not_checked` として明示）。
    - **Level 1**: YAML 構文、ID 形式（kebab-case）、状態名・遷移先・初期状態の整合
    - **Level 2**: OpenAPI（`apiSpecs:` または `contract-summary.md`）との照合（`operationId`・リクエスト項目・レスポンスパス・エラーコード）
    - **Level 3**: デザインモックアップ HTML の `data-ui-id` との完全一致（過不足・重複）
    - **補助**: `requirements:` の ID が `requirements.md` に存在するか

### 任意で人間が手動確認できるコマンド

```bash
aidlc angular-bindings-check \
  aidlc/spaces/default/intents/<intent-id>/construction/<unit>/functional-design/frontend-components.md \
  --matrix binding-matrix.md
```

### 人間がゲートで確認すること

- [ ] `## UI Bindings` の状態（`states` / `initial`）とイベントごとの遷移（`on.<event>`）が業務仕様と一致しているか
- [ ] 各エラー種別（`validation` / `busy` / `not-found` / `default`）の遷移先と表示メッセージが意図どおりか
- [ ] `angular-ui-bindings` のエラーが 0 件か。警告や `Not checked` がある場合、意図した省略か
- [ ] 入力間の矛盾が `Assumptions` に記録されており、その解釈で問題ないか

---

## Stage 4: Construction — `code-generation`（計画承認とコード生成）

### 4-1. 計画ゲート（`code-generation-plan.md`）

**プラグインが自動で行うこと**:

- `code-generation-plan.md` に **`## Change Impact Map`** を追加し、変更対象を 4 ゾーンで宣言します。
  - **Reuse**: 変更禁止の共通コード（既存サービス、API クライアントラッパー、共通 UI、設定ファイル等）
  - **Append-only**: 追記のみ許可の共有配線ファイル（ルート定義、プロバイダ登録、メニュー定義等）
  - **New / rebuild**: 今回新規作成・再構築する機能フォルダ、API サービス、モデル、spec
  - **Delete**: 置換により削除する旧ファイル（他からの import が無いこと）
- 実装順序を「モデル → API サービス → コンポーネント（テンプレート・状態） → Append-only 配線 → spec」の順に並べます。

**人間が計画ゲートで確認すること**:

- [ ] **Reuse** ゾーンにある既存共通ファイルへ編集計画が入っていないか
- [ ] **Append-only** ゾーンの変更が既存行の削除・並び替えを含まず「追記のみ」になっているか
- [ ] 新規ファイルが既存の Angular バージョン・構成規約に沿っているか

### 4-2. コード生成ゲート（実装・単体テスト完了時）

**プラグインが自動で行うこと**:

- Angular 規約（standalone / `OnPush` / `inject()` / signals / `input()`・`output()` / `@if`・`@for` / zoneless 維持 / 既存 API ラッパー経由）に従って実装します。
- `angular-cli` MCP が有効なら `list_projects` と `get_best_practices` を参照し、導入済み Angular バージョンに即した書き方を優先します。
- ファイル群を書くたびに **build → lint → unit test (+coverage)** を緑になるまで反復します（既定カバレッジ閾値: statements 80 / branches 70 / functions 80 / lines 80）。
- ゲートで以下の 2 センサーが実行されます。
  - **`angular-test-integrity`**: `*.spec.ts` / `*.test.ts` に `.skip`, `.only`, `xit`, `fit`, `test.fixme`, `waitForTimeout`, `force: true` が混入していないか検査
  - **`angular-ui-bindings`（Level 4）**: `## UI Bindings` の全 `ui-id` が生成テンプレートの `data-ui-id`（または `uiId`）に存在するか照合

**人間が実装ゲートで確認すること**:

- [ ] ビルド・lint・単体テストおよびカバレッジがすべて通っているか
- [ ] `git diff` で Reuse ゾーンのファイルが書き換わっていないか、Append-only ファイルが追記のみになっているか
- [ ] `angular-test-integrity` と `angular-ui-bindings`（Level 4）に指摘が残っていないか

---

## Stage 5: Construction — `build-and-test`（受け入れ試験ゲート）

人間が用意した受け入れ試験仕様を最終品質ゲートとして実行する段です。

### プラグインが自動で行うこと

1. **試験仕様の変換**:
   `aidlc angular-cases <case-file>... --out <record>/construction/build-and-test` を実行し、`angular-acceptance-cases.json`（各元ファイルの SHA-256 とケース配列のハッシュ付き）と `angular-acceptance-cases.md` を生成します。
2. **E2E テストの作成**:
   1 ケースにつき 1 テスト、タイトル `[<case id>] ...`、セレクタは `[data-ui-id="..."]` のみ、REST 応答はケース定義どおりにネットワーク層でモックし、期待 API リクエスト（および「送信されない」こと）を検証するテストを作成します。
3. **実行と 6 分類による最小修正（最大 3 ラウンド）**:
   失敗時は以下の分類で原因箇所だけを直します。同じケースが 3 ラウンド直らない場合はループを止め、残りの失敗を分類付きで人間に提示します。

| 分類 | 兆候 | 修正場所 |
| --- | --- | --- |
| **B. 境界** | Reuse ファイルの変更、Append-only の既存行削除 | 該当変更を取り消し、自 Unit 内または追記で実現 |
| **D. デザイン未反映** | 文言・CSS・色の相違、`data-ui-id` 欠落、活性/表示条件の誤り | テンプレート・スタイル（モックアップと UI Bindings 基準） |
| **A. API 契約誤読** | リクエストパス・ボディ相違、エラー未処理 | API サービス・リクエストマッピング |
| **R. 再利用破れ** | HTTP/ポーリング等の重複実装、機能内での `HttpClient` 直接利用 | 既存共通モジュールの利用へ置換 |
| **T. テスト欠陥** | 要素はあるのにセレクタ不一致、待機競合 | テストのセレクタ・待機のみ（**期待値は絶対に変えない**） |
| **E. 環境** | 開発サーバーやブラウザが起動しない | 迂回せず `test-results.md` に報告して人間に相談 |

4. **結果記録とゲート検証**:
   `angular-acceptance-results.json` を書き出し、**`angular-acceptance-gate`** と **`angular-test-integrity`** センサーで検証します。

### 人間が最終ゲートで確認すること

- [ ] 全受け入れケースに対応する E2E テストが存在し、すべて `passed` であること（`skipped` = 0、未知ケース ID = 0）
- [ ] 受け入れ試験仕様ファイルおよび `angular-acceptance-cases.json` のハッシュが実行前後で変化していないこと
- [ ] ケース内の `@<ui-id>` がすべて `## UI Bindings` に存在すること
- [ ] `angular-test-integrity` に骨抜き（`.skip`, `waitForTimeout`, `force: true` 等）の指摘がないこと
- [ ] 3 ラウンド停止でエスカレーションされた失敗がある場合、分類（B/D/A/R/T/E）を見て仕様・環境・修正方針を判断すること

---

**次のステップ**: [04. コマンド・センサー・トラブルシューティング](04-commands-and-checks.ja.md)
