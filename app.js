const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const initData = tg?.initData || "";
const el = (id) => document.getElementById(id);

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

function setHint(id, text, kind) {
  const h = el(id);
  h.textContent = text || "";
  h.className = "hint" + (kind ? " " + kind : "");
}

// --- вкладки ---
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    el(`panel-${btn.dataset.tab}`).classList.remove("hidden");
    if (btn.dataset.tab === "orders") loadOrders();
  });
});

// --- товар ---
async function loadProduct() {
  const { product } = await api("/api/admin/product/get");
  el("fTitle").value = product.title || "";
  el("fDesc").value = product.description || "";
  el("fStars").value = product.priceStars || 0;
  el("fTon").value = product.priceTon || 0;
  el("fActive").checked = !!product.active;
}

el("saveProduct").addEventListener("click", async () => {
  setHint("productHint", "Сохраняем…");
  try {
    await api("/api/admin/product/update", {
      patch: {
        title: el("fTitle").value.trim(),
        description: el("fDesc").value.trim(),
        priceStars: Number(el("fStars").value),
        priceTon: Number(el("fTon").value),
        active: el("fActive").checked,
      },
    });
    setHint("productHint", "Сохранено ✓", "ok");
  } catch (e) {
    setHint("productHint", "Ошибка: " + e.message, "error");
  }
});

// --- прайс подарков ---
let giftTiersCache = [];

function renderGifts(tiers) {
  const list = el("giftsList");
  list.innerHTML = "";
  tiers.forEach((g, i) => {
    const row = document.createElement("div");
    row.className = "gift-row";
    row.innerHTML = `
      <input type="text" class="f-name" value="${g.name}" data-idx="${i}" data-field="name" placeholder="Название" />
      <div class="stars-input f-stars">
        <input type="number" min="1" value="${g.stars}" data-idx="${i}" data-field="stars" />
        <span>★</span>
      </div>
      <div class="stars-input f-ton">
        <input type="number" min="0" step="0.01" value="${g.ton ?? 0}" data-idx="${i}" data-field="ton" />
        <span>TON</span>
      </div>
      <input type="text" class="f-photo" value="${g.photo || ""}" data-idx="${i}" data-field="photo" placeholder="Ссылка на картинку (необязательно)" />
    `;
    list.appendChild(row);
  });
}

async function loadGifts() {
  const { giftTiers } = await api("/api/admin/gifts/get");
  giftTiersCache = giftTiers;
  renderGifts(giftTiers);
}

el("saveGifts").addEventListener("click", async () => {
  const inputs = document.querySelectorAll("#giftsList input");
  const updated = [...giftTiersCache];
  inputs.forEach((input) => {
    const idx = Number(input.dataset.idx);
    const field = input.dataset.field;
    updated[idx] = {
      ...updated[idx],
      [field]: field === "stars" || field === "ton" ? Number(input.value) : input.value,
    };
  });
  setHint("giftsHint", "Сохраняем…");
  try {
    const res = await api("/api/admin/gifts/update", { giftTiers: updated });
    giftTiersCache = res.giftTiers;
    setHint("giftsHint", "Сохранено ✓", "ok");
  } catch (e) {
    setHint("giftsHint", "Ошибка: " + e.message, "error");
  }
});

// --- заказы ---
async function loadOrders() {
  const list = el("ordersList");
  list.innerHTML = '<div class="hint">Загрузка…</div>';
  try {
    const { orders } = await api("/api/admin/orders/get");
    if (!orders.length) {
      list.innerHTML = '<div class="hint">Заказов пока нет</div>';
      return;
    }
    list.innerHTML = "";
    orders.forEach((o) => {
      const card = document.createElement("div");
      card.className = "order-card";
      const date = new Date(o.createdAt).toLocaleString("ru-RU");
      card.innerHTML = `
        <div class="order-top">
          <span>#${o.id} · ${o.method}</span>
          <span class="order-status ${o.status}">${o.status === "paid" ? "оплачен" : "ожидание"}</span>
        </div>
        <div class="order-meta">${o.username ? "@" + o.username : "id " + o.userId} · ${o.amount} · ${date}</div>
      `;
      list.appendChild(card);
    });
  } catch (e) {
    list.innerHTML = `<div class="hint error">Ошибка: ${e.message}</div>`;
  }
}

// --- вход ---
(async function init() {
  try {
    await loadProduct();
    await loadGifts();
    el("page").hidden = false;
  } catch (e) {
    el("denied").hidden = false;
  }
})();
