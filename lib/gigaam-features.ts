// The pinned Transformers.js frontend was compared to GigaAM's torchaudio
// preprocessor (64 HTK bands, FFT 400). Whisper's frontend is not compatible.
// @ts-expect-error Pinned package internal utility has no declaration export.
import {mel_filter_bank,window_function,spectrogram} from '../node_modules/@huggingface/transformers/src/utils/audio.js';
// @ts-expect-error Use the same source env as the internal audio utility.
import {env} from '../node_modules/@huggingface/transformers/src/env.js';
const filters=mel_filter_bank(201,64,0,8000,16000,null,'htk');
const window=window_function(400,'hann',{periodic:true});
export async function gigaamFeatures(audio:Float32Array){
 if(typeof self!=='undefined'&&self.location){env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;env.backends.onnx.wasm.wasmPaths=new URL('/speech-runtime/',self.location.origin).href;}
 const features=await spectrogram(audio,window,400,160,{fft_length:400,power:2,center:true,pad_mode:'reflect',mel_filters:filters,mel_floor:1e-9,log_mel:'log'});
 const data=features.data as Float32Array;for(let i=0;i<data.length;i++)data[i]=Math.min(Math.log(1e9),data[i]);
 return {data,frames:features.dims[1]};
}
