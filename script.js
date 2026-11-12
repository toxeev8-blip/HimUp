const SUPABASE_URL = 'https://ycfmxtwndcgdpzjyfefl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ea1y6JOSfaWFRdAbZm4EFA__HIdVfMO';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const MY_TELEGRAM_ID = 8572202921;

let tgUser = null;
let tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); tgUser = tg.initDataUnsafe?.user; }

let userData = { 
  id: tgUser?.id || null, 
  name: tgUser ? (tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : '')) : "Игрок", 
  avatar: tgUser?.photo_url || "https://i.pravatar.cc/100?img=12", 
  tg_username: tgUser?.username ? "@" + tgUser.username : "@user"
};

let balance = 0;
let inventory = [];
let lastFreeCaseTime = 0;
let siteConfig = { logoText: "Him", logoAccent: "Up", accentColor: "#7c3aed", rocketImage: "🚀", bannerRocket: "🚀", bannerMines: "💣", splashSticker: "" };
let CASES = {
  free: { id: 'free', title: 'Бесплатный', price: 0, isFree: true, mainImg: '🎁', rewards: [{ type: 'sticker', name: 'Стикер', chance: 100, img: '🎨', sellPrice: 5 }] },
  himup: { id: 'himup', title: 'HimUp', price: 150, mainImg: '🔥', rewards: [{ type: 'sticker', name: 'Премиум', chance: 90, img: '👑', sellPrice: 100 }, { type: 'sticker', name: 'Редкий', chance: 10, img: '💎', sellPrice: 500 }] }
};
let currentCase = null;
let isSpinning = false;
let policyTaps = 0;
let timerInterval = null;
const $ = id => document.getElementById(id);

// === ОТРИСОВКА КАРТИНОК ===
async function renderSticker(container, imgData, size = 50) {
  container.innerHTML = '';
  if (!imgData) return;

  // Если это ссылка на картинку или base64
  if (imgData.includes('/') || imgData.includes('data:')) {
    const img = document.createElement('img');
    img.src = imgData;
    img.style.width = size + 'px';
    img.style.height = size + 'px';
    img.style.objectFit = 'contain';
    img.className = 'sticker-glow';
    container.appendChild(img);
  } else {
    // Если это эмодзи
    container.innerHTML = `<div style="font-size:${size}px; line-height:1;" class="sticker-glow">${imgData}</div>`;
  }
}

// === ИНИЦИАЛИЗАЦИЯ ===
async function initApp() {
  try {
    let { data: cfg } = await supabaseClient.from('site_config').select('config').eq('id', 1).single();
    if (cfg && cfg.config && cfg.config.siteConfig) {
      siteConfig = cfg.config.siteConfig;
      if (cfg.config.CASES) CASES = cfg.config.CASES;
    } else {
      await supabaseClient.from('site_config').insert({ id: 1, config: { siteConfig, CASES } });
    }
    if (userData.id) {
      let { data: player } = await supabaseClient.from('players').select('*').eq('id', userData.id).single();
      if (player) {
        balance = player.balance;
        inventory = player.inventory || [];
        lastFreeCaseTime = player.last_free_case || 0;
      } else {
        await supabaseClient.from('players').insert({ id: userData.id, username: userData.tg_username, first_name: userData.name, photo_url: userData.avatar, balance: 0, inventory: [], last_free_case: 0 });
      }
    }
  } catch (e) { console.log("Ошибка базы:", e); }
  
  applyDesign();
  render();
  loadLeaderboard();
  startFreeCaseTimer();
  setTimeout(() => { $('splashScreen').classList.add('hidden'); }, 1000);
}

async function initSplash() {
  if (siteConfig.splashSticker) {
    await renderSticker($('splashAnimContainer'), siteConfig.splashSticker, 150);
  } else {
    $('splashAnimContainer').innerHTML = '<div style="font-size:80px;" class="sticker-glow">🎁</div>';
  }
}

async function savePlayer() {
  if (!userData.id) return;
  try { await supabaseClient.from('players').update({ balance: balance, inventory: inventory, last_free_case: lastFreeCaseTime }).eq('id', userData.id); } catch (e) {}
}

async function saveConfig() {
  try { await supabaseClient.from('site_config').update({ config: { siteConfig, CASES } }).eq('id', 1); } catch (e) {}
}

function applyDesign() {
  $('siteLogo').innerHTML = `${siteConfig.logoText}<span style="color: #ef4444;">${siteConfig.logoAccent}</span>`;
  $('userAvatar').src = userData.avatar;
  $('profAvatar').src = userData.avatar;
  $('profName').textContent = userData.name;
  $('profTg').textContent = userData.tg_username;
  renderSticker($('bannerRocket'), siteConfig.bannerRocket, 120);
  renderSticker($('bannerMines'), siteConfig.bannerMines, 120);
}

function render() {
  $('balText').textContent = Math.floor(balance);
  $('profBal').textContent = Math.floor(balance);
  $('freeGrid').innerHTML = ''; $('paidGrid').innerHTML = '';
  $('inventoryGrid').innerHTML = '';
  Object.values(CASES).forEach(c => {
    let btn = c.isFree ? 'Открыть' : `Открыть за ${c.price}₽`;
    let btnClass = "case-btn";
    if (c.isFree) {
      let now = Date.now(); let diff = now - lastFreeCaseTime; let hours24 = 24 * 60 * 60 * 1000;
      if (diff < hours24) {
        btnClass += " disabled";
        let left = hours24 - diff;
        let h = Math.floor(left / 3600000); let m = Math.floor((left % 3600000) / 60000); let s = Math.floor((left % 60000) / 1000);
        btn = `Через ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      }
    }
    let card = document.createElement('div');
    card.className = 'case-card';
    card.onclick = () => openCase(c.id);
    card.innerHTML = `<div class="case-img-box"></div><div class="case-name">${c.title}</div><button class="${btnClass}" style="background: ${c.isFree && btnClass.includes('disabled') ? '#2a2e3d' : siteConfig.accentColor}">${btn}</button>`;
    renderSticker(card.querySelector('.case-img-box'), c.mainImg, 80);
    if (c.isFree) $('freeGrid').appendChild(card);
    else $('paidGrid').appendChild(card);
  });
  if (inventory.length === 0) {
    $('inventoryGrid').innerHTML = '<div style="grid-column: span 2; text-align: center; color: #8b92a5; padding: 20px;">Пусто</div>';
  } else {
    inventory.forEach((item, index) => {
      let div = document.createElement('div'); div.className = 'inv-item';
      div.innerHTML = `<div class="name">${item.name}</div><div class="price">${item.sellPrice} ₽</div><button onclick="sellItem(${index})">Продать</button>`;
      let imgContainer = document.createElement('div');
      renderSticker(imgContainer, item.img, 50);
      div.insertBefore(imgContainer, div.firstChild);
      $('inventoryGrid').appendChild(div);
    });
  }
}

function startFreeCaseTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    let freeCase = Object.values(CASES).find(c => c.isFree);
    if (freeCase) {
      let now = Date.now(); let diff = now - lastFreeCaseTime; let hours24 = 24 * 60 * 60 * 1000;
      if (diff < hours24) {
        let left = hours24 - diff;
        let h = Math.floor(left / 3600000); let m = Math.floor((left % 3600000) / 60000); let s = Math.floor((left % 60000) / 1000);
        let btn = $('freeGrid').querySelector('.case-btn');
        if (btn) btn.textContent = `Через ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      } else {
        let btn = $('freeGrid').querySelector('.case-btn');
        if (btn && btn.textContent.startsWith('Через')) render();
      }
    }
  }, 1000);
}

async function loadLeaderboard() {
  try {
    let { data } = await supabaseClient.from('players').select('*').order('balance', { ascending: false }).limit(10);
    if (data) {
      $('leaderboardList').innerHTML = data.map((p, i) => `
        <div class="lb-item">
          <div class="lb-place ${i===0?'top1':i===1?'top2':i===2?'top3':''}">${i+1}</div>
          <img src="${p.photo_url || 'https://i.pravatar.cc/100'}" class="lb-avatar">
          <div class="lb-info"><div class="lb-name">${p.first_name || 'Игрок'}</div><div class="lb-tg">${p.username || '@user'}</div></div>
          <div class="lb-balance">${Math.floor(p.balance)} ₽</div>
        </div>
      `).join('');
    }
  } catch (e) {}
}

async function sellItem(index) {
  let item = inventory[index];
  if (!item) return;
  balance += item.sellPrice;
  inventory.splice(index, 1);
  render(); await savePlayer();
  alert(`Вы продали ${item.name} за ${item.sellPrice}₽!`);
}

function openCase(id) {
  const c = CASES[id];
  if (c.isFree) { let now = Date.now(); if (now - lastFreeCaseTime < 24 * 60 * 60 * 1000) return alert('Бесплатный кейс будет доступен позже!'); }
  if (balance < c.price) return alert('Мало средств! Пополните баланс.');
  currentCase = c;
  $('caseTitle').textContent = c.title;
  $('spinBtn').textContent = c.price === 0 ? 'Открыть бесплатно' : `Крутить за ${c.price}₽`;
  $('spinBtn').disabled = false;
  $('spinArea').style.display = 'block';
  let res = $('resultScreen'); if(res) res.remove();
  $('prizesGrid').innerHTML = '';
  c.rewards.forEach(r => {
    let div = document.createElement('div'); div.className = 'prize-item';
    let imgContainer = document.createElement('div'); renderSticker(imgContainer, r.img, 48);
    div.appendChild(imgContainer);
    let nameDiv = document.createElement('div'); nameDiv.style.cssText = "font-size:12px;font-weight:900; color:#fff;"; nameDiv.textContent = r.name;
    div.appendChild(nameDiv);
    $('prizesGrid').appendChild(div);
  });
  const strip = $('strip'); strip.innerHTML = ''; strip.style.transform = 'translateX(0)';
  for(let i=0; i<20; i++) {
    let r = c.rewards[Math.floor(Math.random()*c.rewards.length)];
    let itemDiv = document.createElement('div'); itemDiv.className = 'strip-item';
    renderSticker(itemDiv, r.img, 60);
    strip.appendChild(itemDiv);
  }
  $('caseScreen').classList.add('active');
}

async function spin() {
  if(isSpinning) return;
  const c = currentCase;
  if (balance < c.price) return;
  balance -= c.price; render();
  isSpinning = true; $('spinBtn').disabled = true;
  const total = c.rewards.reduce((s,r)=>s+r.chance,0);
  let rnd = Math.random() * total; let win = c.rewards[0];
  for(let r of c.rewards) { rnd -= r.chance; if(rnd <= 0) { win = r; break; } }
  const strip = $('strip'); strip.innerHTML = '';
  const winIndex = 55;
  for(let i=0; i<60; i++) {
    let r = (i === winIndex) ? win : c.rewards[Math.floor(Math.random()*c.rewards.length)];
    let itemDiv = document.createElement('div'); itemDiv.className = 'strip-item';
    if (i === winIndex) itemDiv.id = 'winEl';
    renderSticker(itemDiv, r.img, 60);
    strip.appendChild(itemDiv);
  }
  const finalPos = (winIndex * 104) + 52 - (strip.parentElement.clientWidth / 2);
  let start = null;
  function animate(time) {
    if (!start) start = time;
    const p = Math.min((time - start) / 4000, 1);
    const easeOut = 1 - Math.pow(1 - p, 4);
    strip.style.transform = `translateX(-${finalPos * easeOut}px)`;
    if (p < 1) requestAnimationFrame(animate);
    else {
      inventory.push({ name: win.name, img: win.img, sellPrice: win.sellPrice || 10 });
      if (c.isFree) lastFreeCaseTime = Date.now();
      savePlayer();
      setTimeout(() => {
        isSpinning = false; $('spinArea').style.display = 'none';
        let resDiv = document.createElement('div'); resDiv.id = 'resultScreen';
        resDiv.innerHTML = `<div style="text-align:center; padding-top:50px;"><div id="winResultImg" style="display:flex; justify-content:center; margin-bottom:20px;"></div><h2 style="margin:20px 0; color:#fff;">Вы выиграли!</h2><p style="color:#8b92a5; margin-bottom:20px; font-weight:700;">${win.name} (Продажа: ${win.sellPrice}₽)</p><button class="spin-btn" style="background:${siteConfig.accentColor}" onclick="closeModal('caseScreen'); render();">Закрыть</button></div>`;
        document.querySelector('#caseScreen .modal-content').appendChild(resDiv);
        renderSticker($('winResultImg'), win.img, 120);
      }, 500);
    }
  }
  requestAnimationFrame(animate);
}

// Ракета и Мины
let rocketInterval, rocketMult = 1, rocketPlaying = false, rocketCanvas, ctx, rocketY = 0, rocketX = 0, isCrashed = false, cameraY = 0, stars = [], rocketParticles = [];

function openGame(game) {
  if (game === 'rocket') { resetRocket(); $('gameRocketScreen').classList.add('active'); }
  if (game === 'mines') { resetMines(); $('gameMinesScreen').classList.add('active'); }
}

function resetRocket() {
  clearInterval(rocketInterval);
  rocketPlaying = false; rocketMult = 1; isCrashed = false; cameraY = 0;
  $('rocketMult').textContent = '1.00x'; $('rocketMult').style.color = '#2ed573';
  $('crashMsg').style.display = 'none'; $('rocketActionBtn').textContent = 'Играть'; $('rocketActionBtn').className = 'action-btn';
  rocketCanvas = $('rocketCanvas');
  if(rocketCanvas) {
    rocketCanvas.width = rocketCanvas.offsetWidth; rocketCanvas.height = rocketCanvas.offsetHeight;
    ctx = rocketCanvas.getContext('2d');
    rocketX = rocketCanvas.width / 2; rocketY = rocketCanvas.height - 60;
    stars = []; for(let i=0; i<50; i++) { stars.push({ x: Math.random() * rocketCanvas.width, y: Math.random() * rocketCanvas.height * 2, size: Math.random() * 2 + 1 }); }
    rocketParticles = []; drawRocket();
  }
}

function drawRocket() {
  if(!ctx) return;
  ctx.clearRect(0, 0, rocketCanvas.width, rocketCanvas.height);
  if(cameraY < 100) { ctx.fillStyle = '#1a3d26'; ctx.fillRect(0, rocketCanvas.height - 50 + cameraY, rocketCanvas.width, 100); ctx.fillStyle = '#2b5a38'; ctx.fillRect(0, rocketCanvas.height - 55 + cameraY, rocketCanvas.width, 5); }
  else { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, rocketCanvas.width, rocketCanvas.height); }
  ctx.fillStyle = '#fff';
  stars.forEach(star => {
    let drawY = star.y + cameraY;
    if(drawY > rocketCanvas.height) { star.y -= rocketCanvas.height * 2; drawY = star.y + cameraY; }
    if(drawY > 0) { ctx.beginPath(); ctx.arc(star.x, drawY, star.size, 0, Math.PI*2); ctx.fill(); }
  });
  if(rocketPlaying && !isCrashed) { for(let i=0; i<5; i++) { rocketParticles.push({ x: rocketX + (Math.random() - 0.5) * 10, y: rocketY + 30, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 4 + 2, life: 1 }); } }
  for(let i = rocketParticles.length - 1; i >= 0; i--) {
    let p = rocketParticles[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.05;
    ctx.fillStyle = `rgba(255, ${Math.floor(Math.random()*100)+100}, 0, ${p.life})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill();
    if(p.life <= 0) rocketParticles.splice(i, 1);
  }
  if(siteConfig.rocketImage.includes('data:') || siteConfig.rocketImage.includes('http')) {
    let img = new Image(); img.src = siteConfig.rocketImage; ctx.drawImage(img, rocketX - 30, rocketY - 30, 60, 60);
  } else { ctx.font = '60px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(isCrashed ? '💥' : siteConfig.rocketImage, rocketX, rocketY); }
  if(isCrashed) { ctx.font = '80px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💥', rocketX, rocketY); }
}

function rocketAction() {
  if (rocketPlaying) {
    clearInterval(rocketInterval);
    let win = Math.floor(parseInt($('rocketBet').value) * rocketMult);
    balance += win; render(); savePlayer();
    alert(`Вы забрали ${win}₽ на множителе ${rocketMult.toFixed(2)}x!`); resetRocket();
  } else {
    let bet = parseInt($('rocketBet').value);
    if (balance < bet) return alert('Мало средств! Пополните баланс.');
    balance -= bet; render(); savePlayer();
    rocketPlaying = true; rocketMult = 1; isCrashed = false;
    $('rocketActionBtn').textContent = 'ЗАБРАТЬ'; $('rocketActionBtn').className = 'action-btn cancel';
    $('crashMsg').style.display = 'none'; $('rocketMult').style.color = '#2ed573';
    const crashPoint = 1.0 + Math.random() * 8; 
    rocketInterval = setInterval(() => {
      rocketMult += 0.05 + (rocketMult * 0.01); 
      $('rocketMult').textContent = rocketMult.toFixed(2) + 'x';
      cameraY += 2 + rocketMult * 0.5; rocketX += Math.sin(Date.now() / 200) * 1;
      drawRocket();
      if (rocketMult >= crashPoint) {
        clearInterval(rocketInterval); rocketPlaying = false; isCrashed = true;
        $('rocketMult').style.color = '#ef4444'; $('crashMsg').style.display = 'block';
        $('rocketActionBtn').textContent = 'Играть'; $('rocketActionBtn').className = 'action-btn'; drawRocket();
      }
    }, 100);
  }
}
function closeRocket() { clearInterval(rocketInterval); closeModal('gameRocketScreen'); }

let minesActive = false, minesBombs = [], minesMult = 1, minesBetVal = 10;
function resetMines() {
  minesActive = false; minesMult = 1;
  $('minesMult').textContent = '1.00x'; $('minesWin').textContent = '0₽';
  $('minesActionBtn').textContent = 'Играть'; $('minesActionBtn').className = 'action-btn';
  const grid = $('minesGrid'); grid.innerHTML = '';
  minesBombs = Array(25).fill(false);
  let placed = 0;
  while(placed < 5) { let idx = Math.floor(Math.random() * 25); if(!minesBombs[idx]) { minesBombs[idx] = true; placed++; } }
  for(let i=0; i<25; i++) { let cell = document.createElement('div'); cell.className = 'mine-cell'; cell.onclick = () => clickMine(i, cell); grid.appendChild(cell); }
}
function minesAction() {
  if (minesActive) { let win = Math.floor(minesBetVal * minesMult); balance += win; render(); savePlayer(); alert(`Вы забрали ${win}₽!`); resetMines(); } 
  else {
    minesBetVal = parseInt($('minesBet').value);
    if (balance < minesBetVal) return alert('Мало средств! Пополните баланс.');
    balance -= minesBetVal; render(); savePlayer();
    minesActive = true; $('minesActionBtn').textContent = 'ЗАБРАТЬ'; $('minesActionBtn').className = 'action-btn cancel';
  }
}
function clickMine(index, cell) {
  if (!minesActive || cell.classList.contains('opened')) return;
  if (minesBombs[index]) {
    cell.classList.add('bomb'); cell.textContent = '💣';
    document.querySelectorAll('.mine-cell').forEach((c, i) => { if (minesBombs[i]) { c.classList.add('bomb'); c.textContent = '💣'; } });
    minesActive = false; $('minesActionBtn').textContent = 'Играть'; $('minesActionBtn').className = 'action-btn'; alert('Вы подорвались!');
  } else {
    cell.classList.add('opened'); cell.textContent = '💎';
    minesMult += 0.2; $('minesMult').textContent = minesMult.toFixed(2) + 'x';
    $('minesWin').textContent = Math.floor(minesBetVal * minesMult) + '₽';
  }
}
function closeMines() { minesActive = false; closeModal('gameMinesScreen'); }

// === АДМИНКА ===
function tapPolicy() {
  policyTaps++;
  if (policyTaps >= 5) { 
    policyTaps = 0; 
    if (tgUser && tgUser.id === MY_TELEGRAM_ID) { 
      document.getElementById('adminModal').classList.add('active'); 
      renderAdmin('design'); 
    } else { alert("Политика конфиденциальности v1.0"); }
  }
}
let currentAdminTab = 'design';
function switchAdminTab(tab) { currentAdminTab = tab; renderAdmin(tab); }

function renderAdmin(tab) {
  let content = '';
  if (tab === 'design') {
    content = `
      <div class="form-group"><label>Логотип (Левая часть)</label><input type="text" id="cfgLogoText" value="${siteConfig.logoText}"></div>
      <div class="form-group"><label>Логотип (Правая часть)</label><input type="text" id="cfgLogoAccent" value="${siteConfig.logoAccent}"></div>
      <div class="form-group"><label>Цвет акцента (HEX)</label><input type="text" id="cfgAccent" value="${siteConfig.accentColor}"></div>
      <div class="form-group"><label>Ракета (Файл)</label><input type="file" id="cfgRocketFile" accept="image/*" style="margin-bottom:8px;"><input type="text" id="cfgRocketEmoji" placeholder="Эмодзи (🚀)" value="${siteConfig.rocketImage.includes('data:') ? '' : siteConfig.rocketImage}"></div>
      <div class="form-group"><label>Стикер загрузки (Файл)</label><input type="file" id="cfgSplashFile" accept="image/*" style="margin-bottom:8px;"><input type="text" id="cfgSplashEmoji" placeholder="Эмодзи (🎁)" value="${siteConfig.splashSticker.includes('data:') ? '' : siteConfig.splashSticker}"></div>
      <button class="admin-btn" onclick="saveAdminDesign()">Сохранить сайт</button>
    `;
  }
  if (tab === 'banners') {
    content = `
      <div class="item-box"><label>Баннер: Ракета (Файл)</label><div style="font-size:40px; margin-bottom:10px; text-align:center; height:100px; background:#000; display:flex; align-items:center; justify-content:center;">${siteConfig.bannerRocket.includes('data:') ? `<img src="${siteConfig.bannerRocket}" style="width:100%; height:100%; object-fit:cover;">` : siteConfig.bannerRocket}</div><input type="file" id="bannerRocketFile" accept="image/*" style="margin-bottom:8px; width:100%;"><input type="text" id="bannerRocketEmoji" placeholder="Эмодзи" value="${siteConfig.bannerRocket.includes('data:') ? '' : siteConfig.bannerRocket}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #2a2e3d; background:#000; color:#fff;"></div>
      <div class="item-box" style="margin-top:15px;"><label>Баннер: Мины (Файл)</label><div style="font-size:40px; margin-bottom:10px; text-align:center; height:100px; background:#000; display:flex; align-items:center; justify-content:center;">${siteConfig.bannerMines.includes('data:') ? `<img src="${siteConfig.bannerMines}" style="width:100%; height:100%; object-fit:cover;">` : siteConfig.bannerMines}</div><input type="file" id="bannerMinesFile" accept="image/*" style="margin-bottom:8px; width:100%;"><input type="text" id="bannerMinesEmoji" placeholder="Эмодзи" value="${siteConfig.bannerMines.includes('data:') ? '' : siteConfig.bannerMines}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #2a2e3d; background:#000; color:#fff;"></div>
      <button class="admin-btn" style="margin-top:20px;" onclick="saveAdminBanners()">Сохранить баннеры</button>
    `;
  }
  if (tab === 'cases') {
    let opts = Object.values(CASES).map(c => `<option value="${c.id}">${c.title}</option>`).join('');
    content = `<div class="form-group"><label>Выберите кейс</label><select id="admCaseSelect" onchange="renderCaseEdit()">${opts}</select></div><div id="caseEditArea"></div><button class="admin-btn" style="background:#6366f1;" onclick="createNewCase()">+ Создать кейс</button>`;
  }
  if (tab === 'players') {
    content = `
      <div class="section-title" style="font-size:16px; margin-bottom:12px;">Выдача денег игроку</div>
      <div class="form-group"><label>Telegram ID игрока</label><input type="text" id="admPlayerId" placeholder="Например: 123456789"></div>
      <div class="form-group"><label>Сумма (в рублях)</label><input type="number" id="admPlayerSum" value="100"></div>
      <button class="admin-btn" style="background:#3b82f6; color:#fff;" onclick="giveMoneyToPlayer()">Выдать баланс</button>
    `;
  }
  document.getElementById('adminContent').innerHTML = `
    <div class="admin-header"><h2>Админка</h2><div class="close-admin" onclick="closeModal('adminModal')">✕</div></div>
    <div class="admin-tabs">
      <div class="adm-tab ${tab === 'design' ? 'active' : ''}" onclick="switchAdminTab('design')">Сайт</div>
      <div class="adm-tab ${tab === 'banners' ? 'active' : ''}" onclick="switchAdminTab('banners')">Баннеры</div>
      <div class="adm-tab ${tab === 'cases' ? 'active' : ''}" onclick="switchAdminTab('cases')">Кейсы</div>
      <div class="adm-tab ${tab === 'players' ? 'active' : ''}" onclick="switchAdminTab('players')">Игроки</div>
    </div>
    ${content}
  `;
  if (tab === 'design') { 
    let rFile = document.getElementById('cfgRocketFile');
    if (rFile) rFile.addEventListener('change', e => { const f = e.target.files[0]; if(f) { const r = new FileReader(); r.onload = ev => { siteConfig.rocketImage = ev.target.result; }; r.readAsDataURL(f); } }); 
    let sFile = document.getElementById('cfgSplashFile');
    if (sFile) sFile.addEventListener('change', e => { const f = e.target.files[0]; if(f) { const r = new FileReader(); r.onload = ev => { siteConfig.splashSticker = ev.target.result; }; r.readAsDataURL(f); } }); 
  }
  if (tab === 'banners') {
    let brFile = document.getElementById('bannerRocketFile');
    if (brFile) brFile.addEventListener('change', e => { const f = e.target.files[0]; if(f) { const r = new FileReader(); r.onload = ev => { siteConfig.bannerRocket = ev.target.result; document.getElementById('bannerRocketEmoji').value = ''; }; r.readAsDataURL(f); } });
    let bmFile = document.getElementById('bannerMinesFile');
    if (bmFile) bmFile.addEventListener('change', e => { const f = e.target.files[0]; if(f) { const r = new FileReader(); r.onload = ev => { siteConfig.bannerMines = ev.target.result; document.getElementById('bannerMinesEmoji').value = ''; }; r.readAsDataURL(f); } });
  }
  if (tab === 'cases') renderCaseEdit();
}

async function giveMoneyToPlayer() {
  const targetId = document.getElementById('admPlayerId').value.trim(); 
  const sum = parseInt(document.getElementById('admPlayerSum').value);
  if (!targetId) return alert('Введите ID игрока!'); 
  if (!sum || sum <= 0) return alert('Введите корректную сумму!');
  try {
    let { data: p } = await supabaseClient.from('players').select('*').eq('id', targetId).single();
    if (p) {
      await supabaseClient.from('players').update({ balance: p.balance + sum }).eq('id', targetId);
      alert(`Успешно выдано ${sum}₽ игроку ${p.first_name} (${targetId})!`);
      if (targetId == userData.id) { balance += sum; render(); }
    } else { alert('Игрок с таким ID не найден в базе.'); }
  } catch(e) { alert('Ошибка базы!'); }
}

async function saveAdminDesign() {
  siteConfig.logoText = document.getElementById('cfgLogoText').value; 
  siteConfig.logoAccent = document.getElementById('cfgLogoAccent').value;
  siteConfig.accentColor = document.getElementById('cfgAccent').value;
  if (document.getElementById('cfgRocketEmoji').value) siteConfig.rocketImage = document.getElementById('cfgRocketEmoji').value;
  if (document.getElementById('cfgSplashEmoji').value) siteConfig.splashSticker = document.getElementById('cfgSplashEmoji').value;
  applyDesign(); render(); await saveConfig(); alert('Настройки сохранены!');
}

async function saveAdminBanners() {
  if (document.getElementById('bannerRocketEmoji').value) siteConfig.bannerRocket = document.getElementById('bannerRocketEmoji').value;
  if (document.getElementById('bannerMinesEmoji').value) siteConfig.bannerMines = document.getElementById('bannerMinesEmoji').value;
  applyDesign(); await saveConfig(); alert('Баннеры сохранены!');
}

function renderCaseEdit() {
  const id = document.getElementById('admCaseSelect').value; const c = CASES[id];
  let isImg = c.mainImg.includes('data:');
  document.getElementById('caseEditArea').innerHTML = `
    <div class="item-box">
      <div class="form-group"><label>Название</label><input type="text" id="admCaseTitle" value="${c.title}"></div>
      <div class="form-group"><label>Цена</label><input type="number" id="admCasePrice" value="${c.price}"></div>
      <div class="form-group"><label>Иконка Кейса (Файл или эмодзи)</label><input type="file" id="admCaseFile" accept="image/*" style="margin-bottom:8px;"><input type="text" id="admCaseEmoji" placeholder="Эмодзи" value="${isImg ? '' : c.mainImg}"></div>
      <button class="admin-btn" style="background:#7c3aed; color:#fff;" onclick="saveAdminCase('${id}')">Сохранить</button>
      <button class="admin-btn" style="background:#ef4444; color:#fff;" onclick="deleteAdminCase('${id}')">Удалить</button>
    </div>
    <h3 style="margin:20px 0 10px; font-size:14px; color:#fff;">Предметы в кейсе:</h3>
    ${c.rewards.map((r,i) => `
      <div class="item-box" style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:10px;">
          ${r.img.includes('data:') ? `<img src="${r.img}" style="width:30px;height:30px;object-fit:contain;">` : `<span style="font-size:24px;">${r.img}</span>`}
          <div style="color:#fff;"><b>${r.name}</b> <br><span style="font-size:11px; color:#8b92a5;">Шанс: ${r.chance} | Цена: ${r.sellPrice}₽</span></div>
        </div>
        <span style="color:red; cursor:pointer; font-size:16px; font-weight:bold;" onclick="deleteAdminItem('${id}', ${i})">✕</span>
      </div>
    `).join('')}
    <button class="admin-btn" style="background:#3b82f6; color:#fff;" onclick="openAddItemForm('${id}')">+ Добавить предмет</button>
    <div id="addItemForm" style="display:none; margin-top:10px;"></div>
  `;
  let aFile = document.getElementById('admCaseFile');
  if (aFile) aFile.addEventListener('change', e => { const f = e.target.files[0]; if(f) { const r = new FileReader(); r.onload = ev => { CASES[id].mainImg = ev.target.result; render(); renderCaseEdit(); }; r.readAsDataURL(f); } });
}

function openAddItemForm(id) {
  document.getElementById('addItemForm').style.display = 'block';
  document.getElementById('addItemForm').innerHTML = `
    <div class="item-box" style="border:1px solid #3b82f6;">
      <div class="form-group"><label>Название предмета</label><input type="text" id="newItemName" placeholder="Например: 10₽"></div>
      <div class="form-group"><label>Иконка предмета (Файл или эмодзи)</label><input type="file" id="newItemFile" accept="image/*" style="margin-bottom:8px;"><input type="text" id="newItemEmoji" placeholder="Эмодзи (🎁)"></div>
      <div class="form-group"><label>Шанс выпадения</label><input type="number" id="newItemChance" value="10"></div>
      <div class="form-group"><label>Цена продажи (в рублях)</label><input type="number" id="newItemSellPrice" value="10"></div>
      <button class="admin-btn" onclick="saveNewItem('${id}')">Добавить</button>
    </div>
  `;
}

let newItemImgBase64 = null;
document.addEventListener('change', e => { if(e.target.id === 'newItemFile') { const f = e.target.files[0]; if(f) { const r = new FileReader(); r.onload = ev => { newItemImgBase64 = ev.target.result; document.getElementById('newItemEmoji').value = ''; }; r.readAsDataURL(f); } } });

async function saveNewItem(id) {
  const name = document.getElementById('newItemName').value; const emoji = document.getElementById('newItemEmoji').value;
  const chance = parseInt(document.getElementById('newItemChance').value) || 10; const sellPrice = parseInt(document.getElementById('newItemSellPrice').value) || 10;
  let img = newItemImgBase64 || emoji || '📦';
  CASES[id].rewards.push({ type: 'sticker', name: name, chance: chance, img: img, sellPrice: sellPrice });
  newItemImgBase64 = null; render(); renderCaseEdit(); await saveConfig(); alert('Предмет добавлен!');
}

function deleteAdminItem(caseId, index) { CASES[caseId].rewards.splice(index, 1); render(); renderCaseEdit(); saveConfig(); }
async function saveAdminCase(id) {
  CASES[id].title = document.getElementById('admCaseTitle').value; CASES[id].price = parseInt(document.getElementById('admCasePrice').value) || 0;
  CASES[id].isFree = CASES[id].price === 0;
  if (document.getElementById('admCaseEmoji').value) CASES[id].mainImg = document.getElementById('admCaseEmoji').value;
  render(); await saveConfig(); alert('Кейс сохранен!');
}
function deleteAdminCase(id) { if(confirm('Удалить кейс?')) { delete CASES[id]; render(); switchAdminTab('cases'); saveConfig(); } }
async function createNewCase() {
  const newId = 'case_' + Date.now();
  CASES[newId] = { id: newId, title: 'Новый кейс', price: 10, isFree: false, mainImg: '🎁', rewards: [] };
  render(); switchAdminTab('cases'); document.getElementById('admCaseSelect').value = newId; renderCaseEdit(); await saveConfig();
}

function switchMainTab(tabId, el) {
  document.querySelectorAll('.top-tab').forEach(t => t.classList.remove('active')); el.classList.add('active');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById('screen-' + tabId).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if(tabId === 'cases') document.getElementById('nav-home').classList.add('active');
}
function switchBottomTab(tabId, el) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active')); el.classList.add('active');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById('screen-' + tabId).classList.add('active');
  if (tabId === 'profile') render();
  if (tabId === 'top') loadLeaderboard();
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function setTheme(bg, accent, el) {
  document.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active')); el.classList.add('active');
  siteConfig.accentColor = accent;
  document.querySelectorAll('.case-btn, .spin-btn, .game-play-btn, .top-tab.active').forEach(btn => { btn.style.background = accent; });
}
function openDeposit() { document.getElementById('depositScreen').classList.add('active'); }
function payWithStars() { if (tg) { tg.showPopup({ title: 'Оплата Stars', message: 'Чтобы купить звёзды, перейдите в нашего бота.', buttons: [{type: 'ok'}] }); } else { alert("Для оплаты Stars нужно запустить приложение в Telegram."); } }
function payWithCrypto() { if (tg) { tg.openLink('https://t.me/yahimki'); } else { window.open('https://t.me/yahimki', '_blank'); } alert("Для оплаты криптовалютой напишите владельцу: @yahimki"); }
function handleWithdraw() { if (tg) { tg.openTelegramLink("https://t.me/yahimki"); } else { window.open("https://t.me/yahimki", "_blank"); } alert("Вывод доступен только для стикеров.\n\nНапишите нашему владельцу: @yahimki"); }

window.onload = function() {
  initSplash();
  initApp();
};
