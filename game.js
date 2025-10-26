// ======================
// Basket Rivals - game.js (Final version)
// ======================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const GRAV = 0.9;
const FLOOR_Y = H - 70;
const RIM_RADIUS = 36;
const LEFT_HOOP_X = 120;
const RIGHT_HOOP_X = W - 120;
const HOOP_Y = FLOOR_Y - 200;
const THREE_PT_RADIUS = 220;

let keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true; });
window.addEventListener('keyup', e => { keys[e.key] = false; });

let gameTime = 90; // seconds
let lastTs = performance.now();
let gameEnded = false;

// ---------- Sounds ----------
const sounds = {
  bounce: new Audio("https://actions.google.com/sounds/v1/sports/basketball_bounce.ogg"),
  swish: new Audio("https://actions.google.com/sounds/v1/sports/basketball_swish.ogg"),
  steal: new Audio("https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg"),
  dunk: new Audio("https://actions.google.com/sounds/v1/human_voices/cheer.ogg"),
  whistle: new Audio("https://actions.google.com/sounds/v1/sports/whistle.ogg"),
  buzzer: new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg")
};

// utility to safely play sounds (in Chrome user interaction rules)
function playSound(snd) {
  try { snd.currentTime = 0; snd.play(); } catch (e) { }
}

// ---------- Helpers ----------
function clamp(a, b, c) { return Math.max(b, Math.min(c, a)); }
function dist(a, b, c, d) { return Math.hypot(a - c, b - d); }
function rand(a, b) { return a + Math.random() * (b - a); }

// ---------- Ball ----------
class Ball {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.r = 10;
    this.holder = null;
    this._scored = false;
    this._lastTouchedBy = null;
  }
  update() {
    if (this.holder) {
      this.x = this.holder.x + (this.holder.facingRight ? 26 : -26);
      this.y = this.holder.y - 8;
      return;
    }
    this.vy += GRAV * 0.5;
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.998;
    if (this.y + this.r > FLOOR_Y) {
      this.y = FLOOR_Y - this.r;
      this.vy *= -0.45;
      this.vx *= 0.95;
      playSound(sounds.bounce);
    }
    if (this.x - this.r < 0) { this.x = this.r; this.vx *= -0.5; }
    if (this.x + this.r > W) { this.x = W - this.r; this.vx *= -0.5; }
  }
  draw() {
    ctx.beginPath();
    ctx.fillStyle = '#ff8c2a';
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b05505';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// ---------- Player ----------
class Player {
  constructor(x, color) {
    this.x = x; this.y = FLOOR_Y - 27;
    this.vx = 0; this.vy = 0;
    this.w = 40; this.h = 56;
    this.color = color;
    this.facingRight = true;
    this.onGround = true;
    this.hasBall = false;
    this.fakeTimer = 0;
    this.dodgeCooldown = 0;
    this.jumpCooldown = 0;
    this.stealCooldown = 0;
  }
  update(input) {
    this.fakeTimer = Math.max(0, this.fakeTimer - 0.016);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - 0.016);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - 0.016);
    this.stealCooldown = Math.max(0, this.stealCooldown - 0.016);

    let move = 0;
    if (input.left) move -= 1;
    if (input.right) move += 1;
    this.vx += move * 0.9;
    this.vx *= 0.85;
    this.x += this.vx;

    this.vy += GRAV;
    this.y += this.vy;
    if (this.y + this.h / 2 > FLOOR_Y) {
      this.y = FLOOR_Y - this.h / 2;
      this.vy = 0;
      this.onGround = true;
    } else this.onGround = false;

    this.x = clamp(this.x, 20, W - 20);
    if (this.vx > 0.6) this.facingRight = true;
    if (this.vx < -0.6) this.facingRight = false;
  }
  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    ctx.beginPath();
    ctx.arc(0, -this.h / 2 - 15, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe0b3';
    ctx.fill();
    if (this.hasBall) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Arial';
      ctx.fillText('●', 0, -5);
    }
    ctx.restore();
  }
}

// ---------- Game setup ----------
let player = new Player(180, '#ffb84d');
let ai = new Player(W - 180, '#65d6ff');
let ball = new Ball(W / 2, FLOOR_Y - 160);
let score = { player: 0, ai: 0 };

// ---------- Core mechanics ----------
function tryJump(pl) {
  if (pl.jumpCooldown <= 0 && pl.onGround) {
    pl.vy = -14;
    pl.jumpCooldown = 1.7;
    playSound(sounds.bounce);
  }
}

function shootBall(pl) {
  if (!pl.hasBall) return;
  ball.holder = null;
  pl.hasBall = false;
  playSound(sounds.swish);
  const hoopX = pl === player ? RIGHT_HOOP_X : LEFT_HOOP_X;
  const aimY = HOOP_Y - rand(10, 60);
  const dx = hoopX - pl.x;
  const dy = aimY - pl.y;
  const power = Math.min(20, Math.hypot(dx, dy) / 10);
  const ang = Math.atan2(dy, dx);
  ball.vx = Math.cos(ang) * power;
  ball.vy = Math.sin(ang) * power;
  ball._lastTouchedBy = pl;
}

function tryPickup(pl) {
  if (!ball.holder && dist(pl.x, pl.y, ball.x, ball.y) < 40) {
    pl.hasBall = true;
    ball.holder = pl;
  }
}

function trySteal(attacker, defender) {
  if (attacker.stealCooldown > 0) return;
  if (!defender.hasBall) return;
  if (dist(attacker.x, attacker.y, defender.x, defender.y) < 50) {
    playSound(sounds.steal);
    defender.hasBall = false;
    ball.holder = null;
    ball.vx = (defender.x - attacker.x) * 0.2;
    ball.vy = -6;
  }
  attacker.stealCooldown = 1.0;
}

function checkScore() {
  if (ball._scored) return;
  if (ball.y >= HOOP_Y && Math.abs(ball.x - RIGHT_HOOP_X) < RIM_RADIUS) {
    playSound(sounds.swish);
    score.player += 2;
    ball._scored = true;
    setTimeout(resetRound, 1000);
  } else if (ball.y >= HOOP_Y && Math.abs(ball.x - LEFT_HOOP_X) < RIM_RADIUS) {
    playSound(sounds.swish);
    score.ai += 2;
    ball._scored = true;
    setTimeout(resetRound, 1000);
  }
}

function resetRound() {
  player.x = 180; ai.x = W - 180;
  player.y = ai.y = FLOOR_Y - 27;
  player.hasBall = false; ai.hasBall = false;
  ball.x = W / 2; ball.y = FLOOR_Y - 150;
  ball.vx = ball.vy = 0; ball.holder = null;
  ball._scored = false;
}

// ---------- AI logic ----------
function updateAI() {
  if (!ai.hasBall && !ball.holder) {
    if (ball.x < ai.x) ai.x -= 3;
    else ai.x += 3;
    tryPickup(ai);
  } else if (ai.hasBall) {
    if (ai.x > LEFT_HOOP_X + 80) ai.x -= 2;
    if (Math.random() < 0.01) shootBall(ai);
  } else {
    if (player.hasBall && Math.abs(player.x - ai.x) < 60) trySteal(ai, player);
  }
}

// ---------- Drawing ----------
function drawCourt() {
  ctx.fillStyle = '#2b733c';
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  ctx.fillStyle = '#fff';
  ctx.fillRect(LEFT_HOOP_X - 4, HOOP_Y - 60, 8, 120);
  ctx.fillRect(RIGHT_HOOP_X - 4, HOOP_Y - 60, 8, 120);
  ctx.beginPath();
  ctx.arc(LEFT_HOOP_X, HOOP_Y, RIM_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffcc00';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(RIGHT_HOOP_X, HOOP_Y, RIM_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '18px Arial';
  const t = Math.floor(gameTime);
  const m = String(Math.floor(t / 60));
  const s = String(t % 60).padStart(2, '0');
  ctx.fillText(`Time: ${m}:${s}`, W / 2 - 40, 30);
  ctx.fillText(`You: ${score.player}`, 50, 30);
  ctx.fillText(`AI: ${score.ai}`, W - 120, 30);
}

function drawEndScreen() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  let msg = score.player > score.ai ? '🏆 YOU WIN!' : score.ai > score.player ? 'AI WINS 😢' : 'DRAW!';
  ctx.fillText(msg, W / 2, H / 2 - 40);
  ctx.font = '28px Arial';
  ctx.fillText(`Final Score — You: ${score.player} | AI: ${score.ai}`, W / 2, H / 2 + 10);
  ctx.font = '20px Arial';
  ctx.fillText('Press R to Restart', W / 2, H / 2 + 60);
}

window.addEventListener('keydown', e => {
  if (gameEnded && e.key.toLowerCase() === 'r') {
    score = { player: 0, ai: 0 };
    gameTime = 90;
    gameEnded = false;
    resetRound();
    playSound(sounds.whistle);
  }
});

// ---------- Main loop ----------
function update(dt) {
  if (gameEnded) return;

  const input = { left: keys['ArrowLeft'], right: keys['ArrowRight'] };
  if (keys['ArrowUp']) tryJump(player);
  if (keys['ArrowDown'] && player.hasBall) player.fakeTimer = 0.4;
  if (keys['x'] || keys['X']) {
    if (player.hasBall) shootBall(player);
    else trySteal(player, ai);
  }

  player.update(input);
  updateAI();
  tryPickup(player);
  ball.update();
  checkScore();

  gameTime -= dt;
  if (gameTime <= 0 && !gameEnded) {
    gameEnded = true;
    playSound(sounds.buzzer);
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawCourt();
  ball.draw();
  player.draw();
  ai.draw();
  drawHUD();
  if (gameEnded) drawEndScreen();
}

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

resetRound();
requestAnimationFrame(loop);
