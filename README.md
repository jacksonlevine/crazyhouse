# crazyhouse

A security-cam horror game in the browser, in the spirit of "I'm on
Observation Duty". You watch a house at night through eight cams while
ghoul1 lurches around inside it, lit only by real lamps.

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
arrows switch cams. **E** or the `emp` button fires the EMP at the room
you're watching. **N** or the `nv` button toggles night vision. Enter or Space starts. Esc goes back to the title.

## The EMP

ghoul1 is out of reality most of the time. Every so often he fades
back in, and once he's here he stays until you get rid of him: find
him on the cams and fire the EMP while you're watching his room.

- It only hits the room the current cam is watching. Electric arcs
  crackle round that room's edges and the room strobes, so you can see
  where it went.
- If he's in that room, he dies: he stops dead, arches back and reaches
  both arms up to the sky, head thrown back, shaking, then stutters out
  of reality (about 2.5 seconds, `ZAPPED` and `AGONY` in `ghoul.js`).
  He stays gone for 25 to 50 seconds before turning up somewhere else.
  If he isn't in that room, you wasted it.
- It makes a crackling electric zap, made on the fly in the browser (no
  sound files), in `emp.js`.
- It takes 6 seconds to recharge (`RECHARGE` in `main.js`); the bar
  along the bottom of the button fills back up.
- The arcs and flash are `emp.js`. Which rooms count as which is
  `ROOMS` in `world.js`.

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
- `emp.js` is the EMP's electric arcs, flash and zap sound
- `debug.js` is the debug panel (see Debugging)
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
windows, onto the yard. Lamps are warm, the streetlight a little
orange, the moon a little blue (`LAMP_COLOR` and the light colours in
`world.js`; set them to `0xffffff` for plain white).

**Colours.** Everything is a flat colour, no texture images, so it costs
nothing extra to draw: green lawn, concrete walk, wood floors, warm
walls, a red front door, and so on. They're all in `MAT` near the top of
`world.js`, and `paint()` decides which thing gets which.

- **Lamps** (`roomLamps()` in `world.js`): a floor lamp in the foyer, a
  table lamp in the living room, pendants over the dining table and the
  kitchen island, a lamp on an end table by the sectional, both
  nightstand lamps in the master, a bare bulb in the
  laundry, a light bar over the bathroom mirror, a lantern on the patio.
- **Outside:** a tall streetlight by the front walk that reaches up
  onto the roof (`streetlight()`), moonlight, and a faint fill that
  keeps dark corners dim rather than pitch black (`sky()`).
- **Sky:** stars, a moon and a few slowly drifting clouds
  (`heavens()`). Kept cheap: about a dozen draws, no lights or shadows.
- **Brightness:** each lamp's number is its strength (in
  `floorLamp(lamps, 'lamp-foyer', 140, 775, 28)` it's the 28). The whole
  picture's brightness is `EXPOSURE` at the top of `main.js`. Surface
  greys are `MAT` near the top of `world.js`.
- **Cost:** shadows are worked out once at the start, then only redrawn
  for lamps near ghoul1, so it stays fast.

## Night vision

Like a real security cam: switching it on turns on an infrared light at
the camera that floods the room it's watching, and the picture goes
bright, green and grainy with a dark vignette. Lamps blow out and
ghoul1's pupils glow. Strength is `IR_STRENGTH` and `NV_GAIN` in
`main.js`; the green look is `.night` in `crazyhouse.css`.

## ghoul1

A thin, hunched figure about 6' tall: a narrow head with two staring
eyes, hair to his shoulders, arms up in front of him Nosferatu style.
He lurches round a loop forever, about 90 seconds a lap.

- **The stare:** in any room with a cam, his head turns to look straight
  into it, all the way round if it has to.
- **Slipping in and out of reality:** he's gone most of the time,
  walking unseen. He first shows up about 10 seconds in, fades in over
  a couple of seconds, and stays until an EMP hits his room. The
  timings are `FIRST`, `GONE`, `FADE` and `ZAPPED` near the top of
  `ghoul.js`.
- **His route** is `ROUTE` at the top of `ghoul.js`, smoothed into a
  curve.
- **No walking through things.** After changing his route, his arms or
  any furniture, run `node check-route.mjs` (needs Node.js). It walks
  him round the whole loop and tests every outer point of his body
  against every wall, door and piece of furniture, and tells you where
  he touches anything. Add a number to check more laps:
  `node check-route.mjs 2`.

## Debugging

Add `?debug` to the URL (http://localhost:8000/?debug, or the live
site's address). A panel appears top left (`debug.js`, which only loads
in debug mode):

- **Free cam** (F or the button): WASD moves, click the view and the
  mouse looks around, Shift goes up, Ctrl or C goes down, Esc lets go of
  the mouse. Careful: Ctrl+W closes the browser tab and no web page can
  stop that, so C is the safe way down. Switching cams or pressing F
  again snaps back to the real cam. There's a speed slider too.
- **FOV slider** with the number, for the current cam, or tick the box
  to try it on all cams.
- **Night vision** and **fully lit** (strong even light everywhere, no
  fog) buttons.
- **Show ghoul** pins him visible, **freeze ghoul** stops him walking.
- **Copy cam** copies the current view as a line you can paste into
  `cams.js`, so a spot you find in free cam can become a real cam.
- A readout of where the camera is, its FOV and ghoul1's state.

The browser console also gets `crazyhouse.scene`, `.camera`, `.CAMS`,
`.showCam(n)`, `.ghoul`, `.lamps`, `.fireEmp()` and `.toggleNight()`.
`crazyhouse.ghoul.jumpTo(x, y)` drops him at a spot, and
`crazyhouse.ghoul.forcePresence = 0.5` pins how faded he is.

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
