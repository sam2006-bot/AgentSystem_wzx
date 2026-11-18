"""Rank public-facility photo descriptions with the local CLIP image/text encoders."""
import json
import sys
from pathlib import Path

vision_dir, image_path = map(Path, sys.argv[1:3])
sys.path.insert(0, str(vision_dir / "lib"))

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps
from tokenizers import Tokenizer

# English prototypes match the model's training language. Chinese labels match config.json.
labels = [
    ("井盖缺失", "an open uncovered manhole in the street with its metal cover missing"),
    ("道路破损", "a pothole or a deep crack in a damaged asphalt road"),
    ("排水异常", "a flooded street covered with standing water"),
    ("垃圾堆积", "a pile of discarded garbage and trash bags dumped on a sidewalk"),
    ("树木断枝或倾倒", "a fallen tree or large broken branch blocking a street"),
    ("照明设施倾斜", "a bent or fallen street light pole"),
    ("", "an intact metal manhole cover flush with the pavement"),
    ("", "a normal clean city street with buildings and cars"),
    ("", "a healthy standing tree in a garden or park"),
    ("", "a normal working streetlamp"),
    ("", "printed words or a sign with text on a white background"),
    ("", "an unrelated indoor scene, a person or an animal"),
]
tokenizer = Tokenizer.from_file(str(vision_dir / "tokenizer.json"))
tokenizer.enable_padding(pad_id=49407, pad_token="<|endoftext|>")
tokens = tokenizer.encode_batch([s for _, s in labels])

with Image.open(image_path) as source:
    if source.width * source.height > 25_000_000:
        raise ValueError("Image dimensions exceed the inference limit")
    photo = ImageOps.exif_transpose(source).convert("RGB")
    pixels = np.asarray(ImageOps.fit(photo, (224, 224), method=Image.Resampling.BICUBIC), dtype=np.float32) / 255
mean = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
std = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)
inputs = {
    "input_ids": np.array([t.ids for t in tokens], dtype=np.int64),
    "attention_mask": np.array([t.attention_mask for t in tokens], dtype=np.int64),
    "pixel_values": ((pixels - mean) / std).transpose(2, 0, 1)[None],
}
settings = ort.SessionOptions()
settings.intra_op_num_threads = 2
settings.inter_op_num_threads = 1
model = ort.InferenceSession(str(vision_dir / "clip.onnx"), sess_options=settings, providers=["CPUExecutionProvider"])
logits = model.run(["logits_per_image"], inputs)[0][0]
weights = np.exp(logits - logits.max())
scores = weights / weights.sum()
best, runner_up = np.argsort(scores)[-2:][::-1]
# A ranking margin is only a heuristic. All image classifications require human review.
candidate = labels[best][0] if scores[best] >= 0.55 and scores[best] - scores[runner_up] >= 0.15 else ""
print(json.dumps({"candidate": candidate, "score": round(float(scores[best]), 3)}))
