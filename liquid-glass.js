/**
 * Real-Time WebGL2 Liquid Glass Renderer
 * Adapted from Miftahul-Islam-Efaz/LIQUID-GLASS
 */
(function () {
  const VS = `#version 300 es
  in vec2 aPos;
  out vec2 vUv;
  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }`;

  const FS_GLASS = `#version 300 es
  precision highp float;

  in vec2 vUv;
  out vec4 frag;

  uniform sampler2D uBg;
  uniform vec2 uRes;
  uniform vec4 uRect;
  uniform float uRadius;
  uniform float uDepth;
  uniform float uRefract;
  uniform float uDisp;
  uniform float uFrost;
  uniform float uLight;
  uniform float uSplay;
  uniform float uSpec;
  uniform float uGain;
  uniform float uChroma;
  uniform vec3 uTint;
  uniform float uTintAmt;
  uniform float uScrollPhase;
  uniform vec2 uViewOffset;
  uniform vec2 uViewScale;
  uniform float uClearCenter;

  float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + vec2(r);
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  float bevelHeight(vec2 p, vec2 b, float r, float depth) {
    float sd = sdRoundedBox(p, b, r);
    float dist = max(-sd, 0.0);
    float t = clamp(dist / max(depth, 1.0), 0.0, 1.0);
    float u = 1.0 - t;
    return sqrt(max(1.0 - u * u, 0.0));
  }

  vec3 spectralWeight(float t) {
    vec3 c = vec3(0.0, 0.5, 1.0);
    vec3 d3 = (t - c) / 0.36;
    return exp(-0.5 * d3 * d3);
  }

  vec3 sampleBg(vec2 px, float lod) {
    vec2 uv = px / uRes;
    vec2 bgUv = vec2(
      uViewOffset.x + uv.x * uViewScale.x,
      fract(uViewOffset.y + uv.y * uViewScale.y + uScrollPhase)
    );
    return textureLod(uBg, clamp(bgUv, 0.002, 0.998), lod).rgb;
  }

  void main() {
    vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
    vec2 center = uRect.xy + uRect.zw * 0.5;
    vec2 halfSize = uRect.zw * 0.5;
    vec2 p = px - center;
    float r = min(uRadius, min(halfSize.x, halfSize.y));

    float sd = sdRoundedBox(p, halfSize, r);
    float cov = clamp(0.5 - sd, 0.0, 1.0);
    if (cov <= 0.001) discard;

    float h = bevelHeight(p, halfSize, r, uDepth);
    float B = 2.0;
    float gx = (bevelHeight(p + vec2(B, 0.0), halfSize, r, uDepth) - bevelHeight(p - vec2(B, 0.0), halfSize, r, uDepth)) * 0.5;
    float gy = (bevelHeight(p + vec2(0.0, B), halfSize, r, uDepth) - bevelHeight(p - vec2(0.0, B), halfSize, r, uDepth)) * 0.5;
    vec2 g = vec2(gx, gy);

    float gm = length(g);
    float lim = 1.35;
    if (gm > 1e-5) {
      g *= (lim * tanh(gm / lim) / gm);
    }

    vec3 n = normalize(vec3(-g.x * uGain, -g.y * uGain, 1.0));
    vec2 d = n.xy * uRefract;
    float slope = smoothstep(0.05, 0.85, clamp(length(g) * uGain, 0.0, 1.0));

    float edge = pow(clamp(1.0 - h, 0.0, 1.0), 1.45);
    vec2 dir = normalize(g + vec2(1e-6));

    const int TAPS = 24;
    vec3 blurAcc = vec3(0.0);
    vec3 dispAcc = vec3(0.0);
    vec3 dispW = vec3(0.0);
    float flod = clamp(log2(max(uFrost * 0.55, 1.0)), 0.0, 4.0);
    float wDisp = uDisp * edge;

    for (int i = 0; i < TAPS; i++) {
      float fi = float(i);
      float frac = (fi + 0.5) / float(TAPS);
      float rad = sqrt(frac);
      float ga = fi * 2.39996323;
      vec2 o = vec2(cos(ga), sin(ga)) * (rad * uFrost);

      blurAcc += sampleBg(px + d + o, flod);

      float s = (frac - 0.5) * 2.0;
      vec3 sw = spectralWeight(frac);
      dispAcc += sampleBg(px + d + dir * (wDisp * s) + o * 0.35, flod * 0.65) * sw;
      dispW += sw;
    }

    vec3 blurCol = blurAcc / float(TAPS);
    vec3 dispCol = dispAcc / max(dispW, vec3(1e-4));

    float fringe = clamp(edge * 1.4, 0.0, 1.0);
    vec3 col = mix(blurCol, dispCol, fringe);

    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(luma), col, uChroma);

    col *= (1.0 - 0.14 * slope);
    col = mix(col, uTint, uTintAmt);

    float la = radians(uLight);
    vec3 L = normalize(vec3(cos(la), sin(la), 0.75));
    float shine = 96.0 / (1.0 + uSplay * uSplay * 4.0);
    float spec1 = pow(max(dot(n, L), 0.0), shine) * uSpec * slope;

    vec3 L2 = normalize(vec3(-cos(la), -sin(la), 0.82));
    float spec2 = pow(max(dot(n, L2), 0.0), shine * 1.4) * (uSpec * 0.42) * slope;

    float rimGlow = smoothstep(0.55, 1.0, edge) * 0.22;
    col += vec3(1.0, 0.96, 1.0) * spec1 + vec3(0.45, 0.94, 1.0) * spec2 + vec3(1.0, 0.78, 0.92) * rimGlow;

    float clearAlpha = mix(0.08, 0.88, clamp(edge * 1.35 + slope * 0.85 + spec1 * 0.75, 0.0, 1.0));
    float finalAlpha = mix(0.94, clearAlpha, uClearCenter);
    frag = vec4(col, cov * finalAlpha);
  }`;

  function buildViceBackdropCanvas(isMidnight) {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 1024;
    const ctx = c.getContext("2d");

    const sky = ctx.createLinearGradient(0, 0, 0, 1024);
    if (isMidnight) {
      sky.addColorStop(0.0, "#050a1e");
      sky.addColorStop(0.22, "#0d1b46");
      sky.addColorStop(0.46, "#1f1248");
      sky.addColorStop(0.66, "#00b4d8");
      sky.addColorStop(0.82, "#ff2e93");
      sky.addColorStop(1.0, "#050a1e");
    } else {
      sky.addColorStop(0.0, "#120624");
      sky.addColorStop(0.22, "#4a0f5c");
      sky.addColorStop(0.46, "#c71f72");
      sky.addColorStop(0.64, "#ff6859");
      sky.addColorStop(0.78, "#ffd166");
      sky.addColorStop(0.9, "#240a3a");
      sky.addColorStop(1.0, "#120624");
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1024, 1024);

    const sun = ctx.createRadialGradient(512, 460, 20, 512, 460, 290);
    sun.addColorStop(0, "rgba(255, 245, 160, 0.95)");
    sun.addColorStop(0.42, isMidnight ? "rgba(0, 240, 255, 0.65)" : "rgba(255, 110, 84, 0.75)");
    sun.addColorStop(1, "rgba(255, 46, 147, 0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, 1024, 1024);

    ctx.lineWidth = 3;
    for (let y = 80; y < 1024; y += 64) {
      ctx.strokeStyle = y % 128 === 0 ? "rgba(0, 240, 255, 0.42)" : "rgba(255, 46, 147, 0.36)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1024, y);
      ctx.stroke();
    }

    const pillars = [70, 160, 260, 390, 510, 640, 770, 880, 960];
    pillars.forEach((x, idx) => {
      const h = 160 + ((idx * 97) % 240);
      ctx.fillStyle = "rgba(10, 4, 24, 0.62)";
      ctx.fillRect(x, 620 - h, 46, h + 120);
      ctx.fillStyle = idx % 2 === 0 ? "rgba(0, 240, 255, 0.78)" : "rgba(255, 209, 102, 0.78)";
      ctx.fillRect(x + 12, 635 - h, 6, h * 0.55);
      ctx.fillStyle = "rgba(255, 46, 147, 0.75)";
      ctx.fillRect(x + 28, 660 - h, 5, h * 0.4);
    });

    for (let i = 0; i < 6; i++) {
      const grad = ctx.createLinearGradient(i * 180, 0, i * 180 + 220, 1024);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, i % 2 === 0 ? "rgba(0,240,255,0.22)" : "rgba(255,46,147,0.24)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(i * 180, 0, 90, 1024);
    }

    return c;
  }

  function createLiquidGlassInstance(canvas, config) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance"
    });
    if (!gl) return null;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn("LiquidGlass shader error:", gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }

    const vs = compile(gl.VERTEX_SHADER, VS);
    const fs = compile(gl.FRAGMENT_SHADER, FS_GLASS);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const locPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    function uploadBackdrop(isMidnight) {
      const srcCanvas = buildViceBackdropCanvas(isMidnight);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    uploadBackdrop(document.body.classList.contains("theme-midnight"));

    const u = {};
    [
      "uBg", "uRes", "uRect", "uRadius", "uDepth", "uRefract", "uDisp",
      "uFrost", "uLight", "uSplay", "uSpec", "uGain", "uChroma",
      "uTint", "uTintAmt", "uScrollPhase", "uViewOffset", "uViewScale", "uClearCenter"
    ].forEach((name) => {
      u[name] = gl.getUniformLocation(prog, name);
    });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let cssW = 1;
    let cssH = 1;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      cssW = Math.max(rect.width, 1);
      cssH = Math.max(rect.height, 1);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(cssW * dpr);
      const ph = Math.round(cssH * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function renderRects(rects, state) {
      resize();
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(u.uBg, 0);
      gl.uniform2f(u.uRes, cssW, cssH);
      gl.uniform1f(u.uDepth, config.depth);
      gl.uniform1f(u.uRefract, config.refract);
      gl.uniform1f(u.uDisp, config.disp);
      gl.uniform1f(u.uFrost, config.frost);
      gl.uniform1f(u.uLight, state.lightAngle);
      gl.uniform1f(u.uSplay, config.splay);
      gl.uniform1f(u.uSpec, config.spec);
      gl.uniform1f(u.uGain, config.gain);
      gl.uniform1f(u.uChroma, 1.55);
      gl.uniform3f(u.uTint, config.tint[0], config.tint[1], config.tint[2]);
      gl.uniform1f(u.uTintAmt, config.tintAmt);
      gl.uniform1f(u.uScrollPhase, state.scrollPhase);
      gl.uniform1f(u.uClearCenter, config.clearCenter ? 1.0 : 0.0);

      const canvasRect = canvas.getBoundingClientRect();
      const vw = Math.max(window.innerWidth, 1);
      const vh = Math.max(window.innerHeight, 1);

      gl.enable(gl.SCISSOR_TEST);
      for (let i = 0; i < rects.length; i++) {
        const item = rects[i];
        const sx = Math.max(0, Math.floor(item.x * dpr));
        const sy = Math.max(0, Math.floor((cssH - (item.y + item.h)) * dpr));
        const sw = Math.min(canvas.width - sx, Math.ceil(item.w * dpr) + 2);
        const sh = Math.min(canvas.height - sy, Math.ceil(item.h * dpr) + 2);
        if (sw <= 0 || sh <= 0) continue;

        gl.scissor(sx, sy, sw, sh);
        gl.uniform4f(u.uRect, item.x, item.y, item.w, item.h);
        gl.uniform1f(u.uRadius, item.r);
        gl.uniform2f(u.uViewOffset, canvasRect.left / vw, (canvasRect.top / vh) * 0.45);
        gl.uniform2f(u.uViewScale, cssW / vw, (cssH / vh) * 0.45);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.disable(gl.SCISSOR_TEST);
    }

    return { renderRects, uploadBackdrop, resize };
  }

  window.initLiquidGlass = function initLiquidGlass() {
    const navCanvas = document.getElementById("navLiquidCanvas");
    const cardsCanvas = document.getElementById("cardsLiquidCanvas");
    const hudNav = document.getElementById("hudNav");
    const hudNavInner = document.getElementById("hudNavInner");
    const cardsWrap = document.getElementById("hudTelemetry");

    if (!navCanvas || !cardsCanvas || !hudNavInner || !cardsWrap) return null;

    const navGlass = createLiquidGlassInstance(navCanvas, {
      depth: 18.0,
      refract: -58.0,
      disp: 12.5,
      frost: 1.2,
      splay: 0.36,
      spec: 1.08,
      gain: 2.5,
      tint: [0.06, 0.03, 0.12],
      tintAmt: 0.14,
      clearCenter: true
    });

    const cardsGlass = createLiquidGlassInstance(cardsCanvas, {
      depth: 26.0,
      refract: -62.0,
      disp: 13.5,
      frost: 5.0,
      splay: 0.48,
      spec: 0.98,
      gain: 2.45,
      tint: [0.1, 0.06, 0.22],
      tintAmt: 0.2
    });

    if (!navGlass || !cardsGlass) {
      document.body.classList.add("no-webgl2");
      return null;
    }

    const state = {
      lightAngle: -42,
      targetLightAngle: -42,
      scrollPhase: 0,
      needsRender: true
    };

    function getCardRects() {
      const parentRect = cardsCanvas.getBoundingClientRect();
      const cards = cardsWrap.querySelectorAll(".liquid-glass-card");
      const out = [];
      cards.forEach((card) => {
        const r = card.getBoundingClientRect();
        out.push({
          x: r.left - parentRect.left,
          y: r.top - parentRect.top,
          w: r.width,
          h: r.height,
          r: 22
        });
      });
      return out;
    }

    function renderFrame() {
      const y = window.scrollY || window.pageYOffset;
      const docH = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      state.scrollPhase = (y / docH) * 0.72;
      state.lightAngle += (state.targetLightAngle - state.lightAngle) * 0.12;

      if (hudNav && hudNav.classList.contains("scrolled")) {
        const nr = hudNavInner.getBoundingClientRect();
        navGlass.renderRects([{ x: 0, y: 0, w: nr.width, h: nr.height, r: nr.height * 0.5 }], state);
      }

      if (y < window.innerHeight * 1.35) {
        cardsGlass.renderRects(getCardRects(), state);
      }

      if (Math.abs(state.targetLightAngle - state.lightAngle) > 0.08) {
        requestAnimationFrame(renderFrame);
      } else {
        state.needsRender = false;
      }
    }

    function scheduleRender() {
      if (!state.needsRender) {
        state.needsRender = true;
        requestAnimationFrame(renderFrame);
      }
    }

    window.addEventListener("scroll", scheduleRender, { passive: true });
    window.addEventListener("resize", scheduleRender, { passive: true });
    window.addEventListener(
      "pointermove",
      (e) => {
        const nx = (e.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
        state.targetLightAngle = -45 + nx * 38;
        scheduleRender();
      },
      { passive: true }
    );

    scheduleRender();
    setTimeout(scheduleRender, 600);
    setTimeout(scheduleRender, 1300);

    return {
      refreshTheme(isMidnight) {
        navGlass.uploadBackdrop(isMidnight);
        cardsGlass.uploadBackdrop(isMidnight);
        scheduleRender();
      },
      scheduleRender
    };
  };
})();
