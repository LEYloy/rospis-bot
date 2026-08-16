const fetch = require("node-fetch");

/**
 * Формирует ссылку для перевода TON через кошелёк (Tonkeeper и совместимые).
 * amountTon — сумма в TON (не нанотонах), comment — уникальный payload заказа,
 * по которому потом можно найти транзакцию в истории адреса.
 */
function buildTonTransferLink({ address, amountTon, comment }) {
  const nano = Math.round(amountTon * 1e9);
  const url = new URL(`https://app.tonkeeper.com/transfer/${address}`);
  url.searchParams.set("amount", String(nano));
  if (comment) url.searchParams.set("text", comment);
  return url.toString();
}

/**
 * Опциональная проверка входящих транзакций на адрес через toncenter.com.
 * Требует TONCENTER_API_KEY. Ищет транзакцию с комментарием === payload.
 * Это best-effort проверка для ручной кнопки "Проверить оплату" в админке —
 * для продакшена лучше слушать транзакции через собственный индексатор.
 */
async function findIncomingTonTransaction({ address, payload }) {
  const apiKey = process.env.TONCENTER_API_KEY;
  const base = "https://toncenter.com/api/v2/getTransactions";
  const url = `${base}?address=${encodeURIComponent(address)}&limit=20${apiKey ? `&api_key=${apiKey}` : ""}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) return null;
  const tx = (json.result || []).find((t) => {
    const msg = t.in_msg && t.in_msg.message;
    return msg && msg.includes(payload);
  });
  return tx || null;
}

module.exports = { buildTonTransferLink, findIncomingTonTransaction };
