# くく れんしゅう（1〜9の段）

九九を声で練習する Web アプリ。依存なしの HTML / CSS / JavaScript（ビルド不要）。
GitHub Pages などの静的ホスティングにそのまま置いて使える。ログイン・サーバー・データベースなし。

## 練習の種類（段をえらんだあとのメニュー）

| ボタン | 中身 |
|---|---|
| 🔵 1もんずつ | 問題をえらんで1問ずつ |
| 🟢 じゅんばんに 9もん | アプリが1問ずつ読み上げ → 子どもが答える。⬆️のぼり（×1→×9）／⬇️くだり（×9→×1） |
| 🟣 ばらばら 9もん | ×1〜×9 を毎回シャッフルして1回ずつ（読み上げ → 答える） |
| ⭐ みないで いえるかな？ | 本番暗唱。アプリは「5のだん、どうぞ♪」だけ言って黙って聞く（js/recital.js）。⬆️／⬇️ |
| ちょっとだけ れんしゅう | 2・3・5もん（のぼりのみ） |

トップの「🍚 おみせで あそぶ」は **ちいさな ごちそうやさん**（js/shop.js・Phase 1 は5の段）。1さらに5こ入った料理を注文の数だけならべ、「ぜんぶで なんこ？ かくにん！」で 5 → 10 → 15… と数えてから「5 × 3 ＝ 15」を確認し、おとどけする。マイクは使わない。間違い・時間制限・スコアなし。おとどけ 2/4/6回で おにぎり／たまごやき／おだんご が増える。進み具合は記録（localStorage の `shop`）に保存され、記録のファイル保存・読み込みにも含まれる。

## 公開（GitHub Pages）

公開URL：**https://rengeruna0403-collab.github.io/kuku-renshu/**

- GitHub Pages は **`main` ブランチの `/docs` フォルダ**を配信する。
- `docs/` は公開用のコピー。アプリ本体はこのフォルダ直下（`index.html`・`style.css`・`js/`・`icons/`…）で、ローカルでもそのまま動く。
- `tests/`・`scripts/`・`server.js`・`start.bat`・`README.md` は開発用。リポジトリには残るが、Web には配信されない。
- すべての参照は相対パスなので、`/kuku-renshu/` のようなサブディレクトリでも動く。

### 更新するとき

1. アプリ本体（直下の `index.html`・`js/` など）を直す。`docs/` は直接さわらない。
2. テストを実行する。
   ```
   node tests/judge-test.js
   node tests/recital-test.js
   ```
3. **`sw.js` の `CACHE` の番号を1つ上げる**（例：`kuku-renshu-v1` → `kuku-renshu-v2`）。ファイルを追加・改名したら `sw.js` の `ASSETS` と `scripts/build-docs.js` の `PUBLIC` も直す。
4. 公開用フォルダを作り直す（足りないファイルや開発用ファイルの混入があれば止まる）。
   ```
   node scripts/build-docs.js
   ```
5. 公開用フォルダをローカルで確認する（任意）：`node server.js --dir docs --base /kuku-renshu/ --port 4620` → http://localhost:4620/kuku-renshu/
6. commit して push。1〜数分で公開URLに反映される。
   ```
   git add -A
   git commit -m "更新内容"
   git push
   ```

サービスワーカーは「ネットワーク優先」なので、つながっていれば次に開いたときに新しい版が使われる。ホーム画面から開いている端末で古いままなら、アプリを一度閉じて開き直す。

### ホーム画面に追加

- Android（Chrome）：メニュー「︙」→「ホーム画面に追加」（または「アプリをインストール」）
- iPad・iPhone（Safari）：共有ボタン →「ホーム画面に追加」
- PC（Chrome）：アドレスバー右の「インストール」アイコン

オフラインでも画面は開けるが、**音声認識はインターネットが必要**（ブラウザが各社のサーバーで文字にするため）。

## 端末ごとの注意

| 端末 | ブラウザ | 音声認識 | メモ |
|---|---|---|---|
| Android タブレット | Chrome | ○（使える） | 推奨 |
| PC | Chrome / Edge | ○ | 推奨 |
| iPad・iPhone | Safari | △（iOS 14.5 以降。端末の「音声入力」をオン） | 連続認識（A/B 方式・本番暗唱）の挙動は Chrome と違う可能性がある。実機未確認 |
| どれでも | Firefox | ×（音声認識なし） | 「🎤 うまくきこえない」→「○ いえた」で練習はできる |

- マイクは **https** でしか使えない（`localhost` は例外）。
- 記録は端末のブラウザの中（localStorage）だけ。端末どうしで同期しない。iPad・iPhone は Safari とホーム画面アプリで記録が別になる。
- 端末を変えるときは「おうちのひと → この端末の記録について → 記録をファイルに保存／読み込む」。

## プライバシー

- 音声や認識した文字を、独自のサーバーへ送る処理はない。外部への通信は、ブラウザの音声認識（Chrome＝Google、Safari＝Apple）と、文字のフォント（Google Fonts）だけ。
- 練習の記録（聞き取れなかったときの認識文字・本番暗唱の認識結果を含む）は端末の localStorage に残る。「成長記録をリセット」で消せる。
- 開発用ツール（テンポ計測・マイク受付方式の比較・音声認識の生ログ）は **初期状態では非表示で、ログも残さない**。「おうちのひと → 設定 → 🛠 開発用ツールを表示する」を ON にしたときだけ、認識した文字や時刻をそのタブの中（sessionStorage）に一時保存する。OFF にすると消える。

## ローカルで動かす

```
node server.js
```

→ http://localhost:4610/ を Chrome で開く（`start.bat` をダブルクリックでも可）。

GitHub Pages と同じサブディレクトリ形で確認するとき：

```
node server.js --base /kuku-renshu/ --port 4620
```

→ http://localhost:4620/kuku-renshu/

## テスト

```
node tests/judge-test.js
node tests/recital-test.js
```

全81問の 正解値・表示・読み・数値変換・A/B/C 判定と、本番暗唱の追跡（9段×のぼり/くだり×表記ゆれ・言い直し）を機械チェックする。
`tests/shop-shot.html` はお店モードを指定の状態で表示する確認用ページ（`?state=order|counting|confirmed|delivered|unlock`）。
`tests/tempo-harness.html` はマイクと読み上げを擬似的に置き換えて、テンポ（受付開始の待ち・取りこぼし）を確かめる開発用ページ（ブラウザで開く）。

## ファイル

| ファイル | 役割 |
|---|---|
| `index.html` / `style.css` | 画面 |
| `manifest.webmanifest` / `icons/` / `sw.js` | ホーム画面に追加（PWA）・オフライン表示 |
| `js/data.js` | 九九の読み方（全81問。学校の読み方に合わせるときはここだけ1問単位で編集） |
| `js/judge.js` | 認識文字列 → 数値変換と A/B/C 判定 |
| `js/store.js` | localStorage 記録・旧形式からの移行・セッション・テストモード・記録の書き出し/読み込み |
| `js/env.js` | 公開環境のチェック（https・音声認識・端末）とおうちのかたへの案内・サービスワーカー登録 |
| `js/audio.js` | 効果音（Web Audio）・読み上げ・音声認識 |
| `js/app.js` | 子ども画面の進行（1もんずつ／じゅんばん／ばらばら）・マイク受付方式 A/B/C |
| `js/recital.js` | ⭐ 本番暗唱（連続認識・系列の追跡） |
| `js/shop.js` | 🍚 ちいさな ごちそうやさん（マイクなし） |
| `js/perf.js` | 開発用のテンポ計測・音声認識の生ログ |
| `js/parent.js` | おうちのひと画面 |

## 記録の形式（v2）

```
{
  version: 2,
  settings: { voiceEnabled, soundEnabled, speechRate, voiceName, level, dan, testMode, devTools, micMode },
  multiplication: { "1": { "1": {...}, ... "9": {...} }, ... "9": {...} },
  chain: { "5": { "9": true } },
  recitation: { "5": { done, withHint, last } },
  recital: { "5": { count, autoComplete, last } },
  sessions: [ { sessionId, startedAt, endedAt, dan, mode, order, level, events: [...] } ]
}
```

旧形式（`multiplication5` + `log`）は初回読み込み時に自動移行し、移行前のデータは `kuku-renshu-v1-backup` に残す。
