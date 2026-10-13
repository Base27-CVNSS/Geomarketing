// GeoMarketing browser bundle (generated from src/geo.js + src/demo.js + src/app.modular.js)
// Modules stay available in this source archive for extension and unit testing.

// === GEOMETRY / ETL / HUFF ===
/** Pure geospatial calculations for GeoMarketing. Input GeoJSON is EPSG:4326 [longitude,latitude]. */
const R = 6371.0088;
function distanceKm(a, b) {
  const [x1,y1] = a.map(Number), [x2,y2] = b.map(Number);
  const phi1=y1*Math.PI/180, phi2=y2*Math.PI/180;
  const dphi=(y2-y1)*Math.PI/180, dlambda=(x2-x1)*Math.PI/180;
  const h=Math.sin(dphi/2)**2+Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlambda/2)**2;
  return 2*R*Math.asin(Math.min(1, Math.sqrt(h)));
}
const featureCollection = (features=[])=>({type:'FeatureCollection',features});
const point = (coords,properties={})=>({type:'Feature',geometry:{type:'Point',coordinates:coords},properties});
function circlePolygon(center,radiusKm,steps=72){
  const [lon,lat]=center, phi=lat*Math.PI/180, lambda=lon*Math.PI/180, delta=radiusKm/R;
  const ring=[];
  for(let i=0;i<=steps;i++){
    const bearing=i*2*Math.PI/steps;
    const p=Math.asin(Math.sin(phi)*Math.cos(delta)+Math.cos(phi)*Math.sin(delta)*Math.cos(bearing));
    const l=lambda+Math.atan2(Math.sin(bearing)*Math.sin(delta)*Math.cos(phi),Math.cos(delta)-Math.sin(phi)*Math.sin(p));
    ring.push([((l*180/Math.PI+540)%360)-180,p*180/Math.PI]);
  }
  return {type:'Feature',properties:{radius_km:radiusKm},geometry:{type:'Polygon',coordinates:[ring]}};
}
function centroid(f){
  if(f.geometry.type==='Point') return f.geometry.coordinates;
  const polygon=f.geometry.type==='MultiPolygon'?f.geometry.coordinates[0][0]:f.geometry.coordinates[0];
  if(!polygon?.length) return null;
  let sx=0,sy=0,n=0;
  for(const p of polygon.slice(0,-1)){sx+=p[0];sy+=p[1];n++}
  return n?[sx/n,sy/n]:null;
}
function val(p,names,fallback=''){
  for(const k of names) if(p[k]!==undefined && p[k]!==null && String(p[k]).trim()!=='') return p[k];
  return fallback;
}
function normalizeFeature(f,index=0){
  if(!f||f.type!=='Feature'||!f.geometry||!f.properties||!['Point','Polygon','MultiPolygon'].includes(f.geometry.type)) return null;
  const p=f.properties,g=f.geometry;
  if(g.type==='Point'){
    const c=g.coordinates;
    if(!Array.isArray(c)||c.length<2||!Number.isFinite(+c[0])||!Number.isFinite(+c[1])||Math.abs(+c[0])>180||Math.abs(+c[1])>90) return null;
    const raw=String(val(p,['kind','loai_doi_tuong','loai','type'],'business')).toLowerCase();
    const kind=/chợ|cho|market/.test(raw)?'market':'business';
    const attr=Number(val(p,['attractiveness','suc_hut','quy_mo'],1));
    return point([+c[0],+c[1]],{id:String(val(p,['id','ma_so','ma_doanh_nghiep'],`IMP-${index+1}`)),name:String(val(p,['name','ten','ten_co_so','ten_doanh_nghiep'],`Cơ sở ${index+1}`)),kind,category:String(val(p,['category','nganh_nghe','nhom_nganh'],'Khác')),address:String(val(p,['address','dia_chi'],'')),attractiveness:Number.isFinite(attr)&&attr>0?attr:1,source:'import'});
  }
  const c=centroid(f);
  if(!c||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>90) return null;
  const population=Number(val(p,['population','dan_so','danso'],0));
  const income=Number(val(p,['income_index','chi_so_suc_mua','suc_mua'],1));
  return {type:'Feature',geometry:g,properties:{id:String(val(p,['id','ma_vung'],`ZONE-${index+1}`)),name:String(val(p,['name','ten','ten_vung'],`Vùng ${index+1}`)),kind:'zone',population:Number.isFinite(population)&&population>=0?population:0,income_index:Number.isFinite(income)&&income>0?income:1,source:'import'}};
}
function parseCsv(text){
  const firstLine=text.replace(/^\uFEFF/,'').split(/\r?\n/,1)[0];
  const delimiter=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?';':',';
  const rows=[], row=[]; let field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted}
    else if(c===delimiter&&!quoted){row.push(field);field=''}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row.splice(0));else row.length=0;field=''}
    else field+=c;
  }
  if(quoted)throw Error('CSV có dấu ngoặc kép chưa được đóng');
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2)throw Error('CSV cần hàng tiêu đề và ít nhất một bản ghi');
  const keys=rows.shift().map(k=>k.trim().replace(/^\uFEFF/,''));
  const records=rows.map(line=>Object.fromEntries(keys.map((k,i)=>[k,(line[i]||'').trim()])));
  const features=[];
  records.forEach((p,i)=>{
    const x=Number(val(p,['longitude','lon','lng','kinh_do','x'],NaN));
    const y=Number(val(p,['latitude','lat','vi_do','y'],NaN));
    if(Number.isFinite(x)&&Number.isFinite(y)) features.push({type:'Feature',geometry:{type:'Point',coordinates:[x,y]},properties:p});
  });
  return {features,rejected:records.length-features.length};
}
/** Huff market-share model, illustrative only: Euclidean great-circle distances, not road travel time. */
function analyzeSite(coords,stores,zones,{radiusKm=8,category='all',beta=2,attractiveness=2}={}){
  const compatible=stores.filter(f=>f?.geometry?.type==='Point'&&(category==='all'||f.properties.category===category));
  const nearest=compatible.map(f=>({name:f.properties.name,distance:distanceKm(coords,f.geometry.coordinates)})).sort((a,b)=>a.distance-b.distance);
  const near=nearest.filter(v=>v.distance<=radiusKm);
  let demand=0,weightedDemand=0,captured=0,eligible=0;
  for(const zone of zones){
    const origin=centroid(zone);if(!origin)continue;
    if(distanceKm(coords,origin)>radiusKm)continue;
    const pop=Number(zone.properties.population)||0, income=Number(zone.properties.income_index)||1;
    const w=pop*income; demand+=pop;weightedDemand+=w;eligible++;
    const candidateW=attractiveness/(Math.max(0.2,distanceKm(coords,origin))**beta);
    let alternativeW=0;
    for(const competitor of compatible){
      const d=distanceKm(origin,competitor.geometry.coordinates);
      if(d>radiusKm*2)continue;
      alternativeW+=(Number(competitor.properties.attractiveness)||1)/(Math.max(0.2,d)**beta);
    }
    captured+=w*candidateW/(candidateW+alternativeW);
  }
  const share=weightedDemand?captured/weightedDemand:null;
  const demandIndex=Math.min(100,weightedDemand/600);
  const pressureIndex=100/(1+near.length/2);
  const score=share===null?null:Math.round(0.50*demandIndex+0.25*pressureIndex+0.25*share*100);
  return {nearest:nearest[0]||null,nearCount:near.length,demand,weightedDemand,share,score,zoneCount:eligible,attractiveness,beta,radiusKm,candidate:coords};
}
function asCsv(points){
  const fields=['id','name','kind','category','address','longitude','latitude','attractiveness'];
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  return '\uFEFF'+fields.join(',')+'\n'+points.map(f=>{
    const p=f.properties;return fields.map(k=>quote(k==='longitude'?f.geometry.coordinates[0]:k==='latitude'?f.geometry.coordinates[1]:p[k])).join(',');
  }).join('\n');
}

// === SYNTHETIC DEMO DATA ===

const centers=[
 ['TP. Bến Tre',106.3757,10.2415],['Châu Thành',106.306,10.280],['Giồng Trôm',106.510,10.161],
 ['Ba Tri',106.586,10.048],['Bình Đại',106.698,10.193],['Mỏ Cày Bắc',106.289,10.218],
 ['Mỏ Cày Nam',106.344,10.080],['Chợ Lách',106.177,10.239],['Thạnh Phú',106.541,9.922]
];
const sampleCategories=['Bán lẻ','Thực phẩm','Dịch vụ','Vật tư nông nghiệp','Logistics'];
function createDemoData(){
 let seed=2026;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 const businesses=[], markets=[], zones=[];
 centers.forEach(([area,x,y],j)=>{
   for(let k=0;k<6;k++){
     const dx=(rand()-.5)*.062,dy=(rand()-.5)*.046;
     businesses.push(point([x+dx,y+dy],{id:`DEMO-CSKD-${j*6+k+1}`,name:`Cơ sở mẫu ${String(j*6+k+1).padStart(2,'0')}`,kind:'business',category:sampleCategories[(j+k)%categories.length],address:`Vị trí giả định · ${area}`,attractiveness:+(1+rand()*3).toFixed(1),source:'demo'}));
   }
   for(let k=0;k<2;k++) markets.push(point([x+(rand()-.5)*.04,y+(rand()-.5)*.032],{id:`DEMO-CHO-${j*2+k+1}`,name:`Chợ mô phỏng ${j*2+k+1}`,kind:'market',category:'Chợ',address:`Vị trí giả định · ${area}`,attractiveness:3,source:'demo'}));
 });
 for(let r=0;r<8;r++)for(let c=0;c<10;c++){
   const x=106.08+c*.071+(r%2)*.035,y=9.92+r*.068,dx=.037,dy=.032;
   const ring=[];for(let k=0;k<=6;k++){const a=(Math.PI/3)*k;ring.push([x+dx*Math.cos(a),y+dy*Math.sin(a)])}
   zones.push({type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{id:`DEMO-VUNG-${r*10+c+1}`,name:`Ô nhu cầu mô phỏng ${r*10+c+1}`,kind:'zone',population:Math.round(650+rand()*3400),income_index:+(.65+rand()*.9).toFixed(2),source:'demo'}});
 }
 return {businesses:featureCollection(businesses),markets:featureCollection(markets),zones:featureCollection(zones),areas:centers.map(v=>v[0])};
}

// === MAP CONTROLLER ===


const $=id=>document.getElementById(id);
const fmt=v=>Number(v).toLocaleString('vi-VN',{maximumFractionDigits:0});
const state={...createDemoData(),mode:'demo',files:[],candidate:null,analysis:null,category:'all',radiusKm:8,beta:2,attractiveness:2,visibility:{businesses:true,markets:true,zones:true,buffer:true},search:''};
let map,ready=false,toastTimer,threeD=false;
const sources=['businesses','markets','zones'];
const categories=()=>[...new Set(state.businesses.features.map(f=>f.properties.category))].sort();
const safeDownload=(name,content,type)=>{const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)};
const notify=message=>{const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4300)};
function switchView(view){for(const el of document.querySelectorAll('.panel-view'))el.classList.toggle('active',el.id==='view-'+view);for(const btn of document.querySelectorAll('.rail-icon'))btn.classList.toggle('active',btn.dataset.target===view);if(view==='analysis'&&!state.candidate)notify('Nhấp một vị trí bất kỳ trên bản đồ để thử phân tích.');}
function updateCounters(){
 $('kpi-business').textContent=fmt(state.businesses.features.length);$('kpi-market').textContent=fmt(state.markets.features.length);$('kpi-zone').textContent=fmt(state.zones.features.length);
 const total=state.zones.features.reduce((n,f)=>n+(Number(f.properties.population)||0),0);$('kpi-population').textContent=state.zones.features.length?fmt(total):'N/A';
 $('dataset-status').textContent=state.mode==='demo'?'Bộ dữ liệu mô phỏng':`Dữ liệu nhập · ${state.files.length} tệp`;
 const counts=new Map();for(const f of state.businesses.features)counts.set(f.properties.category,(counts.get(f.properties.category)||0)+1);
 const pairs=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,7),max=Math.max(1,...pairs.map(p=>p[1]));$('category-bars').replaceChildren();
 if(!pairs.length){$('category-bars').textContent='Chưa có lớp cơ sở kinh doanh.'}
 pairs.forEach(([label,count])=>{const wrap=document.createElement('div');wrap.className='category-item';const name=document.createElement('span');name.textContent=label;const val=document.createElement('b');val.textContent=count;const track=document.createElement('div');track.className='bar-track';const bar=document.createElement('div');bar.style.width=`${count/max*100}%`;track.append(bar);wrap.append(name,val,track);$('category-bars').append(wrap)});
 const select=$('business-type'),last=select.value;select.replaceChildren(new Option('Tất cả ngành hàng','all'));for(const c of categories())select.add(new Option(c,c));select.value=[...select.options].some(o=>o.value===last)?last:'all';state.category=select.value;
 renderList();renderAnalysis();
}
function renderList(){
 const features=[...state.businesses.features,...state.markets.features].filter(f=>{const q=state.search.toLocaleLowerCase('vi');return [f.properties.name,f.properties.id,f.properties.category,f.properties.address].some(s=>String(s||'').toLocaleLowerCase('vi').includes(q))});
 $('point-counter').textContent=`${fmt(features.length)} kết quả`;$('point-list').replaceChildren();
 if(!features.length){const p=document.createElement('p');p.className='hint';p.textContent='Không tìm thấy địa điểm.';$('point-list').append(p);return}
 for(const f of features.slice(0,90)){
  const b=document.createElement('button');b.type='button';b.className='point-item';const ico=document.createElement('div');ico.className='point-symbol'+(f.properties.kind==='market'?' market':'');ico.textContent=f.properties.kind==='market'?'⌂':'▣';
  const meta=document.createElement('div');meta.className='point-meta';const name=document.createElement('b');name.textContent=f.properties.name;const sub=document.createElement('small');sub.textContent=f.properties.category+' · '+f.properties.id;meta.append(name,sub);
  const arrow=document.createElement('span');arrow.className='goto';arrow.textContent='↗';b.append(ico,meta,arrow);b.onclick=()=>focusPoint(f);$('point-list').append(b)
 }
 if(features.length>90){const el=document.createElement('p');el.className='hint';el.textContent='Hiển thị 90 địa điểm đầu. Hãy tìm kiếm để lọc.';$('point-list').append(el)}
}
function popupFor(f){if(!ready)return;const p=f.properties,el=document.createElement('div');const h=document.createElement('strong');h.textContent=p.name;const txt=document.createElement('small');txt.textContent=`${p.category||p.kind||''} · ${p.id||''}\n${p.address||''}`;txt.style.whiteSpace='pre-line';el.append(h,txt);new maplibregl.Popup({offset:14,maxWidth:'290px'}).setLngLat(f.geometry.coordinates).setDOMContent(el).addTo(map)}
function focusPoint(f){if(!ready){notify('Bản đồ chưa sẵn sàng.');return}map.flyTo({center:f.geometry.coordinates,zoom:13,speed:1.2});popupFor(f)}
function addSource(id,data){if(!map.getSource(id))map.addSource(id,{type:'geojson',data});else map.getSource(id).setData(data)}
function addLayers(){
 addSource('zones',state.zones);addSource('businesses',state.businesses);addSource('markets',state.markets);addSource('site',featureCollection());addSource('buffer',featureCollection());
 map.addLayer({id:'zones-fill',type:'fill',source:'zones',paint:{'fill-color':['interpolate',['linear'],['coalesce',['to-number',['get','income_index']],1],.5,'#ddebe6',1,'#9de4cc',1.7,'#2cb68c'],'fill-opacity':.42}});
 map.addLayer({id:'zones-line',type:'line',source:'zones',paint:{'line-color':'#36a58b','line-opacity':.25,'line-width':1}});
 map.addLayer({id:'buffer-fill',type:'fill',source:'buffer',paint:{'fill-color':'#2a74dd','fill-opacity':.10}});
 map.addLayer({id:'buffer-outline',type:'line',source:'buffer',paint:{'line-color':'#2779c9','line-dasharray':[2,2],'line-width':2}});
 map.addLayer({id:'business-points',type:'circle',source:'businesses',paint:{'circle-radius':['interpolate',['linear'],['zoom'],7,3,14,8],'circle-color':'#0b9f80','circle-stroke-color':'#ffffff','circle-stroke-width':1.6,'circle-opacity':.93}});
 map.addLayer({id:'market-points',type:'circle',source:'markets',paint:{'circle-radius':['interpolate',['linear'],['zoom'],7,5,14,10],'circle-color':'#f19631','circle-stroke-color':'#fff','circle-stroke-width':2}});
 map.addLayer({id:'site-halo',type:'circle',source:'site',paint:{'circle-radius':20,'circle-color':'#136ae8','circle-opacity':.18}});
 map.addLayer({id:'site-point',type:'circle',source:'site',paint:{'circle-radius':8,'circle-color':'#136ae8','circle-stroke-color':'#fff','circle-stroke-width':3}});
 for(const id of ['business-points','market-points']){
   map.on('click',id,e=>{if(e.features?.[0])popupFor(e.features[0])});map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',id,()=>map.getCanvas().style.cursor='crosshair');
 }
 ready=true;syncSources();updateVisibility();
}
function syncSources(){if(!ready)return;for(const id of sources)addSource(id,state[id]);
 map.getSource('site').setData(featureCollection(state.candidate?[point(state.candidate,{name:'Ứng viên'})]:[]));
 map.getSource('buffer').setData(featureCollection(state.candidate?[circlePolygon(state.candidate,state.radiusKm)]:[]));
}
function updateVisibility(){if(!ready)return;const names={businesses:['business-points'],markets:['market-points'],zones:['zones-fill','zones-line'],buffer:['buffer-fill','buffer-outline']};for(const [k,ids] of Object.entries(names)){for(const id of ids)map.setLayoutProperty(id,'visibility',state.visibility[k]?'visible':'none')}}
function selectCandidate(coords){state.candidate=[+coords[0],+coords[1]];state.analysis=null;$('candidate-coords').textContent=`${coords[1].toFixed(5)}°N, ${coords[0].toFixed(5)}°E`;$('run-analysis').disabled=false;syncSources();renderAnalysis()}
function renderAnalysis(){const el=$('analysis-results');el.replaceChildren();const a=state.analysis;
 if(!a){el.className='analysis-empty';el.textContent=state.candidate?'Vị trí đã chọn. Nhấn “Phân tích địa điểm” để tính toán.':'Chọn một vị trí trên bản đồ để bắt đầu.';return}
 el.className='';const head=document.createElement('div');head.className='results-top';const desc=document.createElement('div');const title=document.createElement('b');title.textContent='Chỉ số phù hợp';const hint=document.createElement('p');hint.className='hint';hint.textContent='Điểm minh họa / 100';desc.append(title,hint);const score=document.createElement('span');score.className='score';score.textContent=a.score===null?'N/A':a.score;head.append(desc,score);el.append(head);
 const list=document.createElement('div');list.className='result-lines';const rows=[['Cơ sở cạnh tranh gần',fmt(a.nearCount)],['Đối thủ gần nhất',a.nearest?`${a.nearest.distance.toFixed(2)} km`:'Chưa có'],['Vùng nhu cầu trong bán kính',fmt(a.zoneCount)],['Dân số trong bán kính',a.zoneCount?fmt(a.demand):'N/A'],['Thị phần Huff mô phỏng',a.share===null?'N/A':`${(a.share*100).toFixed(1)}%`]];
 for(const [k,v] of rows){const row=document.createElement('div');const label=document.createElement('span');label.textContent=k;const value=document.createElement('b');value.textContent=v;row.append(label,value);list.append(row)}el.append(list);
 if(!a.zoneCount){const p=document.createElement('p');p.className='hint';p.textContent='Không có vùng dân số trong bán kính. Nhập GeoJSON vùng nhu cầu (Polygon) để mô hình Huff có cơ sở tính.';el.append(p)}
}
function analyze(){if(!state.candidate)return;state.analysis=analyzeSite(state.candidate,state.businesses.features,state.zones.features,{radiusKm:state.radiusKm,category:state.category,beta:state.beta,attractiveness:state.attractiveness});renderAnalysis();notify('Đã phân tích theo dữ liệu hiện có. Kết quả chỉ mang tính mô phỏng.');}
function boundsOfData(){const coords=[...state.businesses.features,...state.markets.features].map(f=>f.geometry.coordinates);
 for(const f of state.zones.features){const raw=f.geometry.coordinates;const rings=f.geometry.type==='Polygon'?raw:[].concat(...raw);for(const ring of rings)for(const c of ring)if(Array.isArray(c)&&typeof c[0]==='number')coords.push(c)}
 if(!coords.length)return null;const xs=coords.map(c=>c[0]),ys=coords.map(c=>c[1]);return [[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)]]}
function fitData(){const b=boundsOfData();if(ready&&b)map.fitBounds(b,{padding:65,maxZoom:12,duration:800});else if(ready)map.flyTo({center:[106.376,10.241],zoom:10})}
function initMap(){
 if(!window.maplibregl){$('map').innerHTML='<div style="padding:150px 30px;text-align:center;color:#596e80;font-weight:700">Không thể tải MapLibre. Kiểm tra kết nối Internet hoặc CDN.</div>';notify('Không tải được thư viện bản đồ MapLibre.');return}
 map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/bright',center:[106.376,10.241],zoom:9.35,minZoom:3,pitch:0,attributionControl:false});map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-left');map.addControl(new maplibregl.ScaleControl({maxWidth:90,unit:'metric'}),'bottom-left');
 map.on('load',addLayers);map.on('error',e=>{console.warn('Map style/tile warning:',e.error?.message||e);if(!ready&&map.loaded())addLayers()});
 map.on('mousemove',e=>{$('coordinates').textContent=`${e.lngLat.lng.toFixed(5)}°E · ${e.lngLat.lat.toFixed(5)}°N`});
 map.on('click',e=>{if(!ready)return;const hits=map.queryRenderedFeatures(e.point,{layers:['business-points','market-points']});if(hits.length)return;selectCandidate([e.lngLat.lng,e.lngLat.lat])});
}
async function importFiles(files){if(!files.length)return;let invalid=0,added=0,successful=0;const out={businesses:[],markets:[],zones:[]},names=[];
 for(const file of files){try{
  if(file.size>12*1024*1024)throw Error('Tệp quá 12 MB');const text=await file.text();let records=[];
  if(/\.csv$/i.test(file.name)){const r=parseCsv(text);invalid+=r.rejected;records=r.features}
  else {const o=JSON.parse(text);records=o.type==='FeatureCollection'?o.features:o.type==='Feature'?[o]:[];if(!Array.isArray(records)||!records.length)throw Error('GeoJSON thiếu FeatureCollection.features')}
  if(records.length>50000)throw Error('Vượt giới hạn 50.000 đối tượng / tệp');let n=0;
  records.forEach((f,i)=>{const norm=normalizeFeature(f,i);if(!norm){invalid++;return}const key=norm.properties.kind==='zone'?'zones':norm.properties.kind==='market'?'markets':'businesses';out[key].push(norm);n++});
  if(!n)throw Error('Không có đối tượng hợp lệ với kinh độ/vĩ độ WGS84');added+=n;successful++;names.push(file.name);
 }catch(err){invalid++;notify(`Không nhập ${file.name}: ${err.message}`)}}
 if(!added)return;
 if(state.mode==='demo'){state.businesses=featureCollection();state.markets=featureCollection();state.zones=featureCollection();state.files=[]}
 for(const id of sources)state[id].features.push(...out[id]);state.mode='import';state.files.push(...names);state.candidate=null;state.analysis=null;$('candidate-coords').textContent='Chưa lựa chọn';$('run-analysis').disabled=true;syncSources();updateCounters();fitData();$('import-log').textContent=`Đã nhận ${fmt(added)} đối tượng hợp lệ từ ${successful} tệp. Loại ${fmt(invalid)} bản ghi / tệp không hợp lệ. Dữ liệu đang lưu trong RAM của trình duyệt.`;notify(`Đã nhập ${fmt(added)} đối tượng từ ${successful} tệp.`);
}
function bind(){
 document.querySelectorAll('.rail-icon').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.target)));
 document.querySelectorAll('[data-layer]').forEach(el=>el.addEventListener('change',()=>{state.visibility[el.dataset.layer]=el.checked;updateVisibility()}));
 $('search').addEventListener('input',e=>{state.search=e.target.value;renderList()});
 $('business-type').addEventListener('change',e=>{state.category=e.target.value;state.analysis=null;renderAnalysis()});
 for(const [id,property,label,format] of [['radius','radiusKm','radius-label',v=>`${v} km`],['attract','attractiveness','attract-label',v=>(+v).toFixed(1)],['beta','beta','beta-label',v=>(+v).toFixed(1)]])$(''+id).addEventListener('input',e=>{state[property]=+e.target.value;$(label).textContent=format(state[property]);state.analysis=null;syncSources();renderAnalysis()});
 $('run-analysis').onclick=analyze;
 const upload=()=> $('file-input').click();$('import-button').onclick=upload;$('upload-inline').onclick=upload;$('file-input').onchange=async e=>{await importFiles([...e.target.files]);e.target.value=''};
 const drop=$('drop-zone');for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('drag')});for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('drag')});drop.addEventListener('drop',e=>importFiles([...e.dataTransfer.files]));
 $('reset-demo').onclick=()=>{const d=createDemoData();for(const id of sources)state[id]=d[id];state.mode='demo';state.files=[];state.candidate=null;state.analysis=null;state.search='';$('search').value='';$('candidate-coords').textContent='Chưa lựa chọn';$('run-analysis').disabled=true;$('import-log').textContent='Đang sử dụng dữ liệu mô phỏng. Lần nhập đầu tiên sẽ thay thế toàn bộ dữ liệu demo.';syncSources();updateCounters();fitData();notify('Đã khôi phục dữ liệu mô phỏng.')};
 $('export-geojson').onclick=()=>safeDownload('geomarketing.geojson',JSON.stringify(featureCollection([...state.businesses.features,...state.markets.features,...state.zones.features]),null,2),'application/geo+json');
 $('export-csv').onclick=()=>safeDownload('co-so-kinh-doanh.csv',asCsv([...state.businesses.features,...state.markets.features]),'text/csv;charset=utf-8');
 $('export-analysis').onclick=()=>{if(!state.analysis){notify('Bạn cần chạy phân tích địa điểm trước.');return}safeDownload('phan-tich-huff.json',JSON.stringify({...state.analysis,mode:state.mode,disclaimer:'Illustrative model; great-circle distance; not a permit decision'},null,2),'application/json')};
 $('zoom-to-data').onclick=fitData;$('map-3d').onclick=()=>{if(!ready)return;threeD=!threeD;map.easeTo({pitch:threeD?52:0,bearing:threeD?-18:0,duration:900});$('map-3d').textContent=threeD?'2D':'3D'};
 $('dismiss-note').onclick=()=>document.querySelector('.demo-alert').remove();
}
bind();updateCounters();
// External map script is deferred and finishes before type="module" execution in standards-conforming browsers.
initMap();
