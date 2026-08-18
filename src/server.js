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
app.use("/creator", express.static(path.join(__dirname, "..", "public", "creator")));

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

// ---------- каталог медиек ----------

app.get("/api/creators", (req, res) => {
  const creators = db.listActiveCreators().map((c) => ({
    id: c.id,
    username: c.username,
    name: c.name,
    description: c.description,
    link: c.link,
    priceStars: c.priceStars,
    ordersCount: c.ordersCount || 0,
    bannerUrl: c.bannerUrl || null,
    avatarUrl: `/api/avatar/${c.userId}`,
  }));
  res.json({ creators });
});

// подарки, которые именно эта медийка предлагает, с её собственными ценами
app.get("/api/creators/:id/gifts", (req, res) => {
  const id = Number(req.params.id);
  const gifts = db.getEffectiveCreatorGifts(id, { onlyEnabled: true });
  res.json({ gifts });
});

// проксирует фото профиля пользователя из Telegram, не раскрывая токен бота на фронте
app.get("/api/avatar/:userId", async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const photos = await bot.api.getUserProfilePhotos(userId, { limit: 1 });
    if (!photos.total_count) return res.status(404).end();
    const sizes = photos.photos[0];
    const fileId = sizes[sizes.length - 1].file_id; // самый крупный размер
    const file = await bot.api.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(404).end();
    res.set("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
    res.set("Cache-Control", "public, max-age=3600");
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(404).end();
  }
});

app.post("/api/creator/me", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const creator = db.findCreatorByUserId(user.id);
  if (!creator) return res.status(404).json({ error: "не найдено" });
  res.json({ creator });
});

app.post("/api/creator/update", (req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const creator = db.findCreatorByUserId(user.id);
  if (!creator) return res.status(404).json({ error: "не найдено" });

  const { patch } = req.body;
  const allowed = ["description", "link", "priceStars", "bannerUrl", "active", "giftOverrides"];
  const clean = {};
  for (const k of allowed) if (k in (patch || {})) clean[k] = patch[k];
  const updated = db.updateCreator(creator.id, clean);
  res.json({ creator: updated });
});

// находит выбранный подарок по id, либо возвращает null
function findGift(data, giftId) {
  if (!giftId) return null;
  return data.giftTiers.find((g) => g.id === giftId) || null;
}

function findCreator(giftId, creatorId) {
  if (!creatorId) return null;
  return db.findCreatorById(Number(creatorId));
}

// считает итоговую цену подарка с учётом персональной цены медийки и количества
function resolveOrderPricing(req) {
  const data = db.read();
  const qty = Math.min(20, Math.max(1, Number(req.body.qty) || 1));
  const creatorId = req.body.creatorId ? Number(req.body.creatorId) : null;

  let unitStars, unitTon, giftName, creator = null;

  if (creatorId) {
    creator = db.findCreatorById(creatorId);
    const gifts = db.getEffectiveCreatorGifts(creatorId, { onlyEnabled: false });
    const g = gifts.find((x) => x.id === req.body.giftId);
    if (!g || !g.enabled) throw Object.assign(new Error("этот подарок недоступен у медийки"), { status: 400 });
    unitStars = g.stars;
    unitTon = g.ton;
    giftName = g.name;
  } else {
    const gift = findGift(data, req.body.giftId);
    unitStars = gift ? gift.stars : data.product.priceStars;
    unitTon = gift ? gift.ton : data.product.priceTon;
    giftName = gift ? gift.name : null;
  }

  return {
    data,
    creator,
    qty,
    giftId: req.body.giftId || null,
    giftName,
    caption: (req.body.caption || "").slice(0, 500),
    giftToUsername: (req.body.giftToUsername || "").replace(/^@/, "").slice(0, 64) || null,
    totalStars: unitStars * qty,
    totalTon: Math.round(unitTon * qty * 100) / 100,
  };
}

app.post("/api/pay/stars", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const { data, creator, qty, giftId, giftName, caption, giftToUsername, totalStars } = resolveOrderPricing(req);
    if (!data.product.active) return res.status(400).json({ error: "продукт недоступен" });

    const title = giftName ? `${data.product.title} — ${giftName}${qty > 1 ? ` ×${qty}` : ""}` : data.product.title;
    // Telegram требует непустой description — подстраховываемся на случай,
    // если поле "Описание" в /admin оставили пустым
    const description = (data.product.description && data.product.description.trim()) || title || "Роспись";

    const payload = generatePayload("stars");
    const link = await createStarsInvoiceLink(bot, {
      title,
      description,
      amountStars: totalStars,
      payload,
    });

    db.addOrder({
      userId: user.id,
      username: user.username || null,
      method: "stars",
      amount: totalStars,
      qty,
      giftId,
      giftName,
      caption: caption || null,
      giftToUsername,
      creatorId: creator ? creator.id : null,
      payload,
    });

    res.json({ link });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: "internal error", detail: String(e.message || e) });
  }
});

app.post("/api/pay/cryptobot", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const { asset } = req.body;
    const { data, creator, qty, giftId, giftName, caption, giftToUsername, totalTon } = resolveOrderPricing(req);
    if (!data.product.active) return res.status(400).json({ error: "продукт недоступен" });

    const description = giftName ? `${data.product.title} — ${giftName}${qty > 1 ? ` ×${qty}` : ""}` : data.product.title;

    const payload = generatePayload("cb");
    const invoice = await createCryptoBotInvoice({
      asset: asset || "TON",
      amount: totalTon,
      description,
      payload,
    });

    db.addOrder({
      userId: user.id,
      username: user.username || null,
      method: "cryptobot",
      amount: totalTon,
      qty,
      giftId,
      giftName,
      caption: caption || null,
      giftToUsername,
      creatorId: creator ? creator.id : null,
      payload,
      cryptobotInvoiceId: invoice.invoice_id,
    });

    res.json({ payUrl: invoice.pay_url });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: "internal error", detail: String(e.message || e) });
  }
});

app.post("/api/pay/ton", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const { data, creator, qty, giftId, giftName, caption, giftToUsername, totalTon } = resolveOrderPricing(req);
    if (!data.product.active) return res.status(400).json({ error: "продукт недоступен" });
    const address = process.env.TON_WALLET_ADDRESS;
    if (!address) return res.status(500).json({ error: "TON_WALLET_ADDRESS не настроен" });

    const payload = generatePayload("ton");
    const link = buildTonTransferLink({ address, amountTon: totalTon, comment: payload });

    const order = db.addOrder({
      userId: user.id,
      username: user.username || null,
      method: "ton",
      amount: totalTon,
      qty,
      giftId,
      giftName,
      caption: caption || null,
      giftToUsername,
      creatorId: creator ? creator.id : null,
      payload,
    });

    res.json({ link, orderId: order.id, payload });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: "internal error", detail: String(e.message || e) });
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
      if (order.creatorId) db.incrementCreatorOrders(order.creatorId);
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
      if (order.creatorId) db.incrementCreatorOrders(order.creatorId);
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
