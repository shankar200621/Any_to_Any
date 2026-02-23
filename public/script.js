/**
 * Universal File Converter - Frontend
 * Drag & drop, format selection, convert, auto-download
 */

const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameEl = fileInfo.querySelector('.file-name');
const clearFileBtn = document.getElementById('clearFile');
const targetFormatSelect = document.getElementById('targetFormat');
const convertBtn = document.getElementById('convertBtn');
const spinner = document.getElementById('spinner');
const messageEl = document.getElementById('message');
const downloadLink = document.getElementById('downloadLink');
const formatHint = document.getElementById('formatHint');

let selectedFile = null;

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = 'message ' + (type === 'error' ? 'error' : 'success');
  messageEl.classList.remove('hidden');
}

function hideMessage() {
  messageEl.classList.add('hidden');
}

function showSpinner(show) {
  spinner.classList.toggle('hidden', !show);
}

function setConvertEnabled() {
  const hasFile = selectedFile != null;
  const hasFormat = targetFormatSelect.value !== '';
  convertBtn.disabled = !hasFile || !hasFormat;
}

function setFile(file) {
  if (!file) {
    selectedFile = null;
    fileInfo.classList.add('hidden');
    fileInput.value = '';
    setConvertEnabled();
    return;
  }

  if (file.size > MAX_SIZE_BYTES) {
    showMessage(`File is too large. Maximum size is ${MAX_SIZE_MB}MB.`, 'error');
    return;
  }

  const allowed = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'image/jpeg',
    'image/png',
  ];
  if (!allowed.includes(file.type)) {
    showMessage('File type not supported. Use DOCX, PPTX, XLSX, PDF, JPG, or PNG.', 'error');
    return;
  }

  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileInfo.classList.remove('hidden');
  hideMessage();
  updateFormatOptions();
}

// Drag & drop
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) setFile(file);
});

clearFileBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setFile(null);
  updateFormatOptions();
});

targetFormatSelect.addEventListener('change', () => {
  hideMessage();
  setConvertEnabled();
});

function updateFormatOptions() {
  const opt = targetFormatSelect;
  const pdfOpt = opt.querySelector('option[value="pdf"]');
  const jpgOpt = opt.querySelector('option[value="jpg"]');
  const docxOpt = opt.querySelector('option[value="docx"]');
  if (!selectedFile) {
    opt.value = '';
    pdfOpt.disabled = false;
    jpgOpt.disabled = false;
    if (docxOpt) docxOpt.disabled = false;
    formatHint.classList.add('hidden');
    formatHint.textContent = '';
    setConvertEnabled();
    return;
  }
  const name = (selectedFile.name || '').toLowerCase();
  if (name.endsWith('.docx') || name.endsWith('.pptx') || name.endsWith('.xlsx')) {
    pdfOpt.disabled = false;
    jpgOpt.disabled = true;
    if (docxOpt) docxOpt.disabled = true;
    if (opt.value === 'jpg' || opt.value === 'docx') opt.value = 'pdf';
    formatHint.classList.add('hidden');
    formatHint.textContent = '';
  } else if (name.endsWith('.pdf')) {
    pdfOpt.disabled = true;
    jpgOpt.disabled = false;
    if (docxOpt) docxOpt.disabled = false;
    if (opt.value === 'pdf') opt.value = 'jpg';
    formatHint.classList.remove('hidden');
    formatHint.textContent = 'From PDF you can convert to JPG image (first page) or DOCX document.';
  } else if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')) {
    pdfOpt.disabled = false;
    jpgOpt.disabled = true;
    if (docxOpt) docxOpt.disabled = true;
    if (opt.value === 'jpg' || opt.value === 'docx') opt.value = 'pdf';
    formatHint.classList.add('hidden');
    formatHint.textContent = '';
  } else {
    pdfOpt.disabled = false;
    jpgOpt.disabled = false;
    if (docxOpt) docxOpt.disabled = false;
    formatHint.classList.add('hidden');
    formatHint.textContent = '';
  }
  setConvertEnabled();
}

// Convert
convertBtn.addEventListener('click', async () => {
  if (!selectedFile || !targetFormatSelect.value) return;

  hideMessage();
  downloadLink.classList.add('hidden');
  showSpinner(true);
  convertBtn.disabled = true;

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('targetFormat', targetFormatSelect.value);

  try {
    const res = await fetch('/convert', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Server error: ${res.status}`);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition');
    let outName = 'converted';
    if (disposition) {
      const match = disposition.match(/filename="?([^";\n]+)"?/);
      if (match) outName = match[1].trim();
    }
    const ext = targetFormatSelect.value || 'pdf';
    if (!outName.toLowerCase().endsWith('.' + ext)) outName += '.' + ext;

    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = outName;
    downloadLink.classList.remove('hidden');
    downloadLink.click();

    showMessage('Conversion complete. Download complete.', 'success');
    setTimeout(() => URL.revokeObjectURL(url), 100);

    // Reset success area and form after a short delay so user can convert again
    setTimeout(() => {
      hideMessage();
      downloadLink.classList.add('hidden');
      downloadLink.href = '#';
      downloadLink.download = '';
      setFile(null);
      targetFormatSelect.value = '';
      updateFormatOptions();
    }, 3500);
  } catch (err) {
    showMessage(err.message || 'Conversion failed.', 'error');
  } finally {
    showSpinner(false);
    setConvertEnabled();
  }
});
