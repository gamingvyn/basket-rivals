// ======================
// Basket Rivals - game.js (full-court, programmatic cartoon players & hoop)
// Paste this into your repo (replace existing game.js)
// Works with your existing index.html and style.css (start/end screens + HUD present)
// ======================

/* Expected HTML elements (from your index.html):
 - canvas#game
 - #start-screen, #start-btn
 - #game-container (contains scoreboard + canvas)
 - #end-screen, #result, #restart-btn
 - #player-score, #ai-score, #timer
*/

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// DOM
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
let gameEnded = false;
let gameTime = 90;
let lastTs = performance.now();

// Sounds (online, same used previously)
const sounds = {
  bounce: new Audio("https://actions.google.com/sounds/v1/sports/basketball_bounce.ogg"),
  swish: new Audio("https://actions.google.com/sounds/v1/sports/basketball_swish.ogg"),
  steal: new Audio("https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg"),
  dunk: new Audio("https://actions.google.com/sounds/v1/human_voices/cheer.ogg"),
  whistle: new Audio("https://actions.google.com/sounds/v1/sports/whistle.ogg"),
  buzzer: new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg")
};
function playSound(s){ try{ s.currentTime = 0; s.play(); } catch(e){} }

// Utilities
function clamp(a,b,c){ return Math.max(b, Math.min(c, a)); }
function dist(a,b,c,d){ return Math.hypot(a-c, b-d); }
function rand(a,b){ return a + Math.random()*(b-a); }

// Court and hoop constants
const GRAV = 0.9;
const FLOOR_Y = H - 70;
const LEFT_HOOP_X = 120;
const RIGHT_HOOP_X = W - 120;
const HOOP_Y = FLOOR_Y - 200;
const RIM_RADIUS = 34;
const THREE_PT_RADIUS = 220;

// Input
let keys = {};
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  // quick restart with Enter or R when ended
  if(gameEnded && (e.key === 'Enter' || e.key.toLowerCase() === 'r')) startGame();
});
window.addEventListener('keyup', e => keys[e.key] = false);

// --- Cosmetic skins (randomized each match) ---
// Programmatic skins so every player looks distinct without external images
const HAIR_STYLES = [
  { name:'Short', color:'#1c1c1c' },
  { name:'Curly', color:'#2d1b00' },
  { name:'Buzz', color:'#efd07a' },
  { name:'Mohawk', color:'#2b2b8a' },
  { name:'Bald', color:'#a87b54' }
];
const JERSEY_COLORS = ['#ffb84d','#9be1ff','#b7ff9a','#ffd1f0','#ffd24d','#caa2ff','#ff9aa2'];

// Helper to pick distinct skins for player & AI
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
  // ensure jersey color difference (visual)
  if(a.jersey === b.jersey){
    // pick new for b
    b.jersey = JERSEY_COLORS[(JERSEY_COLORS.indexOf(b.jersey)+2) % JERSEY_COLORS.length];
  }
  return { playerSkin: a, aiSkin: b };
}

// --- Player class (cartoon with limbs) ---
class Player {
  constructor(x, skin){
    this.x = x;
    this.y = FLOOR_Y - 27;
    this.vx = 0; this.vy = 0;
    this.w = 44; this.h = 60;
    this.skin = skin;
    this.facingRight = x < W/2;
    this.onGround = true;
    this.hasBall = false;
    // timers
    this.jumpCooldown = 0;
    this.dodgeCooldown = 0;
    this.fakeTimer = 0;
    this.stealCooldown = 0;
    this.dashing = false;
    this.animTime = Math.random()*10;
  }
  feetPos(){ return { x1: this.x - this.w/2 + 8, x2: this.x + this.w/2 - 8 }; }
  update(input, dt){
    this.animTime += dt * (1 + Math.abs(this.vx)*0.2);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.fakeTimer = Math.max(0, this.fakeTimer - dt);
    this.stealCooldown = Math.max(0, this.stealCooldown - dt);

    if(this.dashing){
      // maintain dash velocity, damp a little
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

    this.vy += GRAV;
    this.y += this.vy;
    if(this.y + this.h/2 > FLOOR_Y){
      this.y = FLOOR_Y - this.h/2; this.vy = 0; this.onGround = true;
    } else this.onGround = false;

    this.x = clamp(this.x, 20, W-20);
  }

  draw(t){
    // cartoon body assembled from shapes: head, torso, limbs
    const px = this.x, py = this.y;
    // shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(px, FLOOR_Y + 6, 30, 8, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
    ctx.restore();

    // torso + shorts
    ctx.save(); ctx.translate(px, py - 6);
    // jersey
    ctx.fillStyle = this.skin.jersey;
    ctx.beginPath(); ctx.roundRect(-this.w/2, -this.h/2 + 8, this.w, this.h*0.55, 8); ctx.fill();
    // shorts
    ctx.fillStyle = this.skin.shorts; ctx.fillRect(-this.w/2, this.h*0.55 - this.h/2 + 8, this.w, 18);
    // chest letter or small circle
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(this.skin.name[0], 0, 4);
    ctx.restore();

    // head
    ctx.save(); ctx.translate(px, py - this.h/2 - 12);
    ctx.beginPath(); ctx.fillStyle = this.skin.faceTone; ctx.arc(0,0,16,0,Math.PI*2); ctx.fill();
    // hair
    ctx.fillStyle = this.skin.hair.color;
    if(this.skin.hair.name === 'Curly'){ for(let i=-8;i<=8;i+=5){ ctx.beginPath(); ctx.arc(i-2,-6,4,0,Math.PI*2); ctx.fill(); } }
    else if(this.skin.hair.name === 'Mohawk'){ ctx.fillRect(-4,-10,8,12); }
    else if(this.skin.hair.name === 'Buzz'){ ctx.beginPath(); ctx.arc(0,-2,16,0,Math.PI*2); ctx.fill(); }
    else if(this.skin.hair.name === 'Short'){ ctx.fillRect(-12,-10,24,8); }
    // eyes
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-5,-2,2,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(5,-2,2,0,Math.PI*2); ctx.fill();
    ctx.restore();

    // limbs (arms/legs) with simple rotation based on anim time
    const walk = Math.sin(t*12 + px*0.01) * 0.6;
    // legs
    drawLimb(px - 10, py + 6, 18, 7, -0.5 * walk);
    drawLimb(px + 10, py + 6, 18, 7, 0.5 * walk);
    // arms
    const armAngle = this.hasBall ? (this.facingRight ? -0.4 : 0.4) : (0.2 * Math.sin(t*10));
    // trailing arm
    drawArm(px + (this.facingRight ? -12 : 12), py - 12, -0.2 * Math.sin(t*9));
    // leading arm (hand) - if holding ball we draw ball at hand
    const leadX = px + (this.facingRight ? 14 : -14);
    drawArm(leadX, py - 12, armAngle);
    if(this.hasBall){
      const handX = leadX + Math.cos(armAngle) * 16;
      const handY = py - 12 + Math.sin(armAngle) * 16;
      drawBallAt(handX, handY, 9);
    }

    // small name tag near torso
    ctx.save(); ctx.fillStyle = 'white'; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(this.skin.name, px, py - this.h/2 + 2);
    ctx.restore();
  }
}

// limb and arm drawing helpers
function drawLimb(x,y,length,width,angle){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.roundRect(0,0,length,width,5); ctx.fill();
  ctx.restore();
}
function drawArm(x,y,angle){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  // upper arm
  ctx.fillStyle='#ffd9b6'; ctx.beginPath(); ctx.roundRect(0,0,14,6,4); ctx.fill();
  // forearm
  ctx.translate(12,0); ctx.rotate(0.2); ctx.beginPath(); ctx.roundRect(0,0,14,6,4); ctx.fill();
  // hand
  ctx.beginPath(); ctx.arc(28,6,4,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawBallAt(x,y,r){
  ctx.save(); ctx.beginPath(); ctx.fillStyle = '#ff7a18'; ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#b04a06'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
}

// add roundRect polyfill
CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){ if(!r) r=6; this.beginPath(); this.moveTo(x+r,y); this.arcTo(x+w,y,x+w,y+h,r); this.arcTo(x+w,y+h,x,y+h,r); this.arcTo(x,y+h,x,y,r); this.arcTo(x,y,x+w,y,r); this.closePath(); };

// Ball object
class Ball {
  constructor(x,y){ this.x=x; this.y=y; this.vx=0; this.vy=0; this.r=10; this.holder=null; this._scored=false; this._lastTouched=null; this._dunk=null; }
  update(dt){
    if(this.holder){
      const handX = this.holder.x + (this.holder.facingRight ? 14 : -14);
      this.x = handX; this.y = this.holder.y - 12; this.vx=0; this.vy=0; return;
    }
    this.vy += GRAV*0.5;
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    this.vx *= 0.998;
    if(this.y + this.r > FLOOR_Y){
      this.y = FLOOR_Y - this.r;
      this.vy *= -0.45;
      this.vx *= 0.95;
      playSound(sounds.bounce);
    }
    if(this.x - this.r < 0){ this.x = this.r; this.vx *= -0.5; }
    if(this.x + this.r > W){ this.x = W - this.r; this.vx *= -0.5; }
  }
  draw(){ drawBallAt(this.x,this.y,this.r); }
}

// Instantiate skins & objects (skins randomized each match)
let { playerSkin, aiSkin } = pickSkins();
let player = new Player(180, playerSkin);
let ai = new Player(W-180, aiSkin);
let ball = new Ball(W/2, FLOOR_Y - 150);
let score = { player: 0, ai: 0 };

// --- Gameplay actions ---
// Pickup
function tryPickup(pl){
  if(ball.holder) return false;
  if(dist(pl.x, pl.y-12, ball.x, ball.y) < 38){
    ball.holder = pl; pl.hasBall = true; ball._lastTouched = pl; return true;
  }
  return false;
}

// Shoot (or dunk)
function shootBall(pl){
  if(!pl.hasBall) return false;
  ball.holder = null; pl.hasBall = false;
  const targetX = pl === player ? RIGHT_HOOP_X : LEFT_HOOP_X;
  const dToHoop = dist(pl.x, pl.y, targetX, HOOP_Y);
  const nearDunk = (!pl.onGround && Math.abs(pl.y - HOOP_Y) < 140 && dToHoop < 80);
  if(nearDunk){
    ball.vx = (targetX - pl.x) * 0.08;
    ball.vy = -8 + rand(-2,0);
    ball._dunk = { by: pl, t: 0.5 };
    ball._lastTouched = pl;
    playSound(sounds.dunk);
    return true;
  }
  const aimY = HOOP_Y - rand(10,60);
  const dx = targetX - pl.x; const dy = aimY - pl.y;
  const power = clamp(Math.hypot(dx,dy)/10, 7.5, 20);
  const ang = Math.atan2(dy,dx);
  ball.vx = Math.cos(ang)*power; ball.vy = Math.sin(ang)*power;
  ball._lastTouched = pl;
  playSound(sounds.swish);
  return true;
}

// Steal (close-range only)
function trySteal(attacker, defender){
  if(attacker.stealCooldown > 0) return false;
  if(!defender.hasBall) return false;
  const d = Math.hypot(attacker.x - defender.x, attacker.y - defender.y);
  if(d > 56) return false; // must be close
  if(defender.dodgeCooldown > 0){ attacker.stealCooldown = 0.6; return false; }
  let baseChance = defender.fakeTimer > 0 ? 0.75 : 0.45;
  if(attacker.vx !== 0) baseChance += 0.12;
  attacker.stealCooldown = 0.6;
  if(Math.random() < baseChance){
    defender.hasBall = false; ball.holder = null;
    const push = (attacker.x < defender.x) ? -1 : 1;
    ball.vx = push * (6 + Math.random()*3); ball.vy = -6 - Math.random()*2;
    playSound(sounds.steal);
    return true;
  } else {
    attacker.vx *= -0.5; attacker.vy = -3;
    return false;
  }
}

// Scoring detection
function checkScore(){
  if(ball._scored) return;
  if(ball.y - ball.vy < HOOP_Y && ball.y >= HOOP_Y){
    if(Math.abs(ball.x - RIGHT_HOOP_X) < RIM_RADIUS){
      const shooter = ball._lastTouched || null;
      const pts = classifyShot(shooter, RIGHT_HOOP_X);
      score.player += pts; ball._scored = true;
      setTimeout(resetAfterScore, 700); playSound(sounds.swish);
    } else if(Math.abs(ball.x - LEFT_HOOP_X) < RIM_RADIUS){
      const shooter = ball._lastTouched || null;
      const pts = classifyShot(shooter, LEFT_HOOP_X);
      score.ai += pts; ball._scored = true;
      setTimeout(resetAfterScore, 700); playSound(sounds.swish);
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
  player.x = 180; player.y = FLOOR_Y - 27; player.vx = player.vy = 0; player.hasBall = false;
  ai.x = W-180; ai.y = FLOOR_Y - 27; ai.vx = ai.vy = 0; ai.hasBall = false;
  ball.x = W/2; ball.y = FLOOR_Y - 150; ball.vx = ball.vy = 0; ball.holder = null;
  ball._scored = false; ball._dunk = null; ball._lastTouched = null;
}

// --- AI (unchanged but works with skins)
function updateAI(dt){
  if(!ai.hasBall && !ball.holder){
    ai.vx += (ball.x < ai.x ? -0.2 : 0.2);
    ai.vx = clamp(ai.vx, -3.5, 3.5);
    if(dist(ai.x,ai.y,ball.x,ball.y) < 36) tryPickup(ai);
  } else if(ai.hasBall){
    const targetX = LEFT_HOOP_X;
    if(Math.abs(ai.x - targetX) > 70) ai.vx += (ai.x < targetX ? 0.25 : -0.25);
    ai.vx = clamp(ai.vx, -3.5, 3.5);
    if(Math.random() < 0.012 && ai.onGround) ai.vy = -12;
    if(Math.random() < 0.014) { shootBall(ai); }
  } else {
    if(player.hasBall && Math.abs(player.x - ai.x) < 64 && ai.stealCooldown <= 0 && Math.random() < 0.35) trySteal(ai, player);
    ai.vx *= 0.92;
  }
}

// --- Input helpers: double-tap dodge, jump, pump fake, shoot/steal
const tap = { left:{last:0,count:0}, right:{last:0,count:0} };
function checkDoubleTap(dir){
  const t = performance.now(); const rec = dir==='left' ? tap.left : tap.right;
  if(t - rec.last < 280) rec.count++; else rec.count = 1;
  rec.last = t;
  if(rec.count >= 2){ rec.count = 0; return true; } return false;
}
function tryJump(pl){ if(pl.jumpCooldown>0) return false; if(!pl.onGround) return false; pl.vy = -14.5; pl.jumpCooldown = 1.7; return true; }
function tryDodge(pl, dir){ if(pl.dodgeCooldown>0) return false; pl.dodgeCooldown = 2.5; pl.vx = (dir==='right'?9:-9); pl.dashing = true; return true; }

// --- Draw court + crowd + realistic hoop/backboard ---
function drawCourt(){
  // background crowd stylized
  ctx.fillStyle = '#133254'; ctx.fillRect(0,0,W,FLOOR_Y-80);
  // crowd rows (simple rectangles & circles as stylized avatars)
  for(let y=40;y<FLOOR_Y-80;y+=36){
    for(let x=40;x<W-40;x+=56){
      const shade = (Math.sin((x+y)/30)+1)*0.1 + 0.1;
      ctx.fillStyle = `rgba(255,255,255,${0.06 + shade*0.05})`;
      ctx.beginPath(); ctx.ellipse(x, y, 12, 14, 0, 0, Math.PI*2); ctx.fill();
    }
  }
  // floor wood gradient
  const g = ctx.createLinearGradient(0, FLOOR_Y-200, 0, FLOOR_Y+40);
  g.addColorStop(0,'#d9b892'); g.addColorStop(1,'#b8875c');
  ctx.fillStyle = g; ctx.fillRect(0, FLOOR_Y, W, H-FLOOR_Y);
  // court lines
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
  // outer rectangle half-court markings
  ctx.beginPath(); ctx.rect(40, FLOOR_Y-260, W-80, 240); ctx.stroke();
  // center circle
  ctx.beginPath(); ctx.arc(W/2, FLOOR_Y-140, 36, 0, Math.PI*2); ctx.stroke();
  // 3pt arcs (light)
  ctx.beginPath(); ctx.arc(LEFT_HOOP_X, HOOP_Y, THREE_PT_RADIUS, Math.PI*0.25, Math.PI*1.75); ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(RIGHT_HOOP_X, HOOP_Y, THREE_PT_RADIUS, -Math.PI*0.25, Math.PI*0.75); ctx.stroke();
  // draw both hoops
  drawHoop(LEFT_HOOP_X, HOOP_Y, true);
  drawHoop(RIGHT_HOOP_X, HOOP_Y, false);
}

function drawHoop(x,y, leftSide){
  ctx.save(); ctx.translate(x,y);
  // backboard
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#c0c0c0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(-48, -60, 96, 60, 6); ctx.fill(); ctx.stroke();
  // hoop arm
  ctx.fillStyle = '#333'; ctx.fillRect(leftSide?36:-54, -10, 20, 8);
  // rim (drawn as ellipse / thick arc)
  ctx.beginPath(); ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 5; ctx.arc(0, 0, RIM_RADIUS, 0, Math.PI*2); ctx.stroke();
  // net stylized
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
  const top = 6, netHeight = 28;
  for(let i=-6;i<=6;i+=3){
    ctx.beginPath(); ctx.moveTo(i*(RIM_RADIUS/10), top); ctx.quadraticCurveTo(i*0.6, top+netHeight*0.6, i*0.5, top+netHeight); ctx.stroke();
  }
  ctx.restore();
}

// HUD
function updateHUD(){
  playerScoreEl.textContent = `You: ${score.player}`;
  aiScoreEl.textContent = `AI: ${score.ai}`;
  const t = Math.max(0, Math.floor(gameTime));
  const mm = String(Math.floor(t/60)).padStart(2,'0');
  const ss = String(t%60).padStart(2,'0');
  timerEl.textContent = `${mm}:${ss}`;
}

// End screen
function showEndScreen(){
  started = false; gameEnded = true; gameContainer.style.display = 'none'; endScreen.style.display = 'flex';
  if(score.player > score.ai) resultText.textContent = "🏆 YOU WIN!"; else if(score.ai > score.player) resultText.textContent = "AI WINS 😢"; else resultText.textContent = "DRAW!";
}

// --- Main update loop ---
function update(dt){
  if(!started || gameEnded) return;

  // Input handling with double-tap dodge detection
  if(keys['ArrowLeft'] && !keys._leftHandled){
    if(checkDoubleTap('left')) tryDodge(player, 'left');
    keys._leftHandled = true;
  } if(!keys['ArrowLeft']) keys._leftHandled = false;

  if(keys['ArrowRight'] && !keys._rightHandled){
    if(checkDoubleTap('right')) tryDodge(player, 'right');
    keys._rightHandled = true;
  } if(!keys['ArrowRight']) keys._rightHandled = false;

  if(keys['ArrowUp'] && !keys._jumpPressed){ tryJump(player); keys._jumpPressed = true; } if(!keys['ArrowUp']) keys._jumpPressed = false;

  if(keys['ArrowDown'] && !keys._fakePressed){ if(player.hasBall) player.fakeTimer = 0.42; keys._fakePressed = true; } if(!keys['ArrowDown']) keys._fakePressed = false;

  if((keys['x']||keys['X']) && !keys._xPressed){
    if(player.hasBall){ shootBall(player); ball._lastTouched = player; } else { trySteal(player, ai); }
    keys._xPressed = true;
  } if(!keys['x'] && !keys['X']) keys._xPressed = false;

  // update players and AI
  const pInput = { left: keys['ArrowLeft'], right: keys['ArrowRight'] };
  player.update(pInput, dt);
  updateAI(dt);

  // pickups only when close (prevents long-range grabbing)
  if(!ball.holder){ tryPickup(player); tryPickup(ai); }

  // ball physics
  ball.update(dt);
  if(ball._dunk){ ball._dunk.t -= dt; if(ball._dunk.t <= 0) ball._dunk = null; }

  // scoring
  checkScore();

  // reactive AI steals on pump fake
  if(player.fakeTimer > 0 && Math.abs(player.x - ai.x) < 60 && ai.stealCooldown <= 0){
    if(Math.random() < 0.55) trySteal(ai, player);
  }

  // timer
  gameTime -= dt;
  if(gameTime <= 0 && !gameEnded){ playSound(sounds.buzzer); showEndScreen(); }

  // update DOM HUD
  updateHUD();
}

function render(ts){
  // ts provided by requestAnimationFrame; we use seconds for animation math
  const tsec = ts/1000;
  ctx.clearRect(0,0,W,H);
  drawCourt();

  // draw ball, players, ensure correct depth (players over floor, ball above/between)
  // draw players and ball in an order to give depth: left->right by x
  const objs = [player, ai];
  objs.sort((a,b)=>a.x - b.x);
  // draw leftmost player, ball & other player in a depth-appropriate order:
  // To ensure ball is visible near hands, we draw players then ball last
  objs.forEach(p => p.draw(tsec));
  ball.draw();

  // small title
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font='15px system-ui'; ctx.fillText('Basket Rivals — Cartoon 1v1', 14, 24);
}

// main loop
function loop(ts){
  const dt = Math.min(0.05, (ts - lastTs)/1000);
  lastTs = ts;
  update(dt);
  render(ts);
  requestAnimationFrame(loop);
}

// --- Start / Restart logic (randomize skins, reset state) ---
function startGame(){
  // randomize cosmetic skins, ensure different jerseys
  const s = pickSkins();
  player.skin = s.playerSkin; ai.skin = s.aiSkin;
  // reset players & ball
  player.x = 180; player.y = FLOOR_Y - 27; player.vx = player.vy = 0; player.hasBall = false;
  ai.x = W - 180; ai.y = FLOOR_Y - 27; ai.vx = ai.vy = 0; ai.hasBall = false;
  ball = new Ball(W/2, FLOOR_Y - 150);
  score = { player: 0, ai: 0 };
  gameTime = 90; gameEnded = false; started = true;
  startScreen.style.display = 'none'; gameContainer.style.display = 'block'; endScreen.style.display = 'none';
  playSound(sounds.whistle);
  updateHUD();
}
restartBtn.addEventListener('click', startGame);
startBtn.addEventListener('click', startGame);

// initial UI state
startScreen.style.display = 'flex';
gameContainer.style.display = 'none';
endScreen.style.display = 'none';

// begin
requestAnimationFrame(loop);
