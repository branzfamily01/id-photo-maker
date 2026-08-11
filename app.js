const editor=document.getElementById('editor'), ctx=editor.getContext('2d');
const sheet=document.getElementById('sheet'), sctx=sheet.getContext('2d');
const empty=document.getElementById('emptyState');
const zoom=document.getElementById('zoom'), panX=document.getElementById('panX'), panY=document.getElementById('panY'), brightness=document.getElementById('brightness');
let img=null, rotation=0, photoW=30, photoH=40;
function readFile(file){ if(!file)return; const r=new FileReader(); r.onload=e=>{const i=new Image(); i.onload=()=>{img=i; rotation=0; resetControls(); empty.style.display='none'; drawEditor();}; i.src=e.target.result}; r.readAsDataURL(file)}
document.getElementById('cameraInput').addEventListener('change',e=>readFile(e.target.files[0]));
document.getElementById('fileInput').addEventListener('change',e=>readFile(e.target.files[0]));
function resetControls(){zoom.value=1;panX.value=0;panY.value=0;brightness.value=100}
[zoom,panX,panY,brightness].forEach(el=>el.addEventListener('input',drawEditor));
document.getElementById('rotateBtn').onclick=()=>{rotation=(rotation+90)%360;drawEditor()};
document.getElementById('resetBtn').onclick=()=>{rotation=0;resetControls();drawEditor()};
function drawEditor(){
 ctx.clearRect(0,0,editor.width,editor.height); ctx.fillStyle='#e8ebf2'; ctx.fillRect(0,0,editor.width,editor.height); if(!img)return;
 const W=editor.width,H=editor.height; const swap=rotation%180!==0; const iw=swap?img.height:img.width, ih=swap?img.width:img.height;
 const base=Math.max(W/iw,H/ih), scale=base*parseFloat(zoom.value); const dw=img.width*scale, dh=img.height*scale;
 ctx.save();ctx.filter=`brightness(${brightness.value}%)`;ctx.translate(W/2+Number(panX.value),H/2+Number(panY.value));ctx.rotate(rotation*Math.PI/180);ctx.drawImage(img,-dw/2,-dh/2,dw,dh);ctx.restore();
 // guide
 ctx.save();ctx.strokeStyle='#20a464';ctx.lineWidth=5;ctx.setLineDash([12,10]);ctx.beginPath();ctx.ellipse(W/2,H*.43,W*.27,H*.31,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=.9;ctx.strokeStyle='#20a464';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(W*.24,H*.39);ctx.lineTo(W*.76,H*.39);ctx.stroke();ctx.fillStyle='#20a464';ctx.font='bold 22px sans-serif';ctx.fillText('目のライン',W*.38,H*.375);ctx.restore();
}
function cleanPhotoCanvas(){const c=document.createElement('canvas'); c.width=600; c.height=Math.round(600*photoH/photoW); const cctx=c.getContext('2d'); const W=c.width,H=c.height; cctx.fillStyle='#fff';cctx.fillRect(0,0,W,H); if(!img)return c;
 const swap=rotation%180!==0, iw=swap?img.height:img.width, ih=swap?img.width:img.height; const base=Math.max(W/iw,H/ih), scale=base*parseFloat(zoom.value); const dw=img.width*scale, dh=img.height*scale;
 // map pan from editor to output
 const px=Number(panX.value)*(W/editor.width), py=Number(panY.value)*(H/editor.height);
 cctx.save();cctx.filter=`brightness(${brightness.value}%)`;cctx.translate(W/2+px,H/2+py);cctx.rotate(rotation*Math.PI/180);cctx.drawImage(img,-dw/2,-dh/2,dw,dh);cctx.restore();return c}
function setPreset(w,h,btn){photoW=w;photoH=h;document.getElementById('sizeLabel').textContent=`${w}×${h}mm`;document.querySelectorAll('#presetButtons button').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active')}
document.querySelectorAll('#presetButtons button[data-w]').forEach(b=>b.onclick=()=>{document.getElementById('customSizeBox').hidden=true;setPreset(Number(b.dataset.w),Number(b.dataset.h),b)});document.querySelector('#presetButtons button[data-w]').classList.add('active');
document.getElementById('customPreset').onclick=()=>{document.getElementById('customSizeBox').hidden=false};
document.getElementById('applyCustom').onclick=()=>setPreset(Number(document.getElementById('customW').value),Number(document.getElementById('customH').value),document.getElementById('customPreset'));
const papers={L:[89,127], '2L':[127,178], A4:[210,297]};
function generateSheet(){if(!img){alert('先に写真を選んでください');return}const [pw,ph]=papers[document.getElementById('paperSize').value];const margin=Number(document.getElementById('marginMm').value)||0;const dpi=300, pxmm=dpi/25.4;sheet.width=Math.round(pw*pxmm);sheet.height=Math.round(ph*pxmm);sctx.fillStyle='#fff';sctx.fillRect(0,0,sheet.width,sheet.height);const w=Math.round(photoW*pxmm),h=Math.round(photoH*pxmm),m=Math.round(margin*pxmm);const cols=Math.max(1,Math.floor((sheet.width-2*m)/w)),rows=Math.max(1,Math.floor((sheet.height-2*m)/h));const totalW=cols*w,totalH=rows*h,startX=Math.floor((sheet.width-totalW)/2),startY=Math.floor((sheet.height-totalH)/2);const p=cleanPhotoCanvas();for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const x=startX+c*w,y=startY+r*h;sctx.drawImage(p,x,y,w,h);sctx.strokeStyle='#bbb';sctx.lineWidth=1;sctx.strokeRect(x,y,w,h)}sheet.style.display='block'}
document.getElementById('generateSheet').onclick=generateSheet;
function downloadCanvas(canvas,name){const a=document.createElement('a');a.download=name;a.href=canvas.toDataURL('image/jpeg',.95);a.click()}
document.getElementById('downloadSingle').onclick=()=>{if(!img){alert('先に写真を選んでください');return}downloadCanvas(cleanPhotoCanvas(),`証明写真_${photoW}x${photoH}mm.jpg`)};
document.getElementById('downloadSheet').onclick=()=>{if(!sheet.width){generateSheet();if(!sheet.width)return}downloadCanvas(sheet,`証明写真_印刷シート_${document.getElementById('paperSize').value}.jpg`)};
drawEditor();
