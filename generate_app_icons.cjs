const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'public', 'favicon.svg');
console.log('Reading SVG from:', svgPath);

const sizes = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
  { dir: 'drawable', size: 512 },
];

async function generateIconsForAndroid(targetBaseDir) {
  for (const { dir, size } of sizes) {
    const outDir = path.join(targetBaseDir, dir);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    
    await sharp(svgPath).resize(size, size).png().toFile(path.join(outDir, 'ic_launcher.png'));
    await sharp(svgPath).resize(size, size).png().toFile(path.join(outDir, 'ic_launcher_round.png'));
    await sharp(svgPath).resize(size, size).png().toFile(path.join(outDir, 'ic_launcher_foreground.png'));
    console.log(`Generated ${size}x${size} icon in ${outDir}`);
  }
}

async function main() {
  await sharp(svgPath).resize(512, 512).png().toFile(path.join(__dirname, 'public', 'icon-512.png'));
  await sharp(svgPath).resize(192, 192).png().toFile(path.join(__dirname, 'public', 'icon-192.png'));
  await sharp(svgPath).resize(512, 512).png().toFile(path.join(__dirname, 'public', 'logo.png'));
  
  const androidRes = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(androidRes)) {
    await generateIconsForAndroid(androidRes);
  }

  const rootAndroidRes = path.join(__dirname, '..', 'mahistream-android', 'app', 'src', 'main', 'res');
  if (fs.existsSync(rootAndroidRes)) {
    await generateIconsForAndroid(rootAndroidRes);
  }

  console.log('App icons generated successfully!');
}

main().catch(console.error);
module.exports = { generateIconsForAndroid };
