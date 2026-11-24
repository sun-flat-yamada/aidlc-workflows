@AGENTS.md

## fork 運用（sun-flat-yamada/aidlc-workflows 固有。upstream には無い節）

このリポジトリは `awslabs/aidlc-workflows` の fork で、**`main` は upstream のミラー、独自変更は `fork/custom`（既定ブランチ）** に置く。
作業ブランチは `fork/custom` から切り、PR も `fork/custom` へ向ける（`main` にはコミットも PR マージもしない）。
AGENTS.md の「Branch from the latest `main`」は upstream への貢献の規約で、この fork での作業では `fork/custom` と読み替える。

**PR の作成先リポジトリは必ずこの fork（`sun-flat-yamada/aidlc-workflows`）にする。** fork では GitHub の UI・`gh` の既定の作成先が
親（upstream: `awslabs/aidlc-workflows`）になる。API/MCP では owner・repo にこの fork を明示し、`gh pr` には必ず `--repo sun-flat-yamada/aidlc-workflows` を付ける
（品質ゲートが fork の運用ファイル内の `--repo` の無い `gh pr` を検出する）。upstream への PR は、人が還元を決めたときだけ `main` から切ったブランチで出す。

- upstream の取り込み: `dev/fork-sync.sh`（週次の `.github/workflows/upstream-sync.yml`）。手順・初期設定は `dev/fork-sync.md` が正本。
- 変更の運用: `dev/change-dev.md`。**計画（`.devs/changes/<YYYY-MM-DD>_<slug>/implementation_plan.md`）を単独でコミットしてから実装** →
  `fork/custom` 向け PR → 品質ゲート（`.github/workflows/quality-gate.yml`）成功で `auto-merge.yml` が Rebase Merge。
  `CHG_DEV_AUTO_PILOT`（既定 true。`.github/change-dev.env`）が有効な間、計画の承認は待たず、PR は **draft でなく ready** で作る。止めるときは PR に `hold` ラベル。
- 品質ゲートは upstream 自身の検査を `dev/upstream-checks.sh`（install / `bun run check` / smoke）で走らせる。手元でも同じものを通す。
- `dev/fork-sync.sh`・`dev/change-dev.sh` を変えたら `dev/fork-sync-test.sh`・`dev/change-dev-test.sh` を通す。
- upstream のワークフロー（`.github/workflows/` の既存ファイル）は編集しない。fork で止めたいものは Actions の UI で無効にする（`dev/fork-sync.md` §3.1）。
