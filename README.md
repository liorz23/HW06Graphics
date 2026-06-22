# Computer Graphics - Exercise 6 - Interactive Bowling Game

An interactive WebGL bowling game built with THREE.js (r128), extending the static
**HW05** bowling alley into a fully playable 10-frame game: aim and power controls, a
rolling ball with hand-written physics, pin collision and toppling, and complete bowling
scoring.

## Group Members
- Lior Zoaretz
- Noam Adda

## Getting Started
1. Make sure you have Node.js installed
2. Install dependencies: `npm install`
3. Start the local web server: `node index.js`
4. Open your browser and go to http://localhost:8000

## How to Play
1. **Aim** the ball left/right across the foul line with the arrow keys (and optionally
   add spin/hook with up/down). A blue guide line previews the ball's path.
2. Press **Space** to start the **power meter** — a bar that sweeps up and down.
3. Press **Space** again to lock the power and **release** the ball; it is launched with a
   speed proportional to the locked power.
4. Watch the ball roll, knock down pins, and the scorecard update. Repeat for all 10 frames.

## Controls
| Key | Action |
| --- | --- |
| **← / →** | Aim — move the ball along the foul line |
| **↑ / ↓** | Add / remove spin (ball hook / curve) |
| **Space** | Start the power meter, then press again to lock power and release |
| **R** | Reset pins / start a new game |
| **F** | Toggle the follow-the-ball camera (on by default) |
| **O** | Toggle orbit camera (drag to rotate, scroll to zoom) — carried over from HW05 |
| **1 / 2 / 3 / 4** | Camera presets: bowler, overhead, pin-end, side |

## What's Implemented (mandatory requirements)

**Aiming & controls**
- Move/aim the ball along the foul line before each roll
- On-screen oscillating **power meter**; press Space to start it, Space again to lock and release
- Release velocity derived from the player's aim and chosen power
- On-screen controls panel and a contextual phase hint; the 'O' orbit toggle still works

**Ball physics (hand-written, no physics engine)**
- Velocity integrated from delta time each frame in `animate()` (`position += velocity * dt`)
- Rolling friction so the ball decelerates; visible rolling rotation
- **Gutter detection**: if the ball leaves the lane edge it drops into the gutter and
  knocks down zero pins
- The ball comes to rest at the pin end (or after a gutter ball)

**Pin collision & toppling**
- Ball-to-pin collision via sphere-vs-cylinder horizontal distance test
- Pin-to-pin propagation: a falling pin knocks neighbours that lie in its fall path
- Knocked pins visibly **topple over** (rotate about the contact axis) then are marked down
- The set of standing pins is tracked accurately (counted only after topples settle)

**Ten-frame scoring**
- 10 frames, two rolls each (three in the 10th on a strike/spare)
- Correct **strike** (X), **spare** (/), and open-frame scoring with proper bonus rules
- Running cumulative total, displayed live in the scorecard (a perfect game totals 300)
- Pins reset between rolls/frames as appropriate

**Game flow & state**
- A state machine (`aiming → power → rolling → resolving → next roll`) gates input per phase
- End-of-roll detection (ball stopped / left the lane), fallen-pin counting, frame advance
- Ball returns to the approach for the next roll; **R** starts a fresh game
- Clear **GAME OVER** indication with the final score after the 10th frame

## Bonus Features
- **Follow-the-ball camera** that tracks the ball down the lane during the roll (toggle **F**),
  in addition to the four HW05 camera presets
- **Ball hook / curve** driven by spin input (**↑ / ↓**) — a sideways acceleration that bends
  the ball's path
- **On-lane aim guide** that previews the launch direction and curve while aiming
- **Pinsetter / sweeper animation** — after each roll a mechanical bar sweeps downed pins off
  the deck before the next ball is returned, with a distinct game phase and camera hold
- **STRIKE! / SPARE! / GUTTER! / GAME OVER** on-screen announcements
- **Sound effects** — a rolling rumble, a pin-crash, and a strike chime, all synthesized with
  the Web Audio API (no external audio files)

## Known Limitations
- Physics is intentionally simplified: the ball passes through pins (which topple) rather than
  rigid-body bouncing; the gutter drop is a snap rather than a smooth fall.
- Collision/curve constants are tuned by hand and can be adjusted at the top of `src/hw6.js`.

## External Assets
None. All geometry, materials, and sounds are generated procedurally with THREE.js and the
Web Audio API.

## Technical Details
- Built with THREE.js (r128, via CDN). `src/OrbitControls.js` is vendored.
- `index.js` is a small Express server; `index.html` hosts the UI (scorecard, controls,
  power meter, announcements); all scene and game code lives in `src/hw6.js`.
- Simplified, hand-written physics in the `animate()` loop — no external physics engine.

## Submission Media
A short gameplay video/GIF (aiming + releasing via the power meter, the ball knocking down
pins, a gutter ball, and the scorecard updating across a strike and a spare) and screenshots
(aiming, a roll in progress, the scorecard) accompany this submission.
