# fork 運用の整備（upstream 取り込み・change-dev・品質ゲート・自動マージ）

## 目的

`sun-flat-yamada/aidlc-workflows`（`awslabs/aidlc-workflows` の fork）を、upstream の更新を取り込み続けながら
独自に開発できる状態にする。仕組みは `sun-flat-yamada/reverse-spec-flow` で整備済みのもの
（参照元は `sun-flat-yamada/github-copilot-dashboard` の change-dev）を移植し、このリポジトリのツールチェーン（Bun / TypeScript）に合わせる。

## ブランチ構成

- `main`: upstream `main` のミラー（fast-forward のみ）
- `fork/custom`: 独自変更。既定ブランチ。作業ブランチの PR はここへ

## 変更（すべて upstream に無いパス、または既存ファイルへの節の追加）

| ファイル | 内容 |
|---|---|
| `dev/fork-sync.sh` / `dev/fork-sync-test.sh` / `dev/fork-sync.md` | upstream 取り込み（main の fast-forward ＋ `sync/upstream-<sha>` の merge）。upstream の URL を差し替えて移植 |
| `.github/workflows/upstream-sync.yml` | 週次で取り込み PR を作る。`gh pr` は必ず `--repo`。upstream がワークフローを持つので `SYNC_TOKEN` を必須として文書化 |
| `dev/change-dev.sh` / `dev/change-dev-test.sh` / `dev/change-dev.md` / `.github/change-dev.env` | 計画先行・Auto-Pilot。そのまま移植 |
| `dev/upstream-checks.sh` | upstream 自身の検査（install / `bun run check` / smoke）を段ごとに PASS/FAIL で出す |
| `.github/workflows/quality-gate.yml` | PR 作成先の固定検査・運用スクリプト検査・plan-check・upstream-checks（base で通る段が head で落ちたときだけ赤） |
| `.github/workflows/auto-merge.yml` | 品質ゲート成功で Rebase Merge。`.github/`・`dev/*.sh`・`package.json` などゲートの中身を決めるファイルを変える PR と取り込み PR は除外 |
| `CLAUDE.md` | fork 運用の節を追記（upstream の 1 行 `@AGENTS.md` は残す） |

## 方針

- upstream の既存ファイル（特に `.github/workflows/`）は編集しない。fork で不要なワークフロー（Preview Release の nightly など）は UI で無効化する。
- upstream の CI は `main` 向けにしか走らないため、`fork/custom` の品質ゲートは PR CI の Linux 部分（check ＋ smoke）に絞る。

## 検証

- `dev/fork-sync-test.sh`・`dev/change-dev-test.sh` が PASS
- `dev/upstream-checks.sh` を手元で実行し、upstream `main` のままの状態で PASS を確認
- この PR 自身で品質ゲートが走ること（`.github/` を変えるので自動マージはされず、人がマージする）
