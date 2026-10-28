// Procesador de efectos en GPU (WebGL 1, compatible con casi cualquier WebView de Android).
// Recibe un canvas 2D, le aplica una cadena de pasadas (shaders) y devuelve el canvas resultante.
// Todo trabaja con alfa premultiplicado, igual que el canvas 2D, para que las capas transparentes compongan bien.
import { PRELUDE, KERNELS } from './kernels.js';

const VERT = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.,1.); }`;

export class FxGL {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    const gl = this.canvas.getContext('webgl', {
      premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false,
    });
    this.ok = !!gl;
    if (!gl) return;
    this.gl = gl;
    this.progs = new Map();
    this.tex = { src: this.makeTex(W, H) };
    this.pool = new Map(); // "w×h" -> [{tex, fbo}]
    this.persist = new Map(); // clave -> {tex, fbo, t}
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.lost = false;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
  }

  makeTex(w, h) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }

  /** Objetivo de render (textura + framebuffer) de un tamaño dado, reutilizable. */
  target(w, h, slot) {
    const gl = this.gl;
    const key = `${w}x${h}`;
    let arr = this.pool.get(key);
    if (!arr) this.pool.set(key, (arr = {}));
    if (!arr[slot]) {
      const tex = this.makeTex(w, h);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      arr[slot] = { tex, fbo, w, h };
    }
    return arr[slot];
  }

  program(name) {
    let p = this.progs.get(name);
    if (p !== undefined) return p;
    const gl = this.gl;
    const body = KERNELS[name];
    if (!body) {
      this.progs.set(name, null);
      return null;
    }
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(`Shader «${name}»: ${log}`);
      }
      return s;
    };
    try {
      const prog = gl.createProgram();
      gl.attachShader(prog, mk(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, `${PRELUDE}\n${body}\nvoid main(){ gl_FragColor = fx(vUv); }`));
      gl.bindAttribLocation(prog, 0, 'aPos');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Enlace «${name}»: ${gl.getProgramInfoLog(prog)}`);
      p = { prog, loc: new Map() };
    } catch (e) {
      console.warn(e.message);
      FxGL.errors.push(e.message);
      p = null;
    }
    this.progs.set(name, p);
    return p;
  }

  uloc(p, name) {
    let l = p.loc.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(p.prog, name);
      p.loc.set(name, l);
    }
    return l;
  }

  setUniforms(p, u) {
    const gl = this.gl;
    for (const k in u) {
      const v = u[k];
      const l = this.uloc(p, k);
      if (l === null || v === undefined) continue;
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
      else if (v.length === 4) gl.uniform4f(l, v[0], v[1], v[2], v[3]);
    }
  }

  /**
   * Ejecuta `passes` sobre `src` (canvas 2D de W×H). Cada pasada: {k, u, scale?, feedback?, orig?}.
   * Devuelve el canvas WebGL (de W×H) con el resultado, o null si no se pudo.
   */
  run(src, passes, time = 0) {
    if (!this.ok || this.lost || !passes.length) return null;
    const gl = this.gl;
    const { W, H } = this;
    gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.src);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    let cur = this.tex.src;
    let origTex = this.tex.src;
    let slot = 0;
    const list = passes.filter((p) => this.program(p.k));
    list.push({ k: 'copy', u: {}, last: true });
    for (let i = 0; i < list.length; i++) {
      const ps = list[i];
      const prog = this.program(ps.k);
      if (!prog) continue;
      const sc = ps.scale ?? 1;
      const w = Math.max(2, Math.round(W * sc));
      const h = Math.max(2, Math.round(H * sc));
      let tgt = null;
      if (ps.last) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
      } else {
        // alterna entre dos objetivos para no leer y escribir la misma textura
        if (ps.save) tgt = this.target(w, h, 'save');
        else {
          tgt = this.target(w, h, slot);
          slot = 1 - slot;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fbo);
        gl.viewport(0, 0, w, h);
      }
      gl.useProgram(prog.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, cur);
      gl.uniform1i(this.uloc(prog, 'uTex'), 0);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, origTex);
      gl.uniform1i(this.uloc(prog, 'uOrig'), 2);
      let pers = null;
      if (ps.feedback) {
        pers = this.persist.get(ps.feedback);
        const stale = !pers || Math.abs(time - pers.time) > 0.5 || time < pers.time - 1e-4;
        if (!pers) {
          const tx = this.makeTex(W, H);
          const fb = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tx, 0);
          pers = { tex: tx, fbo: fb, time };
          this.persist.set(ps.feedback, pers);
        }
        if (stale) {
          // salto en el tiempo: se descarta el historial
          gl.bindFramebuffer(gl.FRAMEBUFFER, pers.fbo);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fbo : null);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, pers.tex);
        gl.uniform1i(this.uloc(prog, 'uPrev'), 1);
      }
      gl.uniform2f(this.uloc(prog, 'uRes'), w, h);
      gl.uniform1f(this.uloc(prog, 'uTime'), time);
      gl.uniform1f(this.uloc(prog, 'uAspect'), W / H);
      this.setUniforms(prog, ps.u || {});
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (ps.feedback && pers && tgt) {
        // guarda el resultado como historial para el siguiente fotograma
        gl.bindFramebuffer(gl.FRAMEBUFFER, pers.fbo);
        gl.useProgram(this.program('copy').prog);
        gl.viewport(0, 0, W, H);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tgt.tex);
        gl.uniform1i(this.uloc(this.program('copy'), 'uTex'), 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        pers.time = time;
        gl.useProgram(prog.prog);
      }
      if (tgt) cur = tgt.tex;
      if (ps.save && tgt) origTex = tgt.tex;
    }
    return this.canvas;
  }
}
FxGL.errors = [];

// Una instancia por tamaño de lienzo (la vista previa y la exportación usan tamaños distintos).
const cache = new Map();
export function getFx(W, H) {
  W = Math.max(2, Math.round(W));
  H = Math.max(2, Math.round(H));
  const key = `${W}x${H}`;
  let f = cache.get(key);
  if (f && f.lost) {
    cache.delete(key);
    f = null;
  }
  if (!f) {
    if (cache.size >= 4) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
    f = new FxGL(W, H);
    cache.set(key, f);
  }
  return f.ok ? f : null;
}
