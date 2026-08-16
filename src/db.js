const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

const DEFAULT_DATA = {
  product: {
    title: "Роспись",
    description: "Персональная роспись, записанная лично для вас.",
    photo: null,
    priceStars: 500,
    priceTon: 5,
    active: true,
  },
  // каталог подарков, которые выбирает сам покупатель — 11 позиций.
  // photo — прямая ссылка на картинку (если пусто, показывается эмодзи-заглушка).
  // ton — цена в TON для оплаты через CryptoBot / прямой перевод.
  giftTiers: [
    { id: "heart", name: "Сердце", stars: 15, ton: 0.15, photo: null, emoji: "💝" },
    { id: "bear", name: "Мишка", stars: 15, ton: 0.15, photo: null, emoji: "🧸" },
    { id: "rose", name: "Роза", stars: 25, ton: 0.25, photo: null, emoji: "🌹" },
    { id: "gift", name: "Подарок", stars: 25, ton: 0.25, photo: null, emoji: "🎁" },
    { id: "cake", name: "Торт", stars: 50, ton: 0.5, photo: null, emoji: "🎂" },
    { id: "bouquet", name: "Букет", stars: 50, ton: 0.5, photo: null, emoji: "💐" },
    { id: "rocket", name: "Ракета", stars: 50, ton: 0.5, photo: null, emoji: "🚀" },
    { id: "champagne", name: "Шампанское", stars: 50, ton: 0.5, photo: null, emoji: "🍾" },
    { id: "cup", name: "Кубок", stars: 100, ton: 1, photo: null, emoji: "🏆" },
    { id: "ring", name: "Кольцо", stars: 100, ton: 1, photo: null, emoji: "💍" },
    { id: "diamond", name: "Алмаз", stars: 100, ton: 1, photo: null, emoji: "💎" },
  ],
  orders: [],
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
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
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

module.exports = {
  read,
  write,
  updateProduct,
  updateGiftTiers,
  addOrder,
  updateOrder,
  findOrderByPayload,
};
