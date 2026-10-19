#!/usr/bin/env node
// Prove that the packed tarball resolves (values AND types) under BOTH
// consumer compiler profiles before any app installs it:
//   - DAYPASS:   TS 5.9, module commonjs, moduleResolution node (typesVersions path)
//   - NIGHTPASS: module NodeNext (exports-map path)
// Also require()s every CJS subpath as a runtime smoke.
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = resolve(import.meta.dirname, '..');
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'pipe' }).toString();

// Pack the current state.
run('npm pack', ROOT);
const tarball = readdirSync(ROOT).filter((f) => /^odatano-dpp-sdk-.*\.tgz$/.test(f)).sort().pop();
if (!tarball) throw new Error('npm pack produced no tarball');

const SUBPATHS = [
    '', 'hash', 'bytes', 'cipher', 'grantee', 'access', 'attributes', 'fields', 'profile', 'merkle',
    'lifecycle', 'claim-sets', 'claim-cart', 'store', 'upload', 'token', 'stuck-rows', 'http',
    'battery/profile', 'battery/lifecycle', 'battery/attributes', 'battery/guide-defaults',
    'battery/guide-document', 'battery/bms-simulator', 'battery/claim-sets', 'battery/document',
    'component/profile', 'component/claim-sets', 'component/lifecycle',
    'integrations/catenax', 'integrations/s4',
];

const probeLines = SUBPATHS.map((p, i) => {
    const spec = p ? `@odatano/dpp-sdk/${p}` : '@odatano/dpp-sdk';
    return `import * as m${i} from '${spec}';\nif (typeof m${i} !== 'object') throw new Error('${spec}');`;
}).join('\n') + `
// typed usage so the d.ts actually participates
import { hashPayload } from '@odatano/dpp-sdk/hash';
import { projectPayload } from '@odatano/dpp-sdk/profile';
import { BATTERY_PROFILE } from '@odatano/dpp-sdk/battery/profile';
const h: string = hashPayload(projectPayload(BATTERY_PROFILE, { attributes: [] })).payloadHash;
void h;
`;

const dir = mkdtempSync(join(tmpdir(), 'dpp-sdk-consumers-'));
try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'probe', private: true, version: '0.0.0' }));
    run(`npm install "${join(ROOT, tarball)}" typescript@5.9 @types/node@22`, dir);
    writeFileSync(join(dir, 'probe.ts'), probeLines);

    const profiles = {
        'daypass (commonjs/node)': {
            compilerOptions: {
                target: 'ES2022', module: 'commonjs', moduleResolution: 'node',
                strict: true, esModuleInterop: true, skipLibCheck: true, noEmit: true,
                types: ['node'],
            },
            files: ['probe.ts'],
        },
        'nightpass (NodeNext)': {
            compilerOptions: {
                target: 'ESNext', module: 'NodeNext', moduleResolution: 'NodeNext',
                strict: true, esModuleInterop: true, skipLibCheck: true, noEmit: true,
                types: ['node'],
            },
            files: ['probe.ts'],
        },
    };
    for (const [name, cfg] of Object.entries(profiles)) {
        writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(cfg, null, 2));
        try {
            run('node node_modules/typescript/bin/tsc -p tsconfig.json', dir);
            console.log(`profile OK: ${name}`);
        } catch (e) {
            console.error(`profile FAILED: ${name}\n${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`);
            process.exitCode = 1;
        }
    }

    // Runtime smoke: require every CJS subpath from the installed package.
    const req = createRequire(join(dir, 'probe.ts'));
    for (const p of SUBPATHS) {
        const spec = p ? `@odatano/dpp-sdk/${p}` : '@odatano/dpp-sdk';
        const mod = req(spec);
        if (!mod || typeof mod !== 'object') throw new Error(`require failed: ${spec}`);
    }
    console.log(`runtime OK: ${SUBPATHS.length} subpaths require()d`);
} finally {
    rmSync(dir, { recursive: true, force: true });
}
if (process.exitCode) process.exit(process.exitCode);
console.log('consumer resolution check passed');
