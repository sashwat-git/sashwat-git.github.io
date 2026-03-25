(function () {
  /* ── Setup ── */
  const canvas = document.getElementById('globe-canvas');
  const display = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(display.clientWidth, display.clientHeight);
  renderer.powerPreference = 'high-performance';

  /* ── Responsive camera distance ── */
  function getResponsiveZoom() {
    const w = display.clientWidth;
    if (w < 480) return 3.62;     // phones
    if (w < 768) return 3.24;     // tablets
    if (w < 1200) return 2.89;    // laptops
    if (w < 1920) return 2.72;    // desktops
    return 2.54;                   // large TVs
  }

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, display.clientWidth / display.clientHeight, 0.1, 1000);
  camera.position.z = getResponsiveZoom();

  /* ── 30% left margin — shift globe to the right ── */
  function applyGlobeOffset() {
    const w = display.clientWidth, h = display.clientHeight;
    camera.setViewOffset(w, h, -w * 0.15, 0, w, h);
  }
  applyGlobeOffset();

  /* ── Mouse scroll zoom ── */
  const minZoom = 1.20;
  const maxZoom = getResponsiveZoom(); // default size = max zoom out
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.position.z += e.deltaY * 0.002;
    camera.position.z = Math.max(minZoom, Math.min(maxZoom, camera.position.z));
  }, { passive: false });

  /* ── Globe sphere (dark base) ── */
  const globeGeo = new THREE.SphereGeometry(1, 64, 64);
  const globeMat = new THREE.MeshPhongMaterial({
    color: 0x062a52,
    emissive: 0x041428,
    shininess: 15,
    transparent: true,
    opacity: 0.92
  });
  const globeMesh = new THREE.Mesh(globeGeo, globeMat);
  scene.add(globeMesh);

  /* ── Atmosphere glow ── */
  const atmosGeo = new THREE.SphereGeometry(1.14, 64, 64);
  const atmosMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.65 - dot(vNormal, vec3(0,0,1)), 2.0);
        gl_FragColor = vec4(0.24, 0.56, 1.0, 1.0) * intensity * 0.84;
      }`,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true
  });
  scene.add(new THREE.Mesh(atmosGeo, atmosMat));

  /* ── Lighting ── */
  scene.add(new THREE.AmbientLight(0x335577, 0.6));
  const dirLight = new THREE.DirectionalLight(0x88bbff, 0.8);
  dirLight.position.set(5, 3, 5);
  scene.add(dirLight);

  /* ── Orbit rings ── */
  const orbitConfigs = [
    { radius: 1.25, tiltX: 0.3,  tiltZ: 0.2,  speed: 0.4,  opacity: 0.18 },
    { radius: 1.35, tiltX: -0.5, tiltZ: -0.3, speed: -0.25, opacity: 0.12 },
    { radius: 1.45, tiltX: 0.8,  tiltZ: 0.5,  speed: 0.15,  opacity: 0.09 },
  ];
  const orbits = orbitConfigs.map(cfg => {
    const curve = new THREE.EllipseCurve(0, 0, cfg.radius, cfg.radius, 0, Math.PI * 2, false, 0);
    const pts = curve.getPoints(180);
    const geo = new THREE.BufferGeometry().setFromPoints(
      pts.map(p => new THREE.Vector3(p.x, 0, p.y))
    );
    const mat = new THREE.LineBasicMaterial({
      color: 0x64c8ff,
      transparent: true,
      opacity: cfg.opacity,
      depthWrite: false,
    });
    const ring = new THREE.LineLoop(geo, mat);
    ring.rotation.x = cfg.tiltX;
    ring.rotation.z = cfg.tiltZ;
    ring.userData = { speed: cfg.speed };
    globeMesh.add(ring);
    return ring;
  });

  /* ── Tilt & Animate ── */
  globeMesh.rotation.x = 0.4;
  globeMesh.rotation.y = Math.PI; // Start facing Europe/Africa (Prime Meridian)
  globeMesh.rotation.z = -0.1;

  const arcs = []; // filled when mask loads

  /* ── Mouse drag to rotate ── */
  let isDragging = false;
  let prevMouse = { x: 0, y: 0 };
  let dragVelX = 0, dragVelY = 0;
  let userDragY = 0, userDragX = 0;

  // Mouse events
  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    prevMouse = { x: e.clientX, y: e.clientY };
    dragVelX = 0; dragVelY = 0;
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - prevMouse.x;
    const dy = e.clientY - prevMouse.y;
    userDragY += dx * 0.005;
    userDragX += dy * 0.005;
    dragVelX = dy * 0.005;
    dragVelY = dx * 0.005;
    prevMouse = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
  });

  // Touch events for mobile
  let lastTouchDist = 0;

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dragVelX = 0; dragVelY = 0;
    } else if (e.touches.length === 2) {
      // Pinch zoom start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - prevMouse.x;
      const dy = e.touches[0].clientY - prevMouse.y;
      userDragY += dx * 0.005;
      userDragX += dy * 0.005;
      dragVelX = dy * 0.005;
      dragVelY = dx * 0.005;
      prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDist > 0) {
        const delta = lastTouchDist - dist;
        camera.position.z += delta * 0.008;
        camera.position.z = Math.max(minZoom, Math.min(maxZoom, camera.position.z));
      }
      lastTouchDist = dist;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', () => {
    isDragging = false;
    lastTouchDist = 0;
  }, { passive: true });

  canvas.style.cursor = 'grab';

  function animate() {
    requestAnimationFrame(animate);

    if (!isDragging) {
      // Auto-rotate + inertia decay
      dragVelX *= 0.95;
      dragVelY *= 0.95;
      userDragY += dragVelY;
      userDragX += dragVelX;
      userDragY += 0.002; // auto spin
    }

    globeMesh.rotation.y = Math.PI + userDragY;

    // Gentle vertical oscillation + drag offset, clamped
    const time = performance.now() / 1000;
    const baseX = 0.4 + Math.sin(time * 0.3) * 0.15;
    globeMesh.rotation.x = Math.max(-1.2, Math.min(1.2, baseX + userDragX));

    // Rotate orbit rings independently
    for (const ring of orbits) {
      ring.rotation.y += ring.userData.speed * 0.01;
    }

    const now = time; // seconds
    for (const arc of arcs) {
      const total = arc.totalPts;
      // Full cycle: grow fwd (2s) + pause (1s) + shrink fwd (2s) + pause (0.5s)
      //           + grow rev (2s) + pause (1s) + shrink rev (2s) + pause (0.5s) = 11s
      const cycle = 11;
      const t = ((now + arc.offset) % cycle);

      let head, tail;
      if (t < 2) {
        // Phase 1: line grows start → end
        const p = t / 2;
        head = Math.floor(p * total);
        tail = 0;
      } else if (t < 3) {
        // Phase 2: full line visible, pause
        head = total;
        tail = 0;
      } else if (t < 5) {
        // Phase 3: tail catches up start → end (line shrinks)
        const p = (t - 3) / 2;
        head = total;
        tail = Math.floor(p * total);
      } else if (t < 5.5) {
        // Phase 4: invisible, brief pause
        head = 0;
        tail = 0;
      } else if (t < 7.5) {
        // Phase 5: line grows end → start (reverse)
        const p = (t - 5.5) / 2;
        tail = total - Math.floor(p * total);
        head = total;
      } else if (t < 8.5) {
        // Phase 6: full line visible, pause
        head = total;
        tail = 0;
      } else if (t < 10.5) {
        // Phase 7: head retracts end → start (line shrinks from end)
        const p = (t - 8.5) / 2;
        head = total - Math.floor(p * total);
        tail = 0;
      } else {
        // Phase 8: invisible, brief pause
        head = 0;
        tail = 0;
      }

      const count = Math.max(0, head - tail);
      arc.line.geometry.setDrawRange(tail, count);
    }

    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    const w = display.clientWidth, h = display.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    applyGlobeOffset();
  });

  /* ── Direct bitmap land detection (from landmask-data.js) ── */
  function isLand(lat, lon) {
    const x = ((((-lon + 180) % 360) + 360) % 360) / 360 * LAND_W | 0;
    const y = ((90 - lat) / 180) * LAND_H | 0;
    if (y < 0 || y >= LAND_H) return false;
    const idx = y * LAND_W + x;
    return (LAND_BITMAP[idx >> 3] & (1 << (7 - (idx & 7)))) !== 0;
  }

  /* ── Generate dots on land (responsive count) ── */
  const screenW = display.clientWidth;
  const dotCount = screenW < 480 ? 10000 : screenW < 1200 ? 18000 : 25000;
  const positions = new Float32Array(dotCount * 3);
  const colors = new Float32Array(dotCount * 3);
  let ptIdx = 0;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const R = 1.005;
  const DEG = 180 / Math.PI;
  const invCount = 1 / (dotCount - 1);

  for (let i = 0; i < dotCount; i++) {
    const yy = 1 - i * invCount * 2;
    const rad = Math.sqrt(1 - yy * yy);
    const theta = golden * i;
    const xx = Math.cos(theta) * rad;
    const zz = Math.sin(theta) * rad;

    const lat = Math.asin(yy) * DEG;
    const lon = Math.atan2(zz, xx) * DEG;
    const onLand = isLand(lat, lon);

    if (!onLand && Math.random() > 0.04) continue;

    const j = ptIdx * 3;
    positions[j]     = xx * R;
    positions[j + 1] = yy * R;
    positions[j + 2] = zz * R;

    if (onLand) {
      colors[j]     = 0.15 + Math.random() * 0.1;
      colors[j + 1] = 0.65 + Math.random() * 0.3;
      colors[j + 2] = 0.55 + Math.random() * 0.35;
    } else {
      colors[j]     = 0.06;
      colors[j + 1] = 0.15;
      colors[j + 2] = 0.4;
    }
    ptIdx++;
  }

  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, ptIdx * 3), 3));
  dotGeo.setAttribute('color', new THREE.BufferAttribute(colors.subarray(0, ptIdx * 3), 3));
  const dotSize = screenW < 480 ? 0.022 : screenW < 1200 ? 0.016 : 0.013;
  globeMesh.add(new THREE.Points(dotGeo, new THREE.PointsMaterial({
    size: dotSize,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true
  })));

  /* ── Arcs between cities ── */
  const cities = [
    { lat: 40.7, lon: -74 },    { lat: 51.5, lon: -0.1 },
    { lat: 35.7, lon: 139.7 },  { lat: -33.9, lon: 18.4 },
    { lat: -23.5, lon: -46.6 }, { lat: 28.6, lon: 77.2 },
    { lat: 1.35, lon: 103.8 },  { lat: -33.8, lon: 151.2 },
    { lat: 55.7, lon: 37.6 },   { lat: 37.8, lon: -122.4 },
    { lat: 12.97, lon: 77.59 }, // Bengaluru
  ];

  function llToVec(lat, lon, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const th  = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(th),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(th));
  }

  const arcPairs = [[0,1],[1,8],[1,3],[0,4],[2,6],[5,6],[6,7],[2,9],[0,9],[3,5],[10,1]];
  arcPairs.forEach(([a,b], idx) => {
    const s = llToVec(cities[a].lat, cities[a].lon, 1.005);
    const e = llToVec(cities[b].lat, cities[b].lon, 1.005);
    const m = s.clone().add(e).multiplyScalar(0.5);
    m.normalize().multiplyScalar(1 + s.distanceTo(e) * 0.35);
    const numPts = 80;
    const pts = new THREE.QuadraticBezierCurve3(s, m, e).getPoints(numPts);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    lineGeo.setDrawRange(0, 0);
    const line = new THREE.Line(lineGeo,
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.45 })
    );
    globeMesh.add(line);
    arcs.push({ line, totalPts: numPts + 1, offset: idx * 0.6 });
  });

  /* ── City dots ── */
  const cGeo = new THREE.BufferGeometry();
  const cPos = new Float32Array(cities.length * 3);
  cities.forEach((c, i) => {
    const v = llToVec(c.lat, c.lon, 1.012);
    cPos[i*3] = v.x; cPos[i*3+1] = v.y; cPos[i*3+2] = v.z;
  });
  cGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
  const citySize = screenW < 480 ? 0.06 : 0.045;
  globeMesh.add(new THREE.Points(cGeo, new THREE.PointsMaterial({
    color: 0x80ffdb, size: citySize, transparent: true, opacity: 0.9, sizeAttenuation: true
  })));

  /* ── Subtitle loop – replay every 60 s ── */
  var subtitle = document.querySelector('.display-subtitle');
  var slant2   = document.querySelector('.slant-line-2');
  if (subtitle && slant2) {
    var CYCLE    = 30000;
    var OUT_MS   = 1000;
    var PAUSE_MS = 400;
    setInterval(function () {
      /* Phase 1 – sweep line back, clip-path closes */
      subtitle.style.animation = 'slantRevealOut 1s cubic-bezier(.65,0,.35,1) forwards';
      slant2.style.animation   = 'slantSweep2Out 1s cubic-bezier(.65,0,.35,1) forwards';
      /* Phase 2 – after hide, reset then reveal again */
      setTimeout(function () {
        subtitle.style.animation = 'none';
        slant2.style.animation   = 'none';
        subtitle.style.clipPath  = 'polygon(0 0, 0 0, 0 100%, 0 100%)';
        slant2.style.opacity     = '0';
        slant2.style.transform   = '';
        void subtitle.offsetHeight;
        void slant2.offsetHeight;
        setTimeout(function () {
          subtitle.style.clipPath = '';
          slant2.style.opacity    = '';
          subtitle.style.animation = 'slantReveal 1s cubic-bezier(.65,0,.35,1) forwards';
          slant2.style.animation   = 'slantSweep2 1s cubic-bezier(.65,0,.35,1) forwards';
        }, PAUSE_MS);
      }, OUT_MS);
    }, CYCLE);
  }
})();
