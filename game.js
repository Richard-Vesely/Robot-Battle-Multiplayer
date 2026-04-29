// =========================
// ZMĚŇ TOHLE PO DEPLOYI
// =========================
const SERVER_URL = "https://robot-battle-multiplayer-server-production-97ca.up.railway.app";

const socket = io(SERVER_URL, {
  transports: ["websocket", "polling"]
});

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Screens
const lobbyScreen = document.getElementById("lobbyScreen");
const menuScreen = document.getElementById("menuScreen");
const gameUI = document.getElementById("gameUI");
const overlay = document.getElementById("overlay");

// Lobby
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomCodeInput = document.getElementById("roomCodeInput");
const lobbyError = document.getElementById("lobbyError");
const connectionText = document.getElementById("connectionText");

// Robot menu
const player1Options = document.getElementById("player1Options");
const player1Info = document.getElementById("player1Info");
const startBtn = document.getElementById("startBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const opponentStatusText = document.getElementById("opponentStatusText");
const menuRoomCode = document.getElementById("menuRoomCode");
const menuSlotLabel = document.getElementById("menuSlotLabel");

// Game UI
const centerStatus = document.getElementById("centerStatus");
const gameRoomCode = document.getElementById("gameRoomCode");
const hpFill1 = document.getElementById("hpFill1");
const hpFill2 = document.getElementById("hpFill2");
const hpText1 = document.getElementById("hpText1");
const hpText2 = document.getElementById("hpText2");
const hudP1Robot = document.getElementById("hudP1Robot");
const hudP2Robot = document.getElementById("hudP2Robot");
const leftHudName = document.getElementById("leftHudName");
const rightHudName = document.getElementById("rightHudName");

// Overlay
const winnerText = document.getElementById("winnerText");
const winnerSubtext = document.getElementById("winnerSubtext");

// Buttons
const restartBtn = document.getElementById("restartBtn");
const backToMenuBtn = document.getElementById("backToMenuBtn");
const playAgainBtn = document.getElementById("playAgainBtn");
const menuBtn = document.getElementById("menuBtn");

// ================= Local state =================

const keys = {};
let robotTypes = [];               // populated from server "config" event
let selectedRobotId = null;
let mySocketId = null;
let mySlot = null;
let currentRoomCode = null;
let gameState = null;              // latest state from server
let prevPhase = null;
let particles = [];
let screenFlashAlpha = 0;
let hasConfirmedRobot = false;

// Smoothed opponent position. Server is authoritative, but we lerp the
// rendered position toward the latest server position to absorb jitter.
let renderedOpponent = null;
const OPPONENT_SMOOTH_TAU_S = 0.05; // 50ms time constant

// Track previous HPs so we can spawn impact particles when damage lands.
const prevPlayerHp = {};

// Track last input we actually emitted; only re-emit on change.
let lastInputSent = null;

// ================= Screens =================

function showLobby() {
  lobbyScreen.classList.remove("hidden");
  menuScreen.classList.add("hidden");
  gameUI.classList.add("hidden");
  overlay.classList.add("hidden");
  lobbyError.textContent = "";
  roomCodeInput.value = "";
}

function showRobotMenu() {
  lobbyScreen.classList.add("hidden");
  menuScreen.classList.remove("hidden");
  gameUI.classList.add("hidden");
  overlay.classList.add("hidden");
}

function showGameScreen() {
  lobbyScreen.classList.add("hidden");
  menuScreen.classList.add("hidden");
  gameUI.classList.remove("hidden");
}

function resetRobotSelection() {
  selectedRobotId = null;
  startBtn.disabled = true;
  document.querySelectorAll("#player1Options .robot-card").forEach((c) => c.classList.remove("selected-green"));
  player1Info.innerHTML = `
    <h3>Tvůj robot</h3>
    <p>Ještě není vybráno</p>
  `;
}

// ================= Robot cards =================

function createRobotCards() {
  player1Options.innerHTML = "";
  if (!robotTypes.length) return;

  robotTypes.forEach((robot) => {
    const card = document.createElement("div");
    card.className = "robot-card";
    card.dataset.robotId = robot.id;

    card.innerHTML = `
      <div class="robot-name">${robot.name}</div>
      <div class="robot-type">${robot.role}</div>
      <div class="robot-desc">${robot.description}</div>
      <div class="stats-mini">
        HP: ${robot.maxHp}<br>
        Rychlost: ${robot.speed}<br>
        Skok: ${robot.jumpForce}<br>
        Damage: ${robot.bulletDamage}
      </div>
    `;

    card.addEventListener("click", () => {
      selectedRobotId = robot.id;
      document.querySelectorAll("#player1Options .robot-card").forEach((c) => {
        c.classList.remove("selected-green");
        if (c.dataset.robotId === robot.id) c.classList.add("selected-green");
      });

      player1Info.innerHTML = `
        <h3>Tvůj robot</h3>
        <p><strong>${robot.name}</strong> — ${robot.role}</p>
        <p>${robot.description}</p>
        <p>HP: ${robot.maxHp} | Rychlost: ${robot.speed} | Skok: ${robot.jumpForce} | Damage: ${robot.bulletDamage}</p>
      `;
      startBtn.disabled = false;
    });

    player1Options.appendChild(card);
  });
}

// ================= Network =================

function readInput() {
  return {
    left: !!(keys["a"] || keys["arrowleft"]),
    right: !!(keys["d"] || keys["arrowright"]),
    jump: !!(keys["w"] || keys["arrowup"]),
    shoot: !!(keys["q"] || keys[" "])
  };
}

function sendInput(force) {
  const cur = readInput();
  if (
    !force &&
    lastInputSent &&
    cur.left === lastInputSent.left &&
    cur.right === lastInputSent.right &&
    cur.jump === lastInputSent.jump &&
    cur.shoot === lastInputSent.shoot
  ) return;
  lastInputSent = cur;
  socket.emit("input", cur);
}

function clearAllKeys() {
  let any = false;
  for (const k of Object.keys(keys)) {
    if (keys[k]) { keys[k] = false; any = true; }
  }
  if (any) sendInput();
}

function emitCreateRoom() {
  lobbyError.textContent = "";
  socket.emit("createRoom");
}

function emitJoinRoom() {
  const raw = (roomCodeInput.value || "").trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(raw)) {
    lobbyError.textContent = "Zadej čtyřpísmenný kód.";
    return;
  }
  lobbyError.textContent = "";
  socket.emit("joinRoom", { code: raw });
}

function emitLeaveRoom() {
  socket.emit("leaveRoom");
  currentRoomCode = null;
  mySlot = null;
  hasConfirmedRobot = false;
  gameState = null;
  renderedOpponent = null;
  prevPhase = null;
  Object.keys(prevPlayerHp).forEach((k) => delete prevPlayerHp[k]);
  resetRobotSelection();
  showLobby();
}

function confirmRobot() {
  if (!selectedRobotId) return;
  socket.emit("selectRobot", { robotId: selectedRobotId });
  hasConfirmedRobot = true;
  showGameScreen();
  centerStatus.textContent = "Robot potvrzen. Čekám na druhého hráče...";
}

function requestRestart() {
  socket.emit("requestRestart");
  centerStatus.textContent = "Čeká se na druhého hráče (rematch)...";
}

// ================= HUD =================

function updateHudFromState() {
  if (!gameState) return;

  const p1 = gameState.players.find((p) => p.slot === 1);
  const p2 = gameState.players.find((p) => p.slot === 2);

  leftHudName.textContent = p1 && p1.id === mySocketId ? "Hráč 1 (ty)" : "Hráč 1";
  rightHudName.textContent = p2 && p2.id === mySocketId ? "Hráč 2 (ty)" : "Hráč 2";

  if (p1) {
    hpFill1.style.width = `${Math.max(0, (p1.hp / p1.maxHp) * 100)}%`;
    hpText1.textContent = `${Math.max(0, Math.round(p1.hp))} / ${p1.maxHp}`;
    hudP1Robot.textContent = p1.selectedRobotId ? `${p1.name} • ${p1.role}` : "Vybírá robota...";
  } else {
    hpFill1.style.width = "0%";
    hpText1.textContent = "Čeká se...";
    hudP1Robot.textContent = "-";
  }

  if (p2) {
    hpFill2.style.width = `${Math.max(0, (p2.hp / p2.maxHp) * 100)}%`;
    hpText2.textContent = `${Math.max(0, Math.round(p2.hp))} / ${p2.maxHp}`;
    hudP2Robot.textContent = p2.selectedRobotId ? `${p2.name} • ${p2.role}` : "Vybírá robota...";
  } else {
    hpFill2.style.width = "0%";
    hpText2.textContent = "Čeká se...";
    hudP2Robot.textContent = "-";
  }

  if (gameState.phase === "waiting") {
    centerStatus.textContent = "Čekám na druhého hráče...";
  } else if (gameState.phase === "selecting") {
    centerStatus.textContent = "Čekám, až oba potvrdí robota...";
  } else if (gameState.phase === "playing") {
    centerStatus.textContent = "Pohyb: A/D nebo šipky • Skok: W nebo ↑ • Střelba: Q nebo mezera";
  } else if (gameState.phase === "gameover") {
    centerStatus.textContent = "Zápas skončil";
  }
}

function updateOpponentStatus() {
  if (!gameState) return;
  const opp = gameState.players.find((p) => p.id !== mySocketId);
  if (!opp) {
    opponentStatusText.textContent = "Čekám na druhého hráče...";
    return;
  }
  if (opp.ready && opp.selectedRobotId) {
    opponentStatusText.textContent = "Druhý hráč je připravený. Vyber svého robota.";
  } else {
    opponentStatusText.textContent = "Druhý hráč ještě vybírá.";
  }
}

function updateOverlayButtons() {
  if (!gameState) return;
  const both = gameState.players.length >= 2;
  playAgainBtn.style.display = both ? "" : "none";
}

// ================= Particles + screen flash =================

function spawnHitParticles(x, y, color) {
  for (let i = 0; i < 8; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 240,
      vy: (Math.random() - 0.5) * 240,
      life: 0.35 + Math.random() * 0.25,
      size: 2 + Math.random() * 3,
      color
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function updateScreenFlash(dt) {
  if (screenFlashAlpha > 0) screenFlashAlpha = Math.max(0, screenFlashAlpha - dt * 2.0);
}

// ================= Opponent position smoothing =================

function updateRenderedOpponent(dt) {
  if (!gameState) { renderedOpponent = null; return; }
  const opp = gameState.players.find((p) => p.id !== mySocketId);
  if (!opp) { renderedOpponent = null; return; }

  if (!renderedOpponent || renderedOpponent.id !== opp.id) {
    renderedOpponent = { ...opp };
    return;
  }

  // Frame-rate-independent low-pass filter toward the server position.
  const alpha = 1 - Math.exp(-dt / OPPONENT_SMOOTH_TAU_S);
  renderedOpponent.x += (opp.x - renderedOpponent.x) * alpha;
  renderedOpponent.y += (opp.y - renderedOpponent.y) * alpha;

  // Discrete fields: take latest immediately.
  renderedOpponent.dir = opp.dir;
  renderedOpponent.hp = opp.hp;
  renderedOpponent.maxHp = opp.maxHp;
  renderedOpponent.spawnInvuln = opp.spawnInvuln;
  renderedOpponent.bodyColor = opp.bodyColor;
  renderedOpponent.typeId = opp.typeId;
  renderedOpponent.name = opp.name;
  renderedOpponent.role = opp.role;
  renderedOpponent.width = opp.width;
  renderedOpponent.height = opp.height;
  renderedOpponent.slot = opp.slot;
}

// ================= Drawing =================

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#071126");
  gradient.addColorStop(1, "#030612");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 22; i++) {
    const x = (i * 73) % canvas.width;
    const y = (i * 41) % canvas.height;
    ctx.fillStyle = i % 2 === 0 ? "#00f6ff" : "#ff2bd6";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(0,246,255,0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlatforms() {
  if (!gameState) return;
  for (const p of gameState.platforms) {
    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = p.y > 560 ? "#00f6ff" : "#ff2bd6";
    ctx.fillStyle = p.y > 560 ? "#102641" : "#1a1f49";
    ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.fillStyle = p.y > 560 ? "#00f6ff" : "#ff2bd6";
    ctx.fillRect(p.x, p.y, p.width, 4);
    ctx.restore();
  }
}

function drawBullets() {
  if (!gameState) return;
  for (const b of gameState.bullets) {
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = b.color;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.shadowBlur = 12;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.restore();
  }
}

function drawScreenFlash() {
  if (screenFlashAlpha > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(255, 32, 80, ${screenFlashAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

function drawRobot(player) {
  if (!player) return;
  const x = player.x;
  const y = player.y;
  const dir = player.dir;
  const typeId = player.typeId;
  const bodyColor = player.bodyColor;

  ctx.save();
  ctx.translate(x, y);
  ctx.shadowBlur = 22;
  ctx.shadowColor = bodyColor;

  // Spawn invuln: blink at ~10Hz.
  if (player.spawnInvuln && player.spawnInvuln > 0) {
    const blink = Math.floor(performance.now() / 50) % 2 === 0;
    ctx.globalAlpha = blink ? 0.45 : 1.0;
  }

  if (typeId === "tank") {
    ctx.fillStyle = bodyColor;
    ctx.fillRect(4, 16, 36, 28);
    ctx.fillStyle = "#dffbff";
    ctx.fillRect(10, 4, 24, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(14, 8, 4, 4);
    ctx.fillRect(26, 8, 4, 4);
    ctx.fillStyle = "#9befff";
    if (dir === 1) ctx.fillRect(40, 24, 16, 8);
    else ctx.fillRect(-16, 24, 16, 8);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(6, 46, 8, 4);
    ctx.fillRect(18, 46, 8, 4);
    ctx.fillRect(30, 46, 8, 4);
  } else if (typeId === "scout") {
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(22, 6);
    ctx.lineTo(38, 18);
    ctx.lineTo(33, 44);
    ctx.lineTo(11, 44);
    ctx.lineTo(6, 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#dffbff";
    ctx.beginPath();
    ctx.arc(22, 20, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(18, 18, 3, 3);
    ctx.fillRect(23, 18, 3, 3);
    ctx.fillStyle = "#9befff";
    if (dir === 1) ctx.fillRect(36, 23, 12, 5);
    else ctx.fillRect(-4, 23, 12, 5);
    ctx.fillRect(12, 44, 5, 9);
    ctx.fillRect(27, 44, 5, 9);
  } else if (typeId === "sniper") {
    ctx.fillStyle = bodyColor;
    ctx.fillRect(10, 12, 24, 34);
    ctx.fillStyle = "#dffbff";
    ctx.fillRect(12, 2, 20, 12);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(16, 6, 4, 4);
    ctx.fillRect(24, 6, 4, 4);
    ctx.fillStyle = "#9befff";
    if (dir === 1) ctx.fillRect(34, 20, 22, 4);
    else ctx.fillRect(-22, 20, 22, 4);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(8, 46, 6, 8);
    ctx.fillRect(30, 46, 6, 8);
  } else if (typeId === "blaster") {
    ctx.fillStyle = bodyColor;
    ctx.fillRect(10, 12, 24, 32);
    ctx.fillRect(8, 14, 28, 28);
    ctx.fillStyle = "#dffbff";
    ctx.fillRect(10, 4, 24, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(14, 8, 4, 4);
    ctx.fillRect(26, 8, 4, 4);
    ctx.fillStyle = "#9befff";
    if (dir === 1) {
      ctx.fillRect(36, 18, 10, 4);
      ctx.fillRect(36, 25, 14, 5);
      ctx.fillRect(36, 33, 10, 4);
    } else {
      ctx.fillRect(-10, 18, 10, 4);
      ctx.fillRect(-14, 25, 14, 5);
      ctx.fillRect(-10, 33, 10, 4);
    }
    ctx.fillRect(11, 46, 7, 8);
    ctx.fillRect(26, 46, 7, 8);
  }

  if (player.id === mySocketId) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(-4, -4, player.width + 8, player.height + 8);
  }

  ctx.restore();
}

function drawScene() {
  drawBackground();
  drawGrid();
  if (!gameState) return;
  drawPlatforms();
  drawBullets();

  const me = gameState.players.find((p) => p.id === mySocketId);
  const opp = renderedOpponent;
  const players = [];
  if (me) players.push(me);
  if (opp) players.push(opp);
  players.sort((a, b) => a.slot - b.slot);
  for (const p of players) drawRobot(p);

  drawParticles();
  drawScreenFlash();
}

function showWinner(data) {
  winnerText.textContent = data.winnerSlot
    ? (data.winnerSlot === mySlot ? "Vyhrál jsi!" : `Vyhrál Hráč ${data.winnerSlot}`)
    : "Konec zápasu";
  winnerSubtext.textContent = data.message || "Zápas skončil.";
  overlay.classList.remove("hidden");
}

// ================= Hit feedback (HP delta detection) =================

function detectHpChanges(state) {
  for (const p of state.players) {
    const prev = prevPlayerHp[p.id];
    if (prev !== undefined && p.hp < prev) {
      const isMine = p.id === mySocketId;
      const color = isMine ? "#ff4d6d" : (p.bodyColor || "#ff2bd6");
      spawnHitParticles(p.x + p.width / 2, p.y + p.height / 2, color);
      if (isMine) screenFlashAlpha = 0.35;
    }
    prevPlayerHp[p.id] = p.hp;
  }
  // Drop entries for players no longer present.
  const liveIds = new Set(state.players.map((p) => p.id));
  for (const id of Object.keys(prevPlayerHp)) {
    if (!liveIds.has(id)) delete prevPlayerHp[id];
  }
}

// ================= Socket events =================

socket.on("connect", () => {
  mySocketId = socket.id;
  connectionText.textContent = "Připojeno k serveru.";
  createRoomBtn.disabled = false;
  joinRoomBtn.disabled = false;
});

socket.on("disconnect", () => {
  connectionText.textContent = "Odpojeno od serveru.";
  centerStatus.textContent = "Spojení se serverem spadlo.";
  createRoomBtn.disabled = true;
  joinRoomBtn.disabled = true;
});

socket.on("config", (cfg) => {
  if (cfg && Array.isArray(cfg.robotTypes)) {
    robotTypes = cfg.robotTypes;
    createRobotCards();
  }
});

socket.on("roomJoined", ({ code, slot }) => {
  currentRoomCode = code;
  mySlot = slot;
  hasConfirmedRobot = false;
  prevPhase = null;
  renderedOpponent = null;
  Object.keys(prevPlayerHp).forEach((k) => delete prevPlayerHp[k]);
  resetRobotSelection();

  menuRoomCode.textContent = code;
  menuSlotLabel.textContent = String(slot);
  gameRoomCode.textContent = code;

  showRobotMenu();
});

socket.on("roomError", ({ message }) => {
  lobbyError.textContent = message || "Něco se pokazilo.";
});

socket.on("state", (state) => {
  // Detect HP drops for impact feedback BEFORE swapping gameState.
  detectHpChanges(state);

  // On phase transition to playing, reset interpolation and force-send the
  // current input state (player might already be holding keys).
  if (state.phase === "playing" && prevPhase !== "playing") {
    renderedOpponent = null;
    sendInput(true);
  }

  gameState = state;
  prevPhase = state.phase;
  updateHudFromState();
  updateOpponentStatus();
  updateOverlayButtons();

  if (state.phase === "playing" || (hasConfirmedRobot && state.phase !== "gameover")) {
    showGameScreen();
  }

  if (state.phase === "playing") {
    overlay.classList.add("hidden");
  }

  if (state.phase === "gameover" && state.winner) {
    showWinner(state.winner);
  }
});

socket.on("serverMessage", (text) => {
  centerStatus.textContent = text;
  opponentStatusText.textContent = text;
});

// ================= UI wiring =================

createRoomBtn.addEventListener("click", emitCreateRoom);
joinRoomBtn.addEventListener("click", emitJoinRoom);
roomCodeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
  lobbyError.textContent = "";
});
roomCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") emitJoinRoom();
});

startBtn.addEventListener("click", confirmRobot);
leaveRoomBtn.addEventListener("click", emitLeaveRoom);
restartBtn.addEventListener("click", requestRestart);
playAgainBtn.addEventListener("click", requestRestart);
backToMenuBtn.addEventListener("click", emitLeaveRoom);
menuBtn.addEventListener("click", emitLeaveRoom);

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
    e.preventDefault();
  }
  if (document.activeElement === roomCodeInput) return;
  const key = e.key.toLowerCase();
  if (keys[key]) return; // ignore key-repeat
  keys[key] = true;
  sendInput();
});

window.addEventListener("keyup", (e) => {
  if (document.activeElement === roomCodeInput) return;
  keys[e.key.toLowerCase()] = false;
  sendInput();
});

// Stop "stuck key" bugs when the window loses focus mid-press.
window.addEventListener("blur", clearAllKeys);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearAllKeys();
});

showLobby();

// ================= Render loop =================

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  updateParticles(dt);
  updateScreenFlash(dt);
  updateRenderedOpponent(dt);
  drawScene();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
