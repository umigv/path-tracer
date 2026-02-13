import { useState, useRef, useCallback, useEffect } from "react";

const GRID_COLOR = "rgba(0, 212, 255, 0.08)";
const MAJOR_GRID_COLOR = "rgba(0, 212, 255, 0.18)";
const PATH_COLOR = "#00d4ff";
const POINT_COLOR = "#fff";
const HOVER_COLOR = "#ff6b35";

const DEFAULT_PX_PER_METER = 120;

function drawGrid(ctx, width, height, pxPerMeter, offset) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;

  const startX = (offset.x % pxPerMeter);
  const startY = (offset.y % pxPerMeter);

  for (let x = startX; x < width; x += pxPerMeter) {
    const meterX = Math.round((x - offset.x) / pxPerMeter);
    const isMajor = meterX % 5 === 0;
    ctx.strokeStyle = isMajor ? MAJOR_GRID_COLOR : GRID_COLOR;
    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = startY; y < height; y += pxPerMeter) {
    const meterY = Math.round((y - offset.y) / pxPerMeter);
    const isMajor = meterY % 5 === 0;
    ctx.strokeStyle = isMajor ? MAJOR_GRID_COLOR : GRID_COLOR;
    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = "rgba(0,212,255,0.35)";
  ctx.lineWidth = 1;
  if (offset.y >= 0 && offset.y <= height) {
    ctx.beginPath(); ctx.moveTo(0, offset.y); ctx.lineTo(width, offset.y); ctx.stroke();
  }
  if (offset.x >= 0 && offset.x <= width) {
    ctx.beginPath(); ctx.moveTo(offset.x, 0); ctx.lineTo(offset.x, height); ctx.stroke();
  }
}

function canvasToMeters(cx, cy, offset, pxPerMeter) {
  return {
    x: parseFloat(((cx - offset.x) / pxPerMeter).toFixed(3)),
    y: parseFloat(((offset.y - cy) / pxPerMeter).toFixed(3)),
  };
}

function metersToCanvas(mx, my, offset, pxPerMeter) {
  return { x: mx * pxPerMeter + offset.x, y: offset.y - my * pxPerMeter };
}

export default function PathDrawer() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [points, setPoints] = useState([]);
  const [hoverPos, setHoverPos] = useState(null);
  const [pxPerMeter, setPxPerMeter] = useState(DEFAULT_PX_PER_METER);
  const [offset, setOffset] = useState({ x: 80, y: 520 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [copied, setCopied] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [closePath, setClosePath] = useState(false);
  const dims = useRef({ width: 800, height: 600 });
  const animRef = useRef();

  const getCanvasSize = () => {
    const c = canvasRef.current;
    if (!c) return { width: 800, height: 600 };
    return { width: c.offsetWidth, height: c.offsetHeight };
  };

  const render = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const { width, height } = dims.current;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    drawGrid(ctx, width, height, pxPerMeter, offset);

    if (points.length === 0 && !hoverPos) return;

    // Draw path
    if (points.length > 1) {
      ctx.strokeStyle = PATH_COLOR;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.shadowBlur = 8;
      ctx.shadowColor = PATH_COLOR;
      ctx.beginPath();
      const p0 = metersToCanvas(points[0].x, points[0].y, offset, pxPerMeter);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < points.length; i++) {
        const p = metersToCanvas(points[i].x, points[i].y, offset, pxPerMeter);
        ctx.lineTo(p.x, p.y);
      }
      if (closePath && points.length > 2) ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Dashed preview line to hover
    if (hoverPos && points.length > 0) {
      const last = metersToCanvas(points[points.length - 1].x, points[points.length - 1].y, offset, pxPerMeter);
      ctx.strokeStyle = "rgba(0,212,255,0.35)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(hoverPos.cx, hoverPos.cy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw points
    points.forEach((p, i) => {
      const cp = metersToCanvas(p.x, p.y, offset, pxPerMeter);
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, i === 0 ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#00ffaa" : POINT_COLOR;
      ctx.shadowBlur = 10;
      ctx.shadowColor = i === 0 ? "#00ffaa" : PATH_COLOR;
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Hover dot
    if (hoverPos) {
      ctx.beginPath();
      ctx.arc(hoverPos.cx, hoverPos.cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = HOVER_COLOR;
      ctx.shadowBlur = 12;
      ctx.shadowColor = HOVER_COLOR;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [points, hoverPos, pxPerMeter, offset, closePath]);

  useEffect(() => {
    const c = overlayRef.current;
    if (!c) return;
    const obs = new ResizeObserver(() => {
      dims.current = { width: c.offsetWidth, height: c.offsetHeight };
    });
    obs.observe(c);
    dims.current = { width: c.offsetWidth, height: c.offsetHeight };
    // Set origin near bottom-left so most of canvas is positive Y
    const h = c.offsetHeight;
    if (h > 0) setOffset({ x: 80, y: h - 60 });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(render);
  }, [render]);

  const getEventPos = (e) => {
    const rect = overlayRef.current.getBoundingClientRect();
    const raw = e.touches ? { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
      : { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (snapToGrid) {
      return {
        cx: Math.round((raw.x - offset.x) / pxPerMeter) * pxPerMeter + offset.x,
        cy: Math.round((raw.y - offset.y) / pxPerMeter) * pxPerMeter + offset.y,
      };
    }
    return { cx: raw.x, cy: raw.y };
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setOffset({ x: panStart.ox + dx, y: panStart.oy + dy });
      return;
    }
    const pos = getEventPos(e);
    setHoverPos(pos);
  };

  const handleClick = (e) => {
    if (isPanning) return;
    const pos = getEventPos(e);
    const m = canvasToMeters(pos.cx, pos.cy, offset, pxPerMeter);
    setPoints(prev => [...prev, m]);
  };

  const handleMouseDown = (e) => {
    if (e.button === 1 || e.altKey) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y });
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleWheel = (e) => {
    e.preventDefault();
    const scale = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = overlayRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setPxPerMeter(prev => {
      const next = Math.max(10, Math.min(300, prev * scale));
      setOffset(o => ({
        x: mx - (mx - o.x) * (next / prev),
        y: my - (my - o.y) * (next / prev),
      }));
      return next;
    });
  };

  const undoLast = () => setPoints(p => p.slice(0, -1));
  const clearAll = () => { setPoints([]); setHoverPos(null); };

  const pointsOutput = closePath && points.length > 2
    ? [...points, points[0]]
    : points;

  const buildRos2Command = (pts) => {
    if (pts.length === 0) return "";
    const posesYaml = pts.map(p =>
      `{header: {stamp: {sec: 0, nanosec: 0}, frame_id: 'map'}, pose: {position: {x: ${p.x.toFixed(3)}, y: ${p.y.toFixed(3)}, z: 0.0}, orientation: {x: 0.0, y: 0.0, z: 0.0, w: 1.0}}}`
    ).join(", ");
    return `ros2 topic pub --once /path nav_msgs/msg/Path "{header: {stamp: {sec: 0, nanosec: 0}, frame_id: 'map'}, poses: [${posesYaml}]}"`;
  };

  const copyToClipboard = () => {
    const str = buildRos2Command(pointsOutput);
    navigator.clipboard.writeText(str);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const totalDistance = points.reduce((acc, p, i) => {
    if (i === 0) return 0;
    const dx = p.x - points[i - 1].x;
    const dy = p.y - points[i - 1].y;
    return acc + Math.sqrt(dx * dx + dy * dy);
  }, 0);

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: "#070b10", color: "#c8e6f0",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #0d1520; }
        ::-webkit-scrollbar-thumb { background: #1a3a4a; border-radius: 3px; }
        .btn { background: transparent; border: 1px solid rgba(0,212,255,0.3); color: #00d4ff;
          padding: 5px 12px; font-family: inherit; font-size: 11px; cursor: pointer;
          letter-spacing: 0.08em; transition: all 0.15s; border-radius: 2px; }
        .btn:hover { background: rgba(0,212,255,0.1); border-color: #00d4ff; }
        .btn.danger { border-color: rgba(255,80,80,0.4); color: #ff6060; }
        .btn.danger:hover { background: rgba(255,80,80,0.1); border-color: #ff6060; }
        .btn.active { background: rgba(0,212,255,0.15); border-color: #00d4ff; }
        .toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 11px; user-select: none; }
        .toggle input { display: none; }
        .toggle .pill { width: 28px; height: 15px; border: 1px solid rgba(0,212,255,0.3); border-radius: 8px; position: relative; transition: all 0.2s; background: transparent; }
        .toggle input:checked + .pill { border-color: #00d4ff; background: rgba(0,212,255,0.15); }
        .toggle .pill::after { content:''; position:absolute; top:2px; left:2px; width:9px; height:9px; border-radius:50%; background: rgba(0,212,255,0.4); transition: all 0.2s; }
        .toggle input:checked + .pill::after { left:15px; background: #00d4ff; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(0,212,255,0.12)", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#00d4ff", letterSpacing: "0.15em", marginRight: 8 }}>
          PATH · TRACER
        </div>
        <div style={{ fontSize: 10, color: "rgba(0,212,255,0.5)", letterSpacing: "0.1em" }}>
          CLICK TO PLACE POINTS · ALT+DRAG OR MIDDLE-DRAG TO PAN · SCROLL TO ZOOM
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="toggle">
            <input type="checkbox" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} />
            <div className="pill" />
            SNAP
          </label>
          <label className="toggle">
            <input type="checkbox" checked={closePath} onChange={e => setClosePath(e.target.checked)} />
            <div className="pill" />
            CLOSE
          </label>
          <button className="btn" onClick={undoLast} disabled={points.length === 0}>UNDO</button>
          <button className="btn danger" onClick={clearAll}>CLEAR</button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Canvas */}
        <div style={{ flex: 1, position: "relative" }}>
          <canvas ref={overlayRef} style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            cursor: isPanning ? "grabbing" : "crosshair",
          }}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setHoverPos(null)}
            onWheel={handleWheel}
          />

          {/* Scale bar */}
          <div style={{ position: "absolute", bottom: 16, left: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <div style={{ width: pxPerMeter, height: 4, background: "linear-gradient(90deg, #00d4ff, rgba(0,212,255,0.5))", borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 9, color: "rgba(0,212,255,0.6)", letterSpacing: "0.1em" }}>
              ←{Math.round(pxPerMeter)}px = 1 METER→
            </div>
          </div>

          {/* Hover coords */}
          {hoverPos && (
            <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(7,11,16,0.85)", border: "1px solid rgba(0,212,255,0.2)", padding: "4px 10px", fontSize: 10, color: "rgba(0,212,255,0.8)", borderRadius: 2 }}>
              {(() => { const m = canvasToMeters(hoverPos.cx, hoverPos.cy, offset, pxPerMeter); return `${m.x.toFixed(2)}m, ${m.y.toFixed(2)}m`; })()}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: 260, borderLeft: "1px solid rgba(0,212,255,0.1)", display: "flex", flexDirection: "column", background: "#080d13" }}>
          {/* Stats */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(0,212,255,0.1)", display: "flex", gap: 16 }}>
            <div>
              <div style={{ fontSize: 9, color: "rgba(0,212,255,0.45)", letterSpacing: "0.1em", marginBottom: 2 }}>POINTS</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#00d4ff" }}>{points.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "rgba(0,212,255,0.45)", letterSpacing: "0.1em", marginBottom: 2 }}>LENGTH</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#00d4ff" }}>{totalDistance.toFixed(2)}<span style={{ fontSize: 11 }}>m</span></div>
            </div>
          </div>

          {/* Point list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {points.length === 0 ? (
              <div style={{ padding: "24px 14px", fontSize: 10, color: "rgba(0,212,255,0.25)", textAlign: "center", lineHeight: 1.8 }}>
                Click on the canvas<br />to place points
              </div>
            ) : points.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "4px 14px", gap: 8, borderBottom: "1px solid rgba(0,212,255,0.04)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: i === 0 ? "#00ffaa" : "rgba(0,212,255,0.6)", flexShrink: 0 }} />
                <div style={{ fontSize: 10, color: "rgba(0,212,255,0.7)", flex: 1 }}>
                  <span style={{ color: "rgba(0,212,255,0.35)" }}>{String(i).padStart(2, "0")} </span>
                  {p.x.toFixed(3)}, {p.y.toFixed(3)}
                </div>
                <button style={{ background: "none", border: "none", color: "rgba(255,80,80,0.4)", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1 }}
                  onClick={() => setPoints(pts => pts.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>

          {/* Output */}
          <div style={{ borderTop: "1px solid rgba(0,212,255,0.1)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 9, color: "rgba(0,212,255,0.45)", letterSpacing: "0.1em" }}>ROS2 PUBLISH CMD</div>
              <button className={`btn ${copied ? "active" : ""}`} onClick={copyToClipboard} disabled={points.length === 0}>
                {copied ? "COPIED ✓" : "COPY"}
              </button>
            </div>
            <div style={{ background: "#040709", border: "1px solid rgba(0,212,255,0.1)", borderRadius: 2, padding: "8px 10px", maxHeight: 180, overflowY: "auto" }}>
              <pre style={{ margin: 0, fontSize: 9, color: "rgba(0,212,255,0.65)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {points.length === 0
                  ? <span style={{ color: "rgba(0,212,255,0.25)" }}>No points placed yet</span>
                  : (() => {
                      const cmd = buildRos2Command(pointsOutput);
                      // Pretty-print: break at poses array for readability
                      return cmd
                        .replace('", poses: [', '",\n  poses: [\n    ')
                        .replace(/\}, \{header/g, '},\n    {header')
                        .replace(']}"', '\n  ]}"');
                    })()
                }
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}