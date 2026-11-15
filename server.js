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

// Tarif acildiginda Ingilizce -> Turkce ceviri. Once alternatif ucretsiz
// saglayici denenir; erisim siniri/yasak durumunda MyMemory'ye gecilir.
// Google'in bu ucu resmi API degildir; her zaman calisacagi garanti edilmez.
const TRANSLATION_CACHE_FILE = path.join(ROOT, 'data', 'translation-cache.json');
const MYMEMORY_ENDPOINT = process.env.TRANSLATION_API_URL || 'https://api.mymemory.translated.net/get';
const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/t';
const translationCache = new Map();
const ongoingTranslations = new Map();
let usageDate = new Date().toISOString().slice(0,10);
let translatedCharsToday = 0;
try {
  const c=JSON.parse(fs.readFileSync(TRANSLATION_CACHE_FILE,'utf8'));
  for (const [id,item] of Object.entries(c)) if(item && typeof item.instructions==='string')translationCache.set(id,item);
} catch {}
function translationHash(recipe){return crypto.createHash('sha256').update(recipe.name+'\n'+recipe.instructions).digest('hex').slice(0,20);}
function saveTranslations(){
  try {fs.writeFileSync(TRANSLATION_CACHE_FILE,JSON.stringify(Object.fromEntries(translationCache)));}
  catch(err){console.warn('Ceviri onbellegi kalici yazilamadi:',err.message);}
}
// Istege uygun parcala, mumkun oldugunda cumleleri bir arada tut.
// MyMemory: en fazla 500 bayt; guvenlik payi 420. Alternatif: 800 bayt.
function translationChunks(raw,maxBytes){
  const text=String(raw||'').replace(/\r/g,'').trim();
  if(!text)return [];
  const words=text.split(/\s+/).filter(Boolean);
  const chunks=[];let current='';
  for(const word of words){
    const candidate=current?current+' '+word:word;
    if(Buffer.byteLength(candidate,'utf8')<=maxBytes){current=candidate;continue;}
    if(current){chunks.push(current);current='';}
    if(Buffer.byteLength(word,'utf8')<=maxBytes){current=word;continue;}
    let part='';
    for(const char of word){
      if(Buffer.byteLength(part+char,'utf8')>maxBytes){if(part)chunks.push(part);part='';}
      part+=char;
    }
    current=part;
  }
  if(current)chunks.push(current);
  return chunks;
}
function decodeTranslationEntities(input){
  return String(input).replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(whole,entity)=>{
    const e=entity.toLowerCase();const named={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
    if(named[e]!==undefined)return named[e];
    const num=e.startsWith('#x')?parseInt(e.slice(2),16):parseInt(e.slice(1),10);
    return Number.isInteger(num)&&num>0&&num<=0x10ffff?String.fromCodePoint(num):whole;
  });
}
async function fetchJsonWithTimeout(url,timeoutMs=7500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('HTTP '+response.status);
    return await response.json();
  }finally{clearTimeout(timer);}
}
async function googleTranslateText(english){
  const url=new URL(GOOGLE_ENDPOINT);
  url.searchParams.set('client','dict-chrome-ex');
  url.searchParams.set('sl','en');url.searchParams.set('tl','tr');url.searchParams.set('q',english);
  const result=await fetchJsonWithTimeout(url);
  // Bu belgelenmemis uc iki farkli dizi yanit yapisi verebiliyor.
  let translated;
  if(Array.isArray(result)&&Array.isArray(result[0])) translated=result[0][0];
  else if(Array.isArray(result)&&typeof result[0]==='string')translated=result[0];
  if(typeof translated!=='string'||!translated.trim())throw new Error('Gecersiz ceviri yaniti');
  return decodeTranslationEntities(translated.trim());
}
async function myMemoryTranslateText(english){
  const day=new Date().toISOString().slice(0,10);
  if(day!==usageDate){usageDate=day;translatedCharsToday=0;}
  if(translatedCharsToday+english.length>4500)throw new Error('Gunluk anonim ceviri siniri');
  // MyMemory, basarisiz isteklerde de sayaç tuketebilir.
  translatedCharsToday+=english.length;
  const url=new URL(MYMEMORY_ENDPOINT);
  url.searchParams.set('q',english);
  url.searchParams.set('langpair','en|tr');
  if(process.env.MYMEMORY_EMAIL)url.searchParams.set('de',process.env.MYMEMORY_EMAIL);
  const result=await fetchJsonWithTimeout(url);
  const translated=result?.responseData?.translatedText;
  if(Number(result?.responseStatus)!==200||typeof translated!=='string'||!translated.trim()||/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(translated)){
    throw new Error('MyMemory cevirisi kullanilamiyor');
  }
  return decodeTranslationEntities(translated.trim());
}
async function translateWith(recipe,method,limit){
  const parts=translationChunks(recipe.instructions,limit);
  if(!parts.length)throw new Error('Hazirlanis metni bos');
  const translated=[];
  for(const part of parts){translated.push(await method(part));}
  const text=translated.join('\n');
  // Farkli bir dile cevrilmemisse yanlis basari gostermeyelim.
  if(text.toLowerCase()===parts.join('\n').toLowerCase() && text.length>25)throw new Error('Ceviri degismedi');
  // Tarif adinin cevirisi hatali olsa bile hazirlanisi goster.
  let name=recipe.name;
  try{name=await method(recipe.name);}catch{}
  return {name,instructions:text};
}
async function translateRecipe(id){
  const recipe=remote.find(r=>r.id===id);
  if(!recipe)throw new Error('Tarif bulunamadi.');
  const fingerprint=translationHash(recipe);
  const cached=translationCache.get(id);
  if(cached?.hash===fingerprint)return {translated:true,name:cached.name,instructions:cached.instructions,fromCache:true};
  if(ongoingTranslations.has(id))return ongoingTranslations.get(id);
  const job=(async()=>{
    let result;let provider;
    try{
      result=await translateWith(recipe,googleTranslateText,800);
      provider='alternatif';
    }catch(error){
      console.warn('Alternatif ceviri kullanilamiyor:',error.message);
      try{
        result=await translateWith(recipe,myMemoryTranslateText,420);
        provider='MyMemory';
      }catch(fallbackError){
        console.warn('MyMemory cevirisi kullanilamiyor:',fallbackError.message);
        throw new Error('Otomatik ceviri gecici olarak kullanilamiyor. Harici ceviri baglantisini kullanabilirsin.');
      }
    }
    translationCache.set(id,{hash:fingerprint,...result});saveTranslations();
    return {translated:true,...result,fromCache:false,provider};
  })().finally(()=>ongoingTranslations.delete(id));
  ongoingTranslations.set(id,job);
  return job;
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
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    if(req.method==='HEAD')res.end();else res.end(content);
  });
});
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Ne Pişirsem? sunucu ${PORT} portunda çalışıyor.`);
});
