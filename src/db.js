const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

const DEFAULT_DATA = {
  product: {
    title: "MediaSigned",
    description: "Роспись от медиек прямо в мини-приложении Telegram!",
    photo: null,
    priceStars: 500,
    priceTon: 5,
    active: true,
  },
  // каталог подарков, которые выбирает сам покупатель — 11 позиций.
  // photo — прямая ссылка на картинку (если пусто, показывается эмодзи-заглушка).
  // ton — цена в TON для оплаты через CryptoBot / прямой перевод.
  giftTiers: [
    { id: "heart", name: "Сердце", stars: 15, ton: 0.15, photo: "https://api.changes.tg/original/5170145012310081615.png", emoji: "💝" },
    { id: "bear", name: "Мишка", stars: 15, ton: 0.15, photo: "https://api.changes.tg/original/5170233102089322756.png", emoji: "🧸" },
    { id: "rose", name: "Роза", stars: 25, ton: 0.25, photo: "https://api.changes.tg/original/5168103777563050263.png", emoji: "🌹" },
    { id: "gift", name: "Подарок", stars: 25, ton: 0.25, photo: "https://api.changes.tg/original/5170250947678437525.png", emoji: "🎁" },
    { id: "cake", name: "Торт", stars: 50, ton: 0.5, photo: "https://api.changes.tg/original/5170144170496491616.png", emoji: "🎂" },
    { id: "bouquet", name: "Букет", stars: 50, ton: 0.5, photo: "https://api.changes.tg/original/5170314324215857265.png", emoji: "💐" },
    { id: "rocket", name: "Ракета", stars: 50, ton: 0.5, photo: "https://api.changes.tg/original/5170564780938756245.png", emoji: "🚀" },
    { id: "champagne", name: "Шампанское", stars: 50, ton: 0.5, photo: "https://api.changes.tg/original/6028601630662853006.png", emoji: "🍾" },
    { id: "cup", name: "Кубок", stars: 100, ton: 1, photo: "https://cdn.changes.tg/gifts/originals/5168043875654172773/Original.png", emoji: "🏆" },
    { id: "ring", name: "Кольцо", stars: 100, ton: 1, photo: "https://api.changes.tg/original/5170690322832818290.png", emoji: "💍" },
    { id: "diamond", name: "Алмаз", stars: 100, ton: 1, photo: "https://api.changes.tg/original/5170521118301225164.png", emoji: "💎" },
  ],
  orders: [],
  applications: [],
};

function ensureFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DATA, null, 2));
  }
}

function read() {
  ensureFile();
  const data = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  return migrate(data);
}

// Дозаполняет уже сохранённые giftTiers недостающими полями (photo/ton/emoji),
// если файл data/db.json был создан более старой версией кода. Не трогает
// значения, уже выставленные вручную в админке (например изменённую цену).
function migrate(data) {
  if (!Array.isArray(data.giftTiers)) return data;
  let changed = false;
  data.giftTiers = data.giftTiers.map((g) => {
    const base = DEFAULT_DATA.giftTiers.find((d) => d.id === g.id);
    if (!base) return g;
    const merged = { ...g };
    if (merged.ton === undefined) { merged.ton = base.ton; changed = true; }
    if (!merged.photo) { merged.photo = base.photo; changed = true; }
    if (!merged.emoji) { merged.emoji = base.emoji; changed = true; }
    return merged;
  });
  if (changed) write(data);
  return data;
}

function write(data) {
  ensureFile();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function updateProduct(patch) {
  const data = read();
  data.product = { ...data.product, ...patch };
  write(data);
  return data.product;
}

function updateGiftTiers(tiers) {
  const data = read();
  data.giftTiers = tiers;
  write(data);
  return data.giftTiers;
}

function addOrder(order) {
  const data = read();
  const record = {
    id: data.orders.length + 1,
    createdAt: new Date().toISOString(),
    status: "pending",
    ...order,
  };
  data.orders.push(record);
  write(data);
  return record;
}

function updateOrder(id, patch) {
  const data = read();
  const idx = data.orders.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  data.orders[idx] = { ...data.orders[idx], ...patch };
  write(data);
  return data.orders[idx];
}

function findOrderByPayload(payload) {
  const data = read();
  return data.orders.find((o) => o.payload === payload) || null;
}

// --- заявки медийщиков на подключение (/signed) ---

function addApplication(app) {
  const data = read();
  if (!Array.isArray(data.applications)) data.applications = [];
  const record = {
    id: data.applications.length + 1,
    createdAt: new Date().toISOString(),
    status: "pending",
    ...app,
  };
  data.applications.push(record);
  write(data);
  return record;
}

function updateApplication(id, patch) {
  const data = read();
  const idx = (data.applications || []).findIndex((a) => a.id === id);
  if (idx === -1) return null;
  data.applications[idx] = { ...data.applications[idx], ...patch };
  write(data);
  return data.applications[idx];
}

function findApplication(id) {
  const data = read();
  return (data.applications || []).find((a) => a.id === id) || null;
}

module.exports = {
  read,
  write,
  updateProduct,
  updateGiftTiers,
  addOrder,
  updateOrder,
  findOrderByPayload,
  addApplication,
  updateApplication,
  findApplication,
};
