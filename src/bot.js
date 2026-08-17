const { Bot, InlineKeyboard } = require("grammy");
const db = require("./db");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const PUBLIC_URL = process.env.PUBLIC_URL;
const CHECK_EMOJI_ID = process.env.CHECK_EMOJI_ID; // custom_emoji_id премиум-эмодзи

if (!BOT_TOKEN) throw new Error("BOT_TOKEN не задан в .env");
if (!ADMIN_ID) throw new Error("ADMIN_ID не задан в .env");

const bot = new Bot(BOT_TOKEN);

/**
 * Отправляет "Привет! это бот, для покупки росписи в телеграм <emoji>".
 * Если CHECK_EMOJI_ID задан — эмодзи отправляется как premium custom_emoji
 * (entity типа custom_emoji), иначе используется обычная ✅ как запасной вариант.
 */
async function sendGreeting(ctx) {
  const placeholder = "✅";
  const text = `Привет! это бот, для покупки росписи в телеграм ${placeholder}`;

  const kb = new InlineKeyboard().webApp("🖋 Купить роспись", `${PUBLIC_URL}/shop`);

  if (CHECK_EMOJI_ID) {
    const emojiStart = text.indexOf(placeholder);
    const entities = [
      {
        type: "custom_emoji",
        offset: [...text.slice(0, emojiStart)].length, // offset считается в UTF-16 code units
        length: [...placeholder].length,
        custom_emoji_id: CHECK_EMOJI_ID,
      },
    ];
    await ctx.api.sendMessage(ctx.chat.id, text, {
      entities,
      reply_markup: kb,
    });
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}

bot.command("start", async (ctx) => {
  await sendGreeting(ctx);
});

bot.command("admin", async (ctx) => {
  if (ctx.from?.id !== ADMIN_ID) {
    return; // молча игнорируем — не подтверждаем даже, что команда существует
  }
  const kb = new InlineKeyboard().webApp("⚙️ Открыть админку", `${PUBLIC_URL}/admin`);
  await ctx.reply("Админ-панель:", { reply_markup: kb });
});

// --- Заявки медийщиков: /signed ---
// Простой пошаговый опрос в личных сообщениях (без плагина conversations,
// состояние держим в памяти процесса — этого достаточно для одного инстанса).

const signedFlow = new Map(); // userId -> { step, name, link, reason }

function isSignedStep(userId) {
  return signedFlow.has(userId);
}

bot.command("signed", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  signedFlow.set(ctx.from.id, { step: "name" });
  await ctx.reply(
    "Заявка на подключение к MediaSigned 🖋\n\nКак вас подписывать в росписях? Напишите имя или псевдоним, под которым вы работаете."
  );
});

bot.on("message:text", async (ctx, next) => {
  const state = signedFlow.get(ctx.from.id);
  if (!state) return next();

  const text = ctx.message.text.trim();

  if (state.step === "name") {
    state.name = text;
    state.step = "link";
    return ctx.reply("Ссылка на ваш канал/соцсеть, где вас можно проверить:");
  }

  if (state.step === "link") {
    state.link = text;
    state.step = "reason";
    return ctx.reply("Коротко: почему хотите продавать роспись от себя?");
  }

  if (state.step === "reason") {
    state.reason = text;
    signedFlow.delete(ctx.from.id);

    const application = db.addApplication({
      userId: ctx.from.id,
      username: ctx.from.username || null,
      name: state.name,
      link: state.link,
      reason: state.reason,
    });

    await ctx.reply("Заявка отправлена ✅ Мы свяжемся с вами после рассмотрения.");

    const kb = new InlineKeyboard()
      .text("✅ Принять", `app_accept_${application.id}`)
      .text("❌ Отклонить", `app_decline_${application.id}`);

    await ctx.api.sendMessage(
      ADMIN_ID,
      `🆕 Заявка на MediaSigned #${application.id}\n\n` +
        `Имя: ${application.name}\n` +
        `Ссылка: ${application.link}\n` +
        `От: @${application.username || application.userId}\n\n` +
        `Причина: ${application.reason}`,
      { reply_markup: kb }
    );
    return;
  }
});

bot.on("callback_query:data", async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  const match = data.match(/^app_(accept|decline)_(\d+)$/);
  if (!match) return next();

  if (ctx.from.id !== ADMIN_ID) {
    return ctx.answerCallbackQuery({ text: "Только для администратора" });
  }

  const [, action, idStr] = match;
  const id = Number(idStr);
  const application = db.findApplication(id);
  if (!application) return ctx.answerCallbackQuery({ text: "Заявка не найдена" });
  if (application.status !== "pending") {
    return ctx.answerCallbackQuery({ text: "Уже обработана" });
  }

  const status = action === "accept" ? "accepted" : "declined";
  db.updateApplication(id, { status });

  await ctx.editMessageText(
    ctx.callbackQuery.message.text + `\n\n${status === "accepted" ? "✅ Принята" : "❌ Отклонена"}`
  );
  await ctx.answerCallbackQuery();

  const notifyText =
    status === "accepted"
      ? "Ваша заявка на MediaSigned принята ✅ Мы свяжемся с вами, чтобы настроить продажу росписи от вашего имени."
      : "К сожалению, ваша заявка на MediaSigned отклонена.";
  try {
    await ctx.api.sendMessage(application.userId, notifyText);
  } catch (e) {
    console.error("не удалось уведомить заявителя:", e.message);
  }
});

// --- Оплата Telegram Stars ---

bot.on("pre_checkout_query", async (ctx) => {
  // здесь можно дополнительно провалидировать payload/наличие товара
  await ctx.answerPreCheckoutQuery(true);
});

bot.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message.successful_payment;
  const order = db.findOrderByPayload(payment.invoice_payload);
  if (order) {
    db.updateOrder(order.id, {
      status: "paid",
      telegramChargeId: payment.telegram_payment_charge_id,
    });
  }
  await ctx.reply("Оплата получена ✅ Спасибо! Роспись будет отправлена вам в ближайшее время.");
  await ctx.api.sendMessage(
    ADMIN_ID,
    `💫 Новая оплата Stars!\nОт: @${ctx.from.username || ctx.from.id}\nСумма: ${payment.total_amount} XTR\nPayload: ${payment.invoice_payload}`
  );
});

module.exports = { bot };
