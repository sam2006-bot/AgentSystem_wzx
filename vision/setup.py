"""Install the project-local optional CPU image classifier with a Python 3.12 interpreter."""
import hashlib
from pathlib import Path
import subprocess
import sys
import urllib.request

root = Path(__file__).resolve().parents[1] / "data" / "vision"
root.mkdir(parents=True, exist_ok=True)
subprocess.run([sys.executable, "-m", "pip", "install", "--target", str(root / "lib"),
                "onnxruntime==1.23.2", "tokenizers==0.22.1", "numpy>=1.26,<3", "Pillow>=10,<13"], check=True)
base = "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/6b7c523703ae26e39be4b03774966f8571c7f523/"
for remote, local, expected in [
    ("onnx/model_quantized.onnx", "clip.onnx", "0898a3facfdb27f0a041e57649b4989cfd094e4a0040d6ae75ed69917dfc7328"),
    ("tokenizer.json", "tokenizer.json", None),
]:
    tmp = root / (local + ".part")
    urllib.request.urlretrieve(base + remote, tmp)
    if expected:
        with tmp.open("rb") as file:
            if hashlib.file_digest(file, "sha256").hexdigest() != expected:
                raise ValueError("Model checksum mismatch")
    tmp.replace(root / local)
(root / "python-path.txt").write_text(sys.executable, encoding="utf-8")
print("Local vision model is ready.")
