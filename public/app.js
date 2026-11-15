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

// TheMealDB'de sık görülen, fakat eşleştirme sözlüğünde bulunmayan malzemeler.
// Yanlış eşleştirmemek için 'plantain' normal muzla birleştirilmez.
const extraIngredients={
 'plantain':'Yemeklik muz (plantain)', 'plantains':'Yemeklik muz (plantain)',
 'sweet potato':'Tatlı patates', 'sweet potatoes':'Tatlı patates',
 'coconut milk':'Hindistan cevizi sütü', 'coconut':'Hindistan cevizi',
 'ginger':'Zencefil','fresh ginger':'Taze zencefil','cumin':'Kimyon',
 'turmeric':'Zerdeçal','cinnamon':'Tarçın','paprika':'Toz kırmızı biber',
 'oregano':'Kekik','thyme':'Kekik','basil':'Fesleğen','rosemary':'Biberiye',
 'coriander':'Kişniş','coriander leaves':'Kişniş yaprağı',
 'bay leaf':'Defne yaprağı','bay leaves':'Defne yaprağı',
 'chicken stock':'Tavuk suyu','beef stock':'Et suyu','vegetable stock':'Sebze suyu',
 'soy sauce':'Soya sosu','tomato sauce':'Domates sosu',
 'red wine vinegar':'Kırmızı şarap sirkesi', 'white wine vinegar':'Beyaz şarap sirkesi',
 'baking powder':'Kabartma tozu','baking soda':'Karbonat','vanilla extract':'Vanilya özütü',
 'vanilla':'Vanilya','yeast':'Maya','dry yeast':'Kuru maya',
 'oil':'Sıvı yağ','vegetable oil':'Sıvı yağ',
 'peanut butter':'Fıstık ezmesi','peanuts':'Yer fıstığı','walnuts':'Ceviz',
 'almonds':'Badem','hazelnuts':'Fındık','raisins':'Kuru üzüm',
 'breadcrumbs':'Galeta unu', 'cornflour':'Mısır nişastası','cornstarch':'Mısır nişastası',
 'plain yogurt':'Yoğurt','parmesan':'Parmesan peyniri',
 'cream cheese':'Krem peynir','sour cream':'Ekşi krema',
 'beef':'Dana eti','lamb':'Kuzu eti','salmon':'Somon','prawns':'Karides',
 'shrimp':'Karides','fish':'Balık','tuna':'Ton balığı',
 'kidney beans':'Barbunya','black beans':'Siyah fasulye',
 'white beans':'Kuru fasulye','green beans':'Taze fasulye',
 'celery':'Kereviz','leek':'Pırasa','broccoli':'Brokoli',
 'cauliflower':'Karnabahar','cabbage':'Lahana','lettuce':'Marul',
 'peas':'Bezelye','frozen peas':'Dondurulmuş bezelye',
 'chilli':'Acı biber','chili':'Acı biber','chilli powder':'Acı biber tozu',
 'chocolate':'Çikolata','dark chocolate':'Bitter çikolata',
 'icing sugar':'Pudra şekeri','powdered sugar':'Pudra şekeri',
 'brown sugar':'Esmer şeker','maple syrup':'Akçaağaç şurubu'
};
const trCategories={beef:'Et yemekleri',chicken:'Tavuk',dessert:'Tatlı',lamb:'Kuzu eti',miscellaneous:'Diğer',pasta:'Makarna',pork:'Domuz eti',seafood:'Deniz ürünleri',side:'Garnitür',starter:'Başlangıç',vegan:'Vegan',vegetarian:'Vejetaryen',breakfast:'Kahvaltı',goat:'Keçi eti'};
const trAreas={turkish:'Türkiye',italian:'İtalya',american:'ABD',british:'Britanya',french:'Fransa',japanese:'Japonya',chinese:'Çin',indian:'Hindistan',mexican:'Meksika',greek:'Yunanistan',spanish:'İspanya',thai:'Tayland',jamaican:'Jamaika',moroccan:'Fas',egyptian:'Mısır',vietnamese:'Vietnam',canadian:'Kanada'};
function translatedCategory(s){return trCategories[normalize(s)]||s||'Tarif';}
function translatedArea(s){return trAreas[normalize(s)]||s||'';}
function displayMeasure(value){
 let s=String(value||'').trim();if(!s)return '';
 const replacements=[
  [/\bcups?\b/gi,'su bardağı'],[/\btablespoons?\b|\btbsps?\b/gi,'yemek kaşığı'],
  [/\bteaspoons?\b|\btsps?\b/gi,'çay kaşığı'],[/\bpinch(?:es)?\b/gi,'tutam'],
  [/\bcloves?\b/gi,'diş'],[/\bslices?\b/gi,'dilim'],
  [/\bpieces?\b/gi,'parça'],[/\bgrams?\b/gi,'gram'],
  [/\bkilograms?\b/gi,'kilogram'],[/\bml\b/gi,'ml'],
  [/\blit(?:er|re)s?\b/gi,'litre'],[/\boz\b/gi,'ons'],
  [/\bsmall\b/gi,'küçük'],[/\bmedium\b/gi,'orta'],[/\blarge\b/gi,'büyük'],
  [/\bto taste\b/gi,'damak tadına göre'],[/\boptional\b/gi,'isteğe bağlı'],
  [/\bhandful\b/gi,'avuç'],[/\bchopped\b/gi,'doğranmış'],
  [/\bdiced\b/gi,'küp doğranmış'],[/\bgrated\b/gi,'rendelenmiş'],
  [/\bfinely\b/gi,'ince'],[/\bcrushed\b/gi,'ezilmiş']
 ];
 for(const [pattern,translation] of replacements)s=s.replace(pattern,translation);
 return s;
}
const aliases=new Map();Object.entries(groups).forEach(([key,values])=>values.concat([key]).forEach(v=>aliases.set(normalize(v),key)));
// Çeşit çeşit peynir veya yağ otomatik olarak aynı sayılmaz; belirgin alt türler korunur.
function canonical(s){const n=normalize(s);return aliases.get(n)||extraIngredients[n]||String(s||'').trim();}
function key(s){return normalize(canonical(s));}
let selected=[];let favorites=[];let recipes=[];let activeFilter='suggested';let showCount=12;let onlyFavorites=false;let currentDetailId=null;
try{selected=JSON.parse(localStorage.getItem('np_selected')||'[]');favorites=JSON.parse(localStorage.getItem('np_favs')||'[]');}catch{}
selected=selected.filter(x=>typeof x==='string');favorites=favorites.filter(x=>typeof x==='string');
const quick=['Yumurta','Patates','Domates','Soğan','Biber','Beyaz peynir','Makarna','Süt','Yoğurt','Un','Sıvı yağ','Tuz','Ekmek','Sarımsak'];
const persist=()=>{localStorage.setItem('np_selected',JSON.stringify(selected));localStorage.setItem('np_favs',JSON.stringify(favorites));};
const nameOf=s=>canonical(String(s||'').trim().slice(0,60));
function addIngredient(s){const v=nameOf(s);if(!v)return;if(!selected.some(x=>key(x)===key(v)))selected.push(v);$('ingredientInput').value='';$('suggestions').hidden=true;persist();renderSelected();renderResults();}
function renderSelected(){ $('selectedChips').innerHTML=selected.length?selected.map(s=>`<span class="chip">${esc(s)} <button type="button" data-remove="${esc(s)}" aria-label="${esc(s)} kaldır">×</button></span>`).join(''):'<span class="muted">Henüz malzeme seçmedin.</span>';$('selectionCount').textContent=`${selected.length} malzeme seçildi`;}
function suggestions(){const q=normalize($('ingredientInput').value);const box=$('suggestions');if(!q){box.hidden=true;return;}const candidates=[...new Set([...Object.keys(groups),...recipes.flatMap(r=>r.ingredients.map(i=>nameOf(i.name)))])].filter(s=>normalize(s).includes(q)&&!selected.some(x=>key(x)===key(s))).slice(0,7);box.innerHTML=candidates.map(s=>`<button type="button" data-suggest="${esc(s)}">${esc(s)}</button>`).join('');box.hidden=!candidates.length;}
function matched(r){const needed=[...new Map(r.ingredients.map(i=>[key(i.name),canonical(i.name)])).entries()];const missing=needed.filter(([k])=>!selected.some(s=>key(s)===k)).map(([,n])=>n);return {...r,missing,matched:needed.length-missing.length,total:needed.length};}
function sortMatches(list){
 return list.sort((a,b)=>a.missing.length-b.missing.length||b.matched-a.matched||a.name.localeCompare(b.name,'tr'));
}
function card(r){
 const fav=favorites.includes(r.id);const missing=r.missing.length;
 const label=missing===0?'✓ Şimdi yapabilirsin':`⚠ ${missing} malzeme eksik`;
 const missingHtml=missing?`<div class="missingNotice"><strong>⚠ Eksik malzemelerin:</strong><div class="missingItems">${r.missing.map(x=>`<span>${esc(x)}</span>`).join('')}</div></div>`:'<div class="readyNotice">✓ Tüm malzemelerin mevcut</div>';
 return `<article class="recipeCard ${missing?'missingCard':'readyCard'}">${r.image?`<img class="cardImage" src="${esc(r.image)}" alt="${esc(r.displayName||r.name)}" loading="lazy" referrerpolicy="no-referrer">`:`<div class="cardImage">${esc(r.emoji||'🍲')}</div>`}<div class="cardBody"><div class="cardTop"><span class="tag ${missing?'missing':''}">${esc(label)}</span><button type="button" class="fav ${fav?'on':''}" data-fav="${esc(r.id)}" aria-label="Favorilere ekle">${fav?'♥':'♡'}</button></div><h3>${esc(r.displayName||r.name)}</h3><div class="meta">${esc(translatedCategory(r.category))} · ${r.minutes?esc(r.minutes)+' dk · ':''}${r.source==='TheMealDB'?'TheMealDB':'Türkçe tarif'}</div>${missingHtml}<button class="detailBtn" type="button" data-detail="${esc(r.id)}">Tarifi incele →</button></div></article>`;
}
function resultSection(title,subtitle,entries,tone){
 return `<section class="resultGroup ${tone}"><div class="resultGroupHeader"><div><h3>${title} <span class="countBubble">${entries.length}</span></h3><p>${subtitle}</p></div></div><div class="recipeGrid">${entries.length?entries.slice(0,showCount).map(card).join(''):`<div class="empty">🍽️<b>${tone==='readyGroup'?'Bu malzemelerle tam eşleşme bulunamadı.':'Az malzeme eksiği olan tarif bulunamadı.'}</b>Başka bir malzeme seçerek tekrar deneyebilirsin.</div>`}</div></section>`;
}
function renderResults(){
 const list=recipes.map(matched);
 const ready=sortMatches(list.filter(r=>r.missing.length===0));
 const almost=sortMatches(list.filter(r=>r.missing.length>=1&&r.missing.length<=2&&r.matched>0));
 const oneMissing=almost.filter(r=>r.missing.length===1);
 $('readyNum').textContent=ready.length;
 $('missingNum').textContent=almost.length;
 $('allNum').textContent=list.length;
 $('favCount').textContent=favorites.length;
 let result=[];
 if(onlyFavorites){result=sortMatches(list.filter(r=>favorites.includes(r.id)));}
 else if(activeFilter==='ready')result=ready;
 else if(activeFilter==='missing')result=almost;
 else if(activeFilter==='explore')result=sortMatches(list);
 $('statusText').textContent=onlyFavorites?'Kaydettiğin favori tarifler':selected.length?`${selected.length} malzemenle ${ready.length} tarifi hemen yapabilir, ${oneMissing.length} tarifi yalnızca 1 malzeme tamamlayarak deneyebilirsin.`:'Malzemelerini seç, yapabileceklerin ve eksikleri olan tarifler birlikte görüntülensin.';
 if(activeFilter==='suggested'&&!onlyFavorites){
  if(!selected.length){
   $('recipeResults').innerHTML='<div class="empty">🧺<b>Önce malzemelerini seç.</b>Sonrasında yapabileceğin ve eksik malzemeli tarifler birlikte görünecek.</div>';
   $('moreBtn').hidden=true;
  }else{
   const readyList=ready;
   const missingList=almost;
   $('recipeResults').innerHTML=resultSection('✅ Şimdi yapabileceklerin','Evindeki malzemeler bu tarifler için yeterli.',readyList,'readyGroup')+resultSection('⚠ Eksik malzemeli tarifler','1 veya 2 malzeme tamamladığında yapabileceklerin. Turuncu kutularda eksiklerin yazıyor.',missingList,'missingGroup');
   $('moreBtn').hidden=readyList.length<=showCount&&missingList.length<=showCount;
  }
 }else{
  $('recipeResults').innerHTML=`<div class="recipeGrid">${result.length?result.slice(0,showCount).map(card).join(''):'<div class="empty">🍽️<b>Burada henüz tarif yok.</b>Başka malzemeler seçmeyi veya diğer sekmeleri denemeyi deneyebilirsin.</div>'}</div>`;
  $('moreBtn').hidden=result.length<=showCount;
 }
 document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('active',el.dataset.filter===activeFilter&&!onlyFavorites));
 // Sadece metin düğümünü güncelleyerek favCount elemanının silinmesini engelliyoruz.
 $('favoritesBtn').firstChild.textContent=onlyFavorites?'♥ Favoriler açık ':'♡ Favoriler ';
}
async function loadTurkishDetail(r){
 const id=r.id;
 if(r.source!=='TheMealDB')return;
 try{
  const response=await fetch(`/api/translate?id=${encodeURIComponent(id)}`);
  const data=await response.json();
  if(currentDetailId!==id||!$('recipeDialog').open)return;
  const content=$('instructionText');const note=$('translationNote');
  if(response.ok&&data.translated&&data.instructions){
   content.textContent=data.instructions;
   note.textContent='Otomatik Türkçe çeviri. Ölçü ve pişirme talimatlarını kontrol et.';
   if(data.name){r.displayName=data.name;const title=$('detailTitle');if(title)title.textContent=data.name;renderResults();}
  }else{
   content.textContent=r.instructions||'Hazırlanış bilgisi bulunamadı.';
   note.textContent=(data&&data.message)||'Türkçe çeviri şu an kullanılamıyor; orijinal metin gösteriliyor.';
  }
 }catch{
  if(currentDetailId===id&&$('recipeDialog').open){$('instructionText').textContent=r.instructions||'';$('translationNote').textContent='Çeviri servisine ulaşılamadı; orijinal metin gösteriliyor.';}
 }
}
function detail(id){
 const r=recipes.find(x=>x.id===id);if(!r)return;
 currentDetailId=id;
 const m=matched(r);
 const ingredientList=r.ingredients.map(i=>{
  const has=selected.some(s=>key(s)===key(i.name));
  return `<li class="ingredientLine ${has?'':'ingredientMissing'}"><span class="ingredientLabel">${esc(nameOf(i.name))} <small class="measure">${esc(displayMeasure(i.measure))}</small></span><strong class="ingredientState">${has?'✓ Var':'⚠ Eksik'}</strong></li>`;
 }).join('');
 const status=m.missing.length?`<div class="modalMissing"><strong>⚠ ${m.missing.length} eksik malzemen var:</strong><div class="missingItems">${m.missing.map(n=>`<span>${esc(n)}</span>`).join('')}</div></div>`:'<div class="modalReady">✓ Bu tarifin tüm malzemelerine sahipsin.</div>';
 const remote=r.source==='TheMealDB';
 $('modalContent').innerHTML=`<button class="close" type="button" id="modalClose" aria-label="Kapat">×</button>${r.image?`<img class="modalHero" src="${esc(r.image)}" alt="${esc(r.displayName||r.name)}">`:`<div class="modalHero">${esc(r.emoji||'🍲')}</div>`}<h2 id="detailTitle">${esc(r.displayName||r.name)}</h2><div class="meta">${esc(translatedCategory(r.category))} · ${esc(translatedArea(r.area))} · Kaynak: ${esc(r.source)}</div>${status}<div class="columns"><div><h3>Malzemeler</h3><ul class="modalIngredients">${ingredientList}</ul></div><div><h3>Hazırlanışı</h3><p id="instructionText">${remote?'Tarif Türkçeye çevriliyor…':esc(r.instructions||'Bu tarif için hazırlanış bilgisi bulunmuyor.')}</p>${remote?'<p class="muted translationNote" id="translationNote">Ücretsiz çeviri servisi kontrol ediliyor…</p>':''}${r.youtube&&/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(r.youtube)?`<a class="sourceLink" target="_blank" rel="noopener noreferrer" href="${esc(r.youtube)}">🎬 Tarif videosu ↗</a>`:''}</div></div><p class="muted">Bilgi: Malzeme miktarlarını değil, yalnızca var/yok durumunu karşılaştırıyoruz. Alerjenleri ve tarifi ayrıca kontrol et.</p>`;
 $('recipeDialog').showModal();$('modalClose').onclick=()=>$('recipeDialog').close();
 if(remote)void loadTurkishDetail(r);
}
$('quickChips').innerHTML=quick.map(s=>`<button type="button" data-suggest="${esc(s)}">+ ${esc(s)}</button>`).join('');
$('ingredientInput').addEventListener('input',suggestions);$('ingredientInput').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();addIngredient(e.target.value.split(',')[0]);}});
$('addButton').onclick=()=>addIngredient($('ingredientInput').value);
$('clearBtn').onclick=()=>{selected=[];persist();renderSelected();renderResults();};
$('searchButton').onclick=()=>{activeFilter='suggested';showCount=12;onlyFavorites=false;renderResults();$('sonuclar').scrollIntoView({behavior:'smooth'});};
$('favoritesBtn').onclick=()=>{onlyFavorites=!onlyFavorites;activeFilter='explore';showCount=12;renderResults();$('sonuclar').scrollIntoView({behavior:'smooth'});};
$('moreBtn').onclick=()=>{showCount+=12;renderResults();};
document.addEventListener('click',e=>{const el=e.target.closest('[data-suggest],[data-remove],[data-detail],[data-fav],[data-filter]');if(!el)return;if(el.dataset.suggest)addIngredient(el.dataset.suggest);if(el.dataset.remove){selected=selected.filter(x=>x!==el.dataset.remove);persist();renderSelected();renderResults();}if(el.dataset.detail)detail(el.dataset.detail);if(el.dataset.fav){const id=el.dataset.fav;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];persist();renderResults();}if(el.dataset.filter){activeFilter=el.dataset.filter;onlyFavorites=false;showCount=12;renderResults();}});
$('recipeDialog').addEventListener('click',e=>{if(e.target===$('recipeDialog'))$('recipeDialog').close();});
let lastRemote=0;let checks=0;
async function sync(){try{const response=await fetch('/api/recipes');if(!response.ok)throw Error('API');const data=await response.json();const newRecipes=data.recipes||[];if(newRecipes.length!==recipes.length){recipes=newRecipes;renderResults();}else if(newRecipes.some((x,i)=>x.displayName && recipes[i]?.displayName!==x.displayName)){recipes=newRecipes;renderResults();}const st=data.state;$('sourceIndicator').textContent=st.status==='Hazır'?`✅ ${data.localCount} yerel + ${st.imported} API tarifi`:st.status==='Yükleniyor'?`⏳ API tarifleri alınıyor (${st.imported} tarif)`:`🍲 ${data.localCount} yerel tarif · API: ${st.status}`;if(st.status==='Yükleniyor'&&checks++<55)setTimeout(sync,5000);}catch{$('sourceIndicator').textContent='⚠️ Sunucuya bağlanılamıyor';}}
renderSelected();renderResults();sync();
