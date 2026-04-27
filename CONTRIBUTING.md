# Contributing to vscode-ctl-debug

Thanks for your interest in improving the CTL Debug VS Code extension.

## Development setup

Prerequisites:
- Node.js 20+ and npm.
- VS Code 1.80+ (the version the extension targets — see
  `engines.vscode` in `package.json`).
- A `ctldap` binary you can point the extension at.  Build it from
  the [CTL repo](https://github.com/ampas/CTL):
  ```sh
  cmake -B build-dbg-on -DCMAKE_BUILD_TYPE=Debug -DCTL_ENABLE_DEBUGGER=ON
  cmake --build build-dbg-on --target ctldap -j8
  ```

Clone, install, build:

```sh
git clone https://github.com/aforsythe/vscode-ctl-debug.git
cd vscode-ctl-debug
npm install
npm run compile
```

## Running the extension locally

Open this folder in VS Code and press **F5** — that launches an
Extension Development Host with the extension loaded from source.
The `.vscode/launch.json` config takes care of pre-compiling.

For a one-command end-to-end demo (workspace + sample CTL fixtures +
launch.json pre-wired), run from a CTL checkout:

```sh
# from the CTL source tree:
make demo
```

That uses this extension's source via `code --extensionDevelopmentPath`.

## Running tests

```sh
npm test                  # unit + grammar snapshots
npm run test:unit         # just the helper unit tests
npm run test:grammar      # just the grammar snapshot tests
```

Two test suites:

- **Unit tests** (`tests/unit/`) — pure-Node assertions for the helpers
  (`src/inlineIdentifiers.ts`, `src/colorSwatches.ts`,
  `src/ctlRepoDetect.ts`).  No `vscode-test` / Electron — runs anywhere
  Node 20+ does, fast in CI.
- **Grammar snapshot tests** (`tests/grammar/`) — tokenizes a few real
  ACES `.ctl` files through `syntaxes/ctl.tmLanguage.json` and compares
  the output to a committed `.snap` file per fixture.  Catches
  unintended changes when the grammar is edited.  After an
  intentional grammar change:
  ```sh
  npm run test:grammar -- --updateSnapshot
  ```
  Review the diff before committing.  See
  [`tests/grammar/README.md`](tests/grammar/README.md) for details.

End-to-end behavior of the extension itself is exercised by
[`docs/MANUAL_TESTING.md`](docs/MANUAL_TESTING.md) (manual) and indirectly by the headless
DAP scenarios in the CTL repo
(`ctldap/tests/run_demo_scenarios.py`).

## Code style

- TypeScript strict mode (see `tsconfig.json`).
- Existing files use 4-space indent, single quotes, no semicolons in
  type-only statements — match what's already there.
- Comments should explain WHY, not WHAT — see existing source for the
  bar.
- Avoid emojis in source unless they're user-visible UI text.

## Pull requests

1. Open an issue first for anything beyond a small fix, so we can
   align on direction before you sink time into it.
2. One concern per PR.  Keep diffs focused.
3. Include `npm test` output in the PR description if you touched any
   helper.
4. Update `CHANGELOG.md` under the `## Unreleased` heading (create one
   if missing).

## Releasing

The `release.yml` workflow builds + publishes to the VS Code
Marketplace on every tag matching `v*` (e.g. `v0.2.0`).  The publish
step is gated on a `VSCE_PAT` repo secret.

To cut a release:
1. Bump `version` in `package.json`.
2. Move the `## Unreleased` notes in `CHANGELOG.md` under a new
   `## X.Y.Z (YYYY-MM-DD)` heading.
3. Commit, tag (`git tag vX.Y.Z`), push tag.
4. CI builds the `.vsix`, attaches it to the GitHub Release, and
   publishes to the Marketplace.

## License

By contributing, you agree your contributions will be licensed under
the [Apache License 2.0](LICENSE).
