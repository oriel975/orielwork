# Interplus marketing videos

Remotion (React + TypeScript) project for the Interplus group brand films and reels. Hebrew, right to left. Each video is one JSON file, and every video renders in three formats:

| Format | Size | For |
| --- | --- | --- |
| `16x9` | 1920×1080 | LinkedIn, YouTube, website |
| `9x16` | 1080×1920 | Reels, TikTok, Shorts |
| `1x1` | 1080×1080 | Feed |

All three run at 30 fps.

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
| `npm run logo-colors` | Samples the logo's real colours into `src/brand/logo-palette.json` |
| `npm run placeholders` | Regenerates the drawn placeholder images |

Every render also writes `out/<company>/<id>-missing.md`, which lists the photos, voiceovers, music and logo still to supply.

## Assets

```
assets/
  installations/  ev/  enerlec/  systems/  b/  group/   photos and clips per company
  <company>/vo/                                          voiceover per scene
  logos/                                                 interplus.svg, <company>.svg (or transparent PNG)
  music/                                                 licensed tracks only
  placeholders/                                          drawn stand-ins for the style test
```

- **Missing files never break a render.** A scene whose photo isn't there yet shows a quiet animated placeholder labelled with what belongs there.
- **Voiceover:** name the file `<company>/vo/<video id>-<scene number>.mp3` (or `.wav` / `.m4a`), e.g. `installations/vo/installations-brand-02.mp3`. It is picked up automatically: the music ducks under it (about 12 dB) and the subtitles are timed to its length. Set `voFile` on a scene to use another name.
- **Logo:** `logos/<company>.svg`, falling back to `logos/interplus.svg`. Until one exists, a typographic wordmark from `brandName` is used. After adding the logo, run `npm run logo-colors` so the navy and blue tokens match it.

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
