# Bookkeeping Webapp

A browser-based client for the [Bookkeeping](../README.md) knowledge storage
system. It reads Bookkeeping data files and renders knowledge tables with
properly formatted mathematical expressions, diagrams, and other structured
data using a plugin-based syntax system.

## Current Status

Phase 1 complete — math syntax expression parser and renderer.
Type a math expression and see it rendered as formatted HTML with correct
operator precedence, fractions, superscripts, subscripts, integrals, and
Greek/skewed identifiers.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Further Reading

All design, architecture, implementation, testing, and history documentation
lives in [`docs/`](docs/docs_guide.md).
