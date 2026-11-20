const fs=require("fs");
function h(s){let x=2166136261;for(const c of s){x^=c.codePointAt(0);x=Math.imul(x,16777619);}return x>>>0;}
const FA=["۱","۲","۳","۴"];
for(const f of ["01-nazariye-jameshenasi.txt","02-jameshenasi-haye-mokhtalef.txt","03-ravesh-tahqiq.txt","04-amar.txt","05-zaban.txt"]){
  const p="soalat/"+f; const L=fs.readFileSync(p,"utf8").split("\n");
  let i=0,changed=0;
  while(i<L.length){
    if(/^[۰-۹]+\)/.test(L[i])){
      const opts=[],idx=[];
      for(let k=i+1;k<Math.min(i+8,L.length);k++) if(/^   [۱-۴]\. /.test(L[k])){opts.push(L[k].replace(/^   [۱-۴]\. /,""));idx.push(k);}
      const keyLine=idx.length? (()=>{for(let k=idx[idx.length-1]+1;k<Math.min(idx[idx.length-1]+4,L.length);k++) if(L[k].includes("✔ کلید")) return k; return -1;})() : -1;
      if(opts.length===4 && keyLine>-1){
        const old=FA.findIndex(x=>L[keyLine].includes("گزینه "+x));
        if(old>-1){
          let seed=h(L[i]); const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
          const order=[0,1,2,3];
          for(let a=3;a>0;a--){const b=Math.floor(rnd()*(a+1));[order[a],order[b]]=[order[b],order[a]];}
          const newOpts=order.map(o=>opts[o]);
          const newKey=order.indexOf(old);
          idx.forEach((k,n)=>{L[k]="   "+FA[n]+". "+newOpts[n];});
          L[keyLine]="   ✔ کلید: گزینه "+FA[newKey];
          if(newKey!==old) changed++;
        }
      }
    }
    i++;
  }
  fs.writeFileSync(p,L.join("\n"));
  console.log(f,"shifted keys:",changed);
}
