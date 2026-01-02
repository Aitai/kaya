#!/usr/bin/env bun

/**
 * Generate Tauri app icons from SVG logo
 * Uses sharp library for cross-platform image conversion
 *
 * Usage: bun run generate-icons
 */

import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const SVG_LOGO = join(process.cwd(), 'public/logo.svg');
const SVG_DARK = join(process.cwd(), 'public/logo-dark.svg');
const SVG_FAVICON = join(process.cwd(), 'public/favicon.svg');
const SVG_APP_ICON = join(process.cwd(), 'public/app-icon.svg'); // Scaled version for app icons
const ICONS_DIR = join(process.cwd(), 'apps/desktop/src-tauri/icons');
const WEB_PUBLIC_DIR = join(process.cwd(), 'apps/web/public');
const DESKTOP_PUBLIC_DIR = join(process.cwd(), 'apps/desktop/public');

// Icon sizes needed for Tauri
const SIZES = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
];

async function generateIcons() {
  console.log('🎨 Generating Kaya app icons from SVG logos');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Ensure directories exist
    mkdirSync(ICONS_DIR, { recursive: true });
    mkdirSync(WEB_PUBLIC_DIR, { recursive: true });
    mkdirSync(DESKTOP_PUBLIC_DIR, { recursive: true });

    // Read SVG logos - use app-icon.svg for desktop icons (scaled to fill canvas)
    const appIconBuffer = readFileSync(SVG_APP_ICON);
    const svgBuffer = readFileSync(SVG_LOGO);
    console.log(`📄 App Icon Source: ${SVG_APP_ICON}`);
    console.log(`📄 Logo Source: ${SVG_LOGO}\n`);

    // === COPY SVG LOGOS TO APPS ===
    console.log('📋 Copying SVG logos to apps:');

    // Desktop app
    copyFileSync(SVG_LOGO, join(DESKTOP_PUBLIC_DIR, 'logo.svg'));
    copyFileSync(SVG_DARK, join(DESKTOP_PUBLIC_DIR, 'logo-dark.svg'));
    copyFileSync(SVG_FAVICON, join(DESKTOP_PUBLIC_DIR, 'favicon.svg'));
    console.log('   ✓ Desktop app: logo.svg, logo-dark.svg, favicon.svg');

    // Web app
    copyFileSync(SVG_LOGO, join(WEB_PUBLIC_DIR, 'logo.svg'));
    copyFileSync(SVG_DARK, join(WEB_PUBLIC_DIR, 'logo-dark.svg'));
    copyFileSync(SVG_FAVICON, join(WEB_PUBLIC_DIR, 'favicon.svg'));
    console.log('   ✓ Web app: logo.svg, logo-dark.svg, favicon.svg');

    // === GENERATE PNG ICONS FOR TAURI ===
    console.log('\n📦 Generating PNG icons for Tauri:');
    for (const { name, size } of SIZES) {
      const outputPath = join(ICONS_DIR, name);

      await sharp(appIconBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent
        })
        .png()
        .toFile(outputPath);

      console.log(`   ✓ ${name} (${size}×${size})`);
    }

    // Generate ICNS for macOS using iconutil (macOS only) or PNG fallback
    console.log('\n🍎 Generating macOS icon (ICNS):');
    const icnsPath = join(ICONS_DIR, 'icon.icns');
    const isMacOS = process.platform === 'darwin';

    if (isMacOS) {
      // Use iconutil to create proper ICNS file
      const iconsetPath = join(ICONS_DIR, 'icon.iconset');
      mkdirSync(iconsetPath, { recursive: true });

      // macOS iconset requires specific sizes
      const iconsetSizes = [
        { name: 'icon_16x16.png', size: 16 },
        { name: 'icon_16x16@2x.png', size: 32 },
        { name: 'icon_32x32.png', size: 32 },
        { name: 'icon_32x32@2x.png', size: 64 },
        { name: 'icon_128x128.png', size: 128 },
        { name: 'icon_128x128@2x.png', size: 256 },
        { name: 'icon_256x256.png', size: 256 },
        { name: 'icon_256x256@2x.png', size: 512 },
        { name: 'icon_512x512.png', size: 512 },
        { name: 'icon_512x512@2x.png', size: 1024 },
      ];

      for (const { name, size } of iconsetSizes) {
        await sharp(appIconBuffer)
          .resize(size, size, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toFile(join(iconsetPath, name));
      }

      // Use iconutil to create ICNS
      try {
        execSync(`iconutil -c icns "${iconsetPath}" -o "${icnsPath}"`, { stdio: 'pipe' });
        console.log(`   ✓ icon.icns (created with iconutil)`);
        // Clean up iconset folder
        execSync(`rm -rf "${iconsetPath}"`, { stdio: 'pipe' });
      } catch {
        console.log(`   ⚠ iconutil failed, using PNG fallback for icon.icns`);
        const icon512Buffer = await sharp(appIconBuffer)
          .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer();
        writeFileSync(icnsPath, icon512Buffer);
      }
    } else {
      // Non-macOS: write PNG as fallback (Tauri handles conversion)
      const icon512Buffer = await sharp(appIconBuffer)
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      writeFileSync(icnsPath, icon512Buffer);
      console.log(`   ✓ icon.icns (PNG fallback - run on macOS for proper ICNS)`);
    }

    // Generate ICO for Windows (multiple sizes)
    console.log('\n🪟 Generating Windows icon (ICO):');
    const icoPath = join(ICONS_DIR, 'icon.ico');

    const icoSizes = [16, 32, 48, 64, 128, 256];
    const icoBuffers: Buffer[] = [];

    for (const size of icoSizes) {
      const buf = await sharp(appIconBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      icoBuffers.push(buf);
    }

    const icoBuffer = bufferToIco(icoBuffers);
    writeFileSync(icoPath, icoBuffer);
    console.log(`   ✓ icon.ico (sizes: ${icoSizes.join(', ')})`);

    // === GENERATE FAVICON PNGs FOR WEB (Fallback) ===
    console.log('\n🌐 Generating PNG favicons (fallback):');

    // 32x32 favicon PNG fallback for older browsers
    await sharp(svgBuffer).resize(32, 32).png().toFile(join(WEB_PUBLIC_DIR, 'favicon.png'));
    console.log('   ✓ Web app: favicon.png (32×32 fallback)');

    // App icon for web app (512x512)
    await sharp(svgBuffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(join(WEB_PUBLIC_DIR, 'icon.png'));
    console.log('   ✓ Web app: icon.png (512×512)');

    // Favicon PNG for desktop app (fallback)
    await sharp(svgBuffer).resize(32, 32).png().toFile(join(DESKTOP_PUBLIC_DIR, 'favicon.png'));
    console.log('   ✓ Desktop app: favicon.png (32×32 fallback)');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All icons generated successfully!');
    console.log('\n💡 Next steps:');
    console.log('   • Restart dev server: bun run dev:desktop');
    console.log('   • For favicon: Hard refresh browser (Cmd+Shift+R)');
    console.log('   • macOS Dock: May need to restart app or clear cache');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

// Sharp does not support writing ICO files directly.
// This function creates a valid ICO container for PNG images,
// which is supported by Windows Vista and later.
function bufferToIco(pngBuffers: Buffer[]) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type (1 = ICO)
  header.writeUInt16LE(count, 4); // Count

  let offset = 6 + 16 * count;
  const directory = Buffer.alloc(16 * count);

  let currentDirectoryOffset = 0;
  for (const png of pngBuffers) {
    // PNG IHDR is at offset 8, width at 16, height at 20 (Big Endian)
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const size = png.length;

    directory.writeUInt8(width >= 256 ? 0 : width, currentDirectoryOffset);
    directory.writeUInt8(height >= 256 ? 0 : height, currentDirectoryOffset + 1);
    directory.writeUInt8(0, currentDirectoryOffset + 2); // Palette count
    directory.writeUInt8(0, currentDirectoryOffset + 3); // Reserved
    directory.writeUInt16LE(1, currentDirectoryOffset + 4); // Color planes
    directory.writeUInt16LE(32, currentDirectoryOffset + 6); // Bits per pixel
    directory.writeUInt32LE(size, currentDirectoryOffset + 8); // Size
    directory.writeUInt32LE(offset, currentDirectoryOffset + 12); // Offset

    offset += size;
    currentDirectoryOffset += 16;
  }

  return Buffer.concat([header, directory, ...pngBuffers]);
}

generateIcons();
