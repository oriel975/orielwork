// Config for `remotion studio` / `remotion render`. The npm render scripts use
// scripts/render.mjs, which mirrors these settings for the programmatic API.
import {Config} from '@remotion/cli/config';
import {existsSync} from 'node:fs';

// Media lives in assets/ (per company), so staticFile('ev/charger.jpg') works.
Config.setPublicDir('./assets');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
Config.setConcurrency(null);

// In the cloud container a headless Chromium is preinstalled; locally Remotion
// downloads its own on first run.
const preinstalled = process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell';
if (existsSync(preinstalled)) {
  Config.setBrowserExecutable(preinstalled);
}
