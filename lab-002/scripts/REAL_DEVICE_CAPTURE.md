# LAB 002 genuine mobile capture workflow

Status: **PENDING_DEVICE_CAPTURE**.

This workflow is an acceptance gate, not a placeholder-media generator. Do
not publish a GIF, MP4, or WebM until every shot comes from a physical Android
phone running Chrome or a physical iPhone running Safari. Browser emulation,
Playwright video, desktop screen recording, animated mockups, cursor paths,
and simulated phone frames do not qualify.

## 1. Prepare the real-device session

1. Deploy the exact commit to the same-origin Pages path or serve it from a
   trusted HTTPS URL reachable by the phone.
2. Copy the committed files
   `assets/samples/mountains/01.jpg` through `03.jpg` to the phone photo
   library. Do not re-crop them.
3. Record the device model, OS version, browser version, date, operator, Pages
   commit, and URL in a sidecar JSON file kept with the private master.
4. Disable notification previews, lock orientation to portrait, and use the
   phone's native screen recorder. Do not add a simulated device bezel.

## 2. Android Chrome master

On a physical Android phone:

1. Open LAB 002 in current Chrome and start the native Android screen recorder.
2. Tap “从相册选择” and select the three mountain frames.
3. Reorder one frame, restore the correct order, and tap “开始拼接”.
4. Show the seam overlay, move one crop control, and download the JPEG.
5. Stop recording. Transfer the untouched recorder file to ignored private
   storage, for example `C:\tmp\lab002-device-capture\android-master.mp4`.
6. Record its SHA-256 before trimming:

```powershell
Get-FileHash C:\tmp\lab002-device-capture\android-master.mp4 -Algorithm SHA256
```

## 3. iPhone Safari master

On a physical iPhone:

1. Open LAB 002 in current Safari and start iOS Screen Recording from Control
   Center.
2. Repeat the same five visible actions: select, reorder, stitch, inspect seam
   and crop, then use the system share sheet.
3. Stop recording and transfer the untouched file by cable or AirDrop without
   messaging-app recompression.
4. Store it in ignored private storage and record its SHA-256 exactly as above.

The public demonstration may use one accepted master, but both device/browser
paths must be manually checked and recorded.

## 4. Convert one accepted master

Install a trusted FFmpeg build outside the repository. Use the same genuine
master for all three outputs. Choose a continuous 12-second interval that
contains selection, reorder, stitch, seam/crop and export; replace `START`
with its measured start time.

```powershell
ffmpeg -ss START -i C:\tmp\lab002-device-capture\accepted-master.mp4 -t 12 -vf "scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black,fps=30" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -an C:\tmp\lab002-device-capture\lab-002-real-device.mp4
ffmpeg -ss START -i C:\tmp\lab002-device-capture\accepted-master.mp4 -t 12 -vf "scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black,fps=30" -c:v libvpx-vp9 -crf 32 -b:v 0 -an C:\tmp\lab002-device-capture\lab-002-real-device.webm
ffmpeg -ss START -i C:\tmp\lab002-device-capture\accepted-master.mp4 -t 12 -vf "fps=12,scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=sierra2_4a" -loop 0 C:\tmp\lab002-device-capture\lab-002-real-device.gif
```

## 5. Acceptance before publication

1. Decode all three outputs and verify 1080×1350, approximately 12 seconds,
   legible text and no black/blank processing stall.
2. Confirm the three outputs show the same genuine interaction and no inserted
   desktop or generated frames.
3. Compute SHA-256 values and update
   `assets/real-device-media-status.json` with device evidence and public file
   paths.
4. Only then copy the derivatives into the public media directory, change
   status to `CAPTURED_AND_VERIFIED`, and run the provenance validator.

Until those steps are complete, `publicFiles` must remain empty and no
GIF/MP4/WebM may be committed under `lab-002/`.
