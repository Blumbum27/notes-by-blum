"""Build an offline design preview from the same catalog used by the native app."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

HTML = r'''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blumbum · Бумага и макеты</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f2f2ec;color:#243b37;font:15px system-ui,Arial,sans-serif}header{padding:25px 32px;border-bottom:1px solid #d6dcd5;background:#fafaf6}h1{font:600 32px Georgia,serif;margin:0 0 8px}header p{color:#68756e;margin:0;max-width:820px;font-size:13px}main{display:grid;grid-template-columns:290px 1fr;gap:25px;padding:26px;max-width:1400px;margin:auto}aside{background:#fafaf6;padding:20px;border-radius:18px;align-self:start;position:sticky;top:20px}label{display:block;margin:17px 0 7px;font-size:13px}select,input{width:100%;accent-color:#235d52}select{padding:9px;border:1px solid #ced7cd;border-radius:8px;background:white;color:#243b37}#colors{display:flex;gap:9px}.swatch{border:1px solid #a7b6aa;border-radius:50%;width:36px;height:36px;cursor:pointer}.swatch[aria-pressed=true]{outline:3px solid #235d52;outline-offset:3px}#large{display:flex;justify-content:center;align-items:center;min-height:430px;background:#e3e7de;border-radius:16px;padding:26px}#large svg{width:auto;max-width:100%;max-height:640px;box-shadow:0 8px 30px #23382a22}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:16px;margin-top:22px}.card{background:#fafaf6;border:1px solid #d3dbd0;border-radius:12px;padding:12px;cursor:pointer;color:inherit}.card[aria-pressed=true]{border:2px solid #235d52;background:#e4ede4}.card svg{height:165px;width:100%;display:block;margin:auto}.card span{display:block;margin-top:9px;font-size:12px;font-weight:600}h2{font-size:18px;margin:22px 0 12px}#name{font:600 24px Georgia,serif;margin:0 0 14px}.meta{font-size:12px;color:#65756a;margin-top:15px}@media(max-width:750px){main{grid-template-columns:1fr;padding:15px}aside{position:static}#large{min-height:240px}#large svg{max-height:480px}header{padding:20px}.gallery{grid-template-columns:repeat(2,1fr)}}
</style>
<header><h1>Blumbum · Бумага и макеты</h1><p>Предпросмотр каталога, а не запуск iOS-приложения. Геометрия макетов берётся из общего описания; шрифты браузера могут отличаться от iPad.</p></header>
<main><aside><strong>Настроить лист</strong><label>Цвет бумаги</label><div id="colors"></div><label for="format">Формат</label><select id="format"><option value="a4">A4</option><option value="a5">A5</option><option value="letter">US Letter</option><option value="square">Квадрат</option></select><label for="orientation">Ориентация</label><select id="orientation"><option value="portrait">Книжная</option><option value="landscape">Альбомная</option></select><label for="spacing">Шаг разметки · <output id="spacingValue">24</output> пт</label><input id="spacing" type="range" min="16" max="48" step="2" value="24"><label for="margin">Поля · <output id="marginValue">30</output> пт</label><input id="margin" type="range" min="16" max="64" step="2" value="30"><p class="meta">4 базовые разметки + 8 макетов.<br>Подложка не перемещает записи.</p></aside><section><h2 id="name"></h2><div id="large"></div><h2>Каталог</h2><div class="gallery" id="gallery"></div></section></main>
<script>
const data=__CATALOG__;
const palette=__PALETTE__;
const basics=__BASICS__;
const formats={a4:[595,842],a5:[420,595],letter:[612,792],square:[600,600]};
const layouts=basics.concat(data.templates);
function esc(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function paperSVG(layout,settings){
 let dims=formats[settings.format]||formats.a4;
 let w=dims[settings.landscape?1:0],h=dims[settings.landscape?0:1],m=settings.margin,s=settings.spacing;
 let cw=w-2*m,ch=h-2*m,rgb=palette.find(c=>c.id===settings.color).rgb.map(c=>Math.round(c*255));
 let out='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(layout.title)+'"><rect width="'+w+'" height="'+h+'" fill="rgb('+rgb.join(',')+')"/>';
 function line(x,y,xx,yy){out+='<path d="M '+x+' '+y+' L '+xx+' '+yy+'" stroke="rgba(143,161,166,.58)" stroke-width=".6" fill="none"/>';}
 function rect(x,y,rw,rh){out+='<rect x="'+x+'" y="'+y+'" width="'+rw+'" height="'+rh+'" fill="none" stroke="rgba(143,161,166,.58)" stroke-width=".6"/>';}
 function ruled(x,y,rw,rh){for(let yy=y;yy<=y+rh+.001;yy+=s)line(x,yy,x+rw,yy);}
 if(layout.basic){
  if(layout.id==='ruled')ruled(m,m+s/2,cw,ch-s);
  if(layout.id==='grid'){for(let x=m;x<=w-m+.001;x+=s)line(x,m,x,h-m);ruled(m,m,cw,ch);}
  if(layout.id==='dots')for(let x=m;x<=w-m+.001;x+=s)for(let y=m;y<=h-m+.001;y+=s)out+='<circle cx="'+x+'" cy="'+y+'" r=".8" fill="rgba(143,161,166,.58)"/>';
 }else for(const p of layout.primitives){
  let x=m+cw*p.x,y=m+ch*p.y,rw=cw*(p.w||0),rh=ch*(p.h||0);
  if(p.kind==='line')line(x,y,m+cw*p.toX,m+ch*p.toY);
  if(p.kind==='rect')rect(x,y,rw,rh);
  if(p.kind==='ruled')ruled(x,y,rw,rh);
  if(p.kind==='checklist')for(let yy=y+10;yy<y+rh;yy+=Math.max(24,s*1.4)){rect(x,yy-7,9,9);line(x+19,yy+3,x+rw,yy+3);}
  if(p.kind==='staff'){let gap=Math.min(9,Math.max(5,s/3));for(let yy=y;yy<=y+rh-4*gap;yy+=gap*4+30)for(let i=0;i<5;i++)line(x,yy+i*gap,x+rw,yy+i*gap);}
  if(p.kind==='label'){
   let fs=Math.min(p.fontSize,rh*.8,rw/Math.max(1,p.text.length*.56));
   out+='<text x="'+x+'" y="'+y+'" font-size="'+fs+'" font-family="Arial,sans-serif" font-weight="'+(p.fontSize>=18?600:400)+'" fill="#405459" dominant-baseline="text-before-edge">'+esc(p.text)+'</text>';
  }
 }
 return out+'</svg>';
}
if(typeof module!=='undefined')module.exports={paperSVG,layouts,palette,formats};
if(typeof document!=='undefined'){
 const settings={format:'a4',landscape:false,margin:30,spacing:24,color:'ivory'};let selected='cornell';
 const find=id=>document.getElementById(id);
 function render(){
  const layout=layouts.find(t=>t.id===selected);find('name').textContent=layout.title;find('large').innerHTML=paperSVG(layout,settings);
  find('spacingValue').value=settings.spacing;find('marginValue').value=settings.margin;
  find('colors').innerHTML='';for(const c of palette){const b=document.createElement('button');b.className='swatch';b.title=c.title;b.setAttribute('aria-label',c.title);b.setAttribute('aria-pressed',c.id===settings.color);b.style.background='rgb('+c.rgb.map(v=>Math.round(v*255)).join(',')+')';b.onclick=()=>{settings.color=c.id;render();};find('colors').appendChild(b);}
  find('gallery').innerHTML='';for(const t of layouts){const b=document.createElement('button');b.className='card';b.setAttribute('aria-pressed',t.id===selected);b.innerHTML=paperSVG(t,settings)+'<span>'+esc(t.title)+'</span>';b.onclick=()=>{selected=t.id;render();};find('gallery').appendChild(b);}
 }
 for(const id of ['format','orientation','spacing','margin'])find(id).oninput=()=>{settings.format=find('format').value;settings.landscape=find('orientation').value==='landscape';settings.spacing=Number(find('spacing').value);settings.margin=Number(find('margin').value);render();};
 render();
}
</script></html>'''


def build():
    source=(ROOT/'Blumbum/Models/Notebook.swift').read_text(encoding='utf-8')
    tint_source=source.split('enum PaperStyle')[0]
    titles=dict(re.findall(r'case \.(\w+): return "([^"]+)"',tint_source))
    palette=[dict(id=key,title=titles[key],rgb=[float(v) for v in values.split(',')]) for key,values in re.findall(r'case \.(\w+): return \(([\d., ]+)\)',tint_source)]
    styles=source.split('enum PaperStyle')[1].split('struct TextBlock')[0]
    basics=[dict(id=key,title=value,basic=True) for key,value in re.findall(r'case \.(\w+): return "([^"]+)"',styles)]
    catalog=json.loads((ROOT/'Blumbum/Resources/PaperTemplates.json').read_text(encoding='utf-8'))
    assert len(palette)==5 and len(basics)==4
    html=HTML.replace('__CATALOG__',json.dumps(catalog,ensure_ascii=False)).replace('__PALETTE__',json.dumps(palette,ensure_ascii=False)).replace('__BASICS__',json.dumps(basics,ensure_ascii=False))
    directory=ROOT/'previews';directory.mkdir(exist_ok=True)
    destination=directory/'paper-gallery.html'
    with destination.open('w',encoding='utf-8',newline='\n') as output: output.write(html)
    print('Built offline paper preview from the bundled catalog and native color palette.')


if __name__=='__main__':build()
