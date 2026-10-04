const http = require('http');
function hit(path, port) {
  return new Promise(res => {
    const t0 = process.hrtime.bigint();
    http.get({host:'127.0.0.1', port, path}, r => { r.resume(); r.on('end', () => res(Number(process.hrtime.bigint()-t0)/1e6)); })
        .on('error', () => res(-1));
  });
}
(async () => {
  const paths = ['/','/sabzi','/kirana','/dawai','/mera'];
  for (const conc of [10, 25, 50]) {
    const all = [];
    const t0 = Date.now();
    for (let round = 0; round < 4; round++) {
      const batch = Array.from({length: conc}, (_, i) => hit(paths[i % paths.length], 3102));
      all.push(...await Promise.all(batch));
    }
    const ms = all.filter(x => x >= 0).sort((a,b)=>a-b);
    const p = q => ms[Math.floor(ms.length*q)].toFixed(1);
    console.log(`WEB  conc=${conc}  n=${ms.length}  p50=${p(0.5)}ms  p95=${p(0.95)}ms  max=${ms[ms.length-1].toFixed(1)}ms  wall=${Date.now()-t0}ms`);
  }
  for (const conc of [10, 50]) {
    const all = [];
    for (let round = 0; round < 4; round++) {
      all.push(...await Promise.all(Array.from({length: conc}, () => hit('/products', 3101))));
    }
    const ms = all.filter(x => x >= 0).sort((a,b)=>a-b);
    const p = q => ms[Math.floor(ms.length*q)].toFixed(1);
    console.log(`API  conc=${conc}  n=${ms.length}  p50=${p(0.5)}ms  p95=${p(0.95)}ms  max=${ms[ms.length-1].toFixed(1)}ms`);
  }
})();
