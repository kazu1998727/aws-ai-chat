# フロントエンドライブラリ

スタイリングとルーティングに関するライブラリの説明です。

## Tailwind CSS

ユーティリティファーストの CSS フレームワークです。v4 系を使用しています。

### セットアップ

v4 では PostCSS 設定や `tailwind.config.js` が不要になり、**Vite プラグイン + CSS の 1 行 import** だけで動作します。

#### `vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

#### `src/index.css`

```css
@import 'tailwindcss';
```

これだけで、プロジェクト内のソースファイルが自動的にスキャンされ、使用されているクラスのみが CSS に出力されます（未使用クラスは含まれません）。

### v3 との違い

| 項目             | v3                                    | v4                              |
| ---------------- | ------------------------------------- | ------------------------------- |
| 設定ファイル     | `tailwind.config.js` が必須           | 不要                            |
| PostCSS 設定     | `postcss.config.js` が必要            | 不要（Vite プラグインが処理）   |
| CSS の読み込み   | `@tailwind base/components/utilities` | `@import 'tailwindcss'` の 1 行 |
| スキャン対象     | `content` に手動で指定                | 自動検出                        |
| テーマのカスタム | JS の設定ファイル                     | CSS 内の `@theme`               |

### テーマのカスタマイズ

v4 では CSS 内で `@theme` を使います。設定ファイルは作りません。

```css
@import 'tailwindcss';

@theme {
  --color-brand: #aa3bff;
  --font-display: 'Inter', sans-serif;
}
```

上記の定義により `bg-brand` / `text-brand` / `font-display` などのクラスが自動生成されます。

### 既存 CSS との共存についての注意

`src/index.css` と `src/App.css` には Vite テンプレート由来の独自スタイルが残っています。Tailwind の preflight（ブラウザ標準スタイルのリセット）と併存している状態のため、UI 実装を本格化する際は既存 CSS を整理するか、意図的に残すかを判断してください。

---

## tailwind-merge

Tailwind のクラス名が **競合したときに後勝ちで解決する** ユーティリティです。

### なぜ必要か

Tailwind のクラスは CSS の出力順で優先度が決まるため、単純に文字列結合すると意図した方が効かないことがあります。

```tsx
// ❌ p-8 が効くとは限らない（CSS の定義順に依存する）
<div className="p-4 p-8" />
```

`twMerge` は競合するクラス（同じ CSS プロパティを操作するクラス）を検出し、**後ろに書かれた方だけを残します**。

```tsx
import { twMerge } from 'tailwind-merge'

twMerge('p-4 p-8') // → 'p-8'
twMerge('text-red-500', 'text-blue-500') // → 'text-blue-500'
twMerge('px-4 py-2', 'p-8') // → 'p-8'
```

### 主な用途

デフォルトのスタイルを持つコンポーネントで、呼び出し側からの上書きを可能にするパターンです。

```tsx
type ButtonProps = React.ComponentProps<'button'>

function Button({ className, ...props }: ButtonProps) {
  return (
    <button
      className={twMerge('rounded bg-blue-500 px-4 py-2', className)}
      {...props}
    />
  )
}

// 呼び出し側で確実に上書きできる
;<Button className="bg-red-500" />
```

`twMerge` を使わずに文字列結合していると、`bg-red-500` が効かない可能性があります。

> 条件付きでクラスを付け外ししたい場合は `clsx` を組み合わせた `cn()` ヘルパーがよく使われますが、現時点では未導入です。必要になった時点で追加してください。

---

## React Router

クライアントサイドルーティングのライブラリです。v8 系を使用しています。

### パッケージ名についての注意

**v7 以降、パッケージ名は `react-router-dom` ではなく `react-router` です。** DOM 向けの API（`BrowserRouter` など）もすべて `react-router` から export されています。古い記事やサンプルコードは `react-router-dom` を import しているものが多いため注意してください。

```typescript
import { BrowserRouter } from 'react-router' // ✅
import { BrowserRouter } from 'react-router-dom' // ❌ 非推奨
```

### 現在の構成（Declarative モード）

`src/main.tsx` でルートを定義しています。

```tsx
import { BrowserRouter, Route, Routes } from 'react-router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
```

React Router には 3 つのモードがありますが、現在は最もシンプルな **Declarative モード** を採用しています。

| モード      | 特徴                                                | 採用状況 |
| ----------- | --------------------------------------------------- | -------- |
| Declarative | `<Routes>` / `<Route>` で宣言。最小構成             | ✅ 採用  |
| Data        | `createBrowserRouter` + loader/action でデータ取得  | 未使用   |
| Framework   | ファイルベースルーティング、SSR。Remix 相当の全機能 | 未使用   |

データ取得を loader に寄せたくなったら Data モードへの移行を検討してください。

### ルートの追加方法

```tsx
<Routes>
  <Route path="/" element={<App />} />
  <Route path="/chat" element={<Chat />} />
  <Route path="/chat/:id" element={<ChatDetail />} />
</Routes>
```

ページ数が増えたら `src/routes.tsx` などに切り出すことを検討してください。

### ⚠️ Amplify Hosting での SPA フォールバック設定

**未対応の項目です。** クライアントサイドルーティングでは、`/chat` などのパスに **直接アクセスまたはリロード** すると、そのパスに対応するファイルがサーバー上に存在しないため 404 になります。

Amplify コンソールで以下のリライトルールを追加する必要があります（`amplify.yml` では設定できません）。

| 送信元アドレス                                                                                     | ターゲットアドレス | 種類          |
| -------------------------------------------------------------------------------------------------- | ------------------ | ------------- |
| `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json)$)([^.]+$)/>` | `/index.html`      | 200 (Rewrite) |

**設定手順**: Amplify コンソール → 対象アプリ → 「ホスティング」→「書き換えとリダイレクト」→「管理」→「書き換えとリダイレクトを追加」

このルールは「拡張子を持たないパス」および「静的アセットの拡張子ではないパス」をすべて `index.html` に書き換えるもので、Amplify が SPA 向けに提示しているテンプレートと同じ内容です。

> ルートが `/` のみの現状では問題は表面化しませんが、2 つ目のルートを追加する前に必ず設定してください。
