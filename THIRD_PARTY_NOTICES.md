# Third-party notices

Laya multilingual is developed by Convai Innovations, Apache-2.0. This project uses the independent ONNX conversion at https://huggingface.co/onnx-community/laya-multilingual-ONNX, pinned to revision `46b77bbf5642fec5f14e540570228a8cbe8ab81f`. File hashes and sizes are in `scripts/laya-artifacts.json`. The model is packaged locally; no hosted inference or remote JavaScript is used.

The Laya sequence builder follows `laya/common.py` and the Metaspace browser tokenizer workaround in https://github.com/shreyaskarnik/open-jev/blob/laya-family/src/laya.ts. The latter is MIT-licensed; its license is included in `licenses/open-jev-MIT.txt`. The model's Apache-2.0 license is in `licenses/laya-APACHE-2.0.txt`.

Transformers.js is Apache-2.0, ONNX Runtime is MIT, and React is MIT. Their licenses are included with their npm packages.
