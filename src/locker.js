// ร้านค้า + ตู้เสื้อผ้า (แต่งตัว เลือกพาหนะ)
import { SKINS, HAIR_COLORS, HAIR_STYLES, OUTFITS, VEHICLES, outfitKey, vehicleKey } from './catalog.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * ctx: {
 *   wallet(): number, owned(): string[], look(): {skin,hair,hairColor,outfit}, vehicle(): number (ที่เลือกไว้),
 *   buy(key) => Promise<{ok,msg}>, setLook(look), selectVehicle(id), onOpen(open)
 * }
 */
export function createLocker(ctx) {
  let shopTab = 'outfit', open = null;

  function show(id) {
    open = id;
    $(id).classList.remove('hidden');
    ctx.onOpen?.(true);
  }
  function hide() {
    if (open) $(open).classList.add('hidden');
    open = null;
    ctx.onOpen?.(false);
  }
  document.querySelectorAll('[data-close-locker]').forEach((b) => (b.onclick = hide));
  for (const id of ['shop', 'wardrobe']) $(id).addEventListener('click', (e) => { if (e.target.id === id) hide(); });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && open) hide(); });

  // ── ร้านค้า ──
  function renderShop() {
    $('shop-wallet').textContent = ctx.wallet();
    document.querySelectorAll('#shop .seg button').forEach((b) => b.classList.toggle('active', b.dataset.tab === shopTab));
    const owned = ctx.owned();
    const items = shopTab === 'outfit'
      ? OUTFITS.filter((o) => o.price > 0).map((o) => ({ key: outfitKey(o.id), ...o }))
      : VEHICLES.map((v) => ({ key: vehicleKey(v.id), ...v, desc: v.seats > 1 ? 'นั่งได้ 2 คน' : `เร็ว ${Math.round((v.speed / 6.5) * 10) / 10}× เท่าเดิน` }));
    $('shop-items').innerHTML = items.map((it) => {
      const has = owned.includes(it.key), poor = ctx.wallet() < it.price;
      return `<div class="item ${has ? 'has' : ''}">
        <div class="ico">${it.icon}</div><div class="nm">${esc(it.name)}</div>
        <div class="ds">${it.desc ? esc(it.desc) : '&nbsp;'}</div>
        ${has ? '<button class="btn small" disabled>✔ มีแล้ว</button>'
              : `<button class="btn small primary" data-buy="${it.key}" ${poor ? 'disabled' : ''}>💰 ${it.price}</button>`}
      </div>`;
    }).join('');
  }
  $('shop').querySelector('.seg').onclick = (e) => { const b = e.target.closest('button[data-tab]'); if (b) { shopTab = b.dataset.tab; renderShop(); } };
  $('shop-items').onclick = async (e) => {
    const b = e.target.closest('[data-buy]');
    if (!b) return;
    b.disabled = true;
    const r = await ctx.buy(b.dataset.buy);
    $('shop-msg').textContent = r.ok ? '🎉 ซื้อแล้ว! เปิดตู้เสื้อผ้า 👕 เพื่อใส่หรือขี่ได้เลย' : r.msg;
    $('shop-msg').className = 'shop-msg ' + (r.ok ? 'ok' : '');
    renderShop();
  };

  // ── ตู้เสื้อผ้า ──
  function renderWardrobe() {
    const look = ctx.look(), owned = ctx.owned(), veh = ctx.vehicle();
    $('wd-hair').innerHTML = HAIR_STYLES.map((n, i) => `<button class="opt ${look.hair === i ? 'on' : ''}" data-k="hair" data-v="${i}">${esc(n)}</button>`).join('');
    $('wd-haircolor').innerHTML = HAIR_COLORS.map((c, i) => `<button class="sw ${look.hairColor === i ? 'on' : ''}" style="background:${c}" data-k="hairColor" data-v="${i}" aria-label="สีผม ${i + 1}"></button>`).join('');
    $('wd-skin').innerHTML = SKINS.map((c, i) => `<button class="sw ${look.skin === i ? 'on' : ''}" style="background:${c}" data-k="skin" data-v="${i}" aria-label="สีผิว ${i + 1}"></button>`).join('');
    $('wd-outfit').innerHTML = OUTFITS.map((o) => {
      const has = owned.includes(outfitKey(o.id));
      return `<button class="card-opt ${look.outfit === o.id ? 'on' : ''} ${has ? '' : 'locked'}" ${has ? `data-k="outfit" data-v="${o.id}"` : 'disabled'} title="${has ? '' : 'ซื้อได้ที่ร้านค้า'}">
        <span class="ico">${o.icon}</span><span>${esc(o.name)}</span>${has ? '' : `<span class="lock">🔒 💰${o.price}</span>`}</button>`;
    }).join('');
    $('wd-vehicle').innerHTML = [{ id: 0, name: 'เดินเท้า', icon: '🚶' }, ...VEHICLES].map((v) => {
      const has = v.id === 0 || owned.includes(vehicleKey(v.id));
      return `<button class="card-opt ${veh === v.id ? 'on' : ''} ${has ? '' : 'locked'}" ${has ? `data-veh="${v.id}"` : 'disabled'}>
        <span class="ico">${v.icon}</span><span>${esc(v.name)}</span>${has ? '' : `<span class="lock">🔒 💰${v.price}</span>`}</button>`;
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
    openShop() { $('shop-msg').textContent = ''; renderShop(); show('shop'); },
    openWardrobe() { renderWardrobe(); show('wardrobe'); },
    refresh() { if (open === 'shop') renderShop(); if (open === 'wardrobe') renderWardrobe(); },
    hide,
  };
}
