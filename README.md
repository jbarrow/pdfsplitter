# PDF Splitter and Merger

Hosted Version: https://jbarrow--splitter-splitter-app.modal.run

## What is This?

This is a web app for splitting and merging PDFs, in a user friendly way.
It's meant to be hosted on Modal.
You can upload PDFs, drag and drop them to reorder, and select specific pages for a split.

PDFs are retained for the session but are automatically cleaned up.

## Installation

First install bun, then run:
```
cd frontend
bun install
```

## Deployment

Deployment is easy, just change `const modalName = '<username>';` to your Modal username in `frontend/src/main.tsx` and run:

```sh
bash scripts/deploy.sh
```

