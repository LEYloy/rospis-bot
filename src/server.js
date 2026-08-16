require("dotenv").config();
const express = require("express");
const path = require("path");
const { bot } = require("./bot");
const db = require("./db");
const { validateInitData } = require("./auth");
const { createStarsInvoiceLink, generatePayload } = require("./payments/stars");
const { createCryptoBotInvoice, verifyWebhookSignature } = require("./payments/cryptobot");
const { buildTonTransferLink, findIncomingTonTransaction } = require("./payments/ton");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID);
const PORT = process.env.PORT || 3000;

const app = express();

// нужен raw body для проверки подписи вебхука CryptoBot
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use("/shop", express.static(path.join(__dirname, "..", "public", "shop")));
app.use("/admin", express.static(path.join(__dirname, "..", "public", "admin")));

// ---------- helpers ----------

function requireUser(req, res) {
  const { initData } = req.body || {};
  const result = validateInitData(initData, BOT_TOKEN);
  if (!result.ok) {
    res.status(401).json({ error: "unauthorized", detail: result.error });
    return null;
  }
  return result.user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.id !== ADMIN_ID) {
    res.status(403).json({ error: "forbidden" });
    return null;
  }
  return user;
}

// ---------- публичные API (витрина) ----------

app.get("/api/product", (req, res) => {
  const data = db.read();
  res.json({ product: data.product, giftTiers: data.giftTiers });
});

// находит выбранный подарок по id, либо возвращает null
function findGift(data, giftId) {
  if (!giftId) return null;
  return data.giftTiers.find((g) => g.id === giftId) || null;
}

app.post("/api/pay/stars", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const data = db.read();
    if (!data.product.active) return res.status(400).json({ error: "продукт недоступен" });

    const gift = findGift(data, req.body.giftId);
    const title = gift ? `${data.product.title} — ${gift.name}` : data.product.title;
    const amountStars = gift ? gift.stars : data.product.priceStars;

    const payload = generatePayload("stars");
    const link = await createStarsInvoiceLink(bot, {
      title,
      description: data.product.description,
      amountStars,
      payload,
    });

    db.addOrder({
      userId: user.id,
      username: user.username || null,
      method: "stars",
      amount: amountStars,
      giftId: gift ? gift.id : null,
      giftName: gift ? gift.name : null,
      payload,
    });

    res.json({ link });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal error" });
  }
});

app.post("/api/pay/cryptobot", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const { asset } = req.body;
    const data = db.read();
    if (!data.product.active) return res.status(400).json({ error: "продукт недоступен" });

    const gift = findGift(data, req.body.giftId);
    const description = gift ? `${data.product.title} — ${gift.name}` : data.product.title;
    const amountTon = gift ? gift.ton : data.product.priceTon;

    const payload = generatePayload("cb");
    const invoice = await createCryptoBotInvoice({
      asset: asset || "TON",
      amount: amountTon,
      description,
      payload,
    });

    db.addOrder({
      userId: user.id,
      username: user.username || null,
      method: "cryptobot",
      amount: amountTon,
      giftId: gift ? gift.id : null,
      giftName: gift ? gift.name : null,
      payload,
      cryptobotInvoiceId: invoice.invoice_id,
    });

    res.json({ payUrl: invoice.pay_url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal error", detail: String(e.message || e) });
  }
});

app.post("/api/pay/ton", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const data = db.read();
    if (!data.product.active) return res.status(400).json({ error: "продукт недоступен" });
    const address = process.env.TON_WALLET_ADDRESS;
    if (!address) return res.status(500).json({ error: "TON_WALLET_ADDRESS не настроен" });

    const gift = findGift(data, req.body.giftId);
    const amountTon = gift ? gift.ton : data.product.priceTon;

    const payload = generatePayload("ton");
    const link = buildTonTransferLink({ address, amountTon, comment: payload });

    const order = db.addOrder({
      userId: user.id,
      username: user.username || null,
      method: "ton",
      amount: amountTon,
      giftId: gift ? gift.id : null,
      giftName: gift ? gift.name : null,
      payload,
    });

    res.json({ link, orderId: order.id, payload });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal error" });
  }
});

app.post("/api/pay/ton/check", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const { orderId } = req.body;
    const data = db.read();
    const order = data.orders.find((o) => o.id === orderId);
    if (!order) return res.status(404).json({ error: "order not found" });

    const tx = await findIncomingTonTransaction({
      address: process.env.TON_WALLET_ADDRESS,
      payload: order.payload,
    });

    if (tx) {
      db.updateOrder(order.id, { status: "paid" });
      return res.json({ paid: true });
    }
    res.json({ paid: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal error" });
  }
});

// ---------- вебхук CryptoBot ----------

app.post("/webhooks/cryptobot", async (req, res) => {
  const signature = req.get("crypto-pay-api-signature");
  if (!verifyWebhookSignature(req.rawBody, signature)) {
    return res.status(401).send("bad signature");
  }
  const update = req.body;
  if (update.update_type === "invoice_paid") {
    const payload = update.payload && update.payload.payload;
    const order = db.findOrderByPayload(payload);
    if (order) {
      db.updateOrder(order.id, { status: "paid" });
      try {
        await bot.api.sendMessage(order.userId, "Оплата получена ✅ Спасибо! Роспись будет отправлена вам в ближайшее время.");
        await bot.api.sendMessage(
          ADMIN_ID,
          `💎 Новая оплата CryptoBot!\nОт: ${order.username ? "@" + order.username : order.userId}\nСумма: ${order.amount}\nPayload: ${payload}`
        );
      } catch (e) {
        console.error("notify error", e);
      }
    }
  }
  res.send("ok");
});

// ---------- админ API ----------

app.post("/api/admin/product/get", (req, res) => {
  const user = requireAdmin(req, res);
  if (!user) return;
  const data = db.read();
  res.json({ product: data.product });
});

app.post("/api/admin/product/update", (req, res) => {
  const user = requireAdmin(req, res);
  if (!user) return;
  const { patch } = req.body;
  const allowed = ["title", "description", "photo", "priceStars", "priceTon", "active"];
  const clean = {};
  for (const k of allowed) if (k in (patch || {})) clean[k] = patch[k];
  const product = db.updateProduct(clean);
  res.json({ product });
});

app.post("/api/admin/gifts/get", (req, res) => {
  const user = requireAdmin(req, res);
  if (!user) return;
  const data = db.read();
  res.json({ giftTiers: data.giftTiers });
});

app.post("/api/admin/gifts/update", (req, res) => {
  const user = requireAdmin(req, res);
  if (!user) return;
  const { giftTiers } = req.body;
  if (!Array.isArray(giftTiers)) return res.status(400).json({ error: "giftTiers must be array" });
  const saved = db.updateGiftTiers(giftTiers);
  res.json({ giftTiers: saved });
});

app.post("/api/admin/orders/get", (req, res) => {
  const user = requireAdmin(req, res);
  if (!user) return;
  const data = db.read();
  res.json({ orders: [...data.orders].reverse() });
});

app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});

bot.start();
console.log("Bot started");
