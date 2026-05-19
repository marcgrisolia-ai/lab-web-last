# Public Assets Audit

Date: 2026-05-19
Repo: `marcgrisolia-ai/lab-web-last`
Site: `https://marcgrisolia-ai.github.io/lab-web-last/`

## Summary

The GitHub Pages site is public. Every file under `public/` is publicly downloadable if someone knows or discovers the URL. The `SE Member` gate only controls UI visibility in the browser; it does not protect static files.

## Confirmed Public Asset Groups

- Application data JSON: `public/data/*.json`, `public/i18n/*.json`
- Client guide PDF: `public/assets/clients_guide_lab.pdf`
- Word macro templates: `public/assets/templates/*.dotm`
- Standards PDFs: `public/data/Standards/*.pdf`
- Lab-specific PDFs/CSV: `public/data/labs_tests/*`
- Images and SVG assets: `public/assets/*`

## Findings

### High: Confidential Schneider lab PDFs are public

Files reviewed:

- `public/assets/clients_guide_lab.pdf`
- `public/data/labs_tests/capellades_tests.pdf`
- `public/data/labs_tests/pdf original subrallat.pdf`
- `public/data/labs_tests/Sarre-Union:sarel_tests.pdf`

Observed extracted text includes confidentiality wording such as:

- `CONFIDENTIAL - Schneider Electric Universal Enclosures Laboratories`
- `Unauthorized distribution is not permitted`
- `Distribution without permission is not authorized`

Risk: these files are directly downloadable from GitHub Pages and from the public GitHub repository.

### High: Third-party standards PDFs are public

Files reviewed:

- `public/data/Standards/UL 50_14 (2024).pdf`
- `public/data/Standards/UL 50E_3 (2020_Rev Oct.2025).pdf`
- `public/data/Standards/IEC 61439-5=2023.pdf`
- `public/data/Standards/ISO-13347-1-2004.pdf`
- `public/data/Standards/iec62208{ed1.0}b.pdf`

Observed extracted text includes copyright/license indicators such as:

- `ULSE INC. COPYRIGHTED MATERIAL - NOT AUTHORIZED FOR FURTHER...`
- `COPYRIGHT (c) IEC. NOT FOR COMMERCIAL USE OR REPRODUCTION`
- `THIS PUBLICATION IS COPYRIGHT PROTECTED`
- `All rights reserved`
- `Customer: ... Company: schneider electric espana, s.a.`

Risk: these appear to be copyrighted/licensed standards and may not be appropriate to redistribute publicly.

### Medium: DOTM templates expose author metadata

Files reviewed:

- `public/assets/templates/Internal_Method_Template_Ref..dotm`
- `public/assets/templates/Template Ref.  9.9.2 of IEC 62208.dotm`
- `public/assets/templates/Ref-18 Template Flammabilty 127mm (5 inches) UL (Automatized).dotm`

Observed metadata includes author/editor names and timestamps, including `Marc Rodriguez`.

Risk: not necessarily sensitive by itself, but metadata is public and downloadable.

### Low: `.DS_Store` files were present under `public/`

Removed locally:

- `public/.DS_Store`
- `public/data/.DS_Store`
- `public/data/labs_tests/.DS_Store`
- `public/data/Standards/.DS_Store`
- `public/assets/.DS_Store`

Risk: Vite can copy files from `public/` into `dist`; these files should not be published.

## Recommendation

If all content is approved for public distribution, no further action is required beyond accepting the exposure.

If not, move restricted documents out of `public/` and replace public links with one of these patterns:

1. Public metadata only, private documents elsewhere.
2. Private repository or internal hosting for restricted files.
3. Authenticated backend/document proxy for files that require access control.
4. GitHub release or storage bucket only for documents explicitly cleared for public distribution.

## Important Note About SE Member

`SE Member` is a client-side UI gate. It is useful for hiding edit controls from casual users, but it is not security. Any static asset in `public/` can be fetched directly without entering as `SE Member`.
