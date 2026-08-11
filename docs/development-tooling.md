# 開発ツール設定

コード品質と開発体験を向上させるためのツール設定ファイルの説明です。

## Prettier

コードフォーマッターです。プロジェクト全体で統一されたコードスタイルを維持します。

### `.prettierrc.json`

```json
{
  "semi": false,
  "singleQuote": true
}
```

| 設定          | 値      | 説明                   |
| ------------- | ------- | ---------------------- |
| `semi`        | `false` | セミコロンを付けない   |
| `singleQuote` | `true`  | シングルクォートを使用 |

### `.prettierignore`

Prettier の対象外ファイルを指定します。

```
dist
pnpm-lock.yaml
```

- `dist/` — ビルド成果物
- `pnpm-lock.yaml` — 自動生成されるロックファイル

### `package.json` のスクリプト

```json
"format": "prettier --write ."
```

---

## ESLint

静的解析ツールです。Prettier と競合するルールは `eslint-config-prettier` で無効化しています。

### `eslint.config.js` の変更点

- `eslint-config-prettier/flat` を追加し、Prettier と競合する ESLint ルールを無効化
- `.amplify/` を `globalIgnores` に追加（Amplify の生成ファイルを lint 対象外に）

---

## Husky + lint-staged

Git コミット前に自動で lint とフォーマットを実行する仕組みです。

### `.husky/pre-commit`

```bash
command -v git-secrets >/dev/null && git secrets --pre_commit_hook -- "$@"
pnpm exec lint-staged
```

1. `git-secrets` がインストールされていれば、シークレット情報の混入チェックを実行
2. `lint-staged` でステージングされたファイルのみ lint / format を実行

### `package.json` の lint-staged 設定

```json
"lint-staged": {
  "*.{ts,tsx}": "eslint --fix",
  "*.{ts,tsx,js,json,css,md}": "prettier --write"
}
```

| 対象ファイル                                       | 実行コマンド           |
| -------------------------------------------------- | ---------------------- |
| `*.ts`, `*.tsx`                                    | ESLint（自動修正あり） |
| `*.ts`, `*.tsx`, `*.js`, `*.json`, `*.css`, `*.md` | Prettier（自動整形）   |

### `package.json` の prepare スクリプト

```json
"prepare": "husky"
```

`pnpm install` 時に Husky の Git フックが自動セットアップされます。

---

## Vitest

テストランナーです。Vite プロジェクトと相性が良く、設定なしで TypeScript をそのまま実行できます。

### `src/smoke.test.ts`

Vitest が正しく動作することを確認するスモークテストです。

```typescript
import { expect, test } from 'vitest'

test('vitest works', () => {
  expect(1 + 1).toBe(2)
})
```

### `package.json` のスクリプト

```json
"test": "vitest run"
```

`vitest run` はテストを1回実行して終了します（watch モードではありません）。

---

## 追加された devDependencies 一覧

| パッケージ                 | バージョン | 用途                                      |
| -------------------------- | ---------- | ----------------------------------------- |
| `@aws-amplify/backend`     | 1.16.1     | Amplify Gen 2 バックエンド定義            |
| `@aws-amplify/backend-cli` | 1.8.0      | `ampx` CLI（デプロイ・sandbox 管理）      |
| `eslint-config-prettier`   | ^10.1.8    | ESLint と Prettier の競合解消             |
| `husky`                    | ^9.1.7     | Git フック管理                            |
| `lint-staged`              | ^17.3.0    | ステージングファイルへの lint/format 実行 |
| `prettier`                 | ^3.9.6     | コードフォーマッター                      |
| `vitest`                   | ^4.1.10    | テストランナー                            |
