/* Reports are generated locally. Customer data is never sent to a PDF service. */
const LucasReports=(()=>{
  const DAY=86400000;
  function periodDates(kind,value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('INVALID_DATE');
    const anchor=new Date(value+'T12:00:00Z');
    if(!Number.isFinite(+anchor)||anchor.toISOString().slice(0,10)!==value)throw new Error('INVALID_DATE');
    let start=new Date(anchor),end=new Date(anchor);
    if(kind==='week'){start=new Date(+anchor-((anchor.getUTCDay()+1)%7)*DAY);end=new Date(+start+6*DAY)}
    else if(kind==='month'){start.setUTCDate(1);end=new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+1,0,12))}
    else if(kind!=='day')throw new Error('INVALID_PERIOD');
    const dates=[];for(let d=+start;d<=+end;d+=DAY)dates.push(new Date(d).toISOString().slice(0,10));
    return {start:dates[0],end:dates.at(-1),dates};
  }
  async function collect(dates,request,onProgress=()=>{}){
    const results=new Array(dates.length);let cursor=0,done=0;
    const outcomes=await Promise.allSettled(Array.from({length:Math.min(3,dates.length)},async()=>{
      while(cursor<dates.length){const index=cursor++,data=await request(dates[index]);
        if(!data||!Array.isArray(data.rows)||data.rows.some(r=>r.date!==dates[index]))throw new Error('INCOMPLETE_REPORT');
        results[index]=data.rows;onProgress(++done,dates.length);
      }
    }));
    const failed=outcomes.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    return results.flat().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)||a.id.localeCompare(b.id));
  }
  function pdf(jpegs,width,height){
    const enc=new TextEncoder(),parts=[],offsets=[0];let size=0;
    const add=s=>{const bytes=typeof s==='string'?enc.encode(s):s;parts.push(bytes);size+=bytes.length};
    const object=(id,body)=>{offsets[id]=size;add(id+' 0 obj\n');add(body);add('\nendobj\n')};
    add('%PDF-1.4\n%Lucas report\n');
    object(1,'<< /Type /Catalog /Pages 2 0 R >>');
    object(2,'<< /Type /Pages /Count '+jpegs.length+' /Kids ['+jpegs.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
    jpegs.forEach((url,i)=>{
      const p=3+i*3,image=p+1,content=p+2,raw=atob(url.split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      object(p,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im${i} ${image} 0 R >> >> /Contents ${content} 0 R >>`);
      offsets[image]=size;add(`${image} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);add(bytes);add('\nendstream\nendobj\n');
      const stream=`q\n841.89 0 0 595.28 0 0 cm\n/Im${i} Do\nQ\n`;
      object(content,`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}endstream`);
    });
    const xref=size;add('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');
    for(let i=1;i<offsets.length;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
    add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts,{type:'application/pdf'});
  }
  async function render(rows,range,kind){
    await document.fonts.ready;
    await Promise.all([document.fonts.load('400 22px "IBM Plex Sans Arabic"'),document.fonts.load('600 34px "IBM Plex Sans Arabic"')]);
    const logo=document.querySelector('.shield');if(logo&&!logo.complete)await logo.decode().catch(()=>{});
    const W=1684,H=1190,M=64,BOTTOM=1090,jpegs=[];
    const counts=new Map();rows.forEach(r=>counts.set(r.city,(counts.get(r.city)||0)+1));
    const cities=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ar'));
    const label={day:'يومي',week:'أسبوعي',month:'شهري'}[kind],period=range.start+'  /  '+range.end;
    let c,ctx,y,page=0;
    const ink='#102b55',red='#de0032';
    function text(value,x,top,size=23,color=ink,bold=false,align='right',direction='rtl'){
      ctx.fillStyle=color;ctx.font=`${bold?600:400} ${size}px "IBM Plex Sans Arabic", sans-serif`;ctx.textAlign=align;ctx.textBaseline='top';ctx.direction=direction;ctx.fillText(String(value),x,top);
    }
    function save(){if(!c)return;text('لوكاس أوتو لوب | خدمات الزيوت',W-M,1130,19,'#64748b');text('صفحة '+nf.format(page),M,1130,19,'#64748b',false,'left');jpegs.push(c.toDataURL('image/jpeg',0.94))}
    function newPage(section){save();page++;c=document.createElement('canvas');c.width=W;c.height=H;ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.fillStyle=ink;ctx.fillRect(0,0,W,165);ctx.fillStyle=red;ctx.fillRect(0,165,W,6);
      if(logo?.naturalWidth)ctx.drawImage(logo,W-M-108,25,108,108);
      text('لوكاس أوتو لوب | تقرير '+label,W-M-135,29,34,'#fff',true);text(section,W-M-135,86,23,'#d6e3f6');
      text(period,M,45,23,'#fff',false,'left','ltr');text('بتوقيت السعودية',M,89,19,'#d6e3f6',false,'left');y=205;
    }
    function wrap(value,width){
      ctx.font='400 22px "IBM Plex Sans Arabic", sans-serif';
      const result=[];let line='';
      for(const word of String(value??'—').split(/\s+/)){
        if(ctx.measureText(line+(line?' ':'')+word).width<=width){line+=(line?' ':'')+word;continue}
        if(line){result.push(line);line=''}
        for(const char of word){if(line&&ctx.measureText(line+char).width>width){result.push(line);line=''}line+=char}
      }if(line||!result.length)result.push(line);return result;
    }
    function table(headers,widths,values,section){
      function header(){ctx.fillStyle=ink;ctx.fillRect(M,y,W-2*M,49);let x=W-M;headers.forEach((h,i)=>{text(h,x-13,y+9,22,'#fff',true);x-=widths[i]});y+=49}
      if(y+110>BOTTOM)newPage(section);header();
      values.forEach((cells,index)=>{
        const lines=cells.map((cell,i)=>wrap(cell,widths[i]-26)),height=Math.max(53,...lines.map(a=>a.length*34+20));
        if(y+height>BOTTOM){newPage(section+' - تابع');header()}
        ctx.fillStyle=index%2?'#f1f5fa':'#fff';ctx.fillRect(M,y,W-2*M,height);let x=W-M;
        lines.forEach((list,i)=>{list.forEach((line,j)=>text(line,x-13,y+10+j*34,22));x-=widths[i]});
        ctx.strokeStyle='#dce3ed';ctx.beginPath();ctx.moveTo(M,y+height);ctx.lineTo(W-M,y+height);ctx.stroke();y+=height;
      });y+=24;
    }
    newPage('ملخص الفترة وتوزيع المدن');
    text('إجمالي العملاء: '+nf.format(rows.length),W-M,y,31,ink,true);text('عدد المدن: '+nf.format(cities.length),820,y,31,ink,true);y+=67;
    text('تاريخ إصدار التقرير: '+new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(new Date()),W-M,y,21,'#64748b');y+=58;
    if(!rows.length){text('لا توجد تسجيلات خلال الفترة المحددة.',W-M,y,29);save();return {jpegs,blob:pdf(jpegs,W,H)}}
    table(['المدينة','عدد العملاء','النسبة من إجمالي الفترة'],[740,350,466],cities.map(([city,count])=>[city,nf.format(count),pf.format(count/rows.length*100)+'٪']),'توزيع العملاء حسب المدينة');
    if(y+44>BOTTOM)newPage('ملاحظات التقرير');text('النسب مقربة لأقرب عُشر. علامة — تعني أن البيانات غير مسجلة في السجلات القديمة.',W-M,y,20,'#64748b');
    newPage('جميع تسجيلات العملاء خلال الفترة');
    table(['#','التاريخ','الوقت','الخدمة المطلوبة','المدينة','الجنسية','نوع السيارة'],[65,185,155,360,255,230,306],rows.map((r,i)=>[nf.format(i+1),r.date,r.time,r.service,r.city,r.nationality||'—',r.vehicle_type||'—']),'جميع تسجيلات العملاء خلال الفترة');
    save();return {jpegs,blob:pdf(jpegs,W,H)};
  }
  return {periodDates,collect,pdf,render};
})();

(()=>{
  let busy=false,objectUrl=null;
  $('exportDate').value=today();
  function rangeLabel(){try{const r=LucasReports.periodDates($('exportPeriod').value,$('exportDate').value);$('exportRange').textContent='الفترة: '+formatDay(r.start)+(r.end===r.start?'':' إلى '+formatDay(r.end))+($('exportPeriod').value==='week'?' • السبت إلى الجمعة':'');$('exportDateLabel').textContent={day:'تاريخ التقرير',week:'اختر يومًا من الأسبوع',month:'اختر يومًا من الشهر'}[$('exportPeriod').value]}catch{$('exportRange').textContent='اختر تاريخًا صحيحًا.'}}
  $('exportPeriod').addEventListener('change',rangeLabel);$('exportDate').addEventListener('change',rangeLabel);rangeLabel();
  function cleanup(){if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;$('pdfDownload').removeAttribute('href');$('pdfPages').replaceChildren()}
  $('pdfClose').addEventListener('click',()=>$('pdfPreview').close());$('pdfPreview').addEventListener('close',cleanup);
  $('exportForm').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;busy=true;$('exportButton').disabled=true;$('exportPeriod').disabled=true;$('exportDate').disabled=true;
    try{
      const kind=$('exportPeriod').value,range=LucasReports.periodDates(kind,$('exportDate').value);
      $('exportStatus').textContent='جارٍ جمع بيانات الفترة…';
      const rows=await LucasReports.collect(range.dates,date=>rpc('madar_team_day',{p_day:date}),(done,total)=>{$('exportStatus').textContent='جارٍ جمع البيانات: '+nf.format(done)+' من '+nf.format(total)+' يوم';});
      $('exportStatus').textContent='جارٍ تنسيق صفحات PDF…';await new Promise(resolve=>setTimeout(resolve,0));
      const result=await LucasReports.render(rows,range,kind);cleanup();objectUrl=URL.createObjectURL(result.blob);
      $('pdfDownload').href=objectUrl;$('pdfDownload').download=`Lucas-Oil-${kind}-${range.start}-${range.end}.pdf`;
      $('pdfDescription').textContent=nf.format(rows.length)+' تسجيل • '+nf.format(result.jpegs.length)+' صفحة • '+formatDay(range.start)+(range.end===range.start?'':' إلى '+formatDay(range.end));
      result.jpegs.forEach((url,i)=>{const image=document.createElement('img');image.src=url;image.alt='صفحة '+nf.format(i+1)+' من التقرير';image.loading='lazy';$('pdfPages').append(image)});
      $('pdfPreview').showModal();$('exportStatus').textContent='التقرير جاهز. اضغط «تحميل PDF» لحفظه.';
    }catch(error){$('exportStatus').textContent=(error.message==='INVALID_DATE'?'اختر تاريخًا صحيحًا.':friendly(error))+' لم يتم إنشاء تقرير ناقص؛ أعد المحاولة.'}
    finally{busy=false;$('exportButton').disabled=false;$('exportPeriod').disabled=false;$('exportDate').disabled=false}
  });
})();
