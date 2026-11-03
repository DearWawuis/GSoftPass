// build-extension.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const distDir = path.join(__dirname, 'dist');
const extDir = path.join(__dirname, 'extension');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Función que genera un PNG binario 100% real (Escudo Cyan/Slate GSoftPass)
// en caso de que el archivo sea un JPG renombrado o no tenga firma PNG válida
function createValidPngBuffer(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
    }
    return (c ^ -1) >>> 0;
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawData = Buffer.alloc(size * (size * 4 + 1));
  const center = size / 2;
  const radius = size * 0.42;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    rawData[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Fondo redondeado Slate (#0B0F19) con borde e interior de escudo Cyan (#06B6D4)
      if (dist > size * 0.48) {
        rawData[px] = 0;
        rawData[px + 1] = 0;
        rawData[px + 2] = 0;
        rawData[px + 3] = 0;
      } else if (dist > radius * 0.78 && dist < radius) {
        rawData[px] = 6;
        rawData[px + 1] = 182;
        rawData[px + 2] = 212;
        rawData[px + 3] = 255;
      } else if (dist < radius * 0.35) {
        rawData[px] = 6;
        rawData[px + 1] = 182;
        rawData[px + 2] = 212;
        rawData[px + 3] = 255;
      } else {
        rawData[px] = 15;
        rawData[px + 1] = 23;
        rawData[px + 2] = 42;
        rawData[px + 3] = 255;
      }
    }
  }

  const idat = zlib.deflateSync(rawData);
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', iend),
  ]);
}

// 1. Copiar archivos de extension/ a dist/
if (fs.existsSync(extDir)) {
  fs.cpSync(extDir, distDir, { recursive: true, force: true });
}

// 2. Verificar si assets/icon.png es un PNG real (cabecera 0x89 0x50 0x4E 0x47)
const assetIcon = path.join(__dirname, 'assets', 'icon.png');
let hasRealPng = false;

if (fs.existsSync(assetIcon)) {
  const header = fs.readFileSync(assetIcon).subarray(0, 4);
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
    hasRealPng = true;
    ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png', 'icon.png'].forEach((name) => {
      fs.copyFileSync(assetIcon, path.join(distDir, name));
    });
  }
}

// Si el archivo era un JPG renombrado o no existía, creamos los PNGs reales en todos los tamaños
if (!hasRealPng) {
  console.log('⚠️ Creando archivos PNG binarios puros (16, 32, 48, 128px) para Microsoft Edge...');
  fs.writeFileSync(path.join(distDir, 'icon-16.png'), createValidPngBuffer(16));
  fs.writeFileSync(path.join(distDir, 'icon-32.png'), createValidPngBuffer(32));
  fs.writeFileSync(path.join(distDir, 'icon-48.png'), createValidPngBuffer(48));
  fs.writeFileSync(path.join(distDir, 'icon-128.png'), createValidPngBuffer(128));
  fs.writeFileSync(path.join(distDir, 'icon.png'), createValidPngBuffer(128));
}

// 3. Escribir manifest.json garantizando las rutas de iconos en la barra de Edge
const manifestData = {
  manifest_version: 3,
  name: 'GSoftPass - Gestor de Contraseñas Zero-Knowledge',
  version: '1.0.1',
  description: 'Autocompletado inteligente, Passkeys, generador seguro y bóveda cifrada AES-256.',
  icons: {
    '16': 'icon-16.png',
    '32': 'icon-32.png',
    '48': 'icon-48.png',
    '128': 'icon-128.png',
  },
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
  background: {
    service_worker: 'background.js',
  },
  action: {
    default_title: 'GSoftPass',
    default_popup: 'index.html',
    default_icon: {
      '16': 'icon-16.png',
      '32': 'icon-32.png',
      '48': 'icon-48.png',
      '128': 'icon-128.png',
    },
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['contentScript.js'],
      run_at: 'document_idle',
    },
  ],
};

fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifestData, null, 2), 'utf8');

// 4. Renombrar _expo a expo
const underscoreExpo = path.join(distDir, '_expo');
const cleanExpo = path.join(distDir, 'expo');
if (fs.existsSync(underscoreExpo)) {
  if (fs.existsSync(cleanExpo)) {
    fs.rmSync(cleanExpo, { recursive: true, force: true });
  }
  fs.renameSync(underscoreExpo, cleanExpo);
}

// 5. Ajustar index.html para el Pop-up (450x620)
const indexPath = path.join(distDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(/\/_expo\//g, '/expo/');

  if (!html.includes('min-width: 450px')) {
    const popupStyle = `
      <style>
        html, body, #root {
          width: 450px !important;
          min-width: 450px !important;
          height: 620px !important;
          min-height: 620px !important;
          margin: 0 !important;
          padding: 0 !important;
          background-color: #0B0F19 !important;
          overflow-x: hidden !important;
          overflow-y: auto !important;
        }
      </style>
    </head>`;
    html = html.replace('</head>', popupStyle);
  }
  fs.writeFileSync(indexPath, html, 'utf8');
}

console.log('✅ Extensión GSoftPass e iconos PNG reales generados correctamente en dist/');