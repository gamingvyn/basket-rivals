// ======================
// Basket Rivals - game.js
// Full-court indoor visuals, 3-2-1 countdown, skill-based jump ball (equal jump height)
// No external image assets — everything drawn on canvas. Ready for GitHub Pages.
// ======================

/* Expected HTML structure (your index.html):
 - canvas#game
 - #start-screen, #start-btn
 - #game-container (with #player-score, #timer, #ai-score and the canvas)
 - #end-screen, #result, #restart-btn
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// DOM references (existing elements from index.html)
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const gameContainer = document.getElementById('game-container');
const endScreen = document.getElementById('end-screen');
const restartBtn = document.getElementById('restart-btn');
const resultText = document.getElementById('result');
const playerScoreEl = document.getElementById('player-score');
const aiScoreEl = document.getElementById('ai-score');
const timerEl = document.getElementById('timer');

let started = false;
let inJumpBall = false;
let gameEnded = false;
let gameTime = 90; // seconds
let lastTs = performance.now();

// ---------- sounds (online, optional) ----------
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
function dist(a,b,c,d){ return Math.hypot(a-c,b-d); }
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
  // allow restart with R or Enter at end
  if(gameEnded && (e.key === 'r' || e.key === 'Enter')) startGame();
});
window.addEventListener('keyup', e => keys[e.key] = false);

// ---------- cosmetic skins ----------
const HAIR_STYLES = [
  { name:'Short', color:'#1c1c1c' },
  { name:'Curly', color:'#2d1b00' },
  { name:'Buzz', color:'#efd07a' },
  { name:'Mohawk', color:'#2b2b8a' },
  { name:'Bald', color:'#a87b54' }
];
const JERSEY_COLORS = ['#ffb84d','#9be1ff','#b7ff9a','#ffd1f0','#ffd24d','#caa2ff','#ff9aa2'];
function pickSkins(){
  function randomSkin(){
    return {
      hair: HAIR_STYLES[Math.floor(Math.random()*HAIR_STYLES.length)],
      jersey: JERSEY_COLORS[Math.floor(Math.random()*JERSEY_COLORS.length)],
      shorts: '#' + Math.floor(Math.random()*0x888888 + 0x222222).toString(16).padStart(6,'0'),
      faceTone: ['#ffd9b6','#f2c8a0','#e6b99f','#f5d7c4'][Math.floor(Math.random()*4)],
      name: ['LeBron','Steph','Giannis','KD','Kobe','Curry','Dame'][Math.floor(Math.random()*7)]
    };
  }
  let a = randomSkin(), b = randomSkin();
  if(a.jersey === b.jersey) b.jersey = JERSEY_COLORS[(JERSEY_COLORS.indexOf(b.jersey)+2) % JERSEY_COLORS.length];
  return { playerSkin: a, aiSkin: b };
}

// ---------- draw helpers ----------
CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){ if(!r) r=6; this.beginPath(); this.moveTo(x+r,y); this.arcTo(x+w,y,x+w,y+h,r); this.arcTo(x+w,y+h,x,y+h,r); this.arcTo(x,y+h,x,y,r); this.arcTo(x,y,x+w,y,r); this.closePath(); };

// draw a basketball at location (used for ball & hand)
function drawBallAt(x,y,r){
  ctx.save();
  ctx.beginPath(); ctx.fillStyle = '#ff7a18'; ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#b04a06'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

// ---------- Player class ----------
class Player {
  constructor(x, skin){
    this.x = x; this.y = FLOOR_Y - 27;
    this.vx = 0; this.vy = 0;
    this.w = 42; this.h = 60;
    this.skin = skin;
    this.facingRight = x < W/2;
    this.onGround = true;
    this.hasBall = false;
    // timers and states
    this.jumpCooldown = 0;
    this.dodgeCooldown = 0;
    this.fakeTimer = 0;
    this.stealCooldown = 0;
    this.dashing = false;
    this.animTime = Math.random()*10;
  }
  feetPos(){ return { x1: this.x - this.w/2 + 6, x2: this.x + this.w/2 - 6 }; }
  update(input, dt){
    this.animTime += dt * (1 + Math.abs(this.vx)*0.2);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.fakeTimer = Math.max(0, this.fakeTimer - dt);
    this.stealCooldown = Math.max(0, this.stealCooldown - dt);

    if(this.dashing){
      this.vx *= 0.94;
      if(Math.abs(this.vx) < 1.5) this.dashing = false;
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

    this.vy += GRAV; this.y += this.vy;
    if(this.y + this.h/2 > FLOOR_Y){ this.y = FLOOR_Y - this.h/2; this.vy = 0; this.onGround = true; } else this.onGround = false;
    this.x = clamp(this.x, 18, W-18);
  }
  draw(t){
    const px=this.x, py=this.y;
    // shadow
    ctx.save();
    ctx.beginPath(); ctx.ellipse(px, FLOOR_Y + 6, 28, 8, 0, 0, Math.PI*2); ctx.fillStyle='rgba(0,0,0,0.12)'; ctx.fill();
    ctx.restore();

    // body
    ctx.save(); ctx.translate(px, py - 6);
    // jersey
    ctx.fillStyle = this.skin.jersey;
    ctx.beginPath(); ctx.roundRect(-this.w/2, -this.h/2 + 8, this.w, this.h*0.55, 8); ctx.fill();
    // shorts
    ctx.fillStyle = this.skin.shorts; ctx.fillRect(-this.w/2, this.h*0.55 - this.h/2 + 8, this.w, 18);
    // chest label
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(this.skin.name[0], 0, 4);
    ctx.restore();

    // head
    ctx.save(); ctx.translate(px, py - this.h/2 - 12);
    ctx.beginPath(); ctx.fillStyle = this.skin.faceTone; ctx.arc(0,0,16,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = this.skin.hair.color;
    // hair styles
    if(this.skin.hair.name === 'Curly'){ for(let i=-8;i<=8;i+=5){ ctx.beginPath(); ctx.arc(i-2,-6,4,0,Math.PI*2); ctx.fill(); } }
    else if(this.skin.hair.name === 'Mohawk'){ ctx.fillRect(-4,-10,8,12); }
    else if(this.skin.hair.name === 'Buzz'){ ctx.beginPath(); ctx.arc(0,-2,16,0,Math.PI*2); ctx.fill(); }
    else if(this.skin.hair.name === 'Short'){ ctx.fillRect(-12,-10,24,8); }
    // eyes
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-5,-2,2,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(5,-2,2,0,Math.PI*2); ctx.fill();
    ctx.restore();

    // limbs
    const t = (performance.now()/1000);
    const walk = Math.sin(t*12 + px*0.01) * 0.6;
    drawLimb(px - 10, py + 6, 18, 7, -0.5 * walk);
    drawLimb(px + 10, py + 6, 18, 7, 0.5 * walk);

    // arms: trailing and leading; if hasBall show ball in hand
    const armAngle = this.hasBall ? (this.facingRight ? -0.4 : 0.4) : (0.2 * Math.sin(t*10));
    drawArm(px + (this.facingRight ? -12 : 12), py - 12, -0.2 * Math.sin(t*9));
    const leadX = px + (this.facingRight ? 14 : -14);
    drawArm(leadX, py - 12, armAngle);
    if(this.hasBall){
      const handX = leadX + Math.cos(armAngle) * 16;
      const handY = py - 12 + Math.sin(armAngle) * 16;
      drawBallAt(handX, handY, 9);
    }

    // name tag
    ctx.save(); ctx.fillStyle = 'white'; ctx.font = '9px system-ui'; ctx.textAlign = 'center'; ctx.fillText(this.skin.name, px, py - this.h/2 + 2); ctx.restore();
  }
}

// arm/limb helpers
function drawLimb(x,y,length,width,angle){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle); ctx.fillStyle='#222'; ctx.beginPath(); ctx.roundRect(0,0,length,width,5); ctx.fill(); ctx.restore();
}
function drawArm(x,y,angle){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  ctx.fillStyle='#ffd9b6'; ctx.beginPath(); ctx.roundRect(0,0,14,6,4); ctx.fill();
  ctx.translate(12,0); ctx.rotate(0.18); ctx.beginPath(); ctx.roundRect(0,0,14,6,4); ctx.fill();
  ctx.beginPath(); ctx.arc(28,6,4,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ---------- Ball ----------
class BallObj {
  constructor(x,y){ this.x=x; this.y=y; this.vx=0; this.vy=0; this.r=10; this.holder=null; this._scored=false; this._dunk=null; this._lastTouched=null; this.tossing=false; }
  update(dt){
    if(this.holder){
      const handX = this.holder.x + (this.holder.facingRight ? 14 : -14);
      this.x = handX; this.y = this.holder.y - 12; this.vx=0; this.vy=0; return;
    }
    // if tossing, we still apply physics but with scaled dt
    this.vy += GRAV * 0.5;
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    this.vx *= 0.998;
    if(this.y + this.r > FLOOR_Y){ this.y = FLOOR_Y - this.r; this.vy *= -0.45; this.vx *= 0.95; playSound(sounds.bounce); }
    if(this.x - this.r < 0){ this.x = this.r; this.vx *= -0.5; }
    if(this.x + this.r > W){ this.x = W - this.r; this.vx *= -0.5; }
  }
  draw(){ drawBallAt(this.x, this.y, this.r); }
}

// ---------- instantiate skins & objects ----------
let skins = pickSkins();
let player = new Player(180, skins.playerSkin);
let ai = new Player(W - 180, skins.aiSkin);
let ball = new BallObj(W/2, FLOOR_Y - 150);
let score = { player: 0, ai: 0 };

// ---------- core gameplay actions ----------
function tryPickup(pl){
  if(ball.holder) return false;
  if(dist(pl.x, pl.y-12, ball.x, ball.y) < 38){
    ball.holder = pl; pl.hasBall = true; ball._lastTouched = pl; return true;
  }
  return false;
}

function shootBall(pl){
  if(!pl.hasBall) return false;
  ball.holder = null; pl.hasBall = false;
  const targetX = pl === player ? RIGHT_HOOP_X : LEFT_HOOP_X;
  const dToHoop = dist(pl.x, pl.y, targetX, HOOP_Y);
  const nearDunk = (!pl.onGround && Math.abs(pl.y - HOOP_Y) < 140 && dToHoop < 80);
  if(nearDunk){
    ball.vx = (targetX - pl.x) * 0.08; ball.vy = -8 + rand(-2,0); ball._dunk = { by: pl, t: 0.5 }; ball._lastTouched = pl; playSound(sounds.dunk); return true;
  }
  const aimY = HOOP_Y - rand(10,60);
  const dx = targetX - pl.x, dy = aimY - pl.y;
  const power = clamp(Math.hypot(dx,dy)/10, 7.5, 20);
  const ang = Math.atan2(dy,dx);
  ball.vx = Math.cos(ang)*power; ball.vy = Math.sin(ang)*power; ball._lastTouched = pl; playSound(sounds.swish); return true;
}

function trySteal(attacker, defender){
  if(attacker.stealCooldown > 0) return false;
  if(!defender.hasBall) return false;
  const d = Math.hypot(attacker.x - defender.x, attacker.y - defender.y);
  if(d > 56) return false; // close-range only
  if(defender.dodgeCooldown > 0){ attacker.stealCooldown = 0.6; return false; }
  let baseChance = defender.fakeTimer > 0 ? 0.75 : 0.45;
  if(attacker.vx !== 0) baseChance += 0.12;
  attacker.stealCooldown = 0.6;
  if(Math.random() < baseChance){
    defender.hasBall = false; ball.holder = null;
    const push = (attacker.x < defender.x) ? -1 : 1;
    ball.vx = push * (6 + Math.random()*3); ball.vy = -6 - Math.random()*2; playSound(sounds.steal); return true;
  } else {
    attacker.vx *= -0.5; attacker.vy = -3; return false;
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
  player.x = 180; player.y = FLOOR_Y - 27; player.vx = player.vy = 0; player.hasBall = false;
  ai.x = W - 180; ai.y = FLOOR_Y - 27; ai.vx = ai.vy = 0; ai.hasBall = false;
  ball = new BallObj(W/2, FLOOR_Y - 150); ball._scored = false; ball._dunk = null; ball._lastTouched = null;
}

// scoring detection
function checkScore(){
  if(ball._scored) return;
  // ball passes downward through hoop Y
  if(ball.y - ball.vy < HOOP_Y && ball.y >= HOOP_Y){
    if(Math.abs(ball.x - RIGHT_HOOP_X) < RIM_RADIUS){
      const shooter = ball._lastTouched || null;
      const pts = classifyShot(shooter, RIGHT_HOOP_X);
      score.player += pts; ball._scored = true; setTimeout(resetAfterScore,700); playSound(sounds.swish);
    } else if(Math.abs(ball.x - LEFT_HOOP_X) < RIM_RADIUS){
      const shooter = ball._lastTouched || null;
      const pts = classifyShot(shooter, LEFT_HOOP_X);
      score.ai += pts; ball._scored = true; setTimeout(resetAfterScore,700); playSound(sounds.swish);
    }
  }
}

// ---------- AI logic (including jumpball behavior) ----------
let aiJumpAttemptTime = 0; // used during jump ball
function updateAI(dt){
  if(inJumpBall){
    // AI tries to jump at a reaction time after toss start
    // aiJumpAttemptTime is set at toss time to performance.now() + reaction
    const now = performance.now();
    if(!ai.onGround) return; // already jumping
    if(now >= aiJumpAttemptTime){
      // AI jumps
      ai.vy = -14.5; ai.onGround = false;
    }
    return;
  }

  // Normal match AI: pick/drive/defend
  if(!ai.hasBall && !ball.holder){
    // chase loose ball
    if(ball.x < ai.x - 8) ai.vx -= 0.2; else ai.vx += 0.2;
    ai.vx = clamp(ai.vx, -3.5, 3.5);
    if(dist(ai.x,ai.y,ball.x,ball.y) < 36) tryPickup(ai);
  } else if(ai.hasBall){
    const targetX = LEFT_HOOP_X;
    if(Math.abs(ai.x - targetX) > 70) ai.vx += (ai.x < targetX ? 0.25 : -0.25);
    ai.vx = clamp(ai.vx, -3.5, 3.5);
    if(Math.random() < 0.012 && ai.onGround) ai.vy = -12;
    if(Math.random() < 0.014) shootBall(ai);
  } else {
    // defend and attempt steal on pump fake
    if(player.hasBall && Math.abs(player.x - ai.x) < 64 && ai.stealCooldown <= 0 && Math.random() < 0.25) trySteal(ai, player);
    ai.vx *= 0.92;
  }
}

// ---------- jump ball sequence helpers ----------
function doCountdownThenJumpBall(){
  // Show 3-2-1 numbers (1 second intervals), then toss the ball
  showCountdown(3, () => {
    showCountdown(2, () => {
      showCountdown(1, () => {
        startJumpBall();
      });
    });
  });
}

function showCountdown(num, cb){
  // draw the big number overlay for ~700ms then call cb
  countdownNumber = num;
  countdownUntil = performance.now() + 700;
  countdownCallback = cb;
  // play a light whistle or tick
  try{ sounds.whistle.currentTime = 0; sounds.whistle.play(); } catch(e){}
}

let countdownNumber = 0;
let countdownUntil = 0;
let countdownCallback = null;

// jump ball core: toss ball up, allow both to jump with equal height, first touch wins possession
let tossStartTime = 0;
let tossActive = false;
function startJumpBall(){
  // position both players at center, facing each other
  player.x = W/2 - 80; player.y = FLOOR_Y - 27; player.vx = player.vy = 0; player.hasBall = false;
  ai.x = W/2 + 80; ai.y = FLOOR_Y - 27; ai.vx = ai.vy = 0; ai.hasBall = false;
  player.facingRight = true; ai.facingRight = false;

  // set ball to center and toss upward
  ball = new BallObj(W/2, FLOOR_Y - 140);
  ball.tossing = true;
  // initial upward velocity
  ball.vy = -12.5;
  ball.vx = 0;
  inJumpBall = true;
  tossActive = true;
  tossStartTime = performance.now();

  // set AI reaction time (simulate reaction skill): small variance but deterministic each toss
  const aiReactionDelay = rand(220,480); // ms after toss to start jump attempt
  aiJumpAttemptTime = performance.now() + aiReactionDelay;
}

function resolveJumpBallTouch(){
  // Called whenever collision occurs during jump ball phase: whichever touches ball first gains possession
  // We check which player is closer to the ball when collision happens and give possession accordingly
  if(!inJumpBall) return;
  // determine who overlaps ball first: measure vertical and horizontal proximity when collision occurs
  const pDist = Math.hypot(player.x - ball.x, (player.y - 12) - ball.y);
  const aDist = Math.hypot(ai.x - ball.x, (ai.y - 12) - ball.y);
  // smaller distance grabs ball
  if(pDist <= aDist){
    // player wins
    ball.holder = player; player.hasBall = true; ball.tossing = false; inJumpBall = false; tossActive = false;
    ball._lastTouched = player;
    // start main timer now
    started = true;
    gameTime = 90;
    playSound(sounds.whistle);
  } else {
    // ai wins
    ball.holder = ai; ai.hasBall = true; ball.tossing = false; inJumpBall = false; tossActive = false;
    ball._lastTouched = ai;
    started = true; gameTime = 90; playSound(sounds.whistle);
  }
}

// ---------- draw court + hoop (polished) ----------
function drawCourt(){
  // crowd background
  ctx.fillStyle = '#1a2340'; ctx.fillRect(0,0,W,FLOOR_Y-80);
  // stylized crowd (soft circles)
  for(let y=40;y<FLOOR_Y-80;y+=34){
    for(let x=40;x<W-40;x+=58){
      const alpha = 0.06 + (Math.sin((x+y)/40)+1)*0.02;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath(); ctx.ellipse(x, y, 12, 14, 0, 0, Math.PI*2); ctx.fill();
    }
  }
  // court floor wood
  const g = ctx.createLinearGradient(0, FLOOR_Y-260, 0, FLOOR_Y+40);
  g.addColorStop(0,'#e4b77b'); g.addColorStop(1,'#b77a46');
  ctx.fillStyle = g; ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  // court lines
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.rect(40, FLOOR_Y-260, W-80, 240); ctx.stroke();
  ctx.beginPath(); ctx.arc(W/2, FLOOR_Y-140, 36, 0, Math.PI*2); ctx.stroke();
  // subtle center cross
  ctx.beginPath(); ctx.moveTo(W/2 - 30, FLOOR_Y-140); ctx.lineTo(W/2 + 30, FLOOR_Y-140); ctx.stroke();
  // 3-pt arcs
  ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.arc(LEFT_HOOP_X, HOOP_Y, THREE_PT_RADIUS, Math.PI*0.25, Math.PI*1.75); ctx.stroke();
  ctx.beginPath(); ctx.arc(RIGHT_HOOP_X, HOOP_Y, THREE_PT_RADIUS, -Math.PI*0.25, Math.PI*0.75); ctx.stroke();
  // draw hoops
  drawHoop(LEFT_HOOP_X, HOOP_Y);
  drawHoop(RIGHT_HOOP_X, HOOP_Y);
}

function drawHoop(x,y){
  ctx.save(); ctx.translate(x,y);
  // backboard
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#c4c4c4'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(-44, -60, 88, 60, 6); ctx.fill(); ctx.stroke();
  // arm
  ctx.fillStyle = '#333'; ctx.fillRect(36, -12, 18, 8);
  // rim
  ctx.beginPath(); ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 6; ctx.arc(0, 0, RIM_RADIUS, 0, Math.PI*2); ctx.stroke();
  // net
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1;
  const top = 6; const netH = 26;
  for(let i=-6;i<=6;i+=3){
    ctx.beginPath(); ctx.moveTo(i*(RIM_RADIUS/10), top); ctx.quadraticCurveTo(i*0.6, top+netH*0.6, i*0.5, top + netH); ctx.stroke();
  }
  ctx.restore();
}

// ---------- HUD (DOM updates) ----------
function updateHUD(){
  playerScoreEl.textContent = `You: ${score.player}`;
  aiScoreEl.textContent = `AI: ${score.ai}`;
  const t = Math.max(0, Math.floor(gameTime));
  const mm = String(Math.floor(t/60)).padStart(2,'0');
  const ss = String(t%60).padStart(2,'0');
  timerEl.textContent = `${mm}:${ss}`;
}

// ---------- main update loop ----------
const tap = { left:{last:0,count:0}, right:{last:0,count:0} };
function checkDoubleTap(dir){
  const t = performance.now(); const rec = dir==='left'?tap.left:tap.right;
  if(t - rec.last < 280) rec.count++; else rec.count = 1;
  rec.last = t;
  if(rec.count >= 2){ rec.count = 0; return true; } return false;
}
function tryDodge(pl, dir){
  if(pl.dodgeCooldown > 0) return false;
  pl.dodgeCooldown = 2.5; pl.vx = (dir==='right'?9:-9); pl.dashing = true; return true;
}
function tryJumpNormal(pl){
  if(pl.jumpCooldown > 0) return false;
  if(!pl.onGround) return false;
  pl.vy = -14; pl.jumpCooldown = 1.7; return true;
}

function update(dt){
  // countdown overlay handling
  if(countdownUntil && performance.now() < countdownUntil){
    // still showing countdown number; don't progress other input (but allow visual)
  } else if(countdownUntil && performance.now() >= countdownUntil){
    // call callback
    const cb = countdownCallback; countdownCallback = null; countdownUntil = 0; countdownNumber = 0;
    if(cb) cb();
  }

  // main logic
  if(inJumpBall){
    // allow player to jump for jump ball (only input: ArrowUp)
    if((keys['ArrowUp'] || keys[' ']) && !keys._jumpPressed){ // space as alternative
      // player's jump attempt
      if(player.onGround){ player.vy = -14.5; player.onGround = false; }
      keys._jumpPressed = true;
    }
    if(!keys['ArrowUp'] && !keys[' ']) keys._jumpPressed = false;

    // update AI jump attempt handled in updateAI (aiJumpAttemptTime)
    updateAI(dt);

    // update physics for players (so they move while jumping)
    player.update({left:false,right:false}, dt);
    ai.update({left:false,right:false}, dt);

    // update ball physics (toss)
    ball.update(dt);

    // check if a player has touched the ball (first touch wins)
    // touch detection: simple overlap of ball with player's head/hand area
    function touchedBy(pl){
      const handX = pl.x + (pl.facingRight ? 14 : -14);
      const handY = pl.y - 12;
      return dist(handX, handY, ball.x, ball.y) < 16;
    }
    if(touchedBy(player) || touchedBy(ai)){
      resolveJumpBallTouch();
    }

    // if ball falls to ground and no one touched it, allow pickup (loose ball)
    if(ball.y + ball.r >= FLOOR_Y && !ball.holder && tossActive){
      tossActive = false; inJumpBall = false; ball.tossing = false;
      // make it loose; AI or player can pick
    }

    return; // while jump ball active, do not progress normal match state
  }

  // normal gameplay only when started and not ended
  if(!started || gameEnded) return;

  // input handling
  // double tap dodge
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

  // jump (normal)
  if(keys['ArrowUp'] && !keys._jumpPressed){ tryJumpNormal(player); keys._jumpPressed = true; }
  if(!keys['ArrowUp']) keys._jumpPressed = false;

  // pump fake (down) only when player has ball
  if(keys['ArrowDown'] && !keys._fakePressed){ if(player.hasBall) player.fakeTimer = 0.42; keys._fakePressed = true; }
  if(!keys['ArrowDown']) keys._fakePressed = false;

  // shoot/steal (x)
  if((keys['x'] || keys['X']) && !keys._xPressed){
    if(player.hasBall){ shootBall(player); ball._lastTouched = player; }
    else trySteal(player, ai);
    keys._xPressed = true;
  }
  if(!keys['x'] && !keys['X']) keys._xPressed = false;

  // update players with movement input
  const pInput = { left: keys['ArrowLeft'], right: keys['ArrowRight'] };
  player.update(pInput, dt);

  // AI update for normal gameplay
  updateAI(dt);

  // pickups (only if close)
  if(!ball.holder){
    tryPickup(player);
    tryPickup(ai);
  }

  // ball physics and scoring
  ball.update(dt);
  if(ball._dunk){ ball._dunk.t -= dt; if(ball._dunk.t <= 0) ball._dunk = null; }
  checkScore();

  // reactive steals after fake
  if(player.fakeTimer > 0 && Math.abs(player.x - ai.x) < 60 && ai.stealCooldown <= 0){
    if(Math.random() < 0.55) trySteal(ai, player);
  }

  // timer
  gameTime -= dt;
  if(gameTime <= 0 && !gameEnded){ playSound(sounds.buzzer); showEndScreen(); }

  // update HUD
  updateHUD();
}

// ---------- rendering ----------
let countdownNumber = 0;
let countdownUntil = 0;
let countdownCallback = null;
function render(ts){
  ctx.clearRect(0,0,W,H);
  drawCourt();

  // determine drawing order for depth (players and ball)
  const drawables = [player, ai];
  // sort by y (or x) if needed; we draw players then ball last so ball appears over players
  drawables.forEach(p => p.draw(ts/1000));
  ball.draw();

  // top-left title
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font='15px system-ui'; ctx.fillText('Basket Rivals — Full Court', 14, 24);

  // countdown overlay numbers (big)
  if(countdownNumber && performance.now() < countdownUntil){
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#ffcc00'; ctx.font = '120px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(countdownNumber), W/2, H/2);
    ctx.restore();
  }
}

// ---------- loop ----------
let lastFrameTime = performance.now();
function loop(ts){
  const dt = Math.min(0.05, (ts - lastTs)/1000);
  lastTs = ts;
  update(dt);
  render(ts);
  requestAnimationFrame(loop);
}

// ---------- HUD + end screen ----------
function updateHUD(){
  playerScoreEl.textContent = `You: ${score.player}`;
  aiScoreEl.textContent = `AI: ${score.ai}`;
  const t = Math.max(0, Math.floor(gameTime));
  const mm = String(Math.floor(t/60)).padStart(2,'0');
  const ss = String(t%60).padStart(2,'0');
  timerEl.textContent = `${mm}:${ss}`;
}
function showEndScreen(){
  started = false; gameEnded = true; gameContainer.style.display = 'none'; endScreen.style.display = 'flex';
  if(score.player > score.ai) resultText.textContent = "🏆 YOU WIN!"; else if(score.ai > score.player) resultText.textContent = "AI WINS 😢"; else resultText.textContent = "DRAW!";
}

// ---------- Countdown helper (calls cb when finished) ----------
function showCountdown(num, cb){
  countdownNumber = num;
  countdownUntil = performance.now() + 700;
  countdownCallback = cb;
  try{ sounds.whistle.currentTime = 0; sounds.whistle.play(); } catch(e){}
}

// ---------- start / restart flow ----------
function beginStartSequence(){
  // hide start UI, show court UI
  startScreen.style.display = 'none'; gameContainer.style.display = 'block'; endScreen.style.display = 'none';
  // ensure players centered for intro
  player.x = W/2 - 80; ai.x = W/2 + 80; player.facingRight = true; ai.facingRight = false;
  // countdown then toss
  doCountdownThenJumpBall();
}

function startGame(){
  // randomize skins but ensure difference
  const s = pickSkins();
  player.skin = s.playerSkin; ai.skin = s.aiSkin;
  // reset positions and states
  player.x = W/2 - 80; ai.x = W/2 + 80;
  player.y = ai.y = FLOOR_Y - 27;
  player.vx = player.vy = ai.vx = ai.vy = 0;
  player.hasBall = ai.hasBall = false;
  ball = new BallObj(W/2, FLOOR_Y - 150);
  score = { player: 0, ai: 0 };
  gameTime = 90; gameEnded = false; started = false; inJumpBall = false;
  // set UI
  beginStartSequence();
  playSound(sounds.whistle);
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// start initial UI
startScreen.style.display = 'flex';
gameContainer.style.display = 'none';
endScreen.style.display = 'none';

// begin loop
requestAnimationFrame(loop);
