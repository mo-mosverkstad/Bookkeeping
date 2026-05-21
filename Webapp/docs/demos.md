# Demos

## Phase 1 — Parser & Basic Renderer

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
3. The page loads with the input pre-filled with `-2*(3+5)*4e^x^2` and the
   result already rendered (the test injection in `main.ts` auto-clicks Render
   on load)
4. To try your own expression: clear the input, type a BobaMath expression,
   and click **Render**

---

## Expected Results

### Default test case: `-2*(3+5)*4e^x^2`

The rendered output should show:

```
(-2)(3 + 5)(4)(e^(x^2))
```

Where:
- `-2` is wrapped in parentheses because it is a unary expression inside a
  multiplication
- `3 + 5` is wrapped in parentheses because it is an additive expression
  inside a multiplication
- `e^(x^2)` shows `x^2` as a superscript of `e`, and `x^2` itself has `2`
  as a superscript of `x` (nested superscripts)

The browser console (`F12 → Console`) will print the full JSON AST:
```json
{
  "type": "BinaryExpression",
  "operator": "*",
  "left": {
    "type": "BinaryExpression",
    "operator": "*",
    "left": {
      "type": "BinaryExpression",
      "operator": "*",
      "left": { "type": "UnaryExpression", "operator": "-", "operand": { "type": "NumberLiteral", "value": 2 } },
      "right": { "type": "BinaryExpression", "operator": "+", "left": { "type": "NumberLiteral", "value": 3 }, "right": { "type": "NumberLiteral", "value": 5 } }
    },
    "right": { "type": "NumberLiteral", "value": 4 }
  },
  "right": {
    "type": "BinaryExpression",
    "operator": "^",
    "left": { "type": "Identifier", "name": "e" },
    "right": { "type": "BinaryExpression", "operator": "^", "left": { "type": "Identifier", "name": "x" }, "right": { "type": "NumberLiteral", "value": 2 } }
  }
}
```

### Integral: `\int{0, 1, x^2}`

Renders as an integral symbol with `0` below and `1` above, and `x²` as the body.

### Fraction: `a/b`

Renders as a stacked fraction with `a` on top and `b` on bottom, separated by
a horizontal line.

### Square root: `\sqrt{x+1}`

Renders with a radical sign and overline above `x+1`.

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
