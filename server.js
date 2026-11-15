// Ne Pişirsem? - Node.js built-in HTTP server; npm install gerekmez.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const BASE = 'https://www.themealdb.com/api/json/v1/1';
const ROOT = __dirname;
const CACHE_FILE = path.join(ROOT,'data','cache.json');
const local = JSON.parse(fs.readFileSync(path.join(ROOT,'data','local-recipes.json'),'utf8')).map(r=>({...r,source:'Yerel tarif'}));
let remote = [];
let state = {status:'Beklemede', imported:0, updatedAt:null, error:null};
let loading = null;
try {
  const c = JSON.parse(fs.readFileSync(CACHE_FILE,'utf8'));
  if (Array.isArray(c.recipes)) { remote=c.recipes; state={status:'Hazır',imported:remote.length,updatedAt:c.updatedAt,error:null}; }
} catch {}
const isFresh = () => state.updatedAt && Date.now()-new Date(state.updatedAt).getTime() < 24*60*60*1000;
const sleep = n=>new Promise(r=>setTimeout(r,n));
function parseMeal(m) {
  const ingredients=[];
  for(let i=1;i<=20;i++) {
    const name=String(m['strIngredient'+i]||'').trim();
    if(name) ingredients.push({name,measure:String(m['strMeasure'+i]||'').trim()});
  }
  return {id:'meal-'+m.idMeal,name:m.strMeal||'İsimsiz tarif',category:m.strCategory||'',area:m.strArea||'',image:m.strMealThumb||'',instructions:m.strInstructions||'',youtube:m.strYoutube||'',ingredients,source:'TheMealDB'};
}
async function loadApi() {
  if(loading) return loading;
  if(isFresh()) return;
  loading=(async()=>{
    state.status='Yükleniyor';state.error=null;
    const records=new Map();let ok=0;
    for(const letter of 'abcdefghijklmnopqrstuvwxyz') {
      try {
        const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),9000);
        let data;
        try {
          const r=await fetch(`${BASE}/search.php?f=${letter}`,{signal:controller.signal,headers:{'Accept':'application/json'}});
          if(!r.ok) throw Error(`HTTP ${r.status}`);
          data=await r.json();
        } finally {clearTimeout(timeout);}
        if(Array.isArray(data.meals)) for(const meal of data.meals) records.set(meal.idMeal,parseMeal(meal));
        ok++;
        state.imported=records.size;
        // İstekleri peş peşe yığmamak için küçük bekleme.
        await sleep(400);
      } catch(err) { state.error='API bağlantısında bazı harfler alınamadı.'; }
    }
    if (ok>0 && records.size) {
      remote=[...records.values()];
      state.imported=remote.length;
      // Eksik harflerde cache süresi kısa tutulur.
      const updatedAt = ok===26 ? new Date().toISOString() : new Date(Date.now()-23*60*60*1000).toISOString();
      state.updatedAt=updatedAt;
      fs.writeFileSync(CACHE_FILE,JSON.stringify({updatedAt,recipes:remote}));
      state.status=ok===26?'Hazır':'Kısmen hazır';
    } else {state.status='Çevrimdışı';state.error='TheMealDB erişilemiyor; yerel tarifler kullanılabilir.';}
  })().catch(e=>{state.status='Çevrimdışı';state.error=e.message}).finally(()=>{loading=null});
  return loading;
}
function json(res,obj,status=200) {
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(obj));
}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if (url.pathname==='/api/recipes') {
    if (!isFresh() && !loading) void loadApi();
    return json(res,{recipes:[...local,...remote],state,localCount:local.length});
  }
  if (url.pathname==='/api/status') return json(res,state);
  if (url.pathname==='/api/refresh' && req.method==='POST') {
    // Public refresh endpoint yok; API'nin gereksiz yere çağrılmasını önler.
    return json(res,{error:'Yenilemek için sunucuyu yeniden başlatın veya cache dosyasını silin.'},403);
  }
  if(req.method!=='GET' && req.method!=='HEAD') return json(res,{error:'Method not allowed'},405);
  const pathname=url.pathname==='/'?'/index.html':url.pathname;
  const file=path.resolve(ROOT,'public','.'+pathname);
  const pub=path.resolve(ROOT,'public');
  if(!file.startsWith(pub+path.sep)) {res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(file,(err,content)=>{
    if(err){res.writeHead(404);return res.end('Sayfa bulunamadı');}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else res.end(content);
  });
});
server.listen(PORT,HOST,()=>console.log(`Ne Pişirsem? http://${HOST}:${PORT} | Node 18+`));
