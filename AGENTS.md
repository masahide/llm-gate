# Repository Guidelines

## Project Structure & Module Organization
- `src/` は `basic.ts` を起点とした実行コード、LM Studio 向け HTTP ヘルパー (`lmstudio.ts`) 、Zod schema を含む構造化出力パーサ (`structured-output.ts`) を収めています。
- `tests/` に `.test.ts` ファイルを置くと `vitest` がそれらを読み込み、構造化出力やレスポンス解析ロジックを検証できます。
- `scripts/` にはフォーマットチェック・整形用の Node スクリプトがあり、`dist/` や一時ディレクトリは `.gitignore` で除外。`docs/` は説明資料や今後のアーキテクチャメモ用です。
- 依存関係管理は `package.json`/`pnpm-lock.yaml` で行い、`node_modules/.pnpm` 以下の各バージョンにバンドルされます。

## Build, Test, and Development Commands
- `pnpm install`: `packageManager` 指定とロックファイルを使って開発依存を構築。
- `pnpm dev`: `tsx src/basic.ts` を起動し、LM Studio へのリクエスト/レスポンスの流れを手早く確認。
- `pnpm format`: `scripts/format.mjs` で改行やインデントを統一。
- `pnpm format:check`: 現在のファイルセットがフォーマットルールに従っているか検証。
- `pnpm typecheck`: `tsc --noEmit` で型エラーを網羅。
- `pnpm test`: `vitest run` が `vitest.config.ts` を使って `tests/**/*.test.ts` を Node 環境で実行し、構造化出力の Zod schema との整合性やレスポンス処理を検証。
- `pnpm test:watch`: ファイル変更で再実行するウォッチモード。
- `pnpm check`: `format:check`→`typecheck`→`test` の順で品質を確認する一括コマンド。

## Coding Style & Naming Conventions
- TypeScript（`tsconfig.json` で `ES2022` + `NodeNext`）、2 スペースインデント、`camelCase` 関数/変数名、ファイルは小文字で構成します。
- モジュールは常に `import`/`export` で組み、`structured-output.ts` では Zod schema (`structuredSchema`) を使って構造化 JSON を検証するパターンを踏襲。
- 追加ライブラリを導入する場合は `pnpm` スクリプトから呼び出すか、`scripts/` と `vitest.config.ts` に設定を反映させてください。

## Testing Guidelines
- `tests/*.test.ts` を `vitest` + `expect` で記述。`describe`/`test` で機能を分割し、`vitest.config.ts` は `node` 環境・`tsconfig.test.json` を参照。
- `parseStructuredText` や `extractOutputText` のような純粋関数を対象にし、成功/失敗パスを両方書いて Zod の `issues` を確認。
- テスト追加時は `pnpm test` で実行し、必要なら `pnpm test:watch` で反応確認。カバレッジは `vitest run --coverage` で取得できます。

## Commit & Pull Request Guidelines
- コミットメッセージは「何を」「なぜ」を簡潔に記述し、`pnpm check` や `pnpm test` を実行した記録を残す。
- PR には目的、実行したコマンド（例: `pnpm format && pnpm check`）、関連 Issue、再現手順（環境変数など）、スクリーンショット/ログを入れてレビューしやすく。
- 依存追加やコマンド変更があれば `pnpm-lock.yaml` も一緒に更新し、`pnpm install` 後に差分が出ない状態にしてください。

## Security & Configuration Tips
- `basic.ts` は `LM_BASE_URL`/`LM_API_KEY`/`LM_MODEL` を参照するので、API キーは `.env.local` などに保存して `.gitignore` に含める。
- 開発時に LMS のスタブを使うなら `LM_BASE_URL=http://localhost:1234` などを環境変数で切り替えてください。
- 構造化 JSON は Zod schema で検証するため、スキーマの更新を行う際は `tests/structured-output.test.ts` を追加・修正して差分を追跡。
