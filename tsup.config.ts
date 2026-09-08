import { defineConfig } from 'tsup';

// One artifact set per subpath entry: CJS (.js) for the CAP servers, ESM
// (.mjs) for browser bundlers, plus .d.ts. No splitting so every subpath is a
// self-contained file (predictable exports map).
export default defineConfig({
    entry: [
        'src/index.ts',
        'src/hash.ts',
        'src/bytes.ts',
        'src/cipher.ts',
        'src/grantee.ts',
        'src/access.ts',
        'src/attributes.ts',
        'src/fields.ts',
        'src/profile.ts',
        'src/merkle.ts',
        'src/lifecycle.ts',
        'src/claim-sets.ts',
        'src/claim-cart.ts',
        'src/store.ts',
        'src/upload.ts',
        'src/token.ts',
        'src/stuck-rows.ts',
        'src/http.ts',
        'src/battery/attributes.ts',
        'src/battery/bms-simulator.ts',
        'src/battery/claim-sets.ts',
        'src/battery/document.ts',
        'src/battery/guide-defaults.ts',
        'src/battery/guide-document.ts',
        'src/battery/lifecycle.ts',
        'src/battery/profile.ts',
        'src/integrations/catenax.ts',
        'src/integrations/s4.ts',
    ],
    format: ['cjs', 'esm'],
    dts: true,
    target: 'node22',
    sourcemap: true,
    clean: true,
    splitting: false,
});
