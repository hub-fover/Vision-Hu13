# LAB 007 Monocular Depth Experience Design

## Goal

Add a mobile-first monocular depth experience to Vision-Hu13 without changing
LAB 001 through LAB 006. A visitor can take or choose a photo, run local
relative-depth inference, compare the source and depth map, and inspect up to
three points. Relative values must never be presented as physical distance.

## Product flow

The home screen presents the LAB 007 identity, one real scene image, camera and
album actions, and three bundled examples. Selecting an image immediately opens
a three-stage processing screen. The result screen defaults to a draggable
comparison view and also offers source-only and depth-only views. Tapping the
image updates a visible reading and retains the three most recent markers.

An expandable section explains relative depth and the optional metric service.
The metric action is disabled when no API is configured. Enabling it requires
an explicit upload confirmation. The share action produces a portrait PNG with
the source, depth map, selected points, disclaimer, and a real QR code for the
public LAB 007 URL.

## Runtime architecture

The published app is static. The UI runs on the main thread while a Dedicated
Worker owns Transformers.js and Depth Anything V2 Small. WebGPU is attempted
first and falls back to single-threaded WASM. The Transformers.js browser
module and ONNX Runtime assets are copied from locked npm packages and served
from the same origin. Model files are fetched from the pinned Hugging Face
revision and cached by the browser.

The model is `onnx-community/depth-anything-v2-small`, revision
`4472b7362082ad9968fee890ca0f1e5aca36b93d`, using `model_q4.onnx`. Images are
validated, orientation-aware when the browser supports it, and resized to a
maximum 1280-pixel edge before inference. Cancellation terminates obsolete
work, and request identifiers prevent late results from replacing newer state.

## Data and privacy boundaries

Relative inference does not upload the selected photo. Downloading the runtime
and model is network activity and is stated separately. The optional metric API
is `POST {metricApiBase}/v1/depth/metric` with multipart field `image`; accepted
responses contain positive dimensions, a matching finite non-negative depth
array, `unit: "m"`, and a model name. Photos are never written to persistent
browser storage.

## Visual system

Use a true-white background, charcoal text, quiet gray dividers, a restrained
green status accent, and the functional Turbo depth palette. The real scene and
depth result carry the color. Controls are at least 48px high, radii are 8px,
and the layout respects safe-area insets from 375px through desktop widths.
Chinese UI uses PingFang SC, Microsoft YaHei, and system fallbacks. Motion is
short and disabled under `prefers-reduced-motion`.

## Verification boundary

Unit, staging, browser, responsive screenshot, Canvas-pixel, and one live model
smoke test are required. Pixel 7 Chromium and iPhone 13 WebKit emulation verify
layout and interaction, but they do not count as real-device Safari, Android,
or WeChat acceptance.
