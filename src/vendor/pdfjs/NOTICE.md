# PDF.js

This directory vendors the minified browser distribution of Mozilla PDF.js
version 5.6.205.

- Project: https://github.com/mozilla/pdf.js
- Package: https://www.npmjs.com/package/pdfjs-dist
- License: Apache License 2.0 (see `LICENSE`)

Only `pdf.min.mjs` and `pdf.worker.min.mjs` are included for local PDF text
extraction. PDF files are parsed in the user's browser and are not uploaded by
this application.
