// Ne Pişirsem? - Node.js built-in HTTP server; npm install gerekmez.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
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

// Ücretsiz MyMemory çevirisi: yalnızca kullanıcı tarif açınca istenir.
// 500 bayt/istek ve 5000 karakter/gün anonim limitine karşı kontrollü tüketim.
const TRANSLATION_CACHE_FILE = path.join(ROOT,'data','translation-cache.json');
const TRANSLATION_ENDPOINT = process.env.TRANSLATION_API_URL || 'https://api.mymemory.translated.net/get';
const translationCache = new Map();
const ongoingTranslations = new Map();
let usageDate = new Date().toISOString().slice(0,10);
let translatedCharsToday = 0;
try {
 const c = JSON.parse(fs.readFileSync(TRANSLATION_CACHE_FILE,'utf8'));
 for(const [id,entry] of Object.entries(c)) if(entry && typeof entry.instructions==='string')translationCache.set(id,entry);
} catch {}
function translationHash(recipe){return crypto.createHash('sha256').update(recipe.name+'\n'+recipe.instructions).digest('hex').slice(0,20);}
function saveTranslations(){
 try {fs.writeFileSync(TRANSLATION_CACHE_FILE,JSON.stringify(Object.fromEntries(translationCache)));}
 catch(err){console.warn('Çeviri önbelleği diske yazılamadı:',err.message);}
}
// Türkçe çeviri en fazla 440 UTF-8 baytlık parçalara bölünür (API üst sınırı 500).
function translationChunks(text){
 const parts=[];let current='';
 const words=String(text).replace(/\r/g,'').split(/\s+/).filter(Boolean);
 for(const word of words){
  // Uzun tek bir sözcük gelirse güvenlik için parçalar hâlinde tut.
  if(Buffer.byteLength(word,'utf8')>440){
   if(current){parts.push(current);current='';}
   let piece='';for(const c of word){if(Buffer.byteLength(piece+c,'utf8')>440){parts.push(piece);piece='';}piece+=c;}if(piece)parts.push(piece);
   continue;
  }
  const next=current?current+' '+word:word;
  if(Buffer.byteLength(next,'utf8')>440){if(current)parts.push(current);current=word;}
  else current=next;
 }
 if(current)parts.push(current);
 return parts;
}
function decodeTranslationEntities(input){
 return String(input).replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(whole,entity)=>{
  const e=entity.toLowerCase();
  const named={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
  if(named[e]!==undefined)return named[e];
  const num=e.startsWith('#x')?parseInt(e.slice(2),16):parseInt(e.slice(1),10);
  return Number.isInteger(num)&&num>0&&num<=0x10ffff?String.fromCodePoint(num):whole;
 });
}
async function translateChunk(english){
 const url=new URL(TRANSLATION_ENDPOINT);
 url.searchParams.set('q',english);url.searchParams.set('langpair','en|tr');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('Çeviri servisi şu an erişilemiyor.');
  const json=await response.json();
  const translated=json?.responseData?.translatedText;
  if(Number(json?.responseStatus)!==200||typeof translated!=='string'||!translated.trim()||/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(translated))throw new Error('Ücretsiz çeviri sınırına ulaşıldı.');
  return decodeTranslationEntities(translated.trim());
 }finally{clearTimeout(timer);}
}
async function translateRecipe(id){
 const recipe=remote.find(r=>r.id===id);
 if(!recipe)throw new Error('Tarif bulunamadı.');
 const fingerprint=translationHash(recipe);
 const cached=translationCache.get(id);
 if(cached?.hash===fingerprint)return {translated:true,name:cached.name,instructions:cached.instructions,fromCache:true};
 if(ongoingTranslations.has(id))return ongoingTranslations.get(id);
 const job=(async()=>{
  const parts=translationChunks(recipe.instructions||'');
  const inputs=[recipe.name,...parts];
  const count=inputs.reduce((sum,x)=>sum+x.length,0);
  if(!parts.length)throw new Error('Bu tarifte çevrilecek hazırlanış bilgisi bulunamadı.');
  const day=new Date().toISOString().slice(0,10);
  if(usageDate!==day){usageDate=day;translatedCharsToday=0;}
  // Tüm metne yetecek kota yoksa kısmi ve yanıltıcı çeviri göstermiyoruz.
  if(count>4400||translatedCharsToday+count>4400)throw new Error('Ücretsiz çeviri hizmetinin günlük sınırına ulaşıldı. Orijinal metin gösteriliyor.');
  translatedCharsToday+=count; // İstekler başarısız olsa da tekrarla kotayı aşmayalım.
  const name=await translateChunk(recipe.name);
  const translations=[];
  for(const part of parts)translations.push(await translateChunk(part));
  const result={hash:fingerprint,name,instructions:translations.join('\n')};
  translationCache.set(id,result);saveTranslations();
  return {translated:true,name:result.name,instructions:result.instructions,fromCache:false};
 })().finally(()=>ongoingTranslations.delete(id));
 ongoingTranslations.set(id,job);return job;
}
function translatedRecipes(){return [...local,...remote.map(r=>{
 const cached=translationCache.get(r.id);
 return cached?.hash===translationHash(r)?{...r,displayName:cached.name}:r;
 })];}
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
      try { fs.writeFileSync(CACHE_FILE,JSON.stringify({updatedAt,recipes:remote})); } catch (err) { console.warn('Cache kaydedilemedi:', err.message); }
      state.status=ok===26?'Hazır':'Kısmen hazır';
    } else {state.status='Çevrimdışı';state.error='TheMealDB erişilemiyor; yerel tarifler kullanılabilir.';}
  })().catch(e=>{state.status='Çevrimdışı';state.error=e.message}).finally(()=>{loading=null});
  return loading;
}
function json(res,obj,status=200) {
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(obj));
}
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if (url.pathname==='/api/recipes') {
    if (!isFresh() && !loading) void loadApi();
    return json(res,{recipes:translatedRecipes(),state,localCount:local.length});
  }
  if(url.pathname==='/api/translate' && req.method==='GET'){
    const id=String(url.searchParams.get('id')||'');
    if(!/^meal-\d{4,12}$/.test(id))return json(res,{translated:false,message:'Geçersiz tarif kodu.'},400);
    void translateRecipe(id).then(result=>json(res,result)).catch(err=>json(res,{translated:false,message:err.message||'Çeviri şu an kullanılamıyor.'},503));
    return;
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
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Ne Pişirsem? sunucu ${PORT} portunda çalışıyor.`);
});
