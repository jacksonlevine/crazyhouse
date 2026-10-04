# crazyhouse

A security-cam horror game in the browser, in the spirit of "I'm on
Observation Duty". You watch a house at night through eight cams while
ghoul1 lurches around inside it. Black and white, lit by real lamps.

Playable at [jakeworldwide.com/games/crazyhouse](https://jakeworldwide.com/games/crazyhouse/).

## Run it on your computer

It's plain files, no build step and nothing to install. Browsers won't
load the game straight off your disk, so start a tiny local server from
this folder:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Edit a file, refresh the page.

## Controls

Left / right arrow keys, the number pad (4 / 6), A / D, or the on-screen
arrows switch cams. Enter or Space starts. Esc goes back to the title.

## What's in here

- `index.html` holds the 16:9 frame, the title screen and the cam overlay
- `crazyhouse.css` sizes everything in `cqw` (1% of the frame's width),
  so it all scales with the frame on any screen
- `cams.js` is the list of cams: name, position in feet, what it looks
  at, zoom
- `main.js` runs the game: renderer, input, the clock, shadows
- `world.js` builds the house, the furniture, the yard and the lights,
  and has `ROOMS`: which part of the house is which room, and which cam
  covers it
- `ghoul.js` is ghoul1: his body, his walking loop, his stare, and when
  he fades in and out
- `ghost.js` draws him blurred and faded over the frame
- `tv.js` is the kitchen TV (see below), `crt.js` its model (see CREDITS.md)
- `tv/` is the TV's video and its prebaked glow table; `tools/build-tv.sh`
  rebuilds both from a video atlas
- `check-route.mjs` tests his walking loop for clipping (see below)
- `vendor/three-r186/` is Three.js, the 3D library, saved here so the
  game doesn't depend on anything else

## The house

**Coordinates.** The house started as a copy of a published floor plan,
so every plan coordinate in `world.js` is a pixel on that plan image
(27.42 px per foot). The image isn't in this repo. You don't need it:
just treat the numbers as a grid where 27.42 is one foot. Heights are in
feet: the floor sits 2.5' above the yard and ceilings are 8'.

- To move a wall, window or door, change its numbers in `walls()`.
  `win(from, to, sill, head)` and `door(from, to)` are ranges along the
  wall.
- To add furniture, `block(x0, x1, y0, y1, height)` makes a box over
  that patch of the floor. Look at the other rooms for examples.
- Every piece of furniture and every door has a name (`sofa`, `bed`,
  `fridge`, `toilet`, `door-front`, `door-master`...), so anomaly code
  can grab one with `scene.getObjectByName('bed')` and move it, hide it
  or swap it.

**Lighting.** Every light is a real light that casts real shadows, so
it only reaches what it can actually see: through doorways, out of
windows, onto the yard. All lights are white so the picture stays black
and white.

- **Lamps** (`roomLamps()` in `world.js`): a floor lamp in the foyer, a
  table lamp in the living room, pendants over the dining table and the
  kitchen island, a nightstand lamp in the master, a bare bulb in the
  laundry, a light bar over the bathroom mirror, a lantern on the patio.
- **Outside:** a streetlight by the front walk (`streetlight()`) and
  faint moonlight (`sky()`).
- **Brightness:** each lamp's number is its strength (in
  `floorLamp(lamps, 'lamp-foyer', 140, 775, 28)` it's the 28). The whole
  picture's brightness is `EXPOSURE` at the top of `main.js`. Surface
  greys are `MAT` near the top of `world.js`.
- **Cost:** shadows are worked out once at the start, then only redrawn
  for lamps near ghoul1, so it stays fast.

## The kitchen TV

On the south counter next to the fridge, a CRT (credit in CREDITS.md). Like Farlands Views, it plays
one video that holds a grid of feeds (`tv/reel.mp4`, an 8x8 atlas) and
shows just its own tile; `TILE` at the top of `tv.js` picks which of the
64. Its screen is drawn grey with scanlines. The glow it casts is a real
shadowed lamp whose strength follows the picture: `tv/glow.png` is
prebaked, one pixel per tile per frame holding that tile's average
brightness, so nothing ever reads the video back. To use different
footage, run `tools/build-tv.sh atlas.mp4` (needs ffmpeg) on a 64-frame,
8-fps clip with the same 8x8 layout. The footage is traffic and beach
cams from the Roadside / Farlands Views reel.

## ghoul1

A thin, hunched figure about 6' tall: a narrow head with two staring
eyes, hair to his shoulders, arms up in front of him Nosferatu style.
He lurches round a loop forever, about 90 seconds a lap.

- **The stare:** in any room with a cam, his head turns to look straight
  into it, all the way round if it has to.
- **Slipping in and out of reality:** every so often he blurs out of
  focus and fades away, keeps walking unseen, then blurs back in. The
  timings are `SEEN`, `GONE` and `FADE` near the top of `ghoul.js`.
- **His route** is `ROUTE` at the top of `ghoul.js`, smoothed into a
  curve.
- **No walking through things.** After changing his route, his arms or
  any furniture, run `node check-route.mjs` (needs Node.js). It walks
  him round the whole loop and tests every outer point of his body
  against every wall, door and piece of furniture, and tells you where
  he touches anything. Add a number to check more laps:
  `node check-route.mjs 2`.

## Debugging

Add `?debug` to the URL (http://localhost:8000/?debug) and the browser
console gets `crazyhouse.scene`, `.camera`, `.CAMS`, `.showCam(n)`,
`.ghoul` and `.lamps`. `crazyhouse.ghoul.paused = true` stops him in
place, `crazyhouse.ghoul.jumpTo(x, y)` drops him at a spot, and
`crazyhouse.ghoul.forcePresence = 0.5` pins how faded he is (`1` = fully
here, `null` = back to normal).

## Making your own version (for friends)

1. On GitHub, hit **Fork** on this repo. That gives you your own copy
   under your account. Nothing you do there touches the original.
2. Download your copy:
   ```
   git clone https://github.com/YOUR-NAME/crazyhouse.git
   cd crazyhouse
   python3 -m http.server 8000
   ```
3. Change whatever you like. Save your work with
   `git add -A && git commit -m "what you changed"` and send it up to
   your GitHub copy with `git push`.
4. To grab later updates from the original, run this once:
   `git remote add upstream https://github.com/jakeworldwide/crazyhouse.git`,
   then whenever you want them: `git pull upstream main`.
5. Made something worth sharing back? Open a pull request on GitHub.

## Live composite camera view

The scene and ghost render at 768×480, then `analog.js` encodes monochrome
composite voltage at 910 samples per line (14.31818 MHz), including sync
and blanking. A receiver pass detects each line's sync trailing edge with
a voltage comparator and clamps the back-porch level. Decoding uses that
recovered timing and a windowed-sinc low-pass filter with a 4.2 MHz cutoff.
There are no decorative scanlines, vignette, or scripted picture warps.

This is still a partial receiver model: progressive active rows only,
no vertical sync, interlace, color burst/chroma, or temporal PLL. On lost
horizontal sync it free-runs at nominal timing. It is not a full NTSC
simulation. Tone mapping converts scene radiance to source video levels.

At `?debug`, `crazyhouse.analog.controls` exposes `bandwidthMHz`, `noise`,
`interference`, and `automatic`. Noise and automatic bursts default off.
Interference adds a continuous oscillator to the waveform before sync
recovery and decoding. `crazyhouse.analog.disturb(0.6)` injects a brief
burst. Set `controls.injection` to another Three.js waveform texture and
`controls.injectionGain` to its voltage mixing gain; red represents signal
voltage with the same scanline layout. Set injection to null to disconnect.
Use `?debug&interference=0.7` to inspect steady signal interference.

### Signal injection test keys

While playing, hold any of these keys (combine them freely). Release to
remove the injected voltage. Hold Shift for twice the injection amplitude.

| Key | Generator | Signal amplitude |
| --- | --- | --- |
| Q | Broadband pseudorandom noise | ±0.6 |
| W | 60 Hz sine, mains hum | ±0.35 |
| E | 1 MHz sine, RF interference | ±0.35 |
| R | Independent 15,680 Hz negative sync pulse train, 4.7 µs pulses | −0.65 |
| T | 1 kHz positive impulse train, 0.5 µs pulses | +2.5 |

Amplitudes use normalized composite voltage (blanking 0, sync −0.4,
white 1). All sources mix before sync detection, pedestal clamping, and
bandwidth filtering. `crazyhouse.analog.controls.testGain` scales them.
Blur, hidden tab, and quitting clear held keys. Q–T work without `?debug`.
A slow offset can be rejected by the back-porch clamp, and a narrow pulse
can be attenuated by the bandwidth filter; these are receiver responses.
The limited horizontal receiver still does not model vertical rolling.

Mains hum also injects automatically for random 1–5 second stretches,
separated by random 1–5 second quiet gaps. Set
`crazyhouse.analog.controls.automaticHum = false` to disable scheduling;
holding W still injects mains hum manually.
