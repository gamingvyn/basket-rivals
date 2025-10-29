// ======================
// Basket Rivals - game.js
// Cartoon characters (limbs, jersey, names) + cartoon hoop
// Full playable script — paste into your repo
// ======================

// Canvas setup (assumes index.html has #game canvas and start/end screens + scoreboard)
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// DOM hooks (assumes index.html elements exist)
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const gameContainer = document.getElementById('game-container');
const endScreen = document.getElementById('end-screen');
const resultText = document.getElementById('result');
const restartBtn = document.getElementById('restart-btn');
const playerScoreEl = document.getElementById('player-score');
const aiScoreEl = document.getElementById('ai-score');
const timerEl = document.getElementById('timer');

let started = false;
let gameEnded = false;
let gameTime = 90;
let lastTs = performance.now();

// ---------- Sounds (online) ----------
const sounds = {
  bounce: new Audio("https://actions.google.com/sounds/v1/sports/basketball_bounce.ogg"),
  swish: new Audio("https://actions.google.com/sounds/v1/sports/basketball_swish.ogg"),
  steal: new Audio("https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg"),
  dunk: new Audio("https://actions.google.com/sounds/v1/human_voices/cheer.ogg"),
  whistle: new Audio("https://actions.google.com/sounds/v1/sports/whistle.ogg"),
  buzzer: new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg")
};
function playSound(s){ try{ s.currentTime = 0; s.play(); } catch(e){} }

// ---------- Helpers ----------
function clamp(a,b,c){ return Math.max(b, Math.min(c, a)); }
function dist(a,b,c,d){ return Math.hypot(a-c, b-d); }
function rand(a,b){ return a + Math.random()*(b-a); }

// ---------- Court / Hoop constants ----------
const GRAV = 0.9;
const FLOOR_Y = H - 70;
const LEFT_HOOP_X = 120;
const RIGHT_HOOP_X = W - 120;
const HOOP_Y = FLOOR_Y - 200;
const RIM_RADIUS = 34;
const THREE_PT_RADIUS = 220;

// ---------- Input ----------
let keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  // allow restart while end screen visible
  if (gameEnded && (e.key.toLowerCase() === 'r' || e.key === 'Enter')) {
    startGame();
  }
});
window.addEventListener('keyup', e => keys[e.key] = false);

// ---------- Character skins (cosmetic only) ----------
const SKINS = [
  { name: 'LeBron', color: '#ffb84d', shorts: '#b85a00' },
  { name: 'Steph', color: '#9be1ff', shorts: '#0077a3' },
  { name: 'Giannis', color: '#b7ff9a', shorts: '#2b8a2b' },
  { name: 'KD', color: '#ffd1f0', shorts: '#a02b7b' },
  { name: 'Kobe', color: '#ffd24d', shorts: '#2b1f00' },
  { name: 'Curry', color: '#ffd4b3', shorts: '#a34f00' },
];

// ---------- Simple animation utility (limb swinging) ----------
function limbSwing(time, speed=8, magnitude=0.6){
  return Math.sin(time * speed) * magnitude;
}

// ---------- Ball ----------
class Ball {
  constructor(x,y){
    this.x=x; this.y=y; this.vx=0; this.vy=0; this.r=10; this.holder=null; this._scored=false; this._lastTouched=null;
  }
  update(dt){
    if(this.holder){
      // follow holder's hand (slightly offset)
      const handOffsetX = this.holder.facingRight ? 18 : -18;
      this.x = this.holder.x + handOffsetX;
      this.y = this.holder.y - 8;
      this.vx = 0; this.vy = 0;
      return;
    }
    this.vy += GRAV * 0.5;
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    this.vx *= 0.998;

    // floor
    if(this.y + this.r > FLOOR_Y){
      this.y = FLOOR_Y - this.r;
      this.vy *= -0.45;
      this.vx *= 0.95;
      playSound(sounds.bounce);
    }
    // walls
    if(this.x - this.r < 0){ this.x = this.r; this.vx *= -0.5; }
    if(this.x + this.r > W){ this.x = W - this.r; this.vx *= -0.5; }
  }
  draw(){
    // simple basketball with line pattern
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.beginPath();
    ctx.fillStyle = '#ff7a18';
    ctx.arc(0,0,this.r,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#b04a06'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-this.r*0.9,0); ctx.quadraticCurveTo(0,0, this.r*0.9, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-this.r*0.9); ctx.quadraticCurveTo(0,0, 0, this.r*0.9); ctx.stroke();
    ctx.restore();
  }
}

// ---------- Cartoon Player (with limbs) ----------
class Player {
  constructor(x, skin){
    this.x = x;
    this.y = FLOOR_Y - 27;
    this.vx = 0; this.vy = 0;
    this.w = 42; this.h = 60;
    this.skin = skin; // {name, color, shorts}
    this.facingRight = x < W/2;
    this.onGround = true;
    this.hasBall = false;

    // ability timers
    this.jumpCooldown = 0;
    this.dodgeCooldown = 0;
    this.fakeTimer = 0;
    this.stealCooldown = 0;
    // animation state
    this.animTime = Math.random()*10;
    this.walkSpeed = 4;
    this.dashing = false;
  }

  feetPos(){ return { x1: this.x - this.w/2 + 6, x2: this.x + this.w/2 - 6 }; }

  update(input, dt){
    this.animTime += dt * (1 + Math.abs(this.vx)*0.2);
    // timers
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.fakeTimer = Math.max(0, this.fakeTimer - dt);
    this.stealCooldown = Math.max(0, this.stealCooldown - dt);

    // movement & dodge: if dashing (temporary speed boost) use vx set by tryDodge
    if(this.dashing){
      // dashing ends by a separate timer handled by external code — but we can gradually damp
      this.vx *= 0.92;
      if(Math.abs(this.vx) < 1.2) this.dashing = false;
    } else {
      let move = 0;
      if(input.left) move -= 1;
      if(input.right) move += 1;
      this.vx += move * 0.9;
      this.vx *= 0.86;
    }

    this.x += this.vx;
    if(this.vx > 0.6) this.facingRight = true;
    if(this.vx < -0.6) this.facingRight = false;

    // gravity
    this.vy += GRAV;
    this.y += this.vy;
    if(this.y + this.h/2 > FLOOR_Y){ this.y = FLOOR_Y - this.h/2; this.vy = 0; this.onGround = true; } else this.onGround = false;

    // clamp
    this.x = clamp(this.x, 18, W-18);
  }

  draw(time){
    // time param used for limb swinging
    ctx.save();
    ctx.translate(this.x, this.y);

    // shadow
    ctx.beginPath();
    ctx.ellipse(0, FLOOR_Y - this.y + (this.h/2) + 8, 28, 8, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
    ctx.restore();

    // Draw body components in world coordinates so we can rotate limbs simply
    const px = this.x, py = this.y;

    // head
    ctx.save();
    ctx.translate(px, py - this.h/2 - 10);
    ctx.beginPath(); ctx.fillStyle = '#ffd9b6'; ctx.arc(0,0,15,0,Math.PI*2); ctx.fill();

    // simple hair/top style
    ctx.beginPath(); ctx.fillStyle = '#2b2b2b'; ctx.arc(-6,-7,5,Math.PI*1.1,Math.PI*0.9); ctx.fill();

    // eyes
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-5,-3,2,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(5,-3,2,0,Math.PI*2); ctx.fill();
    ctx.restore();

    // torso
    ctx.save();
    ctx.translate(px, py - 6);
    // jersey
    ctx.beginPath(); ctx.fillStyle = this.skin.color; ctx.roundRect(-this.w/2, -this.h/2+8, this.w, this.h*0.55, 8); ctx.fill();
    // shorts
    ctx.beginPath(); ctx.fillStyle = this.skin.shorts; ctx.rect(-this.w/2, this.h*0.55 - this.h/2 + 8, this.w, 18); ctx.fill();
    // name text on back if facing left or front if facing right
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(this.skin.name, 0, 4);
    ctx.restore();

    // limbs: compute swing values
    const swing = Math.sin(time * 12 + this.x*0.05) * 0.6; // -0.6..0.6
    const armSwing = Math.sin(time * 14 + this.x*0.03) * 0.9;

    // legs
    // left leg
    drawLimb(px - 8, py + 8, 18, 6, -0.6 * swing);
    // right leg
    drawLimb(px + 8, py + 8, 18, 6, 0.6 * swing);

    // arms (for dribble/shoot animation we change angles)
    let armAngle = this.hasBall ? -0.2 + armSwing * 0.3 : -0.6 + armSwing * 0.5;
    // leading arm (hand that holds the ball)
    const leadX = this.facingRight ? px + 14 : px - 14;
    const trailX = this.facingRight ? px - 14 : px + 14;

    // draw trailing arm
    drawArm(trailX, py - 12, -0.5 * armSwing, this.skin.color);

    // draw leading arm and hand; if hasBall draw ball at hand
    drawArm(leadX, py - 12, armAngle, this.skin.color);

    // if hasBall draw ball by hand
    if(this.hasBall){
      const handX = leadX + Math.cos(armAngle) * 18;
      const handY = py - 12 + Math.sin(armAngle) * 18;
      // ball
      ctx.save();
      ctx.beginPath(); ctx.fillStyle = '#ff7a18'; ctx.arc(handX, handY, 10, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#b04a06'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }

    // small jersey number/label near chest
    ctx.save();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(this.skin.name[0], px, py - 6);
    ctx.restore();
  }
}

// helper: draw limb rectangle rotated around top
function drawLimb(x,y,length,width,angle){
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(angle);
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.roundRect(0,0,length,width,4);
  ctx.fill();
  ctx.restore();
}

// helper: draw arm with rotation
function drawArm(x,y,angle,color){
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(angle);
  // upper arm
  ctx.fillStyle = '#ffd9b6';
  ctx.beginPath(); ctx.roundRect(0,0,14,6,4); ctx.fill();
  // forearm
  ctx.translate(14,0); ctx.rotate(0.2);
  ctx.beginPath(); ctx.roundRect(0,0,14,5,4); ctx.fill();
  // hand
  ctx.beginPath(); ctx.arc(30,5,4,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// add roundRect polyfill
CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){ if(!r) r=6; this.beginPath(); this.moveTo(x+r,y); this.arcTo(x+w,y,x+w,y+h,r); this.arcTo(x+w,y+h,x,y+h,r); this.arcTo(x,y+h,x,y,r); this.arcTo(x,y,x+w,y,r); this.closePath(); };

// ---------- Game objects ----------
let playerSkin = SKINS[Math.floor(Math.random()*SKINS.length)];
let aiSkin = SKINS[Math.floor(Math.random()*SKINS.length)];
// ensure different cosmetic look if possible
if (aiSkin === playerSkin) aiSkin = SKINS[(SKINS.indexOf(playerSkin)+1)%SKINS.length];

let player = new Player(180, playerSkin);
let ai = new Player(W-180, aiSkin);
let ball = new Ball(W/2, FLOOR_Y - 160);
let score = { player: 0, ai: 0 };

// ---------- Mechanics: pickup / shoot / steal / dunk / scoring ----------
function tryPickup(pl){
  if(ball.holder) return false;
  if(dist(pl.x, pl.y-12, ball.x, ball.y) < 36){
    ball.holder = pl; pl.hasBall = true; return true;
  }
  return false;
}

function shootBall(pl){
  if(!pl.hasBall) return false;
  // release ball
  ball.holder = null; pl.hasBall = false;
  // determine if dunk: near hoop, airborne and close
  const targetX = pl === player ? RIGHT_HOOP_X : LEFT_HOOP_X;
  const dToHoop = dist(pl.x, pl.y, targetX, HOOP_Y);
  const nearDunk = (!pl.onGround && Math.abs(pl.y - HOOP_Y) < 140 && dToHoop < 80);
  if(nearDunk){
    // dunk special: small downward arc
    ball.vx = (targetX - pl.x) * 0.08;
    ball.vy = -8 + rand(-2,0);
    ball._dunk = { by: pl, t: 0.5 };
    playSound(sounds.dunk);
    ball._lastTouched = pl;
    return true;
  }
  const aimY = HOOP_Y - rand(10,60);
  const dx = targetX - pl.x;
  const dy = aimY - pl.y;
  const power = clamp(Math.hypot(dx,dy)/10, 7.5, 20);
  const ang = Math.atan2(dy,dx);
  ball.vx = Math.cos(ang) * power;
  ball.vy = Math.sin(ang) * power;
  ball._lastTouched = pl;
  playSound(sounds.swish);
  return true;
}

function trySteal(attacker, defender){
  if(attacker.stealCooldown > 0) return false;
  if(!defender.hasBall) return false;
  const d = Math.hypot(attacker.x - defender.x, attacker.y - defender.y);
  if(d > 56) return false;
  if(defender.dodgeCooldown > 0) { attacker.stealCooldown = 0.6; return false; }
  let chance = defender.fakeTimer > 0 ? 0.75 : 0.45;
  if(attacker.vx !== 0) chance += 0.12;
  attacker.stealCooldown = 0.6;
  if(Math.random() < chance){
    defender.hasBall = false; ball.holder = null;
    const push = (attacker.x < defender.x) ? -1 : 1;
    ball.vx = push * (6 + Math.random()*3);
    ball.vy = -6 - Math.random()*2;
    playSound(sounds.steal);
    return true;
  } else {
    attacker.vx *= -0.5; attacker.vy = -3;
    return false;
  }
}

// scoring detection: ball passes through hoop Y downward inside rim radius
function checkScore(){
  if(ball._scored) return;
  if(ball.y - ball.vy < HOOP_Y && ball.y >= HOOP_Y){
    if(Math.abs(ball.x - RIGHT_HOOP_X) < RIM_RADIUS){
      const shooter = ball._lastTouched || null;
      const pts = classifyShot(shooter, RIGHT_HOOP_X);
      score.player += pts;
      ball._scored = true;
      setTimeout(resetAfterScore, 700);
      playSound(sounds.swish);
    } else if(Math.abs(ball.x - LEFT_HOOP_X) < RIM_RADIUS){
      const shooter = ball._lastTouched || null;
      const pts = classifyShot(shooter, LEFT_HOOP_X);
      score.ai += pts;
      ball._scored = true;
      setTimeout(resetAfterScore, 700);
      playSound(sounds.swish);
    }
  }
}

function classifyShot(shooter, hoopX){
  if(!shooter) return 2;
  if(ball._dunk && ball._dunk.by === shooter) return 2;
  const feet = shooter.feetPos();
  const d1 = Math.hypot(feet.x1 - hoopX, (shooter.y + shooter.h/2) - HOOP_Y);
  const d2 = Math.hypot(feet.x2 - hoopX, (shooter.y + shooter.h/2) - HOOP_Y);
  return (d1 > THREE_PT_RADIUS && d2 > THREE_PT_RADIUS) ? 3 : 2;
}

function resetAfterScore(){
  // keep scores, reset positions & ball
  player.x = 180; player.y = FLOOR_Y - 27; player.vx = player.vy = 0; player.hasBall = false;
  ai.x = W - 180; ai.y = FLOOR_Y - 27; ai.vx = ai.vy = 0; ai.hasBall = false;
  ball.x = W/2; ball.y = FLOOR_Y - 150; ball.vx = 0; ball.vy = 0; ball.holder = null; ball._scored = false; ball._dunk = null; ball._lastTouched = null;
}

// ---------- AI (keeps previous behavior but works with new visuals) ----------
function updateAI(dt){
  // simple: if loose ball, go pick it; if has ball, drive to hoop & random shoot; otherwise defend/steal
  if(!ai.hasBall && !ball.holder){
    if(ball.x < ai.x - 8) ai.vx -= 0.5; else ai.vx += 0.5;
    // clamp speed
    ai.vx = clamp(ai.vx, -4, 4);
    if(dist(ai.x,ai.y,ball.x,ball.y) < 38) tryPickup(ai);
  } else if(ai.hasBall){
    const targetX = LEFT_HOOP_X;
    if(Math.abs(ai.x - targetX) > 60){ ai.vx += (ai.x < targetX) ? 0.25 : -0.25; ai.vx = clamp(ai.vx, -3, 3); }
    // small chance to jump/dunk/shoot
    if(Math.random() < 0.012 && ai.onGround) { ai.vy = -12; }
    if(Math.random() < 0.014) { shootBall(ai); }
  } else {
    // defend: move toward player
    if(player.x < ai.x) ai.vx -= 0.2; else ai.vx += 0.2;
    ai.vx = clamp(ai.vx, -3.5, 3.5);
    if(player.fakeTimer > 0 && Math.abs(player.x - ai.x) < 64 && ai.stealCooldown <= 0) if(Math.random() < 0.6) trySteal(ai, player);
  }
  // friction on ai
  ai.vx *= 0.9;
}

// ---------- Input handling for player actions (jump, dodge double tap, pump fake, shoot/steal) ----------
const tap = { left:{last:0,count:0}, right:{last:0,count:0} };
function checkDoubleTap(dir){
  const t = performance.now();
  const rec = dir==='left' ? tap.left : tap.right;
  if(t - rec.last < 280) rec.count++; else rec.count = 1;
  rec.last = t;
  if(rec.count >= 2){ rec.count = 0; return true; }
  return false;
}
function tryJump(pl){
  if(pl.jumpCooldown > 0) return false;
  if(!pl.onGround) return false;
  pl.vy = -14.5; pl.jumpCooldown = 1.7; return true;
}
function tryDodge(pl, dir){
  if(pl.dodgeCooldown > 0) return false;
  pl.dodgeCooldown = 2.5;
  pl.vx = (dir==='right') ? 9 : -9;
  pl.dashing = true;
  return true;
}

// ---------- HUD and screens ----------
function drawCourt(){
  // sky handled by CSS; draw court floor
  ctx.fillStyle = '#2b733c';
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);

  // center line
  ctx.beginPath(); ctx.moveTo(W/2, FLOOR_Y); ctx.lineTo(W/2, FLOOR_Y - 120); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.stroke();

  // three point arcs (subtle)
  ctx.beginPath(); ctx.arc(LEFT_HOOP_X, HOOP_Y, THREE_PT_RADIUS, Math.PI*0.25, Math.PI*1.75); ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(RIGHT_HOOP_X, HOOP_Y, THREE_PT_RADIUS, -Math.PI*0.25, Math.PI*0.75); ctx.stroke();

  // draw cartoon backboards/hoops (more realistic)
  drawHoop(LEFT_HOOP_X, HOOP_Y);
  drawHoop(RIGHT_HOOP_X, HOOP_Y);
}

function drawHoop(x, y){
  // backboard
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-44, -60, 88, 60); // backboard rectangle
  ctx.strokeStyle = '#c0c0c0'; ctx.lineWidth = 3; ctx.strokeRect(-44, -60, 88, 60);
  // rim support arm
  ctx.fillStyle = '#222'; ctx.fillRect(36, -12, 18, 8);
  // rim
  ctx.beginPath(); ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 5; ctx.arc(0, 0, RIM_RADIUS, 0, Math.PI*2); ctx.stroke();
  // net: simple criss-cross
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1;
  const netTop = 6;
  const netHeight = 26;
  for(let i=-6;i<=6;i+=3){
    ctx.beginPath();
    ctx.moveTo(i * (RIM_RADIUS/10), netTop);
    ctx.quadraticCurveTo(i*0.6, netTop + netHeight*0.5, i*0.5, netTop + netHeight);
    ctx.stroke();
  }
  ctx.restore();
}

// HUD update
function updateHUD(){
  playerScoreEl.textContent = `You: ${score.player}`;
  aiScoreEl.textContent = `AI: ${score.ai}`;
  const t = Math.max(0, Math.floor(gameTime));
  const mm = String(Math.floor(t/60)).padStart(2,'0');
  const ss = String(t%60).padStart(2,'0');
  timerEl.textContent = `${mm}:${ss}`;
}

// end screen
function showEndScreen(){
  started = false;
  gameEnded = true;
  gameContainer.style.display = "none";
  endScreen.style.display = "flex";
  if(score.player > score.ai) resultText.textContent = "🏆 YOU WIN!";
  else if(score.ai > score.player) resultText.textContent = "AI WINS 😢";
  else resultText.textContent = "DRAW!";
}

// ---------- Main loop ----------
function update(dt){
  if(!started || gameEnded) return;

  // Player input
  // double-tap dodge
  if(keys['ArrowLeft'] && !keys._leftHandled){
    if(checkDoubleTap('left')) tryDodge(player, 'left');
    keys._leftHandled = true;
  }
  if(!keys['ArrowLeft']) keys._leftHandled = false;
  if(keys['ArrowRight'] && !keys._rightHandled){
    if(checkDoubleTap('right')) tryDodge(player, 'right');
    keys._rightHandled = true;
  }
  if(!keys['ArrowRight']) keys._rightHandled = false;

  if(keys['ArrowUp'] && !keys._jumpPressed){ tryJump(player); keys._jumpPressed = true; } if(!keys['ArrowUp']) keys._jumpPressed = false;

  if(keys['ArrowDown'] && !keys._fakePressed){ if(player.hasBall) player.fakeTimer = 0.42; keys._fakePressed = true; } if(!keys['ArrowDown']) keys._fakePressed = false;

  if((keys['x']||keys['X']) && !keys._xPressed){
    if(player.hasBall){ shootBall(player); ball._lastTouched = player; }
    else { trySteal(player, ai); }
    keys._xPressed = true;
  }
  if(!keys['x'] && !keys['X']) keys._xPressed = false;

  // update players
  const pInput = { left: keys['ArrowLeft'], right: keys['ArrowRight'] };
  player.update(pInput, dt);
  updateAI(dt);
  // pickups
  if(!ball.holder) { tryPickup(player); tryPickup(ai); }

  // update ball
  ball.update(dt);
  if(ball._dunk){ ball._dunk.t -= dt; if(ball._dunk.t <= 0) ball._dunk = null; }

  // scoring
  checkScore();

  // reactive steals: AI tries to steal during player's fake
  if(player.fakeTimer > 0 && Math.abs(player.x - ai.x) < 60 && ai.stealCooldown <= 0){
    if(Math.random() < 0.55) trySteal(ai, player);
  }

  // timer
  gameTime -= dt;
  if(gameTime <= 0 && !gameEnded){ playSound(sounds.buzzer); showEndScreen(); }

  // update HUD (DOM)
  updateHUD();
}

function render(time){
  ctx.clearRect(0,0,W,H);
  // court
  drawCourt();

  // draw ball under players if near floor for depth
  // draw players & ball with time-based anim
  player.draw(time);
  ai.draw(time * 0.9);
  ball.draw();

  // small HUD text: title
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = '15px system-ui'; ctx.fillText('Basket Rivals — Cartoon 1v1', 14, 24);
}

function loop(ts){
  const dt = Math.min(0.06, (ts - lastTs)/1000);
  lastTs = ts;
  update(dt);
  render(ts/1000);
  requestAnimationFrame(loop);
}

// ---------- Start / Reset ----------
function startGame(){
  // randomize skins each match (cosmetic only)
  playerSkin = SKINS[Math.floor(Math.random()*SKINS.length)];
  aiSkin = SKINS[Math.floor(Math.random()*SKINS.length)];
  if(playerSkin === aiSkin) aiSkin = SKINS[(SKINS.indexOf(playerSkin) + 1) % SKINS.length];

  player = new Player(180, playerSkin);
  ai = new Player(W-180, aiSkin);
  ball = new Ball(W/2, FLOOR_Y-160);
  score = { player: 0, ai: 0 };
  gameTime = 90;
  gameEnded = false;
  started = true;
  startScreen.style.display = 'none';
  gameContainer.style.display = 'block';
  endScreen.style.display = 'none';
  playSound(sounds.whistle);
  updateHUD();
}

// restart from end screen
restartBtn.addEventListener('click', startGame);
startBtn.addEventListener('click', startGame);

// initial UI state
startScreen.style.display = 'flex';
gameContainer.style.display = 'none';
endScreen.style.display = 'none';

// kick the loop
requestAnimationFrame(loop);
