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

> ⚠️ `esbuild` を `false` のままにすると、Amplify CI 上で `ampx pipeline-deploy` が失敗します。ただし `true` にするだけでは不十分で、`esbuild` を **直接の devDependency として追加する** 必要もあります。詳細は下記の [トラブルシューティング](#トラブルシューティング-esbuild-のビルド失敗) を参照してください。

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

`ampx pipeline-deploy` は内部でカスタムリソース用の Lambda 関数（`branch_linker.js` など）をバンドルするために、`pnpm exec -- esbuild ...` という形で esbuild を **CLI として** 呼び出します。この呼び出しが失敗すると、CDK のアセット合成（Assembly）自体がエラーになります。

失敗の原因は 2 つあり、**両方を満たさないと解決しません**。

### 原因 1: ビルドスクリプトが許可されていない

`pnpm-workspace.yaml` の `allowBuilds` で `esbuild: false` になっているケースです。

pnpm v10 以降、依存パッケージの install スクリプト（postinstall など）は `allowBuilds` で明示的に許可したパッケージのみ実行されます。`esbuild` はネイティブバイナリを postinstall で取得する仕組みのため、`false` のままだと **バイナリが存在しない状態** になります。

これはローカルの `pnpm approve-builds` 実行時に `esbuild` を選択しなかった場合に発生します。ローカルではたまたま別の経路で `esbuild` バイナリが存在していて気づかず、CI 環境（クリーンな `pnpm install`）で初めて表面化するケースが多いです。

**解決方法**: `pnpm-workspace.yaml` で `esbuild: true` に変更します。

```yaml
allowBuilds:
  '@parcel/watcher': true
  core-js: false
  esbuild: true
```

### 原因 2: `esbuild` が直接の依存関係になっていない

`allowBuilds` を `true` にしても解決しない場合はこちらです。エラーログに以下が出ていれば確定です。

```
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command "esbuild" not found
Did you mean "pnpm exec eslint"?
```

`esbuild` は本プロジェクトでは `vite` や `tsx` の **推移的依存** としてのみツリーに存在していました。pnpm は（`node-linker=hoisted` であっても）ルートの `node_modules/.bin` に **直接の依存関係の実行ファイルしかリンクしません**。そのため `pnpm exec esbuild` からは解決できず、コマンドが見つからずに失敗していました。

`allowBuilds` はバイナリのダウンロードを許可するだけで、CLI としてルートから呼べるようにするものではない、という点が分かりにくいポイントです。

**解決方法**: `esbuild` を直接の devDependency として追加します。

```bash
pnpm add -D esbuild@^0.25.12
```

```json
"devDependencies": {
  "esbuild": "^0.25.12"
}
```

> バージョンは `pnpm why esbuild` で確認した既存ツリーのもの（vite / tsx が使用中）に合わせています。別バージョンを入れると esbuild が二重にインストールされるため、`pnpm why esbuild` が `Found 1 version of esbuild` を返すことを確認してください。

### 確認方法

ローカルで CI と同じ状態を再現して確認します。

```bash
rm -rf node_modules && pnpm install
pnpm exec esbuild --version   # バージョンが表示されれば OK
pnpm why esbuild              # "Found 1 version of esbuild" であること
```

### 再発防止のポイント

- **CLI として呼ばれるツールは直接の依存関係にする**。推移的依存に頼ると `pnpm exec` から解決できない。今回のように外部ツール（CDK）が内部で `pnpm exec` を呼ぶケースでは特に気づきにくい
- `pnpm approve-builds` で許可を求められた際、**ネイティブバイナリ系パッケージ（esbuild、@parcel/watcher など）は基本的に許可する**
- CI で初めて失敗が発覚しないよう、ローカルでも `rm -rf node_modules && pnpm install` でクリーンインストールを試し、CI と同じ状態を再現して確認する
- `pnpm-workspace.yaml` の `allowBuilds` を変更した際は、その意図をコミットメッセージやこのドキュメントに残す
