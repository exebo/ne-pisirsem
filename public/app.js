'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/[^a-z0-9]+/g,' ').trim();
// Sınıfta sık kullanılan malzeme eş anlamları ve İngilizce TheMealDB karşılıkları.
const groups={
 'Yumurta':['egg','eggs','yumurta'], 'Patates':['potato','potatoes','patates'], 'Domates':['tomato','tomatoes','plum tomatoes','domates'],
 'Soğan':['onion','onions','red onion','red onions','white onion','yellow onion','soğan','sogan'],
 'Sarımsak':['garlic','garlic clove','garlic cloves','sarımsak'],
 'Biber':['pepper','green pepper','bell pepper','green chilli','red pepper','romano pepper','biber'],
 'Beyaz peynir':['feta','feta cheese','white cheese','beyaz peynir','peynir'],
 'Kaşar peyniri':['cheddar','cheddar cheese','mozzarella','kaşar','kaşar peyniri'],
 'Sıvı yağ':['vegetable oil','sunflower oil','canola oil','cooking oil','sıvı yağ','ayçiçek yağı','yag'],
 'Zeytinyağı':['olive oil','extra virgin olive oil','zeytinyağı'],
 'Tereyağı':['butter','unsalted butter','tereyağı'], 'Un':['flour','plain flour','all purpose flour','all-purpose flour','self raising flour','un'],
 'Süt':['milk','whole milk','süt'], 'Yoğurt':['yogurt','yoghurt','greek yogurt','yoğurt'],
 'Ekmek':['bread','white bread','bread slices','ekmek'], 'Makarna':['pasta','spaghetti','penne','macaroni','makarna'],
 'Salça':['tomato paste','tomato puree','red pepper paste','salça'], 'Tuz':['salt','sea salt','tuz'],
 'Salatalık':['cucumber','salatalık'], 'Pirinç':['rice','basmati rice','long grain rice','pirinç'],
 'Tavuk':['chicken','chicken breast','chicken thighs','chicken legs','tavuk'],
 'Kıyma':['minced beef','ground beef','beef mince','lamb mince','kıyma'],
 'Havuç':['carrot','carrots','havuç'], 'Limon':['lemon','lemon juice','lime','limon'],
 'Mantar':['mushrooms','mushroom','mantar'], 'Şeker':['sugar','caster sugar','white sugar','şeker'],
 'Maydanoz':['parsley','fresh parsley','maydanoz'], 'Nane':['mint','fresh mint','nane'],
 'Pul biber':['chilli flakes','chili flakes','pul biber'], 'Karabiber':['black pepper','ground pepper','karabiber'],
 'Mercimek':['lentils','red lentils','green lentils','mercimek'], 'Nohut':['chickpeas','chickpea','nohut'],
 'Kabak':['zucchini','courgette','kabak'], 'Patlıcan':['aubergine','eggplant','patlıcan'],
 'Ispanak':['spinach','ıspanak'], 'Krema':['cream','double cream','heavy cream','krema'],
 'Bal':['honey','bal'], 'Mısır':['sweetcorn','corn','mısır'], 'Sirke':['vinegar','white vinegar','sirke'],
 'Su':['water','su'], 'Muz':['banana','bananas','muz'], 'Elma':['apple','apples','elma'],
 'Yulaf':['oats','oatmeal','yulaf'], 'Sosis':['sausage','sausages','sosis'],
 'Kırmızı et':['beef','lamb','steak','kırmızı et'], 'Ton balığı':['tuna','canned tuna','ton balığı']
};
const aliases=new Map();Object.entries(groups).forEach(([key,values])=>values.concat([key]).forEach(v=>aliases.set(normalize(v),key)));
// Çeşit çeşit peynir veya yağ otomatik olarak aynı sayılmaz; belirgin alt türler korunur.
function canonical(s){const n=normalize(s);return aliases.get(n)||s.trim();}
function key(s){return normalize(canonical(s));}
let selected=[];let favorites=[];let recipes=[];let activeFilter='ready';let showCount=12;let onlyFavorites=false;
try{selected=JSON.parse(localStorage.getItem('np_selected')||'[]');favorites=JSON.parse(localStorage.getItem('np_favs')||'[]');}catch{}
selected=selected.filter(x=>typeof x==='string');favorites=favorites.filter(x=>typeof x==='string');
const quick=['Yumurta','Patates','Domates','Soğan','Biber','Beyaz peynir','Makarna','Süt','Yoğurt','Un','Sıvı yağ','Tuz','Ekmek','Sarımsak'];
const persist=()=>{localStorage.setItem('np_selected',JSON.stringify(selected));localStorage.setItem('np_favs',JSON.stringify(favorites));};
const nameOf=s=>canonical(String(s||'').trim().slice(0,60));
function addIngredient(s){const v=nameOf(s);if(!v)return;if(!selected.some(x=>key(x)===key(v)))selected.push(v);$('ingredientInput').value='';$('suggestions').hidden=true;persist();renderSelected();renderResults();}
function renderSelected(){ $('selectedChips').innerHTML=selected.length?selected.map(s=>`<span class="chip">${esc(s)} <button type="button" data-remove="${esc(s)}" aria-label="${esc(s)} kaldır">×</button></span>`).join(''):'<span class="muted">Henüz malzeme seçmedin.</span>';$('selectionCount').textContent=`${selected.length} malzeme seçildi`;}
function suggestions(){const q=normalize($('ingredientInput').value);const box=$('suggestions');if(!q){box.hidden=true;return;}const candidates=[...new Set([...Object.keys(groups),...recipes.flatMap(r=>r.ingredients.map(i=>nameOf(i.name)))])].filter(s=>normalize(s).includes(q)&&!selected.some(x=>key(x)===key(s))).slice(0,7);box.innerHTML=candidates.map(s=>`<button type="button" data-suggest="${esc(s)}">${esc(s)}</button>`).join('');box.hidden=!candidates.length;}
function matched(r){const needed=[...new Map(r.ingredients.map(i=>[key(i.name),canonical(i.name)])).entries()];const missing=needed.filter(([k])=>!selected.some(s=>key(s)===k)).map(([,n])=>n);return {...r,missing,matched:needed.length-missing.length,total:needed.length};}
function card(r){const fav=favorites.includes(r.id);const label=r.missing.length===0?'✓ Yapabilirsin':`${r.missing.length} eksik malzeme`;return `<article class="recipeCard">${r.image?`<img class="cardImage" src="${esc(r.image)}" alt="${esc(r.name)}" loading="lazy" referrerpolicy="no-referrer">`:`<div class="cardImage">${esc(r.emoji||'🍲')}</div>`}<div class="cardBody"><div class="cardTop"><span class="tag ${r.missing.length?'missing':''}">${esc(label)}</span><button type="button" class="fav ${fav?'on':''}" data-fav="${esc(r.id)}" aria-label="Favorilere ekle">${fav?'♥':'♡'}</button></div><h3>${esc(r.name)}</h3><div class="meta">${esc(r.category||'Tarif')} · ${r.minutes?esc(r.minutes)+' dk · ':''}${r.source==='TheMealDB'?'TheMealDB':'Türkçe tarif'}</div><div class="need">${r.missing.length?'Eksik: '+esc(r.missing.slice(0,3).join(', '))+(r.missing.length>3?'…':''):'Tüm malzemeler seçili 🎉'}</div><button class="detailBtn" type="button" data-detail="${esc(r.id)}">Tarifi incele →</button></div></article>`;}
function renderResults(){const list=recipes.map(matched);const ready=list.filter(r=>r.missing.length===0);const almost=list.filter(r=>r.missing.length===1);$('readyNum').textContent=ready.length;$('almostNum').textContent=almost.length;$('allNum').textContent=list.length;$('favCount').textContent=favorites.length;let result=activeFilter==='ready'?ready:activeFilter==='almost'?almost:list;result.sort((a,b)=>a.missing.length-b.missing.length||b.matched-a.matched||a.name.localeCompare(b.name,'tr'));if(onlyFavorites)result=result.filter(r=>favorites.includes(r.id));$('statusText').textContent=onlyFavorites?'Kaydettiğin favoriler':selected.length?`${selected.length} malzemeyle ${ready.length} tam eşleşme ve ${almost.length} tek eksiği olan tarif bulundu.`:'Malzemelerini seçerek başla. Tüm tarifler sekmesinden keşfe de çıkabilirsin.';$('recipeGrid').innerHTML=result.length?result.slice(0,showCount).map(card).join(''):`<div class="empty">🍽️<b>Burada henüz tarif yok.</b>${activeFilter==='ready'?'Bir malzeme daha eklemeyi veya “Bir eksiğim var” sekmesini dene.':'Diğer sekmeleri kontrol edebilir veya yeni malzeme ekleyebilirsin.'}</div>`;$('moreBtn').hidden=result.length<=showCount;document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el.dataset.filter===activeFilter));$('favoritesBtn').firstChild.textContent=onlyFavorites?'♥ Favoriler açık ':'♡ Favoriler ';}
function detail(id){const r=recipes.find(x=>x.id===id);if(!r)return;const m=matched(r);$('modalContent').innerHTML=`<button class="close" type="button" id="modalClose" aria-label="Kapat">×</button>${r.image?`<img class="modalHero" src="${esc(r.image)}" alt="${esc(r.name)}">`:`<div class="modalHero">${esc(r.emoji||'🍲')}</div>`}<h2>${esc(r.name)}</h2><div class="meta">${esc(r.category||'Tarif')} · ${esc(r.area||'')} · Kaynak: ${esc(r.source)}</div><span class="tag ${m.missing.length?'missing':''}">${m.missing.length?m.missing.length+' eksik malzeme':'Tüm malzemeler seçili'}</span><div class="columns"><div><h3>Malzemeler</h3><ul>${r.ingredients.map(i=>`<li>${esc(nameOf(i.name))} <span class="muted">${esc(i.measure)}</span> ${selected.some(s=>key(s)===key(i.name))?'✅':'○'}</li>`).join('')}</ul></div><div><h3>Hazırlanışı</h3><p>${esc(r.instructions||'Bu tarif için hazırlanış bilgisi bulunmuyor.')}</p>${r.source==='TheMealDB'?'<p class="muted">Kaynak tarifin hazırlanışı orijinal dilinde verilir.</p>':''}${r.youtube&&/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(r.youtube)?`<a class="sourceLink" target="_blank" rel="noopener noreferrer" href="${esc(r.youtube)}">🎬 Tarif videosu ↗</a>`:''}</div></div><p class="muted">Bilgi: Malzeme miktarlarını değil, yalnızca var/yok durumunu karşılaştırıyoruz. Alerjenleri ve tarifi ayrıca kontrol edin.</p>`;$('recipeDialog').showModal();$('modalClose').onclick=()=>$('recipeDialog').close();}
$('quickChips').innerHTML=quick.map(s=>`<button type="button" data-suggest="${esc(s)}">+ ${esc(s)}</button>`).join('');
$('ingredientInput').addEventListener('input',suggestions);$('ingredientInput').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();addIngredient(e.target.value.split(',')[0]);}});
$('addButton').onclick=()=>addIngredient($('ingredientInput').value);
$('clearBtn').onclick=()=>{selected=[];persist();renderSelected();renderResults();};
$('searchButton').onclick=()=>{activeFilter='ready';showCount=12;onlyFavorites=false;renderResults();$('sonuclar').scrollIntoView({behavior:'smooth'});};
$('favoritesBtn').onclick=()=>{onlyFavorites=!onlyFavorites;activeFilter='explore';showCount=12;renderResults();$('sonuclar').scrollIntoView({behavior:'smooth'});};
$('moreBtn').onclick=()=>{showCount+=12;renderResults();};
document.addEventListener('click',e=>{const el=e.target.closest('[data-suggest],[data-remove],[data-detail],[data-fav],[data-filter]');if(!el)return;if(el.dataset.suggest)addIngredient(el.dataset.suggest);if(el.dataset.remove){selected=selected.filter(x=>x!==el.dataset.remove);persist();renderSelected();renderResults();}if(el.dataset.detail)detail(el.dataset.detail);if(el.dataset.fav){const id=el.dataset.fav;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];persist();renderResults();}if(el.dataset.filter){activeFilter=el.dataset.filter;onlyFavorites=false;showCount=12;renderResults();}});
$('recipeDialog').addEventListener('click',e=>{if(e.target===$('recipeDialog'))$('recipeDialog').close();});
let lastRemote=0;let checks=0;
async function sync(){try{const response=await fetch('/api/recipes');if(!response.ok)throw Error('API');const data=await response.json();const newRecipes=data.recipes||[];if(newRecipes.length!==recipes.length){recipes=newRecipes;renderResults();}const st=data.state;$('sourceIndicator').textContent=st.status==='Hazır'?`✅ ${data.localCount} yerel + ${st.imported} API tarifi`:st.status==='Yükleniyor'?`⏳ API tarifleri alınıyor (${st.imported} tarif)`:`🍲 ${data.localCount} yerel tarif · API: ${st.status}`;if(st.status==='Yükleniyor'&&checks++<55)setTimeout(sync,5000);}catch{$('sourceIndicator').textContent='⚠️ Sunucuya bağlanılamıyor';}}
renderSelected();renderResults();sync();
