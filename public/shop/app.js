const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const initData = tg?.initData || "";

const el = (id) => document.getElementById(id);
const pageStatusEl = el("status");

// --- TonConnect: подключение кошелька для прямой оплаты TON без выхода из мини-аппы ---
const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
  manifestUrl: `${location.origin}/tonconnect-manifest.json`,
});

function shortAddr(addr) {
  return addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : "";
}

function renderWalletStatus() {
  const statusEl = el("walletStatus");
  const btn = el("walletConnectBtn");
  if (tonConnectUI.connected && tonConnectUI.account) {
    statusEl.firstChild.textContent = `Кошелёк: ${shortAddr(tonConnectUI.account.address)} · `;
    btn.textContent = "отключить";
  } else {
    statusEl.firstChild.textContent = "Кошелёк не подключен · ";
    btn.textContent = "подключить";
  }
}

tonConnectUI.onStatusChange(() => renderWalletStatus());

el("walletConnectBtn").addEventListener("click", () => {
  if (tonConnectUI.connected) {
    tonConnectUI.disconnect();
  } else {
    tonConnectUI.openModal();
  }
});

function setPageStatus(text, kind) {
  pageStatusEl.textContent = text || "";
  pageStatusEl.className = "status" + (kind ? " " + kind : "");
}

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
  if (!res.ok) throw new Error(json.detail || json.error || "request failed");
  return json;
}

let selectedCreator = null;
let selectedGift = null;
let qty = 1;
let friendUsername = null;

// --- шторка (bottom sheet): подарки медийки → деталь → оплата ---

function showScreen(id) {
  ["screenGifts", "screenDetail", "screenPay"].forEach((s) => {
    el(s).classList.toggle("hidden", s !== id);
  });
  setSheetStatus("");
}

async function openSheetForCreator(creator) {
  selectedCreator = creator;
  selectedGift = null;
  qty = 1;
  friendUsername = null;
  el("friendBtn").textContent = "🎁 Подарить другу";

  el("sheetCreatorName").textContent = creator.name;
  el("sheetCreatorDesc").textContent = creator.description || "";
  const usernameEl = el("sheetCreatorUsername");
  if (creator.username) {
    usernameEl.textContent = `@${creator.username}`;
    usernameEl.hidden = false;
    usernameEl.onclick = (e) => {
      e.preventDefault();
      tg.openTelegramLink(`https://t.me/${creator.username}`);
    };
  } else {
    usernameEl.hidden = true;
  }
  el("sheetCreatorAvatar").style.backgroundImage = `url('${creator.avatarUrl}')`;
  el("sheetBanner").style.backgroundImage = creator.bannerUrl ? `url('${creator.bannerUrl}')` : "none";
  el("sheetBanner").hidden = !creator.bannerUrl;

  const grid = el("giftsGrid");
  grid.innerHTML = `<div class="gifts-loading">Загрузка…</div>`;

  el("sheetOverlay").hidden = false;
  requestAnimationFrame(() => el("sheetOverlay").classList.add("open"));
  showScreen("screenGifts");

  try {
    const res = await fetch(`/api/creators/${creator.id}/gifts`);
    const { gifts } = await res.json();
    grid.innerHTML = "";
    if (!gifts.length) {
      grid.innerHTML = `<div class="gifts-empty">Медийка пока не выбрала подарки</div>`;
      return;
    }
    gifts.forEach((g) => {
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
  } catch (e) {
    grid.innerHTML = `<div class="gifts-empty">Не удалось загрузить подарки</div>`;
  }
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

function updateBuyButton() {
  const total = selectedGift.stars * qty;
  el("sheetPrice").textContent = `${total} ★`;
  el("qtyValue").textContent = qty;
}

function selectGift(gift) {
  selectedGift = gift;
  qty = 1;
  friendUsername = null;
  el("friendBtn").textContent = "🎁 Подарить другу";
  el("giftCaption").value = "";
  el("sheetName").textContent = gift.name;
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
  updateBuyButton();
  showScreen("screenDetail");
}

el("btnBackToGifts").addEventListener("click", () => showScreen("screenGifts"));
el("btnBack").addEventListener("click", () => showScreen("screenDetail"));

el("qtyMinus").addEventListener("click", () => {
  if (qty > 1) qty--;
  updateBuyButton();
});
el("qtyPlus").addEventListener("click", () => {
  if (qty < 20) qty++;
  updateBuyButton();
});

// --- "подарить другу" мини-попап ---

el("friendBtn").addEventListener("click", () => {
  el("friendUsernameInput").value = friendUsername || "";
  el("friendOverlay").hidden = false;
});
el("friendCancel").addEventListener("click", () => {
  el("friendOverlay").hidden = true;
});
el("friendOverlay").addEventListener("click", (e) => {
  if (e.target === el("friendOverlay")) el("friendOverlay").hidden = true;
});
el("friendDone").addEventListener("click", () => {
  const v = el("friendUsernameInput").value.trim().replace(/^@/, "");
  friendUsername = v || null;
  el("friendBtn").textContent = friendUsername ? `🎁 Для @${friendUsername}` : "🎁 Подарить другу";
  el("friendOverlay").hidden = true;
});

el("btnOpenPay").addEventListener("click", () => {
  const totalStars = selectedGift.stars * qty;
  const totalTon = Math.round(selectedGift.ton * qty * 100) / 100;
  el("starsAmount").textContent = `${totalStars} ★`;
  el("cryptoAmount").textContent = `${totalTon} TON`;
  el("tonAmount").textContent = `${totalTon} TON`;
  el("paySummary").textContent = `${totalStars} ★ · ${selectedGift.name}${qty > 1 ? ` ×${qty}` : ""}`;
  showScreen("screenPay");
});

// --- загрузка данных страницы ---

async function loadProduct() {
  const res = await fetch("/api/product");
  const { product } = await res.json();
  el("title").textContent = product.title;
  el("desc").textContent = product.description;
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
      if (c.bannerUrl) row.style.setProperty("--row-banner", `url('${c.bannerUrl}')`);
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

function buildPayBody() {
  return {
    giftId: selectedGift.id,
    creatorId: selectedCreator ? selectedCreator.id : null,
    qty,
    caption: el("giftCaption").value.trim(),
    giftToUsername: friendUsername,
  };
}

el("btnStars").addEventListener("click", async () => {
  if (!selectedGift) return;
  setSheetStatus("Готовим счёт…");
  try {
    const { link } = await api("/api/pay/stars", buildPayBody());
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
    const { payUrl } = await api("/api/pay/cryptobot", { asset: "TON", ...buildPayBody() });
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

  if (!tonConnectUI.connected) {
    setSheetStatus("Сначала подключите кошелёк кнопкой ниже");
    tonConnectUI.openModal();
    return;
  }

  setSheetStatus("Готовим перевод…");
  try {
    const { orderId, tonConnect } = await api("/api/pay/ton", buildPayBody());

    await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          address: tonConnect.address,
          amount: tonConnect.amountNano,
          payload: tonConnect.payloadBoc,
        },
      ],
    });

    setSheetStatus("Перевод отправлен, ждём подтверждения в сети…");
    pollTonPayment(orderId);
  } catch (e) {
    if (e && e.message && e.message.includes("Reject")) {
      setSheetStatus("Перевод отменён в кошельке");
    } else {
      setSheetStatus("Ошибка: " + e.message, "error");
    }
  }
});

async function pollTonPayment(orderId, attempt = 0) {
  if (attempt >= 15) {
    setSheetStatus("Пока не видим перевод в сети. Если деньги списались — продавец подтвердит вручную.");
    return;
  }
  try {
    const { paid } = await api("/api/pay/ton/check", { orderId });
    if (paid) {
      setSheetStatus("Оплата подтверждена ✅", "ok");
      setTimeout(closeSheet, 1400);
      return;
    }
  } catch (e) {
    // тихо игнорируем отдельные неудачные проверки, попробуем ещё раз
  }
  setTimeout(() => pollTonPayment(orderId, attempt + 1), 4000);
}

loadProduct();
loadCreators();
