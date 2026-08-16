const crypto = require("crypto");

/**
 * Проверяет подпись initData, которую Telegram WebApp передаёт фронтенду.
 * Без этой проверки любой человек может подделать запрос к /api/admin/*,
 * просто открыв Mini App URL напрямую в браузере и представившись админом.
 *
 * Возвращает { ok, user } — user.id можно сравнивать с ADMIN_ID.
 */
function validateInitData(initData, botToken) {
  if (!initData || typeof initData !== "string") {
    return { ok: false, error: "no initData" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "no hash" };
  params.delete("hash");

  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) {
    return { ok: false, error: "bad signature" };
  }

  // защита от повторного использования старого initData (не обязательно, но полезно)
  const authDate = Number(params.get("auth_date") || 0);
  const ageSeconds = Date.now() / 1000 - authDate;
  if (ageSeconds > 86400) {
    return { ok: false, error: "initData expired" };
  }

  let user = null;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    user = null;
  }

  return { ok: true, user };
}

module.exports = { validateInitData };
