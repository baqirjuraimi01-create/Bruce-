/* ------------------------------------------------------------------
   scanner.js — camera barcode scanning.

   Primary path: the native BarcodeDetector API (Chrome/Edge/Android,
   Safari 17+). It is hardware-accelerated and needs no library.
   Fallback: type the digits in — the lookup path is identical, so the
   app still works end to end on a browser without the API.
------------------------------------------------------------------- */

const Scanner = (() => {
  const FORMATS = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf'];

  let stream = null, detector = null, raf = 0, running = false, onResult = null;
  let lastCode = '', lastAt = 0;

  const el = {
    overlay: () => document.getElementById('scanOverlay'),
    video:   () => document.getElementById('scanVideo'),
    status:  () => document.getElementById('scanStatus')
  };

  function supported(){ return 'BarcodeDetector' in window; }

  async function open(cb){
    onResult = cb;
    el.overlay().hidden = false;
    document.getElementById('manualBarcode').value = '';
    setStatus('Starting camera…');

    if(!navigator.mediaDevices?.getUserMedia){
      return setStatus('No camera access here — type the barcode below.');
    }

    try{
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode:{ ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } },
        audio: false
      });
    }catch(err){
      const msg = err.name === 'NotAllowedError'
        ? 'Camera permission denied — type the barcode below.'
        : 'Camera unavailable — type the barcode below.';
      return setStatus(msg);
    }

    const v = el.video();
    v.srcObject = stream;
    await v.play().catch(() => {});

    if(!supported()){
      return setStatus('This browser has no barcode API — type the digits below.');
    }

    try{
      const avail = await window.BarcodeDetector.getSupportedFormats();
      detector = new window.BarcodeDetector({ formats: FORMATS.filter(f => avail.includes(f)) });
    }catch(e){
      return setStatus('Barcode detection failed to start — type the digits below.');
    }

    setStatus('Point at the barcode');
    running = true;
    loop();
  }

  async function loop(){
    if(!running) return;
    const v = el.video();
    if(v.readyState === v.HAVE_ENOUGH_DATA){
      try{
        const codes = await detector.detect(v);
        if(codes.length){
          const code = codes[0].rawValue.replace(/\D/g,'');
          const now = Date.now();
          // Debounce: the same code fires many times per second.
          if(code && (code !== lastCode || now - lastAt > 2500)){
            lastCode = code; lastAt = now;
            buzz();
            setStatus('Found ' + code + ' — looking up…');
            const cb = onResult;
            close();
            cb && cb(code);
            return;
          }
        }
      }catch(e){ /* a dropped frame is not worth stopping for */ }
    }
    raf = requestAnimationFrame(loop);
  }

  function close(){
    running = false;
    cancelAnimationFrame(raf);
    if(stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
    const v = el.video();
    if(v) v.srcObject = null;
    el.overlay().hidden = true;
  }

  function setStatus(t){ const s = el.status(); if(s) s.textContent = t; }
  function buzz(){ try{ navigator.vibrate && navigator.vibrate(40); }catch(e){} }

  function wire(){
    document.getElementById('scanClose').onclick = close;
    const go = () => {
      const code = document.getElementById('manualBarcode').value.replace(/\D/g,'');
      if(!code) return toast('Enter the digits under the barcode');
      const cb = onResult;
      close();
      cb && cb(code);
    };
    document.getElementById('manualLookup').onclick = go;
    document.getElementById('manualBarcode').addEventListener('keydown', e => {
      if(e.key === 'Enter') go();
    });
  }

  return { open, close, wire, supported };
})();
