# Exceptions — Cross-Environment Development Constraints

This document records deviations from the standard workflow defined in
`workflow.md` that apply when the AI assistant operates in a different
environment from the target runtime.

---

## Current Situation

| Aspect | Value |
|--------|-------|
| AI assistant environment | SUSE Linux |
| Target runtime environment | WSL Ubuntu (no desktop) |
| Consequence | The assistant **cannot directly execute** commands on the target |

---

## What the Assistant MUST Do

1. **Write code** — implement features, fix bugs, create new files
2. **Create test cases** — write unit tests in `test/` using Vitest
3. **Create demos** — add demo inputs and instructions to `docs/demos.md`
4. **Provide instructions** — document exactly how to run tests and demos
   on the target WSL Ubuntu environment
5. **Update documentation** — keep all docs (`testing.md`, `demos.md`,
   `history.md`, `codebase_analysis.md`) current

---

## What the Assistant MUST NOT Do

1. **Do not run `npm test`** — the assistant cannot execute test cases.
   Tests are written and committed; the user runs them on the target.
2. **Do not run `npm run dev`** — the assistant cannot start the dev server.
   Demo verification is performed by the user on the target.
3. **Do not run `npm install`** — dependency installation happens on the target.
4. **Do not run any build or runtime commands** — `npm run build`,
   `npm run preview`, `npx tsc`, etc. are all executed by the user.

---

## Modified Workflow (Per Phase)

The standard workflow in `workflow.md` is:

```
1. Coding → 2. Testing → 3. Demo → 4. Documentation → 5. Notify
```

Under this exception, steps 2 and 3 are split:

```
1. Coding
2. Testing
   a. Write test cases (assistant)
   b. Provide run instructions (assistant)
   c. Execute tests and report results (user on target)
   d. Fix failures if any (assistant, then repeat from c)
3. Demo
   a. Create demo code and inputs (assistant)
   b. Provide run instructions (assistant)
   c. Execute demo and verify (user on target)
4. Documentation
5. Notify
```

The assistant delivers code + instructions. The user executes and reports
back. Iteration continues until all tests pass and the demo works.

---

## How to Run Tests (Instructions for Target)

On the WSL Ubuntu target:

```bash
cd /path/to/Webapp
npm install        # first time only
npm test           # run all tests once
npm run test:watch # watch mode (optional, for iterating)
```

---

## How to Run Demos (Instructions for Target)

On the WSL Ubuntu target (no desktop — browser access via Windows host):

```bash
cd /path/to/Webapp
npm install        # first time only
npm run dev        # starts Vite on localhost:5173
```

Open `http://localhost:5173` in the Windows browser. The WSL network
forwards the port automatically. Use the browser console (`F12`) to call
`__nextTest()` for cycling through demo test cases.

---

## Rationale

The AI assistant runs on SUSE Linux with no access to the WSL Ubuntu
filesystem or its Node.js runtime. The two environments are separate
machines. The assistant can only produce files (code, tests, docs) that
the user then transfers to and executes on the target. This separation
means the assistant must be thorough in its instructions — every command,
expected output, and verification step must be documented explicitly
since the assistant cannot observe the results directly.
