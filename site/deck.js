/* forge-state deck — vanilla nav, no deps */
(function(){
  'use strict';
  var deck, slides, total, current = 0, hud, hudTimer, helpOn = false;

  function init(){
    deck = document.querySelector('.deck');
    if(!deck) return;
    slides = Array.prototype.slice.call(deck.querySelectorAll(':scope > section'));
    total = slides.length;
    slides.forEach(function(s,i){
      s.style.display = 'none';
      // Adjust footer progress dots: Nth marker becomes yellow 16x16 square, others 7x7 faint dots.
      var footer = s.querySelector('[data-progress]');
      if(footer){
        // Regenerate `total` markers (idempotent on every init; supports any slide count).
        footer.innerHTML = '';
        for(var j=0;j<total;j++){
          var sp = document.createElement('span');
          if(j===i){
            sp.style.width='16px'; sp.style.height='16px';
            sp.style.background = 'var(--yellow)';
          } else {
            sp.style.width='7px'; sp.style.height='7px';
            sp.style.background = 'var(--faint)';
          }
          sp.style.display = 'inline-block';
          footer.appendChild(sp);
        }
      }
    });

    buildHud();
    bindKeys();
    bindTouch();
    bindResize();

    // initial slide from hash
    var h = parseInt((location.hash||'').replace('#',''),10);
    if(!isNaN(h) && h>=1 && h<=total) current = h-1;
    show(current);
    scaleDeck();
    revealHud();
  }

  function show(i){
    if(i<0) i=0; if(i>=total) i=total-1;
    slides.forEach(function(s){
      s.style.display = 'none';
      s.removeAttribute('data-deck-active');
    });
    current = i;
    var s = slides[i];
    s.style.display = 'flex';
    // double rAF to retrigger CSS animations
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        s.setAttribute('data-deck-active','');
      });
    });
    var hash = '#'+(i+1);
    try { history.replaceState(null,'',hash); } catch(e){ location.hash = hash; }
    updateHud();
    var notes = s.getAttribute('data-speaker-notes');
    if(notes) try { console.log('['+(i+1)+'/'+total+'] '+(s.getAttribute('data-label')||'')+'\n'+notes); }catch(e){}
  }
  function next(){ if(current<total-1) show(current+1); }
  function prev(){ if(current>0) show(current-1); }

  function buildHud(){
    hud = document.createElement('div');
    hud.id = 'deck-hud';
    hud.style.cssText = [
      'position:fixed','left:50%','bottom:14px','transform:translateX(-50%)',
      'z-index:9999','font-family:"JetBrains Mono",ui-monospace,monospace',
      'font-size:12px','letter-spacing:.18em','text-transform:uppercase',
      'color:#A9AEB8','background:rgba(11,14,20,.65)','padding:8px 16px',
      'border:1px solid #222937','pointer-events:none',
      'transition:opacity .4s ease','opacity:0'
    ].join(';');
    hud.innerHTML = '<span id="deck-hud-counter"></span><span style="opacity:.5;margin:0 14px">·</span><span>← → · 1-9 · R · ?</span>';
    document.body.appendChild(hud);
  }
  function updateHud(){
    var c = document.getElementById('deck-hud-counter');
    if(c) c.textContent = String(current+1).padStart(2,'0')+' / '+String(total).padStart(2,'0');
  }
  function revealHud(){
    if(!hud) return;
    hud.style.opacity = '1';
    clearTimeout(hudTimer);
    hudTimer = setTimeout(function(){ hud.style.opacity = '0'; }, 2500);
  }

  function isEditable(t){
    if(!t) return false;
    var tag = (t.tagName||'').toLowerCase();
    return tag==='input'||tag==='textarea'||tag==='select'||t.isContentEditable;
  }

  function bindKeys(){
    window.addEventListener('keydown', function(e){
      if(isEditable(e.target)) return;
      var k = e.key;
      if(k==='ArrowRight'||k==='ArrowDown'||k==='PageDown'||k===' '||k==='Spacebar'){ e.preventDefault(); next(); revealHud(); return; }
      if(k==='ArrowLeft'||k==='ArrowUp'||k==='PageUp'){ e.preventDefault(); prev(); revealHud(); return; }
      if(k==='Home'){ e.preventDefault(); show(0); revealHud(); return; }
      if(k==='End'){ e.preventDefault(); show(total-1); revealHud(); return; }
      if(k==='r'||k==='R'){ e.preventDefault(); show(0); revealHud(); return; }
      if(k==='?'||(k==='/' && e.shiftKey)){ e.preventDefault(); toggleHelp(); return; }
      if(/^[0-9]$/.test(k)){
        e.preventDefault();
        var n = (k==='0') ? 10 : parseInt(k,10);
        if(n>=1 && n<=total) show(n-1);
        revealHud();
      }
    });
    window.addEventListener('mousemove', revealHud, {passive:true});
  }

  function bindTouch(){
    var startX=0,startY=0,startT=0;
    window.addEventListener('touchstart', function(e){
      var t = e.touches[0];
      startX = t.clientX; startY = t.clientY; startT = Date.now();
    }, {passive:true});
    window.addEventListener('touchend', function(e){
      var tgt = e.target;
      if(tgt){
        var tn = (tgt.tagName||'').toLowerCase();
        if(tn==='a'||tn==='button'||tn==='input'||tn==='textarea'||tn==='select') return;
      }
      var t = (e.changedTouches && e.changedTouches[0]) || null;
      if(!t) return;
      var dx = t.clientX - startX, dy = t.clientY - startY, dt = Date.now()-startT;
      if(Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 500){
        var w = window.innerWidth;
        var x = t.clientX;
        if(x < w/3) prev();
        else if(x > 2*w/3) next();
        else toggleHelp();
        revealHud();
      }
    }, {passive:true});
  }

  function toggleHelp(){
    helpOn = !helpOn;
    var existing = document.getElementById('deck-help');
    if(existing){ existing.remove(); if(!helpOn) return; }
    if(!helpOn) return;
    var o = document.createElement('div');
    o.id = 'deck-help';
    o.style.cssText = [
      'position:fixed','inset:0','z-index:10000','background:rgba(11,14,20,.92)',
      'display:flex','align-items:center','justify-content:center',
      'font-family:"JetBrains Mono",ui-monospace,monospace','color:#F4F3EF',
      'font-size:16px','letter-spacing:.08em'
    ].join(';');
    o.innerHTML = '<div style="border:1px solid #39414F;padding:36px 44px;background:#10151F;line-height:1.9">' +
      '<div style="color:#F6AC2D;font-size:13px;letter-spacing:.22em;margin-bottom:16px">FORGE-STATE — DECK CONTROLS</div>' +
      '→ / ↓ / space / pgdn &nbsp; next<br>' +
      '← / ↑ / pgup &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; prev<br>' +
      'home / end &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; first / last<br>' +
      '1-9, 0 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; jump to slide (0 = 10)<br>' +
      'r &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; reset<br>' +
      '? &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; toggle this overlay<br>' +
      '<div style="margin-top:18px;color:#A9AEB8;font-size:13px">tap left/right thirds on touch · middle = this overlay</div>' +
      '</div>';
    o.addEventListener('click', function(){ helpOn=false; o.remove(); });
    document.body.appendChild(o);
  }

  function scaleDeck(){
    if(!deck) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw/1920, vh/1080);
    var x = Math.round((vw - 1920*s)/2);
    var y = Math.round((vh - 1080*s)/2);
    deck.style.position = 'absolute';
    deck.style.left = x+'px';
    deck.style.top = y+'px';
    deck.style.width = '1920px';
    deck.style.height = '1080px';
    deck.style.transformOrigin = 'top left';
    deck.style.transform = 'scale('+s+')';
  }
  function bindResize(){
    window.addEventListener('resize', scaleDeck);
    window.addEventListener('orientationchange', scaleDeck);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
