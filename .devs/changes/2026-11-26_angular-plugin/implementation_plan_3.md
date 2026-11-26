# 実装計画（追加 2）: 結合表チェックと Excel パーサーの実装

`PROPOSALS.ja.md` の設計を実装する（人の選択: 両方、結合表チェックから）。

## 結合表チェック

- `tools/angular-bindings-lib.ts`: `frontend-components.md` の `## UI Bindings` 節から ```yaml を取り出し `Bun.YAML.parse`。
  SDK の `ui-bindings.ts`（zod）を手書きの検証に、`validate-inputs.ts` の突き合わせをそのまま移植。結合マトリクスも出す。
  - レベル 1（表の中）: 形・ID・状態遷移・エラー種別・poll/path の書式・画面をまたいだ ID の重複
  - レベル 2（契約）: `apiSpecs:`（プロジェクト相対）か、無ければ `<record>/inception/contract-design/contract-summary.md` の ```yaml OpenAPI ブロック
  - レベル 3（デザイン）: `design:` の HTML（プロジェクト相対 → 記録 → refined-mockups の順で探す）
  - レベル 4: Code Generation 後のテンプレートの `data-ui-id`（code-summary.md で発火）、受け入れケースの `@ui-id`（受け入れ判定センサー側）
  - 相手が見つからない段は失敗にせず `not_checked` に書く
- センサー `angular-ui-bindings`（gate・advisory）。functional-design（`functional-spec.md` で発火し同じフォルダの `frontend-components.md` を読む）と code-generation（`code-summary.md`）に結合。
- コマンド `aidlc angular-bindings-check <frontend-components.md>`（結果とマトリクスを表示）。

## Excel パーサー

- `tools/angular-xlsx.ts`: 依存なしの xlsx 読み取り（ZIP の Central Directory、deflate は `node:zlib`、sharedStrings・inlineStr・数式の保存値・結合セルの展開）。
- `tools/angular-cases-lib.ts`: SDK の `subsystem-cases.ts`・`excel-to-test-ast.ts` の解釈部分を移植（ヘッダー検出・英日別名・`--alias`）。CSV と Markdown の表も同じ解釈。
- コマンド `aidlc angular-cases <file>... [--out <dir>] [--sheet <name>] [--alias 列名=項目]` → `angular-acceptance-cases.json` / `.md`。
- 受け入れ判定センサーの強化: 同じフォルダに `angular-acceptance-cases.json` があれば、ケース一覧をそこから取り、元ファイルの SHA-256 とケースのハッシュをセンサー自身が再計算して照合。ケースの `@ui-id` が結合表に無ければ指摘。
- build-and-test の Step 8a を、コマンドを使う手順に更新。

## 検査

- 合成 xlsx（テスト内で ZIP を組み立てる）・CSV・表の変換、SDK サンプルの変換結果が SDK の `subsystem-cases.json` と一致すること（手元で確認。フィクスチャは同梱しない）。
- 結合表: 各レベルの正例・負例、契約サマリーからの OpenAPI 抽出、テンプレート照合。
- プラグインのテスト・`bun run check`・smoke。
