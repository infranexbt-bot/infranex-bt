const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const fs = require('fs');
console.log('modules loaded');
const css = fs.readFileSync('/home/z/my-project/src/app/globals.css','utf8');
console.log('css read:', css.length, 'chars');
postcss([tailwind()]).process(css, { from: '/home/z/my-project/src/app/globals.css' }).then(r => {
  console.log('OK, output length:', r.css.length);
  process.exit(0);
}).catch(e => { console.error('POSTCSS FAIL:', e.message); process.exit(1); });
setTimeout(() => { console.error('TIMEOUT 60s'); process.exit(2); }, 60000);
