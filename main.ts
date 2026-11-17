// gta6-twitch-ccu-forecast-01 entry (Node 22, standard library only).
//
// Forecast: for each of hours 2..24 of the release day, five quantiles of that
// hour's Twitch concurrent viewers in the game's category, given everything
// recorded up to the end of hour 1.
//
// Model — scale-conditioned hourly shape from past launches:
//   q_tau(h) = p1 * exp(a_h + b_h * log(p1) + z_tau * s_h)
// where p1 is hour 1's print, and for each hour h the pair (a_h, b_h) is the
// ordinary-least-squares fit of log(viewers_h / viewers_1) on log(viewers_1)
// across the console-only past launches in the case's `comparables`, and s_h
// is the residual spread (x1.3, floored at 0.08). The log(h1) used is capped
// at the largest log(h1) among the references plus 1.5, so an extreme hour-1
// print cannot extrapolate the fit without bound.
//
// Why this shape: a launch-day curve is not flat. Hour 1 catches the UK and
// European midnight unlock, then viewership dips in the deep-night hours and
// climbs steeply as the Americas unlock and reach prime time, peaking around
// hours 19-21. And the growth from hour 1 depends on how much audience was
// already there at hour 1: a huge hour-1 print means the world was already
// watching, so later hours grow less (the fitted slope b_h is about -0.25).
// The house baseline (persistence, every hour = hour 1) misses both effects.
//
// Reference set: console-only launches (platforms with no PC) whose release
// day has at least 20 of hours 1..24 recorded and an hour-1 print — the
// launch shape of a console-only, rolling-midnight-local game like GTA VI.
// The Grand Theft Auto VI category's own pre-release row is excluded (its
// "day" is the 2026-08-27 premiere, not a launch). If fewer than four
// console-only references exist, all launch comparables are used; if fewer
// than four exist at all, the house persistence baseline is used instead.
//
// Leave-one-out cross-validation on the 8 console-only comparables of the
// practice kit (each launch predicted from the other 7): mean pinball loss
// 0.175, against 0.323 for the house baseline on the same launches. The
// house baseline scores about 0.387 on the practice cases.
//
// Run: mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
// (the grader leaves both env vars unset and uses /input and /output).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The quantile levels the contest scores, in the order each row lists them. */
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
/** The standard normal's quantile at each level. */
const Z = [-1.6448536269514722, -0.6744897501960817, 0, 0.6744897501960817, 1.6448536269514722];
/** House baseline spread, log units per square-root hour (fallback only). */
const BASE_SIGMA = 0.15;
/** Residual spread multiplier (calibrated by leave-one-out CV). */
const SPREAD_MULT = 1.3;
/** Residual spread floor, log units. */
const SPREAD_FLOOR = 0.08;
/** Max log(h1) extrapolation beyond the largest reference log(h1). */
const EXTRAP_ALLOW = 1.5;

interface HourlyPoint { from: string; viewers: number | null; channels?: number | null }
interface Comparable {
  name: string;
  day_start: string;
  platforms?: string;
  hourly: HourlyPoint[];
}
interface CaseFile {
  id: string;
  levels: number[];
  known: Array<{ hour: number; viewers: number }>;
  forecast: Array<{ hour: number }>;
  comparables: Comparable[];
}

/** x rounded to 2 decimals (half up). */
const round2 = (x: number): number => Math.round(x * 100) / 100;
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Release-day hourly viewers (hours 1..24) of one comparable, or null if unusable. */
function daySeries(comp: Comparable): Map<number, number> | null {
  if (/grand theft auto vi/i.test(comp.name)) return null; // pre-release row, not a launch
  const ds = new Date(comp.day_start).getTime();
  if (!Number.isFinite(ds)) return null;
  const byHour = new Map<number, number>();
  for (const p of comp.hourly ?? []) {
    if (p.viewers == null || p.viewers <= 0) continue;
    const h = Math.round((new Date(p.from).getTime() - ds) / 3600000) + 1;
    if (h >= 1 && h <= 24) byHour.set(h, p.viewers);
  }
  if (!byHour.has(1) || byHour.size < 20) return null;
  return byHour;
}

/** Console-only launch (no PC): the reference class for a console-only game. */
function isConsoleOnly(comp: Comparable): boolean {
  const pl = comp.platforms ?? '';
  if (/PC/i.test(pl)) return false;
  return /(PS4|PS5|Switch|Xbox)/i.test(pl);
}

interface Ref { logH1: number; series: Map<number, number> }

function buildRefs(comps: Comparable[]): Ref[] {
  const consoleRefs: Ref[] = [];
  const allRefs: Ref[] = [];
  for (const comp of comps) {
    const series = daySeries(comp);
    if (!series) continue;
    const ref = { logH1: Math.log(series.get(1)!), series };
    allRefs.push(ref);
    if (isConsoleOnly(comp)) consoleRefs.push(ref);
  }
  if (consoleRefs.length >= 4) return consoleRefs;
  return allRefs;
}

/** OLS slope/intercept of ys on xs. */
function ols(xs: number[], ys: number[]): { a: number; b: number } {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  return { a: my - b * mx, b };
}

/** The five quantiles of one hour, from the scale-conditioned shape model. */
function hourQuantiles(p1: number, h: number, refs: Ref[]): number[] {
  if (refs.length < 4) {
    // Too few references: house persistence baseline.
    return Z.map((z) => round2(Math.max(1, p1 * Math.exp(z * BASE_SIGMA * Math.sqrt(h - 1)))));
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of refs) {
    const vh = r.series.get(h);
    if (vh != null) {
      xs.push(r.logH1);
      ys.push(Math.log(vh) - r.logH1);
    }
  }
  if (xs.length < 4) {
    return Z.map((z) => round2(Math.max(1, p1 * Math.exp(z * BASE_SIGMA * Math.sqrt(h - 1)))));
  }
  const { a, b } = ols(xs, ys);
  const maxLogH1 = Math.max(...xs);
  const logH1 = Math.min(Math.log(p1), maxLogH1 + EXTRAP_ALLOW);
  const center = a + b * logH1;
  const resid = ys.map((y, i) => y - (a + b * xs[i]));
  const s = Math.max(SPREAD_FLOOR, std(resid) * SPREAD_MULT);
  const qs = Z.map((z) => round2(Math.max(1, p1 * Math.exp(center + z * s))));
  // Keep the row non-decreasing after rounding (equal is allowed).
  for (let j = 1; j < qs.length; j++) if (qs[j] < qs[j - 1]) qs[j] = qs[j - 1];
  return qs;
}

function forecastCase(c: CaseFile): { hours: Array<{ hour: number; q: number[] }> } {
  const first = c.known.find((k) => k.hour === 1);
  const p1 = Math.max(1, first?.viewers ?? 1);
  const refs = buildRefs(c.comparables ?? []);
  const hours = c.forecast.map(({ hour }) => ({ hour, q: hourQuantiles(p1, hour, refs) }));
  return { hours };
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  // Hour 1's print, recovered before any failure can hide it: the fallback
  // below centres on it instead of on 1 viewer (the old fallback forgot p1).
  let p1 = 1;
  try {
    const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as CaseFile;
    const first = c.known.find((k) => k.hour === 1);
    p1 = Math.max(1, first?.viewers ?? 1);
    if (c.levels.length !== LEVELS.length || c.levels.some((t, j) => t !== LEVELS[j])) {
      throw new Error(`${file} asks for levels ${JSON.stringify(c.levels)}`);
    }
    writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify(forecastCase(c))}\n`);
  } catch (err) {
    // Never let one bad case kill the run: write a valid persistence fallback.
    const fallback = {
      hours: Array.from({ length: 23 }, (_, i) => {
        const h = i + 2;
        return { hour: h, q: Z.map((z) => round2(Math.max(1, p1 * Math.exp(z * BASE_SIGMA * Math.sqrt(h - 1))))) };
      }),
    };
    writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify(fallback)}\n`);
    console.error(`case ${id} failed (${(err as Error).message}); wrote persistence fallback`);
  }
}
