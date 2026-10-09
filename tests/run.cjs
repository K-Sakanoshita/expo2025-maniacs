const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
process.chdir(path.resolve(__dirname, '..'));
const tests = fs.readdirSync(__dirname).filter(name => name.endsWith('.cjs') && name !== 'run.cjs').sort();
let failed = 0;
for (const test of tests) {
    const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
    if (result.status !== 0) {
        failed++;
        console.error(`FAIL: ${test} (${result.error?.message || result.signal || result.status})`);
    }
}
console.log(`${tests.length - failed}/${tests.length} test scripts passed`);
process.exitCode = failed ? 1 : 0;
