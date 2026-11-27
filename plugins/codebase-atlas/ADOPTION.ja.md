# Codebase Atlas から取り込んだもの・取り込まなかったもの

取り込み元: `sun-flat-yamada/codebase-atlas` main `6dd5c39`（reverse-spec-flow 2.2.1 ＋ graphify。GP-108）。
取り込み先: AI-DLC の Inception `reverse-engineering`（codekb の 9 成果物）。`core/`・`harness/` は変えず、このプラグインだけで足す。

## 位置づけ

Codebase Atlas は「既存コードから AI エージェント向けの仕様書を起こす」独立したフレームワークで、
`init.sh` が別リポジトリを作り、Phase 0〜4 のパイプラインと `gates.sh` で仕上げる。
AI-DLC は同じ仕事を `reverse-engineering` 段（codekb）で行い、後段（要件・設計・実装）がそれを読む。
**仕組みを二重に持たないため、Codebase Atlas のパイプラインは持ち込まず、AI-DLC の reverse-engineering に欠けている
「正しさ」と「網羅」の担保だけを移した。** Angular 版で「コードから設計書を逆生成する skill」を見送った理由
（reverse-engineering と重複する）と同じ線引きで、こちらは重複ではなく reverse-engineering そのものを強くする方向にした。

## 取り込んだもの

| Codebase Atlas | このプラグイン | 理由 |
|---|---|---|
| graphify による分母の独立な検算（GP-108・`atlas_graph.py build`・`G-GRAPHIFY`） | `aidlc atlas-graph build` と センサー `atlas-coverage`。`component-inventory.md` の `**Paths**:` 行（Atlas の code-graph.md の「パス」列に相当）と突き合わせる | AI-DLC の Scope of Analysis は「深く読んだ範囲」を記録するが、**全ファイルがどこかに割り当てられたか**は誰も数えていない。`kind: full` が自己申告のまま通る |
| 最長一致・ルート全体のパスは被覆に数えない（`BROAD`）・未対応言語は対象外と明示 | 同じ規則を TS に移植 | 「`./` を 1 つ書いて通す」抜け道を塞ぐ |
| graphify の検証済みコミットへの固定（`GRAPHIFY_TESTED_REF`） | 同じコミットを `atlas-lib.ts` に固定し、`build-info.json` に記録。グラフが古ければ警告 | 版が変わると数え方が変わり、分母が黙って変わる |
| 解析対象を変更しない（SB-5）・前後の状態の比較 | `build` の前後で `git status` を比べる（`aidlc/` を除く） | 出力は AI-DLC 自身の `aidlc/` に置く（Atlas の「解析対象の外」に相当。指紋の対象外） |
| 根拠の `path:line`（SB-1・SB-3・GP-4） | センサー `atlas-citations`（引用先のファイルと行の実在）と手順・知識 | AI-DLC の雛形で行番号を求めるのは Handoff の 1 項目だけ。後段のエージェントが codekb を鵜呑みにする |
| 事実と推測の分離（SB-4）・UNKNOWN（GP-5）・全称の主張は数えたときだけ（GP-5 ルール10・GP-103 ルール7） | `atlas-evidence-guide.md` §2 | 埋めた推測は後で誰も疑わない |
| 進化途上コード（SB-13）・動的配線（SB-6） | 同 §3 | 新旧 2 系統の「単一化」、配線の無い型を「動く」と書く誤りは実運用で繰り返し出た |
| 分母の考え方（SB-2・SB-11・GP-2 ルール8/9: 目印の系統・2 経路の検算・件数一致≠集合一致・範囲の自己縮小禁止） | 同 §4 | スタック非依存の原則なのでそのまま移せる |
| 停止の量を決める（GP-103 の考え方） | 公開前の `check` は最大 3 回。残りは人への未解決点として出す | 修正の無限ループを防ぐ |

**graphify は任意。** 入っていなければ `atlas-coverage` は `not_checked` を返して通り、段は従来どおり進む（Atlas の `CODE_GRAPH_TOOL=none` に相当）。
人には「独立の数え直しは今回は省略した」と 1 行だけ伝える（AI-DLC の「省いたことは一度だけ言う」原則）。

## 取り込まなかったもの

| Codebase Atlas | 理由 |
|---|---|
| `init.sh` が作る別リポジトリ・Phase 0〜4 のパイプライン・`spec-extraction/` 一式 | AI-DLC は状態・記録・承認ゲートをエンジンが持つ。同じ仕事の 2 本目の流れになる |
| ISO/IEC/IEEE 29148 準拠の章立て・`specs/` の仕様書群 | 要求の文書化は AI-DLC の requirements-analysis 以降が担う。codekb は「現状の理解」の層 |
| 密度ゲート（GP-20〜22）・Extract→Verify→Repair・fabricated=0 | 機構が大きく、別エージェントの検証ラウンドを回す仕組みが要る。AI-DLC の reverse-engineering は 2 リンクのパイプラインで、プラグインからリンクを足せない |
| 別エージェントによる意味の反証検証（GP-16・検証官の隔離） | 同上。決定的に確かめられる「引用の実在」だけを取り、「その行が主張を支えるか」は人のゲートとレビュー役に残した（今後の候補） |
| rebuild 層（GP-13）・`rebuild-readiness` | 再構築の本質仕様は AI-DLC では Inception 以降の設計がその役 |
| `gates.sh`（Phase 1/3/4 の完了条件） | AI-DLC ではセンサーがゲートの証拠を出す。同じ点検をセンサーとして移した |
| ホスト層（`hosts/`・`HOST.md`・`verifier-guard.sh`） | AI-DLC の `harness/` と役割が重なる |
| GP/SB/FB の台帳・`next-id.sh`・還元手順 | フレームワーク本体の運用の仕組みで、利用先には要らない |
| Tier/HOLD（GP-106）・セッション継続（GP-28・GP-100・GP-101） | AI-DLC のエンジン（状態・Guard Policy・中断からの再開）が持つ |
| Auto-Pilot（`scripts/automerge.py`） | この fork は `dev/change-dev.*` と `auto-merge.yml` で同じことをしている |
| スタック別 Playbook（`playbooks/<stack>/enumeration.md`・`gate-snippets.sh`） | 列挙コマンドが Atlas の `gate-snippets.sh`・`code-graph.md` のノード種別と一体で、そのままでは動かない。原則（目印の系統・2 経路）は知識へ移した。レガシースタック（VB6・COBOL・Struts など）を扱う案件が来たら、`aidlc` コマンド化して別途取り込むのが候補 |
| 逆引き索引（`specs/source-index.md`） | codekb の鮮度は AI-DLC の `codekb-scope-diff`（指紋）が担う |

## 取り込みで見つけた Codebase Atlas 側の問題

- `atlas_graph.py build` が実行する `graphify cluster-only` は、API キーか `claude` CLI があるとコミュニティ名を **LLM で付ける**
  （実測: graphify 0.9.119。`[graphify label] ... naming communities via the claude CLI`）。「LLM なし・決定的」の前提に反し、
  ソースの断片が外部へ出うる。このプラグインは `GRAPHIFY_BACKEND=none` で止めている。Atlas 側も同じ対処が要る。
