# Any_to_Any

Web app to convert between DOCX, PPTX, XLSX, PDF, JPG, and PNG. Runs on Replit or locally with Node.js.

## Supported conversions

| From   | To  |
|--------|-----|
| DOCX   | PDF |
| PPTX   | PDF |
| XLSX   | PDF |
| PDF    | JPG (first page) |
| JPG/PNG| PDF |

## How to run on Replit

1. **Create a new Repl** and import this project (or paste the files).
2. **Set run command** (in Replit):
   - Click "Tools" → "Run" or the Run button.
   - If asked for a run command, use: `npm start`
3. **Install dependencies** (Replit often runs this automatically):
   - In the Shell: `npm install`
4. **Start the server**:
   - Click **Run** or run `npm start` in the Shell.
5. **Open the app**: use the generated Replit URL (e.g. `https://your-repl-name.username.repl.co`).

Replit uses `replit.nix` to install **LibreOffice** and **Poppler** (pdftoppm) so Office→PDF and PDF→JPG work.

## npm commands

```bash
# Install dependencies
npm install

# Start the server (production)
npm start

# Same as start (no separate dev script)
npm run dev
```

## How to test conversions

1. Open the app in the browser.
2. **DOCX/PPTX/XLSX → PDF**: drag a `.docx`, `.pptx`, or `.xlsx` file, choose "PDF", click Convert. The PDF should download.
3. **PDF → JPG**: upload a PDF, choose "JPG", click Convert. The first page is downloaded as a JPG.
4. **JPG/PNG → PDF**: upload an image, choose "PDF", click Convert. The PDF should download.

**API test (curl):**

```bash
# Replace PORT and URL with your server (e.g. 3000 or your Replit URL)
curl -X POST -F "file=@document.docx" -F "targetFormat=pdf" http://localhost:3000/convert -o result.pdf
```

## Project structure

```
/project
  /public
    index.html
    style.css
    script.js
  /uploads    (temp uploads, auto-cleaned)
  /outputs    (temp outputs, auto-cleaned)
  server.js
  package.json
  replit.nix
  README.md
```

## Common fixes

### "LibreOffice not found" or Office→PDF fails
- **Replit**: Ensure `replit.nix` is present and includes `pkgs.libreoffice`. Run the Repl again after adding it.
- **Local Windows**: Install [LibreOffice](https://www.libreoffice.org/) and add it to PATH.
- **Local Mac**: `brew install libreoffice`

### "pdftoppm not found" or PDF→JPG fails
- **Replit**: `replit.nix` should include `pkgs.poppler_utils`. Re-run the Repl.
- **Local Ubuntu/Debian**: `sudo apt install poppler-utils`
- **Local Mac**: `brew install poppler`

### "File type not supported"
- Only DOCX, PPTX, XLSX, PDF, JPG, PNG are allowed. Max file size 20MB.

### Multer "File too large"
- Limit is 20MB. Reduce file size or increase `limits.fileSize` in `server.js` (e.g. `30 * 1024 * 1024`).

### Port already in use
- Set `PORT` in environment (Replit sets this automatically). Locally: `PORT=4000 npm start`.

### Conversions are slow
- Office→PDF uses LibreOffice and can take 5–15 seconds for large files. First run may be slower while LibreOffice starts.

## API

**POST /convert**

- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `file`: the file to convert
  - `targetFormat`: `pdf` or `jpg`
- **Response**: Converted file as download (binary), or JSON `{ error: "..." }` on failure.

## License

MIT.
