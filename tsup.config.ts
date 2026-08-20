import { defineConfig } from 'tsup';

// One artifact set per subpath entry: CJS (.js) for the CAP servers, ESM
// (.mjs) for browser bundlers, plus .d.ts. No splitting so every subpath is a
// self-contained file (predictable exports map).
export default defineConfig({
    entry: [
        'src/index.ts',
        'src/hash.ts',
        'src/cipher.ts',
        'src/grantee.ts',
        'src/fields.ts',
        'src/merkle.ts',
        'src/tier.ts',
        'src/payload.ts',
        'src/http.ts',
        'src/battery/lifecycle.ts',
        'src/battery/attributes.ts',
        'src/battery/guide-defaults.ts',
        'src/battery/guide-document.ts',
        'src/battery/bms-simulator.ts',
        'src/battery/diligence.ts',
        'src/battery/token.ts',
        'src/battery/store.ts',
        'src/battery/claim-sets.ts',
        'src/battery/claim-cart.ts',
        'src/battery/stuck-rows.ts',
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
