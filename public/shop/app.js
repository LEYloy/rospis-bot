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

// --- шторка (bottom sheet) ---

function openSheet() {
  el("sheetOverlay").hidden = false;
  requestAnimationFrame(() => el("sheetOverlay").classList.add("open"));
  showDetailScreen();
}

function closeSheet() {
  el("sheetOverlay").classList.remove("open");
  setTimeout(() => {
    el("sheetOverlay").hidden = true;
  }, 220);
  selectedGift = null;
  setStatus("");
}

function showDetailScreen() {
  el("screenDetail").classList.remove("hidden");
  el("screenPay").classList.add("hidden");
}

function showPayScreen() {
  el("screenDetail").classList.add("hidden");
  el("screenPay").classList.remove("hidden");
  el("starsAmount").textContent = `${selectedGift.stars} ★`;
  el("cryptoAmount").textContent = `${selectedGift.ton} TON`;
  el("tonAmount").textContent = `${selectedGift.ton} TON`;
  el("paySummary").textContent = `${selectedGift.stars} ★ · ${selectedGift.name}`;
  setStatus("");
}

function selectGift(gift) {
  selectedGift = gift;
  el("sheetName").textContent = gift.name;
  el("sheetPrice").textContent = `${gift.stars} ★`;
  const img = el("sheetImg");
  const emoji = el("sheetEmoji");
  if (gift.photo) {
    img.src = gift.photo;
    img.hidden = false;
    emoji.hidden = true;
  } else {
    img.hidden = true;
    emoji.textContent = gift.emoji || "🎁";
    emoji.hidden = false;
  }
  openSheet();
}

el("sheetOverlay").addEventListener("click", (e) => {
  if (e.target === el("sheetOverlay")) closeSheet();
});
el("btnOpenPay").addEventListener("click", showPayScreen);
el("btnBack").addEventListener("click", showDetailScreen);

// --- загрузка каталога ---

async function loadCreators() {
  try {
    const res = await fetch("/api/creators");
    const { creators } = await res.json();
    if (!creators || !creators.length) return;

    const list = el("creatorsList");
    list.innerHTML = "";
    creators.forEach((c) => {
      const row = document.createElement("div");
      row.className = "creator-row";
      const initial = (c.name || c.username || "?").trim().charAt(0).toUpperCase();
      row.innerHTML = `
        <div class="creator-avatar" style="background-image:url('${c.avatarUrl}')">
          <span class="creator-avatar-fallback">${initial}</span>
        </div>
        <div class="creator-meta">
          <div class="creator-name">${c.name}${c.username ? ` <span class="creator-username">@${c.username}</span>` : ""}</div>
          <div class="creator-desc">${c.description}</div>
        </div>
        <div class="creator-side">
          <div class="creator-orders">${c.ordersCount} заказ.</div>
          <div class="creator-price">от ${c.priceStars} ★</div>
        </div>
      `;
      const img = row.querySelector(".creator-avatar");
      const testImg = new Image();
      testImg.onerror = () => img.classList.add("no-avatar");
      testImg.src = c.avatarUrl;

      row.addEventListener("click", () => {
        if (c.link) tg.openLink(c.link.startsWith("http") ? c.link : `https://${c.link}`);
      });
      list.appendChild(row);
    });
    el("creatorsCard").hidden = false;
  } catch (e) {
    // тихо игнорируем — каталог медиек не критичен для основной покупки
  }
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
        card.addEventListener("click", () => selectGift(g));
        grid.appendChild(card);
      });
      el("giftsCard").hidden = false;
    }
  } catch (e) {
    setStatus("Не удалось загрузить данные", "error");
  }
}

// --- оплата ---

el("btnStars").addEventListener("click", async () => {
  if (!selectedGift) return;
  setStatus("Готовим счёт…");
  try {
    const { link } = await api("/api/pay/stars", { giftId: selectedGift.id });
    tg.openInvoice(link, (status) => {
      if (status === "paid") {
        setStatus("Оплата прошла успешно ✅", "ok");
        setTimeout(closeSheet, 1200);
      } else if (status === "cancelled") setStatus("Оплата отменена");
      else if (status === "failed") setStatus("Оплата не прошла", "error");
    });
  } catch (e) {
    setStatus("Ошибка: " + e.message, "error");
  }
});

el("btnCrypto").addEventListener("click", async () => {
  if (!selectedGift) return;
  setStatus("Создаём счёт в CryptoBot…");
  try {
    const { payUrl } = await api("/api/pay/cryptobot", { asset: "TON", giftId: selectedGift.id });
    if (payUrl.startsWith("https://t.me/")) {
      tg.openTelegramLink(payUrl);
    } else {
      tg.openLink(payUrl);
    }
    setStatus("Завершите оплату в CryptoBot");
  } catch (e) {
    setStatus("Ошибка: " + e.message, "error");
  }
});

el("btnTon").addEventListener("click", async () => {
  if (!selectedGift) return;
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
loadCreators();
