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
  '@parcel/watcher': true
  core-js: false
  esbuild: true
```

pnpm v10 以降は、依存パッケージの install スクリプト（postinstall など）を **デフォルトで実行しません**。セキュリティ上の理由で、明示的に許可したパッケージのみスクリプトが実行されます。

### 各パッケージの説明

| パッケージ        | 用途                                 | 許可の必要性                                                     |
| ----------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `@parcel/watcher` | ファイル監視（ネイティブバイナリ）   | Amplify CLI 利用時に推奨（`true`）                               |
| `core-js`         | JavaScript ポリフィル                | 通常は不要（`false`）                                            |
| `esbuild`         | 高速バンドラー（ネイティブバイナリ） | **必須**（`true`。Amplify バックエンドのビルド・デプロイに使用） |

> ⚠️ `esbuild` を `false` のままにすると、Amplify CI 上で `ampx pipeline-deploy` が失敗します。詳細は下記の [トラブルシューティング](#トラブルシューティング-esbuild-のビルド失敗) を参照してください。

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

---

## トラブルシューティング: esbuild のビルド失敗

### エラー内容

Amplify CI の backend フェーズで `npx ampx pipeline-deploy` を実行した際、以下のエラーでデプロイが失敗する。

```
[BackendBuildError] Unable to deploy due to CDK Assembly Error
  ∟ Caused by: [AssemblyError] Assembly builder failed
  ∟ Caused by: [FailedToBundleAsset] Failed to bundle asset ...AmplifyBranchLinker/CustomResourceLambda/Code/Stage,
    bundle output is located at .../.amplify/artifacts/cdk.out/bundling-temp-...-building:
    CommandExitedWithNonZeroStatus: pnpm exec -- esbuild --bundle
    .../node_modules/@aws-amplify/backend/lib/engine/branch-linker/lambda/branch_linker.js
    --target=node20 --platform=node --outfile=.../index.js
    run in directory ... exited with status 1
    Resolution: Check the Caused by error and fix any issues in your backend code
```

### 原因

`pnpm-workspace.yaml` の `allowBuilds` で `esbuild: false` に設定されていたことが原因です。

pnpm v10 以降、依存パッケージの install スクリプト（postinstall など）は `allowBuilds` で明示的に許可したパッケージのみ実行されます。`esbuild` はネイティブバイナリを postinstall で取得する仕組みのため、`false` のままだと **バイナリが存在しない状態** になります。

`ampx pipeline-deploy` は内部でカスタムリソース用の Lambda 関数（`branch_linker.js` など）をバンドルするために `esbuild` を CLI 経由で呼び出しますが、バイナリが無いためコマンドが失敗し、CDK のアセット合成（Assembly）自体がエラーになります。

これはローカルの `pnpm approve-builds` 実行時に `esbuild` を選択しなかった（もしくは選択せず `pnpm-workspace.yaml` が生成された）場合に発生します。ローカル環境ではたまたま別の経路で `esbuild` バイナリが存在していて気づかず、CI 環境（クリーンな `pnpm install`）で初めて表面化するケースが多いです。

### 解決方法

`pnpm-workspace.yaml` で `esbuild` の許可を `true` に変更します。

```yaml
allowBuilds:
  '@parcel/watcher': true
  core-js: false
  esbuild: true
```

変更後、ローカルで反映を確認する場合は次を実行します。

```bash
pnpm install
pnpm rebuild esbuild
```

CI では `amplify.yml` の `pnpm install`（preBuild フェーズ）で自動的に `esbuild` のビルドスクリプトが実行されるようになり、以降の `ampx pipeline-deploy` が成功します。

### 再発防止のポイント

- `pnpm approve-builds` で新しい依存関係の許可を求められた際、**ネイティブバイナリ系パッケージ（esbuild、@parcel/watcher など）は基本的に許可する**
- CI で初めて失敗が発覚しないよう、ローカルでも `rm -rf node_modules && pnpm install` でクリーンインストールを試し、CI と同じ状態を再現して確認する
- `pnpm-workspace.yaml` の `allowBuilds` を変更した際は、その意図をコミットメッセージやこのドキュメントに残す
