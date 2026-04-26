# Grammar snapshot tests

Token-stream snapshots that guard `syntaxes/ctl.tmLanguage.json` against
unintended regressions.  Each `.ctl` fixture is tokenized by the
grammar; the result is captured as a `.snap` file and committed.  CI
fails if a future grammar change makes the tokenization differ from
the snapshot.

## Layout

- `fixtures/` — real `.ctl` source files PLUS their generated
  `<fixture>.ctl.snap` token-stream snapshots (the tool keeps each
  snap next to its source).  Currently three small ACES library
  files; pick the next ones to maximise coverage diversity rather
  than line count.

The `.snap` files are committed.  Don't hand-edit them — refresh with
`npm run test:grammar -- --updateSnapshot` after an intentional
grammar change.

## Fixture provenance

All fixtures are taken from the ACES project (https://github.com/ampas/aces-dev)
under their original `Apache-2.0` license + SPDX header (preserved in
each file).  We don't modify them — the value of the snapshot is that
it tracks how the grammar handles real-world CTL.

| File | Why this one |
|---|---|
| `Lib.Academy.Tonescale.ctl`    | Struct definitions + tone-curve math; exercises `struct`, `pow`, `log`, conditionals |
| `Lib.Academy.ColorSpaces.ctl`  | 3x3 matrix constants + `RGBtoXYZ`/`XYZtoRGB` stdlib calls; exercises array literals + color-space stdlib group |
| `Lib.Academy.Utilities.ctl`    | Per-channel loops + helper variety; exercises `for`, indexing, `mult_*`/`add_*` stdlib |

When you add a new fixture, prefer files that exercise grammar
categories the existing snapshots don't cover (e.g. a `lookup1D` heavy
file, a file using `print(...)`, etc.).

## Refreshing snapshots

After an intentional grammar change:

```sh
npm run test:grammar -- --updateSnapshot
```

Review the diff before committing.

## Adding a fixture

1. Drop the `.ctl` file into `fixtures/` (preserve any upstream
   SPDX / copyright headers).
2. Add a row to the table above.
3. Generate its snapshot:
   ```sh
   npm run test:grammar -- --updateSnapshot
   ```
4. Commit fixture + snapshot together.
