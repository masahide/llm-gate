# Repository Guidelines

## Project Structure & Module Organization
- `src/` はエントリポイント (`basic.ts`) と LM Studio 用ユーティリティ (`lmstudio.ts`) を収めた TypeScript モジュール群。
- `docs/` には補足資料や今後のアーキテクチャノートを置く想定、`dist/` は出力先なので `.gitignore` に含める。
- 依存性は `package.json`/`pnpm-lock.yaml` で管理し、binary は `node_modules/` に入る。

## Build, Test, and Development Commands
- `pnpm install`: `packageManager` を尊重して TypeScript + tsx 関連を整備する。
- `pnpm dev`: `tsx src/basic.ts` を起動し、LM Studio API への簡易リクエスト例を実行。環境変数でベース URL/API キー/モデルを切り替え可能。
- `pnpm format`: `scripts/format.mjs` を走らせ、tab → スペース、CRLF → LF、末尾改行の付与などでファイルのベースラインを整える。
- `pnpm test`: 現状はプレースホルダーで失敗するため、テスト追加時にはこのスクリプトを更新し、`pnpm test` で実行する習慣をつける。

## Coding Style & Naming Conventions
- TypeScript を `tsconfig.json` で `ES2022` + `NodeNext` として設定。モジュールは `import`/`export` を使い、ファイル名は小文字キャメル (`lmstudio.ts`) で統一。
- 2 スペースインデント、`const`/`let` のスコープを意識し、型定義 (`LmConfig` など) は明示する。関数名は camelCase。
- `tsx` 実行時のオプションや `pnpm` スクリプトを利用し、フォーマッタや linter を後で追加する場合は `packageManager` フィールドを踏襲する。

## Testing Guidelines
- テストフレームワーク未導入。新規テストは `src/__tests__` か `tests/` 下に `*.spec.ts` を配置し、`pnpm test` で走るよう `package.json` を調整。
- API レスポンス処理や helper の挙動をユニット化し、名字 `describe`-`it` スタイルで命名。
- モックが必要な場合は `env` を切り替えて `LM_BASE_URL` をローカルのスタブに向ける。

## Commit & Pull Request Guidelines
- 既存履歴は説明的な文 (`update .gitignore and add pnpm-lock.yaml for dependency management`) なので、各変更に対し「何を」「なぜ」書くスタイルを保つ。
- PR には目的、実行したコマンド（テスト・dev 起動など）、関連 Issue 番号やスクリーンショットを添付し、レビュワーが再現できる情報を揃える。
- `pnpm` を使うこと、ローカルで `pnpm dev` を通した確認を明記する。

## Security & Configuration Tips
- 環境変数 `LM_BASE_URL` / `LM_API_KEY` / `LM_MODEL` は `basic.ts` で参照される。API キーは `.gitignore` 対象にしてリポジトリに含めない。
- ローカルでテスト用エンドポイントが必要な場合は `LM_BASE_URL=http://localhost:1234` などを `.env.local` で管理し、`.gitignore` に追加。
