// Generates placeholder app icon + splash source images (brand blue + "자").
// Replace assets/icon.png (1024) and assets/splash*.png (2732) with real
// artwork, then run `npm run cap:assets` to regenerate native resources.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const OUT = "assets";
mkdirSync(OUT, { recursive: true });
const FONT = "Apple SD Gothic Neo, AppleGothic, Pretendard, sans-serif";

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#1A56DB"/>
  <text x="512" y="690" font-family="${FONT}" font-size="500" font-weight="800" fill="#FFFFFF" text-anchor="middle">자</text>
</svg>`;

const splash = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="${bg}"/>
  <g transform="translate(1006,1006)">
    <rect width="720" height="720" rx="160" fill="#1A56DB"/>
    <text x="360" y="510" font-family="${FONT}" font-size="460" font-weight="800" fill="#FFFFFF" text-anchor="middle">자</text>
  </g>
</svg>`;

await sharp(Buffer.from(icon)).png().toFile(`${OUT}/icon.png`);
await sharp(Buffer.from(splash("#FAFAF8"))).png().toFile(`${OUT}/splash.png`);
await sharp(Buffer.from(splash("#16181D"))).png().toFile(`${OUT}/splash-dark.png`);
console.log("generated assets/icon.png (1024), splash.png + splash-dark.png (2732)");
