export function encodeVoiceWav(samples:Float32Array){
 const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
 const text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++)view.setInt16(44+i*2,Math.min(32767,Math.max(-32768,Math.round(samples[i]*32768))),true);
 return new Blob([buffer],{type:'audio/wav'});
}
export function decodeVoiceWav(buffer:ArrayBuffer){
 const v=new DataView(buffer),tag=(at:number)=>String.fromCharCode(...new Uint8Array(buffer,at,4));
 if(buffer.byteLength<44||tag(0)!=='RIFF'||tag(8)!=='WAVE'||tag(36)!=='data'||v.getUint16(20,true)!==1||v.getUint16(22,true)!==1||v.getUint32(24,true)!==16000||v.getUint16(34,true)!==16||v.getUint32(40,true)!==buffer.byteLength-44)throw Error('Формат записи не поддерживается');
 const out=new Float32Array((buffer.byteLength-44)/2);for(let i=0;i<out.length;i++)out[i]=v.getInt16(44+i*2,true)/32768;return out;
}
