const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const qualyraFaviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#141922" />
      <stop offset="100%" stop-color="#080A0E" />
    </radialGradient>
  </defs>

  <!-- Circular background badge for crisp high contrast on both light and dark browser tabs -->
  <circle cx="512" cy="512" r="504" fill="url(#bgGrad)" stroke="#AED43C" stroke-width="20" stroke-opacity="0.4" />

  <!-- Centered Qualyra Logo (Q-Ring in White, Sprout & Tail in signature brand green #AED43C) -->
  <g transform="translate(128, 128) scale(0.75)">
    <!-- Outer Q Ring in White -->
    <path
      d="M 470.0 84.0 L 521.0 86.0 L 528.0 88.0 L 561.0 92.0 L 598.0 102.0 L 602.0 102.0 L 605.0 104.0 L 644.0 117.0 L 684.0 136.0 L 716.0 155.0 L 752.0 181.0 L 777.0 203.0 L 808.0 235.0 L 837.0 272.0 L 859.0 307.0 L 880.0 349.0 L 896.0 392.0 L 898.0 403.0 L 906.0 429.0 L 909.0 452.0 L 913.0 470.0 L 915.0 510.0 L 916.0 511.0 L 915.0 557.0 L 913.0 566.0 L 910.0 598.0 L 906.0 612.0 L 901.0 639.0 L 890.0 670.0 L 888.0 679.0 L 867.0 725.0 L 754.0 612.0 L 765.0 570.0 L 765.0 562.0 L 766.0 561.0 L 767.0 545.0 L 768.0 544.0 L 768.0 508.0 L 767.0 507.0 L 767.0 494.0 L 766.0 493.0 L 766.0 485.0 L 765.0 484.0 L 763.0 467.0 L 753.0 430.0 L 751.0 427.0 L 745.0 409.0 L 733.0 386.0 L 732.0 382.0 L 726.0 374.0 L 717.0 358.0 L 701.0 337.0 L 674.0 309.0 L 658.0 295.0 L 636.0 279.0 L 614.0 266.0 L 584.0 252.0 L 567.0 247.0 L 558.0 243.0 L 550.0 242.0 L 533.0 237.0 L 508.0 234.0 L 507.0 233.0 L 492.0 233.0 L 491.0 232.0 L 461.0 232.0 L 460.0 233.0 L 446.0 233.0 L 445.0 234.0 L 431.0 235.0 L 391.0 244.0 L 388.0 246.0 L 366.0 253.0 L 342.0 265.0 L 340.0 265.0 L 318.0 278.0 L 293.0 296.0 L 275.0 312.0 L 253.0 335.0 L 234.0 360.0 L 230.0 368.0 L 221.0 381.0 L 209.0 405.0 L 203.0 420.0 L 191.0 459.0 L 187.0 486.0 L 186.0 487.0 L 185.0 511.0 L 184.0 512.0 L 184.0 531.0 L 185.0 532.0 L 186.0 559.0 L 187.0 560.0 L 188.0 574.0 L 190.0 579.0 L 194.0 601.0 L 203.0 628.0 L 217.0 659.0 L 223.0 668.0 L 227.0 677.0 L 247.0 705.0 L 257.0 717.0 L 284.0 744.0 L 304.0 760.0 L 328.0 776.0 L 355.0 790.0 L 367.0 794.0 L 372.0 797.0 L 407.0 808.0 L 432.0 813.0 L 460.0 815.0 L 461.0 816.0 L 502.0 815.0 L 503.0 814.0 L 520.0 813.0 L 549.0 807.0 L 575.0 799.0 L 599.0 789.0 L 706.0 898.0 L 659.0 924.0 L 619.0 940.0 L 616.0 940.0 L 606.0 944.0 L 603.0 944.0 L 578.0 952.0 L 573.0 952.0 L 542.0 959.0 L 503.0 962.0 L 502.0 963.0 L 450.0 963.0 L 449.0 962.0 L 410.0 959.0 L 405.0 957.0 L 370.0 951.0 L 363.0 948.0 L 330.0 939.0 L 315.0 932.0 L 293.0 924.0 L 251.0 902.0 L 222.0 882.0 L 219.0 881.0 L 184.0 853.0 L 150.0 819.0 L 128.0 793.0 L 103.0 757.0 L 79.0 713.0 L 76.0 704.0 L 65.0 681.0 L 61.0 666.0 L 52.0 641.0 L 45.0 606.0 L 43.0 601.0 L 39.0 564.0 L 38.0 563.0 L 38.0 552.0 L 37.0 551.0 L 37.0 501.0 L 38.0 500.0 L 39.0 473.0 L 40.0 472.0 L 40.0 466.0 L 43.0 454.0 L 46.0 431.0 L 59.0 384.0 L 72.0 350.0 L 91.0 311.0 L 114.0 274.0 L 139.0 241.0 L 149.0 230.0 L 173.0 205.0 L 199.0 182.0 L 229.0 160.0 L 270.0 135.0 L 304.0 119.0 L 351.0 102.0 L 387.0 93.0 L 417.0 89.0 L 418.0 88.0 L 424.0 88.0 L 425.0 87.0 L 431.0 87.0 L 432.0 86.0 L 469.0 85.0 L 470.0 84.0 Z"
      fill="#FFFFFF"
    />
    <!-- Q Tail in Brand Green -->
    <path
      d="M 488.0 627.0 L 723.0 627.0 L 991.0 917.0 L 1006.0 935.0 L 795.0 935.0 L 599.0 727.0 L 595.0 728.0 L 584.0 735.0 L 551.0 747.0 L 519.0 755.0 L 489.0 759.0 L 489.0 652.0 L 488.0 651.0 L 488.0 627.0 Z"
      fill="#AED43C"
    />
    <!-- Seedling / Sprout in Brand Green -->
    <path
      d="M 605.0 328.0 L 631.0 328.0 L 647.0 331.0 L 685.0 335.0 L 685.0 336.0 L 652.0 373.0 L 633.0 398.0 L 615.0 426.0 L 600.0 440.0 L 589.0 447.0 L 562.0 454.0 L 549.0 455.0 L 548.0 456.0 L 515.0 456.0 L 514.0 455.0 L 509.0 455.0 L 508.0 456.0 L 487.0 519.0 L 486.0 532.0 L 484.0 539.0 L 484.0 548.0 L 483.0 549.0 L 483.0 563.0 L 482.0 564.0 L 483.0 760.0 L 449.0 759.0 L 450.0 573.0 L 451.0 572.0 L 451.0 536.0 L 450.0 534.0 L 430.0 505.0 L 429.0 506.0 L 421.0 506.0 L 411.0 508.0 L 398.0 508.0 L 397.0 509.0 L 378.0 507.0 L 360.0 501.0 L 333.0 486.0 L 316.0 469.0 L 304.0 450.0 L 290.0 431.0 L 259.0 399.0 L 264.0 397.0 L 275.0 396.0 L 281.0 394.0 L 291.0 394.0 L 292.0 393.0 L 337.0 393.0 L 338.0 394.0 L 347.0 394.0 L 348.0 395.0 L 371.0 398.0 L 392.0 404.0 L 402.0 409.0 L 408.0 413.0 L 417.0 422.0 L 426.0 434.0 L 436.0 454.0 L 442.0 475.0 L 420.0 456.0 L 397.0 443.0 L 372.0 435.0 L 367.0 435.0 L 366.0 434.0 L 361.0 434.0 L 360.0 435.0 L 392.0 457.0 L 416.0 476.0 L 457.0 513.0 L 459.0 511.0 L 460.0 507.0 L 474.0 481.0 L 486.0 463.0 L 509.0 435.0 L 535.0 409.0 L 595.0 364.0 L 592.0 363.0 L 589.0 365.0 L 570.0 371.0 L 543.0 384.0 L 524.0 395.0 L 493.0 418.0 L 519.0 376.0 L 532.0 361.0 L 547.0 349.0 L 573.0 336.0 L 588.0 331.0 L 593.0 331.0 L 605.0 328.0 Z"
      fill="#AED43C"
    />
  </g>
</svg>`;

function createIcoBuffer(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + entrySize * count;

  const outHeader = Buffer.alloc(headerSize);
  outHeader.writeUInt16LE(0, 0);
  outHeader.writeUInt16LE(1, 2);
  outHeader.writeUInt16LE(count, 4);

  const entryBuffers = [];
  const imageBuffers = [];

  for (const img of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);

    entryBuffers.push(entry);
    imageBuffers.push(img.buffer);
    offset += img.buffer.length;
  }

  return Buffer.concat([outHeader, ...entryBuffers, ...imageBuffers]);
}

async function run() {
  const root = path.resolve(__dirname, '..');
  const appDir = path.join(root, 'app');
  const pubDir = path.join(root, 'public');

  // 1. Write SVG icons
  fs.writeFileSync(path.join(appDir, 'icon.svg'), qualyraFaviconSvg, 'utf8');
  fs.writeFileSync(path.join(pubDir, 'icon.svg'), qualyraFaviconSvg, 'utf8');
  fs.writeFileSync(path.join(pubDir, 'logo.svg'), qualyraFaviconSvg, 'utf8');

  // 2. Generate PNGs
  const svgBuf = Buffer.from(qualyraFaviconSvg);

  const [png16, png32, png48, png180, png192, png512] = await Promise.all([
    sharp(svgBuf).resize(16, 16).png().toBuffer(),
    sharp(svgBuf).resize(32, 32).png().toBuffer(),
    sharp(svgBuf).resize(48, 48).png().toBuffer(),
    sharp(svgBuf).resize(180, 180).png().toBuffer(),
    sharp(svgBuf).resize(192, 192).png().toBuffer(),
    sharp(svgBuf).resize(512, 512).png().toBuffer(),
  ]);

  // 3. Create ICO from 16, 32, 48
  const icoBuf = createIcoBuffer([
    { width: 16, height: 16, buffer: png16 },
    { width: 32, height: 32, buffer: png32 },
    { width: 48, height: 48, buffer: png48 },
  ]);

  fs.writeFileSync(path.join(appDir, 'favicon.ico'), icoBuf);
  fs.writeFileSync(path.join(pubDir, 'favicon.ico'), icoBuf);
  fs.writeFileSync(path.join(appDir, 'apple-icon.png'), png180);
  fs.writeFileSync(path.join(pubDir, 'apple-icon.png'), png180);
  fs.writeFileSync(path.join(pubDir, 'icon-192.png'), png192);
  fs.writeFileSync(path.join(pubDir, 'icon-512.png'), png512);

  console.log('SUCCESS: All Qualyra favicons generated successfully!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
