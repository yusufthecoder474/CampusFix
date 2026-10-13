# Accessibility findings

Practices implemented: semantic page/forms/navigation, visible textual status, associated labels/hints, error alerts, loading announcements, page focus, skip navigation, native confirmation dialogs, autofocus/cancel/restore behavior, notification announcements and reduced-motion styling. CSS Grid/Flexbox/media queries preserve the CampusFix design at small widths.

Executed Chromium scans: dashboard and request form at 375, 768, 1024 and 1440 pixels (eight scans), plus assignment and closure dialogs (two scans). Axe tags: wcag2a, wcag2aa, wcag21aa and wcag22aa. **Ten scans reported zero violations and no incomplete results.** See evidence/m5-accessibility.json. This result applies to those synthetic screens/states only.

Browser assertions verify no horizontal overflow at the four widths, keyboard tab order between title/location, initial modal focus on Cancel and Tab to Confirm, plus preserved mobile workflow tests. Screenshots in docs/screenshots show synthetic fixtures only.

Not executed: screen-reader review, Safari/Firefox or physical mobile device tests, all possible error/status/dialog states, low-vision user evaluation or an independent WCAG audit. No complete WCAG 2.2 AA compliance claim is made. Automated rules cannot establish all usability/accessibility requirements.

Reproduce with npm run test:e2e:realtime after a production build. That test also writes screenshots and the findings JSON. Test results can change with browser version and data; record the exact browser when comparing.
