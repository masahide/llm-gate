# Repository Guidelines

## Project Structure & Module Organization
- `src/` に `basic.ts`（エントリポイント）、LM Studio 用 HTTP ラッパー (`lmstudio.ts`)、Zod による構造化出力パーサ (`structured-output.ts`)、`current_time` ツール定義 (`src/tools/current-time.ts`) を配置。
- `tests/` の `*.test.ts` は `vitest` が読み込む前提。追加するテストは `tests/` 直下に置き、`vitest.config.ts` で Node + `tsconfig.test.json` が設定済み。
- `scripts/` はフォーマット関連（`format.mjs`/`check-format.mjs`）。成果物 `dist/` や一時生成物は `.gitignore` で排除。
- 依存性は `package.json`/`pnpm-lock.yaml` で管理し、`node_modules/.pnpm` 以下に展開される。手で追加したい場合は `pnpm add -D` で `devDependencies` に寄せる。

## Build, Test, and Development Commands
- `pnpm install`: `packageManager` を尊重して開発依存をインストール。
- `pnpm dev`: `basic.ts` を `tsx` で起動し、構造化出力 → `current_time` ツール呼び出しの一連の Responses API シナリオをログで確認。
- `pnpm format`: `scripts/format.mjs` で改行・インデント・末尾改行を統一。
- `pnpm format:check`: フォーマット違反がないかをチェックするためのサブセット。
- `pnpm typecheck`: `tsc --noEmit` で型チェック。
- `pnpm test`: `vitest run` がユニットテストを実行（`tests/**/*.test.ts` を Node で走らせ、構造化出力やレスポンスの挙動を検証）。
- `pnpm test:watch`: ソース変更で自動再実行。
- `pnpm check`: `format:check` → `typecheck` → `test` で品質を一括確認。

## Coding Style & Naming Conventions
- TypeScript は `tsconfig.json` で `ES2022` + `NodeNext`。インデント 2 スペース、モジュール/関数は `camelCase` で、ファイル名は小文字スネーク・キャメル混在にせず統一。
- `structured-output.ts` の `structuredSchema` や `current-time` ツールは明示的な型 (`StructuredOutput`/`CurrentTimeParams`) を定義し、`safeParse` や `Intl.DateTimeFormat` でバリデーションした結果を扱う。
- 追加ライブラリを導入する際は `package.json` の `scripts` や `vitest.config.ts` に必要に応じて設定を追加し、既存コマンドとの互換性を確認。

## Testing Guidelines
- すべてのテストは `vitest` + `expect` で記述し、`describe`/`test` を用いて `structured-output` と `lmstudio` の処理を検証。
- 成功ケースおよびエラーケース（JSON parse 失敗、Zod バリデーション違反）を網羅し、`result.success` をガードして `issues` をチェック。
- 新規テストを追加する場合、`pnpm test` で確認し、必要なら `pnpm test:watch` で対話的に走らせる。カバレッジが必要なときは `vitest run --coverage`。

## Commit & Pull Request Guidelines
- コミットメッセージは「何を」「なぜ」の観点で書き、`pnpm check` や `pnpm test` の実行結果を本文に残す。
- PR には実行したコマンド・関連 Issue・再現手順（環境変数や API エンドポイント）を記載し、スクリーンショット/ログなどで動作を再現しやすく。
- 依存追加/コマンド変更があれば `pnpm-lock.yaml` も更新し、`pnpm install` を再度走らせて差分が出ない状態にすること。

## Security & Configuration Tips
- `basic.ts` は `LM_BASE_URL`/`LM_API_KEY`/`LM_MODEL` を参照するので、API キー類は `.env.local` などに入れて `.gitignore` に含める。
- LM Studio のスタブを使う場合、`LM_BASE_URL=http://localhost:1234` のように環境変数で切り替える。
- `current_time` ツールや Zod スキーマを更新する際は `tests/structured-output.test.ts` も合わせて修正し、意図した検証（`issues` を含む）が継続的にカバーされているか確認。
