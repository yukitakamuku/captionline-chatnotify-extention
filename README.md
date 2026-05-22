# captiOnline 連絡チャット通知

captiOnline の連絡チャットに新着メッセージが届いたとき、通知音と OS 通知を出す Chrome 拡張機能です。

## Chrome Web Store

アップロード用パッケージは、拡張機能のソースファイルを ZIP 化して作成します。

## Privacy Policy

Chrome Web Store のプライバシーポリシー欄には、GitHub Pages で公開した次の形式の URL を設定します。

```text
https://<GitHubユーザー名>.github.io/<リポジトリ名>/privacy.html
```

`privacy.html` はこのリポジトリのルートにあります。

## Files

- `manifest.json`: Chrome 拡張機能のマニフェスト
- `content.js`: 対象ページ上でチャットログを監視する処理
- `background.js`: OS 通知を表示する Service Worker
- `popup.html`, `popup.js`: 拡張機能ポップアップの設定 UI
- `privacy.html`: Chrome Web Store に掲載するプライバシーポリシー
