import { useState, useRef, useCallback, useEffect } from "react";

const PATH_COLOR = "#00d4ff";
const GRID_COLOR = "rgba(0,212,255,0.07)";
const MAJOR_GRID_COLOR = "rgba(0,212,255,0.18)";
const HOVER_COLOR = "#ff6b35";
const DEFAULT_SCALE = 120; // px per meter

function parseRos2Command(cmd) {
  const matches = [...cmd.matchAll(/position:\s*\{x:\s*([-\d.]+),\s*y:\s*([-\d.]+)/g)];
  if (!matches.length) return null;
  return matches.map(m => ({ x: parseFloat(m[1]), y: parseFloat(m[2]) }));
}

function buildRos2Command(pts) {
  if (!pts.length) return "";
  const poses = pts.map(p =>
    `{header: {stamp: {sec: 0, nanosec: 0}, frame_id: 'map'}, pose: {position: {x: ${p.x.toFixed(3)}, y: ${p.y.toFixed(3)}, z: 0.0}, orientation: {x: 0.0, y: 0.0, z: 0.0, w: 1.0}}}`
  ).join(", ");
  return `ros2 topic pub --once /path nav_msgs/msg/Path "{header: {stamp: {sec: 0, nanosec: 0}, frame_id: 'map'}, poses: [${poses}]}"`;
}

export default function App() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const stateRef = useRef({ points: [], hoverPos: null, scale: DEFAULT_SCALE, offset: { x: 80, y: 500 }, closePath: false, snapToGrid: false });
  const animRef = useRef(null);
  const panRef = useRef(null);

  const [points, setPoints] = useState([]);
  const [hoverCoords, setHoverCoords] = useState(null);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [offset, setOffset] = useState({ x: 80, y: 500 });
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [closePath, setClosePath] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");

  // Keep stateRef in sync so render loop always has latest values
  useEffect(() => { stateRef.current.points = points; }, [points]);
  useEffect(() => { stateRef.current.scale = scale; }, [scale]);
  useEffect(() => { stateRef.current.offset = offset; }, [offset]);
  useEffect(() => { stateRef.current.closePath = closePath; }, [closePath]);
  useEffect(() => { stateRef.current.snapToGrid = snapToGrid; }, [snapToGrid]);

  // Canvas render loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    if (!W || !H) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const { points, hoverPos, scale, offset, closePath } = stateRef.current;

    // Grid
    const sx = ((offset.x % scale) + scale) % scale;
    const sy = ((offset.y % scale) + scale) % scale;
    for (let x = sx; x < W; x += scale) {
      const m = Math.round((x - offset.x) / scale);
      ctx.strokeStyle = m % 5 === 0 ? MAJOR_GRID_COLOR : GRID_COLOR;
      ctx.lineWidth = m % 5 === 0 ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = sy; y < H; y += scale) {
      const m = Math.round((y - offset.y) / scale);
      ctx.strokeStyle = m % 5 === 0 ? MAJOR_GRID_COLOR : GRID_COLOR;
      ctx.lineWidth = m % 5 === 0 ? 1 : 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // Axes
    ctx.strokeStyle = "rgba(0,212,255,0.3)";
    ctx.lineWidth = 1;
    if (offset.y >= 0 && offset.y <= H) { ctx.beginPath(); ctx.moveTo(0, offset.y); ctx.lineTo(W, offset.y); ctx.stroke(); }
    if (offset.x >= 0 && offset.x <= W) { ctx.beginPath(); ctx.moveTo(offset.x, 0); ctx.lineTo(offset.x, H); ctx.stroke(); }

    if (!points.length && !hoverPos) return;

    const toCanvas = (mx, my) => ({ x: mx * scale + offset.x, y: offset.y - my * scale });

    // Path
    if (points.length > 1) {
      ctx.strokeStyle = PATH_COLOR;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.shadowBlur = 10; ctx.shadowColor = PATH_COLOR;
      ctx.beginPath();
      const { x, y } = toCanvas(points[0].x, points[0].y);
      ctx.moveTo(x, y);
      for (let i = 1; i < points.length; i++) {
        const c = toCanvas(points[i].x, points[i].y);
        ctx.lineTo(c.x, c.y);
      }
      if (closePath && points.length > 2) ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Preview line to cursor
    if (hoverPos && points.length > 0) {
      const last = toCanvas(points[points.length - 1].x, points[points.length - 1].y);
      ctx.strokeStyle = "rgba(0,212,255,0.3)";
      ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(hoverPos.cx, hoverPos.cy);
      ctx.stroke(); ctx.setLineDash([]);
    }

    // Points
    points.forEach((p, i) => {
      const { x, y } = toCanvas(p.x, p.y);
      ctx.beginPath(); ctx.arc(x, y, i === 0 ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#00ffaa" : "#fff";
      ctx.shadowBlur = 10; ctx.shadowColor = i === 0 ? "#00ffaa" : PATH_COLOR;
      ctx.fill(); ctx.shadowBlur = 0;
    });

    // Cursor dot
    if (hoverPos) {
      ctx.beginPath(); ctx.arc(hoverPos.cx, hoverPos.cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = HOVER_COLOR; ctx.shadowBlur = 12; ctx.shadowColor = HOVER_COLOR;
      ctx.fill(); ctx.shadowBlur = 0;
    }
  }, []);

  // Trigger draw whenever state changes
  useEffect(() => {
    stateRef.current.hoverPos = hoverCoords ? { cx: hoverCoords.cx, cy: hoverCoords.cy } : null;
    cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(draw);
  }, [points, hoverCoords, scale, offset, closePath, draw]);

  // Canvas resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const obs = new ResizeObserver(() => {
      const h = canvas.offsetHeight;
      if (h > 0) {
        const newOff = { x: 80, y: Math.round(h * 0.88) };
        setOffset(newOff);
        stateRef.current.offset = newOff;
      }
      cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(draw);
    });
    obs.observe(canvas);
    return () => obs.disconnect();
  }, [draw]);

  // Global wheel → zoom (no scrollbars stealing it)
  useEffect(() => {
    const handler = (e) => {
      if (showImport) return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setScale(prev => {
        const next = Math.max(15, Math.min(400, prev * factor));
        setOffset(o => ({
          x: mx - (mx - o.x) * (next / prev),
          y: my - (my - o.y) * (next / prev),
        }));
        return next;
      });
    };
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, [showImport]);

  const toMeters = useCallback((cx, cy) => {
    const { scale, offset } = stateRef.current;
    return {
      x: parseFloat(((cx - offset.x) / scale).toFixed(3)),
      y: parseFloat(((offset.y - cy) / scale).toFixed(3)),
    };
  }, []);

  const snapCanvasPos = useCallback((rawX, rawY) => {
    const { scale, offset, snapToGrid } = stateRef.current;
    if (!snapToGrid) return { cx: rawX, cy: rawY };
    return {
      cx: Math.round((rawX - offset.x) / scale) * scale + offset.x,
      cy: Math.round((rawY - offset.y) / scale) * scale + offset.y,
    };
  }, []);

  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return snapCanvasPos(e.clientX - rect.left, e.clientY - rect.top);
  }, [snapCanvasPos]);

  const didPanRef = useRef(false);

  const handleMouseMove = useCallback((e) => {
    if (panRef.current) {
      const { startX, startY, ox, oy } = panRef.current;
      setOffset({ x: ox + e.clientX - startX, y: oy + e.clientY - startY });
      didPanRef.current = true;
      return;
    }
    const pos = getPos(e);
    setHoverCoords({ cx: pos.cx, cy: pos.cy, ...toMeters(pos.cx, pos.cy) });
  }, [getPos, toMeters]);

  const handleClick = useCallback((e) => {
    if (didPanRef.current) { didPanRef.current = false; return; }
    const pos = getPos(e);
    setPoints(prev => [...prev, toMeters(pos.cx, pos.cy)]);
  }, [getPos, toMeters]);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || e.altKey) {
      e.preventDefault();
      didPanRef.current = false;
      panRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    }
  }, [offset]);

  const handleMouseUp = useCallback(() => { panRef.current = null; }, []);

  const undoLast = () => setPoints(p => p.slice(0, -1));
  const clearAll = () => { setPoints([]); setHoverCoords(null); };

  const pointsOutput = closePath && points.length > 2 ? [...points, points[0]] : points;
  const cmd = buildRos2Command(pointsOutput);
  const PREVIEW = 300;

  const handleCopy = () => {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleImport = () => {
    setImportError("");
    const parsed = parseRos2Command(importText);
    if (!parsed || !parsed.length) {
      setImportError("No poses found — make sure it's a valid nav_msgs/msg/Path command.");
      return;
    }
    setPoints(parsed);
    setImportText(""); setShowImport(false);
  };

  const totalDist = points.reduce((acc, p, i) => {
    if (i === 0) return 0;
    const dx = p.x - points[i - 1].x, dy = p.y - points[i - 1].y;
    return acc + Math.sqrt(dx * dx + dy * dy);
  }, 0);

  const FONT = "'IBM Plex Mono', 'Courier New', monospace";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#070b10", color: "#c8e6f0", fontFamily: FONT, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        .tb { background: transparent; border: 1px solid rgba(0,212,255,0.3); color: #00d4ff; padding: 4px 11px; font-family: ${FONT}; font-size: 11px; cursor: pointer; letter-spacing: 0.08em; transition: background 0.13s, border-color 0.13s; border-radius: 2px; }
        .tb:hover { background: rgba(0,212,255,0.1); border-color: #00d4ff; }
        .tb:disabled { opacity: 0.28; cursor: default; pointer-events: none; }
        .tb.on { background: rgba(0,212,255,0.15); border-color: #00d4ff; }
        .tb.red { border-color: rgba(255,80,80,0.4); color: #ff6060; }
        .tb.red:hover { background: rgba(255,80,80,0.1); border-color: #ff6060; }
        .tb.grn { border-color: rgba(0,255,170,0.35); color: #00ffaa; }
        .tb.grn:hover { background: rgba(0,255,170,0.08); border-color: #00ffaa; }
        .tog { display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 11px; user-select: none; }
        .tog input { display: none; }
        .pill { width: 26px; height: 14px; border: 1px solid rgba(0,212,255,0.3); border-radius: 7px; position: relative; background: transparent; transition: all 0.18s; }
        .tog input:checked ~ .pill { border-color: #00d4ff; background: rgba(0,212,255,0.15); }
        .pill::after { content: ''; position: absolute; top: 2px; left: 2px; width: 8px; height: 8px; border-radius: 50%; background: rgba(0,212,255,0.4); transition: all 0.18s; }
        .tog input:checked ~ .pill::after { left: 14px; background: #00d4ff; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "9px 16px", borderBottom: "1px solid rgba(0,212,255,0.12)", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#00d4ff", letterSpacing: "0.15em" }}>PATH · TRACER</span>
        <span style={{ fontSize: 10, color: "rgba(0,212,255,0.4)", letterSpacing: "0.07em" }}>CLICK TO PLACE · ALT/MIDDLE-DRAG TO PAN · SCROLL TO ZOOM</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <label className="tog">
            <input type="checkbox" checked={snapToGrid} onChange={e => setSnapToGrid(e.target.checked)} />
            <div className="pill" /> SNAP
          </label>
          <label className="tog">
            <input type="checkbox" checked={closePath} onChange={e => setClosePath(e.target.checked)} />
            <div className="pill" /> CLOSE
          </label>
          <button className="tb grn" onClick={() => { setShowImport(true); setImportError(""); }}>IMPORT</button>
          <button className="tb" onClick={undoLast} disabled={!points.length}>UNDO</button>
          <button className="tb red" onClick={clearAll}>CLEAR</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* Canvas area */}
        <div ref={containerRef} style={{ flex: 1, position: "relative" }}>
          <canvas
            ref={canvasRef}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: panRef.current ? "grabbing" : "crosshair", display: "block" }}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setHoverCoords(null)}
          />
          {/* Scale bar */}
          <div style={{ position: "absolute", bottom: 14, left: 14, pointerEvents: "none" }}>
            <div style={{ width: scale, height: 3, background: "linear-gradient(90deg,#00d4ff,rgba(0,212,255,0.35))", borderRadius: 2, marginBottom: 5 }} />
            <div style={{ fontSize: 9, color: "rgba(0,212,255,0.55)", letterSpacing: "0.1em" }}>← {Math.round(scale)}px = 1m →</div>
          </div>
          {/* Cursor coords overlay */}
          {hoverCoords && (
            <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(4,7,9,0.9)", border: "1px solid rgba(0,212,255,0.18)", padding: "3px 9px", fontSize: 10, color: "rgba(0,212,255,0.8)", borderRadius: 2, pointerEvents: "none" }}>
              {hoverCoords.x.toFixed(2)}m, {hoverCoords.y.toFixed(2)}m
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: 260, borderLeft: "1px solid rgba(0,212,255,0.1)", display: "flex", flexDirection: "column", background: "#080d13", overflow: "hidden" }}>

          {/* Stats */}
          <div style={{ padding: "11px 14px", borderBottom: "1px solid rgba(0,212,255,0.1)", display: "flex", gap: 20, flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 9, color: "rgba(0,212,255,0.38)", letterSpacing: "0.1em", marginBottom: 2 }}>POINTS</div>
              <div style={{ fontSize: 21, fontWeight: 600, color: "#00d4ff" }}>{points.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: "rgba(0,212,255,0.38)", letterSpacing: "0.1em", marginBottom: 2 }}>LENGTH</div>
              <div style={{ fontSize: 21, fontWeight: 600, color: "#00d4ff" }}>{totalDist.toFixed(2)}<span style={{ fontSize: 11 }}>m</span></div>
            </div>
          </div>

          {/* Point list (no scroll — clips) */}
          <div style={{ flex: 1, overflow: "hidden", padding: "6px 0" }}>
            {!points.length ? (
              <div style={{ padding: "28px 14px", fontSize: 10, color: "rgba(0,212,255,0.18)", textAlign: "center", lineHeight: 2 }}>
                Click on the canvas<br />to place points
              </div>
            ) : (
              <>
                {points.length > 18 && (
                  <div style={{ padding: "3px 14px 5px", fontSize: 9, color: "rgba(0,212,255,0.28)" }}>
                    … {points.length - 18} earlier points
                  </div>
                )}
                {points.slice(-18).map((p, ii) => {
                  const i = Math.max(0, points.length - 18) + ii;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "3px 14px", gap: 7, borderBottom: "1px solid rgba(0,212,255,0.04)" }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: i === 0 ? "#00ffaa" : "rgba(0,212,255,0.5)", flexShrink: 0 }} />
                      <div style={{ fontSize: 10, color: "rgba(0,212,255,0.7)", flex: 1 }}>
                        <span style={{ color: "rgba(0,212,255,0.28)" }}>{String(i).padStart(2, "0")} </span>
                        {p.x.toFixed(3)}, {p.y.toFixed(3)}
                      </div>
                      <button style={{ background: "none", border: "none", color: "rgba(255,80,80,0.38)", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }}
                        onClick={() => setPoints(pts => pts.filter((_, j) => j !== i))}>×</button>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* ROS2 command output */}
          <div style={{ borderTop: "1px solid rgba(0,212,255,0.1)", padding: "10px 14px", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <div style={{ fontSize: 9, color: "rgba(0,212,255,0.38)", letterSpacing: "0.1em" }}>ROS2 PUBLISH CMD</div>
              <button className={`tb${copied ? " on" : ""}`} onClick={handleCopy} disabled={!points.length}>
                {copied ? "COPIED ✓" : "COPY"}
              </button>
            </div>
            <div style={{ background: "#040709", border: "1px solid rgba(0,212,255,0.1)", borderRadius: 2, padding: "8px 10px" }}>
              <pre style={{ margin: 0, fontSize: 9, color: "rgba(0,212,255,0.52)", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-all", overflow: "hidden", maxHeight: 90 }}>
                {!points.length
                  ? <span style={{ color: "rgba(0,212,255,0.18)" }}>No points placed yet</span>
                  : cmd.length > PREVIEW
                    ? cmd.slice(0, PREVIEW) + `\n… (+${pointsOutput.length} poses total)`
                    : cmd
                }
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div
          onClick={e => e.target === e.currentTarget && setShowImport(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
        >
          <div style={{ background: "#0d1520", border: "1px solid rgba(0,212,255,0.22)", borderRadius: 4, padding: 22, width: 540, maxWidth: "92vw", display: "flex", flexDirection: "column", gap: 12, fontFamily: FONT }}>
            <div style={{ fontSize: 12, color: "#00ffaa", letterSpacing: "0.12em", fontWeight: 600 }}>IMPORT ROS2 PATH</div>
            <div style={{ fontSize: 10, color: "rgba(0,212,255,0.42)", lineHeight: 1.7 }}>
              Paste a <code style={{ color: "rgba(0,212,255,0.72)" }}>nav_msgs/msg/Path</code> publish command. Poses will be loaded as path points.
            </div>
            <textarea
              autoFocus
              value={importText}
              onChange={e => { setImportText(e.target.value); setImportError(""); }}
              placeholder={`ros2 topic pub --once /path nav_msgs/msg/Path "{...}"`}
              style={{
                background: "#040709",
                border: `1px solid ${importError ? "rgba(255,80,80,0.45)" : "rgba(0,212,255,0.18)"}`,
                color: "rgba(0,212,255,0.78)", fontFamily: FONT, fontSize: 10,
                padding: 10, borderRadius: 2, resize: "vertical", minHeight: 110,
                outline: "none", lineHeight: 1.6
              }}
            />
            {importError && <div style={{ fontSize: 10, color: "#ff6060" }}>⚠ {importError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="tb" onClick={() => { setShowImport(false); setImportText(""); setImportError(""); }}>CANCEL</button>
              <button className="tb grn" onClick={handleImport} disabled={!importText.trim()}>LOAD PATH</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}