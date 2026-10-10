const $=id=>document.getElementById(id), nf=new Intl.NumberFormat('ar-SA'), pf=new Intl.NumberFormat('ar-SA',{maximumFractionDigits:1});
const colors=['#073c91','#de0032','#628bcb','#f07891','#243b65','#9daec7'];
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const formatDay=d=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'long',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(new Date(d+'T12:00:00+03:00'));
function node(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el}
function render(rows){const counts=new Map();rows.forEach(r=>counts.set(r.city,(counts.get(r.city)||0)+1));const cities=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ar'));$('total').textContent=nf.format(rows.length);$('cityCount').textContent=nf.format(cities.length);$('topCity').textContent=cities[0]?.[0]||'—';$('topPercent').textContent=cities.length?pf.format(cities[0][1]/rows.length*100)+'٪ من العملاء':'لا توجد تسجيلات';$('ringNumber').textContent=nf.format(rows.length);$('recordCount').textContent=nf.format(rows.length)+' تسجيل';$('cityBars').replaceChildren();let angle=0;const stops=[];cities.forEach(([city,count],i)=>{const pct=count/rows.length*100,color=colors[i%colors.length],line=node('div','','city-line'),top=node('div','','city-top'),name=node('span','','city-name'),dot=node('i','','dot');dot.style.background=color;name.append(dot,document.createTextNode(city));const numbers=node('span',nf.format(count)+' عميل','city-numbers');numbers.append(node('strong',pf.format(pct)+'٪'));top.append(name,numbers);const track=node('div','','track'),bar=node('div','','bar');bar.style.width=pct+'%';bar.style.background=color;track.append(bar);line.append(top,track);$('cityBars').append(line);stops.push(color+' '+angle+'% '+(angle+pct)+'%');angle+=pct});$('ring').style.background=stops.length?'conic-gradient('+stops.join(',')+')':'#edf1f7';if(!rows.length)$('cityBars').append(node('div','تظهر نسب المدن بعد أول تسجيل.','empty'));$('records').replaceChildren();[...rows].reverse().forEach((r,i)=>{const tr=node('tr','');tr.append(node('td',nf.format(rows.length-i)),node('td',r.service));const cityCell=node('td','');cityCell.append(node('span',r.city,'city-pill'));tr.append(cityCell,node('td',r.nationality||'—'),node('td',r.vehicle_type||'—'),node('td',r.arrival_source||'—'),node('td',r.time));$('records').append(tr)});$('empty').hidden=rows.length>0}
function message(text,error=false){$('message').textContent=text;$('message').className='message '+(error?'error':'success')}

const config=window.MADAR_CONFIG||{};
const base=(config.supabaseUrl||'').replace(/\/$/,'');
const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)&&/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey||'');
const accessStorageKey='madar.team-access.v1:'+base;
let access=new URLSearchParams(location.hash.slice(1)).get('access');
if(access&&/^[a-f0-9]{64}$/.test(access)){try{sessionStorage.setItem(accessStorageKey,access)}catch{}history.replaceState(null,'',location.pathname+location.search)}
else{try{access=sessionStorage.getItem(accessStorageKey)}catch{access=null}}
if(!/^[a-f0-9]{64}$/.test(access||''))access=null;
let reportSeq=0,pending=null,saving=false,allowed=false;
function status(text){$('storageStatus').textContent=text}
async function rpc(name,args){
  if(!access)throw new Error('NOT_AUTHORIZED');
  const response=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({...args,p_access_token:access}),signal:AbortSignal.timeout(20000),referrerPolicy:'no-referrer'});
  const data=await response.json().catch(()=>null);
  if(!response.ok){const error=new Error(data?.message||'REQUEST_FAILED');error.status=response.status;throw error}
  return data;
}
function friendly(error){if(error.message?.includes('NOT_AUTHORIZED'))return 'رابط الوصول غير صالح أو تم إيقافه. اطلب الرابط الخاص من المسؤول.';if(error.status===429)return 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.';return 'تعذر الاتصال. تحقق من الإنترنت أو حالة الخدمة، ثم أعد المحاولة.'}
async function load(){
  const date=$('reportDate').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!access)return false;
  const seq=++reportSeq;$('dayLabel').textContent=formatDay(date);status('جارٍ تحديث التقرير…');
  try{const data=await rpc('madar_team_day',{p_day:date});if(seq!==reportSeq)return false;
    render(data.rows);allowed=true;$('todayLabel').textContent=formatDay(data.today);$('saveButton').disabled=saving;
    status('بيانات مشتركة • آخر تحديث '+new Intl.DateTimeFormat('ar-SA',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Riyadh'}).format(new Date()));return true;
  }catch(error){if(seq===reportSeq){status(friendly(error)+' التقرير غير محدّث.');if(error.message?.includes('NOT_AUTHORIZED')){allowed=false;$('saveButton').disabled=true;render([])}}return false}
}
$('reportDate').value=today();$('todayLabel').textContent=formatDay(today());$('dayLabel').textContent=formatDay(today());render([]);$('saveButton').disabled=true;
$('reportDate').addEventListener('change',()=>{render([]);load()});$('refreshButton').addEventListener('click',load);
$('entryForm').addEventListener('submit',async event=>{
  event.preventDefault();if(saving||!allowed||$('saveButton').disabled)return;
  const service=$('service').value.normalize('NFC').trim().replace(/\s+/g,' '),city=$('city').value.normalize('NFC').trim().replace(/\s+/g,' '),nationality=$('nationality').value.normalize('NFC').trim().replace(/\s+/g,' '),vehicle_type=$('vehicleType').value.normalize('NFC').trim().replace(/\s+/g,' '),arrival_source=$('arrivalSource').value.normalize('NFC').trim().replace(/\s+/g,' ');
  if(!service||!city||!nationality||!vehicle_type||service.length>120||city.length>60||nationality.length>60||vehicle_type.length>100){message('أكمل الخدمة والمدينة والجنسية ونوع السيارة ضمن الطول المسموح.',true);return}
  if(arrival_source.length>120){message('اكتب «قادم من» في ١٢٠ حرفًا أو أقل.',true);return}
  if(!pending||pending.service!==service||pending.city!==city||pending.nationality!==nationality||pending.vehicle_type!==vehicle_type||pending.arrival_source!==arrival_source)pending={id:crypto.randomUUID(),service,city,nationality,vehicle_type,arrival_source};
  saving=true;$('saveButton').disabled=true;$('saveButton').textContent='جارٍ الحفظ…';message('');
  try{const saved=await rpc('madar_team_add_v3',{p_id:pending.id,p_service:pending.service,p_city:pending.city,p_nationality:pending.nationality,p_vehicle_type:pending.vehicle_type,p_arrival_source:pending.arrival_source});pending=null;$('entryForm').reset();$('reportDate').value=saved.date;
    const updated=await load();message(updated?'تم حفظ العميل في سجل الفريق.':'تم حفظ العميل، لكن تعذر تحديث التقرير. اضغط «تحديث التقرير».');$('service').focus();
  }catch(error){if(error.message?.includes('NOT_AUTHORIZED'))allowed=false;message(friendly(error)+' لم يتم تأكيد الحفظ. أعد المحاولة لنفس الطلب دون تكراره.',true)}
  finally{saving=false;$('saveButton').disabled=!allowed;$('saveButton').textContent='＋ تسجيل العميل'}
});
if(!configured){$('authTitle').textContent='باقي خطوة لتشغيل المنصة';$('authDescription').textContent='لم يتم تفعيل الربط بقاعدة البيانات المشتركة بعد.';status('الحفظ غير مفعّل')}
else if(access){$('authPanel').hidden=true;$('workspace').hidden=false;load()}
else{status('الوصول برابط الفريق الخاص');$('authTitle').textContent='افتح رابط الموظفين';$('authDescription').textContent='استخدم الرابط الخاص الذي أعطاك إياه المسؤول لفتح السجل مباشرة، بدون بريد أو كلمة مرور.'}
setInterval(()=>{if(access&&!document.hidden&&!saving)load()},15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&access&&!saving)load()});
