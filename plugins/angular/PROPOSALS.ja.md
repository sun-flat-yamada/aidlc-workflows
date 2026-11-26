# 取り込み設計: Excel パーサーと結合表の機械チェック

`ai-dlc-sdk-angular` の 2 つの機構を、AI-DLC の決まり（配布物は実行時に Bun 以外の依存を持たない、`core/` を変えない、
ガードは人を止めずエージェントに次の一手を返す）を守ったまま angular プラグインに取り込む設計。
どちらも SDK のロジック（TypeScript）はそのまま移植でき、置き換えるのは依存ライブラリだけ。

## 共通の前提

- **置き場所はプラグインの `tools/`**。プラグインの道具は compose でハーネスの `tools/` にコピーされ、
  copy 版は Bun、native 版は `aidlc` バイナリで動く。どちらも `node_modules` を持たないので、
  `exceljs`（Excel）・`yaml`・`zod`（結合表）は使えない。
- **代わりに使えるもの**: `node:zlib`（`inflateRawSync`）・`node:crypto`・`Bun.YAML.parse`（core も使っている）。
- **人の入口はコマンド、エージェントへの戻りはセンサー**。人やエージェントが明示的に走らせるものは
  プラグインの `commands`（`aidlc <名前>`）、ゲート前に自動で確かめるものは `fire_on: gate` の advisory センサーにする。

---

## 1. Excel パーサー

### 形

| 項目 | 設計 |
|---|---|
| 入口 | コマンド `aidlc angular-cases <file> [--sheet <名前>] [--out <dir>]`（`tools/angular-cases.ts`） |
| 入力 | `.xlsx`（第一の形）・`.csv`・Markdown の表（同じ列名なら同じ結果） |
| 出力 | `angular-acceptance-cases.json`（構造化ケース＋元ファイルの SHA-256＋ケース全体のハッシュ）と、人が読む `angular-acceptance-cases.md` |
| 置き場所 | Build and Test の記録フォルダ（`<record>/construction/build-and-test/`）。センサーの副入力で、成果物（`produces`）にはしない |

### xlsx を依存なしで読む

xlsx は ZIP の中の XML なので、次の 3 段で読める（SDK の `exceljs` 部分だけを置き換える。約 250 行の見込み）。

1. **ZIP**: 末尾の End of Central Directory を探し、Central Directory から各エントリの位置を取る。
   圧縮方式 8（deflate）は `inflateRawSync`、0（無圧縮）はそのまま。ZIP64・暗号化は「対応外」と 1 行で返す。
2. **ブック**: `xl/workbook.xml` のシート名と `xl/_rels/workbook.xml.rels` で、シート名 → `xl/worksheets/sheetN.xml` を引く。
   `xl/sharedStrings.xml` の文字列表（リッチテキストの `<r><t>` は連結）を読む。
3. **シート**: `<c r="B3" t="s|str|inlineStr|b|n">` の値を行列に展開する。数式は保存済みの値（`<v>`）を使い、
   結合セルは `<mergeCell>` の左上の値を範囲に広げる（SDK の「大項目は下の行で空欄でよい」を満たす）。日付のシリアル値は数値のまま渡す。

XML は名前空間付きでも要素名と属性だけ拾えばよく、汎用 XML パーサーは要らない（正規表現＋エンティティ 5 種の復元）。

### 解釈（SDK から移植）

SDK の `lib/subsystem-cases.ts`（依存は `node:crypto` だけ）をそのまま移す。

- ヘッダー行の自動検出と英日の列名の対応（Test ID / テストID、Steps / 操作手順、API responses / API応答(モック)、
  Expected UI / 期待画面表示、Expected CSS / 期待CSS状態、Expected API request / 期待APIリクエスト、Notes / 備考）。
  追加の別名はチームの規約ではなく引数（`--alias "列名=項目"`）で渡す（プラグインは設定ロックを持てないため）。
- 手順の番号付き行、`METHOD /path -> status {json}` のモック、`METHOD /path {json 部分}` の期待リクエスト、
  `@ui-id { prop: value }` の期待 CSS、`@ui-id` 参照、`REQ-…` 等の要件 ID を構造化する。
- ケースのハッシュ（期待値を含む正規化 JSON の SHA-256）を出す。

### 流れへのつなぎ方

- **Build and Test の Step 8a** を「ケースファイルが xlsx/CSV/表なら、まず `{{INVOKE}} angular-cases <file>` を実行し、
  出力 JSON からテストを書く。期待値は JSON から読む（テストに写さない）」に変える。
- **`angular-acceptance-gate` センサーを強くする**: 今はエージェントが書いた `cases_sha256_before/after` を信じているが、
  `angular-acceptance-cases.json` に記録された元ファイルのパスとハッシュを**センサー自身が再計算**して照合する。
  ケース一覧もこの JSON から取り、エージェントの申告に頼らない。
- 結合表があれば、ケースの `@ui-id` が表に無いものを指摘する（下の結合表チェックのレベル 4）。

### 検査

- テストの中で `node:zlib` の `deflateRawSync` を使って最小の xlsx を組み立て（共有文字列・インライン文字列・数式・結合セル・
  日本語ヘッダー）、JSON 出力を期待値と比べる。SDK の `tests/excel.test.ts` の観点を移す。
- 実ファイル: SDK のサンプル `ST-NET-network-settings.xlsx` を変換し、SDK の `subsystem-cases.json` と一致することを確かめる
  （フィクスチャとしては同梱しない。業務語の混入を避けるため、テスト用は合成ファイルだけにする）。

### 見積もりと残る判断

- 約 1 日（ZIP/XML 読み取り・移植・テスト）。
- 決めてほしいこと: 出力 JSON を「センサーの副入力」に留めるか、Build and Test の成果物（`produces`）にして承認対象に含めるか。
  推奨は副入力（成果物にすると全プロジェクトで必須になり、ケースが無いチームの邪魔になる）。

---

## 2. 結合表（UI Bindings）の機械チェック

### 形

| 項目 | 設計 |
|---|---|
| 入口 | センサー `angular-ui-bindings`（`fire_on: gate`、advisory）＋同じ処理を人が走らせるコマンド `aidlc angular-bindings-check` |
| 結合先 | functional-design（寄与の `adds.sensors`）。発火は `frontend-components.md` のときだけ（他の成果物は素通り） |
| 読む物 | `frontend-components.md` の `## UI Bindings` 節の ```yaml ブロック（`Bun.YAML.parse`）、同じ Unit の `functional-spec.md`、契約（後述）、モックアップ HTML |
| 出力 | エラーは `findings` に数え、警告は `warnings` に並べる（advisory なので、どちらもゲート前にエージェントへ戻るだけで人は止めない） |

### 検査のレベル

SDK の `validate-inputs.ts`（Gate 0）を 4 段に分け、**相手が見つかった段だけ走らせる**。相手が無いのは失敗ではなく「確かめていない」と結果に書く。

| レベル | 相手 | エラー | 警告 |
|---|---|---|---|
| 1. 表の中だけ | なし（常に走る） | 形（`kind` の値、kebab-case の ID、画面をまたいだ ID の重複、`poll` の書式、`path` の JSONPath 形）／`initial` と全 `transition` が `states` にある／`errors` のキーが `default` か英小文字の種別 | ボタンに `on` が無い、入力に `bind` が無い、インジケーターに `source` も `map` も無い |
| 2. 契約 | OpenAPI（`apiSpecs:` に書いたパス、無ければワークスペースの `*.openapi.{yaml,yml,json}`）か `contract-summary.md` | `call` が `operationId` に無い／`request` のキーが要求スキーマに無い／`source.path` が応答スキーマに無い | 必須の要求プロパティが対応付けられていない／契約のエラー応答に結果が無い・結果に対応する応答が無い／どこからも呼ばれない操作（`x-ui-binding: shared` で除外） |
| 3. デザイン | `design:` のモックアップ HTML | 表の要素が `data-ui-id` として HTML に無い／HTML の `data-ui-id` が表にも `static` にも無い／HTML 内の重複 | — |
| 4. 実装・試験 | Code Generation 後のテンプレート、受け入れケース | （code-generation のゲートで）表の `ui-id` がテンプレートに `data-ui-id` として無い／（build-and-test で）ケースの `@ui-id` が表に無い | 表に無い `data-ui-id` がテンプレートにある |

- OpenAPI の `$ref` はファイル内（`#/components/...`）だけ解決し、外部参照は「確かめていない」とする。
- 要件 ID は Requirements Analysis の `requirements.md`（`FR`/`AC`）と照合する（警告）。
- 結果に「結合マトリクス」（画面 × 要素 × 操作 × 状態 × 要件）を Markdown で添え、レビューで読めるようにする（SDK の `binding-matrix.md`）。

### SDK からの移植

- `validate-inputs.ts` の突き合わせロジックはほぼそのまま移せる。`yaml` → `Bun.YAML.parse`、`zod` のスキーマ（`lib/ui-bindings.ts`）→
  手書きの検証関数（型ごとに 1 関数、約 120 行）に置き換える。JSON Schema の生成（`write-schemas.ts`）は要らない
  （表は Markdown の中にあり、エディタ補完の対象ではない）。
- 見積もり: 約 1.5 日（レベル 1〜3 とテスト）。レベル 4 はさらに 0.5 日。

### 決めてほしいこと

- **契約の置き場所**: AI-DLC の contract-design は `contract-summary.md`（文章）を作るが、OpenAPI ファイルは必須ではない。
  推奨は「OpenAPI があればそれと突き合わせ、無ければ `contract-summary.md` に書かれた operationId の一覧と照合する（形は寄与で指定する）」。
- **深刻度**: 推奨は advisory のまま（ゲート前にエージェントへ戻り、直してから承認に進む）。チームが望めば、
  センサーの深刻度を blocking にすると承認の前に必ず直すか人が上書きを選ぶ形になる（AI-DLC の仕組みで切り替えられる）。

---

## 進め方の提案

1. 結合表チェックのレベル 1・2 → 3 → 4（表を書く functional-design の直後に効くので、手戻りの削減が最も大きい）
2. Excel パーサーと、それを使った `angular-acceptance-gate` の強化
