from pathlib import Path
import subprocess, socket, http.client, time, json, re
root=Path(__file__).resolve().parents[1]/'AndroidProject/app/src/main/assets/phone-host'
# Chosen test-host interface is private; 127.0.0.1 is never used as a LAN bind argument.
try:
 s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.connect(('10.1.1.1',80)); ip=s.getsockname()[0];s.close()
except Exception as e:
 print(json.dumps({'result':'SKIP','reason':'No test private network interface: '+str(e)}));raise SystemExit()
if not (ip.startswith('10.') or ip.startswith('192.168.') or (ip.startswith('172.') and 16<=int(ip.split('.')[1])<=31)):
 print(json.dumps({'result':'SKIP','reason':'No RFC1918 interface'}));raise SystemExit()
port=socket.socket();port.bind((ip,0));p=port.getsockname()[1];port.close()
child=subprocess.Popen(['node','server.js','--transport','dev','--port',str(p),'--bind',ip,'--max','2','--total','4','--bots','0'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 success=False
 for _ in range(70):
  if child.poll() is not None: break
  try:
   c=http.client.HTTPConnection(ip,p,timeout=.3);c.request('GET','/status');r=c.getresponse();j=json.loads(r.read());c.close()
   assert r.status==200 and j.get('ok') and j.get('game')=='sightline-v12-host-prototype'
   assert 'memory' not in j and 'cpu' not in j and 'bot' not in j
   success=True;break
  except OSError: time.sleep(.1)
 assert success, 'private-IP host did not start or wrong status response'
 print(json.dumps({'result':'PASS','bound_to':ip,'port':p,'remote_status_privacy':'PASS','server_started':True}))
finally:
 child.terminate()
 try:child.communicate(timeout=3)
 except subprocess.TimeoutExpired:child.kill();child.communicate()
