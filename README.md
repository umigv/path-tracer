# Path Tracer

A browser-based path drawing tool that exports directly to ROS 2 `nav_msgs/Path` publish commands.

Draw a path on a metric grid, copy the generated `ros2 topic pub` command, and paste it straight into your terminal.

### AI Disclosure
This project was entirely generated with Claude Sonnet 4.5. It was validated by hand.

---

## Features

- **Metric grid** — 1 meter scale with major gridlines every 5 meters
- **Standard coordinates** — +Y is up, matching ROS 2 / REP-103 conventions
- **Live preview** — dashed line shows the next segment before you commit
- **Snap to grid** — toggle integer-meter snapping
- **Close path** — automatically appends the first point to close the loop
- **Import** — paste an existing `nav_msgs/Path` command to reload a path
- **ROS 2 output** — one-click copy of a ready-to-run `ros2 topic pub` command

---

## Usage

### Drawing

| Action | Input |
|---|---|
| Place point | Left click |
| Pan | Alt + drag or middle-click drag |
| Zoom | Scroll wheel |
| Undo last point | `UNDO` button |
| Clear all | `CLEAR` button |

### Exporting

Once your path is drawn, click **COPY** in the sidebar to copy a command like:

```bash
ros2 topic pub --once /path nav_msgs/msg/Path "{header: {stamp: {sec: 0, nanosec: 0}, frame_id: 'map'}, poses: [{header: {...}, pose: {position: {x: 1.000, y: 2.000, z: 0.0}, orientation: {x: 0.0, y: 0.0, z: 0.0, w: 1.0}}}, ...]}"
```

Paste it into any terminal with ROS 2 sourced to publish the path to `/path`.

### Importing

Click **IMPORT**, paste a previously exported command, and click **LOAD PATH** to restore the path onto the canvas.

---

## Getting Started

```bash
npm install
npm run dev
```

Requires Node.js 18+ and a ROS 2 Humble environment for the output commands.

---

## Coordinate System

The canvas uses a standard right-handed 2D coordinate system:

- **+X** → right
- **+Y** → up
- **Origin (0, 0)** at the crosshair (bottom-left of the default view)

All coordinates are in **meters**. The `frame_id` defaults to `map`.

---

## Output Format

Each pose is published with:
- `position.z = 0.0`
- `orientation = (0, 0, 0, 1)` (identity — no rotation)

To change the topic name or frame, edit `buildRos2Command` in `src/App.jsx`.