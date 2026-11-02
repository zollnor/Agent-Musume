const {timingSafeEqual}=require('node:crypto');
module.exports=(req,capability)=>{
  if(req.method!=='POST'||req.url!=='/respond'||!capability)return false;
  const port=req.socket.localPort;
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host))return false;
  if(req.headers.origin!==undefined&&req.headers.origin!==`http://${req.headers.host}`)return false;
  if(req.headers['sec-fetch-site']==='cross-site')return false;
  const supplied=req.headers['x-deskpet-bridge-capability'];
  return typeof supplied==='string'&&Buffer.byteLength(supplied)===Buffer.byteLength(capability)&&timingSafeEqual(Buffer.from(supplied),Buffer.from(capability));
};
