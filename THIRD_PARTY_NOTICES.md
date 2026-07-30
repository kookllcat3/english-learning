# Third-party notices

This project uses the following third-party software and services.

## Mozilla PDF.js

- Purpose: extract text from text-based PDF files in the user's browser
- Version: 5.6.205
- Project: https://github.com/mozilla/pdf.js
- Distribution: https://www.npmjs.com/package/pdfjs-dist
- License: Apache License 2.0
- Included files:
  - `src/vendor/pdfjs/pdf.min.mjs`
  - `src/vendor/pdfjs/pdf.worker.min.mjs`

The applicable Apache License 2.0 text is included at
`src/vendor/pdfjs/LICENSE`. Additional distribution information is included
at `src/vendor/pdfjs/NOTICE.md`.

## JSZip

- Purpose: read the ZIP container used by DOCX files in the user's browser
- Project: https://stuk.github.io/jszip/
- License: MIT
- Included file: `src/vendor/jszip/jszip.min.js`

The applicable MIT license text is included at
`src/vendor/jszip/LICENSE.md`.

## Free Dictionary API

- Purpose: retrieve English definitions, phonetics, examples, and available
  pronunciation audio for the selected word
- Website and API documentation: https://dictionaryapi.dev/
- Source project: https://github.com/meetDeveloper/freeDictionaryAPI
- Source project license: GNU General Public License v3.0

Free Dictionary API is an external network service. Its source code is not
included, modified, or distributed with this project. The application sends
only the selected English word to the service and caches the response locally.
Availability and service behavior remain under the service provider's control.

## Browser Web Speech API

When dictionary audio is unavailable, the application may use the browser's
built-in speech synthesis capability. This is a browser platform feature; no
speech engine is bundled with this project.
