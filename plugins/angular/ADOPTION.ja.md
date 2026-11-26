# ai-dlc-sdk-angular からの取り込み一覧

`sun-flat-yamada/ai-dlc-sdk-angular`（Angular 22 のフロントパネル GUI 向けに、Copilot CLI で
「実装 → ゲート → 修正」を最大 N 回回し、人が書いた Excel 試験仕様を最終ゲートにする SDK）のうち、
AI-DLC に取り込んだもの・取り込まなかったものとその理由。

**方針**: `core/` と `harness/` には手を入れず、すべて `plugins/angular/` に足した。
プラグインは「足すだけで上書きしない」仕組みなので、`fork/custom-for-angular` は upstream の取り込みで衝突しない。
AI-DLC にはすでにエンジン（どの段に進むか・承認の記録）と conductor（作業の割り振り）があるため、
SDK のうち**それと役割が重なる実行基盤は取らず、Angular 固有の知見と検査だけを取った**。

## 取り込んだもの

| SDK の要素 | 取り込み先 | 補足 |
|---|---|---|
| Angular の実装規約（standalone・`OnPush`・`inject()`・signals・`input()`/`output()`・`@if`/`@for`・zoneless 追従） | `memory/rules.md`・`knowledge/aidlc-developer-agent/angular-implementation-guide.md` | 「プロジェクトの Angular バージョンに従い、機能変更の中で上げない」を足した |
| REST は既存の API クライアント経由・型付きエラー、`operationId` ごとに 1 メソッド | 同上 | SDK 固有のクラス名（`ApiClient` 等）は「プロジェクトの API クライアントラッパー」に一般化 |
| `data-ui-id` を唯一のセレクタにする規約 | 規約・ガイド・build-and-test の寄与 | |
| `ui-bindings.yaml`（UI 要素 ⇄ API 操作 ⇄ 状態 ⇄ エラー処理の結合） | functional-design の寄与（`frontend-components.md` の `## UI Bindings` 節） | 独立ファイルではなく既存の成果物の節にした（後述） |
| 入力が食い違ったときの優先順位（振る舞い＝bindings、見た目＝デザイン、通信形式＝OpenAPI） | 規約・functional-design の寄与・ガイド | |
| 変更影響マップと境界ゾーン（immutable / extensible=追記のみ / rebuildable / deletable） | code-generation の寄与（計画の `## Change Impact Map`） | ゾーンは計画の中で宣言する形にした（後述） |
| build → lint → unit(+coverage) を緑になるまで回す、閾値 80/70/80/80 | `memory/phases/construction.md`・code-generation の寄与 | |
| 人が書いた受け入れ試験仕様を最終ゲートにする（1 ケース 1 テスト、`[<case id>]` タイトル、期待値は変えない、skip 不可、ケースファイルのハッシュ不変） | build-and-test の寄与・センサー `angular-acceptance-gate`・`knowledge/aidlc-quality-agent/` | Excel 列の記法（`@ui-id`、モック応答、期待 API リクエスト）はガイドに記載 |
| テストの骨抜き禁止（`.skip`/`.only`/`xit`/`fit`/`test.fixme`/`waitForTimeout`/`force: true`） | 規約・センサー `angular-test-integrity` | SDK では skill の文章だけだった部分を、決定的な検査にした |
| 失敗の分類（B 境界 / D デザイン未反映 / A API 契約の誤読 / R 再利用の破れ / T テスト欠陥 / E 環境）と最小修正、同じ修正の再試行禁止 | build-and-test の寄与・品質ガイド | |
| （SDK には無いが追加）Angular CLI の MCP サーバー（`ng mcp`） | コマンド `aidlc angular-mcp`・reverse-engineering と code-generation の寄与・developer の knowledge・doctor | 後述「Angular CLI MCP サーバー」 |
| 反復の上限（最大 N 回） | build-and-test の寄与（同じケースが 3 回直らなければ人に戻す） | ループを回す道具ではなく「止めて人に渡す」規律として取り込んだ |

## 取り込まなかったもの

| SDK の要素 | 理由 |
|---|---|
| Copilot CLI アダプター（`copilot -p` の起動・プロンプトファイル・使用量の取得） | AI-DLC は 7 つのハーネス（Claude Code・Kiro・Codex・Cursor・opencode・Copilot など）で同じ中核を動かす設計で、特定 CLI の起動は各ハーネスが持つ。Copilot 向けにはすでに `harness/copilot/` がある |
| 独自オーケストレーター（準備 → 反復 i=1..N → 後処理を自動で回す `full-loop`） | AI-DLC ではエンジンが次の段を決め、conductor が作業を割り振り、人がゲートで判断する。自動で N 回回す別ループを足すと「進め方の持ち主」が二重になり（AGENTS.md の One owner per rule に反する）、人が舵を握る原則とも衝突する。上限と失敗の扱いだけを規律として取った |
| git diff による境界ガードの自動リバート（違反ファイルを丸ごとベースラインに戻す） | 一度書いた作業をツールが黙って消す破壊的な動作で、AI-DLC の「ガードは次の一手を示して止めるだけ、人の作業や設定を勝手に変えない」に反する。追記可能なファイルでは正しい追記まで消える欠点も SDK 自身が書いている。代わりに計画の影響マップで宣言し、失敗分類 B で直させる |
| `boundary-policy.yaml` という独立の設定ファイルとグロブ照合 | プロジェクトごとにパスが違い、AI-DLC には既にプロジェクト規約（`memory/project.md`）と計画承認がある。ゾーンは Code Generation の計画に書き、人が承認する形にした。機械照合が必要になったら、計画の表を読むセンサーとして足せる |
| Excel パーサー（`excel-to-test-ast.ts`、`exceljs` 依存） | AI-DLC の配布物は実行時に Bun 標準以外の依存を持たない。依存なしで読む取り込み方を [PROPOSALS.ja.md](PROPOSALS.ja.md) に設計した（未実装） |
| `ui-bindings.yaml` の JSON Schema と Gate 0（HTML・OpenAPI・Excel との突き合わせ） | 突き合わせの相手の置き場所がプロジェクトごとに違い、AI-DLC の成果物とも形が違う。4 段に分けて相手が見つかった段だけ走らせる取り込み方を [PROPOSALS.ja.md](PROPOSALS.ja.md) に設計した（未実装） |
| `ui-bindings.yaml` を独立した成果物にすること | プラグインが per-Unit の段に足す成果物は、その段の全 Unit 種別（service・library を含む）で必須になる。UI のある Unit だけが作る既存の `frontend-components.md` の節にすれば、UI のない Unit を邪魔しない |
| QCD ベンチマーク（人の開発との品質・コスト・納期比較、`human-qcd.json`） | 同じ要件を人でも開発した実験用の比較で、通常の開発では基準データが無い。AI 使用量の記録は AI-DLC 側に別の仕組み（usage ledger）がある |
| 逆生成ドキュメント skill（再利用/差分アーキテクチャ・画面と状態・API シーケンス・要件⇄テストの 4 軸） | AI-DLC は設計を先に作ってから実装する順序で、同じ内容（コンポーネント、状態遷移、契約、トレーサビリティ）が functional-design・contract-design・traceability.json に既にある。既存コードからの逆生成は reverse-engineering 段が担う |
| インストーラー（`install.ts`。別の Angular リポジトリへコピー） | AI-DLC にはハーネスごとのプラグイン配布（マーケットプレイス・フォルダ投入と compose）がある |
| サンプルアプリ（800×480 のフロントパネル、ブザー音 `beep`、`PanelStatusService` などの組み込み機器固有の制約） | 特定製品の前提で、Angular 一般には当てはまらない。チームが必要なら自分の `memory/team.md` や `knowledge/` に書く |
| リポジトリ衛生（secret scan スクリプト、Dependabot、Prettier/EditorConfig、Issue/PR テンプレート、Copilot 用 `copilot-instructions.md`、`.github/skills/` の配置） | AI-DLC には upstream の CI・セキュリティスキャン・テンプレートが既にある。skill の中身は上の各取り込み先に移した |

## Angular CLI MCP サーバー

Angular CLI 20.2 以降に内蔵の MCP サーバー（`ng mcp`）を、効果のあるツールに絞って使う。

| ツール | 判断 | 理由 |
|---|---|---|
| `list_projects` | 使う（reverse-engineering・code-generation） | `angular.json` からアプリ/ライブラリ・ソースルート・Angular のバージョンを決定的に返す。推測が要らない |
| `get_best_practices` | 使う（code-generation） | インストール済みの Angular バージョンに合ったベストプラクティスを返す。プラグインの静的なガイドは版が進むと古くなる |
| `onpush_zoneless_migration` | 使う（reverse-engineering） | OnPush/zoneless 化が済んでいない箇所の分析。既存コードの変更検知の負債を事実として記録できる |
| `search_documentation` | 使わない（`--local-only` で外す） | angular.dev へ問い合わせる。ローカル実行の指示に合わせてネットに出ない構成にした |
| `run_target`・`devserver_start`/`stop` | 使わない（`--read-only` で外す） | ビルド・テスト・開発サーバーは各段が自分のコマンドで実行し、その出力を証跡にしている。経路が二重になる |
| `devserver_wait_for_build`・`ai_tutor` | 有効だが流れでは使わない | 開発サーバーを起動しない構成では使い道が無い／人向けの学習機能 |

- **ローカル実行**: `npx --no-install ng mcp --read-only --local-only` を stdio で起動する。プロジェクトに入っている CLI を
  その人のマシンで動かし、何もダウンロードせず、ネットにも出ず、プロジェクトのファイルも変えない。
- **配り方**: AI-DLC のプラグインは MCP 設定を配布物に載せられない（core を変えると upstream と衝突する）ため、
  本人が `aidlc angular-mcp` を実行したときだけハーネスのプロジェクト MCP 設定に書く。同名の別設定は上書きせず、`--remove` で戻せる。
  `/aidlc --doctor` は Angular ワークスペースで未設定のとき advisory で知らせる。
