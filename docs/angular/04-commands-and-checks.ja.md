# 04. コマンド・センサー・トラブルシューティング

[← ルートガイドへ戻る](../../README.ja.md) | [← 03. 開発フローと確認事項](03-workflow.ja.md)

このページでは、`angular` と `codebase-atlas` の 2 プラグインが提供するコマンド・センサーの仕様と、よくあるエラーの対処法をまとめています。

> **コマンドの呼び出し方の読み替え**
>
> - ターミナル（ネイティブ版）: `aidlc <command> ...`
> - ターミナル（手動コピー版）: `bun <harness-dir>/tools/aidlc.ts <command> ...`
> - チャット内: `/aidlc <command> ...`（Codex CLI は `$aidlc <command> ...`）

---

## 1. プラグインコマンド一覧

### `aidlc angular-mcp`

Angular CLI 内蔵の MCP サーバー（`npx --no-install ng mcp --read-only --local-only`）を、現在のハーネスのプロジェクト MCP 設定へ追加・確認・削除します。

```bash
aidlc angular-mcp            # プロジェクトの MCP 設定に追加（同名の別設定は上書きしない）
aidlc angular-mcp --dry-run  # 変更内容だけ表示し、ファイルは変更しない
aidlc angular-mcp --remove   # このコマンドが追加したエントリを削除する
aidlc angular-mcp --print    # 設定 JSON を標準出力へ表示（自動編集対象外のハーネス用）
```

- 対象ハーネス: `.claude` → `.mcp.json` / `.kiro` → `.kiro/settings/mcp.json` / `.cursor` → `.cursor/mcp.json` / `.codex` → `.codex/config.toml`
- 前提: プロジェクトに `angular.json` と `@angular/cli >= 20.2` が入っていること

### `aidlc angular-bindings-check`

`frontend-components.md` の `## UI Bindings` YAML ブロック（または単体の `bindings.yaml`）を検証します。ゲートで動く `angular-ui-bindings` センサーと同じ検査を手動で実行できます。

```bash
aidlc angular-bindings-check <frontend-components.md|bindings.yaml> [--matrix <out.md>] [--json]
```

| オプション | 内容 |
| --- | --- |
| `--matrix <out.md>` | UI 要素 ⇄ API 操作 ⇄ 状態の結合マトリクスを Markdown で出力 |
| `--json` | 検証結果（`pass`, `findings`, `warnings`, `checked`, `not_checked`）を JSON 出力 |

- 終了コード: `0` = エラーなし / `1` = エラーあり（または `## UI Bindings` ブロックなし） / `2` = 引数エラー

### `aidlc angular-cases`

人間が作成した受け入れ試験仕様（`.xlsx` / `.csv` / Markdown テーブル）を依存ライブラリなしで解析し、`angular-acceptance-cases.json` と可読チェックリスト `angular-acceptance-cases.md` を出力します。

```bash
aidlc angular-cases <file.xlsx|.csv|.md>... [--out <dir>] [--sheet <name>]... [--alias "<header>=<field>"]...
```

| オプション | 内容 |
| --- | --- |
| `--out <dir>` | 出力先ディレクトリ（既定: カレントディレクトリ）。Build & Test では `<record>/construction/build-and-test` を指定 |
| `--sheet <name>` | `.xlsx` で読み込むシート名を限定（複数指定可） |
| `--alias "<header>=<field>"` | 既定にない列見出しをフィールドへ割り当て（複数指定可）。`<field>` は `id`, `category`, `title`, `priority`, `preconditions`, `initialDeviceState`, `mockApi`, `steps`, `expectedUi`, `expectedCss`, `expectedApi`, `notes` のいずれか |

- 終了コード: `0` = 1 件以上抽出成功 / `1` = 0 件または読み込み失敗 / `2` = 引数エラー
- 出力される `angular-acceptance-cases.json` には `sources[].sha256`（元ファイルハッシュ）と `casesSha256`（ケース配列ハッシュ）が記録されます。

### `aidlc atlas-graph`

`codebase-atlas` プラグインのツールです。既存リポジトリのソースファイルを `graphify`（tree-sitter AST、LLM なし、オフライン）で独立カウントし、codekb の引用と網羅性を検証します。

```bash
# 1. ソースファイル一覧のグラフを構築（aidlc/codebase-atlas/graph/<repo>/ に出力）
aidlc atlas-graph build [--repo <repo>] [--graphify <command>] [--no-report]

# 2. codekb の引用実在とファイル網羅性を検証（ファイルは一切変更しない）
aidlc atlas-graph check [--repo <repo>] [--codekb <folder>] [--json]
```

| オプション | 内容 |
| --- | --- |
| `--repo <repo>` | codekb 上のリポジトリ名（省略時はプロジェクトフォルダ名） |
| `--codekb <folder>` | 検証対象の codekb フォルダ（公開前のステージングフォルダ等） |
| `--graphify <command>` | `graphify` 実行コマンドの上書き |
| `--no-report` | `build` 時の追加レポート生成を省略 |
| `--json` | `check` 結果を JSON で出力 |

- 終了コード（`check`）: `0` = 両チェック合格 / `1` = 指摘あり / `2` = 引数エラー

---

## 2. センサー一覧（すべて advisory）

各センサーは対応ステージのゲート直前に自動実行され、指摘があれば AI へ返して修正を促します。

| センサー名 | プラグイン | 発火ステージ・対象成果物 | 検査内容 |
| --- | --- | --- | --- |
| `atlas-citations` | `codebase-atlas` | `reverse-engineering`（codekb 各成果物） | 記載されたすべての `path:line` がリポジトリ内に実在するファイル・行番号であるか検証。根拠引用が 0 件の成果物は警告 |
| `atlas-coverage` | `codebase-atlas` | `reverse-engineering`（`component-inventory.md`） | `graphify` が数えた全ソースファイル（AI-DLC 自身のファイルを除く）がいずれかの `**Paths**:` または `## Outside Components` に含まれるか検証。グラフ未作成時は `not_checked` で通過 |
| `angular-ui-bindings` | `angular` | `functional-design`（`frontend-components.md`）<br>`code-generation`（`code-summary.md`） | Functional Design で Level 1〜3（表の整合・OpenAPI・モックアップ `data-ui-id`・要件 ID）を検証。Code Generation でさらに Level 4（生成テンプレート内の `data-ui-id` / `uiId`）を照合 |
| `angular-test-integrity` | `angular` | `code-generation`（`code-summary.md`）<br>`build-and-test`（`build-and-test-summary.md`） | プロジェクト内の `*.spec.ts` / `*.test.ts` から `.skip`, `.only`, `xit`, `fit`, `test.fixme`, `waitForTimeout`, `force: true` を検出し該当行を報告 |
| `angular-acceptance-gate` | `angular` | `build-and-test`（`build-and-test-summary.md`） | `angular-acceptance-results.json`（および `angular-acceptance-cases.json`）を読み、全ケースに合格テスト `[<case id>]` があること、skip 0 件、未知ケース ID 0 件、元ファイルと変換 JSON の SHA-256 不変、全 `@<ui-id>` が UI Bindings に存在することを検証 |

---

## 3. トラブルシューティング

| 症状・メッセージ | 原因 | 対処法 |
| --- | --- | --- |
| `aidlc --help` に `angular-*` や `atlas-graph` が出ない | プラグインがまだ合成（compose）されていない、またはプロジェクトで無効化されている | Claude / Codex は新規セッションを開く。Kiro 等は `aidlc engine plugin sync` を実行。無効なら `aidlc engine plugin select aidlc,angular,codebase-atlas && aidlc engine plugin sync` |
| `aidlc doctor` で `Angular CLI MCP server configured` が advisory になる | MCP 設定がまだ書かれていない（または `@angular/cli < 20.2`） | MCP を使う場合は `aidlc angular-mcp` を実行。使わない場合はそのまま無視して問題ない |
| `aidlc angular-mcp` が「既存設定と異なる」と表示して書き込まない | 同名 `angular-cli` の別設定が既にある（上書き防止仕様） | 既存の MCP 設定ファイルを確認し、不要なら手動削除してから再実行する |
| `aidlc angular-cases` で `.xls` ファイルがエラーになる | 旧バイナリ Excel 形式（`.xls`）は非対応 | Excel / LibreOffice 等で `.xlsx` 形式で保存し直してから実行する |
| `aidlc angular-cases` で `No case found` になる | 見出し行に「ID 列 + 手順列 + 既知の列もう 1 つ」が見つからない | 列見出しを [02. 入力物](02-inputs.ja.md#4-人間が書いた受け入れ試験仕様最終ゲート推奨) の既定名に合わせるか、`--alias "<見出し>=<field>"` を指定する |
| `angular-ui-bindings` で `data-ui-id` 不一致エラーが出る | モックアップ HTML、UI Bindings 表、生成テンプレートのいずれかで ID が抜けている／余分にある | 装飾用の要素なら `## UI Bindings` の `static:` に追加、操作・検証対象なら `elements:` とテンプレート双方に同じ `data-ui-id` を揃える |
| `angular-acceptance-gate` でハッシュ不一致が出る | 変換後に元の試験仕様ファイルや `angular-acceptance-cases.json` が編集された | AI がテストを通すために書き換えていないか確認する。人間が意図して仕様を更新した場合は `aidlc angular-cases` を再実行してテストをやり直す |
| `build-and-test` で同じケースが 3 回失敗して止まった | 無限ループ防止の上限に到達した | AI が提示した失敗分類（B / D / A / R / T / E）を確認し、仕様の曖昧さ・環境問題・モック条件を人間が判断して指示を出す |
| `reverse-engineering` で `graphify` 未導入の 1 行メッセージが出る | ローカルに `graphify` が入っていない（任意機能） | 網羅検算を使いたい場合のみ `uv tool install git+https://github.com/sun-flat-yamada/graphify@14f35e381cab8d0ae10824a336114a907c288146` を導入する。不要ならそのまま進めてよい |

---

## プラグイン自体のテスト（メンテナー向け）

この fork の開発環境でプラグインのテストと品質検査を走らせるコマンドです。

```bash
bun scripts/package.ts
bun test plugins/angular/tests/plugin.test.ts
bun test plugins/codebase-atlas/tests/plugin.test.ts
bun run check
```
