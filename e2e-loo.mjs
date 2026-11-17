// End-to-end LOO validation of the SHIPPED main.ts:
// for each console-only comparable, build a synthetic case (target = that
// launch, refs = the other console comparables), run main.ts on it, and
// score the pinball loss against the target's real hours 2-24.
// Usage: node e2e-loo.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';

const Z = [-1.6448536269514722, -0.6744897501960817, 0, 0.6744897501960817, 1.6448536269514722];
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];

function daySeries(comp) {
  const ds = new Date(comp.day_start).getTime();
  const byHour = new Map();
  for (const p of comp.hourly) {
    const t = new Date(p.from).getTime();
    const h = Math.round((t - ds) / 3600000) + 1;
    if (h >= 1 && h <= 24 && p.viewers != null && p.viewers > 0) byHour.set(h, p.viewers);
  }
  return byHour;
}
function isConsoleOnly(comp) {
  const pl = comp.platforms || '';
  if (/PC/i.test(pl)) return false;
  return /(PS4|PS5|Switch|Xbox)/i.test(pl);
}
function isLaunch(comp) { return !/Grand Theft Auto VI category before release/i.test(comp.name); }
function pinball(y, q, tau) { const d = Math.log(y) - Math.log(q); return 2 * Math.max(tau * d, (tau - 1) * d); }

const KIT = '/home/hatch/workspace/makefun/gta6-twitch-ccu-forecast-01-kit/gta6-twitch-ccu-forecast-01-kit';
const c = JSON.parse(readFileSync(`${KIT}/input/p00.in`, 'utf8'));
const all = c.comparables.filter(isLaunch).map((comp) => ({ comp, series: daySeries(comp) }))
  .filter((x) => x.series.size >= 20 && x.series.has(1));
const consoleSet = all.filter((x) => isConsoleOnly(x.comp));

const tmpIn = '/tmp/e2e-loo-in';
const tmpOut = '/tmp/e2e-loo-out';
rmSync(tmpIn, { recursive: true, force: true });
rmSync(tmpOut, { recursive: true, force: true });
mkdirSync(tmpIn, { recursive: true });

let modelTot = 0, baseTot = 0, n = 0;
for (const t of consoleSet) {
  const refs = consoleSet.filter((x) => x !== t).map((x) => x.comp);
  const p1 = t.series.get(1);
  const caseFile = {
    schema: 'makefun/twitch-ccu-case/v1',
    id: 'loo',
    game: { name: t.comp.name, twitch_id: '0' },
    day_start: t.comp.day_start,
    checkpoint: t.comp.day_start,
    levels: LEVELS,
    known: [{ hour: 1, from: t.comp.day_start, until: t.comp.day_start, viewers: p1, channels: 0, reads: 1 }],
    forecast: Array.from({ length: 23 }, (_, i) => ({ hour: i + 2, from: '', until: '' })),
    history: [], history_hourly: [], streams: null, categories_hourly: null,
    comparables: refs,
    notes: '',
  };
  writeFileSync(`${tmpIn}/loo.in`, JSON.stringify(caseFile));
  execSync(`MAKEFUN_INPUT_DIR=${tmpIn} MAKEFUN_OUTPUT_DIR=${tmpOut} node main.ts`, { cwd: '/home/hatch/workspace/makefun/gta6-twitch-ccu-forecast-01-bot', stdio: 'pipe' });
  const out = JSON.parse(readFileSync(`${tmpOut}/loo.out`, 'utf8'));
  let mt = 0, bt = 0, cnt = 0;
  for (const row of out.hours) {
    const y = t.series.get(row.hour);
    if (y == null) continue;
    for (let j = 0; j < 5; j++) {
      mt += pinball(y, row.q[j], LEVELS[j]);
      bt += pinball(y, p1 * Math.exp(Z[j] * 0.15 * Math.sqrt(row.hour - 1)), LEVELS[j]);
      cnt++;
    }
  }
  const ml = mt / cnt, bl = bt / cnt;
  console.log(`${t.comp.name.padEnd(32)} model=${ml.toFixed(4)} baseline=${bl.toFixed(4)}`);
  modelTot += ml; baseTot += bl; n++;
}
console.log('---');
console.log(`MEAN model (shipped main.ts): ${(modelTot / n).toFixed(4)}`);
console.log(`MEAN baseline               : ${(baseTot / n).toFixed(4)}`);
