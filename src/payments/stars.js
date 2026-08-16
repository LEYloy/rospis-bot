const crypto = require("crypto");

/**
 * Создаёт ссылку на оплату Telegram Stars (валюта XTR).
 * Отдельный provider_token не нужен — это встроенная в Telegram валюта.
 * Открывается на фронте через Telegram.WebApp.openInvoice(link).
 */
async function createStarsInvoiceLink(bot, { title, description, amountStars, payload }) {
  const link = await bot.api.createInvoiceLink({
    title,
    description,
    payload,
    currency: "XTR",
    prices: [{ label: title, amount: amountStars }],
    // provider_token не указываем — обязателен только для фиатных валют
  });
  return link;
}

function generatePayload(prefix = "order") {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

module.exports = { createStarsInvoiceLink, generatePayload };
