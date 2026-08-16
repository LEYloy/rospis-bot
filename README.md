# Rospis Bot — бот + Mini App для продажи росписи

Telegram-бот на grammY с двумя Mini App:
- **`/shop`** — витрина для покупателя (Stars / CryptoBot / TON)
- **`/admin`** — панель продавца, доступна только вам (проверка по Telegram ID + подписи initData)

## 1. Создать бота

1. `@BotFather` → `/newbot` → получите `BOT_TOKEN`.
2. `@BotFather` → `/setmenubutton` для вашего бота — можно не настраивать, кнопки открываются прямо из сообщений `/start` и `/admin`.
3. Узнайте свой Telegram ID через `@userinfobot` — это `ADMIN_ID`.

## 2. Premium-эмодзи вместо ✅

1. Отправьте себе (в Saved Messages) нужный premium-эмодзи.
2. Перешлите это сообщение боту `@RawDataBot` (или `@JsonDumpBot`) — он пришлёт JSON.
3. Найдите `"custom_emoji_id"` — впишите в `CHECK_EMOJI_ID`.

Если оставить пустым — бот отправит обычную ✅.

> Важно: у пользователей без Telegram Premium premium-эмодзи всё равно отобразится (Telegram сам показывает статический фолбэк), это ограничение платформы, а не бота.

## 3. CryptoBot (оплата в крипте)

1. Откройте `@CryptoBot` → **Crypto Pay** → **Create App**.
2. Скопируйте API-токен в `CRYPTOBOT_API_TOKEN`.
3. После деплоя на Railway зайдите в настройки приложения в `@CryptoBot` и укажите webhook URL:
   `https://ВАШ_ДОМЕН/webhooks/cryptobot`

## 4. TON-кошелёк напрямую

1. Впишите свой адрес в `TON_WALLET_ADDRESS`.
2. При нажатии «Перевести TON» покупателю открывается диплинк в Tonkeeper с суммой и комментарием-идентификатором заказа — это и есть способ сверить, кто заплатил.
3. Опционально: получите бесплатный API-ключ на `toncenter.com` и впишите в `TONCENTER_API_KEY` — тогда можно вызывать `/api/pay/ton/check`, чтобы проверять поступление автоматически. Без ключа TON-заказы просто остаются в статусе «ожидание» до ручной сверки.

## 5. Деплой: GitHub + Railway

```bash
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin <ваш_репозиторий>
git push -u origin main
```

В Railway:
1. **New Project → Deploy from GitHub repo** → выберите репозиторий.
2. Railway сам определит Node.js и запустит `npm start`.
3. **Variables** — добавьте все переменные из `.env.example`.
4. **Settings → Networking → Generate Domain** — получите публичный HTTPS-домен, впишите его в переменную `PUBLIC_URL` (без слэша на конце), например `https://rospis-bot.up.railway.app`.
5. (Рекомендуется) **Settings → Volumes** — подключите volume, примонтированный в `/app/data`, чтобы `data/db.json` (товар, прайс, заказы) не терялся при передеплое.

## 6. Зарегистрировать домен Mini App у BotFather

Telegram требует явно разрешить домен для Web App-кнопок:
`@BotFather` → выберите бота → **Bot Settings → Menu Button** или **Configure Mini App** → укажите `PUBLIC_URL`.

## Локальный запуск

```bash
cp .env.example .env   # заполните значения
npm install
npm start
```

Для локальной разработки Telegram не сможет достучаться до `localhost` — прокиньте туннель (`ngrok http 3000`) и используйте его HTTPS-адрес как `PUBLIC_URL`.

## Структура

```
src/
  bot.js        — команды /start, /admin, обработка оплаты Stars
  server.js     — Express: отдаёт Mini App + API
  db.js         — простое хранилище в data/db.json
  auth.js       — проверка подписи initData (защита /api/admin/*)
  payments/
    stars.js     — Telegram Stars (XTR)
    cryptobot.js — Crypto Pay API
    ton.js       — диплинк на перевод + опциональная проверка через toncenter
public/
  shop/    — Mini App витрины
  admin/   — Mini App админки
```

## Что стоит доделать под себя

- Реальная доставка «росписи» после оплаты — сейчас бот только уведомляет вас и покупателя, отправку файла/сообщения с результатом добавьте в `bot.on("message:successful_payment")` и в вебхук CryptoBot.
- Загрузка фото товара — поле `photo` в модели уже есть, добавьте `<input type="file">` в админку и endpoint загрузки, если нужно.
- Автопроверка TON-платежей по расписанию (сейчас только ручной вызов `/api/pay/ton/check`).
