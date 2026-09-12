import fs from "node:fs"; import path from "node:path";
const root=process.cwd(); const [entry, ...targets]=process.argv.slice(2);
const exts=[".ts",".tsx",".js",".mjs"];
function resolve(from, spec){ if(spec.startsWith("@/")) spec=path.join(root,"src",spec.slice(2)); else if(spec.startsWith(".")) spec=path.resolve(path.dirname(from),spec); else return null;
  for(const e of ["",...exts]){ if(fs.existsSync(spec+e)&&fs.statSync(spec+e).isFile()) return spec+e; } for(const e of exts){ if(fs.existsSync(path.join(spec,"index"+e))) return path.join(spec,"index"+e);} return null; }
const imp=/(?:import|export)\s+(?:type\s+)?[^'"]*?\sfrom\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^import\s+['"]([^'"]+)['"]/gm;
const parent=new Map(); const q=[path.resolve(entry)]; parent.set(q[0],null);
while(q.length){ const f=q.shift(); let src; try{src=fs.readFileSync(f,"utf8");}catch{continue;}
  // stop at client boundaries? no: we want to know how the server graph REACHES client modules; record but keep going only through server modules
  const isClient=/^\s*["']use client["']/m.test(src.slice(0,400));
  const isAction=/^\s*["']use server["']/m.test(src.slice(0,400)); if(isAction && process.env.STOP_AT_ACTION && f!==path.resolve(entry)) continue;
  if(process.env.STOP_AT_CLIENT && isClient && f!==path.resolve(entry)) continue;
  for(const m of src.matchAll(imp)){ const spec=m[1]||m[3]; if(!spec) continue; const isType=/import\s+type/.test(m[0]) || (/\{[^}]*\}/.test(m[0]) && m[0].replace(/\{([^}]*)\}/,(a,b)=>"{"+b.split(",").filter(x=>x.trim()&&!/^\s*type\s/.test(x)).join(",")+"}").match(/\{\s*\}/)); if(isType) continue; const r=resolve(f,spec); if(r&&!parent.has(r)){parent.set(r,f); q.push(r);} } }
for(const t of targets){ const hit=[...parent.keys()].find(k=>k.includes(t)); if(!hit){console.log("NOT REACHED:",t);continue;} const chain=[];let c=hit;while(c){chain.push(path.relative(root,c));c=parent.get(c);} console.log("REACHED:",t,"\n   "+chain.reverse().join("\n   -> ")); }
