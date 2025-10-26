// ======================
// Basket Rivals - game.js
// 1v1 Basketball clone
// Cartoon players, AI, pump fake, dodge, dunk, 3pt, 90s timer
// ======================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// Physics constants
const GRAV = 0.9;
const FLOOR_Y = H - 70;
const RIM_RADIUS = 36;
const LEFT_HOOP_X = 120;
const RIGHT_HOOP_X = W - 120;
const HOOP_Y = FLOOR_Y - 200;
const THREE_PT_RADIUS = 220; // distance for 3pt shot

// Input state
let keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true; if(e.key==='r') resetRound(); });
window.addEventListener('keyup', e => { keys[e.key] = false; });

// Game timer
let gameTime = 90; // seconds
let lastTs = performance.now();

// Helper functions
function clamp(a,b,c){ return Math.max(b,Math.min(c,a)); }
function dist(a,b,c,d){ return Math.hypot(a-c,b-d); }
function rand(a,b){ return a + Math.random()*(b-a); }

// Double-tap detection for dodge
const tap = {left:{last:0,count:0}, right:{last:0,count:0}};
function checkDoubleTap(dir){
    const t = performance.now();
    const rec = dir==='left'? tap.left : tap.right;
    if(t - rec.last < 280){ rec.count++; } else { rec.count = 1; }
    rec.last = t;
    if(rec.count >= 2){ rec.count = 0; return true; }
    return false;
}

// ======================
// Ball
// ======================
class Ball{
    constructor(x,y){
        this.x=x; this.y=y;
        this.vx=0; this.vy=0;
        this.r=10; this.holder=null;
        this._dunk=null;
        this._scored=false;
        this._lastTouchedBy=null;
    }
    update(dt){
        if(this.holder){
            this.x = this.holder.x + (this.holder.facingRight?26:-26);
            this.y = this.holder.y - 8;
            this.vx=this.vy=0;
            return;
        }
        this.vy += GRAV*0.5;
        this.x += this.vx; this.y += this.vy;
        this.vx *= 0.998;
        if(this.y + this.r > FLOOR_Y){ this.y = FLOOR_Y - this.r; this.vy*=-0.45; this.vx*=0.95; if(Math.abs(this.vy)<1) this.vy=0; }
        if(this.x - this.r < 0){ this.x=this.r; this.vx*=-0.5; }
        if(this.x + this.r > W){ this.x=W-this.r; this.vx*=-0.5; }
    }
    draw(){
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle='#ff8c2a';
        ctx.arc(this.x,this.y,this.r,0,Math.PI*2);
        ctx.fill();
        ctx.strokeStyle='#b05505';
        ctx.lineWidth=2;
        ctx.stroke();
        ctx.restore();
    }
}

// ======================
// Player (cartoon style)
// ======================
class Player{
    constructor(x, color){
        this.x = x; this.y = FLOOR_Y - 27;
        this.vx=0; this.vy=0;
        this.w=40; this.h=56;
        this.color=color;
        this.facingRight = x<W/2;
        this.onGround=true;
        this.hasBall=false;

        // States
        this.fakeTimer=0;
        this.dodgeTimer=0;
        this.dodgeCooldown=0;
        this.jumpCooldown=0;
        this.stealCooldown=0;
        this.hitCooldown=0;
        this.dashing=false;
    }
    feetPos(){ return {x1:this.x-this.w/2+6, x2:this.x+this.w/2-6}; }
    update(input, dt){
        // timers
        this.fakeTimer = Math.max(0,this.fakeTimer-dt);
        this.dodgeTimer = Math.max(0,this.dodgeTimer-dt);
        this.dodgeCooldown = Math.max(0,this.dodgeCooldown-dt);
        this.jumpCooldown = Math.max(0,this.jumpCooldown-dt);
        this.stealCooldown = Math.max(0,this.stealCooldown-dt);
        this.hitCooldown = Math.max(0,this.hitCooldown-dt);

        // movement
        let move = 0;
        if(input.left) move -= 1;
        if(input.right) move += 1;

        if(this.dodgeTimer > 0) this.vx = (this.facingRight?1:-1)*8;
        else { this.vx += move*0.9; this.vx*=0.85; }

        this.x += this.vx;

        // facing
        if(this.vx>0.6) this.facingRight=true;
        if(this.vx<-0.6) this.facingRight=false;

        // gravity
        this.vy += GRAV * (this.onGround ? 0.8 : 1);
        this.y += this.vy;
        this.onGround = this.y + this.h/2 >= FLOOR_Y;
        if(this.onGround) this.y = FLOOR_Y - this.h/2, this.vy=0;

        this.x = clamp(this.x, 20, W-20);
    }
    draw(ctx){
        ctx.save();
        // shadow
        ctx.beginPath();
        ctx.ellipse(this.x, FLOOR_Y+6, 28,8,0,0,Math.PI*2);
        ctx.fillStyle='rgba(0,0,0,0.18)';
        ctx.fill();
        // body
        ctx.translate(this.x,this.y);
        ctx.fillStyle = '#222';
        ctx.fillRect(-12,this.h/4,10,this.h/3);
        ctx.fillRect(2,this.h/4,10,this.h/3);
        ctx.beginPath();
        ctx.roundRect(-this.w/2,-this.h/2+8,this.w,this.h*0.55,10);
        ctx.fillStyle=this.color;
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle='#ffd9b6';
        ctx.arc(0,-this.h/2-10,16,0,Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle='#000';
        ctx.arc(-5,-this.h/2-13,2,0,Math.PI*2);
        ctx.arc(5,-this.h/2-13,2,0,Math.PI*2);
        ctx.fill();
        if(this.hasBall){ ctx.fillStyle='#fff'; ctx.font='bold 13px system-ui'; ctx.textAlign='center'; ctx.fillText('●',0,-4); }
        if(this.fakeTimer>0){ ctx.fillStyle='rgba(255,255,255,0.75)'; ctx.font='12px system-ui'; ctx.fillText('FAKE',0,-this.h/2-30); }
        if(this.dodgeCooldown>0){ ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='11px system-ui'; ctx.fillText(`DODGE:${this.dodgeCooldown.toFixed(1)}`,0,this.h/2+20); }
        ctx.restore();
    }
}

// roundRect helper
CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){ if(!r) r=6; this.beginPath(); this.moveTo(x+r,y); this.arcTo(x+w,y,x+w,y+h,r); this.arcTo(x+w,y+h,x,y+h,r); this.arcTo(x,y+h,x,y,r); this.arcTo(x,y,x+w,y,r); this.closePath(); }

// ======================
// Game objects
// ======================
let player = new Player(180,'#ffb84d');
let ai = new Player(W-180,'#65d6ff');
let ball = new Ball(W/2, FLOOR_Y-180);
let score = {player:0, ai:0};
let paused=false;

// cooldown constants
const DODGE_COOLDOWN=2.5, DODGE_DURATION=0.22, JUMP_COOLDOWN=1.7, FAKE_DURATION=0.42;

// ======================
// Helper functions
// ======================
function resetRound(){
    player.x=180; player.y=FLOOR_Y-27; player.vx=player.vy=0; player.hasBall=false; player.fakeTimer=0; player.dodgeCooldown=0; player.jumpCooldown=0; player.dodgeTimer=0;
    ai.x=W-180; ai.y=FLOOR_Y-27; ai.vx=ai.vy=0; ai.hasBall=false; ai.fakeTimer=0; ai.dodgeCooldown=0; ai.jumpCooldown=0; ai.dodgeTimer=0;
    ball.x=W/2; ball.y=FLOOR_Y-160; ball.vx=ball.vy=0; ball.holder=null; ball._dunk=null; ball._scored=false; ball._lastTouchedBy=null;
    score.player=0; score.ai=0; gameTime=90;
}

function tryJump(pl){
    if(pl.jumpCooldown>0) return false;
    if(!pl.onGround) return false;
    pl.vy=-14.5; pl.onGround=false; pl.jumpCooldown=JUMP_COOLDOWN; return true;
}

function tryDodge(pl,dir){
    if(pl.dodgeCooldown>0) return false;
    pl.dodgeTimer=DODGE_DURATION; pl.dodgeCooldown=DODGE_COOLDOWN; pl.dashing=true;
    pl.facingRight = dir==='right';
    return true;
}

function tryPickup(pl){
    if(ball.holder) return false;
    if(dist(pl.x,pl.y-12,ball.x,ball.y)<40){ ball.holder=pl; pl.hasBall=true; return true; }
    return false;
}

function shootBall(pl){
    if(!pl.hasBall) return false;
    ball.holder=null; pl.hasBall=false;
    const targetX = pl===player ? RIGHT_HOOP_X : LEFT_HOOP_X;
    const dToHoop = dist(pl.x,pl.y,targetX,HOOP_Y);
    const nearDunk = (Math.abs(pl.y-HOOP_Y)<140 && dToHoop<80 && !pl.onGround);
    if(nearDunk){
        ball.vx=(targetX-pl.x)*0.08; ball.vy=-8+rand(-2,0); ball._dunk={by:pl,t:0.5};
        return true;
    }
    const aimY=HOOP_Y-rand(10,60);
    const dx=targetX-pl.x, dy=aimY-pl.y;
    const power=clamp(Math.hypot(dx,dy)/10,7.5,20);
    const ang=Math.atan2(dy,dx);
    ball.vx=Math.cos(ang)*power; ball.vy=Math.sin(ang)*power;
    return true;
}

function trySteal(attacker,defender){
    if(attacker.stealCooldown>0) return false;
    if(!defender.hasBall) return false;
    if(dist(attacker.x,attacker.y,defender.x,defender.y)>56) return false;
    if(defender.dodgeTimer>0){ attacker.stealCooldown=0.6; return false; }
    let baseChance = defender.fakeTimer>0 ? 0.75 : 0.5;
    if(attacker.dodgeTimer>0) baseChance+=0.15;
    const success=Math.random()<baseChance;
    attacker.stealCooldown=0.6;
    if(success){
        defender.hasBall=false; ball.holder=null;
        const push = (attacker.x<defender.x)?-1:1;
        ball.vx=push*(6+Math.random()*4); ball.vy=-6-rand(0,3);
        defender.hitCooldown=0.5;
        return true;
    } else { attacker.vx*=-0.6; attacker.vy=-3; return false; }
}

function classifyShot(shooter,hoopX){
    if(!shooter) return 2;
    if(ball._dunk && ball._dunk.by===shooter) return 2;
    const d = dist(shooter.x,shooter.y,hoopX,HOOP_Y);
    return d>THREE_PT_RADIUS ? 3 : 2;
}

function resetAfterScore(){
    player.x=180; player.y=FLOOR_Y-27; player.vx=player.vy=0; player.hasBall=false;
    ai.x=W-180; ai.y=FLOOR_Y-27; ai.vx=ai.vy=0; ai.hasBall=false;
    ball.x=W/2; ball.y=FLOOR_Y-150; ball.vx=ball.vy=0; ball.holder=null; ball._dunk=null; ball._scored=false; ball._lastTouchedBy=null;
}

// ======================
// AI logic
// ======================
function updateAI(dt){
    let input={left:false,right:false,jump:false,shoot:false};
    if(!ai.hasBall && !ball.holder){
        if(ball.x<ai.x-8) input.left=true;
        else input.right=true;
        if(dist(ai.x,ai.y,ball.x,ball.y)<40) tryPickup(ai);
    } else if(ai.hasBall){
        const targetX=LEFT_HOOP_X;
        if(Math.abs(ai.x-targetX)>80) input.right=ai.x<targetX; input.left=ai.x>targetX;
        const d=dist(ai.x,ai.y,targetX,HOOP_Y);
        if(d<160 && Math.random()<0.01 && ai.onGround) tryJump(ai);
        if(d<220 && Math.random()<
