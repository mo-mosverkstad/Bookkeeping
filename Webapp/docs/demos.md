# Demos

## Phase 1 — Math Syntax: Expression Parser & Renderer

---

## Environment Setup

See `environment_setup.md` for the full guide on installing Node.js and npm.

Quick summary — in WSL Ubuntu or a terminal at the `Webapp/` folder:
```bash
npm install
```
This installs Vite and TypeScript locally from `package.json`. No global
installs are needed.

---

## How to Build

### Development build (with hot reload)
```bash
npm run dev
```
Vite starts a local server. Output will look like:
```
  VITE v8.x.x  ready in Xms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```
Open `http://localhost:5173` in a browser. The page reloads automatically
whenever you save a source file.

### Production build
```bash
npm run build
```
This runs `tsc` (type-check only) then Vite bundles everything into `dist/`.
The output is a static site that can be hosted anywhere.

### Preview the production build
```bash
npm run preview
```
Serves the `dist/` folder locally so you can verify the production build
before deploying.

---

## How to Run the Demo

1. Run `npm run dev`
2. Open `http://localhost:5173`
3. The page loads with the first test case `-2*(3+5)*4e^x^2` pre-filled
   and rendered automatically
4. To cycle through all Phase 1 test cases, open the browser console
   (`F12`) and call:
   ```js
   __nextTest()
   ```
   Each call advances to the next test case and re-renders.
5. To try your own expression: type into the input and click **Render**

---

## Expected Results

### Test case cycle (call `__nextTest()` in console to advance)

| # | Input | Expected visual |
|---|-------|-----------------|
| 1 | `-2*(3+5)*4e^x^2` | `(-2)(3 + 5)(4)e`^`(x`^`2)` |
| 2 | `a/b + c/d` | two stacked fractions joined by ` + ` |
| 3 | `\int{0, 1, x^2}` | ∫ with 0 below, 1 above, body x² **beside** the sign |
| 4 | `\sqrt{x+1}` | radical sign over x + 1 |
| 5 | `` `1T / `1t `` | fraction: right-skewed T over right-skewed t |
| 6 | `\a + \1b` | α + right-skewed β |
| 7 | `\int{0, \p, \s*x^2 + 2x - 1}` | integral from 0 to π, body σx² + 2x − 1 |
| 8 | `(a/b) / (c/d)` | nested stacked fraction |
| 9 | `2x^3 + 3x^2 - x + 1` | polynomial with superscripts |
| 10 | `\int{-1, 1, f(x)*g(x)}` | integral, body f(x)g(x) |
| 11 | `x_i + x_j + x_k` | three subscripted variables |
| 12 | `\a*x^2 + \b*x + \g` | αx² + βx + γ |
| 13 | `a^b^c^d` | right-associative nested superscripts |
| 14 | `--x + -y` | double negation + negation |
| 15 | `2\p r^2` | 2πr² (implicit multiplication with Greek) |

---

## Troubleshooting

### `npm install` fails with `ENOENT: package.json not found`
You are in the wrong directory. Make sure you are inside `Webapp/`, not the
project root `Bookkeeping/`:
```bash
cd Webapp
npm install
```

### `npm run dev` fails with `command not found: vite`
Run `npm install` first. Vite is a local dev dependency, not a global tool.

### The page is blank or shows no output
Open the browser console (`F12 → Console`) and check for errors. Common causes:
- TypeScript compile error — the console will show the file and line
- Missing DOM element — check that `index.html` has `id="input"`, `id="render"`,
  `id="result"`, and `id="error-message"`

### Parse error shown in red on the page
The error message shows the line, column, and what was expected. Example:
```
error: unexpected ')'
 --> inputString:1:6
  |
1 | 2+(3))
  |      ^
  |
  = expected: EOF
```
This means the parser successfully parsed `2+(3)` but found an extra `)` at
the end. Fix the input expression.

### Hot reload not working in WSL
If you are working from `/mnt/c/...` (Windows filesystem via WSL), Vite's file
watcher may not detect changes. Try adding `--poll` to the dev command in
`package.json`:
```json
"dev": "vite --watch-poll"
```
Or copy the project to a native Linux path as described in `environ-setup.md`.

### TypeScript errors on `npm run build`
Run `npx tsc --noEmit` to see all type errors. The most common cause is a
missing import after adding a new file. Check that all types used in a file
are imported from `../parser/types.ts`.
