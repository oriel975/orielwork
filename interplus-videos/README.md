# Interplus marketing videos

Remotion (React + TypeScript) project for the Interplus group brand films and reels. Hebrew, right to left. Each video is one JSON file in `src/videos/`. Brand films render in three formats, reels in 9:16:

| Format | Size | For |
| --- | --- | --- |
| `16x9` | 1920×1080 | LinkedIn, YouTube, website |
| `9x16` | 1080×1920 | Reels, TikTok, Shorts |
| `1x1` | 1080×1080 | Feed |

All three run at 30 fps.

## The videos

| Video id | Company | Length | Formats |
| --- | --- | --- | --- |
| `installations-brand` | Inter Electric Installations | 75s | 16:9, 9:16, 1:1 |
| `installations-reel-build` | Inter Electric Installations: "a substation in 20 seconds" | 23s | 9:16 |
| `installations-reel-day` | Inter Electric Installations: a work day on a high-voltage site | 27s | 9:16 |
| `installations-reel-focus` | Inter Electric Installations: project in focus, Hadera Paper | 28s | 9:16 |
| `ev-brand` | Inter EV | 60s | 16:9, 9:16, 1:1 |
| `ev-reel-fleet` | Inter EV: charging a whole fleet | 22s | 9:16 |
| `ev-reel-home` | Inter EV: from the first call to the first charge | 21s | 9:16 |
| `ev-reel-questions` | Inter EV: 3 questions every fleet manager asks | 34s | 9:16 |
| `enerlec-brand` | Inter Enerlec | 60s | 16:9, 9:16, 1:1 |
| `enerlec-reel-night` | Inter Enerlec: a call at 2 a.m. | 23s | 9:16 |
| `enerlec-reel-thermal` | Inter Enerlec: what a thermal camera sees | 29s | 9:16 |
| `enerlec-reel-safety` | Inter Enerlec: safety first | 27s | 9:16 |

Facts in the scripts come from the brief or from interplus.co.il (690 kV test lab, 300 kW DC charging, 24/7 nationwide service, the named projects).

## Setup

```bash
npm install          # also copies the Heebo font into assets/fonts and indexes assets/
npm run studio       # live preview of every video and format in the browser
```

Node 18 or newer. The first render on a new machine downloads a headless Chrome automatically.

## Commands

| Command | What it does |
| --- | --- |
| `npm run render -- <video id>` | Renders one video in all its formats into `out/<company>/` |
| `npm run render -- <id> --formats=9x16` | Only some formats |
| `npm run render -- --company=ev` | Every video of one company |
| `npm run render:all` | Everything |
| `npm run render -- <id> --stills` | 8 review stills per format instead of video (`--frames=30,90` for chosen frames) |
| `npm run render:style-test` | The 10-second look test |
| `npm run deliver` | After rendering: a cover image per video in `out/<company>/covers/` and a Hebrew index `out/README.md` |
| `npm run logo-colors` | Samples the logo's real colours into `src/brand/logo-palette.json` |
| `npm run placeholders` | Regenerates the drawn placeholder images |

Every render also writes `out/<company>/<id>-missing.md`, which lists the photos, voiceovers, music and logo still to supply.

## Assets

```
assets/
  installations/  ev/  enerlec/  systems/  b/  group/   curated photos per company, named by project
  <company>/vo/                                          voiceover per scene
  logos/                                                 <company>.png and interplus.png, light versions for dark backgrounds
  music/                                                 one original score per video (scripts/music/compose.py)
  sfx/                                                   whoosh, impact, riser, shimmer, tick
  inventory.csv                                          every file downloaded from interplus.co.il: source page, size, description, where it is used
  embedded-videos.md                                     YouTube/Vimeo links found on the site
  site/                                                  the raw website download (not in git; re-create with the crawler)
  placeholders/                                          drawn stand-ins for the style test
```

- **Missing files never break a render.** A scene whose photo isn't there yet shows a quiet animated placeholder labelled with what belongs there.
- **Voiceover:** name the file `<company>/vo/<video id>-<scene number>.mp3` (or `.wav` / `.m4a`), e.g. `installations/vo/installations-brand-02.mp3`. It is picked up automatically: the music ducks under it (about 12 dB) and the subtitles are timed to its length. Set `voFile` on a scene to use another name.
- **Logo:** `logos/<company>.png|svg`, falling back to `logos/interplus.png|svg`. Until one exists, a typographic wordmark from `brandName` is used. The logos here are the site's, with the dark grey lettering turned white so they read on navy. `npm run logo-colors -- assets/logos/installations.png` sampled the brand green (#9FD18B), which replaced the brief's electric blue as the accent.
- **Photos in other aspect ratios:** a scene shows the whole photo over a blurred copy of itself when cropping would throw most of it away (a landscape photo in 9:16, a panorama in 16:9). Set `"fit": "cover"` or `"contain"` on a scene or shot to override.

## Music, sound and narration

- **Music** is original, generated per video by `scripts/music/compose.py` (numpy/scipy, no samples, so no licensing). It follows the video's scenes: `musicStyle` picks the palette (`installations`, `ev`, `enerlec`), scene types set the intensity (override with `musicEnergy` 0-3), risers lead into bigger sections, a hit lands on the outro's logo, and `musicRelease` switches Enerlec from tension to the resolved theme. Regenerate after changing a video's scenes: `pip install -r scripts/music/requirements.txt`, then `python scripts/music/compose.py src/videos/<id>.json out.wav`, then convert to `assets/music/<id>.m4a`.
- **Sound effects:** whooshes are placed automatically on every energy transition, montage cut and before/after wipe (`"sfx": false` turns them off).
- **Narration** was generated with Chatterbox Multilingual (MIT licence, Hebrew), with niqqud added by Phonikud (MIT) and every take checked by transcribing it back with ivrit-ai's Hebrew Whisper. The audio carries Resemble's inaudible AI watermark. `scripts/music/vo_post.py` trims, normalises (-16 LUFS) and copies takes into `assets/<company>/vo/`. For broadcast quality, record a professional voice to the same file names and re-render; nothing else changes.

## Motifs

- `"chargeBar": true` (EV): a glowing charge bar fills across the video and reaches 100% as the outro begins.
- `"clock": {"fromScene": 1, "toScene": 3, "start": "02:00"}` (Enerlec): a running clock in the corner over those scenes. It runs in real time, so it never implies a response time.
- `"grade": "thermal"` gives an ironbow thermal-camera look; `"night"` and `"warm"` set the mood.

## Writing a video

Add `src/videos/<id>.json`. No code changes are needed: it appears in the studio and can be rendered right away.

```json
{
  "id": "installations-brand",
  "company": "installations",
  "brandName": "אינטר אלקטריק התקנות",
  "music": "music/corporate-pulse.mp3",
  "scenes": [
    {"type": "title", "duration": 5, "asset": "installations/drone-sunset.jpg", "focus": [60, 55], "grade": "warm",
     "text": "החשמל שמניע את ישראל עובר דרכנו."},
    {"type": "projects", "duration": 20, "vo": "פרויקטים לאומיים, שמתחילים אצלנו ונשארים פועלים שנים.",
     "cards": [{"title": "תחנת משנה אורים", "asset": "installations/urim.jpg"}]},
    {"type": "outro", "duration": 7, "tagline": "אנרגיה בביצוע מדויק", "url": "interplus.co.il"}
  ]
}
```

Durations are in seconds. Scenes run back to back and each one enters with an energy-line sweep, right to left (`"transition": "fade"` or `"cut"` to change it).

### Scene types

| Type | Shows | Main fields |
| --- | --- | --- |
| `title` | Full-bleed photo, headline revealed word by word | `asset`, `text`, `subtitle` |
| `image` | Full-bleed photo, optional short headline top right | `asset`, `text` |
| `montage` | Several fast shots cut with energy lines, optional numbered stage labels | `shots[]` (`asset`, `caption`, `visual`) |
| `projects` | Up to three project cards (row in 16:9, stack in 9:16 and 1:1) | `cards[]` (`title`, `line`, `asset`), `text` |
| `stat` | Numbers counting up | `stats[]` (`value`, `unit`, `label`, `prefix`, `decimals`) |
| `logo` | Logo reveal over a photo | `asset`, `text` |
| `outro` | Logo assembled from energy lines, tagline, URL | `tagline`, `url`, `asset` (backdrop) |
| `video` | A clip with its own sound, e.g. an interview | `asset` (.mp4), `lowerThird` (`name`, `role`) |
| `beforeAfter` | Wipe from before to after | `before`, `after` (each `asset`, `visual`) |

Fields shared by all scenes:

- `vo`: the voiceover line, also burned in as subtitles. Turn subtitles off per scene with `"captions": false`, or for the whole video at the top level.
- `visual`: what the picture should show; it appears on the placeholder and in the missing list.
- `focus: [x, y]`: the subject's position in percent, so 9:16 crops keep it in frame.
- `move`: `in`, `out`, `left`, `right`, `up` or `down`.
- `grade`: `neutral`, `warm`, `cool`, `night` or `thermal` (ironbow thermal-camera look).
- `foreground`: a transparent PNG cut-out for true depth.

## Design system

`src/brand/` holds the tokens (colours, spacing, type scale, easing curves), the bundled Heebo font (300 / 500 / 800, served from `assets/fonts`, so renders need no network) and the per-format safe areas. In 9:16, text stays clear of the platform's caption block at the bottom and its button column on the right.

Components live in `src/components/`: `KenBurns` (push-in with a sharp focus area over a softly blurred, slower background), `KineticTitle`, `EnergySweep` / `EnergyAmbient`, `StatCounter`, `ProjectCard`, `LogoOutro`, `Captions`, `LowerThird`, `Placeholder`.
