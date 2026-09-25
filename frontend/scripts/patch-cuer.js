const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../node_modules/cuer/_dist/QrCode.js');

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');
  if (content.includes('border: 0,')) {
    content = content.replace(
      /const grid = encodeQR\(value, 'raw', \{[\s\S]*?border: 0,[\s\S]*?\}\);/,
      `const raw = encodeQR(value, 'raw', {
        border: 1,
        ecc: errorCorrection,
        scale: 1,
        version: version,
    });
    const grid = raw.slice(1, -1).map((row) => row.slice(1, -1));`
    );
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('[patch-cuer] Successfully patched cuer QrCode.js to prevent invalid border=0');
  } else {
    console.log('[patch-cuer] cuer QrCode.js is already patched.');
  }
} else {
  console.log('[patch-cuer] cuer module not found, skipping patch.');
}
