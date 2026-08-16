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
