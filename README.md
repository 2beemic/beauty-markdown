# 余白読本

Markdownやテキストを、上質な誌面のような読書体験へ変換する Next.js アプリです。入力・アップロード・ドラッグ&ドロップ・マーカー保存まで、すべてブラウザ内で完結します。

## 採用技術

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- react-markdown + remark-gfm + remark-breaks
- rehype-sanitize
- Selection API / Range API / localStorage
- Web Share API / Clipboard API

## ディレクトリ構成

```text
.
|-- app
|   |-- globals.css
|   |-- layout.tsx
|   `-- page.tsx
|-- components
|   `-- markdown-studio.tsx
|-- lib
|   |-- sample-markdown.ts
|   `-- storage.ts
|-- public
|   `-- sample-figure.svg
|-- next.config.ts
|-- next-env.d.ts
|-- package.json
|-- postcss.config.js
|-- README.md
|-- tailwind.config.ts
`-- tsconfig.json
```

## セットアップ

```bash
npm install
```

## ローカル開発

```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開くと確認できます。

## 本番デプロイの注意点

- Vercel へのデプロイを想定した構成です。
- 画像は Markdown 内で外部 URL も表示できますが、運用上は許可ドメインや CSP の検討をおすすめします。
- Markdown の生 HTML は `skipHtml` と `rehype-sanitize` で無効化しています。
- localStorage を使うため、SSR 依存の状態管理にはしていません。
- 共有機能は `?md=` クエリに本文を載せるURL共有です。長文ではURLが長くなるため、本格運用時は短縮共有リンクAPIの追加を推奨します。

## 設計意図

- UI は「ノートアプリ + 高級ブログ + Webマガジン」の中間を狙い、入力面はミニマル、閲覧面は豊かな余白とガラス感で差を付けています。
- Markdown の見た目差が出やすい要素として、見出し・引用・コード・表・画像を重点的にスタイリングしています。
- マーカー保存は DOM 断片ではなく「文書内の文字オフセット」で持つことで、localStorage 保存や再描画を保守しやすくしています。
- ハイライトは Range API で選択範囲を取得し、再描画時はテキストノード単位で span を差し込んで復元します。
- `prefers-reduced-motion` を尊重して、アニメーションは自動で抑制されます。
- 共有はサーバー保存なしで完結させるため、本文を Base64URL でエンコードしてURLに含め、アクセス時に復元しています。

## 今後の拡張案

- シンタックスハイライトを Prism 系で追加
- マーカーにメモを添付
- 文書ごとの保存一覧
- PDF エクスポート
- テーマバリエーションの追加
- 共有リンク生成
