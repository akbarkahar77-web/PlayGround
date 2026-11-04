// THE HOLLOW — DOM HUD and menu presentation
import { fmtTime, clamp } from './config.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

export class HudUI {
  constructor(game) {
    this.g = game;
    this.screen = 'menu';
    this.teamRows = [];
    this.genPips = [];
    this.el = {
      app: $('#app'), menu: $('#menuScreen'), game: $('#gameScreen'), result: $('#resultScreen'),
      genPips: $('#genPips'), objectiveText: $('#objectiveText'), objectiveCount: $('#objectiveCount'),
      matchTimer: $('#matchTimer'), teamPanel: $('#teamPanel'), sideList: $('#sideList'), roleTag: $('#roleTag'),
      threatMeter: $('#threatMeter'), threatText: $('#threatText'),
      interaction: $('#interaction'), interactionCircle: $('#interactionCircle'),
      interactionText: $('#interactionText'), interactionSub: $('#interactionSub'), interactionKey: $('#interactionKey'),
      skillCheck: $('#skillCheck'), skillCanvas: $('#skillCanvas'), touchSkill: $('#touchSkill'),
      playerCard: $('#playerCard'), playerPortrait: $('#playerPortrait'), playerName: $('#playerName'),
      playerRole: $('#playerRole'), healthPips: $('#healthPips'), staminaBar: $('#staminaBar'),
      playerStatus: $('#playerStatus'), abilityCard: $('#abilityCard'), abilityState: $('#abilityState'),
      abilityBar: $('#abilityBar'), miniCanvas: $('#miniMap'), miniSector: $('#miniSector'),
      toastStack: $('#toastStack'), eventFeed: $('#eventFeed'),
      spectate: $('#spectateBanner'), spectateName: $('#spectateName'),
      downed: $('#downedOverlay'), bleedTimer: $('#bleedTimer'),
      pause: $('#pauseOverlay'), dangerFrame: $('#dangerFrame'),
      touchUI: $('#touchUI'), touchAction: $('#touchAction'), touchAbility: $('#touchAbility'),
      touchSprint: $('#touchSprint'), joystick: $('#joystick'), joystickKnob: $('#joystickKnob'),
      crosshair: $('#crosshair'),
      resultKicker: $('#resultKicker'), resultTitle: $('#resultTitle'), resultSub: $('#resultSub'),
      resultStats: $('#resultStats'), resultRoster: $('#resultRoster'),
      soundBtns: $$('#menuSoundBtn, #gameSoundBtn'),
      staminaLabel: $('.stamina-wrap span')
    };
    this.initials = {};
  }

  showScreen(name) {
    this.screen = name;
    this.el.menu.classList.toggle('active', name === 'menu');
    this.el.game.classList.toggle('active', name === 'game');
    this.el.result.classList.toggle('active', name === 'result');
    this.el.app.dataset.screen = name;
  }

  setMuted(muted) {
    document.body.classList.toggle('muted', muted);
    for (const b of this.el.soundBtns) b.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }

  setRole(role) {
    document.body.classList.toggle('killer-mode', role === 'killer');
    this.el.roleTag.textContent = role === 'killer' ? 'KILLER' : 'SURVIVOR';
    this.el.crosshair.classList.toggle('killer', role === 'killer');
    this.el.abilityCard.classList.toggle('show', role === 'killer');
    this.el.touchAbility.style.display = role === 'killer' ? '' : 'none';
    if (this.el.staminaLabel) this.el.staminaLabel.textContent = role === 'killer' ? 'FERVOR' : 'STAMINA';
    const b = this.el.touchAction?.querySelector('b');
    if (b) b.textContent = role === 'killer' ? 'RAKE' : 'USE';
  }

  buildMatch(g) {
    for (const s of this.el.toastStack.children) s.remove?.();
    this.el.toastStack.innerHTML = '';
    this.el.eventFeed.innerHTML = '';
    this.el.interaction.classList.remove('show');
    this.el.skillCheck.classList.remove('show');
    this.el.touchSkill.classList.remove('show');
    this.el.spectate.classList.remove('show');
    this.el.downed.classList.remove('show');
    this.el.pause.classList.remove('show');
    this.el.matchTimer.classList.remove('danger');
    this.setRole(g.role);

    // Generator pips
    this.el.genPips.innerHTML = '';
    this.genPips = [];
    for (let i = 0; i < 5; i++) {
      const pip = document.createElement('i');
      this.el.genPips.appendChild(pip);
      this.genPips.push(pip);
    }

    // Roster
    this.el.teamPanel.innerHTML = '';
    this.teamRows = [];
    for (const s of g.survivors) {
      const row = document.createElement('div');
      row.className = 'team-row';
      row.innerHTML = `
        <div class="team-portrait" style="--skin:${s.def.skin};--shirt:${s.def.shirt};--hat:${s.def.hat}"><i class="hat"></i></div>
        <div class="team-meta">
          <div class="team-name">${s.name}</div>
          <div class="team-job">${s.job}</div>
          <div class="team-hp"><i class="on"></i><i class="on"></i></div>
        </div>
        <div class="team-state">HIDDEN</div>`;
      this.el.teamPanel.appendChild(row);
      this.teamRows.push({
        row, portrait: row.querySelector('.team-portrait'), state: row.querySelector('.team-state'),
        hp: [...row.querySelectorAll('.team-hp i')]
      });
    }

    // Player card
    if (g.role === 'survivor') {
      const p = g.player;
      this.el.playerPortrait.style.setProperty('--skin', p.def.skin);
      this.el.playerPortrait.style.setProperty('--shirt', p.def.shirt);
      this.el.playerPortrait.style.setProperty('--hat', p.def.hat);
      this.el.playerName.textContent = p.name;
      this.el.playerRole.textContent = p.job;
      this.el.healthPips.innerHTML = '<i class="on"></i><i class="on"></i>';
      this.el.playerCard.classList.remove('warden-card');
    } else {
      this.el.playerPortrait.style.setProperty('--skin', '#d8d1bd');
      this.el.playerPortrait.style.setProperty('--shirt', '#171e1c');
      this.el.playerPortrait.style.setProperty('--hat', '#3a3b31');
      this.el.playerName.textContent = 'THE WARDEN';
      this.el.playerRole.textContent = 'KILLER';
      this.el.healthPips.innerHTML = '';
      this.el.playerCard.classList.add('warden-card');
    }

    this.el.interactionCircle.style.setProperty('--p', 0);
    this.el.miniSector.textContent = 'N-07';
    this.el.matchTimer.textContent = fmtTime(g.time);
    this.update(g);
  }

  update(g) {
    if (!g.world || this.screen !== 'game') return;
    const role = g.role;
    const alive = g.survivors.filter(s => s.state === 'alive' || s.state === 'downed').length;
    const completed = g.completedGens;
    const openExit = g.exits.some(e => e.open);
    const escaped = g.survivors.filter(s => s.state === 'escaped').length;

    // Objective
    if (role === 'survivor') {
      if (completed < 5) {
        this.el.objectiveText.textContent = escaped > 0 ? 'GET TO AN OPEN GATE' : 'REPAIR GENERATORS';
        this.el.objectiveCount.textContent = `${completed} / 5`;
      } else if (!openExit) {
        this.el.objectiveText.textContent = 'OPEN AN EXIT GATE';
        this.el.objectiveCount.textContent = 'POWERED';
      } else {
        this.el.objectiveText.textContent = 'ESCAPE THE HOLLOW';
        this.el.objectiveCount.textContent = 'GO';
      }
    } else {
      if (escaped > 0) {
        this.el.objectiveText.textContent = 'THE GATE HAS OPENED';
        this.el.objectiveCount.textContent = 'FAILURE';
      } else if (alive > 0) {
        this.el.objectiveText.textContent = g.completedGens >= 5 ? 'GUARD THE EXIT GATES' : 'HUNT THE SURVIVORS';
        this.el.objectiveCount.textContent = `${alive} REMAIN`;
      } else {
        this.el.objectiveText.textContent = 'THE HOLLOW IS FED';
        this.el.objectiveCount.textContent = 'VICTORY';
      }
    }
    for (let i = 0; i < this.genPips.length; i++) {
      this.genPips[i].classList.toggle('done', i < completed);
      this.genPips[i].style.setProperty('--p', i < completed ? 1 : 0);
    }

    // Roster
    for (let i = 0; i < g.survivors.length; i++) {
      const s = g.survivors[i], r = this.teamRows[i];
      if (!r) continue;
      r.row.classList.toggle('is-you', s === g.player);
      r.row.classList.toggle('is-dead', s.state === 'dead');
      r.row.classList.toggle('is-down', s.state === 'downed');
      r.row.classList.toggle('is-escaped', s.state === 'escaped');
      r.portrait.style.setProperty('--skin', s.def.skin);
      r.portrait.style.setProperty('--shirt', s.def.shirt);
      r.portrait.style.setProperty('--hat', s.def.hat);
      let status = 'HIDDEN';
      let cls = '';
      if (s.state === 'dead') { status = 'SACRIFICED'; cls = 'bad'; }
      else if (s.state === 'escaped') { status = 'ESCAPED'; cls = ''; }
      else if (s.state === 'downed') { status = 'DOWNED'; cls = 'bad'; }
      else if (s.action?.type === 'repair') { status = 'REPAIR'; cls = 'warn'; }
      else if (s.action?.type === 'gate') { status = 'OPENING'; cls = 'warn'; }
      else if (s.action?.type === 'revive') { status = 'REVIVING'; cls = ''; }
      else if (s.ai?.state === 'flee') { status = 'FLEEING'; cls = 'bad'; }
      else if (Math.hypot(s.x - g.killer.x, s.y - g.killer.y) < 440) { status = 'HIDING'; cls = 'warn'; }
      else if (s.ai?.state === 'repair' || s.ai?.state === 'gate') { status = 'MOVING'; cls = ''; }
      r.state.textContent = status;
      r.state.className = 'team-state ' + cls;
      const hp = s.state === 'dead' || s.state === 'downed' ? 0 : s.injured ? 1 : 2;
      r.hp.forEach((el, j) => {
        el.className = j < hp ? (s.injured && j === 0 ? 'hurt' : 'on') : '';
      });
    }

    // Side notes
    let items = '';
    if (role === 'survivor') {
      items += `<div class="side-item ${completed >= 5 ? 'done' : ''}"><i></i>Power the reserve <b>${completed}/5</b></div>`;
      items += `<div class="side-item ${openExit ? 'done' : completed >= 5 ? 'alert' : ''}"><i></i>Open an exit gate</div>`;
      items += `<div class="side-item ${escaped > 0 ? 'done' : ''}"><i></i>Survive until dawn</div>`;
      if (g.danger > .48) items += `<div class="side-item alert"><i></i>THE WARDEN IS CLOSE</div>`;
      else if (g.completedGens < 5) items += `<div class="side-item"><i></i>${5 - completed} generator${5 - completed === 1 ? '' : 's'} remaining</div>`;
      else if (!openExit) items += `<div class="side-item"><i></i>Find a gate. Hold to open.</div>`;
      else items += `<div class="side-item"><i></i>Run. Do not look back.</div>`;
    } else {
      items += `<div class="side-item ${g.completedGens >= 5 ? 'alert' : ''}"><i></i>Stop the generators <b>${completed}/5</b></div>`;
      items += `<div class="side-item ${g.survivors.some(s => s.state === 'downed') ? 'alert' : ''}"><i></i>Sacrifice the fallen</div>`;
      items += `<div class="side-item ${escaped > 0 ? 'alert' : ''}"><i></i>Guard the gates</div>`;
      items += `<div class="side-item"><i></i>${alive} still breathing</div>`;
    }
    this.el.sideList.innerHTML = items;

    // Threat / terror
    const threatLabel = this.el.threatMeter.querySelector('.threat-copy span');
    if (role === 'survivor') {
      if (g.player.state === 'dead') {
        this.el.threatText.textContent = 'SILENT';
      } else {
        const d = g.danger;
        this.el.threatText.textContent = d > .68 ? 'UPON YOU' : d > .42 ? 'CLOSE' : d > .17 ? 'NEARBY' : 'DISTANT';
      }
      threatLabel.textContent = 'TERROR';
      this.el.threatMeter.classList.toggle('hot', g.danger > .38);
    } else {
      this.el.threatText.textContent = g.killer.target ? 'PURSUING' : 'PATROLLING';
      threatLabel.textContent = 'HUNT';
      this.el.threatMeter.classList.toggle('hot', !!g.killer.target);
    }

    // Timer
    this.el.matchTimer.textContent = fmtTime(g.time);
    this.el.matchTimer.classList.toggle('danger', g.time < 61);

    // Player card
    if (role === 'survivor') {
      const p = g.player;
      const hp = p.state === 'downed' || p.state === 'dead' ? 0 : p.injured ? 1 : 2;
      const pips = this.el.healthPips.children;
      for (let i = 0; i < pips.length; i++) pips[i].className = i < hp ? (p.injured && i === 0 ? 'hurt' : 'on') : '';
      const st = clamp(p.stamina, 0, 100) / 100;
      this.el.staminaBar.style.transform = `scaleX(${st})`;
      let status = 'HEALTHY · UNSEEN';
      let cls = '';
      if (p.state === 'downed') { status = `DOWNED · ${Math.ceil(p.downTimer)}s`; cls = 'injured'; }
      else if (p.state === 'dead') { status = 'LOST TO THE HOLLOW'; cls = 'injured'; }
      else if (p.action?.type === 'repair') { status = 'REPAIRING · KEEP WATCH'; cls = 'hidden'; }
      else if (p.action?.type === 'gate') { status = 'OPENING THE GATE'; cls = 'hidden'; }
      else if (p.action?.type === 'revive') { status = 'REVIVING AN ALLY'; cls = 'hidden'; }
      else if (p.injured) { status = g.danger > .4 ? 'INJURED · RUN' : 'INJURED · EXPOSED'; cls = 'injured'; }
      else if (p.crouching) { status = 'CROUCHED · QUIET'; cls = 'hidden'; }
      else if (p.sprinting) { status = 'SPRINTING · NOISY'; cls = 'injured'; }
      else if (g.danger > .42) { status = 'HIDE · IT IS NEAR'; cls = 'injured'; }
      this.el.playerStatus.textContent = status;
      this.el.playerStatus.className = 'status-line ' + cls;
    } else {
      this.el.staminaBar.style.transform = 'scaleX(1)';
      const state = g.killer.target ? 'PURSUING PREY' : g.completedGens >= 5 ? 'GUARDING GATES' : 'STALKING THE PINES';
      this.el.playerStatus.textContent = state;
      this.el.playerStatus.className = 'status-line hidden';
    }

    // Ability
    if (role === 'killer') {
      const ready = g.killer.sightCooldown <= 0;
      this.el.abilityState.textContent = ready ? 'READY' : `${Math.ceil(g.killer.sightCooldown)}s`;
      this.el.abilityBar.style.width = `${clamp(100 - (g.killer.sightCooldown / 22) * 100, 0, 100)}%`;
    }

    // Downed overlay
    if (role === 'survivor' && g.player.state === 'downed') {
      this.el.downed.classList.add('show');
      this.el.bleedTimer.textContent = Math.max(0, Math.ceil(g.player.downTimer));
    } else this.el.downed.classList.remove('show');

    // Spectating
    if (role === 'survivor' && g.player.state === 'dead' && g.phase === 'playing') {
      this.el.spectate.classList.add('show');
      this.el.spectateName.textContent = g.spectateTarget ? `SPECTATING ${g.spectateTarget.name}` : 'THE HOLLOW WATCHES';
    } else this.el.spectate.classList.remove('show');

    // Health bar color for Warden
    this.el.playerCard.classList.toggle('warden-card', role === 'killer');
  }

  updateInteraction(data) {
    if (!data || !data.show) {
      this.el.interaction.classList.remove('show');
      return;
    }
    this.el.interaction.classList.add('show');
    this.el.interaction.classList.toggle('bad', !!data.bad);
    this.el.interactionText.textContent = data.label;
    this.el.interactionSub.textContent = data.sub;
    this.el.interactionKey.textContent = data.key || 'E';
    this.el.interactionCircle.style.setProperty('--p', clamp(data.progress || 0, 0, 1));
  }

  skillVisible(visible, active = false) {
    this.el.skillCheck.classList.toggle('show', visible);
    this.el.touchSkill.classList.toggle('show', visible && active);
  }

  toast(text, kind = '', life = 2600) {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    this.el.toastStack.appendChild(el);
    while (this.el.toastStack.children.length > 3) this.el.toastStack.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 420);
    }, life);
  }

  feed(text, kind = '') {
    const el = document.createElement('div');
    el.className = 'feed-entry ' + kind;
    el.innerHTML = `<i></i><span>${text}</span>`;
    this.el.eventFeed.appendChild(el);
    while (this.el.eventFeed.children.length > 5) this.el.eventFeed.firstElementChild.remove();
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 700); }, 6500);
  }

  clearMessages() {
    this.el.toastStack.innerHTML = '';
    this.el.eventFeed.innerHTML = '';
  }

  showResult(data) {
    this.el.resultKicker.textContent = data.kicker;
    this.el.resultTitle.textContent = data.title;
    this.el.resultTitle.className = data.outcome === 'killer' ? 'blood' : 'teal';
    this.el.resultSub.textContent = data.sub;
    this.el.resultStats.innerHTML = data.stats.map(s => `<div class="result-stat"><b>${s.value}</b><span>${s.label}</span></div>`).join('');
    this.el.resultRoster.innerHTML = data.roster.map(s => `
      <div class="result-person ${s.dead ? 'dead' : ''}">
        <span class="rp-dot"></span>
        <b>${s.name}</b>
        <span>${s.state}</span>
      </div>`).join('');
    this.showScreen('result');
    document.body.classList.remove('touch-active');
  }

  setPaused(paused) {
    this.el.pause.classList.toggle('show', paused);
  }
}
