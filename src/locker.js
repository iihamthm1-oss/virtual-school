// ร้านค้า + ตู้เสื้อผ้า: มีหุ่นตัวอย่าง 3D หมุนดูได้ และรูปตัวอย่างจากโมเดลจริงแทนอีโมจิ
import { SKINS, HAIR_COLORS, HAIR_STYLES, OUTFITS, VEHICLES, outfitKey, vehicleKey } from './catalog.js';
import { outfitThumb, hairThumb, vehicleThumb, createPreview } from './preview.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const speedText = (v) => (v.seats > 1 ? 'นั่งได้ 2 คน' : `เร็ว ${Math.round((v.speed / 6.5) * 10) / 10} เท่าของการเดิน`);

/**
 * ctx: {
 *   wallet(): number, owned(): string[], look(): {skin,hair,hairColor,outfit}, vehicle(): number (ที่เลือกไว้),
 *   buy(key) => Promise<{ok,msg}>, setLook(look), selectVehicle(id), onOpen(open)
 * }
 */
export function createLocker(ctx) {
  let shopTab = 'outfit', open = null, tryKey = null;
  let shopPreview = null, wdPreview = null;

  function show(id) {
    open = id;
    $(id).classList.remove('hidden');
    ctx.onOpen?.(true);
  }
  function hide() {
    if (open) $(open).classList.add('hidden');
    shopPreview?.stop();
    wdPreview?.stop();
    open = null;
    ctx.onOpen?.(false);
  }
  document.querySelectorAll('[data-close-locker]').forEach((b) => (b.onclick = hide));
  for (const id of ['shop', 'wardrobe']) $(id).addEventListener('click', (e) => { if (e.target.id === id) hide(); });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && open) hide(); });

  // ── ร้านค้า ──
  function shopItems() {
    return shopTab === 'outfit'
      ? OUTFITS.filter((o) => o.price > 0).map((o) => ({ key: outfitKey(o.id), ...o, img: outfitThumb({ ...ctx.look(), outfit: o.id }) }))
      : VEHICLES.map((v) => ({ key: vehicleKey(v.id), ...v, desc: speedText(v), img: vehicleThumb(v.id) }));
  }
  function updateShopPreview() {
    const look = { ...ctx.look() };
    let veh = 0, cap = 'แตะสินค้าเพื่อลองใส่ · ลากเพื่อหมุนดู';
    if (tryKey) {
      const id = Number(tryKey.slice(1));
      if (tryKey[0] === 'o') { look.outfit = id; cap = 'ลองใส่: ' + OUTFITS.find((o) => o.id === id).name; }
      else { veh = id; cap = 'ลองขี่: ' + VEHICLES.find((v) => v.id === id).name; }
    }
    shopPreview.set(look, veh);
    $('shop-try').textContent = cap;
  }
  function renderShop() {
    $('shop-wallet').textContent = ctx.wallet();
    document.querySelectorAll('#shop .seg button').forEach((b) => b.classList.toggle('active', b.dataset.tab === shopTab));
    const owned = ctx.owned();
    $('shop-items').innerHTML = shopItems().map((it) => {
      const has = owned.includes(it.key), poor = ctx.wallet() < it.price;
      return `<div class="item ${has ? 'has' : ''} ${tryKey === it.key ? 'trying' : ''}" data-try="${it.key}">
        <img class="thumb" src="${it.img}" alt="" draggable="false" />
        <div class="nm">${esc(it.name)}</div>
        <div class="ds">${it.desc ? esc(it.desc) : '&nbsp;'}</div>
        ${has ? '<button class="btn small" disabled>✔ มีแล้ว</button>'
              : `<button class="btn small primary" data-buy="${it.key}" ${poor ? 'disabled' : ''}>💰 ${it.price}</button>`}
      </div>`;
    }).join('');
    updateShopPreview();
  }
  $('shop').querySelector('.seg').onclick = (e) => { const b = e.target.closest('button[data-tab]'); if (b) { shopTab = b.dataset.tab; tryKey = null; renderShop(); } };
  $('shop-items').onclick = async (e) => {
    const b = e.target.closest('[data-buy]');
    if (b) {
      b.disabled = true;
      const r = await ctx.buy(b.dataset.buy);
      $('shop-msg').textContent = r.ok ? r.okMsg || '🎉 ซื้อแล้ว!' : r.msg;
      $('shop-msg').className = 'shop-msg ' + (r.ok ? 'ok' : '');
      renderShop();
      return;
    }
    const card = e.target.closest('[data-try]');
    if (card) { tryKey = card.dataset.try; renderShop(); }
  };

  // ── ตู้เสื้อผ้า ──
  function renderWardrobe() {
    const look = ctx.look(), owned = ctx.owned(), veh = ctx.vehicle();
    wdPreview.set(look, veh);
    $('wd-hair').innerHTML = HAIR_STYLES.map((n, i) => `<button class="pic-opt ${look.hair === i ? 'on' : ''}" data-k="hair" data-v="${i}"><img src="${hairThumb({ ...look, hair: i })}" alt="" draggable="false" /><span>${esc(n)}</span></button>`).join('');
    $('wd-haircolor').innerHTML = HAIR_COLORS.map((c, i) => `<button class="sw ${look.hairColor === i ? 'on' : ''}" style="background:${c}" data-k="hairColor" data-v="${i}" aria-label="สีผม ${i + 1}"></button>`).join('');
    $('wd-skin').innerHTML = SKINS.map((c, i) => `<button class="sw ${look.skin === i ? 'on' : ''}" style="background:${c}" data-k="skin" data-v="${i}" aria-label="สีผิว ${i + 1}"></button>`).join('');
    $('wd-outfit').innerHTML = OUTFITS.map((o) => {
      const has = owned.includes(outfitKey(o.id));
      return `<button class="pic-opt tall ${look.outfit === o.id ? 'on' : ''} ${has ? '' : 'locked'}" ${has ? `data-k="outfit" data-v="${o.id}"` : 'disabled'} title="${has ? '' : 'ซื้อได้ที่ร้านค้า'}">
        <img src="${outfitThumb({ ...look, outfit: o.id })}" alt="" draggable="false" /><span>${esc(o.name)}</span>${has ? '' : `<span class="lock">🔒 ร้านค้า 💰${o.price}</span>`}</button>`;
    }).join('');
    $('wd-vehicle').innerHTML = [{ id: 0, name: 'เดินเท้า' }, ...VEHICLES].map((v) => {
      const has = v.id === 0 || owned.includes(vehicleKey(v.id));
      const img = v.id ? `<img src="${vehicleThumb(v.id)}" alt="" draggable="false" />` : '<div class="walk">🚶</div>';
      return `<button class="pic-opt ${veh === v.id ? 'on' : ''} ${has ? '' : 'locked'}" ${has ? `data-veh="${v.id}"` : 'disabled'}>
        ${img}<span>${esc(v.name)}</span>${has ? '' : `<span class="lock">🔒 ร้านค้า 💰${v.price}</span>`}</button>`;
    }).join('');
  }
  $('wardrobe').onclick = (e) => {
    const b = e.target.closest('button[data-k], button[data-veh]');
    if (!b) return;
    if (b.dataset.veh !== undefined) ctx.selectVehicle(Number(b.dataset.veh));
    else ctx.setLook({ ...ctx.look(), [b.dataset.k]: Number(b.dataset.v) });
    renderWardrobe();
  };

  return {
    get isOpen() { return !!open; },
    openShop() {
      shopPreview ??= createPreview($('shop-preview'));
      tryKey = null;
      $('shop-msg').textContent = '';
      show('shop');
      renderShop();
      shopPreview.start();
    },
    openWardrobe() {
      wdPreview ??= createPreview($('wd-preview'));
      show('wardrobe');
      renderWardrobe();
      wdPreview.start();
    },
    refresh() { if (open === 'shop') renderShop(); if (open === 'wardrobe') renderWardrobe(); },
    hide,
  };
}
