const fetch = require("node-fetch");
const crypto = require("crypto");

const API_URL = process.env.CRYPTOBOT_API_URL || "https://pay.crypt.bot/api";
const API_TOKEN = process.env.CRYPTOBOT_API_TOKEN;

async function call(method, body) {
  if (!API_TOKEN) throw new Error("CRYPTOBOT_API_TOKEN не задан в .env");
  const res = await fetch(`${API_URL}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Crypto-Pay-API-Token": API_TOKEN,
    },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ? JSON.stringify(json.error) : "CryptoBot API error");
  return json.result;
}

/**
 * Создаёт инвойс в CryptoBot. asset — тикер, напр. "TON", "USDT".
 * amount — строка с суммой в этом активе.
 */
async function createCryptoBotInvoice({ asset, amount, description, payload }) {
  const result = await call("createInvoice", {
    asset,
    amount: String(amount),
    description,
    payload,
    paid_btn_name: "callback",
    paid_btn_url: process.env.PUBLIC_URL || undefined,
  });
  return result; // содержит result.pay_url и result.invoice_id
}

/**
 * Проверка подписи вебхука CryptoBot.
 * Секрет — sha256 от самого API-токена (см. документацию Crypto Pay API).
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!API_TOKEN) return false;
  const secret = crypto.createHash("sha256").update(API_TOKEN).digest();
  const check = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return check === signatureHeader;
}

module.exports = { createCryptoBotInvoice, verifyWebhookSignature };
