# Validation — gta6-twitch-ccu-forecast-01

## Model
`main.ts` (Node 22, stdlib only) forecasts hours 2–24 as five quantiles each.
For each hour h it fits, over the console-only past launches in the case's
`comparables`, an OLS of `log(viewers_h / viewers_1)` on `log(viewers_1)` and
predicts `q_tau(h) = p1 * exp(a_h + b_h*log(p1) + z_tau * s_h)`, where `p1` is
hour 1's print, `s_h` the residual spread (×1.3, floored at 0.08), and
`log(p1)` is capped at the largest reference `log(h1)` + 1.5. Console-only
references (no PC) are the right class for GTA VI: console-only, rolling
midnight-local unlock. The GTA VI category's own pre-release row is excluded
(its "day" is the 2026-08-27 premiere, not a launch). Fallbacks: fewer than
4 console references → all launch comparables; fewer than 4 total → the
house persistence baseline.

## Format + runtime (practice cases p00–p03)
Run: `MAKEFUN_INPUT_DIR=<kit>/input MAKEFUN_OUTPUT_DIR=out node main.ts`

| case | valid | bytes | runtime |
|------|-------|-------|---------|
| p00 (Wolverine) | yes, 23 rows h2–24, 5 non-decreasing quantiles | 1451 | ~0.07 s |
| p01 (RDR2) | yes | 1508 | ~0.07 s |
| p02 (GOW Ragnarök) | yes | 1551 | ~0.07 s |
| p03 (Spider-Man 2) | yes | 1522 | ~0.07 s |

Total for all 4 cases: ~0.27 s (limit 8 s per case). All outputs well under
the 65,536-byte cap.

## Leave-one-out cross-validation (comparables, console-only)
Script: `e2e-loo.mjs` (runs the shipped `main.ts` end to end). Each of the
8 console-only comparables is predicted from the other 7; the loss is the
mean pinball loss on the log scale over hours 2–24 × 5 levels, scored
against that launch's real hourly counts.

| launch | model | house baseline |
|--------|-------|----------------|
| Ghost of Yōtei | 0.1613 | 0.4734 |
| Saros | 0.1606 | 0.6011 |
| Zelda: Tears of the Kingdom | 0.2372 | 0.3086 |
| Death Stranding 2 | 0.2535 | 0.1762 |
| Final Fantasy VII Rebirth | 0.1625 | 0.1734 |
| The Last of Us Part II | 0.1760 | 0.2470 |
| Ghost of Tsushima | 0.1076 | 0.2282 |
| Stellar Blade | 0.1390 | 0.3724 |
| **Mean** | **0.1747** | **0.3225** |

The model beats the baseline by 46% on average (wins 6 of 8 launches). The
house baseline scores about 0.387 on the practice cases; the model is
expected well below that. The two launches where the model loses (Death
Stranding 2, and to a lesser extent Zelda) are the ones whose hour-1 print
was already close to their peak — the scale conditioning shrinks growth for
large hour-1 prints, which is right on average but overshoots there.

## What the shape looks like (console-only medians, log-ratio to hour 1)
Hours 2–4 dip below hour 1 (median −0.22, −0.38, −0.55: deep-night lull
after the UK/Europe midnight unlock), hours 5–12 recover toward 0, hours
13–24 climb to a peak around hour 20 (+0.89) as the Americas unlock and
reach prime time, then ease to +0.68 by hour 24. The fitted slope of
log-ratio on log(h1) is about −0.25 at late hours: a bigger hour-1 print
means less later growth.
