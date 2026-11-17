# Image embedding benchmark (2026-11-17)

Set: 360 public Jiji ads with 2+ photos across 8 fashion and beauty categories (manifest built 2026-11-17), 928 photos embedded.
Task: photo 1 of an ad is the query; the index holds every other photo of every ad. A hit = another photo of the same ad in the top k (05 §5.1 acceptance: recall@5 ≥ 80%).
Zero-shot: photo 1 classified into the 8 categories with "a photo of …" prompts.
Latency: one image at a time, q8 ONNX on this machine's CPU (40 samples, after warm-up).

| Model | Dims | Recall@1 | Recall@5 | Recall@10 | Zero-shot | p50 | p95 | Images/s (batch 16) | Load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| clip-vit-b32 | 512 | 68.3% | 81.4% | 85.6% | 79.2% | 87 ms | 103 ms | 14.5 | 1.3 s |
| marqo-fashionclip | 512 | 72.8% | 84.4% | 88.3% | 84.7% | 264 ms | 303 ms | 4.4 | 0.6 s |
| marqo-fashionsiglip | 768 | 82.2% | 91.4% | 93.1% | 93.1% | 284 ms | 329 ms | 4.7 | 1.0 s |

## Recall@5 by category

| Model | clothing | shoes | bags | jewellery-and-watches | hair-beauty | makeup | skin-care | fragrance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| clip-vit-b32 | 84.4% | 88.9% | 84.4% | 88.9% | 80.0% | 64.4% | 91.1% | 68.9% |
| marqo-fashionclip | 86.7% | 84.4% | 91.1% | 93.3% | 86.7% | 68.9% | 91.1% | 73.3% |
| marqo-fashionsiglip | 91.1% | 100.0% | 93.3% | 93.3% | 86.7% | 84.4% | 97.8% | 84.4% |

Queries: 360, index: 568 photos.
