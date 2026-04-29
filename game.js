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

// Local state
const keys = {};
let selectedRobotId = null;
let mySocketId = null;
let mySlot = null;
let currentRoomCode = null;
let gameState = null;
let particles = [];
let hasConfirmedRobot = false;

const robotTypes = [
  {
    id: "tank",
    name: "TANK-X",
    role: "Těžký robot",
    description: "Vydrží hodně zásahů, je pomalejší a dává silnější damage.",
    maxHp: 160,
    speed: 185,
    jumpForce: 390,
    cooldown: 0.45,
    bulletSpeed: 480,
    bulletDamage: 18,
    bulletCount: 1,
    spread: 0,
    bodyColor: "#7cff4d"
  },
  {
    id: "scout",
    name: "SCOUT-Z",
    role: "Lehký robot",
    description: "Je rychlý, skáče vysoko, ale má méně životů.",
    maxHp: 85,
    speed: 300,
    jumpForce: 520,
    cooldown: 0.22,
    bulletSpeed: 560,
    bulletDamage: 10,
    bulletCount: 1,
    spread: 0,
    bodyColor: "#00f6ff"
  },
  {
    id: "sniper",
    name: "SNIPER-V",
    role: "Dálkový robot",
    description: "Má rychlé projektily a velký zásah, ale střílí pomaleji.",
    maxHp: 95,
    speed: 235,
    jumpForce: 430,
    cooldown: 0.7,
    bulletSpeed: 880,
    bulletDamage: 28,
    bulletCount: 1,
    spread: 0,
    bodyColor: "#b47cff"
  },
  {
    id: "blaster",
    name: "BLASTER-Q",
    role: "Rozptylový robot",
    description: "Střílí tři projektily najednou a je nebezpečný na blízko.",
    maxHp: 110,
    speed: 245,
    jumpForce: 440,
    cooldown: 0.52,
    bulletSpeed: 520,
    bulletDamage: 9,
    bulletCount: 3,
    spread: 0.18,
    bodyColor: "#ff5bd2"
  }
];

// ============== Screens ==============

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

// ============== Robot cards ==============

function createRobotCards() {
  player1Options.innerHTML = "";

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

// ============== Network ==============

function sendInput() {
  socket.emit("input", {
    left: !!keys["a"],
    right: !!keys["d"],
    jump: !!keys["w"],
    shoot: !!keys["q"]
  });
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
  overlay.classList.add("hidden");
  centerStatus.textContent = "Čeká se na druhého hráče (rematch)...";
}

// ============== HUD ==============

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
    centerStatus.textContent = "A/D = pohyb, W = skok, Q = střelba";
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

// ============== Particles + drawing ==============

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
  drawParticles();
  drawBullets();
  const p1 = gameState.players.find((p) => p.slot === 1);
  const p2 = gameState.players.find((p) => p.slot === 2);
  if (p1) drawRobot(p1);
  if (p2) drawRobot(p2);
}

function showWinner(data) {
  winnerText.textContent = data.winnerSlot ? `Vyhrál Hráč ${data.winnerSlot}!` : "Konec zápasu";
  winnerSubtext.textContent = data.message || "Zápas skončil.";
  overlay.classList.remove("hidden");
}

// ============== Socket events ==============

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

socket.on("roomJoined", ({ code, slot }) => {
  currentRoomCode = code;
  mySlot = slot;
  hasConfirmedRobot = false;
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
  const oldBullets = gameState ? gameState.bullets.length : 0;
  const newBullets = state.bullets.length;

  if (newBullets < oldBullets && state.bullets[0]) {
    spawnHitParticles(state.bullets[0].x, state.bullets[0].y, state.bullets[0].color);
  }

  gameState = state;
  updateHudFromState();
  updateOpponentStatus();

  if (state.phase === "playing" || (hasConfirmedRobot && state.phase !== "gameover")) {
    showGameScreen();
  }

  if (state.phase === "gameover" && state.winner) {
    showWinner(state.winner);
  }

  // If we got booted (e.g. server restarted, lost the room), drop back to lobby.
  if (state.code && currentRoomCode && state.code !== currentRoomCode) {
    // Should not happen — we only receive state for our own room.
  }
});

socket.on("serverMessage", (text) => {
  centerStatus.textContent = text;
  opponentStatusText.textContent = text;
});

// ============== Wire up UI ==============

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
  // Don't capture WASD/Q while typing the room code.
  if (document.activeElement === roomCodeInput) return;
  const key = e.key.toLowerCase();
  keys[key] = true;
  sendInput();
});

window.addEventListener("keyup", (e) => {
  if (document.activeElement === roomCodeInput) return;
  keys[e.key.toLowerCase()] = false;
  sendInput();
});

createRobotCards();
showLobby();

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  updateParticles(dt);
  drawScene();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
