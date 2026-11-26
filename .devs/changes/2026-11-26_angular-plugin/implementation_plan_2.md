# 実装計画（追加）: Angular CLI MCP サーバーの活用と、Excel パーサー・結合表チェックの取り込み方

## 依頼

1. Angular 用 MCP サーバーの活用を検討し、効果がある場合は盛り込む。使用時はローカル実行させる。
2. Excel パーサーをどう取り込むべきかを示す。
3. 結合表の機械チェックをどう取り込むべきかを示す。

## 1. MCP（実装する）

- 対象は Angular CLI 内蔵の `ng mcp`（Angular CLI 20.2 以降。22.3 で 9 ツール・`--read-only`・`--local-only`・`--root` を実測）。
- AIDLC のプラグイン配布物は MCP 設定を運べない（emitter が `.mcp.json` を出さない。core を変えると upstream と衝突する）。
  そこで本人が実行するコマンド `aidlc angular-mcp` をプラグインの `commands` で足し、ハーネスごとのプロジェクト MCP 設定に書く。
  - 起動: `npx --no-install ng mcp --read-only --local-only`（プロジェクトに入っている CLI をそのマシンで stdio 起動。ダウンロードしない・ネットに出ない・プロジェクトを変えない）。Windows は `cmd /c npx ...`。
  - 対応: `.mcp.json`（Claude Code）・`.kiro/settings/mcp.json`・`.cursor/mcp.json`・`.codex/config.toml`。他は設定片を表示する。
  - 同名の別設定は上書きしない。`--dry-run` / `--remove` / `--print`。
- doctor チェック（`tools/angular-doctor.ts`）: 配布物の存在（error）と、Angular ワークスペースで MCP 未設定なら advisory。
- 使いどころ: reverse-engineering（`list_projects`・`onpush_zoneless_migration`）、code-generation の委譲（`list_projects` → `get_best_practices`）、developer の knowledge。

## 2・3. Excel パーサー・結合表チェック（設計を示す。実装は依頼を受けてから）

`plugins/angular/PROPOSALS.ja.md` に置く。

## 検査

- プラグインのテストにコマンド・doctor の検査を追加（JSON/TOML の追加・冪等・他設定の保持・同名の別設定を上書きしない・削除）。
- 実機の Angular 22 ワークスペースで `ng mcp --read-only --local-only` の `list_projects` / `get_best_practices` を確認。
