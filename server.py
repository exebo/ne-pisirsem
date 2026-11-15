import asyncio
import os
import socket
import threading
import time
import uuid
from concurrent.futures import TimeoutError as FutureTimeout

import cv2
from aiortc import RTCPeerConnection, RTCSessionDescription
from flask import Flask, jsonify, render_template_string, request
from werkzeug.serving import make_server, make_ssl_devcert
from storage import save_photo, varieties, photos

HTML = r'''<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zeytin Kamerası</title><style>
*{box-sizing:border-box}body{margin:0;padding:12px;background:#101827;color:#eef3fc;font:15px Arial,sans-serif;text-align:center}h2{font-size:18px;margin:8px 0}#status{min-height:35px;margin:8px auto;max-width:480px;overflow-wrap:anywhere;font-size:13px;color:#bcd2f5}video{display:block;width:100%;max-width:480px;height:min(42vh,310px);margin:8px auto;background:#000;border-radius:12px;object-fit:contain}button{display:inline-block;border:0;border-radius:10px;color:white;padding:12px 16px;margin:5px;font-size:15px;background:#2563eb}button:disabled{opacity:.5}#photo{background:#16a34a;font-size:19px;width:95%;max-width:450px;padding:16px}#stop{background:#b91c1c}#selection{margin:7px auto;font-size:13px;color:#d5e2ff;max-width:460px}#start{background:#2563eb}
</style></head><body><h2>🫒 Zeytin Kamerası</h2><p id="status">Kamerayı başlatın</p><video id="video" autoplay muted playsinline></video><div><button id="start">Kamerayı Başlat</button><button id="switch">Kamerayı Değiştir</button></div><div id="selection">Çeşit ve gram: bilgisayardan seçilir</div><button id="photo">📸 Fotoğraf Çek ve Kaydet</button><div><button id="stop">Bağlantıyı Kes</button></div><script>
const video=document.getElementById('video'),statusEl=document.getElementById('status'),photoBtn=document.getElementById('photo'),startBtn=document.getElementById('start'),switchBtn=document.getElementById('switch'),selectionEl=document.getElementById('selection');
let stream=null,pc=null,timer=null,face='environment',starting=false,shooting=false,epoch=0,lastCapture=0,checking=false;
function say(s){statusEl.textContent=s}
function localClose(){if(timer){clearInterval(timer);timer=null}if(pc){try{pc.close()}catch(e){}pc=null}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}video.srcObject=null}
async function stop(){epoch++;localClose();try{await fetch('/disconnect',{method:'POST'})}catch(e){}say('Bağlantı kesildi')}
async function start(){if(starting)return;starting=true;startBtn.disabled=true;switchBtn.disabled=true;const myEpoch=++epoch;localClose();let localPC=null;
try{say('Kamera açılıyor...');const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:face},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:24,max:30}},audio:false});if(myEpoch!==epoch){s.getTracks().forEach(t=>t.stop());return}stream=s;video.srcObject=s;await video.play();localPC=new RTCPeerConnection({iceServers:[]});pc=localPC;s.getVideoTracks().forEach(t=>localPC.addTrack(t,s));const offer=await localPC.createOffer();await localPC.setLocalDescription(offer);
await new Promise((resolve,reject)=>{if(localPC.iceGatheringState==='complete')return resolve();const t=setTimeout(()=>reject(Error('ICE zaman aşımı')),15000);const fn=()=>{if(localPC.iceGatheringState==='complete'){clearTimeout(t);localPC.removeEventListener('icegatheringstatechange',fn);resolve()}};localPC.addEventListener('icegatheringstatechange',fn)});
if(myEpoch!==epoch)return;const r=await fetch('/offer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(localPC.localDescription)});const a=await r.json();if(!r.ok)throw Error(a.error||'Bağlantı kurulamadı');if(myEpoch!==epoch||pc!==localPC||localPC.signalingState!=='have-local-offer')return;await localPC.setRemoteDescription(a);say('Kamera hazır');timer=setInterval(checkCommand,700);await refreshMetadata();
}catch(e){if(myEpoch===epoch){say('Kamera hatası: '+e.message);localClose()}}finally{starting=false;startBtn.disabled=false;switchBtn.disabled=false}}
async function refreshMetadata(){try{const r=await fetch('/metadata',{cache:'no-store'});if(!r.ok)return;const j=await r.json();selectionEl.textContent=j.variety?'Bilgisayardaki seçim: '+j.variety+' • '+j.gram+' gr':'Bilgisayarda zeytin çeşidi ve gram seçin'}catch(e){}}
async function savePhoto(){if(shooting)return;if(!stream||!video.videoWidth){say('Önce kamerayı başlatın');return}shooting=true;photoBtn.disabled=true;const id=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random());
try{say('Fotoğraf kaydediliyor...');const canvas=document.createElement('canvas');let shot=null;try{if('ImageCapture' in window)shot=await new ImageCapture(stream.getVideoTracks()[0]).takePhoto()}catch(e){}if(shot){const bitmap=await createImageBitmap(shot);canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close()}else{canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0)}
const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Fotoğraf oluşturulamadı')),'image/jpeg',.98));let result;try{const r=await fetch('/photo?id='+encodeURIComponent(id),{method:'POST',body:blob});result=await r.json();if(!r.ok)throw Error(result.error||'Kayıt reddedildi')}catch(e){const r=await fetch('/photo-status/'+encodeURIComponent(id)).catch(()=>null);if(r&&r.ok){const j=await r.json();if(j.saved)result=j}if(!result)throw e}say('✓ Kaydedildi: '+result.filename);await refreshMetadata();
}catch(e){say('Fotoğraf hatası: '+e.message)}finally{shooting=false;photoBtn.disabled=false}}
async function checkCommand(){if(checking)return;checking=true;try{const r=await fetch('/command',{cache:'no-store'});if(r.ok){const j=await r.json();if(j.capture_id>lastCapture){lastCapture=j.capture_id;await savePhoto()}}await refreshMetadata()}catch(e){}finally{checking=false}}
startBtn.onclick=start;switchBtn.onclick=async()=>{face=face==='environment'?'user':'environment';await stop();await start()};photoBtn.onclick=savePhoto;document.getElementById('stop').onclick=stop;window.addEventListener('pagehide',localClose);refreshMetadata();
</script></body></html>'''

class PhoneServer:
    def __init__(self, port=8765):
        self.port=port
        self.app=Flask(__name__)
        self.lock=threading.RLock()
        self.meta=(None,'12')
        self.frame=None
        self.last_seen=0
        self.photo=None
        self.last_saved=None
        self.capture_id=0
        self.receipts={}
        self.peer=None
        self.loop=asyncio.new_event_loop()
        self.thread=threading.Thread(target=self._run_loop,daemon=True)
        self._loop_ready=threading.Event()
        self.thread.start()
        self._loop_ready.wait(timeout=5)
        self.httpd=None
        self._install_routes()

    def _install_routes(self):
        app=self.app
        @app.get('/')
        def index():return render_template_string(HTML)
        @app.get('/health')
        def health():return jsonify(ok=True)
        @app.get('/varieties')
        def get_varieties():
            names=[name for name,_ in varieties()]
            with self.lock: preferred=self.meta[0]
            return jsonify(varieties=names,default=preferred if preferred in names else (names[0] if names else ''))
        @app.get('/metadata')
        def metadata():
            with self.lock: v,g=self.meta
            return jsonify(variety=v,gram=g)
        @app.get('/command')
        def command():
            with self.lock:return jsonify(capture_id=self.capture_id)
        @app.post('/offer')
        def offer():
            data=request.get_json(silent=True) or {}
            if data.get('type')!='offer' or not data.get('sdp'):return jsonify(error='Geçersiz teklif'),400
            future=asyncio.run_coroutine_threadsafe(self._offer(data),self.loop)
            try:return jsonify(future.result(timeout=35))
            except FutureTimeout:
                future.cancel();return jsonify(error='Bağlantı zaman aşımı'),504
            except Exception as e:return jsonify(error=str(e)),500
        @app.post('/disconnect')
        def disconnect():
            with self.lock:self.frame=None;self.last_seen=0
            if self.loop.is_running():asyncio.run_coroutine_threadsafe(self._close_peer(),self.loop)
            return jsonify(ok=True)
        @app.post('/photo')
        def photo():
            shot_id=request.args.get('id','')[:120]
            with self.lock:
                if shot_id and shot_id in self.receipts:return jsonify(self.receipts[shot_id])
            data=request.get_data()
            if not 100<len(data)<=20_000_000 or not data.startswith(b'\xff\xd8'):
                return jsonify(error='Geçersiz JPEG fotoğraf'),400
            with self.lock:
                default_variety,default_gram=self.meta
            variety=default_variety
            gram=default_gram
            try:
                if not variety or variety not in dict(varieties()):raise ValueError('Zeytin çeşidi seçin (telefondan veya bilgisayardan).')
                path=save_photo(data,variety,gram,'Telefon')
                receipt={'ok':True,'saved':True,'filename':os.path.basename(path)}
                with self.lock:
                    self.photo=data;self.last_saved=path;self.last_seen=time.time()
                    if shot_id:
                        self.receipts[shot_id]=receipt
                        if len(self.receipts)>500:self.receipts=dict(list(self.receipts.items())[-250:])
                print('[TELEFON FOTO] Kaydedildi:',path,flush=True)
                return jsonify(receipt)
            except Exception as e:
                print('[TELEFON FOTO] HATA:',repr(e),flush=True)
                return jsonify(error=str(e)),400
        @app.get('/photo-status/<shot_id>')
        def photo_status(shot_id):
            with self.lock:return jsonify(self.receipts.get(shot_id,{'saved':False}))
        @app.get('/photos-count')
        def photo_count():return jsonify(count=len(photos()))

    def _run_loop(self):
        asyncio.set_event_loop(self.loop)
        self._offer_lock=asyncio.Lock()
        self._loop_ready.set()
        self.loop.run_forever()

    async def _close_peer(self):
        pc=self.peer
        self.peer=None
        if pc:
            try:await pc.close()
            except Exception:pass

    async def _offer(self,data):
        async with self._offer_lock:
            await self._close_peer()
            pc=RTCPeerConnection()
            self.peer=pc
            @pc.on('track')
            def on_track(track):
                if track.kind=='video':asyncio.create_task(self._consume(track,pc))
            try:
                await pc.setRemoteDescription(RTCSessionDescription(sdp=data['sdp'],type=data['type']))
                answer=await pc.createAnswer()
                await pc.setLocalDescription(answer)
                return {'sdp':pc.localDescription.sdp,'type':pc.localDescription.type}
            except Exception:
                if self.peer is pc:await self._close_peer()
                raise

    async def _consume(self,track,pc):
        try:
            last=0
            while self.peer is pc and pc.connectionState not in ('closed','failed'):
                frame=await track.recv()
                now=time.monotonic()
                if now-last<1/12:continue
                last=now
                img=frame.to_ndarray(format='bgr24')
                h,w=img.shape[:2]
                if w>1280:img=cv2.resize(img,(1280,round(h*1280/w)))
                ok,buf=cv2.imencode('.jpg',img,[cv2.IMWRITE_JPEG_QUALITY,75])
                if ok:
                    with self.lock:self.frame=buf.tobytes();self.last_seen=time.time()
        except (asyncio.CancelledError,Exception):pass

    def start(self):
        folder=os.path.join(os.path.dirname(os.path.abspath(__file__)),'certs')
        os.makedirs(folder,exist_ok=True)
        cert=os.path.join(folder,'local.crt');key=os.path.join(folder,'local.key')
        if not (os.path.isfile(cert) and os.path.isfile(key)):
            make_ssl_devcert(os.path.join(folder,'local'),host='localhost')
        self.httpd=make_server('0.0.0.0',self.port,self.app,threaded=True,ssl_context=(cert,key))
        threading.Thread(target=self.httpd.serve_forever,daemon=True).start()
        print('[SUNUCU] HTTPS port:',self.port,flush=True)

    def stop(self):
        if self.httpd:
            self.httpd.shutdown();self.httpd.server_close();self.httpd=None
        if self.loop.is_running():
            async def shutdown():
                await self._close_peer()
                pending=[t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
                for t in pending:t.cancel()
                if pending:await asyncio.gather(*pending,return_exceptions=True)
            try:asyncio.run_coroutine_threadsafe(shutdown(),self.loop).result(timeout=6)
            except Exception:pass
            self.loop.call_soon_threadsafe(self.loop.stop)
            self.thread.join(timeout=3)
        if not self.loop.is_closed():self.loop.close()

    def get_frame(self):
        with self.lock:return self.frame if time.time()-self.last_seen<3 else None
    def set_metadata(self,variety,gram):
        with self.lock:self.meta=(variety,gram)
    def capture(self):
        with self.lock:self.capture_id+=1
    def take_photo(self):
        with self.lock:
            data=self.photo;self.photo=None
            return data

def local_ip():
    sock=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    try:
        sock.connect(('8.8.8.8',80))
        return sock.getsockname()[0]
    except OSError:return '127.0.0.1'
    finally:sock.close()
