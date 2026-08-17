const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const initData = tg?.initData || "";

const el = (id) => document.getElementById(id);
const pageStatusEl = el("status");

function setPageStatus(text, kind) {
  pageStatusEl.textContent = text || "";
  pageStatusEl.className = "status" + (kind ? " " + kind : "");
}

// статус внутри шторки — виден и на экране деталей, и на экране оплаты
function setSheetStatus(text, kind) {
  [el("sheetStatus"), el("sheetStatus2")].forEach((node) => {
    if (!node) return;
    node.textContent = text || "";
    node.className = "sheet-status" + (kind ? " " + kind : "");
  });
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, ...(body || {}) }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.detail || "request failed");
  return json;
}

let giftTiers = [];
let selectedCreator = null;
let selectedGift = null;

// --- шторка (bottom sheet) с тремя экранами: подарки медийки → деталь → оплата ---

function showScreen(id) {
  ["screenGifts", "screenDetail", "screenPay"].forEach((s) => {
    el(s).classList.toggle("hidden", s !== id);
  });
  setSheetStatus("");
}

function openSheetForCreator(creator) {
  selectedCreator = creator;
  selectedGift = null;

  el("sheetCreatorName").textContent = creator.name;
  el("sheetCreatorDesc").textContent = creator.description || "";
  el("sheetCreatorAvatar").style.backgroundImage = `url('${creator.avatarUrl}')`;

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

  el("sheetOverlay").hidden = false;
  requestAnimationFrame(() => el("sheetOverlay").classList.add("open"));
  showScreen("screenGifts");
}

function closeSheet() {
  el("sheetOverlay").classList.remove("open");
  setTimeout(() => {
    el("sheetOverlay").hidden = true;
  }, 220);
  selectedCreator = null;
  selectedGift = null;
}

el("sheetOverlay").addEventListener("click", (e) => {
  if (e.target === el("sheetOverlay")) closeSheet();
});

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
  showScreen("screenDetail");
}

el("btnBackToGifts").addEventListener("click", () => showScreen("screenGifts"));
el("btnBack").addEventListener("click", () => showScreen("screenDetail"));

el("btnOpenPay").addEventListener("click", () => {
  el("starsAmount").textContent = `${selectedGift.stars} ★`;
  el("cryptoAmount").textContent = `${selectedGift.ton} TON`;
  el("tonAmount").textContent = `${selectedGift.ton} TON`;
  el("paySummary").textContent = `${selectedGift.stars} ★ · ${selectedGift.name}`;
  showScreen("screenPay");
});

// --- загрузка каталога подарков (используется внутри шторки) и списка медиек ---

async function loadGiftTiers() {
  const res = await fetch("/api/product");
  const { product, giftTiers: tiers } = await res.json();
  el("title").textContent = product.title;
  el("desc").textContent = product.description;
  giftTiers = tiers || [];
  if (!product.active) setPageStatus("Сейчас продажи временно закрыты", "error");
}

async function loadCreators() {
  try {
    const res = await fetch("/api/creators");
    const { creators } = await res.json();
    if (!creators || !creators.length) {
      setPageStatus("Пока нет ни одной медийки в каталоге");
      return;
    }

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
      const avatarBox = row.querySelector(".creator-avatar");
      const testImg = new Image();
      testImg.onerror = () => avatarBox.classList.add("no-avatar");
      testImg.src = c.avatarUrl;

      row.addEventListener("click", () => openSheetForCreator(c));
      list.appendChild(row);
    });
    el("creatorsCard").hidden = false;
  } catch (e) {
    setPageStatus("Не удалось загрузить список медиек", "error");
  }
}

// --- оплата ---

el("btnStars").addEventListener("click", async () => {
  if (!selectedGift) return;
  setSheetStatus("Готовим счёт…");
  try {
    const { link } = await api("/api/pay/stars", {
      giftId: selectedGift.id,
      creatorId: selectedCreator ? selectedCreator.id : null,
    });
    tg.openInvoice(link, (status) => {
      if (status === "paid") {
        setSheetStatus("Оплата прошла успешно ✅", "ok");
        setTimeout(closeSheet, 1200);
      } else if (status === "cancelled") setSheetStatus("Оплата отменена");
      else if (status === "failed") setSheetStatus("Оплата не прошла", "error");
    });
  } catch (e) {
    setSheetStatus("Ошибка: " + e.message, "error");
  }
});

el("btnCrypto").addEventListener("click", async () => {
  if (!selectedGift) return;
  setSheetStatus("Создаём счёт в CryptoBot…");
  try {
    const { payUrl } = await api("/api/pay/cryptobot", {
      asset: "TON",
      giftId: selectedGift.id,
      creatorId: selectedCreator ? selectedCreator.id : null,
    });
    if (payUrl.startsWith("https://t.me/")) {
      tg.openTelegramLink(payUrl);
    } else {
      tg.openLink(payUrl);
    }
    setSheetStatus("Завершите оплату в CryptoBot");
  } catch (e) {
    setSheetStatus("Ошибка: " + e.message, "error");
  }
});

el("btnTon").addEventListener("click", async () => {
  if (!selectedGift) return;
  setSheetStatus("Готовим перевод…");
  try {
    const { link } = await api("/api/pay/ton", {
      giftId: selectedGift.id,
      creatorId: selectedCreator ? selectedCreator.id : null,
    });
    tg.openLink(link);
    setSheetStatus("Подтвердите перевод в кошельке. Статус проверит продавец после получения.");
  } catch (e) {
    setSheetStatus("Ошибка: " + e.message, "error");
  }
});

loadGiftTiers();
loadCreators();
