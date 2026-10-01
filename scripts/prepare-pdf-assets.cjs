const fs = require('node:fs');
const path = require('node:path');
const source = path.dirname(require.resolve('pdfjs-dist/package.json'));
const target = path.resolve(__dirname, '../public/pdfjs');
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(path.join(source, 'build/pdf.worker.min.mjs'), path.join(target, 'pdf.worker.min.mjs'));
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(target, 'LICENSE'));
for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) fs.cpSync(path.join(source, directory), path.join(target, directory), { recursive: true });

const ocr = path.dirname(require.resolve('tesseract.js/package.json'));
if (require(path.join(ocr, 'package.json')).version !== '7.0.0') throw new Error('Retest the OCR worker protocol before changing Tesseract.js versions.');
const core = path.dirname(require.resolve('tesseract.js-core/package.json'));
const ocrTarget = path.resolve(__dirname, '../public/ocr');
fs.mkdirSync(path.join(ocrTarget, 'core'), { recursive: true });
fs.copyFileSync(path.join(ocr, 'dist/worker.min.js'), path.join(ocrTarget, 'worker.min.js'));
fs.copyFileSync(path.join(ocr, 'LICENSE.md'), path.join(ocrTarget, 'LICENSE.md'));
fs.copyFileSync(path.join(core, 'LICENSE'), path.join(ocrTarget, 'core/LICENSE'));
for (const file of fs.readdirSync(core).filter(file => /\.wasm(?:\.js)?$/.test(file))) fs.copyFileSync(path.join(core, file), path.join(ocrTarget, 'core', file));
