/** Deterministic zero-dependency browser bundle builder. Sources: geo.js, demo.js and app.modular.js. */
import {readFileSync,writeFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const deexport=code=>code.replace(/\bexport\s+(?=(?:function|const|let|class)\b)/g,'');
const geo=deexport(read('geo.js'));
const demo=deexport(read('demo.js')).replace(/^import\s+.*?from\s+['"]\.\/geo\.js['"];?\s*$/m,'');
const app=read('app.modular.js').replace(/^import\s+.*?from\s+['"]\.\/geo\.js['"];?\s*$/m,'').replace(/^import\s+.*?from\s+['"]\.\/demo\.js['"];?\s*$/m,'');
const bundle=`// GeoMarketing browser bundle (generated from src/geo.js + src/demo.js + src/app.modular.js)\n// Modules stay available in this source archive for extension and unit testing.\n\n// === GEOMETRY / ETL / HUFF ===\n${geo}\n// === SYNTHETIC DEMO DATA ===\n${demo}\n// === MAP CONTROLLER ===\n${app}`;
writeFileSync(new URL('../src/app.js',import.meta.url),bundle);
console.log(`Generated src/app.js (${bundle.length} chars)`);
