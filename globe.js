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

    if (isZoomedIn) {
      // When zoomed in: no auto-rotate or oscillation, but allow manual drag
      dragVelX *= 0.92;
      dragVelY *= 0.92;
      if (isDragging || Math.abs(dragVelX) > 0.0001 || Math.abs(dragVelY) > 0.0001) {
        userDragY += dragVelY;
        userDragX += dragVelX;
        globeMesh.rotation.y = Math.PI + userDragY;
        globeMesh.rotation.x = Math.max(-1.2, Math.min(1.2, 0.4 + userDragX));
        updateCalloutPosition();
      }
    } else if (!isDragging) {
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
    if (!isZoomedIn) {
      const baseX = 0.4 + Math.sin(time * 0.3) * 0.15;
      globeMesh.rotation.x = Math.max(-1.2, Math.min(1.2, baseX + userDragX));
    }

    // Rotate orbit rings independently
    for (const ring of orbits) {
      if (!isZoomedIn) ring.rotation.y += ring.userData.speed * 0.01;
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

    // Update callout position each frame
    if (selectedCityIdx >= 0) updateCalloutPosition();

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
    { lat: 12.97, lon: 77.59, code: 'BLR', city: 'Bengaluru', airport: 'Kempegowda International Airport', country: 'India' },
    { lat: 44.43, lon: 26.10, code: 'OTP', city: 'Bucharest', airport: 'Henri Coand\u0103 International Airport', country: 'Romania' },
    { lat: 42.70, lon: 23.32, code: 'SOF', city: 'Sofia', airport: 'Sofia International Airport', country: 'Bulgaria' },
    { lat: 46.77, lon: 23.60, code: 'CLJ', city: 'Cluj', airport: 'Avram Iancu Cluj International Airport', country: 'Romania' },
    { lat: 22.20, lon: 113.55, code: 'MFM', city: 'Macau', airport: 'Macau International Airport', country: 'China (Macau SAR)' },
    { lat: 45.50, lon: -73.57, code: 'YUL', city: 'Montreal', airport: 'Montr\u00e9al\u2013Trudeau International Airport', country: 'Canada' },
    { lat: -43.53, lon: 172.64, code: 'CHC', city: 'Christchurch', airport: 'Christchurch International Airport', country: 'New Zealand' },
    { lat: -41.29, lon: 174.78, code: 'WLG', city: 'Wellington', airport: 'Wellington International Airport', country: 'New Zealand' },
    { lat: 31.95, lon: 35.93, code: 'AMM', city: 'Amman', airport: 'Queen Alia International Airport', country: 'Jordan' },
    { lat: -33.92, lon: 18.42, code: 'CPT', city: 'Cape Town', airport: 'Cape Town International Airport', country: 'South Africa' },
    { lat: 41.88, lon: -87.63, code: 'RFD', city: 'Chicago', airport: 'Chicago Rockford International Airport', country: 'United States' },
    { lat: 38.91, lon: -77.04, code: 'BWI', city: 'Washington', airport: 'Baltimore/Washington International Airport', country: 'United States' },
    { lat: 5.56, lon: -0.19, code: 'ACC', city: 'Accra', airport: 'Kotoka International Airport', country: 'Ghana' },
    { lat: 32.78, lon: -96.80, code: 'DFW', city: 'Dallas', airport: 'Dallas/Fort Worth International Airport', country: 'United States' },
    { lat: 43.65, lon: -79.38, code: 'YYZ', city: 'Toronto', airport: 'Toronto Pearson International Airport', country: 'Canada' },
    { lat: 55.60, lon: 13.00, code: 'MMX', city: 'Malm\u00f6', airport: 'Malm\u00f6 Airport', country: 'Sweden' },
    { lat: 49.28, lon: -123.12, code: 'YVR', city: 'Vancouver', airport: 'Vancouver International Airport', country: 'Canada' },
    { lat: -36.85, lon: 174.76, code: 'AKL', city: 'Auckland', airport: 'Auckland International Airport', country: 'New Zealand' },
    { lat: -26.20, lon: 28.04, code: 'JNB', city: 'Johannesburg', airport: 'O. R. Tambo International Airport', country: 'South Africa' },
    { lat: 51.05, lon: -114.07, code: 'YYC', city: 'Calgary', airport: 'Calgary International Airport', country: 'Canada' },
    { lat: 34.06, lon: -117.60, code: 'ONT', city: 'Ontario', airport: 'Ontario International Airport', country: 'United States' },
    { lat: 34.05, lon: -118.24, code: 'LAX', city: 'Los Angeles', airport: 'Los Angeles International Airport', country: 'United States' },
    { lat: 37.77, lon: -122.42, code: 'SFO', city: 'San Francisco', airport: 'San Francisco International Airport', country: 'United States' },
    { lat: -33.96, lon: 25.60, code: 'PLZ', city: 'Port Elizabeth', airport: 'Chief Dawid Stuurman International Airport', country: 'South Africa' },
    { lat: -29.86, lon: 31.02, code: 'DUR', city: 'Durban', airport: 'King Shaka International Airport', country: 'South Africa' },
    { lat: -34.93, lon: 138.60, code: 'ADL', city: 'Adelaide', airport: 'Adelaide International Airport', country: 'Australia' },
    { lat: -31.95, lon: 115.86, code: 'PER', city: 'Perth', airport: 'Perth International Airport', country: 'Australia' },
    { lat: -38.04, lon: 144.47, code: 'AVV', city: 'Avalon', airport: 'Avalon Airport', country: 'Australia' },
    { lat: -28.02, lon: 153.43, code: 'OOL', city: 'Gold Coast', airport: 'Gold Coast Airport', country: 'Australia' },
    { lat: -25.97, lon: 32.57, code: 'MPM', city: 'Maputo', airport: 'Maputo International Airport', country: 'Mozambique' },
    { lat: -37.81, lon: 144.96, code: 'MEL', city: 'Melbourne', airport: 'Melbourne Airport (Tullamarine)', country: 'Australia' },
    { lat: -42.88, lon: 147.33, code: 'HBA', city: 'Hobart', airport: 'Hobart International Airport', country: 'Australia' },
    { lat: 32.65, lon: -16.91, code: 'FNC', city: 'Funchal', airport: 'Cristiano Ronaldo Madeira International Airport', country: 'Portugal' },
    { lat: 38.72, lon: -9.14, code: 'LIS', city: 'Lisbon', airport: 'Humberto Delgado Airport', country: 'Portugal' },
    { lat: 51.51, lon: -0.13, code: 'LHR', city: 'London', airport: 'London Heathrow Airport', country: 'United Kingdom' },
    { lat: 59.91, lon: 10.75, code: 'OSL', city: 'Oslo', airport: 'Oslo Airport, Gardermoen', country: 'Norway' },
    { lat: -16.92, lon: 145.77, code: 'CNS', city: 'Cairns', airport: 'Cairns International Airport', country: 'Australia' },
    { lat: 50.08, lon: 14.44, code: 'PRG', city: 'Prague', airport: 'V\u00e1clav Havel Airport Prague', country: 'Czech Republic' },
    { lat: -12.46, lon: 130.84, code: 'DRW', city: 'Darwin', airport: 'Darwin International Airport', country: 'Australia' },
    { lat: -27.47, lon: 153.03, code: 'BNE', city: 'Brisbane', airport: 'Brisbane Airport', country: 'Australia' },
    { lat: 1.35, lon: 103.82, code: 'SIN', city: 'Singapore', airport: 'Singapore Changi Airport', country: 'Singapore' },
    { lat: 18.00, lon: -76.79, code: 'KIN', city: 'Kingston', airport: 'Norman Manley International Airport', country: 'Jamaica' },
    { lat: -35.28, lon: 149.13, code: 'CBR', city: 'Canberra', airport: 'Canberra Airport', country: 'Australia' },
    { lat: 41.15, lon: -8.61, code: 'OPO', city: 'Porto', airport: 'Francisco S\u00e1 Carneiro Airport', country: 'Portugal' },
    { lat: -33.87, lon: 151.21, code: 'SYD', city: 'Sydney', airport: 'Sydney Kingsford Smith International Airport', country: 'Australia' },
    { lat: 6.37, lon: 2.39, code: 'COO', city: 'Cotonou', airport: 'Cadjehoun Airport', country: 'Benin' },
  ];

  function llToVec(lat, lon, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const th  = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(
      -r * Math.sin(phi) * Math.cos(th),
       r * Math.cos(phi),
       r * Math.sin(phi) * Math.sin(th));
  }

  const arcPairs = [
    // ── Europe ↔ North America (Atlantic) ──
    [34,5],   // London – Montreal
    [34,14],  // London – Toronto
    [37,11],  // Prague – Washington
    [33,13],  // Lisbon – Dallas
    [35,19],  // Oslo – Calgary
    [33,22],  // Lisbon – San Francisco
    [32,21],  // Funchal – Los Angeles
    // ── Europe ↔ Africa ──
    [1,12],   // Bucharest – Accra
    [3,18],   // Cluj – Johannesburg
    // ── Europe ↔ Asia (over Eurasia) ──
    [34,0],   // London – Bengaluru
    [1,8],    // Bucharest – Amman
    // ── Asia ↔ Africa ──
    [8,24],   // Amman – Durban
    [0,18],   // Bengaluru – Johannesburg
    [0,9],    // Bengaluru – Cape Town
    // ── Asia ↔ Oceania (via SE Asia) ──
    [4,44],   // Macau – Sydney
    [40,26],  // Singapore – Perth
    [40,38],  // Singapore – Darwin
    [40,30],  // Singapore – Melbourne
    [4,17],   // Macau – Auckland
    [40,6],   // Singapore – Christchurch
    // ── N. America ↔ Africa (Atlantic) ──
    [13,12],  // Dallas – Accra
    // ── Africa ↔ Oceania (Indian Ocean) ──
    [18,26],  // Johannesburg – Perth
  ];
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
  const cColors = new Float32Array(cities.length * 3);
  cities.forEach((c, i) => {
    const v = llToVec(c.lat, c.lon, 1.012);
    cPos[i*3] = v.x; cPos[i*3+1] = v.y; cPos[i*3+2] = v.z;
    // Default color: #80ffdb → r=0.502, g=1.0, b=0.859
    cColors[i*3] = 0.502; cColors[i*3+1] = 1.0; cColors[i*3+2] = 0.859;
  });
  cGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3));
  cGeo.setAttribute('color', new THREE.BufferAttribute(cColors, 3));
  const citySize = screenW < 480 ? 0.06 : 0.045;
  const cityPoints = new THREE.Points(cGeo, new THREE.PointsMaterial({
    vertexColors: true, size: citySize, transparent: true, opacity: 0.9, sizeAttenuation: true
  }));
  globeMesh.add(cityPoints);

  function hideCityPoint(idx) {
    // Move the point to the globe center (invisible, inside the sphere)
    cPos[idx*3] = 0; cPos[idx*3+1] = 0; cPos[idx*3+2] = 0;
    cGeo.attributes.position.needsUpdate = true;
  }
  function restoreAllCityPoints() {
    cities.forEach((c, i) => {
      var v = llToVec(c.lat, c.lon, 1.012);
      cPos[i*3] = v.x; cPos[i*3+1] = v.y; cPos[i*3+2] = v.z;
    });
    cGeo.attributes.position.needsUpdate = true;
  }

  /* ── City code label overlay (replaces dot on click) ── */
  var cityLabel = document.createElement('div');
  cityLabel.className = 'globe-city-label';
  cityLabel.style.display = 'none';
  display.appendChild(cityLabel);

  /* ── Callout tooltip overlay ── */
  var callout = document.createElement('div');
  callout.className = 'globe-callout';
  callout.innerHTML = '<svg class="callout-svg"><circle cx="0" cy="0" r="2" class="callout-dot"/><line x1="0" y1="0" x2="0" y2="0" class="callout-seg1"/></svg><div class="callout-content"><div class="callout-city"></div><div class="callout-airport"></div></div>';
  display.appendChild(callout);
  var calloutSvg = callout.querySelector('.callout-svg');
  var calloutContent = callout.querySelector('.callout-content');
  var calloutCity = callout.querySelector('.callout-city');
  var calloutAirport = callout.querySelector('.callout-airport');
  var selectedCityIdx = -1;
  var resetTimer = null;
  var isZoomedIn = false;
  var defaultZoom = getResponsiveZoom();
  var zoomedZoom = defaultZoom * 0.65; // 35% closer than default

  // Update zoom defaults and callout on resize
  window.addEventListener('resize', function() {
    defaultZoom = getResponsiveZoom();
    zoomedZoom = defaultZoom * 0.65;
    if (!isZoomedIn) {
      camera.position.z = defaultZoom;
    }
    if (selectedCityIdx >= 0) {
      updateCalloutPosition();
    }
  });

  function hideCallout() {
    callout.style.display = 'none';
    cityLabel.style.display = 'none';
    restoreAllCityPoints();
    selectedCityIdx = -1;
  }
  hideCallout();

  function showCallout(idx) {
    var c = cities[idx];
    calloutCity.textContent = c.city + ' (' + c.code + ')';
    calloutAirport.innerHTML = c.airport + '<br><span class="callout-country">' + c.country + '</span>';
    // Restore previous point, hide new one
    restoreAllCityPoints();
    hideCityPoint(idx);
    selectedCityIdx = idx;
    callout.style.display = 'block';
    // Show city code label at the point
    cityLabel.textContent = c.code;
    cityLabel.style.display = 'flex';
    updateCalloutPosition();
  }

  function updateCalloutPosition() {
    if (selectedCityIdx < 0) return;
    var c = cities[selectedCityIdx];
    var worldPos = llToVec(c.lat, c.lon, 1.012);
    // Transform to globe world space
    var v = worldPos.clone();
    globeMesh.localToWorld(v);
    v.project(camera);
    var rect = canvas.getBoundingClientRect();
    var px = (v.x * 0.5 + 0.5) * rect.width;
    var py = (-v.y * 0.5 + 0.5) * rect.height;
    // Check if point is on front side of globe
    var camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    var ptWorld = worldPos.clone();
    globeMesh.localToWorld(ptWorld);
    var ptDir = ptWorld.clone().sub(camera.position).normalize();
    var dotProduct = ptDir.dot(camDir);
    if (dotProduct < 0 || v.z > 1) {
      callout.style.opacity = '0';
      cityLabel.style.opacity = '0';
    } else {
      callout.style.opacity = '1';
      cityLabel.style.opacity = '1';
    }
    // Determine if city is on right or left half of canvas → extend line away from center
    var centerX = rect.width * 0.55; // account for globe offset
    var centerY = rect.height * 0.5;
    var goRight = px >= centerX;
    var goUp = py <= centerY;
    // Responsive scale factor based on smallest screen dimension
    var baseSize = Math.min(rect.width, rect.height);
    var scale = Math.max(0.4, Math.min(1.2, baseSize / 700));
    // Single straight pointer line from city dot to callout
    var lineLen = Math.round(100 * scale + 30);
    var endX = goRight ? lineLen : -lineLen;
    var endY = goUp ? -lineLen * 0.6 : lineLen * 0.6;

    // Ensure at least 10% of banner width gap between globe edge and callout box
    var globeCenter = new THREE.Vector3(0, 0, 0);
    globeMesh.localToWorld(globeCenter);
    globeCenter.project(camera);
    var gcx = (globeCenter.x * 0.5 + 0.5) * rect.width;
    // Project a point on the globe equator to estimate screen radius
    var edgePt = new THREE.Vector3(1, 0, 0);
    globeMesh.localToWorld(edgePt);
    edgePt.project(camera);
    var edgePx = (edgePt.x * 0.5 + 0.5) * rect.width;
    var globeScreenR = Math.abs(edgePx - gcx);
    var gap = rect.width * (rect.width < 600 ? 0.04 : 0.10); // smaller gap on small screens
    var globeRight = gcx + globeScreenR;
    var globeLeft = gcx - globeScreenR;
    // Content box X position in screen space
    var contentXgap = Math.round(4 * scale + 2);
    var contentX = px + endX + (goRight ? contentXgap : -contentXgap);
    if (goRight && contentX < globeRight + gap) {
      endX = (globeRight + gap - px) + contentXgap;
    } else if (!goRight && contentX > globeLeft - gap) {
      endX = (globeLeft - gap - px) - contentXgap;
    }

    // Clamp: callout content box must stay between 30%-70% of banner height
    var contentBoxY = py + endY; // absolute Y of content top on screen
    var minY = rect.height * 0.30;
    var maxY = rect.height * 0.70;
    if (contentBoxY < minY) endY = minY - py;
    if (contentBoxY > maxY) endY = maxY - py;

    // Compute SVG bounding box that covers origin (0,0) and endpoint
    var pad = Math.round(4 * scale + 2);
    var x0 = Math.min(0, endX) - pad;
    var y0 = Math.min(0, endY) - pad;
    var x1 = Math.max(0, endX) + pad;
    var y1 = Math.max(0, endY) + pad;
    var svgW = x1 - x0;
    var svgH = y1 - y0;
    // Place SVG so its top-left corner aligns with (x0, y0) relative to callout origin
    calloutSvg.setAttribute('width', svgW);
    calloutSvg.setAttribute('height', svgH);
    calloutSvg.setAttribute('viewBox', '0 0 ' + svgW + ' ' + svgH);
    calloutSvg.style.left = x0 + 'px';
    calloutSvg.style.top = y0 + 'px';
    // Map coordinates into the SVG local space (origin dot at -x0, -y0)
    var ox = -x0; // origin x inside SVG
    var oy = -y0; // origin y inside SVG
    // Responsive dot radius and stroke width
    var dotR = Math.max(1.5, 3 * scale);
    var strokeW = Math.max(0.6, 1.2 * scale);
    var dot = calloutSvg.querySelector('.callout-dot');
    var seg1 = calloutSvg.querySelector('.callout-seg1');
    dot.setAttribute('cx', ox); dot.setAttribute('cy', oy);
    dot.setAttribute('r', dotR);
    seg1.setAttribute('x1', ox); seg1.setAttribute('y1', oy);
    seg1.setAttribute('x2', ox + endX); seg1.setAttribute('y2', oy + endY);
    seg1.setAttribute('stroke-width', strokeW);
    // Position content at the end of the line (relative to callout origin)
    calloutContent.style.left = '';
    calloutContent.style.right = '';
    calloutContent.style.transform = '';
    if (goRight) {
      calloutContent.style.left = (endX + contentXgap) + 'px';
    } else {
      calloutContent.style.left = (endX - contentXgap) + 'px';
      calloutContent.style.transform = 'translateX(-100%)';
    }
    calloutContent.style.top = (endY - Math.round(12 * scale)) + 'px';
    // Responsive padding on content box
    var padV = Math.max(3, Math.round(5 * scale));
    var padR = Math.max(6, Math.round(12 * scale));
    var padL = Math.max(4, Math.round(8 * scale));
    calloutContent.style.padding = padV + 'px ' + padR + 'px ' + padV + 'px ' + padL + 'px';
    // Responsive font sizes
    var cityFontSize = Math.max(9, Math.round(11.5 * scale)) + 'px';
    var airportFontSize = Math.max(7, Math.round(9 * scale)) + 'px';
    calloutCity.style.fontSize = cityFontSize;
    calloutAirport.style.fontSize = airportFontSize;
    var countryEl = calloutContent.querySelector('.callout-country');
    if (countryEl) countryEl.style.fontSize = Math.max(6, Math.round(8 * scale)) + 'px';
    // Position the whole callout so its origin (0,0) sits exactly at the city screen point
    callout.style.left = px + 'px';
    callout.style.top = py + 'px';

    // Position city code label centered on the city point
    var labelFontSize = Math.max(8, Math.round(11 * scale));
    cityLabel.style.fontSize = labelFontSize + 'px';
    cityLabel.style.left = px + 'px';
    cityLabel.style.top = py + 'px';

    // Clamp callout content box to stay within screen bounds
    // Wait a frame so the browser computes the content's actual size
    requestAnimationFrame(function() {
      if (selectedCityIdx < 0) return;
      var cRect = calloutContent.getBoundingClientRect();
      var margin = 8;
      // Right edge overflow
      if (cRect.right > rect.right - margin) {
        var overR = cRect.right - (rect.right - margin);
        var curLeft = parseFloat(calloutContent.style.left) || 0;
        if (goRight) {
          calloutContent.style.left = (curLeft - overR) + 'px';
        }
      }
      // Left edge overflow
      if (cRect.left < rect.left + margin) {
        var overL = (rect.left + margin) - cRect.left;
        var curLeft2 = parseFloat(calloutContent.style.left) || 0;
        if (!goRight) {
          calloutContent.style.left = (curLeft2 + overL) + 'px';
          calloutContent.style.transform = '';
        }
      }
      // Top overflow
      if (cRect.top < rect.top + margin) {
        var overT = (rect.top + margin) - cRect.top;
        var curTop = parseFloat(calloutContent.style.top) || 0;
        calloutContent.style.top = (curTop + overT) + 'px';
      }
      // Bottom overflow
      if (cRect.bottom > rect.bottom - margin) {
        var overB = cRect.bottom - (rect.bottom - margin);
        var curTopB = parseFloat(calloutContent.style.top) || 0;
        calloutContent.style.top = (curTopB - overB) + 'px';
      }
    });
  }

  var rotateAnimId = 0; // incremented to cancel previous rotation animation

  function rotateToCityCenter(idx) {
    var c = cities[idx];
    // Cancel any in-progress rotation animation
    var myId = ++rotateAnimId;

    // Sync userDragY/X to current globe state before computing target
    userDragY = globeMesh.rotation.y - Math.PI;
    userDragX = globeMesh.rotation.x - 0.4;

    // Rotate Y (longitude) to center the city horizontally.
    var targetRotY = -(c.lon + 90) * Math.PI / 180;

    // Gently adjust rotation.x so the city sits in the 40-60% vertical band.
    // Target: tilt the globe so the city's latitude maps near the equator line on screen.
    // rotation.x ~ lat * PI/180 centers the city, but clamp to avoid extreme tilt.
    var targetRotX = c.lat * Math.PI / 180;
    targetRotX = Math.max(-0.8, Math.min(0.8, targetRotX)); // prevent extreme tilt

    // Current values — read directly from the mesh for accuracy
    var startRotY = globeMesh.rotation.y;
    var startRotX = globeMesh.rotation.x;
    var deltaY = targetRotY - startRotY;
    var deltaX = targetRotX - startRotX;
    // Normalize deltaY to [-PI, PI] for shortest path
    while (deltaY > Math.PI) deltaY -= 2 * Math.PI;
    while (deltaY < -Math.PI) deltaY += 2 * Math.PI;

    // Scale duration based on angular distance — longer for bigger jumps
    var absDelta = Math.max(Math.abs(deltaY), Math.abs(deltaX));
    var duration = Math.max(1200, Math.min(2800, 800 + absDelta * 1200));

    var startTime = performance.now();
    function animateRotate() {
      // If a newer rotation started, stop this one
      if (myId !== rotateAnimId) return;
      var elapsed = performance.now() - startTime;
      var t = Math.min(elapsed / duration, 1);
      // Very smooth quartic ease-in-out for buttery feel
      t = t < 0.5
        ? 8 * t * t * t * t
        : 1 - Math.pow(-2 * t + 2, 4) / 2;
      var newRotY = startRotY + deltaY * t;
      var newRotX = startRotX + deltaX * t;
      globeMesh.rotation.y = newRotY;
      globeMesh.rotation.x = newRotX;
      // Keep userDrag in sync so dragging doesn't fight the animation
      userDragY = newRotY - Math.PI;
      userDragX = newRotX - 0.4;
      if (t < 1) {
        requestAnimationFrame(animateRotate);
      }
      updateCalloutPosition();
    }
    animateRotate();
  }

  function zoomIn() {
    isZoomedIn = true;
    // Smooth zoom only — globe offset stays as-is
    var startZ = camera.position.z;
    var targetZ = zoomedZoom;
    var startTime = performance.now();
    var duration = 1200;
    function animateZoom() {
      var elapsed = performance.now() - startTime;
      var t = Math.min(elapsed / duration, 1);
      // Smooth ease-out cubic
      t = 1 - Math.pow(1 - t, 3);
      camera.position.z = startZ + (targetZ - startZ) * t;
      if (t < 1) requestAnimationFrame(animateZoom);
    }
    animateZoom();
  }

  function resetView() {
    isZoomedIn = false;
    hideCallout();
    // Smooth zoom back
    var startZ = camera.position.z;
    var targetZ = defaultZoom;
    var startTime = performance.now();
    var duration = 1000;
    function animateZoomOut() {
      var elapsed = performance.now() - startTime;
      var t = Math.min(elapsed / duration, 1);
      t = 1 - Math.pow(1 - t, 3); // ease-out cubic
      camera.position.z = startZ + (targetZ - startZ) * t;
      if (t < 1) requestAnimationFrame(animateZoomOut);
    }
    animateZoomOut();
  }

  /* ── Raycaster for city click detection ── */
  var raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = citySize * 0.6;
  var mouse = new THREE.Vector2();

  function onCityClick(event) {
    var rect = canvas.getBoundingClientRect();
    var clientX, clientY;
    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    var intersects = raycaster.intersectObject(cityPoints);
    if (intersects.length > 0) {
      var idx = intersects[0].index;
      if (idx !== undefined && idx >= 0 && idx < cities.length) {
        // Clear any existing reset timer
        if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
        var wasAlreadyZoomed = isZoomedIn;
        // Freeze globe immediately
        isZoomedIn = true;
        dragVelX = 0; dragVelY = 0;
        // If switching cities while already zoomed, smoothly transition
        if (wasAlreadyZoomed && selectedCityIdx >= 0 && selectedCityIdx !== idx) {
          var newIdx = idx;
          // Fade out callout content
          calloutContent.style.transition = 'opacity 0.4s ease';
          calloutContent.style.opacity = '0';
          // Start rotating after a brief delay so the fade-out begins first
          setTimeout(function() {
            rotateToCityCenter(newIdx);
          }, 100);
          // Swap callout text mid-rotation and fade back in
          setTimeout(function() {
            showCallout(newIdx);
            calloutContent.style.opacity = '1';
            setTimeout(function() {
              calloutContent.style.transition = '';
            }, 500);
          }, 600);
        } else {
          // First click — rotate, show callout, and zoom
          rotateToCityCenter(idx);
          showCallout(idx);
          zoomIn();
        }
        // Auto-reset after 60 seconds
        resetTimer = setTimeout(function() {
          resetView();
          resetTimer = null;
        }, 60000);
      }
    }
  }

  canvas.addEventListener('click', onCityClick);
  canvas.addEventListener('touchend', function(e) {
    // Use changedTouches for tap detection
    if (e.changedTouches && e.changedTouches.length === 1) {
      var rect = canvas.getBoundingClientRect();
      var touch = e.changedTouches[0];
      mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      var intersects = raycaster.intersectObject(cityPoints);
      if (intersects.length > 0) {
        var idx = intersects[0].index;
        if (idx !== undefined && idx >= 0 && idx < cities.length) {
          if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
          isZoomedIn = true;
          dragVelX = 0; dragVelY = 0;
          rotateToCityCenter(idx);
          showCallout(idx);
          zoomIn();
          resetTimer = setTimeout(function() {
            resetView();
            resetTimer = null;
          }, 60000);
        }
      }
    }
  });

  /* ── Subtitle loop – replay every 60 s ── */
  var subtitle = document.querySelector('.display-subtitle');
  var slant2   = document.querySelector('.slant-line-2');
  if (subtitle && slant2) {
    var CYCLE    = 15000;
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
