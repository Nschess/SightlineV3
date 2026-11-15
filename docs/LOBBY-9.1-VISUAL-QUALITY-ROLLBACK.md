# Lobby 9.1 visual quality rollback

The protected Lobby 9.1 source package and Expansion 8.3 baseline were not modified. This candidate's exact pre-change files are preserved in `rollback/lobby-9.1-visual-quality-baseline-2026-11-07/` and listed in that folder's `ROLLBACK-MANIFEST.json`.

To revert the production UI and host fingerprint changes in this candidate, run these commands from the candidate DEV root in CMD:

```bat
copy /y "rollback\lobby-9.1-visual-quality-baseline-2026-11-07\AndroidProject\app\src\main\assets\www\index.html" "AndroidProject\app\src\main\assets\www\index.html"
copy /y "rollback\lobby-9.1-visual-quality-baseline-2026-11-07\AndroidProject\app\src\main\assets\phone-host\index.html" "AndroidProject\app\src\main\assets\phone-host\index.html"
copy /y "rollback\lobby-9.1-visual-quality-baseline-2026-11-07\AndroidProject\app\src\main\assets\phone-host\SHA256SUMS" "AndroidProject\app\src\main\assets\phone-host\SHA256SUMS"
copy /y "rollback\lobby-9.1-visual-quality-baseline-2026-11-07\AndroidProject\CURRENT-SOURCE-SHA256.txt" "AndroidProject\CURRENT-SOURCE-SHA256.txt"
copy /y "rollback\lobby-9.1-visual-quality-baseline-2026-11-07\AndroidProject\app\src\main\java\com\sightline\v3\MainActivity.java" "AndroidProject\app\src\main\java\com\sightline\v3\MainActivity.java"
copy /y "rollback\lobby-9.1-visual-quality-baseline-2026-11-07\tools\capture-lan-host-status.cjs" "tools\capture-lan-host-status.cjs"
```

Restore the browser acceptance harness separately only if you want to discard its expanded, candidate-only screenshot coverage. The baseline copy of the prior Lobby 9.1 implementation report is in the rollback folder. Re-run `node tools\verify-lobby-visual-source.cjs` after rollback; it will report that source no longer matches the visual-quality candidate until its candidate-specific files are also reverted.
