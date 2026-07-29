# LAB 002 real-scene sample sources

The JPEG files in `assets/samples/`, `web/assets/samples/`, and
`python/panorama_stitch/samples/mountains/` are derivative frames from the
three real panning videos below. They are third-party material under the
[Pexels License](https://www.pexels.com/legal-pages/license/), not original
Vision Hub assets and not covered by this repository's CC BY 4.0 notice.

All source videos were downloaded on 2026-07-29 into ignored temporary
storage. Source MP4 files are not committed and are never requested by the
runtime application. `asset-manifest.json` is the machine-readable source of
truth for checksums and every published copy.

## Mountains — successful default sample

- Work: [Camera Panning Over Mountains](https://www.pexels.com/video/camera-panning-over-mountains-9943097/)
- Creator: cottonbro studio
- Video ID: `9943097`
- Exact source file: `9943097-uhd_4096_2160_25fps.mp4`
- Direct version URL: `https://videos.pexels.com/video-files/9943097/9943097-uhd_4096_2160_25fps.mp4`
- Measured source: 4096×2160, 25 fps, 470 frames, 18.8 seconds
- Frames:
  - `0.30T`: requested 5.640 s; decoded frame 141 at 5.640 s
  - `0.45T`: requested 8.460 s; decoded frame 212 at 8.480 s
  - `0.60T`: requested 11.280 s; decoded frame 282 at 11.280 s
- Usage: default Python and Web successful panorama sequence

## City — four-image successful sample

- Work: [Panoramic Cityscape of Modern Urban Skyline](https://www.pexels.com/video/panoramic-cityscape-of-modern-urban-skyline-36722864/)
- Creator: Zulfugar Karimov
- Video ID: `36722864`
- Exact source file: `15563861_3840_2160_30fps.mp4`
- Direct version URL: `https://videos.pexels.com/video-files/36722864/15563861_3840_2160_30fps.mp4`
- Measured source: 3840×2160, 29.970030 fps, 604 frames, 20.153467 seconds
- Frames:
  - `0.20T`: requested 4.031 s; decoded frame 121 at 4.037 s
  - `0.35T`: requested 7.054 s; decoded frame 211 at 7.040 s
  - `0.50T`: requested 10.077 s; decoded frame 302 at 10.077 s
  - `0.65T`: requested 13.100 s; decoded frame 393 at 13.113 s
- Usage: four-image Web and acceptance sequence

## Ocean — real low-texture failure sample

- Work: [Panning Shot of Ocean](https://www.pexels.com/video/panning-shot-of-ocean-6746361/)
- Creator: James Cheney
- Video ID: `6746361`
- Exact source file: `6746361-uhd_3840_2160_24fps.mp4`
- Direct version URL: `https://videos.pexels.com/video-files/6746361/6746361-uhd_3840_2160_24fps.mp4`
- Measured decoded source: 2560×1440, 23.976024 fps, 424 frames, 17.684333 seconds
- Frames:
  - `0.30T`: requested 5.305 s; decoded frame 127 at 5.297 s
  - `0.45T`: requested 7.958 s; decoded frame 191 at 7.966 s
  - `0.60T`: requested 10.611 s; decoded frame 254 at 10.594 s
- Usage: real low-texture failure and diagnostic sequence

## Derivative processing

The reproducible script `scripts/extract_real_samples.py` performs only:

1. decode the real frame nearest to each fractional timestamp;
2. apply the decoded landscape orientation and a centered 16:9 crop;
3. apply bounded gray-world color correction (channel gain 0.96–1.04);
4. resize with Lanczos interpolation to a 1600px longest edge;
5. encode JPEG at quality 90 and copy byte-identical files into the required
   Python and Web package locations.

No still image was divided into fake viewpoints. No generative fill, AI image
generation, procedural scene, or synthetic public sample is used.
