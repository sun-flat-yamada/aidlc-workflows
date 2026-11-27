# 実装計画: Codebase Atlas の取り込み — `codebase-atlas` プラグイン

## 目的

`sun-flat-yamada/codebase-atlas`（reverse-spec-flow に graphify を組み込んだ、既存コード→仕様のフレームワーク。
取り込み時点の main は `6dd5c39`）の良いところを、AI-DLC の既存コード解析の段（Inception の `reverse-engineering`）に取り込む。

## 方針

- **`core/` と `harness/` は変更しない。** upstream の取り込みで衝突しないよう、AIDLC プラグイン `plugins/codebase-atlas/` として足す
  （`plugins/angular`（`fork/custom-for-angular`）と同じ形）。プラグインを外せば素の core に戻る。
- Codebase Atlas は「別リポジトリを作り、5 段のパイプラインで仕様書を起こす」独立したフレームワークで、
  AI-DLC の `reverse-engineering`（codekb の 9 成果物）と役割が重なる。**仕組みごとは持ち込まず、
  AI-DLC の reverse-engineering に欠けている「正しさ」と「網羅」の担保だけを移植する。**
  - 正しさ: 主張ごとに `path:line` の根拠、事実と推測の分離、確定できないことは `UNKNOWN`。引用の実在を機械で確かめる。
  - 網羅: 決定的な解析器（graphify。tree-sitter AST・LLM なし）が数えたソースファイルを分母にして、
    どのコンポーネントにも割り当てられていないファイルを機械で列挙する（Codebase Atlas の GP-108 / `G-GRAPHIFY`）。
- graphify は**任意**。入っていなければ網羅の検査は `not_checked` を返すだけで、段は今まで通り進む（必須の基盤にしない）。

## 取り込む項目と置き場所

| Codebase Atlas の要素 | 取り込み先 |
|---|---|
| graphify で分母を独立に数える（`atlas_graph.py build`） | コマンド `aidlc atlas-graph build`（TS に移植。出力は `aidlc/codebase-atlas/graph/<repo>/`。検証済みの graphify コミットに固定） |
| ノードの「パス」列との突き合わせ（`G-GRAPHIFY`・`crosscheck`） | `component-inventory.md` の各コンポーネントに `**Paths**:` 行を書かせ、センサー `atlas-coverage`（advisory, gate）とコマンド `aidlc atlas-graph check` で未割当ファイルを列挙 |
| 根拠の `path:line`（SB-1/SB-3/GP-4）・引用の実在確認 | センサー `atlas-citations`（advisory, gate。引用先のファイルと行の実在） |
| 事実/推測の分離（SB-4）・UNKNOWN（GP-5）・進化途上コード（SB-13）・動的配線（SB-6）・分母の考え方（SB-2/SB-11、目印の系統と 2 経路の検算） | `knowledge/aidlc-developer-agent/atlas-evidence-guide.md` と reverse-engineering への寄与（Step 1a / 2a / 3a） |

## 検査

- `plugins/codebase-atlas/tests/plugin.test.ts`: 内容の検証（`validatePluginContent`）、センサーの main(argv) 契約、
  引用・網羅の判定（フィクスチャ）、graph.json の読み方、Claude への合成（センサーが段に結び付き、Step が Completion Handoff より前に入る）。
- `bun tools/aidlc-plugin-validate.ts plugins/codebase-atlas`、`bun scripts/package.ts`、`bun scripts/package.ts --check`。
- graphify が入る環境では、このリポジトリ自身に対して `atlas-graph build` → `check` を実際に通す。
- `dev/upstream-checks.sh`（install / `bun run check` / smoke）。

## 取り込まないもの（理由は `plugins/codebase-atlas/ADOPTION.ja.md` と PR に書く）

`init.sh` が作る別リポジトリと 5 段パイプライン、29148 準拠の章立て、密度ゲート・Extract→Verify→Repair、rebuild 層、
`gates.sh`、ホスト層、GP/SB/FB の台帳と還元手順、Tier/HOLD、セッション継続の記録、Auto-Pilot、
スタック別 Playbook（`gate-snippets.sh` と一体で、そのままでは動かない）、別エージェントによる意味の反証検証。

## PR

base は `fork/custom`（スタック非依存の取り込みなので Angular 版ではなく本流に入れる）。Auto-Pilot に従い ready で作る。
