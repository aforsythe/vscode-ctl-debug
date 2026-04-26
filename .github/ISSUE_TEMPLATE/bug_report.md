---
name: Bug report
about: Something doesn't work the way you expected.
labels: bug
---

## What happened

<!-- One sentence -->

## What you expected

<!-- One sentence -->

## Steps to reproduce

1.
2.
3.

## Environment

- Extension version (`code --list-extensions --show-versions | grep ctl-debug`):
- VS Code version (Help → About):
- OS / version:
- ctldap version (`ctldap --version` if supported, else commit SHA of the CTL build):

## Logs

<!--
Useful logs:
  - View → Output → "Log (Extension Host)" — extension stderr.
  - View → Output → "CTL Debug" — auto-build output.
  - /tmp/ctldap-trace.log if you set CTLDAP_TRACE=/tmp/ctldap-trace.log
    in your launch environment.
  - VS Code Debug Console output (especially the [ctl-debug] line on
    session end).
-->

```
<paste here>
```

## CTL fixture

<!-- Smallest reproducer .ctl file + launch.json that triggers the issue -->
