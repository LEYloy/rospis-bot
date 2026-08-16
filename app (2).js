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

let selectedGift = null;

function renderPayAmounts() {
  if (selectedGift) {
    el("starsAmount").textContent = `${selectedGift.stars} ★`;
    el("cryptoAmount").textContent = `${selectedGift.ton} TON`;
    el("tonAmount").textContent = `${selectedGift.ton} TON`;
    el("payStack").hidden = false;
  } else {
    el("payStack").hidden = true;
  }
}

function selectGift(gift, cardEl) {
  selectedGift = gift;
  document.querySelectorAll(".gift-card").forEach((c) => c.classList.remove("selected"));
  cardEl.classList.add("selected");
  setStatus("");
  renderPayAmounts();
}

async function load() {
  try {
    const res = await fetch("/api/product");
    const { product, giftTiers } = await res.json();

    el("title").textContent = product.title;
    el("desc").textContent = product.description;

    if (!product.active) {
      setStatus("Сейчас продажи временно закрыты", "error");
      return;
    }

    if (giftTiers && giftTiers.length) {
      const grid = el("giftsGrid");
      grid.innerHTML = "";
      giftTiers.forEach((g) => {
        const card = document.createElement("div");
        card.className = "gift-card";
        card.title = g.name;
        const media = g.photo
          ? `<img src="${g.photo}" alt="${g.name}" />`
          : `<span class="g-emoji">${g.emoji || "🎁"}</span>`;
        card.innerHTML = `
          <div class="g-media">${media}</div>
          <span class="g-price"><span class="g-price-icon">★</span>${g.stars}</span>
        `;
        card.addEventListener("click", () => selectGift(g, card));
        grid.appendChild(card);
      });
      el("giftsCard").hidden = false;
    }
  } catch (e) {
    setStatus("Не удалось загрузить данные", "error");
  }
}

function requireGiftSelected() {
  if (!selectedGift) {
    setStatus("Сначала выберите подарок", "error");
    return false;
  }
  return true;
}

el("btnStars").addEventListener("click", async () => {
  if (!requireGiftSelected()) return;
  setStatus("Готовим счёт…");
  try {
    const { link } = await api("/api/pay/stars", { giftId: selectedGift.id });
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
  if (!requireGiftSelected()) return;
  setStatus("Создаём счёт в CryptoBot…");
  try {
    const { payUrl } = await api("/api/pay/cryptobot", { asset: "TON", giftId: selectedGift.id });
    if (payUrl.startsWith("https://t.me/")) {
      tg.openTelegramLink(payUrl); // t.me-ссылка — переключает прямо на CryptoBot внутри Telegram, без браузера
    } else {
      tg.openLink(payUrl);
    }
    setStatus("Завершите оплату в CryptoBot");
  } catch (e) {
    setStatus("Ошибка: " + e.message, "error");
  }
});

el("btnTon").addEventListener("click", async () => {
  if (!requireGiftSelected()) return;
  setStatus("Готовим перевод…");
  try {
    const { link } = await api("/api/pay/ton", { giftId: selectedGift.id });
    tg.openLink(link);
    setStatus("Подтвердите перевод в кошельке. Статус проверит продавец после получения.");
  } catch (e) {
    setStatus("Ошибка: " + e.message, "error");
  }
});

load();
