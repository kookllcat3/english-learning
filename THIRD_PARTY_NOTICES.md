# Third-party notices

This project uses the following third-party software and services.

## JSZip

- Purpose: read and write the ZIP container used by DOCX files in the user's browser
- Project: https://stuk.github.io/jszip/
- License: MIT
- Included file: `src/vendor/jszip/jszip.min.js`

The applicable MIT license text is included at
`src/vendor/jszip/LICENSE.md`.

## Lucide

- Purpose: provide consistent interface icons
- Version: 1.31.0
- Project: https://lucide.dev/
- Distribution: https://www.npmjs.com/package/@lucide/vue
- License: ISC; selected icons derived from Feather are available under the MIT License

The applicable Lucide and Feather license texts are distributed with the
`@lucide/vue` package installed through `package-lock.json`.

## Browser Web Speech API

The application uses the browser's built-in speech synthesis capability for
word pronunciation. This is a browser platform feature; no speech engine is
bundled with this project.
