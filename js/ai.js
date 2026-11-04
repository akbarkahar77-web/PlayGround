// THE HOLLOW — survivor and killer AI
import { clamp, dist, rand, TAU, angleDiff } from './config.js';

function moveToward(g, ent, tx, ty, dt, speed) {
  const dx = tx - ent.x, dy = ty - ent.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return 0;
  const step = Math.min(speed * dt, d);
  ent.x += dx / d * step;
  ent.y += dy / d * step;
  return step;
}

function followPath(g, s, dt, speed) {
  if (!s.path || s.path.length === 0) return false;
  let target = s.path[0];
  let d = Math.hypot(target.x - s.x, target.y - s.y);
  while (d < 18 && s.path.length > 1) {
    s.path.shift();
    target = s.path[0];
    d = Math.hypot(target.x - s.x, target.y - s.y);
  }
  if (s.path.length === 1 && d < 15) { s.path.length = 0; return false; }
  const dx = (target.x - s.x) / (d || 1);
  const dy = (target.y - s.y) / (d || 1);
  g.world.moveCircle(s, dx * speed * dt, dy * speed * dt, s.radius);
  s.dir = Math.atan2(dy, dx);
  s.moving = true;
  return true;
}

function setPath(g, s, x, y) {
  const path = g.world.findPath(s.x, s.y, x, y);
  s.path = path || [];
  s.pathTarget = { x, y };
  s.pathTimer = 1.25 + rand(0, .25);
}

function nearestAlly(g, s, includeDowned = true) {
  let best = null, bestD = Infinity;
  for (const o of g.survivors) {
    if (o === s || o.state === 'dead' || o.state === 'escaped') continue;
    if (!includeDowned && o.state === 'downed') continue;
    const d = dist(s, o);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

function nearestDownedAlly(g, s, maxDist = 1200) {
  let best = null, bestD = maxDist;
  for (const o of g.survivors) {
    if (o === s || o.state !== 'downed') continue;
    const d = dist(s, o);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

function chooseFleePoint(g, s) {
  const k = g.killer;
  const away = Math.atan2(s.y - k.y, s.x - k.x);
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 9; i++) {
    const a = away + (i === 0 ? 0 : (rand(-1, 1) * .9));
    const distance = 280 + rand(0, 260);
    const x = clamp(s.x + Math.cos(a) * distance, 100, g.world.W - 100);
    const y = clamp(s.y + Math.sin(a) * distance, 100, g.world.H - 100);
    if (!g.world.isWalkable(x, y)) continue;
    const score = Math.hypot(x - k.x, y - k.y) + (g.world.lineClear(x, y, k.x, k.y) ? -80 : 40);
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  if (!best) {
    // Run toward the nearest corner.
    best = { x: s.x < g.world.W / 2 ? 130 : g.world.W - 130, y: s.y < g.world.H / 2 ? 130 : g.world.H - 130 };
  }
  return best;
}

function cancelAction(g, s, reason = '') {
  if (!s.action) return;
  if (s.action.type === 'repair' && s.action.target) g.removeRepairer(s.action.target, s);
  s.action = null;
}

function startAction(g, s, type, target) {
  cancelAction(g, s);
  s.action = { type, target, progress: 0, time: 0, nextSkill: rand(3.2, 6.2) };
  if (type === 'repair') g.addRepairer(target, s);
  s.path = [];
}

function nearPallet(g, s, range = 62) {
  return g.pallets.find(p => !p.broken && !p.dropped && dist(s, p) < range);
}

function updateBotSurvivor(g, s, dt) {
  if (s.state === 'dead' || s.state === 'escaped') return;
  s.bob = (s.bob || 0) + dt * (s.moving ? 9 : 3);
  s.moving = false;

  if (s.state === 'downed') {
    const beingExecuted = g.killer.execute?.target === s || g.killer.playerAction?.target === s;
    if (beingExecuted) {
      s.moving = false;
      s.downTimer -= dt;
      if (s.downTimer <= 0) { g.eliminateSurvivor(s, 'bled out'); }
      return;
    }
    s.downTimer -= dt;
    if (s.downTimer <= 0) { g.eliminateSurvivor(s, 'bled out'); return; }
    const kd = dist(s, g.killer);
    let tx, ty;
    const ally = nearestAlly(g, s, false);
    if (ally && kd > 440) { tx = ally.x; ty = ally.y; }
    else {
      const a = Math.atan2(s.y - g.killer.y, s.x - g.killer.x) + rand(-.4, .4);
      tx = s.x + Math.cos(a) * 80; ty = s.y + Math.sin(a) * 80;
    }
    const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
    if (d > 2) g.world.moveCircle(s, dx / d * 37 * dt, dy / d * 37 * dt, s.radius);
    return;
  }

  // Action in progress?
  if (s.action) {
    const killerNear = dist(s, g.killer) < (s.action.type === 'revive' ? 290 : 330);
    const target = s.action.target;
    const invalid =
      (s.action.type === 'repair' && (!target || target.done)) ||
      (s.action.type === 'revive' && (!target || target.state !== 'downed')) ||
      (s.action.type === 'gate' && (!target || target.open)) ||
      (s.action.type === 'heal' && !s.injured);
    if (invalid || killerNear) { cancelAction(g, s, 'interrupted'); s.ai.think = 0; }
    else {
      s.action.time += dt;
      if (s.action.type === 'repair') {
        const def = s.def;
        const rate = g.threat.repairRate * def.repair * (s.injured ? .82 : 1);
        target.progress = Math.min(100, target.progress + rate * dt);
        target.pulse = Math.max(target.pulse || 0, .3);
        if (target.progress >= 100) { g.completeGenerator(target, s); cancelAction(g, s); }
        else if (s.action.time >= s.action.nextSkill) {
          s.action.nextSkill = s.action.time + rand(4.2, 7.8);
          if (Math.random() > g.threat.botSkill) {
            g.failGeneratorSkill(s, target, true);
            cancelAction(g, s);
            s.ai.think = .2;
          } else if (Math.random() > .55) {
            g.sparkAt(target.x, target.y, 4);
          }
        }
      } else if (s.action.type === 'revive') {
        target.reviveProgress = (target.reviveProgress || 0) + 17 * dt * s.def.revive;
        if (target.reviveProgress >= 100) { g.reviveSurvivor(target, s); cancelAction(g, s); }
      } else if (s.action.type === 'gate') {
        target.progress = Math.min(100, target.progress + g.threat.gateRate * .82 * dt);
        if (target.progress >= 100) { g.openExit(target, s); cancelAction(g, s); }
      } else if (s.action.type === 'heal') {
        s.healProgress = (s.healProgress || 0) + 16 * dt;
        if (s.healProgress >= 100) { g.healSurvivor(s); cancelAction(g, s); }
      }
      return;
    }
  }

  s.ai.think -= dt;
  s.pathTimer -= dt;
  const kd = dist(s, g.killer);
  const canSeeKiller = kd < 860 && g.world.lineClear(s.x, s.y, g.killer.x, g.killer.y, true);
  const threatened = kd < g.threat.fleeAt || (canSeeKiller && kd < g.threat.fleeAt * 1.55) || (g.killer.attackAnim > 0 && kd < 520);

  if (threatened) {
    s.ai.safeTime = 0;
    if (s.ai.state !== 'flee' || s.ai.think <= 0) {
      s.ai.state = 'flee';
      const p = chooseFleePoint(g, s);
      setPath(g, s, p.x, p.y);
    }
    s.ai.think = .45;
    // Don't panic into the killer's arms.
    if (kd < 105) {
      const pallet = nearPallet(g, s, 58);
      if (pallet && g.time - (s.ai.lastPallet || -99) > 5) {
        s.ai.lastPallet = g.time;
        g.dropPallet(pallet, s);
      }
    }
    const sprint = s.stamina > 5;
    if (sprint) s.stamina = Math.max(0, s.stamina - 17 * dt);
    followPath(g, s, dt, (sprint ? 216 : 164) * s.def.speed);
    if (sprint && Math.random() < dt * 2.5) g.spawnDust(s);
    return;
  }

  s.stamina = Math.min(100, s.stamina + 12 * dt);
  if (s.ai.state === 'flee') {
    s.ai.safeTime = (s.ai.safeTime || 0) + dt;
    if (s.ai.safeTime > 2.2 && kd > g.threat.fleeAt * 1.25) s.ai.state = 'objective';
  }
  s.ai.think -= 0; // already decremented above
  if (s.ai.think <= 0) {
    s.ai.think = .5 + rand(0, .22);

    // Gens are done: get an exit open.
    if (g.completedGens >= 5) {
      let openExit = g.exits.find(e => e.open);
      if (openExit) {
        if (dist(s, openExit) < 48) { g.escapeSurvivor(s); return; }
        s.ai.state = 'escape';
        if (!s.path.length || s.pathTimer <= 0) setPath(g, s, openExit.x, openExit.y);
      } else {
        const exit = g.exits.slice().sort((a, b) => dist(s, a) - dist(s, b))[0];
        if (dist(s, exit) < 92) startAction(g, s, 'gate', exit);
        else { s.ai.state = 'gate'; if (!s.path.length || s.pathTimer <= 0) setPath(g, s, exit.x, exit.y); }
      }
    } else {
      const downed = nearestDownedAlly(g, s, 980);
      if (downed && kd > 300) {
        s.ai.state = 'rescue';
        if (dist(s, downed) < 56) startAction(g, s, 'revive', downed);
        else if (!s.path.length || s.pathTimer <= 0 || s.ai.rescueTarget !== downed) {
          s.ai.rescueTarget = downed; setPath(g, s, downed.x, downed.y);
        }
      } else {
        // Self-heal when safe and there is no urgent generator.
        if (s.injured && kd > 600 && Math.random() < .32 && s.healProgress > 0) {
          s.ai.state = 'heal';
          startAction(g, s, 'heal');
        } else {
          let best = null, bestScore = Infinity;
          for (const gen of g.generators) {
            if (gen.done) continue;
            const d = dist(s, gen);
            const score = d + (gen.repairers?.size ? 120 : 0) + rand(0, 120);
            if (score < bestScore) { bestScore = score; best = gen; }
          }
          if (best) {
            s.ai.state = 'repair';
            s.ai.targetGen = best;
            if (dist(s, best) < 62) startAction(g, s, 'repair', best);
            else if (!s.path.length || s.pathTimer <= 0) setPath(g, s, best.x, best.y);
          } else {
            const exit = g.exits[0];
            if (!s.path.length) setPath(g, s, exit.x, exit.y);
          }
        }
      }
    }
  }

  // Follow path, but repath if stuck.
  if (s.path?.length) {
    followPath(g, s, dt, (s.stamina > 20 && threatened ? 208 : 146) * s.def.speed);
    if (Math.random() < dt * .28 && s.path.length > 2) {
      const old = s.x + s.y;
      // leave path alone; simple stuck detection occurs in game tick
    }
  } else {
    // Arrived: if we were heading toward an action that didn't start due to timing, nudge.
    const t = s.ai.targetGen;
    if (s.ai.state === 'repair' && t && !t.done && dist(s, t) < 80) startAction(g, s, 'repair', t);
    const ex = g.exits.find(e => !e.open && e.powered);
    if (s.ai.state === 'gate' && ex && dist(s, ex) < 100) startAction(g, s, 'gate', ex);
    const downed = nearestDownedAlly(g, s, 90);
    if (s.ai.state === 'rescue' && downed) startAction(g, s, 'revive', downed);
  }
}

// ── Killer AI ─────────────────────────────────────────────────
function choosePatrol(g) {
  const k = g.killer;
  const options = [];
  for (const gen of g.generators) {
    if (!gen.done) options.push({ x: gen.x, y: gen.y, score: gen.progress * 1.1 + rand(0, 180) - dist(k, gen) * .12 });
  }
  for (const e of g.exits) if (e.powered && !e.open) options.push({ x: e.x, y: e.y, score: 450 - dist(k, e) * .2 });
  for (const s of g.survivors) {
    if (s.state === 'downed') options.push({ x: s.x, y: s.y, score: 700 - dist(k, s) * .2 });
  }
  options.sort((a, b) => b.score - a.score);
  return options[0] || { x: g.world.W / 2, y: g.world.H / 2 };
}

function killerCanSee(g, target, radius) {
  const d = dist(g.killer, target);
  if (d > radius) return false;
  if (target.state === 'dead' || target.state === 'escaped') return false;
  if (d < 170) return true;
  return g.world.lineClear(g.killer.x, g.killer.y, target.x, target.y, false);
}

function updateAIKiller(g, dt) {
  const k = g.killer;
  if (k.stunTimer > 0) { k.stunTimer -= dt; k.moving = false; return; }
  k.moving = false;
  k.thinkTimer -= dt;
  k.pathTimer -= dt;

  // Finishing move.
  if (k.execute) {
    const target = k.execute.target;
    if (!target || target.state !== 'downed' || dist(k, target) > 90) {
      k.execute = null;
    } else {
      k.execute.progress += dt;
      k.face = Math.atan2(target.y - k.y, target.x - k.x);
      if (k.execute.progress >= 2.15) {
        g.eliminateSurvivor(target, 'sacrificed');
        k.execute = null;
        k.thinkTimer = .2;
      }
      k.moving = false;
      return;
    }
  }

  // Smash a dropped pallet in the way.
  if (k.breakTarget) {
    const p = k.breakTarget;
    if (p.broken || dist(k, p) > 95) k.breakTarget = null;
    else {
      p.breakProgress = (p.breakProgress || 0) + dt * 82;
      k.face = Math.atan2(p.y - k.y, p.x - k.x);
      if (p.breakProgress >= 100) { g.breakPallet(p); k.breakTarget = null; }
      k.moving = false;
      return;
    }
  }

  if (k.thinkTimer <= 0) {
    k.thinkTimer = g.threat.reaction + rand(.12, .26);
    let best = null, bestScore = Infinity;
    for (const s of g.survivors) {
      if (s.state === 'dead' || s.state === 'escaped') continue;
      const d = dist(k, s);
      if (s.state === 'downed') {
        if (d < 760 && d < bestScore + 120) { best = s; bestScore = Math.min(bestScore, d * .65); }
        continue;
      }
      const saw = killerCanSee(g, s, g.threat.killerDetect);
      const noise = s.sprinting ? 1.45 : s.crouching ? .55 : s.injured ? 1.25 : 1;
      const hear = d < g.threat.killerHearing * noise;
      if (saw || hear) {
        const score = d - (s.injured ? 70 : 0) - (s.sprinting ? 35 : 0);
        if (score < bestScore) { best = s; bestScore = score; }
      }
    }
    if (best) {
      k.target = best;
      k.lastSeen = g.time;
      k.lastPos = { x: best.x, y: best.y };
    } else if (k.target && (k.target.state === 'dead' || k.target.state === 'escaped')) {
      k.target = null;
    } else if (g.time - (k.lastSeen || -99) > 3.8) {
      k.target = null;
    }

    if (!k.target) {
      if (!k.aiPatrol || g.time > (k.aiPatrolUntil || 0) || dist(k, k.aiPatrol) < 55) {
        k.aiPatrol = choosePatrol(g);
        k.aiPatrolUntil = g.time + rand(5, 9);
      }
      if (k.sightCooldown <= 0 && g.time - (k.lastSight || -99) > 11) g.killerSight();
    }

    // Break a pallet that lies between us and the prey.
    const prey = k.target;
    if (prey) {
      for (const p of g.pallets) {
        if (!p.dropped || p.broken) continue;
        if (dist(k, p) < 82) {
          const toPrey = Math.atan2(prey.y - k.y, prey.x - k.x);
          const toPallet = Math.atan2(p.y - k.y, p.x - k.x);
          if (angleDiff(toPrey, toPallet) < 1.2 && dist(k, prey) > 60) { k.breakTarget = p; break; }
        }
      }
    }
  }

  if (k.target && k.target.state !== 'dead' && k.target.state !== 'escaped') {
    const target = k.target;
    const d = dist(k, target);
    k.face = Math.atan2(target.y - k.y, target.x - k.x);

    if (target.state === 'downed') {
      if (d < 70) {
        k.execute = { target, progress: 0 };
        g.addFeed(`${target.short} is being sacrificed`, 'blood');
        return;
      }
      if (!k.path.length || k.pathTimer <= 0) setPath(g, k, target.x, target.y);
      followPath(g, k, dt, g.threat.killerSpeed * .92);
      return;
    }

    if (d < 86 && k.attackCd <= 0) {
      g.killerAttack();
      return;
    }
    if (d > 105 && d < 255 && k.lungeCd <= 0 && k.attackCd <= 0 && g.world.lineClear(k.x, k.y, target.x, target.y, true)) {
      g.killerLunge();
    }
    if (d > 90) {
      if (!k.path.length || k.pathTimer <= 0) setPath(g, k, target.x + (target.vx || 0) * .22, target.y + (target.vy || 0) * .22);
      followPath(g, k, dt, g.threat.killerSpeed);
    }
    if (d < 130) {
      // Close the last few feet directly.
      g.world.moveCircle(k, Math.cos(k.face) * g.threat.killerSpeed * .6 * dt, Math.sin(k.face) * g.threat.killerSpeed * .6 * dt, k.radius);
      k.moving = true;
    }
    return;
  }

  // Lost target: sweep toward the last place it was seen.
  if (k.lastPos && g.time - (k.lastSeen || 0) < 5) {
    if (!k.path.length || k.pathTimer <= 0) setPath(g, k, k.lastPos.x, k.lastPos.y);
    followPath(g, k, dt, g.threat.killerSpeed * .92);
    if (dist(k, k.lastPos) < 65) k.lastPos = null;
    return;
  }

  if (k.aiPatrol) {
    if (!k.path.length || k.pathTimer <= 0) setPath(g, k, k.aiPatrol.x, k.aiPatrol.y);
    followPath(g, k, dt, g.threat.killerSpeed * .78);
    if (dist(k, k.aiPatrol) < 64) { k.aiPatrol = null; k.aiPatrolUntil = 0; }
    return;
  }

  // Idle sweep toward centre.
  const c = { x: g.world.W / 2, y: g.world.H / 2 };
  if (!k.path.length || k.pathTimer <= 0) setPath(g, k, c.x, c.y);
  followPath(g, k, dt, g.threat.killerSpeed * .6);
}

export { updateBotSurvivor, updateAIKiller, setPath, cancelAction, startAction, followPath, killerCanSee };
