# 01. 導入手順（事前準備・インストール・初期設定・導入確認）

[← ルートガイドへ戻る](../../README.ja.md)

この手順では、`fork/custom-for-angular` の 2 つのプラグイン（`angular` と `codebase-atlas`）をビルドし、対象の Angular リポジトリに導入して動作確認するまでを具体的に説明します。

---

## 1. 前提ツール

人間がローカルマシンに用意するツールです。

| ツール | 必須 / 任意 | 要件・備考 |
| --- | --- | --- |
| AI ハーネス | 必須 | Claude Code / Codex CLI (`>= 0.145.0`) / Kiro IDE・Kiro CLI (`>= 2.24.1`, V2 は `>= 2.6.0`) / Cursor / opencode / GitHub Copilot CLI (`>= 1.0.74`) のいずれか |
| Git | 必須 | Codex CLI と Cursor は Git リポジトリ内でのみフックを認識するため、対象プロジェクトは `git init` 済みであること |
| Bun | 必須（ビルド時） | この fork から `dist/plugins/` を生成するために必要（[bun.sh](https://bun.sh/)） |
| Node.js / Angular CLI | 必須（対象プロジェクト側） | 対象 Angular リポジトリの `node_modules` が `npm ci` 等で導入済みであること。Angular CLI MCP を使う場合は `@angular/cli >= 20.2` |
| Python 3.11+ / `uv` + `graphify` | 任意 | `codebase-atlas` で独立ファイル数え直し（`atlas-coverage`）を有効にする場合のみ必要 |

---

## 2. AI-DLC 本体の導入とプラグインのビルド

### 2-1. AI-DLC 本体（`aidlc` CLI）のインストール

macOS / Linux / WSL:

```bash
curl -fsSL https://github.com/awslabs/aidlc-workflows/releases/latest/download/install.sh | sh
```

Windows PowerShell（通常の PowerShell ウィンドウで実行）:

```powershell
irm https://github.com/awslabs/aidlc-workflows/releases/latest/download/install.ps1 | iex
```

導入後、バージョンが表示されることを確認します。

```bash
aidlc version
```

> **補足（手動コピー方式を使う場合）**: ネイティブ版を入れられない場合は、`aidlc-copy-runtime-X.Y.Z.tar.gz` から `runtime/<harness>/` をプロジェクトへコピーする方式も利用できます（詳細は [`docs/guide/18-install-and-lifecycle.md`](../guide/18-install-and-lifecycle.md)）。手動コピー版では以降の `aidlc <コマンド>` を `bun <harness-dir>/tools/aidlc.ts <コマンド>` に読み替えてください。

### 2-2. この fork からプラグインをビルドする

`fork/custom-for-angular` を取得し、全ハーネス向けのプラグイン配布物（`dist/plugins/<name>/<harness>/`）を生成します。

```bash
git clone -b fork/custom-for-angular https://github.com/sun-flat-yamada/aidlc-workflows.git
cd aidlc-workflows
bun install --frozen-lockfile
bun scripts/package.ts
```

生成後、2 つのプラグインの妥当性を検証します。

```bash
bun dist/claude/.claude/tools/aidlc-plugin-validate.ts plugins/angular
bun dist/claude/.claude/tools/aidlc-plugin-validate.ts plugins/codebase-atlas
```

**確認すること**:

- `dist/plugins/angular/` と `dist/plugins/codebase-atlas/` 配下に、利用するハーネス用のディレクトリが生成されていること。
- 2 つの `aidlc-plugin-validate.ts` コマンドがいずれも終了コード `0`（エラーなし）で完了すること。

---

## 3. 対象 Angular プロジェクトでの AI-DLC 初期設定

対象の Angular プロジェクトのルート（`angular.json` があるディレクトリ）へ移動し、`aidlc config` を実行します。

```bash
cd /path/to/your-angular-app
aidlc config
```

AI-DLC は上位ディレクトリへ `.git` を遡らず、**実行したディレクトリに `aidlc/` とハーネスディレクトリ（`.claude/` 等）を作成**します。対話プロンプトでハーネスと既定設定（またはカスタム設定）を選択してください。

---

## 4. ハーネス別のプラグイン導入手順

以下の `<aidlc-fork>` は手順 2-2 で clone した `aidlc-workflows` のパス、`<project>` は対象 Angular プロジェクトのパスに読み替えてください。

### Claude Code

Claude Code のセッション内で以下を実行します。

```text
/plugin marketplace add <aidlc-fork>/dist/plugins
/plugin install aidlc-angular@aidlc-plugins
/plugin install aidlc-codebase-atlas@aidlc-plugins
```

実行後、**新しいセッションを開始**してください。プラグイン同梱の `SessionStart` フックが自動で合成（compose）を行います。

### Codex CLI

```bash
codex plugin marketplace add <aidlc-fork>/dist/plugins
codex plugin add aidlc-angular@aidlc-plugins
codex plugin add aidlc-codebase-atlas@aidlc-plugins
```

実行後、新しいセッションを開始すると自動で合成されます。

### Kiro IDE / Kiro CLI v3

Kiro はプラグインストアを持たないため、`kiro-ide/` 投影の `.kiro/` フォルダをプロジェクトへコピーしてから同期します。

```bash
cp -r <aidlc-fork>/dist/plugins/angular/kiro-ide/.kiro <project>/
cp -r <aidlc-fork>/dist/plugins/codebase-atlas/kiro-ide/.kiro <project>/

AIDLC_PLUGIN_ROOT="<project>/.kiro/aidlc-plugins/angular" \
  AIDLC_PROJECT_DIR="<project>" AIDLC_HARNESS_DIR=.kiro \
  aidlc engine plugin sync

AIDLC_PLUGIN_ROOT="<project>/.kiro/aidlc-plugins/codebase-atlas" \
  AIDLC_PROJECT_DIR="<project>" AIDLC_HARNESS_DIR=.kiro \
  aidlc engine plugin sync
```

### Kiro CLI (V2)

`kiro/` 投影を使い、同様にコピーと同期を実行します（`aidlc` コマンドが無い場合は `bun "<project>/.kiro/aidlc-plugins/<name>/hooks/compose.ts"` で代替できます）。

```bash
cp -r <aidlc-fork>/dist/plugins/angular/kiro/.kiro <project>/
cp -r <aidlc-fork>/dist/plugins/codebase-atlas/kiro/.kiro <project>/

AIDLC_PLUGIN_ROOT="<project>/.kiro/aidlc-plugins/angular" \
  AIDLC_PROJECT_DIR="<project>" AIDLC_HARNESS_DIR=.kiro \
  aidlc engine plugin sync

AIDLC_PLUGIN_ROOT="<project>/.kiro/aidlc-plugins/codebase-atlas" \
  AIDLC_PROJECT_DIR="<project>" AIDLC_HARNESS_DIR=.kiro \
  aidlc engine plugin sync
```

### プロジェクト側での有効化確認（全ハーネス共通）

インストール済みプラグインと有効化状態を確認します。

```bash
aidlc engine plugin list
```

もし `angular` または `codebase-atlas` が無効になっていれば、以下で明示的に有効化して再同期します。

```bash
aidlc engine plugin select aidlc,angular,codebase-atlas
aidlc engine plugin sync
```

---

## 5. Angular CLI MCP サーバーの設定（任意・推奨）

対象プロジェクトに `@angular/cli >= 20.2` が入っている場合、Angular CLI 内蔵の MCP サーバーを登録すると、既存解析とコード生成で `list_projects`・`get_best_practices`・`onpush_zoneless_migration` が決定的に使えるようになります。

先に `--dry-run` で書き込み内容を確認してから適用します。

```bash
aidlc angular-mcp --dry-run
aidlc angular-mcp
```

このコマンドが登録する内容は `npx --no-install ng mcp --read-only --local-only`（ローカル実行・パッケージ自動取得なし・読み取り専用・オフライン）です。同名の別設定がすでにある場合は上書きしません。

| ハーネス | 自動書き込み先（プロジェクト相対パス） |
| --- | --- |
| Claude Code (`.claude`) | `.mcp.json` |
| Kiro (`.kiro`) | `.kiro/settings/mcp.json` |
| Cursor (`.cursor`) | `.cursor/mcp.json` |
| Codex CLI (`.codex`) | `.codex/config.toml` |
| その他（opencode / Copilot 等） | 自動書き込みなし。`aidlc angular-mcp --print` で出力される JSON をホスト設定へ手動追加 |

設定を戻したい場合は以下を実行します。

```bash
aidlc angular-mcp --remove
```

---

## 6. `graphify` の導入（任意・網羅検算用）

`codebase-atlas` プラグインで「既存ソースファイルの全数に対する網羅性チェック（`atlas-coverage`）」を使う場合のみ、検証済みコミットに固定して `graphify` を導入します。

```bash
uv tool install git+https://github.com/sun-flat-yamada/graphify@14f35e381cab8d0ae10824a336114a907c288146
```

> **補足**: `graphify` を入れなくてもワークフロー自体は止まりません。未導入の場合は `reverse-engineering` で「独立ファイル数え直しを省略した」旨が 1 行表示され、`atlas-coverage` は `not_checked` として通過します。なお `aidlc atlas-graph build` は `GRAPHIFY_BACKEND=none` を付けて実行するため、LLM 呼び出しや外部送信は一切行いません。

---

## 7. 導入確認チェックリスト

対象 Angular プロジェクトのルートで以下を実行します。

```bash
aidlc doctor
aidlc engine plugin list
aidlc --help
```

チャット内からは `/aidlc --doctor`（Codex は `$aidlc --doctor`）でも同じ検査ができます。

**確認すること**:

- [ ] `aidlc doctor` で `angular` プラグインの必須 4 ファイルが PASS していること
  - `sensors/aidlc-angular-test-integrity.md`
  - `sensors/aidlc-angular-acceptance-gate.md`
  - `tools/aidlc-sensor-angular-test-integrity.ts`
  - `tools/aidlc-sensor-angular-acceptance-gate.ts`
- [ ] `aidlc doctor` の `Angular CLI MCP server configured` が PASS していること（MCP を使わない場合は advisory のまま無視して問題ありません）
- [ ] `aidlc engine plugin list` に `angular` と `codebase-atlas` が有効として表示されること
- [ ] `aidlc --help` にプラグインコマンド 4 つが表示されること
  - `angular-mcp`
  - `angular-cases`
  - `angular-bindings-check`
  - `atlas-graph`

---

**次のステップ**: [02. 人間が用意する入力物と配置場所](02-inputs.ja.md)
