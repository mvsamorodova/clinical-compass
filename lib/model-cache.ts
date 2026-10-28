import manifest from './gigaam-model-manifest.json';
export const SPEECH_MODEL='Xenova/whisper-tiny';
export const SPEECH_REVISION='5332fcc35e32a33b86612b9a57a89be7906102b1';
export const SPEECH_FILES=['config.json','tokenizer.json','tokenizer_config.json','preprocessor_config.json','onnx/encoder_model_quantized.onnx','onnx/decoder_model_merged_quantized.onnx'];
export const EMOTION_CACHE='compass-gigaam-emo-8fad2a2c';
import {cachedFiles} from './cache-files';
export const speechCached=()=>cachedFiles('transformers-cache',SPEECH_FILES.map(file=>`https://huggingface.co/${SPEECH_MODEL}/resolve/${SPEECH_REVISION}/${file}`));
export const emotionCached=()=>cachedFiles(EMOTION_CACHE,manifest.chunks.map(c=>new URL(c.url,globalThis.location.origin).href));
export async function keepModelStorage(){try{await navigator.storage?.persist?.();}catch{/* Browsers may refuse persistent storage; existing model files remain usable. */}}
