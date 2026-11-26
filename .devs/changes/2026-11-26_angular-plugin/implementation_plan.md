# 実装計画: Angular 版（fork/custom-for-angular）— `angular` プラグイン

## 目的

`sun-flat-yamada/ai-dlc-sdk-angular`（Angular 22 のフロントパネル GUI 向け AI-DLC SDK）で作られた
Angular 前提の良いところを、`fork/custom` から切った `fork/custom-for-angular` に取り込む。

## 方針

- **`core/` と `harness/` は変更しない。** upstream の取り込み（`dev/fork-sync.sh`）で衝突しないよう、
  取り込みはすべて AIDLC プラグイン `plugins/angular/` として足す（プラグインは足すだけで上書きしない仕組み。
  `docs/harness-engineering/10-authoring-a-plugin.md`）。
- 取り込むのは「スタック非依存の AI-DLC ではゲートや規律になっていない Angular 固有の知見」。
  SDK 独自の実行基盤（Copilot CLI 前提のオーケストレーター等）は AI-DLC のエンジン・conductor と役割が重なるので取り込まない。

## 取り込む項目と置き場所

| SDK の要素 | 取り込み先 |
|---|---|
| Angular 実装規約（standalone・signals・OnPush・zoneless 追従、`data-ui-id`、API クライアント経由の REST、既存モジュールの再利用） | `memory/rules.md`（team）・`knowledge/aidlc-developer-agent/angular-implementation-guide.md` |
| `ui-bindings.yaml`（UI 要素 ⇄ API 操作 ⇄ 画面状態 ⇄ エラー処理の結合）と「入力が食い違ったときの優先順位」 | functional-design への寄与（`frontend-components.md` の `## UI Bindings` 節） |
| 変更影響マップと境界ゾーン（reuse / append-only / rebuild / delete） | code-generation への寄与（Step 2 の計画に入れる） |
| build → lint → unit(+coverage) を緑になるまで回す検証ループ | code-generation への寄与・`memory/phases/construction.md` |
| 人が書いた受け入れ試験仕様を最終ゲートにする（1 ケース 1 テスト、`[<case-id>]` タイトル、期待値は変えない、skip 禁止） | build-and-test への寄与・センサー `angular-acceptance-gate` |
| テストの骨抜き検出（`.skip` / `.only` / `fit` / `xit` / `test.fixme` / `waitForTimeout` / `force: true`） | センサー `angular-test-integrity`（書き込み時、advisory） |
| 失敗の分類（B/D/A/R/T/E）と最小修正・同じ修正の再試行禁止 | build-and-test への寄与・`knowledge/aidlc-quality-agent/` |

## 検査

- `plugins/angular/tests/plugin.test.ts`: プラグイン内容の検証（`validatePluginContent`）、2 センサーの main(argv) 契約と判定。
- `bun tools/aidlc-plugin-validate.ts plugins/angular`、`bun scripts/package.ts`、`bun scripts/package.ts --check`。
- `dev/upstream-checks.sh`（install / `bun run check` / smoke）。

## 取り込まないもの（理由は PR と報告に書く）

Copilot CLI アダプター・独自オーケストレーター（N 回ループ）、git による自動リバート、Excel パーサー（exceljs 依存）、
QCD ベンチマーク、逆生成ドキュメント skill、インストーラー、サンプルアプリ・組み込みパネル固有の制約、リポジトリ衛生系の設定。

## PR

base は `fork/custom-for-angular`（`fork/custom` には入れない）。品質ゲート・自動マージは `fork/custom` 向けだけなので、人がマージする。
