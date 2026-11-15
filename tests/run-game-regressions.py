#!/usr/bin/env python3
"""Runs selected regression tests against exact staged authoritative host, not a different Windows source."""
import pathlib,shutil,subprocess,tempfile,sys,json
root=pathlib.Path(__file__).resolve().parents[1]
assets=root/'AndroidProject/app/src/main/assets'
tests=root/'tests/regressions'
results={}
with tempfile.TemporaryDirectory(prefix='sightline-host-regressions-') as tmp:
    dest=pathlib.Path(tmp)
    # Preserve the real project-relative layout. These tests import both
    # AndroidProject/.../phone-host modules and the sibling www page; flattening
    # them under dest/tests makes valid source paths appear missing.
    staged_assets=dest/'AndroidProject/app/src/main/assets'
    shutil.copytree(assets/'phone-host',staged_assets/'phone-host')
    shutil.copytree(assets/'www',staged_assets/'www')
    for test in sorted(tests.glob('*.test.js')):
        staged=dest/'tests/regressions'/test.name
        staged.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(test,staged)
        result=subprocess.run(['node','--test',str(staged)],capture_output=True,text=True,timeout=55)
        results[test.name]={'pass':result.returncode==0,'stdout':result.stdout[-900:],'stderr':result.stderr[-900:]}
        print(test.name,'PASS' if result.returncode==0 else 'FAIL')
output={'pass':all(v['pass'] for v in results.values()),'results':results}
# Historical evidence is part of the immutable release baseline: never overwrite
# a previously SHA-pinned report whenever a developer runs VERIFY.bat.
# Emit the current execution result in stdout instead of mutating source files.
print(json.dumps({'pass':output['pass'],'tests':len(results),
                  'passed':sum(1 for v in results.values() if v['pass'])}))
sys.exit(0 if output['pass'] else 1)
