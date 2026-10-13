import {point,featureCollection} from './geo.js';
const centers=[
 ['TP. Bến Tre',106.3757,10.2415],['Châu Thành',106.306,10.280],['Giồng Trôm',106.510,10.161],
 ['Ba Tri',106.586,10.048],['Bình Đại',106.698,10.193],['Mỏ Cày Bắc',106.289,10.218],
 ['Mỏ Cày Nam',106.344,10.080],['Chợ Lách',106.177,10.239],['Thạnh Phú',106.541,9.922]
];
const sampleCategories=['Bán lẻ','Thực phẩm','Dịch vụ','Vật tư nông nghiệp','Logistics'];
export function createDemoData(){
 let seed=2026;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
 const businesses=[], markets=[], zones=[];
 centers.forEach(([area,x,y],j)=>{
   for(let k=0;k<6;k++){
     const dx=(rand()-.5)*.062,dy=(rand()-.5)*.046;
     businesses.push(point([x+dx,y+dy],{id:`DEMO-CSKD-${j*6+k+1}`,name:`Cơ sở mẫu ${String(j*6+k+1).padStart(2,'0')}`,kind:'business',category:sampleCategories[(j+k)%sampleCategories.length],address:`Vị trí giả định · ${area}`,attractiveness:+(1+rand()*3).toFixed(1),source:'demo'}));
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