const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const initData = tg?.initData || "";

const el = (id) => document.getElementById(id);
const statusEl = el("status");

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.className = "status" + (kind ? " " + kind : "");
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, ...(body || {}) }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "request failed");
  return json;
}

async function load() {
  try {
    const res = await fetch("/api/product");
    const { product, giftTiers } = await res.json();

    el("title").textContent = product.title;
    el("desc").textContent = product.description;
    el("starsAmount").textContent = `${product.priceStars} ★`;
    el("cryptoAmount").textContent = `${product.priceTon} TON`;
    el("tonAmount").textContent = `${product.priceTon} TON`;

    if (!product.active) {
      setStatus("Сейчас продажи временно закрыты", "error");
      return;
    }

    el("payStack").hidden = false;

    if (giftTiers && giftTiers.length) {
      const grid = el("giftsGrid");
      grid.innerHTML = "";
      giftTiers.forEach((g) => {
        const chip = document.createElement("div");
        chip.className = "gift-chip";
        chip.innerHTML = `<span class="g-name">${g.name}</span><span class="g-price">${g.stars} ★</span>`;
        grid.appendChild(chip);
      });
      el("giftsCard").hidden = false;
    }
  } catch (e) {
    setStatus("Не удалось загрузить данные", "error");
  }
}

el("btnStars").addEventListener("click", async () => {
  setStatus("Готовим счёт…");
  try {
    const { link } = await api("/api/pay/stars");
    tg.openInvoice(link, (status) => {
      if (status === "paid") setStatus("Оплата прошла успешно ✅", "ok");
      else if (status === "cancelled") setStatus("Оплата отменена");
      else if (status === "failed") setStatus("Оплата не прошла", "error");
    });
  } catch (e) {
    setStatus("Ошибка: " + e.message, "error");
  }
});

el("btnCrypto").addEventListener("click", async () => {
  setStatus("Создаём счёт в CryptoBot…");
  try {
    const { payUrl } = await api("/api/pay/cryptobot", { asset: "TON" });
    tg.openLink(payUrl);
    setStatus("Завершите оплату в открывшемся окне CryptoBot");
  } catch (e) {
    setStatus("Ошибка: " + e.message, "error");
  }
});

el("btnTon").addEventListener("click", async () => {
  setStatus("Готовим перевод…");
  try {
    const { link } = await api("/api/pay/ton");
    tg.openLink(link);
    setStatus("Подтвердите перевод в кошельке. Статус проверит продавец после получения.");
  } catch (e) {
    setStatus("Ошибка: " + e.message, "error");
  }
});

load();
