import { timingSafeEqual } from 'node:crypto';

export function requestGate(req,capability) {
  const port=req.socket.localPort;
  if(!port||!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host))return false;
  if(req.headers.origin!==undefined&&req.headers.origin!==`http://${req.headers.host}`)return false;
  if(req.headers['sec-fetch-site']==='cross-site')return false;
  let path;try{path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{return false;}
  if(path==='/shutdown'&&req.method!=='POST')return false;
  const read=['GET','HEAD'].includes(req.method)&&!/^\/dsh-pet-\d+\/chat(?:\/|$)/.test(path);
  if(read)return true;
  const supplied=req.headers['x-deskpet-capability'];
  return typeof supplied==='string'&&Buffer.byteLength(supplied)===Buffer.byteLength(capability)&&timingSafeEqual(Buffer.from(supplied),Buffer.from(capability));
}
export function stripWildcardCors(res) {
  const original=res.writeHead.bind(res);
  res.writeHead=(code,...args)=>{
    res.removeHeader('access-control-allow-origin');
    for(const arg of args)if(arg&&typeof arg==='object'&&!Array.isArray(arg)) {
      for(const key of Object.keys(arg))if(key.toLowerCase()==='access-control-allow-origin')delete arg[key];
    }
    res.setHeader('x-content-type-options','nosniff');
    return original(code,...args);
  };
}
