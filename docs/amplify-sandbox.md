# Amplify Sandbox（ローカル開発環境）

`sandbox` は、開発者ごとに独立した AWS クラウド環境を立ち上げ、Cognito などのバックエンドリソースをローカル開発中に使えるようにする仕組みです。

## 基本的な使い方

### 環境の起動

```bash
npx ampx sandbox
```

`amplify/` 配下のファイルを読み取り、AWS 上に個人用の sandbox 環境をデプロイします。起動中は `amplify/` の変更を監視し、ファイル保存のたびに自動で再デプロイされます。

初回実行時に Cognito User Pool などが作成され、完了後に `amplify_outputs.json` が生成されます。フロントエンドはこのファイルを参照して Auth の設定（User Pool ID、Client ID など）を取得します。

### 1回だけデプロイする

```bash
npx ampx sandbox --once
```

ファイル監視なしで1回だけデプロイします。CI や動作確認向けです。

### 環境の削除

```bash
npx ampx sandbox delete
```

sandbox 環境と関連する AWS リソース（Cognito User Pool など）を削除します。

`sandbox` 実行中に `Ctrl+C` で終了した場合も、リソースを削除するかどうかを対話的に選べます。

---

## 生成されるファイル

### `amplify_outputs.json`

sandbox または branch デプロイ後に生成される設定ファイルです。フロントエンドが Amplify バックエンドに接続するための情報（User Pool ID、Region など）が含まれます。

- 環境ごとに内容が異なるため、**Git にはコミットしない**
- チームメンバーは各自 `npx ampx sandbox` を実行して、自分用のファイルを生成する

### `.amplify/`

sandbox の状態管理用ディレクトリです。こちらも Git 管理対象外です。

---

## 本番環境のデータは消える？

**結論: sandbox の操作が本番環境に影響することはありません。**

| 環境            | デプロイ方法                                | 用途                      |
| --------------- | ------------------------------------------- | ------------------------- |
| **sandbox**     | `npx ampx sandbox`                          | 個人のローカル開発        |
| **branch 環境** | `npx ampx pipeline-deploy`（`amplify.yml`） | staging / production など |

これらは **別々の CloudFormation スタック** として AWS 上に作成されます。sandbox を削除しても、Amplify Hosting 経由でデプロイした本番・staging 環境の Cognito やデータベースには触れません。

```
開発者 A の sandbox  ──→  AWS リソース（独立）
開発者 B の sandbox  ──→  AWS リソース（独立）
main ブランチ       ──→  AWS リソース（独立）
production ブランチ ──→  AWS リソース（独立）
```

---

## チーム開発でデータは消える？

### 開発者間でデータは共有されない

sandbox は **開発者ごとに独立した環境** です。デフォルトではマシンのユーザー名が識別子になり、各自が別の Cognito User Pool を持ちます。

- 開発者 A が登録したユーザーは、開発者 B の sandbox では使えない
- 互いの sandbox 操作で相手のデータが消えることはない

### sandbox 内のデータは消えることがある

sandbox は **開発・実験用** であり、本番向けのデータ永続化は想定されていません。以下の場合に **sandbox 内のデータが失われます**。

| 操作・状況                               | 影響                                                        |
| ---------------------------------------- | ----------------------------------------------------------- |
| `npx ampx sandbox delete`                | sandbox 内のすべてのリソースとデータが削除される            |
| `Ctrl+C` 終了時に「削除」を選択          | 同上                                                        |
| Cognito の破壊的な設定変更               | sandbox では User Pool が **削除・再作成** される場合がある |
| DynamoDB の GSI 変更（データ定義追加時） | sandbox ではテーブルが **削除・再作成** される場合がある    |

AWS の公式ドキュメントでも、sandbox 環境では Cognito User Pool や DynamoDB テーブルが drop & recreate されるケースがあると明記されています。これは **sandbox 限定の挙動** で、branch デプロイ（staging / production）では通常この動作は起きません。

### チーム開発のベストプラクティス

1. **各自が自分の sandbox を使う** — 1人1環境が基本。複数 sandbox は管理が複雑になるため非推奨
2. **テストユーザーは sandbox 内で都度作成する** — 本番ユーザーデータを sandbox にコピーしない
3. **共有したいデータがある場合** — staging 用の branch 環境（`pipeline-deploy`）を用意する
4. **不要になった sandbox は削除する** — `npx ampx sandbox delete` でコスト削減

---

## 会社の AWS アカウントをチームで共有する場合

**結論: データの安全性という点では問題ありませんが、運用上の注意が必要です。**

### 問題ない点（データ・本番の観点）

同じ AWS アカウント内でも、sandbox・staging・production は **CloudFormation スタック単位で完全に分離** されています。

```
1つの AWS アカウント
├── 開発者 A の sandbox（Cognito User Pool A）
├── 開発者 B の sandbox（Cognito User Pool B）
├── staging ブランチ（Cognito User Pool staging）
└── production ブランチ（Cognito User Pool prod）
```

- 開発者 A が sandbox を削除しても、本番・staging・他メンバーの sandbox には影響しない
- 本番の Cognito ユーザーデータが sandbox 操作で消えることはない
- 各環境は別リソースとして独立している

### 注意が必要な点（運用・コストの観点）

| 観点                 | 内容                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| **コスト**           | 開発者数 × sandbox 分の Cognito・Lambda 等が課金される。使わない sandbox は削除する                   |
| **IAM 権限**         | 全員が同じ AWS プロファイル/ロールを使う場合、誰がどのリソースを操作できるか IAM で管理する           |
| **リソース数の上限** | Cognito User Pool 等にはアカウントごとの上限がある。大人数で sandbox を放置すると上限に達する可能性   |
| **可視性**           | Amplify コンソールの「Manage Sandboxes」から、チーム全員の sandbox 一覧を確認・削除できる             |
| **命名の衝突**       | 同じ `--identifier` を使うと同じ sandbox を共有することになる。通常は各自のユーザー名で自動分離される |

### 共有 AWS アカウントでの推奨運用

1. **sandbox は個人開発専用** — チームで1つの sandbox を共有しない
2. **staging / production は branch デプロイで管理** — Amplify Hosting のブランチと紐づける
3. **定期的に不要 sandbox を削除** — 退職・異動時も含め、`npx ampx sandbox delete` または Amplify コンソールから整理
4. **本番ブランチへの直接デプロイ権限を制限** — IAM や Amplify のブランチ保護で、意図しない本番デプロイを防ぐ
5. **コスト監視を設定** — AWS Budgets や Cost Explorer で sandbox 由来のコストを把握する

### アカウント分離との比較

| 方式                          | メリット                         | デメリット                                   |
| ----------------------------- | -------------------------------- | -------------------------------------------- |
| **1アカウント共有（現状）**   | 管理がシンプル、コスト集約       | sandbox 増加でリソース・コストが膨らみやすい |
| **dev / prod アカウント分離** | 本番との完全分離、権限管理が明確 | AWS Organizations 等の設定が必要             |

小〜中規模チームで IAM と sandbox 管理のルールを決めれば、**1アカウント共有でも十分運用可能** です。チームが大きくなったり、コンプライアンス要件が厳しくなった場合は dev / prod アカウント分離を検討します。

---

## sandbox と branch デプロイの使い分け

|              | sandbox            | branch デプロイ            |
| ------------ | ------------------ | -------------------------- |
| コマンド     | `npx ampx sandbox` | `npx ampx pipeline-deploy` |
| トリガー     | 手動（ローカル）   | Amplify CI/CD（push 時）   |
| 対象         | 個人の開発環境     | staging / production       |
| データ永続性 | 低（実験用）       | 高（本番相当）             |
| 本番への影響 | なし               | 該当ブランチのみ           |

---

## よく使うコマンド一覧

```bash
# sandbox 起動（ファイル監視あり）
npx ampx sandbox

# 1回だけデプロイ
npx ampx sandbox --once

# sandbox 削除
npx ampx sandbox delete

# 識別子を指定して sandbox 起動（複数環境を使い分ける場合）
npx ampx sandbox --identifier my-feature

# 別環境の設定ファイルを生成（チームメンバーの環境確認など）
npx ampx generate outputs --branch <branch-name> --app-id <app-id>
```
