/**
 * Universal File Converter - Express server
 * Handles DOCX/PPTX/XLSX → PDF, PDF → JPG/DOCX, JPG/PNG → PDF
 */

const path = require('path');
const fs = require('fs-extra');
const { execFile } = require('child_process');
const { promisify } = require('util');
const express = require('express');
const multer = require('multer');
const libre = require('libreoffice-convert');
const { PDFDocument } = require('pdf-lib');

const execFileAsync = promisify(execFile);
let pdfConvertPoppler;
try {
  const pdfPoppler = require('pdf-poppler');
  pdfConvertPoppler = pdfPoppler.convert ? pdfPoppler.convert.bind(pdfPoppler) : null;
} catch (_) {
  pdfConvertPoppler = null;
}

const libreConvert = promisify(libre.convert);
const isLinux = process.platform === 'linux';

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const OUTPUTS_DIR = path.join(__dirname, 'outputs');

// Ensure directories exist
async function ensureDirs() {
  await fs.ensureDir(UPLOADS_DIR);
  await fs.ensureDir(OUTPUTS_DIR);
}

// Multer config: 20MB max, store in uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const base = path.basename(file.originalname, ext);
    const unique = `${base}-${Date.now()}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
      'image/jpeg',
      'image/png',
    ];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('File type not supported. Use DOCX, PPTX, XLSX, PDF, JPG, or PNG.'));
  },
});

// --- Conversion helpers (defined before routes that use them) ---

/** Office (DOCX/PPTX/XLSX) → PDF via LibreOffice */
async function officeToPdf(inputPath, outputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  const allowed = ['.docx', '.pptx', '.xlsx'];
  if (!allowed.includes(ext)) throw new Error(`Unsupported office format: ${ext}`);
  const pdfBuffer = await libreConvert(fs.readFileSync(inputPath), '.pdf', undefined);
  await fs.writeFile(outputPath, pdfBuffer);
}

/** PDF → JPG (first page): use pdftoppm on Linux (Replit), else pdf-poppler */
async function pdfToJpg(inputPath, outputDir) {
  await fs.ensureDir(outputDir);
  const prefix = path.join(outputDir, 'page');

  if (isLinux) {
    // Replit/Linux: use system pdftoppm from poppler_utils
    await execFileAsync('pdftoppm', ['-jpeg', '-f', '1', '-l', '1', inputPath, prefix]);
    const firstPage = path.join(outputDir, 'page-1.jpg');
    if (!(await fs.pathExists(firstPage))) throw new Error('PDF to JPG conversion produced no output.');
    return firstPage;
  }

  if (pdfConvertPoppler) {
    const opts = { format: 'jpeg', out_dir: outputDir, out_prefix: 'page', page: 1 };
    await pdfConvertPoppler(inputPath, opts);
    const firstPage = path.join(outputDir, 'page-1.jpg');
    if (!(await fs.pathExists(firstPage))) throw new Error('PDF to JPG conversion produced no output.');
    return firstPage;
  }

  throw new Error('PDF to JPG not available on this system. Install poppler-utils (Linux) or use Windows/Mac.');
}

/** Resolve LibreOffice executable (Windows often has it installed but not in PATH) */
function getLibreOfficeCommand() {
  if (process.platform === 'win32') {
    const prog = process.env.PROGRAMFILES || 'C:\\Program Files';
    const prog86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const candidates = [
      path.join(prog, 'LibreOffice', 'program', 'soffice.exe'),
      path.join(prog86, 'LibreOffice', 'program', 'soffice.exe'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return 'soffice';
  }
  return 'libreoffice';
}

/** PDF → DOCX via LibreOffice headless. Uses path without spaces; --infilter forces Writer (DOCX export). */
async function pdfToDocx(inputPath, outputDir) {
  await fs.ensureDir(outputDir);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const tempDir = path.join(OUTPUTS_DIR, `lo_${Date.now()}`);
  await fs.ensureDir(tempDir);
  const tempPdf = path.join(tempDir, 'in.pdf');
  const tempDocx = path.join(tempDir, 'in.docx');
  const env = { ...process.env };
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  try {
    await fs.copy(inputPath, tempPdf);
    const liboCmd = getLibreOfficeCommand();
    await execFileAsync(liboCmd, [
      '--headless',
      '--infilter=writer_pdf_import',
      '--convert-to', 'docx',
      '--outdir', tempDir,
      tempPdf,
    ], { timeout: 60000, env });
    if (!(await fs.pathExists(tempDocx))) throw new Error('PDF to DOCX produced no output. Is LibreOffice installed?');
    const docxPath = path.join(outputDir, `${baseName}.docx`);
    await fs.move(tempDocx, docxPath, { overwrite: true });
    return docxPath;
  } finally {
    await fs.remove(tempDir).catch(() => {});
  }
}

/** Image (JPG/PNG) → PDF via pdf-lib */
async function imageToPdf(inputPath, outputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  const imageBytes = await fs.readFile(inputPath);
  const doc = await PDFDocument.create();
  const image = ext === '.png'
    ? await doc.embedPng(imageBytes)
    : await doc.embedJpg(imageBytes);
  const width = image.width;
  const height = image.height;
  const page = doc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  const pdfBytes = await doc.save();
  await fs.writeFile(outputPath, Buffer.from(pdfBytes));
}

// --- API routes (before static so POST /convert is always handled by this app) ---
app.post('/convert', upload.single('file'), async (req, res) => {
  let uploadPath = null;
  let outputPath = null;
  let outputDirForPdf = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const targetFormat = (req.body.targetFormat || '').toLowerCase().trim();
    if (!targetFormat) {
      return res.status(400).json({ error: 'targetFormat is required (pdf, jpg, or docx).' });
    }

    uploadPath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const baseName = path.basename(req.file.originalname, ext);
    const outBase = path.join(OUTPUTS_DIR, `${baseName}-${Date.now()}`);

    // Route by input type and target format
    if (['.docx', '.pptx', '.xlsx'].includes(ext) && targetFormat === 'pdf') {
      outputPath = `${outBase}.pdf`;
      await officeToPdf(uploadPath, outputPath);
    } else if (ext === '.pdf' && targetFormat === 'jpg') {
      outputDirForPdf = `${outBase}-pages`;
      await fs.ensureDir(outputDirForPdf);
      const firstPagePath = await pdfToJpg(uploadPath, outputDirForPdf);
      outputPath = firstPagePath;
    } else if (ext === '.pdf' && targetFormat === 'docx') {
      outputDirForPdf = `${outBase}-docx`;
      outputPath = await pdfToDocx(uploadPath, outputDirForPdf);
    } else if (['.jpg', '.jpeg', '.png'].includes(ext) && targetFormat === 'pdf') {
      outputPath = `${outBase}.pdf`;
      await imageToPdf(uploadPath, outputPath);
    } else {
      return res.status(400).json({
        error: `Unsupported conversion: ${ext} → ${targetFormat}. Supported: DOCX/PPTX/XLSX→PDF, PDF→JPG/DOCX, JPG/PNG→PDF.`,
      });
    }

    const filename = path.basename(outputPath);
    res.download(outputPath, filename, async (err) => {
      // Cleanup after send
      try {
        if (uploadPath && (await fs.pathExists(uploadPath))) await fs.remove(uploadPath);
        if (outputPath && (await fs.pathExists(outputPath))) await fs.remove(outputPath);
        if (outputDirForPdf && (await fs.pathExists(outputDirForPdf))) await fs.remove(outputDirForPdf);
      } catch (e) {
        console.error('Cleanup error:', e.message);
      }
    });
  } catch (err) {
    console.error('Convert error:', err);
    try {
      if (uploadPath && (await fs.pathExists(uploadPath))) await fs.remove(uploadPath);
      if (outputPath && (await fs.pathExists(outputPath))) await fs.remove(outputPath);
      if (outputDirForPdf && (await fs.pathExists(outputDirForPdf))) await fs.remove(outputDirForPdf);
    } catch (e) {
      console.error('Cleanup error:', e.message);
    }
    res.status(500).json({
      error: err.message || 'Conversion failed.',
    });
  }
});

// Health check for Replit
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve static frontend (after API routes so POST /convert is never treated as static)
app.use(express.static(path.join(__dirname, 'public')));

// Start server (try PORT, then PORT+1, ... if port in use)
async function start() {
  await ensureDirs();
  const maxTries = 5;
  let port = PORT;

  function tryListen(p) {
    return new Promise((resolve, reject) => {
      const server = app.listen(p, () => {
        console.log(`Universal File Converter running at http://localhost:${p}`);
        resolve();
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && p < PORT + maxTries) {
          tryListen(p + 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  await tryListen(port);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
