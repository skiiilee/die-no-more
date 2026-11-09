# Project overview (proposal)

Status: DRAFT — awaiting GPT/Claude review and user approval.

## Product
A Korean-first, mobile-first PWA for indoor and outdoor plants, including ornamental plants, herbs and common crops. Balance three pillars: plant identification, photo-based health assessment, and ongoing care management.

## User journey
Sign in → capture/upload photos → review candidate species → confirm or manually search → optionally assess health → register plant with nickname and environment → receive care suggestions → log activities and monitor history.

## MVP principles
- Support unknown species and manual entry.
- Display uncertainty; photo assessment is not a definitive diagnosis.
- Separate individual plant records from canonical species data.
- Respect privacy, licensing, API costs, and user consent.
- Initial UI in Korean; do not claim universal species coverage or diagnosis accuracy.
- Scope: personal use. Commercial use is not a goal; external APIs are used under their personal, non-commercial terms.
- Deployment preference: browser-based app on GitHub Pages, not an app-store release. Mobile home-screen installation (PWA) is optional and does not imply native-app distribution.
- Species and care reference data starts empty and grows on demand from confirmed plant registrations; AI-generated guidance must carry source/verification status and remain reviewable.
