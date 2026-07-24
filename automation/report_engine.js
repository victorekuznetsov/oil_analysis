'use strict';
// Extracted verbatim from dashboard_final.html (pure data-transform functions, no DOM deps).

const FLEET_P90 = {"V100": 61.77, "V40": 615.1, "TAN": 2.7, "FP": 8.5, "Si": 39.0, "OXI": 0.31, "Fe": 92.0, "TBN": 10.64, "WearIdx": 111.0, "Al": 21.0, "Pb": 19.0, "Na": 19.0, "Cu": 112.0, "Cr": 10.0, "Ni": 16.0};

const FLEET_P95 = {"V100": 65.2, "V40": 662.5, "TAN": 3.07, "FP": 11.9, "Ca": 3866.0, "Zn": 1343.0, "P": 1455.0, "Si": 65.0, "OXI": 0.71, "B": 107.0, "K": 11.0, "Fe": 163.0, "TBN": 11.31, "WearIdx": 203.0, "Al": 46.0, "Pb": 34.0, "Na": 41.0, "Cu": 191.0, "Cr": 14.0, "Sn": 13.0, "Ni": 23.0};

function fmtV(v){if(v==null||isNaN(v))return '—';return Number.isInteger(v)?v.toString():parseFloat(v.toFixed(2)).toString();}

// ── Постобработка готовой DB: seq, days, Z-оценки, флаги P90/P95/P97 ──
function _postProcessDB(db, normMap){
  for(const brand in db){
    for(const garage in db[brand]){
      if(!db[brand][garage]||!db[brand][garage].nodes) continue;
      for(const node in db[brand][garage].nodes){
        const ps=db[brand][garage].nodes[node];
        if(!Array.isArray(ps)||!ps.length) continue;
        ps.sort((a,x)=>{const da=a.dt||'',dx=x.dt||'';const va=da&&da!=='—'&&da.length>7,vx=dx&&dx!=='—'&&dx.length>7;if(va===vx)return da.localeCompare(dx);return va?1:-1;});
        // нормы: ключ brand|node (МодельУзла|Узел в большинстве случаев совпадают)
        const nm=normMap[brand+'|'+node]||{};
        const fv=v=>{const x=parseFloat(v);return isNaN(x)?null:x;};
        const _fp90=(k,def)=>{const v=parseFloat(nm[k]);if(!isNaN(v)&&v>0)return v;return(typeof FLEET_P90!=='undefined'&&FLEET_P90[def]!=null)?FLEET_P90[def]:null;};
        const _fp95=(def)=>(typeof FLEET_P95!=='undefined'&&FLEET_P95[def]!=null)?FLEET_P95[def]:null;
        ps.forEach((p,i)=>{
          // № пробы
          if(p.seq==null) p.seq=i+1;
          // дней между пробами
          if(p.days==null&&i>0&&ps[i-1].dt&&p.dt&&p.dt!=='—'&&ps[i-1].dt!=='—'){
            try{const d0=new Date(ps[i-1].dt),d1=new Date(p.dt);const diff=Math.round((d1-d0)/86400000);if(diff>0)p.days=diff;}catch(e){}
          }
          // Z-оценки по нормам (mean/std)
          ['Fe','Cu','Si','OXI','TAN'].forEach(met=>{
            const zk=met+'z';
            if(p[zk]!=null)return;
            const v=fv(p[met]),mu=parseFloat(nm[met+'_mean']),sd=parseFloat(nm[met+'_std']);
            if(v!=null&&!isNaN(mu)&&!isNaN(sd)&&sd>0)p[zk]=Math.round((v-mu)/sd*100)/100;
          });
          // Флаги P90/P95/P97
          if(p.f90==null){
            let f90=0,f95=0,f97=0;
            ['Fe','Cu','Si','Al','Cr','Ni','Pb','Na'].forEach(met=>{
              const mv=fv(p[met]);if(mv==null)return;
              const p90v=_fp90(met+'_p90',met);
              const p95v=_fp95(met);
              const p97v=p95v?p95v*1.15:null;
              if(p90v&&mv>p90v)f90++;
              if(p95v&&mv>p95v)f95++;
              if(p97v&&mv>p97v)f97++;
            });
            if(f90)p.f90=f90;
            if(f95)p.f95=f95;
            if(f97)p.f97=f97;
          }
        });
      }
    }
  }
}

const NORMS_CSV_EMBEDDED=`Модель узла,Узел,НормаКлюч,Кол_проб,Fe_mean,Fe_std,Fe_p90,Cu_mean,Cu_std,Cu_p90,Cr_p90,Al_p90,Ni_p90,Pb_p90,Si_p90,Na_p90,OXI_p90,NIT_p90,TAN_p90,TBN_p10,W_p75
5GEB25A8,МКЛ,5GEB25A8|МКЛ,45,43.93,55.29,73.6,12.31,39.09,27.8,2.0,3.0,1.0,1.0,96.2,4.0,1.548,0.06,0.964,,0.0
5GEB25A8,МКП,5GEB25A8|МКП,45,39.69,34.46,75.0,13.24,48.66,27.0,2.0,3.0,1.0,1.0,98.6,3.6,1.548,0.06,0.992,,0.0
86100RS,КПП,86100RS|КПП,1,9.0,,,13.0,,,,,,,,,,,,,
Flender DMG2 30,Редуктор,Flender DMG2 30|Редуктор,7,11.86,16.08,31.0,3.14,5.4,10.8,5.4,4.2,,2.4,21.4,16.2,5.64,,,,0.0
JTM180FWX,Редуктор,JTM180FWX|Редуктор,1,0.0,,,0.0,,,,,,,,,,,,,
Komatsu HD1500,БРЛ,Komatsu HD1500|БРЛ,1,13.0,,,0.0,,,,,,,,,,,,,
Komatsu HD1500,БРП,Komatsu HD1500|БРП,1,12.0,,,0.0,,,,,,,,,,,,,
Komatsu HD1500,ГС,Komatsu HD1500|ГС,1,1.0,,,6.0,,,,,,,,,,,,,
Komatsu HD1500,Д,Komatsu HD1500|Д,1,12.0,,,0.0,,,,,,,,,,,,,
Komatsu HD1500,ДВС,Komatsu HD1500|ДВС,1,0.0,,,0.0,,,,,,,,,,,,,
Komatsu HD1500,КПП,Komatsu HD1500|КПП,1,0.0,,,0.0,,,,,,,,,,,,,
NHL NTE240,ГС,NHL NTE240|ГС,2,0.0,0.0,,0.0,0.0,,,,,,,,,,,,
NHL NTE240,ДВС,NHL NTE240|ДВС,2,0.0,0.0,,0.0,0.0,,,,,,,,,,,,
NHL NTE240,МКЛ,NHL NTE240|МКЛ,1,56.0,,,0.0,,,,,,,,,,,,,
NHL NTE240,МКП,NHL NTE240|МКП,1,62.0,,,0.0,,,,,,,,,,,,,
QSK-60,ДВС,QSK-60|ДВС,7,0.0,0.0,0.0,5.0,1.528,7.0,18.8,0.0,,0.4,0.0,1.0,9.4,,8.384,13.6,0.0
QSK60,ДВС,QSK60|ДВС,421,4.02,3.66,5.0,0.715,1.34,2.0,0.0,3.0,0.0,2.0,3.0,2.0,0.09,0.1,3.72,6.688,0.0
QST30,ДВС,QST30|ДВС,5,2.0,1.87,3.6,0.4,0.548,1.0,0.0,0.6,0.0,0.0,2.6,2.0,7.0,0.06,,9.644,0.0
Shantui SD60,ДВС,Shantui SD60|ДВС,1,0.0,,,0.0,,,,,,,,,,,,,
WEG Mline MAI1000,Электродвигатель 1,WEG Mline MAI1000|Электродвигатель 1,13,5.23,13.18,20.8,0.231,0.832,0.0,0.0,0.0,,0.0,0.0,4.8,0.0,,,,0.2
WEG Mline MAI1000,Электродвигатель 2,WEG Mline MAI1000|Электродвигатель 2,13,1.46,3.67,3.6,0.231,0.832,0.0,0.0,0.0,,0.0,0.0,0.0,0.0,,,,0.2
Wabtec 5GEB25A8,МКЛ,Wabtec 5GEB25A8|МКЛ,5,33.8,14.06,47.0,0.2,0.447,0.6,0.6,2.6,0.6,0.0,133.0,3.0,,,0.396,,
Wabtec 5GEB25A8,МКП,Wabtec 5GEB25A8|МКП,5,37.6,23.39,61.6,0.2,0.447,0.6,1.6,1.6,0.6,0.0,114.0,3.6,,,0.34,,
БРЛ,РХЛ,БРЛ|РХЛ,2,387.5,399.52,,0.0,0.0,,,,,,,,,,,,
БРП,РХП,БРП|РХП,2,750.5,956.72,,0.0,0.0,,,,,,,,,,,,
ГС,ГС,ГС|ГС,8,4.375,7.29,13.0,0.125,0.354,0.3,0.6,0.0,0.0,0.0,4.4,0.0,1.25,0.08,0.651,,
ДВС,ДВС,ДВС|ДВС,21,4.38,6.01,11.0,0.857,3.928,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.32,0.32,1.99,7.07,0.53
КПП,КПП,КПП|КПП,6,44.67,76.5,112.5,21.33,9.647,30.5,0.0,20.0,0.0,2.5,53.5,0.0,0.1,0.07,1.975,9.156,
МКЛ,МКЛ,МКЛ|МКЛ,6,538.17,290.22,788.5,0.167,0.408,0.5,0.0,0.0,3.5,0.5,20.0,0.0,0.205,0.135,0.665,,
МКП,МКП,МКП|МКП,6,629.83,435.41,1098.5,12.83,27.16,37.5,0.0,0.0,4.5,0.0,11.0,0.0,0.205,0.145,0.805,,
Подшипник скольжения барабана мельницы,Подш. загрузки,Подшипник скольжения барабана мельницы|Подш. загрузки,14,3.857,4.111,9.4,3.286,5.384,9.7,5.4,3.0,,0.0,8.1,18.4,3.84,,,,0.0
Подшипник скольжения барабана мельницы,Подш. разгрузки,Подшипник скольжения барабана мельницы|Подш. разгрузки,14,2.929,3.751,8.1,1.929,3.832,7.2,4.0,0.0,,2.7,7.7,11.5,3.8,,,,0.0
РМК левое,МКЛ,РМК левое|МКЛ,2,59.5,19.09,,0.0,0.0,,,,,,,,,,,,
РМК правое,МКП,РМК правое|МКП,2,57.0,21.21,,0.0,0.0,,,,,,,,,,,,
РХЛ,РХЛ,РХЛ|РХЛ,1,58.0,,,0.0,,,,,,,,,,,,,
РХП,РХП,РХП|РХП,1,93.0,,,0.0,,,,,,,,,,,,,`;

// Маппинг заголовков Excel → короткий ключ
const CSV_COL_MAP={
  'УО':'УО','Передел':'Передел','Тип техники':'ТипТехники','Марка':'Марка','Гаражный №':'Гар','Узел':'Узел',
  'Модель узла':'МодельУзла','Дата отбора пробы':'Дата','Заключение':'Заключение',
  'Марка масла':'МаркаМасла',
  'Наработка узла на дату отбора пробы (моточасы)':'nh',
  'Наработка масла на дату отбора пробы (моточасы)':'oh',
  'Fe':'Fe','Cu':'Cu','Cr':'Cr','Al':'Al','Ni':'Ni','Pb':'Pb','Sn':'Sn','Si':'Si',
  'Na':'Na','K':'K','Ca':'Ca','Zn':'Zn','P':'P','Mg':'Mg','B':'B',
  'Содержание воды (W), %':'W','Содержание гликоля (A), %':'A',
  'Содержание топлива (F), %':'F','Содержание сажи (ST), А/0,1мм':'Soot',
  'Вязкость при 100°С (V100), cSt (сантистокс)':'V100',
  'Вязкость при 40°С (V40), cSt (сантистокс)':'V40',
  'Индекс вязкости (VI)':'VI','Кислотное число (TAN), мгКОН/см3':'TAN',
  'Щелочное число (TBN), мгКОН/см3':'TBN','Окисление (OXI), А/0,1мм':'OXI',
  'Нитрование (NIT), А/0,1мм':'NIT','Сульфатная зольность (SUL), А/0,1мм':'SUL',
};

// Разбор одной строки CSV (учитывает кавычки, поддерживает , и ;)
function _parseCSVLine(line, dlm=','){
  const out=[]; let cur='', inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ;}
    else if(c===dlm&&!inQ){out.push(cur);cur='';}
    else cur+=c;
  }
  out.push(cur);
  return out;
}

// Разбор CSV-текста. Возвращает [{col:val,...},...] с короткими ключами.
function _parseCSV(text){
  // Убираем UTF-8 BOM если есть
  if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  const nl=text.includes('\r\n')?'\r\n':'\n';
  const rawLines=text.split(nl).filter(l=>l.trim());
  if(!rawLines.length) return[];

  // Автоопределение разделителя: ; или ,
  const dlm=(rawLines[0].split(';').length > rawLines[0].split(',').length) ? ';' : ',';

  // Определяем строку-заголовок: ищем строку, где есть "Fe" или "УО"
  const known=new Set(['Fe','Cu','УО','Марка','Гаражный №','Узел','Дата отбора пробы']);
  let hIdx=0;
  for(let i=0;i<Math.min(5,rawLines.length);i++){
    const cells=_parseCSVLine(rawLines[i],dlm);
    if(cells.some(c=>known.has(c.trim().replace(/^﻿/,'')))){hIdx=i;break;}
  }
  // Убираем BOM из первого заголовка
  const headers=_parseCSVLine(rawLines[hIdx],dlm).map((h,j)=>(j===0?h.replace(/^﻿/,''):h).trim());

  const rows=[];
  for(let i=hIdx+1;i<rawLines.length;i++){
    const cells=_parseCSVLine(rawLines[i],dlm);
    if(cells.every(c=>!c.trim())) continue; // пустая строка
    const obj={};
    headers.forEach((h,j)=>{
      const key=CSV_COL_MAP[h]||h;
      obj[key]=(cells[j]||'').trim();
    });
    rows.push(obj);
  }
  return rows;
}

// Разбор норм из CSV-строки в {ключ: {Fe_p90:..., Cu_p90:..., ...}}
function _parseNorms(csvText){
  const nl=csvText.includes('\r\n')?'\r\n':'\n';
  const lines=csvText.split(nl).filter(l=>l.trim());
  if(!lines.length) return{};
  const headers=_parseCSVLine(lines[0]).map(h=>h.trim());
  const map={};
  for(let i=1;i<lines.length;i++){
    const cells=_parseCSVLine(lines[i]);
    const row={};
    headers.forEach((h,j)=>row[h]=(cells[j]||'').trim());
    const key=row['НормаКлюч']||((row['Модель узла']||'')+'|'+(row['Узел']||''));
    if(key) map[key]=row;
  }
  return map;
}

// Вычисление метрик WI/CI/DI/RS/FP для одной строки
function _metrics(row, normMap){
  const key=(row.МодельУзла||'')+'|'+(row.Узел||'');
  const n=normMap[key]||{};
  const fv=v=>{const x=parseFloat(v);return isNaN(x)?0:x;};
  // Fallback: normMap → FLEET_P90 → FLEET_P95 (глобальные константы)
  const _fp90=(nVal,fkey)=>{
    let pv=parseFloat(nVal);
    if(isNaN(pv)||pv<=0){
      pv=(typeof FLEET_P90!=='undefined'&&FLEET_P90[fkey])||0;
    }
    return pv;
  };
  const fp90=(v,nVal,fkey)=>{const pv=_fp90(nVal,fkey);if(!pv)return 0;return Math.min(3,fv(v)/pv);};

  const WI=fp90(row.Fe,n.Fe_p90,'Fe')*0.35+fp90(row.Cu,n.Cu_p90,'Cu')*0.25+
            fp90(row.Cr,n.Cr_p90,'Cr')*0.10+fp90(row.Al,n.Al_p90,'Al')*0.10+
            fp90(row.Ni,n.Ni_p90,'Ni')*0.05+fp90(row.Pb,n.Pb_p90,'Pb')*0.15;
  const W=fv(row.W);
  const CI=fp90(row.Si,n.Si_p90,'Si')*0.50+fp90(row.Na,n.Na_p90,'Na')*0.30+
            Math.min(3,W/0.1)*0.20;
  const tbn=fv(row.TBN), p10=parseFloat(n.TBN_p10)||5;
  const nTBN=Math.max(0,1-tbn/((p10||5)*1.5));
  const DI=fp90(row.OXI,n.OXI_p90,'OXI')*0.30+fp90(row.NIT,n.NIT_p90,'NIT')*0.15+
            fp90(row.TAN,n.TAN_p90,'TAN')*0.35+nTBN*0.20;
  const RS=WI*0.5+CI*0.25+DI*0.25;
  const FP=Math.max(0,Math.min(100,100/(1+Math.exp(-(RS-1)*2.5))));
  // Z-score: MAX(0,(val-mean)/(p90-mean)); при отсутствии mean → MAX(0,val/p90)
  const _pz=(v,mn,p9)=>{const mv=parseFloat(mn)||0;const pv=parseFloat(p9)||0;const sc=pv-mv;if(!sc||isNaN(v)||v<0)return 0;return Math.max(0,(v-mv)/sc);};
  // WearIdx = сумма Z-оценок металлов износа (Power BI: Fe_Z+Cu_Z+Cr_Z+Pb_Z+Sn_Z+Al_Z+Ni_Z)
  const WearIdx=Math.round((
    _pz(fv(row.Fe),n.Fe_mean,_fp90(n.Fe_p90,'Fe'))
   +_pz(fv(row.Cu),n.Cu_mean,_fp90(n.Cu_p90,'Cu'))
   +_pz(fv(row.Cr),0,_fp90(n.Cr_p90,'Cr'))
   +_pz(fv(row.Al),0,_fp90(n.Al_p90,'Al'))
   +_pz(fv(row.Ni),0,_fp90(n.Ni_p90,'Ni'))
   +_pz(fv(row.Pb),0,_fp90(n.Pb_p90,'Pb'))
   +_pz(fv(row.Sn),0,_fp90(n.Sn_p90,'Sn')||0))*10)/10;
  // ContamIdx = Si_Z + Na_Z + Water_Z (Power BI)
  const ContamIdx=Math.round((
    _pz(fv(row.Si),0,_fp90(n.Si_p90,'Si'))
   +_pz(fv(row.Na),0,_fp90(n.Na_p90,'Na'))
   +Math.min(3,fv(row.W)/0.1))*10)/10;
  // DegradIdx = OXI_Z + NIT_Z + TAN_Z (Power BI)
  const DegradIdx=Math.round((
    _pz(fv(row.OXI),0,_fp90(n.OXI_p90,'OXI'))
   +_pz(fv(row.NIT),0,_fp90(n.NIT_p90,'NIT'))
   +_pz(fv(row.TAN),0,_fp90(n.TAN_p90,'TAN')))*10)/10;
  // P90/P95 для возврата (normMap → FLEET_P90/P95)
  const _p90=(fkey)=>_fp90(n[fkey+'_p90'],fkey)||null;
  const _p95=(fkey)=>{
    let pv=parseFloat(n[fkey+'_p95']);
    if(isNaN(pv)||pv<=0) pv=(typeof FLEET_P95!=='undefined'&&FLEET_P95[fkey])||0;
    return pv||null;
  };
  return{
    WI:Math.round(WI*1000)/1000, CI:Math.round(CI*1000)/1000,
    DI:Math.round(DI*1000)/1000, RS:Math.round(RS*1000)/1000,
    FP:Math.round(FP*10)/10,
    WearIdx:WearIdx, ContamIdx:ContamIdx, DegradIdx:DegradIdx,
    Fe_p90:_p90('Fe'), Cu_p90:_p90('Cu'), Si_p90:_p90('Si'),
    Fe_p95:_p95('Fe'), Cu_p95:_p95('Cu'), Si_p95:_p95('Si'),
    Al_p90:_p90('Al'), Cr_p90:_p90('Cr'), Ni_p90:_p90('Ni'), Pb_p90:_p90('Pb'),
    Na_p90:_p90('Na'), OXI_p90:_p90('OXI'), TAN_p90:_p90('TAN'),
  };
}

// Построение DB структуры из обработанных строк
function _buildDB(rows, normMap){
  const db={};
  // Сортировка по дате (нормализуем DD.MM.YYYY → YYYY-MM-DD перед сравнением)
  const _nd=d=>{const m=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d||'');return m?`${m[3]}-${m[2]}-${m[1]}`:d||'';};
  rows.sort((a,b)=>(a.Гар||'').localeCompare(b.Гар||'')||(a.Узел||'').localeCompare(b.Узел||'')||
                   _nd(a.Дата).localeCompare(_nd(b.Дата)));

  // Вычислить дельты и FeR
  const lastByKey={}; // Гар|Узел → {Fe, Cu, Si, TAN, TBN, nh}
  rows.forEach(r=>{
    const fv=v=>{const x=parseFloat(v);return isNaN(x)?null:x;};
    const brand=(r.Марка||'').trim()||'Unknown';
    const garage=(r.Гар||'').trim()||'0';
    const node=(r.Узел||'').trim()||'Main';
    const uo=(r.УО||'').trim();
    let peredel=(r.Передел||'').trim();
    if(!peredel){
      const tip=(r.ТипТехники||'').trim();
      const ZIF=new Set(['Декантер','Дробилка','Бутобой','Компрессорная установка','Конвейер','Мельница','Насос','Питатель','Сгуститель']);
      const GTK=new Set(['Бульдозер','Грейдер','Щебнеразбрасыватель','Дробильная установка','Каток грунтовый','Мобильный грохот','Погрузчик','Самосвал','Станок буровой','Трубоукладчик','Тягач-буксировщик','Экскаватор']);
      peredel=ZIF.has(tip)?'ЗИФ':GTK.has(tip)?'ГТК':tip?'Прочее':'';
    }
    // Конвертируем DD.MM.YYYY → YYYY-MM-DD
    let dt=r.Дата||'—';
    if(dt&&dt!=='—'&&/^\d{2}\.\d{2}\.\d{4}$/.test(dt)){const[dd,mm,yy]=dt.split('.');dt=`${yy}-${mm}-${dd}`;}

    const key=garage+'|'+node;
    const prev=lastByKey[key]||{};

    const m=_metrics(r, normMap);
    const feV=fv(r.Fe), cuV=fv(r.Cu), siV=fv(r.Si), tanV=fv(r.TAN), tbnV=fv(r.TBN), nhV=fv(r.nh);
    const dFe=feV!=null&&prev.Fe!=null?Math.round((feV-prev.Fe)*10)/10:null;
    const dCu=cuV!=null&&prev.Cu!=null?Math.round((cuV-prev.Cu)*10)/10:null;
    const dSi=siV!=null&&prev.Si!=null?Math.round((siV-prev.Si)*10)/10:null;
    const dTAN=tanV!=null&&prev.TAN!=null?Math.round((tanV-prev.TAN)*100)/100:null;
    const dTBN=tbnV!=null&&prev.TBN!=null?Math.round((tbnV-prev.TBN)*100)/100:null;
    const dnh=nhV!=null&&prev.nh!=null?nhV-prev.nh:null;
    const FeR=dnh&&dnh>0&&dFe!=null?Math.round(dFe/dnh*1000*10)/10:null;

    // f90/f95/f97 — число металлов выше порога
    let f90=0,f95=0,f97=0;
    const _fMetals=['Fe','Cu','Si','Al','Cr','Ni','Pb','Na'];
    _fMetals.forEach(metal=>{
      const mv=fv(r[metal]);if(mv==null)return;
      const p90v=m[metal+'_p90']||(typeof FLEET_P90!=='undefined'?FLEET_P90[metal]:null);
      const p95v=m[metal+'_p95']||(typeof FLEET_P95!=='undefined'?FLEET_P95[metal]:null);
      const p97v=p95v?p95v*1.15:null; // P97 ≈ P95 × 1.15 (нет точных данных)
      if(p90v&&mv>p90v)f90++;
      if(p95v&&mv>p95v)f95++;
      if(p97v&&mv>p97v)f97++;
    });

    lastByKey[key]={Fe:feV,Cu:cuV,Si:siV,TAN:tanV,TBN:tbnV,nh:nhV};

    const probe={dt};
    const numFields=['Fe','Cu','Cr','Al','Ni','Pb','Sn','Si','Na','K','Ca','Zn','P','Mg','B',
                     'W','A','F','Soot','V100','V40','VI','TAN','TBN','OXI','NIT','SUL'];
    numFields.forEach(f=>{const v=fv(r[f]);if(v!=null)probe[f]=Math.round(v*100)/100;});
    const intFields=['nh','oh'];
    intFields.forEach(f=>{const v=fv(r[f]);if(v!=null)probe[f]=Math.round(v);});
    Object.assign(probe,{FP:m.FP,RS:m.RS,WI:m.WI,CI:m.CI,DI:m.DI,
                          WearIdx:m.WearIdx,ContamIdx:m.ContamIdx,DegradIdx:m.DegradIdx});
    // RiskScore 0-100 совместимый с Power BI (нормировка на cap = 7 металлов × 3)
    const _wn=Math.min(1,(m.WearIdx||0)/7),_cn=Math.min(1,(m.ContamIdx||0)/3),_dn=Math.min(1,(m.DegradIdx||0)/3);
    const _fdn=probe.dFe!=null?Math.min(1,Math.max(0,probe.dFe)/100):0;
    const _fp5=Math.min(1,((probe.f95||0))/3);
    probe.RiskScore=Math.round(40*_wn+20*_cn+15*_dn+15*_fdn+10*_fp5);
    probe.RiskBand=probe.RiskScore<20?'Низкий':probe.RiskScore<40?'Умеренный':probe.RiskScore<60?'Повышенный':probe.RiskScore<80?'Высокий':'Критический';
    // Z-оценки по нормам (mean/std из normMap)
    const _nk2=(r.МодельУзла||'')+'|'+(r.Узел||'');
    const _nm2=normMap[_nk2]||{};
    ['Fe','Cu','Si','OXI','TAN'].forEach(_met=>{
      const _fvz=v=>{const x=parseFloat(v);return isNaN(x)?null:x;};
      const _v=_fvz(r[_met]),_mu=parseFloat(_nm2[_met+'_mean']),_sd=parseFloat(_nm2[_met+'_std']);
      if(_v!=null&&!isNaN(_mu)&&!isNaN(_sd)&&_sd>0)
        probe[_met+'z']=Math.round((_v-_mu)/_sd*100)/100;
    });
    if(dFe!=null)probe.dFe=dFe;
    if(dCu!=null)probe.dCu=dCu;
    if(dSi!=null)probe.dSi=dSi;
    if(dTAN!=null)probe.dTAN=dTAN;
    if(dTBN!=null)probe.dTBN=dTBN;
    if(FeR!=null)probe.FeR=FeR;
    if(f90)probe.f90=f90;
    if(f95)probe.f95=f95;
    if(f97)probe.f97=f97;
    const st=(r.Заключение||'').trim();
    if(st&&st!=='nan'&&st!=='None')probe.st=st;
    const oilBrand=(r.МаркаМасла||'').trim();
    if(oilBrand&&oilBrand!=='nan'&&oilBrand!=='None')probe.oil=oilBrand;

    if(!db[brand])db[brand]={};
    if(!db[brand][garage])db[brand][garage]={uo,peredel,nodes:{}};
    if(!db[brand][garage].nodes[node])db[brand][garage].nodes[node]=[];
    db[brand][garage].nodes[node].push(probe);
  });
  // Финальная сортировка каждого узла по dt (уже YYYY-MM-DD)
  for(const b in db)for(const g in db[b])for(const n in db[b][g].nodes){
    const _ps=db[b][g].nodes[n];
    _ps.sort((a,x)=>{const da=a.dt||'',dx=x.dt||'';const va=da&&da!=='—'&&da.length>7,vx=dx&&dx!=='—'&&dx.length>7;if(va===vx)return da.localeCompare(dx);return va?1:-1;});
    // Скользящие Fe: Fr3=среднее(3), Fr5m=макс(5)
    _ps.forEach((_p,_i)=>{
      const _w3=_ps.slice(Math.max(0,_i-2),_i+1).map(q=>q.Fe).filter(v=>v!=null);
      const _w5=_ps.slice(Math.max(0,_i-4),_i+1).map(q=>q.Fe).filter(v=>v!=null);
      if(_w3.length)_p.Fr3=Math.round(_w3.reduce((a,b)=>a+b,0)/_w3.length*10)/10;
      if(_w5.length)_p.Fr5m=Math.round(Math.max(..._w5)*10)/10;
    });
  }
  return db;
}

// Построение PRED_DATA из строк с уже вычисленными метриками
function _buildPredData(rows, normMap){
  const fv=v=>{const x=parseFloat(v);return isNaN(x)?null:x;};
  // Fleet P90 по ключевым метрикам
  const cols=['Fe','Cu','Si','TAN','TBN','OXI','V100','V40','FP','WearIdx','Al','Pb','Na','Cr','Ni'];
  const fleet_p90={};
  cols.forEach(c=>{
    const vals=rows.map(r=>fv(r[c])).filter(v=>v!=null);
    if(vals.length){
      vals.sort((a,b)=>a-b);
      fleet_p90[c]=Math.round(vals[Math.floor(vals.length*0.9)]*100)/100;
    }
  });

  // Последние пробы по Гар|Узел
  const latestByKey={};
  rows.forEach(r=>{
    const k=(r.Гар||'0')+'|'+(r.Узел||'');
    if(!latestByKey[k]||((r.Дата||'')>(latestByKey[k].Дата||''))) latestByKey[k]=r;
  });
  // Группируем строки по ключу для расчёта дельт и n
  const groupByKey={};
  rows.forEach(r=>{
    const k=(r.Гар||'0')+'|'+(r.Узел||'');
    if(!groupByKey[k])groupByKey[k]=[];
    groupByKey[k].push(r);
  });

  const risk_records=[];
  Object.entries(latestByKey).forEach(([k,last])=>{
    const grp=(groupByKey[k]||[]).sort((a,b)=>(a.Дата||'').localeCompare(b.Дата||''));
    const n=grp.length;
    const m=_metrics(last,normMap);
    const brand=(last.Марка||'').trim()||'Unknown';
    const garage=(last.Гар||'').trim()||'0';
    const node=(last.Узел||'').trim()||'Main';
    const uo=(last.УО||'').trim();
    const peredel=(last.Передел||'').trim();
    const dt=last.Дата||'—';
    const feV=fv(last.Fe), cuV=fv(last.Cu), siV=fv(last.Si);
    const fp_v=m.FP||0;
    const prev=n>=2?grp[n-2]:null;
    const fe_s=feV!=null&&prev&&fv(prev.Fe)!=null?Math.round((feV-fv(prev.Fe))*10)/10:0;
    const cu_s=cuV!=null&&prev&&fv(prev.Cu)!=null?Math.round((cuV-fv(prev.Cu))*10)/10:0;
    // Драйвер
    let bestRatio=0, driver='';
    const checks=[['Fe',m.Fe_p90],['Cu',m.Cu_p90],['Si',m.Si_p90]];
    checks.forEach(([metal,p90])=>{
      const v=fv(last[metal]);
      if(v!=null&&p90&&p90>0){const r=v/p90;if(r>bestRatio){bestRatio=r;driver=`${metal}=${v.toFixed(0)}ppm (${r.toFixed(1)}x p90)`;}}
    });
    const risk=Math.round(Math.min(100,Math.max(bestRatio*10,fp_v))*10)/10;
    if(risk<5) return;
    risk_records.push({brand,mach:garage,node,uo,peredel,fe:feV,cu:cuV,si:siV,
                       fe_s,cu_s,risk,fp:fp_v,n,dt,driver});
  });
  risk_records.sort((a,b)=>b.risk-a.risk);

  // Fleet stats
  const fpArr=Object.values(latestByKey).map(r=>_metrics(r,normMap).FP);
  const fleet_stats={
    normal:fpArr.filter(v=>v<10).length,
    warning:fpArr.filter(v=>v>=10&&v<30).length,
    critical:fpArr.filter(v=>v>=30).length,
    total:fpArr.length
  };
  // Failure modes
  const failure_modes={};
  const excChecks=[
    ['Fe','Fe_p90','High Fe (Износ)'],['Cu','Cu_p90','High Cu (Подшипники)'],
    ['Si','Si_p90','Si (Загрязнение)']
  ];
  excChecks.forEach(([metal,pk,label])=>{
    failure_modes[label]=rows.filter(r=>{const v=fv(r[metal]),p=fv(r[pk]);return v!=null&&p&&v>p;}).length;
  });
  failure_modes['Риск FP>30%']=rows.filter(r=>_metrics(r,normMap).FP>=30).length;
  failure_modes['Критич. Fe>300']=rows.filter(r=>(fv(r.Fe)||0)>300).length;

  return{risk_records:risk_records.slice(0,100),fleet_stats,failure_modes,fleet_p90};
}

function _parseFailCSV(text){
  // Auto-detect delimiter
  const firstLine=(text.split('\n')[0]||'');
  const dlm=firstLine.includes(';')?';':',';
  const rawLines=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  // Find header row
  let hIdx=-1;
  for(let i=0;i<Math.min(5,rawLines.length);i++){
    const l=rawLines[i];
    if(l.includes('Дата отказа')||l.includes('Гар#')||l.includes('Воздействие')){
      hIdx=i; break;
    }
  }
  if(hIdx<0) throw new Error('Не найдена строка заголовка. Ожидается: «Дата отказа», «Гар#», «Узел»');
  const _unq=s=>(s||'').replace(/^["']+|["']+$/g,'').trim();
  const headers=rawLines[hIdx].split(dlm).map(_unq);
  const rows=[];
  for(let i=hIdx+1;i<rawLines.length;i++){
    const line=rawLines[i].trim();
    if(!line) continue;
    const cells=line.split(dlm).map(_unq);
    const row={};
    headers.forEach((h,j)=>{ if(h) row[h]=cells[j]||''; });
    rows.push(row);
  }
  if(!rows.length) throw new Error('Данные не найдены после заголовка');
  return rows;
}

function _buildFailData(rows){
  const lookup={};
  const _normDt=d=>{
    if(!d) return '';
    const m=/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(d.trim());
    if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    // ISO datetime prefix
    return d.trim().slice(0,10);
  };
  const _normGar=g=>{
    const s=(g||'').trim();
    // "800.0" → "800"
    if(/^\d+\.0$/.test(s)) return s.slice(0,-2);
    return s;
  };
  rows.forEach(r=>{
    const dt=_normDt(r['Дата отказа']||r['Дата']||'');
    if(!dt||dt.length<8) return;
    const gar=_normGar(r['Гар#']||r['Гар']||r['Гаражный №']||'');
    const node=(r['Узел']||'').trim();
    if(!gar||!node) return;
    const sysV=(r['Система']||'').trim().slice(0,60);
    const act=(r['Воздействие']||'').trim().slice(0,60);
    const desc=(r['Описание неисправности']||r['Описание']||'').trim().slice(0,120);
    const brand=(r['Модель']||'').trim().slice(0,40);
    const key=gar+'||'+node;
    if(!lookup[key]) lookup[key]=[];
    lookup[key].push({dt,node,sys:sysV,action:act,desc,brand});
  });
  // Сортировка событий по дате
  Object.values(lookup).forEach(arr=>arr.sort((a,b)=>a.dt.localeCompare(b.dt)));
  return lookup;
}


module.exports = {
  FLEET_P90, FLEET_P95, fmtV, _postProcessDB,
  NORMS_CSV_EMBEDDED, CSV_COL_MAP,
  _parseCSVLine, _parseCSV, _parseNorms, _metrics, _buildDB, _buildPredData,
  _parseFailCSV, _buildFailData,
};
