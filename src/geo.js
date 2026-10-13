/** Pure geospatial calculations for GeoMarketing. Input GeoJSON is EPSG:4326 [longitude,latitude]. */
const R = 6371.0088;
export function distanceKm(a, b) {
  const [x1,y1] = a.map(Number), [x2,y2] = b.map(Number);
  const phi1=y1*Math.PI/180, phi2=y2*Math.PI/180;
  const dphi=(y2-y1)*Math.PI/180, dlambda=(x2-x1)*Math.PI/180;
  const h=Math.sin(dphi/2)**2+Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlambda/2)**2;
  return 2*R*Math.asin(Math.min(1, Math.sqrt(h)));
}
export const featureCollection = (features=[])=>({type:'FeatureCollection',features});
export const point = (coords,properties={})=>({type:'Feature',geometry:{type:'Point',coordinates:coords},properties});
export function circlePolygon(center,radiusKm,steps=72){
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
export function centroid(f){
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
export function normalizeFeature(f,index=0){
  if(!f||f.type!=='Feature'||!f.geometry||!f.properties||!['Point','Polygon','MultiPolygon'].includes(f.geometry.type)) return null;
  const p=f.properties,g=f.geometry;
  if(g.type==='Point'){
    const c=g.coordinates;
    if(!Array.isArray(c)||c.length<2||!Number.isFinite(+c[0])||!Number.isFinite(+c[1])||Math.abs(+c[0])>180||Math.abs(+c[1])>90) return null;
    const raw=String(val(p,['kind','loai_doi_tuong','loai','type'],'business')).toLowerCase();
    const kind=/chợ|cho|market/.test(raw)?'market':'business';
    const attr=Number(val(p,['attractiveness','suc_hut','quy_mo'],1));
    return point([+c[0],+c[1]],{...p,id:String(val(p,['id','ma_so','ma_doanh_nghiep'],`IMP-${index+1}`)),name:String(val(p,['name','ten','ten_co_so','ten_doanh_nghiep'],`Cơ sở ${index+1}`)),kind,category:String(val(p,['category','nganh_nghe','nhom_nganh'],'Khác')),address:String(val(p,['address','dia_chi'],'')),attractiveness:Number.isFinite(attr)&&attr>0?attr:1,source:'import'});
  }
  const c=centroid(f);
  if(!c||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>90) return null;
  const population=Number(val(p,['population','dan_so','danso'],0));
  const income=Number(val(p,['income_index','chi_so_suc_mua','suc_mua'],1));
  return {type:'Feature',geometry:g,properties:{...p,id:String(val(p,['id','ma_vung'],`ZONE-${index+1}`)),name:String(val(p,['name','ten','ten_vung'],`Vùng ${index+1}`)),kind:'zone',population:Number.isFinite(population)&&population>=0?population:0,income_index:Number.isFinite(income)&&income>0?income:1,source:'import'}};
}
export function parseCsv(text){
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
export function analyzeSite(coords,stores,zones,{radiusKm=8,category='all',beta=2,attractiveness=2}={}){
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
export function asCsv(points){
  const fields=['id','name','kind','category','address','longitude','latitude','attractiveness'];
  const quote=v=>{const raw=String(v??'');const protectedValue=/^[\s]*[=+@-]/.test(raw)?"'"+raw:raw;return '"'+protectedValue.replaceAll('"','""')+'"'};
  return '\uFEFF'+fields.join(',')+'\n'+points.map(f=>{
    const p=f.properties;return fields.map(k=>quote(k==='longitude'?f.geometry.coordinates[0]:k==='latitude'?f.geometry.coordinates[1]:p[k])).join(',');
  }).join('\n');
}