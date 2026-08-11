# pnpm 設定

パッケージマネージャー pnpm に関する設定ファイルの説明です。

## `package.json` の `packageManager`

```json
"packageManager": "pnpm@11.21.0"
```

`corepack` が使用する pnpm のバージョンを固定します。ローカル開発と Amplify CI で同じバージョンが使われるため、依存関係の解決結果が一致します。

---

## `.npmrc`

```
node-linker=hoisted
```

詳細は [Amplify デプロイ設定](./amplify-deployment.md#npmrc) を参照してください。

---

## `pnpm-workspace.yaml`

pnpm v10 以降で導入された、ビルドスクリプトの許可設定です。

```yaml
allowBuilds:
  '@parcel/watcher': false
  core-js: false
  esbuild: false
```

pnpm v10 以降は、依存パッケージの install スクリプト（postinstall など）を **デフォルトで実行しません**。セキュリティ上の理由で、明示的に許可したパッケージのみスクリプトが実行されます。

### 各パッケージの説明

| パッケージ        | 用途                                 | 許可の必要性                                   |
| ----------------- | ------------------------------------ | ---------------------------------------------- |
| `@parcel/watcher` | ファイル監視（ネイティブバイナリ）   | Amplify CLI 利用時に推奨                       |
| `core-js`         | JavaScript ポリフィル                | 通常は不要                                     |
| `esbuild`         | 高速バンドラー（ネイティブバイナリ） | **必須**（Amplify バックエンドのビルドに使用） |

### ビルドスクリプトの許可方法

対話的に許可する場合:

```bash
pnpm approve-builds
```

表示されるリストから必要なパッケージを Space キーで選択し、Enter で確定します。

---

## Amplify CI での pnpm 利用フロー

```
corepack enable          # pnpm を有効化（packageManager フィールドのバージョンを使用）
    ↓
pnpm install             # 依存関係をインストール（.npmrc の hoisted 設定を適用）
    ↓
pnpm run build           # フロントエンドをビルド
    ↓
$(pnpm store path)       # pnpm ストアをキャッシュ（次回以降の install を高速化）
```
