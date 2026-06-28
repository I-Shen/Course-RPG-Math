// Custom JRPG Dialog Box Modal
function showJRPGDialog(title, message, onConfirm = null) {
  if (window.audioEngine) {
    window.audioEngine.init();
    window.audioEngine.playBeep();
  }

  const modal = document.getElementById('dialog-modal');
  const titleEl = document.getElementById('dialog-title');
  const bodyEl = document.getElementById('dialog-body');
  const btnEl = document.getElementById('dialog-confirm-btn');

  if (!modal || !titleEl || !bodyEl || !btnEl) {
    // Fallback jika modal DOM belum siap
    console.log("JRPG Dialog Fallback:", title, message);
    if (onConfirm) onConfirm();
    return;
  }

  titleEl.innerText = title.toUpperCase();
  bodyEl.innerHTML = message.replace(/\n/g, '<br>');
  modal.style.display = 'flex';

  btnEl.onclick = () => {
    if (window.audioEngine) window.audioEngine.playBeep();
    modal.style.display = 'none';
    if (onConfirm) onConfirm();
  };
}

// Override alert bawaan browser secara global
window.alert = function(message) {
  showJRPGDialog("GAME SYSTEM", message);
};

let currentUser = null;
let currentBattle = null;
let coopSocket = null;
let canvas = null;
let ctx = null;
let animationFrameId = null;

// Game Visual Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 250;

// Particle System
let particles = [];
let damageNumbers = [];

// Sprite Positions
let playerSprites = []; // Untuk co-op (menampung 1-3 pemain)
let monsterSprite = {
  x: 550,
  y: 150,
  width: 70,
  height: 70,
  bob: 0,
  hurtTimer: 0,
  attackTimer: 0,
  isDead: false,
  alpha: 1.0,
  name: "Slime"
};

// ==================== INITIALIZATION ====================

window.onload = () => {
  currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) {
    window.location.href = 'login.html';
    return;
  }

  // Update Header Stats
  syncHeaderStats();

  // Inisialisasi Canvas
  canvas = document.getElementById('battle-canvas');
  if (canvas) {
    ctx = canvas.getContext('2d');
  }

  // Auto-Play Town BGM saat interaksi pertama
  document.body.addEventListener('click', () => {
    if (window.audioEngine.currentBgmType === null) {
      window.audioEngine.init();
      window.audioEngine.playBGM('town');
    }
  }, { once: true });

  // Deteksi event klik untuk Pixel Burst Particle
  document.body.addEventListener('mousedown', (e) => {
    createPixelBurst(e.clientX, e.clientY, 10, ['#ffff00', '#ff00ff', '#00ffff']);
  });

  // Tampilkan Quest & Event Status di Guild Board awal
  updateGuildBoardStatus();
};

function syncHeaderStats() {
  if (!currentUser) return;
  document.getElementById('header-username').innerText = currentUser.username;
  document.getElementById('header-title').innerText = `[${currentUser.stats.activeTitle}]`;
  document.getElementById('header-lv').innerText = currentUser.stats.level;
  document.getElementById('header-hp').innerText = `${currentUser.stats.hp}/${currentUser.stats.maxHp}`;
  document.getElementById('header-gold').innerText = currentUser.stats.gold;
  document.getElementById('header-streak').innerText = currentUser.stats.dailyStreak;
  
  // Update HP bar di HUD jika di tengah battle
  const hudHp = document.getElementById('hud-hp-bar');
  const hudHpText = document.getElementById('hud-hp-text');
  if (hudHp && hudHpText) {
    const hpPercent = (currentUser.stats.hp / currentUser.stats.maxHp) * 100;
    hudHp.style.width = `${hpPercent}%`;
    hudHpText.innerText = `${currentUser.stats.hp}/${currentUser.stats.maxHp}`;
  }

  // Update EXP bar
  const hudExp = document.getElementById('hud-exp-bar');
  const hudExpText = document.getElementById('hud-exp-text');
  if (hudExp && hudExpText) {
    const reqExp = currentUser.stats.level * 100;
    const expPercent = (currentUser.stats.exp / reqExp) * 100;
    hudExp.style.width = `${expPercent}%`;
    hudExpText.innerText = `${currentUser.stats.exp}/${reqExp}`;
  }
  updateRightStatusPanel();
}

function updateGuildBoardStatus() {
  const hourlyStatus = document.getElementById('hourly-event-status');
  const dailyStatus = document.getElementById('daily-quest-status');
  if (!hourlyStatus) return;

  const currentHour = new Date().getHours();
  if (currentHour % 2 === 0) {
    hourlyStatus.innerText = "AKTIF (Double EXP Hour!)";
    hourlyStatus.style.color = "var(--text-green)";
  } else {
    hourlyStatus.innerText = "TIDAK AKTIF";
    hourlyStatus.style.color = "var(--text-gray)";
  }

  // Quest Harian
  const today = new Date().toISOString().split('T')[0];
  const finished = localStorage.getItem(`daily_quest_${currentUser.username}_${today}`) === 'done';
  if (finished) {
    dailyStatus.innerText = "SELESAI (Bonus +50g Diklaim)";
    dailyStatus.style.color = "var(--text-green)";
  } else {
    dailyStatus.innerText = "BELUM SELESAI";
    dailyStatus.style.color = "var(--text-red)";
  }
}

// Mute Audio Toggle
function toggleMuteAudio() {
  window.audioEngine.init();
  const isMuted = window.audioEngine.toggleMute();
  document.getElementById('mute-btn').innerText = isMuted ? "🔇 UNMUTE" : "🔊 MUTE";
}

function logout() {
  localStorage.removeItem('currentUser');
  window.location.href = 'login.html';
}

// ==================== REST AT INN (HP HEAL) ====================

async function restAtInn() {
  window.audioEngine.playBeep();
  
  if (currentUser.stats.hp === currentUser.stats.maxHp) {
    alert("HP Anda sudah penuh! Tidak perlu beristirahat di Penginapan.");
    return;
  }

  try {
    const res = await fetch('/api/town/heal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentUser.stats = data.newStats;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    syncHeaderStats();
    
    // Mainkan sound level up / pulih
    window.audioEngine.playLevelUp();
    alert(data.message);
  } catch (err) {
    alert(err.message);
  }
}

// ==================== REDEEM SIMULASI TOP-UP ====================

function openRedeemModal() {
  window.audioEngine.playBeep();
  document.getElementById('redeem-modal').style.display = 'flex';
}

async function submitRedeemCode() {
  window.audioEngine.playBeep();
  const codeInput = document.getElementById('redeem-input');
  const code = codeInput.value;

  try {
    const res = await fetch('/api/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, code })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentUser.stats = data.newStats;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    syncHeaderStats();

    window.audioEngine.playVictory();
    alert(data.message);
    closeModal('redeem-modal');
    codeInput.value = '';
  } catch (err) {
    alert(err.message);
    window.audioEngine.playHurt();
  }
}

// ==================== SYSTEM PARTIKEL & VISUAL BURST ====================

function createPixelBurst(x, y, count, colors) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 2,
      size: Math.random() * 4 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1.0,
      life: 0.02 + Math.random() * 0.03
    });
  }
}

function spawnDamageNumber(x, y, amount, isHeal = false) {
  damageNumbers.push({
    x: x,
    y: y,
    text: amount,
    color: isHeal ? "var(--text-green)" : "var(--text-red)",
    alpha: 1.0,
    vy: -2
  });
}

function updateVisualObjects() {
  // Update Partikel
  particles.forEach((p, idx) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // Gravitasi
    p.alpha -= p.life;
    if (p.alpha <= 0) particles.splice(idx, 1);
  });

  // Update Damage Numbers
  damageNumbers.forEach((d, idx) => {
    d.y += d.vy;
    d.alpha -= 0.02;
    if (d.alpha <= 0) damageNumbers.splice(idx, 1);
  });
}

// ==================== RENDERING CANVAS GAME LOOP (60 FPS) ====================

function drawBattle() {
  if (!ctx) return;

  // 1. Clear Screen & Draw Sky Gradient (2.5D background)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 90);
  skyGrad.addColorStop(0, "#001133");
  skyGrad.addColorStop(1, "#3b82f6");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, 90);

  // 2. Draw Mountains Silhouettes
  ctx.fillStyle = "#1e3a8a"; // Far mountains
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(50, 60);
  ctx.lineTo(120, 80);
  ctx.lineTo(180, 50);
  ctx.lineTo(260, 90);
  ctx.lineTo(340, 65);
  ctx.lineTo(410, 85);
  ctx.lineTo(490, 45);
  ctx.lineTo(580, 90);
  ctx.lineTo(650, 55);
  ctx.lineTo(720, 80);
  ctx.lineTo(800, 90);
  ctx.closePath();
  ctx.fill();
   
  ctx.fillStyle = "#0f172a"; // Near mountains
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(80, 75);
  ctx.lineTo(160, 90);
  ctx.lineTo(220, 70);
  ctx.lineTo(300, 85);
  ctx.lineTo(380, 75);
  ctx.lineTo(450, 90);
  ctx.lineTo(520, 65);
  ctx.lineTo(610, 85);
  ctx.lineTo(680, 75);
  ctx.lineTo(800, 90);
  ctx.closePath();
  ctx.fill();

  // 3. Horizon line & Slanted Ground
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(CANVAS_WIDTH, 90);
  ctx.stroke();

  ctx.fillStyle = "#854d0e"; // Warm brown dirt floor
  ctx.fillRect(0, 90, CANVAS_WIDTH, CANVAS_HEIGHT - 90);

  // 4. Perspective Grid Lines (2.5D depth)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  const vpX = 400;
  const vpY = 70;
  
  // Vertical perspective lines
  for (let i = -10; i <= 20; i++) {
    const xAtBottom = vpX + i * 80;
    ctx.beginPath();
    ctx.moveTo(vpX + (xAtBottom - vpX) * (90 - vpY) / (CANVAS_HEIGHT - vpY), 90);
    ctx.lineTo(xAtBottom, CANVAS_HEIGHT);
    ctx.stroke();
  }

  // Horizontal perspective lines (spacing out as they approach the bottom)
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const y = 90 + t * t * (CANVAS_HEIGHT - 90);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }

  // Grass patches in perspective
  ctx.fillStyle = "#15803d";
  const grassPatches = [
    {x: 100, y: 110, w: 6, h: 3},
    {x: 300, y: 105, w: 5, h: 2},
    {x: 650, y: 115, w: 7, h: 3},
    {x: 150, y: 150, w: 10, h: 4},
    {x: 480, y: 140, w: 9, h: 4},
    {x: 720, y: 160, w: 12, h: 5},
    {x: 250, y: 200, w: 18, h: 6},
    {x: 580, y: 210, w: 20, h: 7}
  ];
  grassPatches.forEach(g => {
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.fillRect(g.x + g.w/4, g.y - g.h/2, g.w/5, g.h/2);
    ctx.fillRect(g.x + g.w*2/3, g.y - g.h/3, g.w/5, g.h/3);
  });

  // 5. Draw Drop Shadows (Ovals under characters for 2.5D volume)
  playerSprites.forEach((player, idx) => {
    if (player.hp <= 0) return;
    const baseX = 620 - idx * 40;
    const baseY = 100 + idx * 40;
    let drawX = baseX;
    let drawY = baseY;
    if (player.attackTimer > 0) {
      const t = player.attackTimer / 20;
      const progress = Math.sin((1 - t) * Math.PI);
      drawX -= progress * 150;
      drawY -= progress * 40;
    } else if (player.hurtTimer > 0) {
      drawX += 15;
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    ctx.ellipse(drawX + 10, drawY + 44, 15, 5, 0, 0, 2*Math.PI);
    ctx.fill();
  });

  if (!monsterSprite.isDead) {
    let mX = monsterSprite.x;
    let mY = monsterSprite.y;
    if (monsterSprite.attackTimer > 0) {
      const t = monsterSprite.attackTimer / 20;
      const progress = Math.sin((1 - t) * Math.PI);
      mX += progress * 180;
      mY -= progress * 40;
    } else if (monsterSprite.hurtTimer > 0) {
      mX -= 15;
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.beginPath();
    const shadowW = (currentBattle && currentBattle.isBoss) ? 55 : 30;
    const shadowH = (currentBattle && currentBattle.isBoss) ? 12 : 8;
    const shadowOffsetY = (currentBattle && currentBattle.isBoss) ? 60 : 35;
    ctx.ellipse(mX + shadowW/2 + 5, mY + shadowOffsetY, shadowW, shadowH, 0, 0, 2*Math.PI);
    ctx.fill();
  }

  // 6. Draw Player Sprites (Facing Left in Staggered Slanted Formation)
  playerSprites.forEach((player, idx) => {
    if (player.hp <= 0) return;

    const baseX = 620 - idx * 40;
    const baseY = 100 + idx * 40;
    
    let drawX = baseX;
    let drawY = baseY;
    
    if (player.attackTimer > 0) {
      const t = player.attackTimer / 20;
      const progress = Math.sin((1 - t) * Math.PI);
      drawX -= progress * 150;
      drawY -= progress * 40;
      player.attackTimer--;
    } else if (player.hurtTimer > 0) {
      drawX += 15;
      player.hurtTimer--;
    }

    const bob = Math.sin(Date.now() / 150 + idx) * 2;
    drawY += bob;

    // Save actual coordinate in sprite for particles / damage popups
    player.x = drawX;
    player.y = drawY;

    ctx.save();
    
    if (player.hurtTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
      ctx.filter = "brightness(3) saturate(0) sepia(1) hue-rotate(-50deg) saturate(5)";
    }

    // A. Cape (Back element, drawn behind)
    if (player.charClass === 'mage') {
      ctx.fillStyle = "#3b82f6"; // Blue cape
      ctx.fillRect(drawX + 18, drawY + 15, 6, 25);
    } else if (player.charClass === 'cleric') {
      ctx.fillStyle = "#ef4444"; // Red cape
      ctx.fillRect(drawX + 18, drawY + 15, 6, 25);
    } else {
      ctx.fillStyle = "#475569"; // Warrior steel pauldron cape
      ctx.fillRect(drawX + 18, drawY + 15, 6, 20);
    }

    // B. Body / Robe
    if (player.equippedGear?.armor && player.equippedGear.armor !== "None") {
      ctx.fillStyle = "#d4af37"; // Golden Armor
    } else {
      if (player.charClass === 'warrior') ctx.fillStyle = "#dc2626"; // Red Warrior Armor
      else if (player.charClass === 'mage') ctx.fillStyle = "#1d4ed8"; // Blue Mage Robe
      else ctx.fillStyle = "#f3f4f6"; // White Cleric Robe
    }
    ctx.fillRect(drawX, drawY + 15, 20, 28);
    
    // Cleric Red Triangles at hem
    if (player.charClass === 'cleric' && (!player.equippedGear?.armor || player.equippedGear.armor === "None")) {
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(drawX, drawY + 38, 4, 5);
      ctx.fillRect(drawX + 8, drawY + 38, 4, 5);
      ctx.fillRect(drawX + 16, drawY + 38, 4, 5);
    }

    // C. Face & Head (facing Left)
    ctx.fillStyle = player.gender === "male" ? "#fbcfe8" : "#fef08a"; // Skin
    ctx.fillRect(drawX + 2, drawY - 2, 16, 18);
    
    // Hair (facing Left)
    ctx.fillStyle = player.gender === "male" ? "#1e293b" : "#ea580c";
    ctx.fillRect(drawX + 2, drawY - 5, 16, 5); // Hair top
    ctx.fillRect(drawX + 14, drawY - 2, 4, 12); // Hair back/side
    
    // Left eye (looking LEFT)
    ctx.fillStyle = "#000000";
    ctx.fillRect(drawX + 4, drawY + 4, 2, 3);

    // D. Hat / Accessories
    if (player.equippedGear?.hat && player.equippedGear.hat !== "None") {
      ctx.fillStyle = "#4c1d95"; // Crown
      ctx.beginPath();
      ctx.moveTo(drawX - 2, drawY - 4);
      ctx.lineTo(drawX + 10, drawY - 22);
      ctx.lineTo(drawX + 22, drawY - 4);
      ctx.closePath();
      ctx.fill();
    } else {
      if (player.charClass === 'mage') {
        // Yellow Wizard Hat (Black Mage style)
        ctx.fillStyle = "#eab308";
        ctx.beginPath();
        ctx.moveTo(drawX - 3, drawY - 4);
        ctx.lineTo(drawX + 8, drawY - 24);
        ctx.lineTo(drawX + 21, drawY - 4);
        ctx.closePath();
        ctx.fill();
        
        ctx.fillStyle = "#ca8a04";
        ctx.fillRect(drawX - 4, drawY - 4, 26, 3);
      } else if (player.charClass === 'cleric') {
        // White Hood
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(drawX + 1, drawY - 6, 18, 5);
        ctx.fillRect(drawX + 14, drawY - 2, 5, 18); // Hood back
        ctx.fillRect(drawX + 1, drawY - 2, 3, 10);  // Hood front
      } else if (player.charClass === 'warrior') {
        // Headband
        ctx.fillStyle = "#2563eb";
        ctx.fillRect(drawX + 1, drawY - 1, 18, 4);
      }
    }

    // E. Weapon pointing LEFT
    if (player.equippedGear?.weapon && player.equippedGear.weapon !== "None") {
      ctx.fillStyle = "#ffd700";
      ctx.fillRect(drawX - 12, drawY + 16, 14, 4); // golden blade
      ctx.fillStyle = "#854d0e";
      ctx.fillRect(drawX - 2, drawY + 14, 3, 8); // hilt
    } else {
      if (player.charClass === 'warrior') {
        // Steel Sword pointing left
        ctx.fillStyle = "#94a3b8"; // steel blade
        ctx.fillRect(drawX - 14, drawY + 16, 16, 4);
        ctx.fillStyle = "#ca8a04"; // golden guard
        ctx.fillRect(drawX - 2, drawY + 13, 3, 10);
      } else if (player.charClass === 'mage') {
        // Staff pointing left
        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(drawX + 6, drawY + 32);
        ctx.lineTo(drawX - 6, drawY + 10);
        ctx.stroke();
        
        ctx.fillStyle = "#22c55e"; // glowing orb
        ctx.beginPath();
        ctx.arc(drawX - 6, drawY + 10, 4, 0, 2*Math.PI);
        ctx.fill();
      } else if (player.charClass === 'cleric') {
        // Mace pointing left
        ctx.strokeStyle = "#d1d5db";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(drawX + 5, drawY + 28);
        ctx.lineTo(drawX - 4, drawY + 15);
        ctx.stroke();
        
        ctx.fillStyle = "#facc15"; // star tip
        ctx.fillRect(drawX - 6, drawY + 12, 4, 4);
      }
    }

    ctx.restore();

    // Text name and levels
    ctx.fillStyle = "#fff";
    ctx.font = "6px 'Press Start 2P'";
    ctx.fillText(`${player.username} (LV:${player.level})`, drawX - 10, drawY + 54);

    // HP Bar above head
    const barWidth = 30;
    const hpRatio = player.hp / player.maxHp;
    ctx.fillStyle = "#555";
    ctx.fillRect(drawX - 2, drawY - 12, barWidth, 3);
    ctx.fillStyle = hpRatio > 0.4 ? "var(--text-green)" : "var(--text-red)";
    ctx.fillRect(drawX - 2, drawY - 12, barWidth * hpRatio, 3);
  });

  // 7. Draw Monster Sprite (Facing Right on the Left Side)
  if (!monsterSprite.isDead) {
    let mX = monsterSprite.x;
    let mY = monsterSprite.y;

    if (monsterSprite.attackTimer > 0) {
      const t = monsterSprite.attackTimer / 20;
      const progress = Math.sin((1 - t) * Math.PI);
      mX += progress * 180;
      mY -= progress * 40;
      monsterSprite.attackTimer--;
    } else if (monsterSprite.hurtTimer > 0) {
      mX -= 15;
      monsterSprite.hurtTimer--;
    }

    const mBob = Math.sin(Date.now() / 200) * 4;
    mY += mBob;

    ctx.save();
    ctx.globalAlpha = monsterSprite.alpha;

    if (monsterSprite.hurtTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
      ctx.filter = "brightness(3) saturate(0) sepia(1) hue-rotate(50deg)";
    }

    // Draw procedural monster
    if (currentBattle && currentBattle.isBoss) {
      // Red Demon Boss (Volumetric Shade)
      ctx.fillStyle = "#991b1b"; // shadow body
      ctx.beginPath();
      ctx.moveTo(mX + 15, mY + 60);
      ctx.lineTo(mX - 10, mY + 20);
      ctx.lineTo(mX + 20, mY - 10);
      ctx.lineTo(mX + 50, mY - 10);
      ctx.lineTo(mX + 80, mY + 20);
      ctx.lineTo(mX + 55, mY + 60);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#dc2626"; // light body
      ctx.beginPath();
      ctx.moveTo(mX + 20, mY + 55);
      ctx.lineTo(mX + 0, mY + 22);
      ctx.lineTo(mX + 22, mY - 6);
      ctx.lineTo(mX + 45, mY - 6);
      ctx.lineTo(mX + 70, mY + 22);
      ctx.lineTo(mX + 50, mY + 55);
      ctx.closePath();
      ctx.fill();

      // Yellow eyes looking RIGHT
      ctx.fillStyle = "#ffff00";
      ctx.fillRect(mX + 25, mY + 15, 10, 5);
      ctx.fillRect(mX + 55, mY + 15, 10, 5);

      // Wings
      ctx.fillStyle = "#450a0a";
      ctx.beginPath();
      ctx.moveTo(mX - 10, mY + 20);
      ctx.lineTo(mX - 35, mY - 5);
      ctx.lineTo(mX - 15, mY + 5);
      ctx.lineTo(mX - 25, mY + 25);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(mX + 80, mY + 20);
      ctx.lineTo(mX + 105, mY - 5);
      ctx.lineTo(mX + 85, mY + 5);
      ctx.lineTo(mX + 95, mY + 25);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
      ctx.fillStyle = "var(--text-yellow)";
      ctx.font = "8px 'Press Start 2P'";
      ctx.fillText(monsterSprite.name, mX - 5, mY - 20);
      
      const bossHpPercent = currentBattle.bossHp / currentBattle.bossMaxHp;
      ctx.fillStyle = "#555";
      ctx.fillRect(mX - 10, mY - 12, 90, 5);
      ctx.fillStyle = "var(--text-red)";
      ctx.fillRect(mX - 10, mY - 12, 90 * bossHpPercent, 5);
    } else {
      // Shiny Green Slime (gradient)
      const slimeGrad = ctx.createRadialGradient(mX + 30, mY + 30, 5, mX + 30, mY + 35, 30);
      slimeGrad.addColorStop(0, "#86efac");
      slimeGrad.addColorStop(1, "#15803d");
      ctx.fillStyle = slimeGrad;
      
      ctx.beginPath();
      ctx.arc(mX + 30, mY + 35, 30, 0, Math.PI, true);
      ctx.lineTo(mX, mY + 35);
      ctx.closePath();
      ctx.fill();

      // Eyes looking RIGHT
      ctx.fillStyle = "#000";
      ctx.fillRect(mX + 26, mY + 20, 4, 4);
      ctx.fillRect(mX + 46, mY + 20, 4, 4);
      
      // Shiny gloss reflection
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(mX + 15, mY + 18, 3, 0, 2*Math.PI);
      ctx.fill();

      ctx.restore();
      ctx.fillStyle = "#fff";
      ctx.font = "6px 'Press Start 2P'";
      ctx.fillText(monsterSprite.name, mX + 10, mY - 8);
    }
  }

  // 5. Draw Visual Effects (Partikel & Angka Damage)
  particles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1.0; // Reset alpha

  damageNumbers.forEach(d => {
    ctx.fillStyle = d.color;
    ctx.font = "14px 'Press Start 2P'";
    ctx.globalAlpha = d.alpha;
    ctx.fillText(d.text, d.x, d.y);
  });
  ctx.globalAlpha = 1.0; // Reset alpha

  // Loop request Frame
  updateVisualObjects();
  animationFrameId = requestAnimationFrame(drawBattle);
}

// ==================== ENGINE BATTLE MATH SOLO ====================

async function startSoloBattle(chapterId, chapterName) {
  window.audioEngine.playBeep();
  closeModal('adventure-modal');

  // Trigger Efek Layar Swirl JRPG Klasik sebelum masuk Arena
  const overlay = document.getElementById('screen-transition-overlay');
  overlay.style.display = 'block';
  overlay.classList.add('swirl-transition');
  
  // Ganti musik ke Battle Theme
  window.audioEngine.playBGM('battle');

  // Load Pertanyaan dari Server
  try {
    const res = await fetch(`/api/questions/chapter/${chapterId}`);
    const questions = await res.json();
    if (!res.ok) throw new Error("Gagal mengambil soal pertarungan.");

    if (questions.length === 0) {
      alert("Belum ada soal matematika terdaftar untuk bab ini. Guru/Admin harus menginputnya!");
      overlay.style.display = 'none';
      overlay.classList.remove('swirl-transition');
      window.audioEngine.playBGM('town');
      return;
    }

    setTimeout(() => {
      // Masuk ke Mode Battle Interface
      document.getElementById('town-interface').style.display = 'none';
      document.getElementById('battle-interface').style.display = 'flex';
      overlay.style.display = 'none';
      overlay.classList.remove('swirl-transition');

      // Setup State Pertempuran
      currentBattle = {
        chapterId,
        chapterName,
        isBoss: chapterId === 'ch5' || chapterId === 'ch1' || chapterId.endsWith('5') || chapterId.endsWith('0') || chapterId === 'ch8', // Level Boss
        questions,
        currentQuestionIndex: 0,
        bossMaxHp: chapterId.endsWith('5') || chapterId.endsWith('0') || chapterId === 'ch8' ? 200 : 100,
        bossHp: chapterId.endsWith('5') || chapterId.endsWith('0') || chapterId === 'ch8' ? 200 : 100,
        isCoop: false
      };

      // Inisialisasi Monster Sprite
      monsterSprite.name = currentBattle.isBoss ? "FRACTION OVERLORD" : "MATH GOBLIN";
      monsterSprite.maxHp = currentBattle.bossMaxHp;
      monsterSprite.hp = currentBattle.bossHp;
      monsterSprite.isDead = false;
      monsterSprite.alpha = 1.0;
      monsterSprite.x = currentBattle.isBoss ? 160 : 200;
      monsterSprite.y = currentBattle.isBoss ? 110 : 130;

      // Inisialisasi Player Sprite Solo
      playerSprites = [{
        username: currentUser.username,
        gender: currentUser.stats.gender,
        charClass: currentUser.stats.charClass,
        level: currentUser.stats.level,
        maxHp: currentUser.stats.maxHp,
        hp: currentUser.stats.hp,
        equippedGear: currentUser.stats.equippedGear,
        attackTimer: 0,
        hurtTimer: 0
      }];

      // Jalankan Rendering Loop Canvas
      drawBattle();

      // Tampilkan Soal Pertama
      loadNextQuestion();
    }, 1000);

  } catch (err) {
    alert(err.message);
    overlay.style.display = 'none';
    overlay.classList.remove('swirl-transition');
    window.audioEngine.playBGM('town');
  }
}

let activeTimerInterval = null;
let currentSecondsLeft = 0;

function loadNextQuestion() {
  if (currentUser.stats.hp <= 0) {
    triggerRescueShield();
    return;
  }

  // Cek Kemenangan Solo (Monster HP <= 0)
  if (monsterSprite.hp <= 0 || currentBattle.currentQuestionIndex >= currentBattle.questions.length) {
    endBattleSolo(true);
    return;
  }

  const question = currentBattle.questions[currentBattle.currentQuestionIndex];
  
  // Set Info Bab di HUD
  document.getElementById('battle-chapter-title').innerText = `${currentBattle.chapterName} (${question.difficulty.toUpperCase()})`;

  // Bersihkan efek visual Blind/Silence
  document.getElementById('choices-container').classList.remove('blind-effect');
  document.getElementById('question-box').style.filter = "none";
  document.getElementById('poison-overlay').style.display = "none";

  // Tangani Efek Status Tekanan Monster
  if (question.typeEffect === 'blind') {
    // Buramkan pilihan jawaban (Blind Effect)
    document.getElementById('choices-container').classList.add('blind-effect');
    alert("Monster menyemburkan kabut kebutaan! Pilihan jawaban menjadi BURAM.");
  } else if (question.typeEffect === 'silence') {
    // Hilangkan teks soal petunjuk (hanya tampilkan angka soal)
    document.getElementById('question-box').style.filter = "blur(2px)";
    alert("Monster membungkam Anda! Soal matematika dikaburkan, fokus!");
  } else if (question.typeEffect === 'poison') {
    // Aktifkan Poison screen overlay
    document.getElementById('poison-overlay').style.display = "block";
    alert("Anda teracuni! HP Anda akan berkurang berkala jika berpikir terlalu lama!");
  }

  // Tampilkan Soal ke HTML
  document.getElementById('question-box').innerText = question.question;
  
  const choicesContainer = document.getElementById('choices-container');
  choicesContainer.innerHTML = '';

  question.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'jrpg-btn choice-btn';
    btn.innerHTML = `<span class="jrpg-cursor">▶</span> ${opt}`;
    btn.onclick = () => submitAnswerSolo(idx);
    choicesContainer.appendChild(btn);
  });

  // Atur Timer
  currentSecondsLeft = question.timeLimit;
  document.getElementById('timer-text').innerText = `${currentSecondsLeft}s`;
  const timerBar = document.getElementById('timer-bar');
  timerBar.style.width = "100%";
  timerBar.style.backgroundColor = "var(--text-yellow)";

  if (activeTimerInterval) clearInterval(activeTimerInterval);
  
  let timeElapsed = 0;
  
  activeTimerInterval = setInterval(() => {
    currentSecondsLeft--;
    timeElapsed++;
    document.getElementById('timer-text').innerText = `${currentSecondsLeft}s`;
    
    const timePercent = (currentSecondsLeft / question.timeLimit) * 100;
    timerBar.style.width = `${timePercent}%`;

    // Warna timer memerah jika kritis
    if (timePercent < 30) {
      timerBar.style.backgroundColor = "var(--text-red)";
    }

    // Penanganan Ticking HP saat teracuni (Poison Effect)
    if (question.typeEffect === 'poison' && timeElapsed % 3 === 0) {
      currentUser.stats.hp = Math.max(1, currentUser.stats.hp - 2); // Kurangi HP perlahan tapi jangan sampai mati di tick poison agar adil
      playerSprites[0].hp = currentUser.stats.hp;
      syncHeaderStats();
      window.audioEngine.playPoisonBuzz();
      
      // Efek getar layar Canvas saat teracuni
      document.getElementById('battle-canvas').classList.add('screen-shake-anim');
      setTimeout(() => {
        document.getElementById('battle-canvas').classList.remove('screen-shake-anim');
      }, 400);
    }

    if (currentSecondsLeft <= 0) {
      clearInterval(activeTimerInterval);
      // Waktu habis = Salah Jawab
      handleAnswerResultSolo(false, 0, question.timeLimit);
    }
  }, 1000);
}

async function submitAnswerSolo(selectedOptionIdx) {
  clearInterval(activeTimerInterval);
  window.audioEngine.playBeep();

  const question = currentBattle.questions[currentBattle.currentQuestionIndex];
  const timeElapsed = question.timeLimit - currentSecondsLeft;

  try {
    const res = await fetch('/api/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser.username,
        questionId: question.id,
        selectedOption: selectedOptionIdx,
        timeElapsed
      })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Update data lokal murid
    currentUser.stats = data.newStats;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    syncHeaderStats();

    // Trigger Animasi & Visual Feedback
    handleAnswerResultSolo(data.correct, data.damageDealt, data.damageTaken, data.message, data.explanation);

  } catch (err) {
    alert(err.message);
    loadNextQuestion();
  }
}

function handleAnswerResultSolo(isCorrect, dmgDealt, dmgTaken, systemMsg, explanation) {
  if (isCorrect) {
    // 1. Animasi Tebasan Karakter Solo
    playerSprites[0].attackTimer = 20; // 20 frames jump
    window.audioEngine.playSlash();

    setTimeout(() => {
      // 2. Animasi Terhentak & Partikel Ledakan pada Monster
      monsterSprite.hurtTimer = 15;
      monsterSprite.hp = Math.max(0, monsterSprite.hp - dmgDealt);
      createPixelBurst(monsterSprite.x + 30, monsterSprite.y + 35, 15, ['#ff3333', '#ffffff', '#ffff00']);
      spawnDamageNumber(monsterSprite.x + 10, monsterSprite.y - 10, dmgDealt);

      // Cek apakah Boss kritis di bawah 20% untuk memicu adrenalin audio
      if (currentBattle.isBoss && monsterSprite.hp > 0 && monsterSprite.hp <= monsterSprite.maxHp * 0.2) {
        window.audioEngine.setFastTempo(true);
      }

      // Tampilkan popup penjelasan jawaban (tutorial dialog) sebelum ke soal berikutnya
      showJRPGDialog("PERTARUNGAN: BENAR!", `${systemMsg}\n\nPenjelasan: ${explanation}`, () => {
        currentBattle.currentQuestionIndex++;
        loadNextQuestion();
      });
    }, 300);

  } else {
    // Salah jawab / waktu habis: Monster menyerang balik
    monsterSprite.attackTimer = 20;
    window.audioEngine.playHurt();

    setTimeout(() => {
      // Karakter berkedip merah & terbentur
      playerSprites[0].hurtTimer = 15;
      playerSprites[0].hp = currentUser.stats.hp; // sinkron dengan server
      
      const targetPlayer = playerSprites[0];
      createPixelBurst(targetPlayer.x + 10, targetPlayer.y + 15, 10, ['#00ff00', '#ff3333']);
      spawnDamageNumber(targetPlayer.x - 10, targetPlayer.y - 10, dmgTaken);

      // Guncang layar pertempuran
      document.getElementById('battle-canvas').classList.add('screen-shake-anim');
      setTimeout(() => {
        document.getElementById('battle-canvas').classList.remove('screen-shake-anim');
      }, 400);

      showJRPGDialog("PERTARUNGAN: SALAH!", `${systemMsg}\n\nKunci Jawaban & Penjelasan:\n${explanation}`, () => {
        // Jika HP siswa kritis/mati, server akan memicu penyelamatan
        if (currentUser.stats.hp <= 0) {
          triggerRescueShield();
        } else {
          currentBattle.currentQuestionIndex++;
          loadNextQuestion();
        }
      });
    }, 300);
  }
}

// Melarikan diri dari pertarungan
function confirmRunAway() {
  window.audioEngine.playBeep();
  if (confirm("Apakah Anda yakin ingin melarikan diri dari pertempuran? Streak bonus Anda akan hangus!")) {
    endBattleSolo(false);
  }
}

function endBattleSolo(isVictory) {
  if (activeTimerInterval) clearInterval(activeTimerInterval);
  cancelAnimationFrame(animationFrameId);
  window.audioEngine.setFastTempo(false); // Reset tempo audio

  const returnToTown = () => {
    // Kembali ke Kota
    document.getElementById('battle-interface').style.display = 'none';
    document.getElementById('town-interface').style.display = 'flex';
    window.audioEngine.playBGM('town');
    
    // Sembuhkan HP penuh agar siswa bisa bermain kembali
    restAtInn();
    updateGuildBoardStatus();
  };

  if (isVictory) {
    window.audioEngine.playVictory();
    
    // Simpan status quest harian jika menyelesaikan quest
    const today = new Date().toISOString().split('T')[0];
    const key = `daily_quest_${currentUser.username}_${today}`;
    if (localStorage.getItem(key) !== 'done') {
      localStorage.setItem(key, 'done');
      currentUser.stats.gold += 50; // Bonus gold misi harian
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      showJRPGDialog("SELAMAT!", `Anda memenangkan pertarungan dan menyelesaikan bab matematika!\n\nAnda mendapatkan bonus +50 Gold karena menyelesaikan Misi Harian!`, returnToTown);
    } else {
      showJRPGDialog("PERTANDINGAN SELESAI!", "Kemenangan! Anda berhasil menaklukkan monster matematika!", returnToTown);
    }
  } else {
    window.audioEngine.playDefeat();
    showJRPGDialog("PERTEMPURAN BERAKHIR!", "Anda gagal mengalahkan monster bab ini.", returnToTown);
  }
}

// ==================== PHOENIX DOWN / RESCUE SHIELD ====================

function triggerRescueShield() {
  if (activeTimerInterval) clearInterval(activeTimerInterval);
  window.audioEngine.playDefeat();
  
  // Tampilkan modal Penyelamatan
  document.getElementById('rescue-overlay').style.display = 'flex';

  // Siapkan Pertanyaan Penyelamat (SD Operasi Dasar yang sangat mudah)
  const rescueQuestions = [
    { id: "rq1", question: "Berapakah hasil dari 7 + 8?", options: ["13", "14", "15", "16"], answer: 2 },
    { id: "rq2", question: "Berapakah hasil dari 12 - 4?", options: ["6", "8", "9", "10"], answer: 1 },
    { id: "rq3", question: "Berapakah hasil dari 5 x 6?", options: ["25", "30", "35", "40"], answer: 1 }
  ];

  const randQ = rescueQuestions[Math.floor(Math.random() * rescueQuestions.length)];

  document.getElementById('rescue-question-box').innerText = randQ.question;
  const choicesContainer = document.getElementById('rescue-choices-container');
  choicesContainer.innerHTML = '';

  randQ.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'jrpg-btn choice-btn';
    btn.innerHTML = `<span class="jrpg-cursor">▶</span> ${opt}`;
    btn.onclick = () => submitRescueAnswer(randQ.id, idx, randQ.answer);
    choicesContainer.appendChild(btn);
  });
}

async function submitRescueAnswer(questionId, selectedIdx, correctIdx) {
  window.audioEngine.playBeep();
  document.getElementById('rescue-overlay').style.display = 'none';

  // Lakukan request ke API penyelamatan
  try {
    const res = await fetch('/api/rescue-answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: currentUser.username,
        questionId: "q1", // Gunakan dummy valid id dari database
        selectedOption: selectedIdx === correctIdx ? 1 : 0 // Kirim 1 untuk benar, 0 untuk salah
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message);

    currentUser.stats = data.newStats;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    syncHeaderStats();

    if (data.success) {
      window.audioEngine.playLevelUp(); // play sound bangkit
      alert(data.message);
      // Lanjutkan Battle
      playerSprites[0].hp = currentUser.stats.hp;
      loadNextQuestion();
    } else {
      alert(data.message);
      endBattleSolo(false);
    }

  } catch (err) {
    alert(err.message);
    endBattleSolo(false);
  }
}

// ==================== MULTIPLAYER TAVERN LOBBY (WEBSOCKET CO-OP) ====================

function openTavernModal() {
  window.audioEngine.playBeep();
  document.getElementById('tavern-modal').style.display = 'flex';
  document.getElementById('tavern-setup-view').style.display = 'block';
  document.getElementById('tavern-room-view').style.display = 'none';
}

function joinCoopRoom() {
  window.audioEngine.playBeep();
  const roomInput = document.getElementById('room-code-input');
  const code = roomInput.value.trim();

  if (code.length < 4) {
    alert("Kode room harus 4 digit angka!");
    return;
  }

  // Inisialisasi Koneksi WebSocket ke Server
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  coopSocket = new WebSocket(`${wsProtocol}//${window.location.host}`);

  coopSocket.onopen = () => {
    console.log("[WS] Terhubung ke lobi Co-Op.");
    // Kirim payload join
    coopSocket.send(JSON.stringify({
      type: 'join',
      username: currentUser.username,
      roomId: code,
      gender: currentUser.stats.gender,
      charClass: currentUser.stats.charClass
    }));
  };

  coopSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'error':
        alert(data.message);
        coopSocket.close();
        break;

      case 'room_update':
        // Update Tampilan Room Lobi
        document.getElementById('tavern-setup-view').style.display = 'none';
        document.getElementById('tavern-room-view').style.display = 'block';
        document.getElementById('active-room-title').innerText = code;
        
        const playersList = document.getElementById('coop-players-list');
        playersList.innerHTML = '';

        data.players.forEach(p => {
          const div = document.createElement('div');
          div.className = 'jrpg-window';
          div.style.padding = '8px';
          div.style.fontSize = '8px';
          div.style.display = 'flex';
          div.style.justifyContent = 'space-between';
          div.innerHTML = `
            <span>🛡️ ${p.username} (LV:${p.level})</span>
            <span style="color: var(--text-yellow);">${p.charClass.toUpperCase()}</span>
          `;
          playersList.appendChild(div);
        });

        // Simpan data pemain untuk rendering Canvas
        playerSprites = data.players.map(p => ({
          username: p.username,
          gender: p.gender,
          charClass: p.charClass,
          level: p.level,
          maxHp: p.maxHp,
          hp: p.maxHp,
          equippedGear: { weapon: "None", hat: "None", armor: "None" }, // Aset standar untuk coop
          attackTimer: 0,
          hurtTimer: 0
        }));
        break;

      case 'chat_msg':
        const chatBox = document.getElementById('coop-chat-box');
        chatBox.innerHTML += `<div><b>${data.username}:</b> ${data.text}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
        break;

      case 'boss_question':
        // Tutup modal lobi Co-Op Tavern dan masuk pertempuran Canvas
        closeModal('tavern-modal');
        setupCoopBattleView(data.bossQuestion, data.bossHp);
        break;

      case 'battle_event':
        // Pemicu kejadian tebasan / terserang multiplayer secara real-time
        handleCoopBattleEvent(data);
        break;

      case 'music_tempo_alert':
        window.audioEngine.setFastTempo(data.fast);
        break;

      case 'victory':
        alert(`KEMENANGAN CO-OP!\n\n${data.message}\n\nMVP: ${data.mvp}\n${data.mvpReward}`);
        exitCoopBattleInterface();
        break;

      case 'defeat':
        alert(`KEKALAHAN TIM!\n\n${data.message}`);
        exitCoopBattleInterface();
        break;
    }
  };

  coopSocket.onclose = () => {
    console.log("[WS] Koneksi room ditutup.");
  };
}

function leaveCoopRoom() {
  window.audioEngine.playBeep();
  if (coopSocket) coopSocket.close();
  document.getElementById('tavern-room-view').style.display = 'none';
  document.getElementById('tavern-setup-view').style.display = 'block';
}

function sendCoopChatMessage() {
  window.audioEngine.playBeep();
  const input = document.getElementById('coop-chat-input');
  const text = input.value.trim();
  if (text.length === 0 || !coopSocket) return;

  coopSocket.send(JSON.stringify({
    type: 'chat',
    roomId: document.getElementById('active-room-title').innerText,
    username: currentUser.username,
    text
  }));
  input.value = '';
}

function handleChatPress(e) {
  if (e.key === 'Enter') {
    sendCoopChatMessage();
  }
}

function startCoopBattle() {
  window.audioEngine.playBeep();
  if (!coopSocket) return;
  coopSocket.send(JSON.stringify({
    type: 'start',
    roomId: document.getElementById('active-room-title').innerText
  }));
}

// Setup Arena Pertempuran Multiplayer
function setupCoopBattleView(bossQuestion, bossHp) {
  window.audioEngine.playBGM('battle');
  
  // Tampilkan Arena battle
  document.getElementById('town-interface').style.display = 'none';
  document.getElementById('battle-interface').style.display = 'flex';
  
  // Sembunyikan tombol melarikan diri untuk mode multiplayer coop
  document.getElementById('runaway-btn').style.display = 'none';

  currentBattle = {
    isBoss: true,
    bossMaxHp: 500,
    bossHp: bossHp,
    isCoop: true,
    currentQuestion: bossQuestion
  };

  monsterSprite.name = "FRACTION EMPEROR (CO-OP BOSS)";
  monsterSprite.maxHp = 500;
  monsterSprite.hp = bossHp;
  monsterSprite.isDead = false;
  monsterSprite.alpha = 1.0;
  monsterSprite.x = 160;
  monsterSprite.y = 100;

  // Mulai Render Canvas Loop
  drawBattle();

  // Load Soal Pertama Multiplayer
  loadNextCoopQuestion();
}

function loadNextCoopQuestion() {
  const question = currentBattle.currentQuestion;
  document.getElementById('battle-chapter-title').innerText = `CO-OP BOSS RAID (${question.typeEffect.toUpperCase()})`;

  // Bersihkan efek visual Blind/Silence
  document.getElementById('choices-container').classList.remove('blind-effect');
  document.getElementById('question-box').style.filter = "none";
  document.getElementById('poison-overlay').style.display = "none";

  if (question.typeEffect === 'blind') {
    document.getElementById('choices-container').classList.add('blind-effect');
  } else if (question.typeEffect === 'silence') {
    document.getElementById('question-box').style.filter = "blur(2px)";
  } else if (question.typeEffect === 'poison') {
    document.getElementById('poison-overlay').style.display = "block";
  }

  // Cek apakah karakter milik user ini sendiri KO
  const myCharacter = playerSprites.find(p => p.username === currentUser.username);
  if (myCharacter && myCharacter.hp <= 0) {
    document.getElementById('question-box').innerText = "Karakter Anda K.O.! Menunggu bantuan tim medis atau kemenangan rekan tim...";
    document.getElementById('choices-container').innerHTML = '';
    return;
  }

  document.getElementById('question-box').innerText = question.question;
  const choicesContainer = document.getElementById('choices-container');
  choicesContainer.innerHTML = '';

  question.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'jrpg-btn choice-btn';
    btn.innerHTML = `<span class="jrpg-cursor">▶</span> ${opt}`;
    btn.onclick = () => submitAnswerCoop(idx);
    choicesContainer.appendChild(btn);
  });

  // Atur Timer Co-Op
  currentSecondsLeft = question.timeLimit;
  document.getElementById('timer-text').innerText = `${currentSecondsLeft}s`;
  const timerBar = document.getElementById('timer-bar');
  timerBar.style.width = "100%";
  timerBar.style.backgroundColor = "var(--text-yellow)";

  if (activeTimerInterval) clearInterval(activeTimerInterval);

  let timeElapsed = 0;
  activeTimerInterval = setInterval(() => {
    currentSecondsLeft--;
    timeElapsed++;
    document.getElementById('timer-text').innerText = `${currentSecondsLeft}s`;
    const timePercent = (currentSecondsLeft / question.timeLimit) * 100;
    timerBar.style.width = `${timePercent}%`;

    // Poison Effect
    if (question.typeEffect === 'poison' && timeElapsed % 3 === 0) {
      myCharacter.hp = Math.max(1, myCharacter.hp - 2);
      currentUser.stats.hp = myCharacter.hp;
      syncHeaderStats();
      window.audioEngine.playPoisonBuzz();
    }

    if (currentSecondsLeft <= 0) {
      clearInterval(activeTimerInterval);
      submitAnswerCoop(-1); // Timeout = wrong answer
    }
  }, 1000);
}

function submitAnswerCoop(selectedOptionIdx) {
  clearInterval(activeTimerInterval);
  if (!coopSocket) return;

  const question = currentBattle.currentQuestion;
  const timeElapsed = question.timeLimit - currentSecondsLeft;

  coopSocket.send(JSON.stringify({
    type: 'answer',
    roomId: document.getElementById('active-room-title').innerText,
    username: currentUser.username,
    questionId: question.id,
    selectedOption: selectedOptionIdx,
    timeElapsed
  }));
}

function handleCoopBattleEvent(data) {
  // Update HP dan Stats murid
  data.players.forEach(p => {
    const localPlayer = playerSprites.find(pl => pl.username === p.username);
    if (localPlayer) {
      // Bandingkan untuk memicu animasi hurt/attack
      if (p.hp < localPlayer.hp) {
        // Pemain terkena damage
        localPlayer.hurtTimer = 15;
        window.audioEngine.playHurt();
        createPixelBurst(localPlayer.x + 10, localPlayer.y + 15, 8, ['#ff3333', '#ffffff']);
        spawnDamageNumber(localPlayer.x - 10, localPlayer.y - 10, localPlayer.hp - p.hp);
      }
      localPlayer.hp = p.hp;
    }
  });

  // Jika HP murid saat ini di-update dari server
  const myStats = data.players.find(p => p.username === currentUser.username);
  if (myStats) {
    currentUser.stats.hp = myStats.hp;
    syncHeaderStats();
  }

  // Bandingkan HP Boss untuk memicu tebasan
  if (data.bossHp < monsterSprite.hp) {
    const dmg = monsterSprite.hp - data.bossHp;
    
    // Cari siapa yang menyerang dari teks event
    playerSprites.forEach(p => {
      if (data.message.includes(p.username)) {
        p.attackTimer = 20; // Picu lompatan menyerang untuk sprite pemain tersebut!
      }
    });

    window.audioEngine.playSlash();
    setTimeout(() => {
      monsterSprite.hurtTimer = 15;
      monsterSprite.hp = data.bossHp;
      createPixelBurst(monsterSprite.x + 35, monsterSprite.y + 35, 12, ['#ffff00', '#ff00ff']);
      spawnDamageNumber(monsterSprite.x + 10, monsterSprite.y - 15, dmg);
    }, 300);
  } else {
    monsterSprite.hp = data.bossHp;
  }

  // Tampilkan log event battle di kotak dialog lobi atas
  document.getElementById('question-box').innerText = data.message;
  updateRightStatusPanel();
}

function exitCoopBattleInterface() {
  if (activeTimerInterval) clearInterval(activeTimerInterval);
  cancelAnimationFrame(animationFrameId);
  window.audioEngine.setFastTempo(false);

  if (coopSocket) {
    coopSocket.close();
    coopSocket = null;
  }

  document.getElementById('battle-interface').style.display = 'none';
  document.getElementById('town-interface').style.display = 'flex';
  document.getElementById('runaway-btn').style.display = 'inline-block';
  
  window.audioEngine.playBGM('town');
  
  // Sinkronisasi data stats terbaru dari server
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: currentUser.username, password: currentUser.password || "murid123" }) // Gunakan default pass testing
  }).then(res => res.json()).then(data => {
    if (data.user) {
      currentUser.stats = data.user.stats;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      syncHeaderStats();
    }
  });

  restAtInn();
}

// ==================== MODALS CONTROL ====================

function openAdventureModal() {
  window.audioEngine.playBeep();
  document.getElementById('adventure-modal').style.display = 'flex';
  
  // Tarik daftar bab matematika dari API
  fetch('/api/chapters')
    .then(res => res.json())
    .then(chapters => {
      const container = document.getElementById('chapters-list-container');
      container.innerHTML = '';

      chapters.forEach(ch => {
        const btn = document.createElement('div');
        btn.className = 'jrpg-window';
        btn.style.padding = '10px';
        btn.style.cursor = 'pointer';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'space-between';
        btn.style.alignItems = 'center';
        
        btn.innerHTML = `
          <div>
            <span style="color: var(--text-yellow); font-size: 8px;">[${ch.level}]</span>
            <span style="font-size: 8px; margin-left: 8px;">${ch.name}</span>
          </div>
          <button class="jrpg-btn" style="padding: 4px 8px; font-size: 6px;">BATTLE</button>
        `;
        btn.onclick = () => startSoloBattle(ch.id, ch.name);
        container.appendChild(btn);
      });
    });
}

function openShopModal() {
  window.audioEngine.playBeep();
  document.getElementById('shop-modal').style.display = 'flex';
  document.getElementById('shop-gold-text').innerText = currentUser.stats.gold;
  document.getElementById('shop-class-text').innerText = currentUser.stats.charClass.toUpperCase();
  
  showShopTab('buy');
}

function showShopTab(tab) {
  window.audioEngine.playBeep();
  
  const buyTab = document.getElementById('shop-buy-tab');
  const invTab = document.getElementById('shop-inventory-tab');
  const buyItemsContainer = document.getElementById('shop-items-container');
  const invItemsContainer = document.getElementById('inventory-items-container');

  if (tab === 'buy') {
    buyTab.style.display = 'block';
    invTab.style.display = 'none';
    
    // Ambil item toko dari API
    fetch('/api/shop/items')
      .then(res => res.json())
      .then(items => {
        buyItemsContainer.innerHTML = '';
        items.forEach(item => {
          const isOwned = currentUser.stats.inventory.includes(item.id);
          const div = document.createElement('div');
          div.className = 'shop-item';
          div.innerHTML = `
            <span class="shop-item-name">${item.name} (${item.type.toUpperCase()})</span>
            <span class="shop-item-price">${item.cost} Gold 💰</span>
            <button class="jrpg-btn" style="padding: 6px; font-size: 6px; justify-content: center;" 
              onclick="buyShopItem('${item.id}')" ${isOwned ? 'disabled' : ''}>
              ${isOwned ? 'DIMILIKI' : 'BELI'}
            </button>
          `;
          buyItemsContainer.appendChild(div);
        });
      });
  } else {
    buyTab.style.display = 'none';
    invTab.style.display = 'block';
    
    // Ambil item inventori dari stats murid
    fetch('/api/shop/items')
      .then(res => res.json())
      .then(items => {
        invItemsContainer.innerHTML = '';
        
        const ownedItems = items.filter(i => currentUser.stats.inventory.includes(i.id));
        
        if (ownedItems.length === 0) {
          invItemsContainer.innerHTML = '<p style="font-size: 8px; color: var(--text-gray); grid-column: span 2;">Inventori Anda kosong. Beli item di Toko!</p>';
          return;
        }

        ownedItems.forEach(item => {
          const isEquipped = currentUser.stats.equippedGear[item.type] === item.name;
          const div = document.createElement('div');
          div.className = 'shop-item';
          div.innerHTML = `
            <span class="shop-item-name">${item.name} (${item.type.toUpperCase()})</span>
            <span style="font-size: 7px; color: var(--text-gray); margin-bottom: 8px;">
              Status: ${isEquipped ? '<b style="color:var(--text-green);">DIPAKAI</b>' : 'Disimpan'}
            </span>
            <button class="jrpg-btn" style="padding: 6px; font-size: 6px; justify-content: center;" 
              onclick="equipShopItem('${item.id}')" ${isEquipped ? 'disabled' : ''}>
              ${isEquipped ? 'AKTIF' : 'GUNAKAN'}
            </button>
          `;
          invItemsContainer.appendChild(div);
        });
      });
  }
}

async function buyShopItem(itemId) {
  window.audioEngine.playBeep();
  try {
    const res = await fetch('/api/shop/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, itemId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentUser.stats = data.newStats;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    syncHeaderStats();

    document.getElementById('shop-gold-text').innerText = currentUser.stats.gold;
    window.audioEngine.playLevelUp(); // play sound koin/sukses
    alert(data.message);
    showShopTab('buy');
  } catch (err) {
    alert(err.message);
  }
}

async function equipShopItem(itemId) {
  window.audioEngine.playBeep();
  try {
    const res = await fetch('/api/shop/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, itemId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentUser.stats = data.newStats;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    syncHeaderStats();

    window.audioEngine.playLevelUp();
    alert(data.message);
    showShopTab('inventory');
  } catch (err) {
    alert(err.message);
  }
}

// GACHA BOX PENYELAMAT EMAS
async function triggerGachaChest() {
  window.audioEngine.playBeep();
  if (currentUser.stats.gold < 30) {
    alert("Gold Anda tidak cukup untuk Gacha Chest (butuh 30 Gold)!");
    return;
  }

  // Tarik item acak dari toko
  try {
    const itemsRes = await fetch('/api/shop/items');
    const items = await itemsRes.json();
    
    // Filter item yang belum dimiliki
    const unowned = items.filter(i => !currentUser.stats.inventory.includes(i.id));
    if (unowned.length === 0) {
      alert("Hebat! Anda sudah mengoleksi semua item perlengkapan di dalam game.");
      return;
    }

    const randomGift = unowned[Math.floor(Math.random() * unowned.length)];

    // Lakukan pembelian paksa via Gold gacha
    const res = await fetch('/api/shop/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUser.username, itemId: randomGift.id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Override pengurangan koin gacha (backend mengurangi harga asli, kita selaraskan sisa koinnya)
    currentUser.stats = data.newStats;
    // Potong 30 gold sebagai gacha fee
    currentUser.stats.gold = Math.max(0, currentUser.stats.gold + randomGift.cost - 30); 
    
    // Perbarui ke server jika diperlukan
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    syncHeaderStats();

    document.getElementById('shop-gold-text').innerText = currentUser.stats.gold;
    window.audioEngine.playVictory();
    alert(`🎉 GACHA BERHASIL! 🎉\n\nAnda membuka Kotak Harta Piksel dan menemukan:\n👉 ${randomGift.name} (${randomGift.type.toUpperCase()})!`);
    showShopTab('buy');

  } catch (err) {
    alert(err.message);
  }
}

// C. Perpustakaan & Video YouTube
function openLibraryModal() {
  window.audioEngine.playBeep();
  document.getElementById('library-modal').style.display = 'flex';
  document.getElementById('library-content-area').style.display = 'none';
}

function loadLibraryLevel(level) {
  window.audioEngine.playBeep();
  
  fetch('/api/chapters')
    .then(res => res.json())
    .then(chapters => {
      const levelChapters = chapters.filter(ch => ch.level === level);
      if (levelChapters.length === 0) {
        alert("Belum ada video penjelasan kurasi guru untuk tingkat ini.");
        return;
      }

      // Pilih bab pertama dari level tersebut untuk diputar
      const selectedCh = levelChapters[0];
      
      document.getElementById('library-content-area').style.display = 'block';
      document.getElementById('library-chapter-name').innerText = `Materi: ${selectedCh.name} (${level})`;
      
      // Integrasikan video youtube terkurasi
      const ytIframe = document.getElementById('youtube-iframe');
      ytIframe.src = `https://www.youtube.com/embed/${selectedCh.youtubeVideoId}?autoplay=0`;
    });
}

function openGuildModal() {
  window.audioEngine.playBeep();
  document.getElementById('guild-modal').style.display = 'flex';
  updateGuildBoardStatus();
}

function closeModal(modalId) {
  window.audioEngine.playBeep();
  document.getElementById(modalId).style.display = 'none';

  // Stop video youtube jika ditutup
  if (modalId === 'library-modal') {
    document.getElementById('youtube-iframe').src = '';
  }
}


// ==================== JRPG HUD HELPER FUNCTIONS (3-PANEL BATTLE) ====================

function selectBattleCommand(cmd) {
  window.audioEngine.playBeep();
  
  // 1. Reset command items styling and cursors
  const commands = ['attack', 'items', 'flee'];
  commands.forEach(c => {
    const el = document.getElementById(`cmd-${c}`);
    if (el) {
      el.classList.remove('active-command');
      const cursor = el.querySelector('.jrpg-finger-cursor');
      if (cursor) cursor.style.visibility = 'hidden';
    }
  });
  
  // 2. Activate selected command
  const activeEl = document.getElementById(`cmd-${cmd}`);
  if (activeEl) {
    activeEl.classList.add('active-command');
    const cursor = activeEl.querySelector('.jrpg-finger-cursor');
    if (cursor) cursor.style.visibility = 'visible';
  }
  
  // 3. Switch middle panels
  const questionArea = document.getElementById('battle-question-area');
  const itemArea = document.getElementById('battle-item-area');
  
  if (cmd === 'attack') {
    if (questionArea) questionArea.style.display = 'block';
    if (itemArea) itemArea.style.display = 'none';
  } else if (cmd === 'items') {
    if (questionArea) questionArea.style.display = 'none';
    if (itemArea) itemArea.style.display = 'block';
  } else if (cmd === 'flee') {
    // Switch back to attack view just in case they cancel
    if (questionArea) questionArea.style.display = 'block';
    if (itemArea) itemArea.style.display = 'none';
    confirmRunAway();
  }
}

function updateRightStatusPanel() {
  const partyList = document.getElementById('battle-party-list');
  if (!partyList) return;
  partyList.innerHTML = '';
  
  if (currentBattle && currentBattle.isCoop) {
    // Co-Op Mode: list all playerSprites
    playerSprites.forEach(p => {
      const row = document.createElement('div');
      row.style.marginBottom = '6px';
      
      const hpPercent = (p.hp / p.maxHp) * 100;
      const hpColor = hpPercent > 40 ? 'var(--text-green)' : 'var(--text-red)';
      
      row.innerHTML = `
        <div class="party-member-row">
          <span class="member-name" style="color: ${p.username === currentUser.username ? 'var(--text-yellow)' : 'var(--text-primary)'};">
            ${p.username} <span style="font-size: 5px; color: var(--text-gray);">[LV:${p.level}]</span>
          </span>
          <span class="member-hp" style="color: ${hpColor};">${p.hp}/${p.maxHp}</span>
        </div>
        <div class="bar-container" style="height: 5px; margin-top: 2px;">
          <div class="hp-bar-fill" style="width: ${hpPercent}%; height: 100%; background-color: ${hpColor};"></div>
        </div>
      `;
      partyList.appendChild(row);
    });
  } else {
    // Solo Mode: render single user
    if (!currentUser) return;
    const row = document.createElement('div');
    row.style.marginBottom = '6px';
    
    const hpPercent = (currentUser.stats.hp / currentUser.stats.maxHp) * 100;
    const hpColor = hpPercent > 40 ? 'var(--text-green)' : 'var(--text-red)';
    
    row.innerHTML = `
      <div class="party-member-row">
        <span class="member-name" style="color: var(--text-yellow);">
          ${currentUser.username} <span style="font-size: 5px; color: var(--text-gray);">[LV:${currentUser.stats.level}]</span>
        </span>
        <span class="member-hp" style="color: ${hpColor};">${currentUser.stats.hp}/${currentUser.stats.maxHp}</span>
      </div>
      <div class="bar-container" style="height: 5px; margin-top: 2px;">
        <div class="hp-bar-fill" style="width: ${hpPercent}%; height: 100%; background-color: ${hpColor};"></div>
      </div>
    `;
    partyList.appendChild(row);
  }
}

// ==================== EASTER EGGS: ANCIENT RUNES DISCOVERY ====================

function discoverSecretRune(runeName, formula, description) {
  // Mainkan suara arpeggio penemuan rahasia retro
  if (window.audioEngine) {
    window.audioEngine.init();
    window.audioEngine.playSecretRune();
  }

  // Cari posisi event klik untuk efek partikel
  let clickX = 400;
  let clickY = 300;
  if (window.event) {
    clickX = window.event.clientX;
    clickY = window.event.clientY;
  }

  // Buat efek partikel pixel di sekitar kursor
  createDOMPixelBurst(clickX, clickY, ['#fbbf24', '#f59e0b', '#ffffff', '#ffffff']);

  const dialog = document.getElementById('rune-dialog');
  const formulaEl = document.getElementById('rune-dialog-formula');
  const nameEl = document.getElementById('rune-dialog-name');
  const descEl = document.getElementById('rune-dialog-desc');

  if (dialog && formulaEl && nameEl && descEl) {
    formulaEl.innerText = formula;
    nameEl.innerText = runeName.toUpperCase();
    descEl.innerText = description;
    dialog.style.display = 'block';

    // Auto-close dialog setelah 8 detik jika tidak ditutup manual
    if (window.runeDialogTimeout) {
      clearTimeout(window.runeDialogTimeout);
    }
    window.runeDialogTimeout = setTimeout(() => {
      dialog.style.display = 'none';
    }, 8000);
  }
}

function closeRuneDialog() {
  if (window.audioEngine) window.audioEngine.playBeep();
  const dialog = document.getElementById('rune-dialog');
  if (dialog) {
    dialog.style.display = 'none';
  }
  if (window.runeDialogTimeout) {
    clearTimeout(window.runeDialogTimeout);
  }
}

function createDOMPixelBurst(x, y, colors) {
  const container = document.querySelector('.town-map-wrapper');
  if (!container) return;
  
  const rect = container.getBoundingClientRect();
  const relX = x - rect.left;
  const relY = y - rect.top;

  for (let i = 0; i < 15; i++) {
    const particle = document.createElement('div');
    particle.style.position = 'absolute';
    particle.style.left = `${relX}px`;
    particle.style.top = `${relY}px`;
    particle.style.width = `${Math.random() * 3 + 2}px`;
    particle.style.height = `${Math.random() * 3 + 2}px`;
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.zIndex = '999';
    particle.style.pointerEvents = 'none';
    particle.style.boxShadow = '0 0 2px rgba(255, 255, 255, 0.4)';
    container.appendChild(particle);

    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 50 + 20; 
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 15; 

    let startTime = null;
    function animate(timestamp) {
      if (!startTime) startTime = timestamp;
      const progress = (timestamp - startTime) / 1000;
      
      if (progress > 0.6) {
        particle.remove();
      } else {
        const posX = relX + vx * progress;
        const posY = relY + vy * progress + 0.5 * 120 * progress * progress; 
        particle.style.left = `${posX}px`;
        particle.style.top = `${posY}px`;
        particle.style.opacity = 1 - (progress / 0.6);
        requestAnimationFrame(animate);
      }
    }
    requestAnimationFrame(animate);
  }
}

