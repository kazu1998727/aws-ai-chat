# 開発ツール設定

コード品質と開発体験を向上させるためのツール設定ファイルの説明です。

## Prettier

コードフォーマッターです。プロジェクト全体で統一されたコードスタイルを維持します。

### `.prettierrc.json`

```json
{
  "semi": false,
  "singleQuote": true,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

| 設定          | 値                            | 説明                                  |
| ------------- | ----------------------------- | ------------------------------------- |
| `semi`        | `false`                       | セミコロンを付けない                  |
| `singleQuote` | `true`                        | シングルクォートを使用                |
| `plugins`     | `prettier-plugin-tailwindcss` | Tailwind のクラス名を推奨順に並べ替え |

### `prettier-plugin-tailwindcss`

Tailwind CSS の公式 Prettier プラグインです。`className` 内のユーティリティクラスを Tailwind 推奨の順序に自動で並べ替えます。

```tsx
// 整形前
<div className="text-red-500 mx-auto p-4 flex" />

// 整形後
<div className="mx-auto flex p-4 text-red-500" />
```

クラスの並び順がレビューで議論にならなくなり、差分も安定します。lint-staged 経由でコミット時に自動適用されます。

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

`command -v` でガードしているため、`git-secrets` が未インストールの環境でもコミットは通ります（チェックはスキップされます）。

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

> スモークテストを削除する場合は注意してください。テストファイルが 0 件だと `vitest run` は終了コード 1 で失敗し、CI が落ちます。

---

## git-secrets

コミットに AWS のアクセスキーなどのシークレットが混入するのを防ぐツールです。**リポジトリの依存関係ではなく、各開発者のマシンに個別にインストールが必要**です。

### セットアップ

```bash
brew install git-secrets       # インストール（macOS）
git secrets --install          # このリポジトリの .git/hooks に設置
git secrets --register-aws     # AWS のキー形式を検出パターンとして登録
```

`git secrets --register-aws` は AWS アクセスキー ID（`AKIA...`）やシークレットアクセスキーのパターンを登録します。Amplify を扱う本プロジェクトでは必須の設定です。

### 動作確認

```bash
git secrets --scan             # 現在のファイルをスキャン
git secrets --scan-history     # コミット履歴全体をスキャン
```

> ⚠️ git-secrets はあくまで **既知のパターンに対する保険** です。検出できないシークレットもあるため、認証情報は環境変数や AWS Secrets Manager で管理し、そもそもコードに書かないことが前提です。

---

## 追加された依存関係一覧

### dependencies（実行時に必要）

| パッケージ       | バージョン | 用途                           |
| ---------------- | ---------- | ------------------------------ |
| `react-router`   | ^8.3.0     | クライアントサイドルーティング |
| `tailwind-merge` | ^3.6.0     | Tailwind クラスの競合解決      |

詳細は [フロントエンドライブラリ](./frontend-libraries.md) を参照してください。

### devDependencies（開発時のみ）

| パッケージ                    | バージョン | 用途                                       |
| ----------------------------- | ---------- | ------------------------------------------ |
| `@aws-amplify/backend`        | 1.16.1     | Amplify Gen 2 バックエンド定義             |
| `@aws-amplify/backend-cli`    | 1.8.0      | `ampx` CLI（デプロイ・sandbox 管理）       |
| `@tailwindcss/vite`           | ^4.3.3     | Tailwind の Vite プラグイン                |
| `esbuild`                     | ^0.25.12   | Amplify デプロイ時の Lambda バンドルに必要 |
| `eslint-config-prettier`      | ^10.1.8    | ESLint と Prettier の競合解消              |
| `husky`                       | ^9.1.7     | Git フック管理                             |
| `lint-staged`                 | ^17.3.0    | ステージングファイルへの lint/format 実行  |
| `prettier`                    | ^3.9.6     | コードフォーマッター                       |
| `prettier-plugin-tailwindcss` | ^0.8.1     | Tailwind クラスの並べ替え                  |
| `tailwindcss`                 | ^4.3.3     | CSS フレームワーク                         |
| `vitest`                      | ^4.1.10    | テストランナー                             |

> `esbuild` を直接の依存関係にしている理由は [pnpm 設定](./pnpm-setup.md#トラブルシューティング-esbuild-のビルド失敗) を参照してください。
