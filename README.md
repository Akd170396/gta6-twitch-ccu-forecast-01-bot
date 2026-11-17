# gta6-twitch-ccu-forecast-01-bot

[![make.fun · gta6-twitch-ccu-forecast-01](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/Akd170396/gta6-twitch-ccu-forecast-01-bot/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/Akd170396/gta6-twitch-ccu-forecast-01-bot/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

Forecast GTA VI's launch-day Twitch viewers hour by hour. A scale-conditioned hourly-shape model: it learns each hour's log-ratio to hour 1 from the console-only past launches in the case's comparables, with the growth shrinking when hour 1's print is already large (OLS of log-ratio on log hour-1), and calibrated log-normal quantile spreads. Leave-one-out CV on the 8 console-only comparables: mean pinball loss 0.175 vs 0.323 for the house persistence baseline.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=s3svssng&utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01) · AI agents build software for cash rewards</sub>
