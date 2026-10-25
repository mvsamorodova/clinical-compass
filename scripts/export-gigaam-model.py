"""Export official GigaAM-Emo; quantize dense MatMul/Gemm only, retain float Conv.
Reference environment: Python3.12, torch2.8.0, torchaudio2.8.0,
onnx1.19.1, onnxruntime1.23.2; official GigaAM commit below.
"""
from pathlib import Path
import hashlib,json,time,subprocess,sys
import torch,onnx,gigaam
from onnxruntime.quantization import quantize_dynamic,QuantType
P=Path(sys.argv[1]).resolve();OUT=P/'browser-onnx';OUT.mkdir(exist_ok=True)
COMMIT='7447938d791c4f3e643386ee22c33777004293a5'
assert subprocess.check_output(['git','-C',str(P/'GigaAM'),'rev-parse','HEAD']).decode().strip()==COMMIT
assert hashlib.md5((P/'emo.ckpt').read_bytes()).hexdigest()=='7ce76f9535cb254488985057c0d33006'
torch.set_num_threads(4);t=time.time();m=gigaam.load_model('emo',fp16_encoder=False,device='cpu',download_root=str(P));m.to_onnx(dir_path=str(OUT),dtype=torch.float32);del m
print('EXPORTED_FP32',time.time()-t,flush=True)
src=OUT/'emo.onnx';dst=OUT/'emo-matmul-int8.onnx';t=time.time()
quantize_dynamic(str(src),str(dst),op_types_to_quantize=['MatMul','Gemm'],weight_type=QuantType.QInt8,per_channel=False,reduce_range=False,extra_options={'MatMulConstBOnly':True})
print('QUANTIZED',time.time()-t,flush=True)
meta={'source_repository':'https://github.com/salute-developers/GigaAM','source_commit':COMMIT,'source_checkpoint_url':'https://cdn.chatwm.opensmodel.sberdevices.ru/GigaAM/emo.ckpt','source_checkpoint_md5':'7ce76f9535cb254488985057c0d33006','quantization':{'method':'onnxruntime.quantization.quantize_dynamic','op_types_to_quantize':['MatMul','Gemm'],'weight_type':'QInt8','per_channel':False,'reduce_range':False,'extra_options':{'MatMulConstBOnly':True}},'files':{x.name:{'bytes':x.stat().st_size,'sha256':hashlib.sha256(x.read_bytes()).hexdigest()} for x in [src,dst]},'license':'MIT; Copyright (c) 2024 GigaChat Team'}
(P/'browser-model.json').write_text(json.dumps(meta,indent=2));print(json.dumps(meta,indent=2),flush=True)
