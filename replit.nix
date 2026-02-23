# Replit system dependencies for Universal File Converter
# LibreOffice: DOCX/PPTX/XLSX → PDF
# Poppler is bundled with pdf-poppler on Windows/Mac; on Linux Replit we add it for pdftoppm/pdftocairo if needed
{ pkgs }: {
  deps = [
    pkgs.libreoffice
    pkgs.poppler_utils
  ];
}
