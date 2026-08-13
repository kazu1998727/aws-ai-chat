# React + TypeScript + Vite

このテンプレートは、HMR といくつかの ESLint ルールを備えた、React を Vite 上で動かすための最小構成を提供します。

現在、2つの公式プラグインが利用可能です。

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) は [Oxc](https://oxc.rs) を使用
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) は [SWC](https://swc.rs/) を使用

## AWS Amplify へのデプロイ

このプロジェクトは、リポジトリ直下の `amplify.yml` ビルド仕様を使って AWS Amplify Hosting 経由でデプロイされます

### フロントエンドのビルド

frontend フェーズでは `corepack` によって pnpm を有効化し、依存関係をインストールしたうえで `pnpm run build` を実行します（Vite のビルド成果物は `dist/` に出力）。ビルド間の高速化のため、`$(pnpm store path)` を使って pnpm のストアをキャッシュしています。

### バックエンドのデプロイ

backend フェーズでは依存関係をインストールした後、以下を実行します。

```bash
npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
```

これは、現在ビルド対象のブランチに対して、Amplify Gen 2 のバックエンド（`amplify/` 配下で定義）をデプロイするコマンドです。`$AWS_BRANCH` と `$AWS_APP_ID` は Amplify のビルド環境から自動的に注入されます。注意: このコマンドを実行するには、リポジトリ内に `amplify/backend.ts`（Amplify Gen 2 のバックエンド定義）が存在している必要があります。まだ存在しない場合は、このステップを有効にする前に追加してください。

### 関連ファイル

- `amplify.yml` — ビルド/デプロイのパイプライン定義
- `.npmrc` — Amplify のビルドイメージ上で pnpm を正しく動作させるための `node-linker=hoisted` 設定
- `package.json`（`packageManager` フィールド） — `corepack` が使用する pnpm のバージョンを固定

## React Compiler

このテンプレートでは、開発時およびビルド時のパフォーマンスへの影響を考慮し、React Compiler は有効化していません。導入する場合は[こちらのドキュメント](https://react.dev/learn/react-compiler/installation)を参照してください。

## ESLint 設定の拡張

本番環境向けのアプリケーションを開発している場合は、型を考慮した lint ルールを有効にするよう設定を更新することを推奨します。

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

React 向けの lint ルールとして、[eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) と [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) をインストールすることもできます。

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

\nコミット: 自動更新 2026-08-13T04:34:40Z
