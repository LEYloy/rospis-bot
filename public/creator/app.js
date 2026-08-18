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
  if (!res.ok) throw new Error(json.detail || json.error || "request failed");
  return json;
}

let creator = null;
let catalog = []; // общий каталог подарков (из /api/product)

function renderPreview() {
  el("previewName").textContent = creator.name || "—";
  el("previewDesc").textContent = el("fDesc").value || "—";
  el("previewPrice").textContent = `от ${el("fPrice").value || 0} ★`;

  const banner = el("fBanner").value;
  el("previewBanner").style.backgroundImage = banner ? `url(${banner})` : "none";

  const avatar = el("previewAvatar");
  avatar.style.backgroundImage = `url(/api/avatar/${creator.userId})`;
  avatar.textContent = "";
}

function renderGiftsEditor() {
  const wrap = el("giftsEditor");
  wrap.innerHTML = "";
  const overrides = creator.giftOverrides || {};

  catalog.forEach((g) => {
    const o = overrides[g.id] || {};
    const enabled = o.enabled !== undefined ? o.enabled : true;
    const stars = o.stars !== undefined ? o.stars : g.stars;

    const row = document.createElement("div");
    row.className = "gift-editor-row" + (enabled ? "" : " disabled");
    row.innerHTML = `
      <label class="gift-toggle">
        <input type="checkbox" data-gid="${g.id}" class="g-enabled" ${enabled ? "checked" : ""} />
      </label>
      <div class="gift-editor-media">${g.photo ? `<img src="${g.photo}" />` : `<span>${g.emoji || "🎁"}</span>`}</div>
      <div class="gift-editor-name">${g.name}</div>
      <div class="gift-editor-price">
        <input type="number" min="1" value="${stars}" data-gid="${g.id}" class="g-stars" />
        <span>★</span>
      </div>
    `;
    row.querySelector(".g-enabled").addEventListener("change", (e) => {
      row.classList.toggle("disabled", !e.target.checked);
    });
    wrap.appendChild(row);
  });
}

function collectGiftOverrides() {
  const result = {};
  document.querySelectorAll(".gift-editor-row").forEach((row) => {
    const gid = row.querySelector(".g-enabled").dataset.gid;
    const enabled = row.querySelector(".g-enabled").checked;
    const stars = Number(row.querySelector(".g-stars").value) || 0;
    result[gid] = { enabled, stars };
  });
  return result;
}

async function load() {
  try {
    const [{ creator: c }, productRes] = await Promise.all([
      api("/api/creator/me"),
      fetch("/api/product").then((r) => r.json()),
    ]);
    creator = c;
    catalog = productRes.giftTiers || [];

    el("fDesc").value = c.description || "";
    el("fLink").value = c.link || "";
    el("fPrice").value = c.priceStars || "";
    el("fBanner").value = c.bannerUrl || "";
    el("fActive").checked = !!c.active;
    renderPreview();
    renderGiftsEditor();
    el("page").hidden = false;
  } catch (e) {
    el("denied").hidden = false;
  }
}

["fDesc", "fPrice", "fBanner"].forEach((id) => {
  el(id).addEventListener("input", renderPreview);
});

el("saveBtn").addEventListener("click", async () => {
  const hint = el("hint");
  hint.className = "hint";
  hint.textContent = "Сохраняем…";
  try {
    const patch = {
      description: el("fDesc").value.trim(),
      link: el("fLink").value.trim(),
      priceStars: Number(el("fPrice").value) || 0,
      bannerUrl: el("fBanner").value.trim() || null,
      active: el("fActive").checked,
      giftOverrides: collectGiftOverrides(),
    };
    const { creator: c } = await api("/api/creator/update", { patch });
    creator = c;
    hint.className = "hint ok";
    hint.textContent = "Сохранено ✅";
    setTimeout(() => (hint.textContent = ""), 1800);
  } catch (e) {
    hint.className = "hint error";
    hint.textContent = "Ошибка: " + e.message;
  }
});

load();
