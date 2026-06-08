/**
 * Generates app icon (ICO) and NSIS installer images from build-assets/logo.png
 */
const sharp = require('sharp');
const png2icons = require('png2icons');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'build-assets', 'logo.png');
const OUT = path.join(__dirname, '..', 'build-assets');

async function run() {
  const srcBuf = fs.readFileSync(SRC);

  // ── 1. Generate ICO ───────────────────────────────────────────────────────
  const icoBuffer = png2icons.createICO(srcBuf, png2icons.BICUBIC, 0, true);
  fs.writeFileSync(path.join(OUT, 'icon.ico'), icoBuffer);
  console.log('✓ icon.ico');

  // ── 2. Installer sidebar BMP (164×314) — dark navy background + logo ──────
  const sidebarBg = new Jimp.Jimp({ width: 164, height: 314, color: 0x0D1526FF });
  const logoForSidebar = await Jimp.Jimp.read(SRC);
  logoForSidebar.resize({ w: 120, h: 120 });
  sidebarBg.composite(logoForSidebar, 22, 80);
  await sidebarBg.write(path.join(OUT, 'installer-sidebar.bmp'));
  console.log('✓ installer-sidebar.bmp');

  // ── 3. Installer header BMP (150×57) — white background + logo ───────────
  const headerBg = new Jimp.Jimp({ width: 150, height: 57, color: 0xFFFFFFFF });
  const logoForHeader = await Jimp.Jimp.read(SRC);
  logoForHeader.resize({ w: 44, h: 44 });
  headerBg.composite(logoForHeader, 6, 6);
  await headerBg.write(path.join(OUT, 'installer-header.bmp'));
  console.log('✓ installer-header.bmp');

  // ── 4. 512px PNG for app UI ───────────────────────────────────────────────
  await sharp(SRC)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT, 'logo-512.png'));
  console.log('✓ logo-512.png');

  console.log('\nAll assets generated successfully.');
}

run().catch(err => { console.error(err); process.exit(1); });
