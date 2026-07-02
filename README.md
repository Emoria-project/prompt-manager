# プロンプト管理Webアプリ

Next.js、TypeScript、Tailwind CSS、Supabaseで作成した個人利用向けのプロンプト管理アプリです。

ログイン後に、プロンプトテンプレートと変数セットをSupabase Databaseへ保存します。Row Level Securityにより、ログイン中ユーザー本人のデータだけを取得・作成・更新・削除できます。

## 主な機能

- Supabase Authによるメールアドレス・パスワードログイン
- 未ログイン時はログイン画面のみ表示
- プロンプトテンプレートの登録・編集・削除
- `{{変数名}}` の自動検出
- 変数入力欄の自動生成
- 完成プロンプトのリアルタイム表示
- ワンクリックコピー
- 変数セットの保存・切り替え・削除
- 初回ログイン時にLocalStorageデータをSupabaseへ移行
- LocalStorageへの簡易バックアップ

## セットアップ

依存関係をインストールします。

```bash
npm install
```

Supabaseプロジェクトを作成し、SQL Editorで [supabase/schema.sql](/Users/sawamayumeki/Documents/OCR開発用/supabase/schema.sql) を実行します。

`.env.example` を参考に `.env.local` を作成します。

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

開発サーバーを起動します。

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## Supabase Auth設定

Supabase Dashboardの `Authentication` でメールログインを有効にしてください。

個人利用で素早く使う場合は、必要に応じてメール確認を無効化できます。メール確認を有効にする場合は、新規登録後に確認メールを開いてからログインしてください。

Vercelにデプロイする場合は、Supabaseの `Authentication > URL Configuration` でデプロイ先URLを許可してください。

## Vercelデプロイ

Vercelにこのリポジトリを接続し、Environment Variablesに以下を設定します。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

設定後、通常どおりデプロイします。

## データベース

必要なテーブルは以下です。

- `prompts`
- `variable_sets`

どちらも `user_id` を持ち、RLSで `user_id = auth.uid()` のデータだけ操作できます。テーブル作成SQLは [supabase/schema.sql](/Users/sawamayumeki/Documents/OCR開発用/supabase/schema.sql) にあります。

## コマンド

```bash
npm run dev
npm run build
npm run lint
```
