// THE HOLLOW — game orchestration
import { AudioEngine } from './audio.js';
import { createWorld } from './world.js';
import { updateBotSurvivor, updateAIKiller } from './ai.js';
import { renderGame, renderMinimap, renderSkillCheck, renderMenuBackdrop, renderResultBackdrop } from './render.js';
import { HudUI } from './ui.js';
import {
  TAU, clamp, dist, rand, fmtTime, THREATS, ROSTER, SURVIVOR_SPAWNS, KILLER_SPAWN,
  SURVIVOR_SPEED, SURVIVOR_SPRINT, SURVIVOR_CROUCH, SURVIVOR_RADIUS, KILLER_RADIUS,
  MATCH_TIME, GENS_REQUIRED
} from './config.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

class HollowGame {
  constructor() {
    this.audio = new AudioEngine();
    this.ui = new HudUI(this);
    this.role = 'survivor';
    this.threatId = 'nightmare';
    this.threat = THREATS.nightmare;
    this.phase = 'menu';
    this.screen = 'menu';
    this.clock = 0;
    this.last = performance.now();
    this.hudTimer = 0;
    this.miniTimer = 0;
    this.rain = [];
    this.particles = [];
    this.cam = { x: 0, y: 0, init: false };
    this.viewW = innerWidth;
    this.viewH = innerHeight;
    this.zoom = .9;
    this.muted = false;
    this.resultTimeout = null;
    this.ambientMode = 'calm';
    this.danger = 0;
    this.shake = 0;
    this.interactTarget = null;
    this.touchPointer = null;
    this.skillCheck = { active: false, angle: 0, zoneStart: 1, zoneWidth: .52, speed: 2.85, result: null, resultTimer: 0 };
    this.input = {
      keys: new Set(),
      mouseX: innerWidth / 2, mouseY: innerHeight / 2, mouseActive: false,
      interact: false, interactEdge: false, attackEdge: false, abilityEdge: false, skillEdge: false, dashEdge: false,
      sprint: false, crouch: false, touchMove: { x: 0, y: 0 }, touchSprint: false
    };
    this.el = {
      menuCanvas: $('#menuCanvas'), gameCanvas: $('#gameCanvas'), resultCanvas: $('#resultCanvas'),
      playBtn: $('#playBtn'), pauseBtn: $('#pauseBtn'), resumeBtn: $('#resumeBtn'), quitBtn: $('#quitBtn'),
      againBtn: $('#againBtn'), menuBtn: $('#menuBtn'), menuSoundBtn: $('#menuSoundBtn'), gameSoundBtn: $('#gameSoundBtn'),
      pauseOverlay: $('#pauseOverlay'), dangerFrame: $('#dangerFrame'), gameScreen: $('#gameScreen'),
      skillCheck: $('#skillCheck'), skillCanvas: $('#skillCanvas'), touchSkill: $('#touchSkill'),
      joystick: $('#joystick'), joystickKnob: $('#joystickKnob'),
      touchAction: $('#touchAction'), touchSprint: $('#touchSprint'), touchAbility: $('#touchAbility'),
      crosshair: $('#crosshair')
    };
    this.isTouch = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
    if (this.isTouch) document.body.classList.add('touch');
    this.menuCanvas = this.el.menuCanvas;
    this.gameCanvas = this.el.gameCanvas;
    this.resultCanvas = this.el.resultCanvas;
    this.skillCanvas = this.el.skillCanvas;
    this.miniCanvas = document.querySelector('#miniMap');
    this.loop = this.loop.bind(this);
    this.bindMenu();
    this.bindInput();
    this.ui.showScreen('menu');
    requestAnimationFrame(this.loop);
  }

  loop(now) {
    const raw = (now - this.last) / 1000;
    const dt = clamp(Number.isFinite(raw) ? raw : 0, 0, .05);
    this.last = now;
    this.clock += dt;

    if (this.screen === 'menu') {
      renderMenuBackdrop(this.el.menuCanvas, this.clock);
    } else if (this.screen === 'game') {
      if (this.phase === 'playing') this.update(dt);
      renderGame(this, dt);
      renderSkillCheck(this);
    } else if (this.screen === 'result') {
      renderResultBackdrop(this.el.resultCanvas, this.clock, this.resultOutcome || 'survivor');
    }

    requestAnimationFrame(this.loop);
  }

  // ── Menu ─────────────────────────────────────────────────────
  bindMenu() {
    for (const card of $$('.role-card')) {
      card.addEventListener('click', () => {
        this.role = card.dataset.role;
        for (const c of $$('.role-card')) {
          const on = c === card;
          c.classList.toggle('selected', on);
          c.setAttribute('aria-checked', on ? 'true' : 'false');
        }
        this.audio.init(); this.audio.choose();
      });
    }
    for (const btn of $$('.difficulty-options button')) {
      btn.addEventListener('click', () => {
        this.threatId = btn.dataset.threat;
        this.threat = THREATS[this.threatId] || THREATS.nightmare;
        for (const b of $$('.difficulty-options button')) {
          const on = b === btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        }
        this.audio.init(); this.audio.ui();
      });
    }
    this.el.playBtn.addEventListener('click', () => {
      this.audio.init();
      this.audio.ui();
      this.startMatch();
    });
    this.el.menuSoundBtn.addEventListener('click', () => this.toggleSound());
    this.el.gameSoundBtn.addEventListener('click', () => this.toggleSound());
    this.el.pauseBtn.addEventListener('click', () => this.setPaused(true));
    this.el.resumeBtn.addEventListener('click', () => this.setPaused(false));
    this.el.quitBtn.addEventListener('click', () => this.returnToMenu());
    this.el.againBtn.addEventListener('click', () => {
      this.audio.init(); this.audio.ui(); this.startMatch();
    });
    this.el.menuBtn.addEventListener('click', () => this.returnToMenu());
  }

  toggleSound() {
    this.muted = !this.muted;
    this.audio.init();
    this.audio.setMuted(this.muted);
    this.ui.setMuted(this.muted);
    if (!this.muted) this.audio.ui();
  }

  // ── Input ────────────────────────────────────────────────────
  bindInput() {
    window.addEventListener('keydown', e => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.code === 'Escape') {
        if (this.screen === 'game' && this.phase !== 'menu') {
          e.preventDefault();
          if (this.phase === 'playing') this.setPaused(true);
          else if (this.phase === 'paused') this.setPaused(false);
        }
        return;
      }
      if (this.phase !== 'playing') return;
      const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyC'];
      if (codes.includes(e.code)) {
        this.input.keys.add(e.code);
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
        if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.role === 'killer' && !e.repeat) this.input.dashEdge = true;
        return;
      }
      if (e.code === 'KeyE') {
        this.input.keys.add(e.code);
        if (!e.repeat) this.input.interactEdge = true;
        this.input.interact = true;
        e.preventDefault();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.skillCheck.active) this.input.skillEdge = true;
        else if (this.role === 'killer') this.input.attackEdge = true;
        return;
      }
      if (e.code === 'KeyQ') {
        if (!e.repeat && this.role === 'survivor' && this.player?.state === 'dead') {
          this.cycleSpectate();
        } else if (!e.repeat) this.input.abilityEdge = true;
        return;
      }
    });
    window.addEventListener('keyup', e => {
      this.input.keys.delete(e.code);
      if (e.code === 'KeyE') this.input.interact = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.input.sprint = false;
    });
    window.addEventListener('mousemove', e => {
      if (this.isTouch) return;
      this.input.mouseX = e.clientX;
      this.input.mouseY = e.clientY;
      this.input.mouseActive = true;
      this.el.crosshair.style.left = `${e.clientX}px`;
      this.el.crosshair.style.top = `${e.clientY}px`;
    });
    window.addEventListener('mousedown', e => {
      if (e.button !== 0 || this.isTouch) return;
      if (this.phase !== 'playing' || this.screen !== 'game') return;
      if (e.target.closest('button')) return;
      if (this.role === 'killer') this.input.attackEdge = true;
    });
    window.addEventListener('contextmenu', e => {
      if (this.screen === 'game') e.preventDefault();
    });
    window.addEventListener('resize', () => { this.rain = []; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') this.setPaused(true);
    });

    if (this.isTouch) this.bindTouch();
  }

  bindTouch() {
    const st = this.el.joystick;
    const moveJoystick = (clientX, clientY) => {
      const r = st.getBoundingClientRect();
      let dx = clientX - (r.left + r.width / 2);
      let dy = clientY - (r.top + r.height / 2);
      const max = r.width * .34;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      this.el.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / max, ny = dy / max;
      this.input.touchMove = { x: nx, y: ny };
    };
    st.addEventListener('pointerdown', e => {
      e.preventDefault();
      st.setPointerCapture(e.pointerId);
      this.touchPointer = e.pointerId;
      moveJoystick(e.clientX, e.clientY);
    });
    st.addEventListener('pointermove', e => {
      if (this.touchPointer !== e.pointerId) return;
      moveJoystick(e.clientX, e.clientY);
    });
    const endJoy = e => {
      if (this.touchPointer !== e.pointerId) return;
      this.touchPointer = null;
      this.input.touchMove = { x: 0, y: 0 };
      this.el.joystickKnob.style.transform = 'translate(0px, 0px)';
    };
    st.addEventListener('pointerup', endJoy);
    st.addEventListener('pointercancel', endJoy);

    const action = this.el.touchAction;
    const pressAction = e => {
      e.preventDefault();
      this.input.interact = true;
      this.input.interactEdge = true;
      action.classList.add('pressed');
    };
    const releaseAction = e => {
      this.input.interact = false;
      action.classList.remove('pressed');
    };
    action.addEventListener('pointerdown', pressAction);
    action.addEventListener('pointerup', releaseAction);
    action.addEventListener('pointercancel', releaseAction);
    action.addEventListener('pointerleave', releaseAction);

    const sprint = this.el.touchSprint;
    sprint.addEventListener('pointerdown', e => { e.preventDefault(); this.input.touchSprint = true; sprint.classList.add('pressed'); });
    const endSprint = () => { this.input.touchSprint = false; sprint.classList.remove('pressed'); };
    sprint.addEventListener('pointerup', endSprint);
    sprint.addEventListener('pointercancel', endSprint);
    sprint.addEventListener('pointerleave', endSprint);

    this.el.touchAbility.addEventListener('pointerdown', e => { e.preventDefault(); this.input.abilityEdge = true; this.el.touchAbility.classList.add('pressed'); });
    this.el.touchAbility.addEventListener('pointerup', () => this.el.touchAbility.classList.remove('pressed'));
    this.el.touchAbility.addEventListener('pointercancel', () => this.el.touchAbility.classList.remove('pressed'));

    this.el.touchSkill.addEventListener('pointerdown', e => { e.preventDefault(); this.input.skillEdge = true; this.el.touchSkill.classList.add('pressed'); });
    this.el.touchSkill.addEventListener('pointerup', () => this.el.touchSkill.classList.remove('pressed'));
    this.el.touchSkill.addEventListener('pointercancel', () => this.el.touchSkill.classList.remove('pressed'));
  }

  resetInput() {
    this.input.keys.clear();
    this.input.interact = false;
    this.input.interactEdge = false;
    this.input.attackEdge = false;
    this.input.abilityEdge = false;
    this.input.skillEdge = false;
    this.input.dashEdge = false;
    this.input.sprint = false;
    this.input.crouch = false;
    this.input.touchMove = { x: 0, y: 0 };
    this.input.touchSprint = false;
    this.el.joystickKnob.style.transform = 'translate(0px, 0px)';
  }

  consumeEdges() {
    this.input.interactEdge = false;
    this.input.attackEdge = false;
    this.input.abilityEdge = false;
    this.input.skillEdge = false;
    this.input.dashEdge = false;
  }

  getMoveVector() {
    let x = 0, y = 0;
    if (this.input.keys.has('KeyA') || this.input.keys.has('ArrowLeft')) x -= 1;
    if (this.input.keys.has('KeyD') || this.input.keys.has('ArrowRight')) x += 1;
    if (this.input.keys.has('KeyW') || this.input.keys.has('ArrowUp')) y -= 1;
    if (this.input.keys.has('KeyS') || this.input.keys.has('ArrowDown')) y += 1;
    x += this.input.touchMove.x;
    y += this.input.touchMove.y;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, mag: Math.min(1, m) };
  }

  getWorldMouse() {
    return {
      x: (this.input.mouseX - this.viewW / 2) / (this.zoom || 1) + this.cam.x,
      y: (this.input.mouseY - this.viewH / 2) / (this.zoom || 1) + this.cam.y
    };
  }

  // ── Match lifecycle ─────────────────────────────────────────────────
  startMatch() {
    if (this.resultTimeout) { clearTimeout(this.resultTimeout); this.resultTimeout = null; }
    this.audio.init();
    this.audio.startAmbience();
    this.audio.startMatch();
    this.resetInput();
    this.buildMatchState();
    this.screen = 'game';
    this.ui.showScreen('game');
    this.phase = 'playing';
    this.ui.buildMatch(this);
    this.ui.toast(this.role === 'survivor' ? 'REPAIR FIVE GENERATORS' : 'FIND THEM BEFORE THE GATES OPEN', 'amber', 3400);
    this.ui.feed(this.role === 'survivor' ? 'The Warden is somewhere in the pines.' : 'Four survivors. One way out. Make it yours.', '');
    this.update(0);
  }

  buildMatchState() {
    this.world = createWorld((Math.random() * 1e9) | 0);
    this.generators = this.world.generators.map((g, i) => ({
      ...g, id: i, progress: 0, done: false, repairers: new Set(), pulse: 0, highlight: false
    }));
    this.pallets = this.world.pallets.map((p, i) => ({
      ...p, id: i, w: 68, h: 14, dropped: false, broken: false, breakProgress: 0, highlight: false, angle: p.angle || 0
    }));
    this.exits = this.world.exits.map((e, i) => ({
      ...e, id: i, progress: 0, powered: false, open: false, highlight: false
    }));
    this.world.dynamicRects = [];

    this.survivors = ROSTER.map((def, i) => {
      const spawn = SURVIVOR_SPAWNS[(this.role === 'survivor' ? (i + 1) % 4 : i)];
      const isPlayer = this.role === 'survivor' && i === 0;
      const actualSpawn = isPlayer ? SURVIVOR_SPAWNS[0] : spawn;
      return {
        ...def,
        def,
        index: i,
        isPlayer,
        bot: !isPlayer,
        x: actualSpawn.x,
        y: actualSpawn.y,
        radius: SURVIVOR_RADIUS,
        dir: -Math.PI / 2,
        aim: -Math.PI / 2,
        state: 'alive',
        injured: false,
        stamina: 100,
        sprinting: false,
        crouching: false,
        moving: false,
        bob: rand(0, 10),
        vx: 0, vy: 0,
        action: null,
        path: [],
        pathTarget: null,
        pathTimer: 0,
        downTimer: 40,
        reviveProgress: 0,
        healProgress: 0,
        ai: { think: rand(.25, 1.1), state: 'objective', safeTime: 0, lastPallet: -99, targetGen: null }
      };
    });

    this.killer = {
      name: 'THE WARDEN', short: 'WARDEN', def: { accent: '#b4372f' },
      x: KILLER_SPAWN.x, y: KILLER_SPAWN.y,
      radius: KILLER_RADIUS,
      dir: -0.4, face: -0.4,
      speed: this.threat.killerSpeed,
      moving: false,
      attackCd: 0, attackAnim: 0, hitPending: 0, stunTimer: 0,
      lungeTimer: 0, lungeCd: 0,
      sightTimer: 0, sightCooldown: 0,
      execute: null, breakTarget: null, playerAction: null,
      target: null, lastSeen: -99, lastPos: null,
      thinkTimer: 0, path: [], pathTimer: 0,
      aiPatrol: null, aiPatrolUntil: 0,
      vx: 0, vy: 0
    };

    this.player = this.role === 'survivor' ? this.survivors[0] : this.killer;
    this.spectateTarget = null;
    this.time = MATCH_TIME;
    this.elapsed = 0;
    this.completedGens = 0;
    this.escapedCount = 0;
    this.deadCount = 0;
    this.danger = 0;
    this.shake = 0;
    this.hudTimer = 0;
    this.miniTimer = 0;
    this.particles = [];
    this.rain = [];
    this.ambientMode = 'calm';
    this.cam = { x: this.player.x, y: this.player.y, init: false };
    this.skillCheck = { active: false, angle: 0, zoneStart: 1, zoneWidth: .52, speed: 2.85, result: null, resultTimer: 0 };
    this.interactTarget = null;
    this.touchPointer = null;
    this.stats = { repairs: 0, revives: 0, escapes: 0, downs: 0, hits: 0, pallets: 0, gates: 0, stuns: 0 };
    this.ui.clearMessages();
    this.ui.skillVisible(false);
    this.el.skillCheck.classList.remove('show');
    this.el.dangerFrame.style.setProperty('--danger', 0);
    this.ui.setPaused(false);
    this.screen = 'game';
  }

  returnToMenu() {
    if (this.resultTimeout) { clearTimeout(this.resultTimeout); this.resultTimeout = null; }
    this.phase = 'menu';
    this.screen = 'menu';
    this.ui.showScreen('menu');
    this.ui.setPaused(false);
    this.audio.stopAmbience();
    this.audio.setAmbience('calm');
    this.ui.skillVisible(false);
    this.el.skillCheck.classList.remove('show');
    this.resetInput();
    document.body.classList.remove('killer-mode');
    this.audio.init();
    this.audio.startAmbience();
  }

  setPaused(value) {
    if (this.phase === 'ended' || this.phase === 'menu') return;
    if (value && this.phase === 'playing') {
      this.phase = 'paused';
      this.ui.setPaused(true);
      this.resetInput();
    } else if (!value && this.phase === 'paused') {
      this.phase = 'playing';
      this.ui.setPaused(false);
      this.audio.init();
    }
  }

  cycleSpectate() {
    const candidates = this.survivors.filter(s => s !== this.player && (s.state === 'alive' || s.state === 'downed'));
    if (!candidates.length) { this.spectateTarget = this.killer; return; }
    const idx = candidates.indexOf(this.spectateTarget);
    this.spectateTarget = candidates[(idx + 1) % candidates.length];
    this.ui.toast(`SPECTATING ${this.spectateTarget.name}`, '', 1500);
  }

  getFocus() {
    if (this.role === 'killer') return this.killer;
    const p = this.player;
    if (p && p.state !== 'dead' && p.state !== 'escaped') return p;
    if (this.spectateTarget && this.spectateTarget.state !== 'dead' && this.spectateTarget.state !== 'escaped') return this.spectateTarget;
    const alive = this.survivors.find(s => s.state === 'alive' || s.state === 'downed');
    if (alive) { this.spectateTarget = alive; return alive; }
    return this.killer;
  }

  aliveSurvivors() {
    return this.survivors.filter(s => s.state === 'alive' || s.state === 'downed');
  }

  // ── Simulation ──────────────────────────────────────────────
  update(dt) {
    if (!this.world || this.phase !== 'playing') return;
    this.elapsed += dt;
    this.time -= dt;
    if (this.time <= 0) { this.time = 0; this.endMatch('killer', 'dawn'); return; }
    this.shake = Math.max(0, this.shake - dt * 3.6);

    this.updateKillerTimers(dt);
    if (this.role === 'killer') {
      this.updatePlayerKiller(dt);
      for (const s of this.survivors) if (s.bot) updateBotSurvivor(this, s, dt);
    } else {
      updateAIKiller(this, dt);
      this.updatePlayerSurvivor(dt);
      for (const s of this.survivors) if (s.bot) updateBotSurvivor(this, s, dt);
    }

    this.updateGenerators(dt);
    this.updateParticles(dt);
    this.updateRain(dt);
    this.updateSkill(dt);
    this.updateDanger(dt);
    this.updateInteractionUI();

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = .08;
      this.ui.update(this);
    }
    this.miniTimer -= dt;
    if (this.miniTimer <= 0) {
      this.miniTimer = .13;
      renderMinimap(this);
    }
    this.checkMatchEnd();
    this.consumeEdges();
  }

  updateKillerTimers(dt) {
    const k = this.killer;
    k.attackCd = Math.max(0, k.attackCd - dt);
    k.attackAnim = Math.max(0, k.attackAnim - dt);
    k.lungeTimer = Math.max(0, k.lungeTimer - dt);
    k.lungeCd = Math.max(0, k.lungeCd - dt);
    k.sightTimer = Math.max(0, k.sightTimer - dt);
    k.sightCooldown = Math.max(0, k.sightCooldown - dt);
    if (k.hitPending > 0) {
      k.hitPending -= dt;
      if (k.hitPending <= 0) {
        k.hitPending = 0;
        this.resolveKillerHit();
      }
    }
    if (k.lungeTimer > 0 && Math.random() < dt * 22) this.spawnTrail(k);
  }

  aimAngle(ent, mv) {
    if (this.input.mouseActive && !this.isTouch) {
      const m = this.getWorldMouse();
      return Math.atan2(m.y - ent.y, m.x - ent.x);
    }
    if (mv && mv.mag > .08) return Math.atan2(mv.y, mv.x);
    return ent.aim ?? ent.dir ?? 0;
  }

  updatePlayerSurvivor(dt) {
    const p = this.player;
    if (!p || p.state === 'dead' || p.state === 'escaped') {
      if (this.spectateTarget && (this.spectateTarget.state === 'dead' || this.spectateTarget.state === 'escaped')) this.cycleSpectate();
      return;
    }
    const mv = this.getMoveVector();
    p.aim = this.aimAngle(p, mv);
    p.dir = p.aim;

    if (p.state === 'downed') {
      const beingExecuted = this.killer.execute?.target === p || this.killer.playerAction?.target === p;
      if (beingExecuted) {
        p.sprinting = false;
        p.crouching = false;
        p.moving = false;
        p.vx = 0;
        p.vy = 0;
        return;
      }
      p.downTimer -= dt;
      if (p.downTimer <= 0) { this.eliminateSurvivor(p, 'bled out'); return; }
      p.sprinting = false;
      p.crouching = false;
      if (mv.mag > .05) {
        this.world.moveCircle(p, mv.x * 39 * dt, mv.y * 39 * dt, p.radius);
        p.bob += dt * 6;
        p.moving = true;
        p.vx = mv.x * 39;
        p.vy = mv.y * 39;
      } else { p.moving = false; p.vx = 0; p.vy = 0; }
      this.checkEscape(p);
      return;
    }

    if (p.action) {
      this.updatePlayerAction(p, dt);
      return;
    }

    const target = this.findInteraction(p);
    if (this.input.interactEdge && target) {
      if (target.type === 'drop') this.dropPallet(target.target, p);
      else if (target.type === 'vault') this.startVault(p, target.target);
      else this.startPlayerAction(p, target);
      this.input.interactEdge = false;
      if (p.action) { this.updatePlayerAction(p, 0); return; }
    }

    const wantsCrouch = this.input.keys.has('ControlLeft') || this.input.keys.has('ControlRight') || this.input.keys.has('KeyC');
    const wantsSprint = this.input.keys.has('ShiftLeft') || this.input.keys.has('ShiftRight') || this.input.touchSprint;
    const moving = mv.mag > .04;
    const sprinting = wantsSprint && !wantsCrouch && p.stamina > .5 && moving;
    p.crouching = wantsCrouch && moving;
    p.sprinting = sprinting;
    p.moving = moving;

    let speed = SURVIVOR_SPEED * p.def.speed;
    if (p.crouching) speed = SURVIVOR_CROUCH;
    if (sprinting) speed = SURVIVOR_SPRINT * p.def.speed;
    if (p.injured) speed *= .97;

    if (moving) {
      this.world.moveCircle(p, mv.x * speed * dt, mv.y * speed * dt, p.radius);
      p.vx = mv.x * speed;
      p.vy = mv.y * speed;
      p.bob += dt * (sprinting ? 13 : p.crouching ? 4 : 8.5);
      this.audio.step(sprinting);
      if (sprinting && Math.random() < dt * 3.2) this.spawnDust(p);
      if (sprinting) p.stamina = Math.max(0, p.stamina - 19 * dt);
    } else {
      p.vx = 0; p.vy = 0;
      p.stamina = Math.min(100, p.stamina + 15 * dt);
    }
    if (!sprinting) p.stamina = Math.min(100, p.stamina + 13 * dt);
    this.checkEscape(p);
  }

  updatePlayerKiller(dt) {
    const k = this.killer;
    if (k.stunTimer > 0) {
      k.stunTimer -= dt;
      if (k.stunTimer <= 0) this.ui.toast('RECOVERED', '', 900);
      return;
    }
    const mv = this.getMoveVector();
    k.face = this.aimAngle(k, mv);
    k.dir = k.face;

    if (k.playerAction) {
      this.updateKillerPlayerAction(k, dt);
      return;
    }

    const target = this.findInteraction(k);
    if (this.input.interactEdge && target) {
      this.startKillerPlayerAction(k, target);
      this.input.interactEdge = false;
      if (k.playerAction) { this.updateKillerPlayerAction(k, 0); return; }
    }

    const lunge = k.lungeTimer > 0;
    const speed = k.speed * (lunge ? 1.82 : 1);
    if (mv.mag > .05) {
      this.world.moveCircle(k, mv.x * speed * dt, mv.y * speed * dt, k.radius);
      k.moving = true;
      k.vx = mv.x * speed;
      k.vy = mv.y * speed;
      this.audio.step(false, true);
      if (lunge && Math.random() < dt * 8) this.spawnTrail(k);
    } else {
      k.moving = false;
      k.vx = 0; k.vy = 0;
    }

    if (this.input.attackEdge) {
      this.startKillerAttack();
      this.input.attackEdge = false;
    }
    if (this.input.abilityEdge) {
      this.killerSight();
      this.input.abilityEdge = false;
    }
    if (this.input.dashEdge) {
      this.killerLunge();
      this.input.dashEdge = false;
    }
  }

  // ── Player actions ──────────────────────────────────────────
  startPlayerAction(p, target) {
    let progress = 0;
    if (target.type === 'repair') progress = target.target.progress || 0;
    else if (target.type === 'revive') progress = target.target.reviveProgress || 0;
    else if (target.type === 'gate') progress = target.target.progress || 0;
    else if (target.type === 'heal') progress = p.healProgress || 0;
    p.action = { type: target.type, target: target.target, time: 0, progress, nextSkill: rand(3.7, 6.3) };
    if (target.type === 'repair') this.addRepairer(target.target, p);
    p.path = [];
    this.audio.ui();
  }

  updatePlayerAction(p, dt) {
    const a = p.action;
    if (!a) return;
    if (a.type === 'vault') {
      a.time += dt;
      a.progress = clamp(a.time / .36 * 100, 0, 100);
      if (a.progress >= 100) this.finishVault(p, a.target);
      return;
    }
    if (!this.input.interact) { this.cancelPlayerAction(p); return; }
    const target = a.target;
    a.time += dt;

    if (a.type === 'repair') {
      if (!target || target.done) { this.cancelPlayerAction(p); return; }
      if (dist(p, target) > 88) { this.cancelPlayerAction(p); return; }
      p.aim = Math.atan2(target.y - p.y, target.x - p.x); p.dir = p.aim;
      target.pulse = Math.max(target.pulse, .3);
      if (!this.skillCheck.active) {
        const rate = this.threat.repairRate * p.def.repair;
        target.progress = Math.min(100, target.progress + rate * dt);
        a.progress = target.progress;
        this.stats.repairs += dt;
        if (target.progress >= 100) {
          this.completeGenerator(target, p);
          this.cancelPlayerAction(p);
          return;
        }
      }
      a.nextSkill -= dt;
      if (a.nextSkill <= 0 && !this.skillCheck.active) this.startSkillCheck();
    } else if (a.type === 'revive') {
      if (!target || target.state !== 'downed' || dist(p, target) > 92) { this.cancelPlayerAction(p); return; }
      p.aim = Math.atan2(target.y - p.y, target.x - p.x); p.dir = p.aim;
      a.progress = Math.min(100, a.progress + (100 / 3.5) * p.def.revive * dt);
      target.reviveProgress = a.progress;
      if (a.progress >= 100) {
        this.reviveSurvivor(target, p);
        this.cancelPlayerAction(p);
      }
    } else if (a.type === 'gate') {
      if (!target || target.open || !target.powered || dist(p, target) > 150) { this.cancelPlayerAction(p); return; }
      p.aim = Math.atan2(target.y - p.y, target.x - p.x); p.dir = p.aim;
      a.progress = Math.min(100, a.progress + this.threat.gateRate * dt);
      target.progress = a.progress;
      if (a.progress >= 100) {
        this.openExit(target, p);
        this.cancelPlayerAction(p);
      }
    } else if (a.type === 'heal') {
      if (!p.injured) { this.cancelPlayerAction(p); return; }
      a.progress = Math.min(100, a.progress + (100 / 7.5) * dt);
      p.healProgress = a.progress;
      if (a.progress >= 100) {
        this.healSurvivor(p);
        this.cancelPlayerAction(p);
      }
    } else if (a.type === 'execute') {
      if (!target || target.state !== 'downed' || dist(p, target) > 94) { this.cancelPlayerAction(p); return; }
      p.aim = Math.atan2(target.y - p.y, target.x - p.x); p.dir = p.aim;
      a.progress = Math.min(100, a.progress + (100 / 2.15) * dt);
      if (a.progress >= 100) {
        this.eliminateSurvivor(target, 'sacrificed');
        this.cancelPlayerAction(p);
      }
    } else if (a.type === 'break') {
      if (!target || target.broken || dist(p, target) > 98) { this.cancelPlayerAction(p); return; }
      a.progress = Math.min(100, a.progress + (100 / 1.35) * dt);
      target.breakProgress = a.progress;
      if (a.progress >= 100) {
        this.breakPallet(target);
        this.cancelPlayerAction(p);
      }
    }
  }

  cancelPlayerAction(p) {
    if (!p || !p.action) return;
    if (p.action.type === 'repair' && p.action.target) this.removeRepairer(p.action.target, p);
    if (p.action.type === 'revive' && p.action.target) p.action.target.reviveProgress = 0;
    p.action = null;
    if (this.skillCheck.active) {
      this.skillCheck.active = false;
      this.skillCheck.result = null;
      this.ui.skillVisible(false);
    }
  }

  startKillerPlayerAction(k, target) {
    k.playerAction = { type: target.type, target: target.target, progress: 0, time: 0 };
    this.audio.ui();
  }

  updateKillerPlayerAction(k, dt) {
    const a = k.playerAction;
    if (!a) return;
    if (!this.input.interact) { k.playerAction = null; return; }
    a.time += dt;
    if (a.type === 'execute') {
      if (!a.target || a.target.state !== 'downed' || dist(k, a.target) > 94) { k.playerAction = null; return; }
      k.face = Math.atan2(a.target.y - k.y, a.target.x - k.x);
      a.progress = Math.min(100, a.progress + dt / 2.15 * 100);
      if (a.progress >= 100) {
        this.eliminateSurvivor(a.target, 'sacrificed');
        k.playerAction = null;
      }
    } else if (a.type === 'break') {
      if (!a.target || a.target.broken || dist(k, a.target) > 100) { k.playerAction = null; return; }
      k.face = Math.atan2(a.target.y - k.y, a.target.x - k.x);
      a.progress = Math.min(100, a.progress + dt / 1.35 * 100);
      a.target.breakProgress = a.progress;
      if (a.progress >= 100) {
        this.breakPallet(a.target);
        k.playerAction = null;
      }
    }
  }

  startVault(p, pallet) {
    p.action = { type: 'vault', target: pallet, time: 0, progress: 0 };
    p.path = [];
    this.audio.vault();
  }

  finishVault(p, pallet) {
    let nx = p.x - pallet.x, ny = p.y - pallet.y;
    const d = Math.hypot(nx, ny) || 1;
    nx /= d; ny /= d;
    let tx = pallet.x - nx * 48, ty = pallet.y - ny * 48;
    if (!this.world.isWalkable(tx, ty)) { tx = pallet.x - nx * 32; ty = pallet.y - ny * 32; }
    p.x = clamp(tx, 70, this.world.W - 70);
    p.y = clamp(ty, 70, this.world.H - 70);
    p.action = null;
    p.stamina = Math.max(0, p.stamina - 8);
    this.audio.vault();
    this.spawnDust(p, 4);
  }

  // ── Interaction discovery ───────────────────────────────────
  findInteraction(ent) {
    const cands = [];
    if (ent === this.killer) {
      for (const s of this.survivors) {
        if (s.state !== 'downed') continue;
        const d = dist(ent, s);
        if (d < 90) cands.push({ type: 'execute', target: s, score: d - 70 });
      }
      for (const p of this.pallets) {
        if (!p.dropped || p.broken) continue;
        const d = dist(ent, p);
        if (d < 92) cands.push({ type: 'break', target: p, score: d });
      }
    } else {
      if (ent.state !== 'alive') return null;
      for (const s of this.survivors) {
        if (s === ent || s.state !== 'downed') continue;
        const d = dist(ent, s);
        if (d < 92) cands.push({ type: 'revive', target: s, score: d - 55 });
      }
      for (const g of this.generators) {
        if (g.done) continue;
        const d = dist(ent, g);
        if (d < 86) cands.push({ type: 'repair', target: g, score: d });
      }
      for (const e of this.exits) {
        if (!e.powered || e.open) continue;
        const d = dist(ent, e);
        if (d < 148) cands.push({ type: 'gate', target: e, score: d - 30 });
      }
      for (const p of this.pallets) {
        if (p.broken) continue;
        const d = dist(ent, p);
        if (!p.dropped && d < 78) cands.push({ type: 'drop', target: p, score: d + 18 });
        else if (p.dropped && d < 76) cands.push({ type: 'vault', target: p, score: d + 8 });
      }
      if (ent.injured) cands.push({ type: 'heal', target: null, score: 260 });
    }
    cands.sort((a, b) => a.score - b.score);
    return cands[0] || null;
  }

  updateInteractionUI() {
    for (const g of this.generators) g.highlight = false;
    for (const p of this.pallets) p.highlight = false;
    for (const e of this.exits) e.highlight = false;
    const ent = this.role === 'killer' ? this.killer : this.player;
    if (!ent || ent.state === 'dead' || ent.state === 'escaped') {
      this.ui.updateInteraction({ show: false });
      return;
    }
    if (ent.state === 'downed') {
      this.ui.updateInteraction({ show: false });
      return;
    }
    const action = this.role === 'killer' ? this.killer.playerAction : this.player.action;
    const target = action ? { type: action.type, target: action.target } : this.findInteraction(ent);
    if (!target) {
      this.interactTarget = null;
      this.ui.updateInteraction({ show: false });
      return;
    }
    if (target.target) target.target.highlight = true;
    this.interactTarget = target;
    let label = '', sub = '', bad = false;
    if (target.type === 'repair') { label = 'REPAIR GENERATOR'; sub = 'HOLD E · WATCH FOR SKILL CHECKS'; }
    else if (target.type === 'gate') { label = 'OPEN EXIT GATE'; sub = 'HOLD E · THE GATE IS POWERED'; }
    else if (target.type === 'revive') { label = `REVIVE ${target.target.short}`; sub = 'HOLD E · BRING THEM BACK'; }
    else if (target.type === 'heal') { label = 'BANDAGE WOUND'; sub = 'HOLD E · 7 SECONDS'; }
    else if (target.type === 'execute') { label = `SACRIFICE ${target.target.short}`; sub = 'HOLD E · FEED THE HOLLOW'; bad = true; }
    else if (target.type === 'break') { label = 'BREAK PALLET'; sub = 'HOLD E · CLEAR THE PATH'; bad = true; }
    else if (target.type === 'drop') { label = 'DROP PALLET'; sub = 'PRESS E · STUN THE KILLER'; }
    else if (target.type === 'vault') { label = 'VAULT PALLET'; sub = 'PRESS E · QUICK VAULT'; }
    const progress = action ? (action.progress || 0) / 100 : 0;
    this.ui.updateInteraction({ show: true, label, sub, progress, bad });
  }

  // ── Skill checks ────────────────────────────────────────────
  startSkillCheck() {
    if (this.skillCheck.active) return;
    this.skillCheck.active = true;
    this.skillCheck.angle = 0;
    this.skillCheck.zoneStart = rand(.85, 4.85);
    this.skillCheck.zoneWidth = .55;
    this.skillCheck.speed = 2.85;
    this.skillCheck.result = null;
    this.skillCheck.resultTimer = 0;
    this.ui.skillVisible(true, true);
    if (this.player.action) this.player.action.nextSkill = rand(4.6, 7.6);
    this.audio.tone(660, .08, { type: 'triangle', volume: .035 });
  }

  updateSkill(dt) {
    const sc = this.skillCheck;
    if (!sc.active) return;
    if (sc.result) {
      sc.resultTimer -= dt;
      if (sc.resultTimer <= 0) {
        sc.active = false;
        sc.result = null;
        this.ui.skillVisible(false);
      }
      return;
    }
    if (this.input.skillEdge) {
      this.input.skillEdge = false;
      if (sc.angle >= sc.zoneStart && sc.angle <= sc.zoneStart + sc.zoneWidth) this.skillSuccess();
      else this.skillFail();
      return;
    }
    sc.angle += sc.speed * dt;
    if (sc.angle >= TAU) this.skillFail();
  }

  skillSuccess() {
    const sc = this.skillCheck;
    const action = this.player?.action;
    sc.result = 'good';
    sc.resultTimer = .32;
    this.audio.skillGood();
    if (action?.type === 'repair' && action.target) {
      action.target.progress = Math.min(100, action.target.progress + 8);
      this.sparkAt(action.target.x, action.target.y, 8);
    }
  }

  skillFail() {
    const sc = this.skillCheck;
    if (sc.result) return;
    sc.result = 'bad';
    sc.resultTimer = .42;
    this.audio.skillBad();
    this.shake = Math.max(this.shake, .9);
    const action = this.player?.action;
    if (action?.type === 'repair' && action.target) {
      const gen = action.target;
      gen.progress = Math.max(0, gen.progress - 10);
      this.sparkAt(gen.x, gen.y, 16);
      this.alertKiller(gen.x, gen.y);
      this.removeRepairer(gen, this.player);
      this.player.action = null;
      this.ui.toast('SKILL CHECK FAILED — GENERATOR EXPOSED', 'blood', 2600);
      this.ui.feed('A generator exploded. The Warden heard it.', 'blood');
    }
  }

  // ── World interactions ──────────────────────────────────────
  addRepairer(gen, s) {
    if (!gen || !gen.repairers) return;
    gen.repairers.add(s);
  }
  removeRepairer(gen, s) {
    if (gen?.repairers) gen.repairers.delete(s);
  }

  completeGenerator(gen, finisher) {
    if (!gen || gen.done) return;
    gen.done = true;
    gen.progress = 100;
    gen.pulse = 1;
    gen.repairers?.clear();
    this.completedGens++;
    this.completedGens = Math.min(GENS_REQUIRED, this.completedGens);
    this.audio.genComplete();
    this.sparkAt(gen.x, gen.y, 20);
    this.ui.toast(`GENERATOR ${this.completedGens}/${GENS_REQUIRED} ONLINE`, 'teal', 2400);
    this.ui.feed(`Generator ${this.completedGens}/${GENS_REQUIRED} repaired`, 'teal');
    if (finisher?.isPlayer) this.stats.repairs += 5;
    if (this.completedGens >= GENS_REQUIRED) {
      for (const e of this.exits) e.powered = true;
      this.audio.gatePowered();
      this.ui.toast('EXIT GATES POWERED — GET OUT', 'amber', 4200);
      this.ui.feed('The exit gates are live.', 'amber');
      this.shake = Math.max(this.shake, .35);
    }
  }

  failGeneratorSkill(s, gen, isBot) {
    if (!gen || gen.done) return;
    gen.progress = Math.max(0, gen.progress - 10);
    this.sparkAt(gen.x, gen.y, 13);
    this.alertKiller(gen.x, gen.y);
    if (this.role === 'survivor' && dist(this.player, gen) < 700) this.audio.skillBad();
    if (isBot) this.ui.feed('A generator exploded in the dark.', 'blood');
  }

  dropPallet(p, owner) {
    if (!p || p.dropped || p.broken) return;
    p.dropped = true;
    p.breakProgress = 0;
    const cos = Math.abs(Math.cos(p.angle)), sin = Math.abs(Math.sin(p.angle));
    const aw = p.w * cos + p.h * sin;
    const ah = p.w * sin + p.h * cos;
    this.world.dynamicRects.push({ x: p.x - aw / 2, y: p.y - ah / 2, w: aw, h: ah, type: 'pallet' });
    this.world.rebuildDynamicNav();
    this.audio.palletDrop();
    this.spawnWood(p.x, p.y, 8);
    this.ui.feed('A pallet slammed down.', 'amber');
    if (owner?.isPlayer) this.stats.pallets++;
    if (dist(p, this.killer) < 112 && this.killer.stunTimer <= 0) {
      this.killer.stunTimer = 2.15;
      this.killer.attackAnim = 0;
      this.killer.hitPending = 0;
      this.killer.execute = null;
      this.killer.breakTarget = null;
      this.shake = Math.max(this.shake, .7);
      this.audio.hit();
      if (owner?.isPlayer || this.role === 'killer') {
        this.ui.toast('PALLET STUN', 'amber', 1700);
        this.ui.feed('The Warden is stunned.', 'amber');
      }
      if (owner?.isPlayer) this.stats.stuns++;
    }
  }

  breakPallet(p) {
    if (!p || p.broken) return;
    p.broken = true;
    p.dropped = false;
    p.breakProgress = 100;
    this.world.dynamicRects = this.world.dynamicRects.filter(r => !(Math.abs(r.x + r.w / 2 - p.x) < 55 && Math.abs(r.y + r.h / 2 - p.y) < 55));
    this.world.rebuildDynamicNav();
    this.audio.palletBreak();
    this.spawnWood(p.x, p.y, 14);
    this.ui.feed('The Warden broke a pallet.', 'blood');
    this.shake = Math.max(this.shake, .3);
  }

  openExit(exit, opener) {
    if (!exit || exit.open || !exit.powered) return;
    exit.open = true;
    exit.progress = 100;
    this.audio.gateOpen();
    this.ui.toast('EXIT GATE OPEN', 'teal', 3200);
    this.ui.feed('The gate is open. Run.', 'teal');
    if (opener?.isPlayer) this.stats.gates++;
    this.shake = Math.max(this.shake, .25);
  }

  reviveSurvivor(target, reviver) {
    if (!target || target.state !== 'downed') return;
    target.state = 'alive';
    target.injured = true;
    target.health = 1;
    target.downTimer = 40;
    target.reviveProgress = 0;
    target.path = [];
    target.ai.think = 0;
    this.audio.skillGood();
    this.ui.feed(`${target.name} was revived`, 'teal');
    if (reviver?.isPlayer) {
      this.stats.revives++;
      this.ui.toast(`REVIVED ${target.short}`, 'teal', 1800);
    }
  }

  healSurvivor(s) {
    s.injured = false;
    s.health = 2;
    s.healProgress = 0;
    this.audio.skillGood();
    this.ui.feed(`${s.name} patched up`, 'teal');
    if (s.isPlayer) this.ui.toast('WOUNDS BANDAGED', 'teal', 1600);
  }

  escapeSurvivor(s) {
    if (!s || s.state === 'dead' || s.state === 'escaped') return;
    s.state = 'escaped';
    s.action = null;
    s.reviveProgress = 0;
    this.escapedCount++;
    this.audio.escape();
    this.ui.toast(`${s.short} ESCAPED THE HOLLOW`, 'teal', 3000);
    this.ui.feed(`${s.name} reached the gate.`, 'teal');
    if (s.isPlayer) this.stats.escapes = 1;
    if (this.killer.target === s) this.killer.target = null;
    this.checkMatchEnd();
  }

  checkEscape(s) {
    if (!s || s.state !== 'alive') return;
    for (const e of this.exits) {
      if (e.open && dist(s, e) < 62) { this.escapeSurvivor(s); return; }
    }
  }

  // ── Combat ──────────────────────────────────────────────────
  startKillerAttack() {
    const k = this.killer;
    if (k.attackCd > 0 || k.stunTimer > 0) return;
    k.attackCd = this.threat.attackCd;
    k.attackAnim = .34;
    k.hitPending = .1;
    this.audio.swing();
  }

  resolveKillerHit() {
    const k = this.killer;
    if (k.stunTimer > 0) return;
    let hit = null, best = Infinity;
    for (const s of this.survivors) {
      if (s.state !== 'alive') continue;
      const d = dist(k, s);
      if (d > 98) continue;
      const a = Math.atan2(s.y - k.y, s.x - k.x);
      if (this.angleBetween(k.face, a) > 1.05) continue;
      if (d < best) { best = d; hit = s; }
    }
    if (hit) {
      this.hitSurvivor(hit);
      return;
    }
    for (const p of this.pallets) {
      if (!p.dropped || p.broken) continue;
      const d = dist(k, p);
      if (d < 105 && this.angleBetween(k.face, Math.atan2(p.y - k.y, p.x - k.x)) < .9) {
        p.breakProgress = Math.min(100, (p.breakProgress || 0) + 55);
        this.spawnWood(p.x, p.y, 7);
        if (p.breakProgress >= 100) this.breakPallet(p);
        this.audio.palletBreak();
        break;
      }
    }
  }

  angleBetween(a, b) {
    let d = (a - b + Math.PI) % TAU;
    if (d < 0) d += TAU;
    return Math.abs(d - Math.PI);
  }

  hitSurvivor(s) {
    if (!s || s.state !== 'alive') return;
    const k = this.killer;
    this.audio.hit();
    if (this.role === 'killer') this.stats.hits++;
    this.spawnBlood(s.x, s.y, s.injured ? 18 : 10);
    this.shake = Math.max(this.shake, s === this.player ? .95 : .45);
    if (!s.injured) {
      s.injured = true;
      s.health = 1;
      s.path = [];
      s.ai.think = 0;
      s.ai.state = 'flee';
      this.audio.scream();
      this.ui.feed(`${s.name} is injured`, 'blood');
      if (s === this.player) this.ui.toast("YOU'RE HURT — BREAK LINE OF SIGHT", 'blood', 2600);
      if (s.isPlayer) this.shake = 1;
    } else {
      this.downSurvivor(s);
      return;
    }
    if (k.target === s) k.lastSeen = this.time;
  }

  downSurvivor(s) {
    if (!s || s.state !== 'alive') return;
    s.state = 'downed';
    s.health = 0;
    s.injured = true;
    s.downTimer = 40;
    s.reviveProgress = 0;
    s.action = null;
    s.path = [];
    s.ai.think = 0;
    this.audio.down();
    this.spawnBlood(s.x, s.y, 26);
    this.shake = Math.max(this.shake, s === this.player ? 1.1 : .65);
    this.ui.toast(`${s.short} IS DOWN`, 'blood', 2600);
    this.ui.feed(`${s.name} was downed`, 'blood');
    if (this.role === 'killer') this.stats.downs++;
  }

  eliminateSurvivor(s, reason) {
    if (!s || s.state === 'dead') return;
    if (s.state === 'escaped') return;
    if (s.action?.type === 'repair') this.removeRepairer(s.action.target, s);
    s.state = 'dead';
    s.action = null;
    s.downed = false;
    s.reviveProgress = 0;
    this.deadCount++;
    this.audio.death();
    this.spawnBlood(s.x, s.y, 36);
    this.ui.toast(`${s.short} WAS SACRIFICED`, 'blood', 2800);
    this.ui.feed(`${s.name} ${reason === 'bled out' ? 'bled out' : 'was sacrificed'}`, 'blood');
    if (this.killer.target === s) { this.killer.target = null; this.killer.execute = null; }
    if (s === this.player) {
      this.ui.toast('YOU DIED — THE HOLLOW REMEMBERS', 'blood', 4000);
      this.cycleSpectate();
    }
    this.checkMatchEnd();
  }

  killerAttack() {
    this.startKillerAttack();
  }

  killerLunge() {
    const k = this.killer;
    if (k.lungeCd > 0 || k.stunTimer > 0) return;
    k.lungeTimer = .34;
    k.lungeCd = 4.2;
    this.audio.swing();
    this.spawnTrail(k);
  }

  killerSight() {
    const k = this.killer;
    if (k.sightCooldown > 0 || k.stunTimer > 0) return;
    k.sightTimer = 4.5;
    k.sightCooldown = 22;
    this.audio.sight();
    this.ui.toast('VEIL SIGHT', 'blood', 1800);
  }

  // ── Effects ─────────────────────────────────────────────────
  addParticle(p) {
    if (!p || this.particles.length > 420) return;
    p.maxLife = p.life;
    p.rot = p.rot ?? rand(0, TAU);
    this.particles.push(p);
  }

  spawnDust(s, count = 1) {
    for (let i = 0; i < count; i++) {
      this.addParticle({
        x: s.x + rand(-6, 6), y: s.y + rand(-4, 6),
        vx: rand(-12, 12), vy: rand(-8, 8), life: rand(.35, .8),
        size: rand(2, 5), color: 'rgba(104,114,98,.24)', kind: 'dust'
      });
    }
  }

  spawnBlood(x, y, count = 10) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), sp = rand(18, 110);
      this.addParticle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(.55, 1.4), size: rand(1.1, 3.6),
        color: Math.random() > .3 ? 'rgba(113,20,17,.78)' : 'rgba(167,43,33,.72)', kind: 'blood'
      });
    }
  }

  spawnWood(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), sp = rand(30, 130);
      this.addParticle({
        x: x + rand(-14, 14), y: y + rand(-8, 8), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(.4, 1), size: rand(1, 2.8), color: Math.random() > .5 ? 'rgba(122,94,55,.85)' : 'rgba(84,65,40,.9)', kind: 'spark', front: true
      });
    }
  }

  sparkAt(x, y, count = 6) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), sp = rand(30, 150);
      this.addParticle({
        x: x + rand(-6, 6), y: y + rand(-6, 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        life: rand(.25, .8), size: rand(.8, 2), color: Math.random() > .4 ? 'rgba(242,190,105,.95)' : 'rgba(255,230,170,.9)', kind: 'spark', front: true
      });
    }
  }

  spawnTrail(k) {
    this.addParticle({
      x: k.x + rand(-10, 10), y: k.y + rand(-10, 10),
      vx: rand(-15, 15), vy: rand(-15, 15), life: rand(.25, .55), size: rand(6, 14),
      color: 'rgba(134,31,26,.22)', kind: 'mist', front: false
    });
  }

  alertKiller(x, y) {
    const k = this.killer;
    if (!k || this.role === 'killer') return;
    k.lastPos = { x, y };
    k.lastSeen = Math.max(k.lastSeen || -99, this.time - 1.5);
    if (!k.target) {
      k.aiPatrol = { x, y };
      k.aiPatrolUntil = this.time + 8;
    }
  }

  updateGenerators(dt) {
    for (const g of this.generators) {
      g.pulse = Math.max(0, (g.pulse || 0) - dt * 2.1);
      if (g.done && Math.random() < dt * .7) {
        this.addParticle({
          x: g.x + rand(-16, 16), y: g.y - 26, vx: rand(-5, 5), vy: rand(-22, -8),
          life: rand(.7, 1.5), size: rand(.8, 1.8), color: 'rgba(126,226,203,.55)', kind: 'spark', front: true
        });
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - Math.min(.9, dt * 2.4);
      p.vy *= 1 - Math.min(.9, dt * 2.4);
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  updateRain(dt) {
    const need = this.viewW < 620 ? 65 : 130;
    while (this.rain.length < need) {
      this.rain.push({
        x: rand(0, this.viewW), y: rand(0, this.viewH),
        len: rand(5, 14), speed: rand(360, 760)
      });
    }
    for (const r of this.rain) {
      r.y += r.speed * dt;
      r.x -= r.speed * .14 * dt;
      if (r.y > this.viewH + 20) { r.y = -20; r.x = rand(0, this.viewW + 100); }
      if (r.x < -20) r.x = this.viewW + 20;
    }
  }

  updateDanger(dt) {
    const focus = this.getFocus();
    const k = this.killer;
    let danger = 0;
    if (this.role === 'survivor' && focus && focus !== k && focus.state !== 'dead' && focus.state !== 'escaped') {
      const d = dist(focus, k);
      danger = clamp((940 - d) / 680, 0, 1);
      if (danger > .25 && this.world.lineClear(focus.x, focus.y, k.x, k.y, true)) danger = Math.min(1, danger + .12);
      if (focus === this.player && focus.injured) danger = Math.min(1, danger + .05);
    }
    this.danger = danger;
    this.el.dangerFrame.style.setProperty('--danger', danger.toFixed(3));

    if (this.role === 'survivor' && this.phase === 'playing') {
      if (danger > .15) {
        this.heartTimer = (this.heartTimer || 0) - dt;
        if (this.heartTimer <= 0) {
          this.audio.heartbeat(danger);
          this.heartTimer = 1.32 - danger * .78;
        }
      } else this.heartTimer = 0;
    }
    const mode = danger > .55 || (this.role === 'killer' && k.target) ? 'chase' : 'calm';
    if (mode !== this.ambientMode) {
      this.ambientMode = mode;
      this.audio.setAmbience(mode);
    }
  }

  checkMatchEnd() {
    if (this.phase !== 'playing' || !this.survivors) return;
    const alive = this.aliveSurvivors().length;
    const escaped = this.survivors.filter(s => s.state === 'escaped').length;
    if (this.role === 'killer') {
      if (escaped > 0) { this.endMatch('survivor', 'gate'); return; }
      if (alive === 0) this.endMatch('killer', 'fed');
      return;
    }
    if (this.player.state === 'escaped') { this.endMatch('survivor', 'escaped'); return; }
    if (this.player.state === 'dead' && escaped > 0) { this.endMatch('survivor', 'team'); return; }
    if (alive === 0) {
      this.endMatch(escaped > 0 ? 'survivor' : 'killer', escaped > 0 ? 'team' : 'dead');
    }
  }

  updateSurvivorBleed(s, dt) {
    if (!s || s.state !== 'downed') return;
    s.downTimer -= dt;
    if (s.downTimer <= 0) this.eliminateSurvivor(s, 'bled out');
  }

  // ── Results ─────────────────────────────────────────────────
  endMatch(outcome, reason) {
    if (this.phase === 'ended' || this.phase === 'menu') return;
    this.phase = 'ended';
    this.resultOutcome = outcome;
    this.resetInput();
    this.skillCheck.active = false;
    this.ui.skillVisible(false);
    this.ui.setPaused(false);
    this.audio.stopAmbience();
    if (outcome === 'survivor') this.audio.survivorWin(); else this.audio.killerWin();
    this.ui.toast(outcome === 'survivor' ? 'THE GATE IS OPEN' : 'THE HOLLOW IS FED', outcome === 'survivor' ? 'teal' : 'blood', 2200);
    this.resultTimeout = setTimeout(() => this.showResults(outcome, reason), 1450);
  }

  showResults(outcome, reason) {
    const playerWon = this.role === 'survivor' ? outcome === 'survivor' : outcome === 'killer';
    let title, sub, kicker;
    const p = this.player;
    const escaped = p.state === 'escaped';
    if (this.role === 'survivor') {
      if (playerWon) {
        title = escaped ? 'ESCAPED' : 'THEY MADE IT OUT';
        sub = escaped
          ? 'The gate closes behind you. The pines keep their secrets — for now.'
          : 'Your team crossed the boundary. The Hollow will remember the ones it lost.';
        kicker = 'THE NIGHT IS OVER · SURVIVORS';
      } else {
        title = reason === 'dawn' ? 'THE NIGHT ENDED' : 'LOST TO THE PINES';
        sub = reason === 'dawn'
          ? 'Dawn never came. The reserve closed its teeth around the last of you.'
          : 'The Warden fed the Hollow. No one left Blackthorn alive.';
        kicker = 'THE NIGHT IS OVER · KILLER';
      }
    } else {
      if (playerWon) {
        title = 'THE HOLLOW FED';
        sub = 'Four souls entered the reserve. None reached the boundary. The pines are quiet again.';
        kicker = 'THE NIGHT IS OVER · KILLER';
      } else {
        title = 'THE GATE OPENED';
        sub = 'One of them slipped through the dark. The Hollow does not forgive negligence.';
        kicker = 'THE NIGHT IS OVER · SURVIVORS';
      }
    }
    if (this.time <= 0 && outcome === 'killer' && this.role === 'survivor') {
      title = 'THE NIGHT ENDED';
      sub = 'The Hollow does not wait for dawn. It simply closes.';
    }

    let score;
    if (this.role === 'survivor') {
      score = Math.round(this.completedGens * 720 + this.stats.revives * 260 + (escaped ? 2500 : 0) + this.stats.repairs * 4 + (playerWon ? 1000 : 0));
    } else {
      score = Math.round(this.stats.downs * 620 + this.deadCount * 820 + (playerWon ? 2200 : 0) + this.completedGens * 40);
    }
    const stats = this.role === 'survivor' ? [
      { value: fmtTime(this.elapsed), label: 'TIME SURVIVED' },
      { value: `${this.completedGens}/5`, label: 'GENERATORS' },
      { value: `${this.stats.revives}`, label: 'REVIVES' },
      { value: `${score.toLocaleString()}`, label: 'SCORE' }
    ] : [
      { value: `${this.deadCount}/4`, label: 'SACRIFICED' },
      { value: `${this.stats.downs}`, label: 'DOWNS' },
      { value: `${this.completedGens}/5`, label: 'GENERATORS' },
      { value: `${score.toLocaleString()}`, label: 'SCORE' }
    ];
    const roster = this.survivors.map(s => ({
      name: s.short,
      dead: s.state === 'dead',
      state: s.state === 'dead' ? 'SACRIFICED' : s.state === 'escaped' ? 'ESCAPED' : s.state === 'downed' ? 'DOWNED' : 'ALIVE'
    }));
    this.screen = 'result';
    this.ui.showResult({ title, sub, kicker, outcome, stats, roster });
  }
}

const game = new HollowGame();
window.__hollow = game;
