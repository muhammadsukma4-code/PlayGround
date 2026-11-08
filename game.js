(() => {
  'use strict';
  const COLS = 10, ROWS = 20;
  const SHAPES = {
    I: [[0,1],[1,1],[2,1],[3,1]], O: [[1,0],[2,0],[1,1],[2,1]],
    T: [[1,0],[0,1],[1,1],[2,1]], S: [[1,0],[2,0],[0,1],[1,1]],
    Z: [[0,0],[1,0],[1,1],[2,1]], J: [[0,0],[0,1],[1,1],[2,1]], L: [[2,0],[0,1],[1,1],[2,1]]
  };
  const COLORS = { I:'#65d9ee', O:'#f7ca6a', T:'#c27aff', S:'#9be975', Z:'#f27791', J:'#6c9cff', L:'#ff9b66' };
  const $ = id => document.getElementById(id);
  const boardCanvas = $('board'), boardCtx = boardCanvas.getContext('2d');
  const nextCanvas = $('nextCanvas'), nextCtx = nextCanvas.getContext('2d');
  const holdCanvas = $('holdCanvas'), holdCtx = holdCanvas.getContext('2d');
  const overlay = $('overlay');
  let board, current, bag = [], queue = [], held = null, holdUsed = false;
  let phase = 'ready', score = 0, lines = 0, level = 1, best = Number(localStorage.getItem('prismBest') || 0);
  let dropElapsed = 0, lastTime = 0, clearRows = [], clearStarted = 0, particles = [], soundOn = false, audioCtx = null;
  let boardSize = {w:0,h:0,cell:0,x:0,y:0,dpr:1};
  const randomBag = () => {
    if (!bag.length) { bag = Object.keys(SHAPES); for (let i=bag.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [bag[i],bag[j]]=[bag[j],bag[i]]; } }
    return bag.pop();
  };
  const blankBoard = () => Array.from({length:ROWS},()=>Array(COLS).fill(null));
  const makePiece = type => ({type, cells:SHAPES[type].map(([x,y])=>[x,y]), x:3, y:-1});
  function fillQueue(){ while(queue.length<4) queue.push(randomBag()); }
  function resetGame(){
    board=blankBoard(); bag=[]; queue=[]; held=null; holdUsed=false; particles=[]; score=0; lines=0; level=1; dropElapsed=0; clearRows=[];
    fillQueue(); spawn(); phase='playing'; overlay.classList.add('hidden'); $('pauseBtn').textContent='Ⅱ'; $('pauseOverlayBtn').classList.add('show'); $('statusLabel').textContent='IN PLAY'; syncUI(); playTone(520,.07); drawAll();
  }
  function spawn(){ fillQueue(); current=makePiece(queue.shift()); fillQueue(); holdUsed=false; if (collides(current,0,0)) endGame(); drawPreviews(); }
  function collides(piece,dx=0,dy=0,cells=piece.cells){
    return cells.some(([cx,cy])=>{const x=piece.x+cx+dx,y=piece.y+cy+dy; return x<0||x>=COLS||y>=ROWS||(y>=0&&board[y][x]);});
  }
  function move(dx,dy=0){ if(phase!=='playing'||clearRows.length)return false; if(!collides(current,dx,dy)){current.x+=dx;current.y+=dy;drawAll();return true;} return false; }
  function rotate(){
    if(phase!=='playing'||clearRows.length)return;
    const rotated=current.cells.map(([x,y])=>[2-y,x]);
    const minX=Math.min(...rotated.map(c=>c[0])),minY=Math.min(...rotated.map(c=>c[1]));
    const cells=rotated.map(([x,y])=>[x-minX,y-minY]);
    for(const kick of [0,-1,1,-2,2]) if(!collides(current,kick,0,cells)){current.x+=kick;current.cells=cells;playTone(420,.045);drawAll();return;}
  }
  function softDrop(){if(move(0,1)){score+=1;syncUI();}else lockPiece();dropElapsed=0;}
  function hardDrop(){
    if(phase!=='playing'||clearRows.length)return; let distance=0;
    while(!collides(current,0,1)){current.y++;distance++;}
    if(distance){score+=distance*2;playTone(240,.08);} lockPiece();
  }
  function lockPiece(){
    for(const [cx,cy] of current.cells){const x=current.x+cx,y=current.y+cy;if(y<0){endGame();return;} board[y][x]=current.type;}
    holdUsed=false;
    const full=[]; for(let y=0;y<ROWS;y++)if(board[y].every(Boolean))full.push(y);
    if(full.length){clearRows=full;clearStarted=performance.now();playTone(670,.12);drawAll();}
    else{spawn();drawAll();}
  }
  function finishClear(){
    const count=clearRows.length;
    for(const y of clearRows){ for(let x=0;x<COLS;x++)particles.push({x,y,color:COLORS[board[y][x]],life:1,seed:Math.random()}); }
    board=board.filter((_,y)=>!clearRows.includes(y)); while(board.length<ROWS)board.unshift(Array(COLS).fill(null));
    score += ([0,100,300,500,800][count]||1200)*level; lines+=count; level=Math.floor(lines/10)+1; clearRows=[]; syncUI(); spawn(); drawAll();
    if(soundOn){playTone(760,.08);setTimeout(()=>playTone(950,.12),80);}
  }
  function holdPiece(){
    if(phase!=='playing'||holdUsed||clearRows.length)return;
    const old=held; held=current.type; current=old?makePiece(old):makePiece(queue.shift());
    if(!old)fillQueue(); holdUsed=true; if(collides(current,0,0))endGame(); drawPreviews();drawAll();playTone(350,.06);
  }
  function endGame(){ phase='over'; $('statusLabel').textContent='STACK LOCKED'; $('pauseOverlayBtn').classList.remove('show'); $('overlayIcon').textContent='✦'; $('overlayTitle').textContent='Stack complete'; $('overlayText').textContent=`You scored ${score.toLocaleString()} points and cleared ${lines} ${lines===1?'line':'lines'}. Ready for another run?`; $('startBtn').textContent='Play again'; overlay.classList.remove('hidden'); if(score>best){best=score;localStorage.setItem('prismBest',String(best));} syncUI(); playTone(180,.2); }
  function pauseGame(){
    if(phase==='playing'){phase='paused';$('statusLabel').textContent='PAUSED';$('pauseBtn').textContent='▶';$('pauseOverlayBtn').classList.remove('show');$('overlayIcon').textContent='Ⅱ';$('overlayTitle').textContent='Take a breather';$('overlayText').textContent='Your stack is right where you left it. Jump back in when you’re ready.';$('startBtn').textContent='Resume game';overlay.classList.remove('hidden');}
    else if(phase==='paused'){phase='playing';$('statusLabel').textContent='IN PLAY';$('pauseBtn').textContent='Ⅱ';$('pauseOverlayBtn').classList.add('show');overlay.classList.add('hidden');lastTime=performance.now();}
  }
  function syncUI(){
    $('score').textContent=String(score).padStart(6,'0'); $('lines').textContent=String(lines).padStart(2,'0'); $('level').textContent=String(level).padStart(2,'0'); $('best').textContent=String(best).padStart(6,'0'); $('progress').style.width=`${(lines%10)*10}%`;
  }
  function resizeCanvas(canvas,ctx){
    const rect=canvas.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2);
    if(!rect.width||!rect.height)return;
    const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(dpr,0,0,dpr,0,0); return {width:rect.width,height:rect.height,dpr};
  }
  function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function drawBlock(ctx,x,y,size,color,alpha=1,depth=0){
    ctx.save();ctx.globalAlpha=alpha;
    const d=Math.max(2,size*.12), inset=Math.max(1,size*.055), r=Math.max(1,size*.1);
    // Extruded right and lower faces make every tile read as a small 3D prism.
    ctx.fillStyle=shade(color,-.43);ctx.beginPath();ctx.moveTo(x+size-inset,y+inset);ctx.lineTo(x+size-inset+d,y+inset+d);ctx.lineTo(x+size-inset+d,y+size-inset+d);ctx.lineTo(x+size-inset,y+size-inset);ctx.closePath();ctx.fill();
    ctx.fillStyle=shade(color,-.28);ctx.beginPath();ctx.moveTo(x+inset,y+size-inset);ctx.lineTo(x+size-inset,y+size-inset);ctx.lineTo(x+size-inset+d,y+size-inset+d);ctx.lineTo(x+inset+d,y+size-inset+d);ctx.closePath();ctx.fill();
    const grad=ctx.createLinearGradient(x,y,x+size,y+size);grad.addColorStop(0,shade(color,.24));grad.addColorStop(.42,color);grad.addColorStop(1,shade(color,-.15));
    roundedRect(ctx,x+inset,y+inset,size-inset*2,size-inset*2,r);ctx.fillStyle=grad;ctx.shadowColor=color;ctx.shadowBlur=size*.22;ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle='rgba(255,255,255,.32)';ctx.lineWidth=Math.max(.5,size*.035);ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,.44)';ctx.lineWidth=Math.max(.7,size*.055);ctx.beginPath();ctx.moveTo(x+inset+r,y+inset);ctx.lineTo(x+size-inset-r,y+inset);ctx.stroke();
    ctx.restore();
  }
  function shade(hex,amount){const n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;const f=v=>Math.max(0,Math.min(255,Math.round(v*(1+amount))));return `rgb(${f(r)},${f(g)},${f(b)})`;}
  function drawBoard(){
    const dims=resizeCanvas(boardCanvas,boardCtx);if(!dims)return;
    const {width:w,height:h}=dims,ctx=boardCtx,cell=Math.min(w/COLS,h/ROWS),ox=(w-cell*COLS)/2+1,oy=(h-cell*ROWS)/2+1;
    boardSize={w,h,cell,x:ox,y:oy,dpr:dims.dpr};ctx.clearRect(0,0,w,h);
    const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#0b1420');bg.addColorStop(1,'#080d15');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    // Subtle cool glow behind the playfield.
    const glow=ctx.createRadialGradient(w*.5,h*.45,0,w*.5,h*.45,w*.72);glow.addColorStop(0,'rgba(39,81,104,.14)');glow.addColorStop(1,'rgba(8,13,21,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
      const px=ox+x*cell,py=oy+y*cell;
      ctx.fillStyle=(x+y)%2?'rgba(130,168,195,.027)':'rgba(130,168,195,.045)';ctx.fillRect(px,py,cell,cell);
      ctx.strokeStyle='rgba(106,141,169,.105)';ctx.lineWidth=.6;ctx.strokeRect(px+.25,py+.25,cell-.5,cell-.5);
      if(board[y][x])drawBlock(ctx,px,py,cell,COLORS[board[y][x]],1);
    }
    if(clearRows.length){const progress=Math.min(1,(performance.now()-clearStarted)/150);ctx.fillStyle=`rgba(231,255,255,${.22+.55*(1-progress)})`;for(const y of clearRows)ctx.fillRect(ox,oy+y*cell,cell*COLS,cell);}
    if(current&&phase!=='over'){
      let ghostY=current.y;while(!collides(current,0,ghostY-current.y+1))ghostY++;
      for(const [cx,cy] of current.cells){const gx=current.x+cx,gy=ghostY+cy;if(gy>=0){ctx.strokeStyle=COLORS[current.type]+'88';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.strokeRect(ox+gx*cell+2,oy+gy*cell+2,cell-4,cell-4);ctx.setLineDash([]);}}
      for(const [cx,cy] of current.cells){const x=current.x+cx,y=current.y+cy;if(y>=0)drawBlock(ctx,ox+x*cell,oy+y*cell,cell,COLORS[current.type]);}
    }
    for(const p of particles){const px=ox+p.x*cell+cell*p.seed,py=oy+p.y*cell+cell*(1-p.seed);ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.fillRect(px,py,Math.max(1,cell*.12),Math.max(1,cell*.12));ctx.globalAlpha=1;}
    ctx.strokeStyle='rgba(110,162,190,.45)';ctx.lineWidth=1;ctx.strokeRect(ox+.5,oy+.5,cell*COLS-1,cell*ROWS-1);
  }
  function drawPreview(canvas,ctx,types,heldPiece=false){
    const dims=resizeCanvas(canvas,ctx);if(!dims)return;const {width:w,height:h}=dims;ctx.clearRect(0,0,w,h);
    const typeList=heldPiece?(types?[types]:[]):types;
    if(!typeList.length){ctx.fillStyle='#74849a';ctx.font='10px "DM Mono", monospace';ctx.textAlign='center';ctx.fillText('EMPTY',w/2,h/2+3);return;}
    typeList.forEach((type,index)=>{
      const shape=SHAPES[type],maxX=Math.max(...shape.map(c=>c[0]))+1,maxY=Math.max(...shape.map(c=>c[1]))+1;
      const areaH=heldPiece?h*.72:h/3.15,areaW=w*.78,cell=Math.min(areaW/maxX,areaH/maxY,25),startY=heldPiece?(h-maxY*cell)/2:index*h/3.1+(h/3.1-maxY*cell)/2;
      const startX=(w-maxX*cell)/2;
      for(const [x,y] of shape)drawBlock(ctx,startX+x*cell,startY+y*cell,cell,COLORS[type]);
    });
  }
  function drawPreviews(){drawPreview(nextCanvas,nextCtx,queue.slice(0,3));drawPreview(holdCanvas,holdCtx,held,true);}
  function drawAll(){drawBoard();}
  function frame(now){
    const dt=Math.min(60,now-(lastTime||now));lastTime=now;
    if(phase==='playing'){
      if(clearRows.length){if(now-clearStarted>155)finishClear();else drawBoard();}
      else{dropElapsed+=dt;const speed=Math.max(80,850-(level-1)*65);if(dropElapsed>=speed){dropElapsed%=speed;if(!move(0,1))lockPiece();}else if(particles.length)drawBoard();}
    }
    if(particles.length){particles=particles.map(p=>({...p,life:p.life-.055})).filter(p=>p.life>0);drawBoard();}
    requestAnimationFrame(frame);
  }
  function playTone(freq,duration){
    if(!soundOn)return;
    try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.035,audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+duration);}catch(_e){}
  }
  function action(name){
    if(phase==='ready'||phase==='over'){if(name==='rotate'||name==='left'||name==='right'||name==='soft'||name==='drop')resetGame();else return;}
    if(phase!=='playing')return;
    if(name==='left')move(-1);else if(name==='right')move(1);else if(name==='rotate')rotate();else if(name==='soft')softDrop();else if(name==='drop')hardDrop();else if(name==='hold')holdPiece();
  }
  $('startBtn').addEventListener('click',()=>{if(phase==='paused')pauseGame();else resetGame();});
  $('pauseBtn').addEventListener('click',()=>{if(phase==='playing'||phase==='paused')pauseGame();});
  $('pauseOverlayBtn').addEventListener('click',pauseGame);
  $('soundBtn').addEventListener('click',()=>{soundOn=!soundOn;$('soundBtn').style.color=soundOn?'var(--lime)':'#a8bacd';$('soundBtn').title=soundOn?'Sound on':'Sound off';if(soundOn)playTone(540,.08);});
  $('score').addEventListener('animationend',e=>e.currentTarget.classList.remove('bump'));
  window.addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();if(['arrowleft','arrowright','arrowdown','arrowup',' ','escape'].includes(key))e.preventDefault();
    if(key==='p'||key==='escape'){if(phase==='playing'||phase==='paused')pauseGame();return;}
    if(key==='enter'&&(phase==='ready'||phase==='over'||phase==='paused')){$('startBtn').click();return;}
    const map={'arrowleft':'left','a':'left','arrowright':'right','d':'right','arrowup':'rotate','w':'rotate','x':'rotate','arrowdown':'soft','s':'soft',' ':'drop','c':'hold','shift':'hold'};
    if(map[key])action(map[key]);
  },{passive:false});
  let repeatTimer=null,repeatDelay=null;
  function stopRepeat(){clearTimeout(repeatDelay);clearInterval(repeatTimer);repeatDelay=repeatTimer=null;document.querySelectorAll('.mobile-controls button').forEach(b=>b.classList.remove('pressed'));}
  document.querySelectorAll('.mobile-controls button').forEach(button=>{
    const name=button.dataset.action;
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture?.(e.pointerId);button.classList.add('pressed');action(name);if(name==='left'||name==='right'){repeatDelay=setTimeout(()=>{repeatTimer=setInterval(()=>action(name),80);},180);}});
    button.addEventListener('pointerup',stopRepeat);button.addEventListener('pointercancel',stopRepeat);button.addEventListener('lostpointercapture',stopRepeat);button.addEventListener('contextmenu',e=>e.preventDefault());
  });
  // Repeated soft drop while the center touch button is held.
  const mobileButtons=[...document.querySelectorAll('.mobile-controls button')];
  const rotateBtn=mobileButtons.find(b=>b.dataset.action==='rotate');
  rotateBtn.addEventListener('pointerdown',()=>{repeatDelay=setTimeout(()=>{repeatTimer=setInterval(()=>{if(phase==='playing')rotate();},160);},260);});
  window.addEventListener('resize',()=>{drawBoard();drawPreviews();});
  board=blankBoard();fillQueue();syncUI();drawPreviews();drawBoard();requestAnimationFrame(frame);
})();
