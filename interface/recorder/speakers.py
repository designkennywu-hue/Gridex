"""Local voice clustering. Audio is a temporary mono 16 kHz PCM WAV."""
import json, sys, wave
from pathlib import Path
import numpy as np
import sherpa_onnx

models = Path(__file__).parent / 'models'
config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
    segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
        pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
            model=str(models / 'sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx'),
            window_shift_ratio=0.1), num_threads=2),
    embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
        model=str(models / 'nemo-en-titanet-small.onnx'), num_threads=2),
    clustering=sherpa_onnx.FastClusteringConfig(num_clusters=-1, threshold=0.85),
    min_duration_on=0.3, min_duration_off=0.5)
if not config.validate():
    raise RuntimeError('Speaker models are unavailable')
with wave.open(sys.argv[1], 'rb') as source:
    if source.getnchannels() != 1 or source.getframerate() != 16000 or source.getsampwidth() != 2:
        raise RuntimeError('Expected mono 16 kHz PCM audio')
    audio = np.frombuffer(source.readframes(source.getnframes()), dtype=np.int16).astype(np.float32) / 32768

def progress(done, total):
    print(json.dumps({'progress':round(done / max(total, 1) * 100)}), flush=True)
    return 0

result = sherpa_onnx.OfflineSpeakerDiarization(config).process(audio, callback=progress).sort_by_start_time()
print(json.dumps({'turns':[{'start':r.start,'end':r.end,'speaker':int(r.speaker)} for r in result]}), flush=True)
