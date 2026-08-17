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

let creator = null;

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

async function load() {
  try {
    const { creator: c } = await api("/api/creator/me");
    creator = c;
    el("fDesc").value = c.description || "";
    el("fLink").value = c.link || "";
    el("fPrice").value = c.priceStars || "";
    el("fBanner").value = c.bannerUrl || "";
    el("fActive").checked = !!c.active;
    renderPreview();
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
