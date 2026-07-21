import React, { useState, useEffect } from 'react';
import './DriveHUD.css';

export default function DriveHUD({
  speed = 0,
  rpm = 800,
  rpmRatio = 0,
  gear = 'P',
  driveMode = 'magic',
  engineOn = false,
  headlights = false,
  highBeam = false,
  hazards = false,
  braking = false,
  cruise = false,
  cameraView = 'cinematic',
  odometer = 1190,
  onToggleEngine,
  onAccelerate,
  onBrake,
  onSteerLeft,
  onSteerRight,
  onSteerRelease,
  onHorn,
  onToggleHeadlights,
  onToggleHighBeam,
  onToggleHazards,
  onToggleCruise,
  onSetDriveMode,
  onSetCamera,
}) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Speedometer mapping
  // Gauge arc goes from -120deg to +120deg (240 deg span)
  const maxSpeed = 260;
  const currentSpeed = Math.max(0, Math.min(speed, maxSpeed));
  const speedAngle = -120 + (currentSpeed / maxSpeed) * 240;

  // Power reserve goes from 100% at 0 RPM to 0% at max RPM
  const powerReserve = Math.max(0, Math.min(100, (1 - rpmRatio) * 100));

  const formatTime = (d) => {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const driveModes = [
    { id: 'magic', label: 'Magic Carpet' },
    { id: 'comfort', label: 'Comfort' },
    { id: 'sport', label: 'Sport' },
    { id: 'individual', label: 'Individual' },
  ];

  const cameraViews = [
    { id: 'cinematic', label: 'Cinematic' },
    { id: 'front', label: 'Front' },
    { id: 'side', label: 'Side' },
    { id: 'rear', label: 'Rear' },
    { id: 'driver', label: 'Driver' },
  ];

  return (
    <div className="drive-hud-container">
      {/* Status Bar */}
      <div className="hud-panel hud-status-bar">
        <div className={`status-icon ${engineOn ? 'engine-on' : ''}`}>
          <span className="dot" style={{width: 8, height: 8, borderRadius: '50%', background: engineOn ? '#4ade80' : '#ef4444'}}></span>
          ENG
        </div>
        <div className={`status-icon ${headlights ? 'active' : ''}`} onClick={onToggleHeadlights} style={{cursor: 'pointer'}}>
          ED
        </div>
        <div className={`status-icon ${highBeam ? 'active' : ''}`} onClick={onToggleHighBeam} style={{cursor: 'pointer'}}>
          ≡D
        </div>
        <div className={`status-icon ${hazards ? 'flashing' : ''}`} onClick={onToggleHazards} style={{cursor: 'pointer'}}>
          ▲
        </div>
        <div className={`status-icon ${cruise ? 'active' : ''}`} onClick={onToggleCruise} style={{cursor: 'pointer'}}>
          CRUISE
        </div>
        <div className="status-icon">
          Fuel: 98%
        </div>
        <div className="status-icon">
          Range: 580 km
        </div>
      </div>

      {/* Drive Mode Selector */}
      <div className="hud-panel hud-drive-modes">
        {driveModes.map(mode => (
          <button 
            key={mode.id}
            className={`mode-btn ${driveMode === mode.id ? 'active' : ''}`}
            onClick={() => onSetDriveMode?.(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Camera Selector */}
      <div className="hud-panel hud-cameras">
        {cameraViews.map(cam => (
          <button 
            key={cam.id}
            className={`cam-btn ${cameraView === cam.id ? 'active' : ''}`}
            onClick={() => onSetCamera?.(cam.id)}
          >
            {cam.label}
          </button>
        ))}
      </div>

      {/* Engine Start Button */}
      <button 
        className={`engine-start-btn ${!engineOn ? 'pulsing' : ''}`}
        onClick={onToggleEngine}
      >
        {engineOn ? 'STOP' : 'START'}
      </button>

      {/* Instrument Cluster */}
      <div className="hud-panel hud-cluster">
        
        {/* Left: Speedometer */}
        <div className="gauge-left">
          <svg className="speed-svg" viewBox="0 0 100 100">
            {/* Background arc */}
            <path 
              d="M 20 80 A 45 45 0 1 1 80 80" 
              fill="none" 
              stroke="rgba(255,255,255,0.1)" 
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Colored arc (using pathLength to normalize dasharray to 100) */}
            <path 
              d="M 20 80 A 45 45 0 1 1 80 80" 
              fill="none" 
              stroke="url(#speed-grad)" 
              strokeWidth="2"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={100 - (currentSpeed / maxSpeed * 100)}
              style={{ transition: 'stroke-dashoffset 0.15s ease-out' }}
            />
            <defs>
              <linearGradient id="speed-grad" x1="0%" y1="100%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--warm, #d8c29c)" />
                <stop offset="70%" stopColor="var(--paper, #f1eee6)" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>
          </svg>
          
          <div className="speed-needle-container" style={{ transform: `rotate(${speedAngle}deg)` }}>
            <div className="speed-needle" />
          </div>

          <div className="speed-digital">
            <div className={`speed-number ${braking ? 'braking' : ''}`}>
              {Math.round(currentSpeed)}
            </div>
            <div className="speed-label">km/h</div>
          </div>
        </div>

        {/* Center: Info */}
        <div className="cluster-center">
          <div className="gear-display">{gear}</div>
          <div className="drive-mode-display">{driveModes.find(m => m.id === driveMode)?.label || 'Magic Carpet'}</div>
          <div className="info-row">
            <span>{odometer.toLocaleString()} km</span>
            <span>|</span>
            <span>18°C</span>
            <span>|</span>
            <span>{formatTime(time)}</span>
          </div>
        </div>

        {/* Right: Power Reserve */}
        <div className="gauge-right">
          <div className="power-reserve-title">Power Reserve</div>
          <div className="power-bar-bg">
            <div 
              className="power-bar-fill" 
              style={{ height: `${powerReserve}%` }}
            />
          </div>
          <div className="power-value">{Math.round(powerReserve)}%</div>
        </div>

      </div>

      {/* On-Screen Controls */}
      <div className="hud-controls-left">
        <button 
          className="control-btn" 
          onPointerDown={() => onSteerLeft?.()} 
          onPointerUp={() => onSteerRelease?.()}
          onPointerLeave={() => onSteerRelease?.()}
        >←</button>
        <button 
          className="control-btn" 
          onPointerDown={() => onSteerRight?.()} 
          onPointerUp={() => onSteerRelease?.()}
          onPointerLeave={() => onSteerRelease?.()}
        >→</button>
      </div>

      <div className="hud-controls-right">
        <button 
          className="control-btn" 
          onPointerDown={() => onBrake?.(true)} 
          onPointerUp={() => onBrake?.(false)}
          onPointerLeave={() => onBrake?.(false)}
        >▼</button>
        <button 
          className="control-btn" 
          onPointerDown={() => onAccelerate?.(true)} 
          onPointerUp={() => onAccelerate?.(false)}
          onPointerLeave={() => onAccelerate?.(false)}
        >▲</button>
        <button 
          className="control-btn" 
          onClick={() => onHorn?.()} 
          style={{ fontSize: '0.8rem' }}
        >📣</button>
      </div>

    </div>
  );
}
