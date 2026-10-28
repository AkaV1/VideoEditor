// Biblioteca de shaders (GLSL ES 1.00). Cada kernel define `vec4 fx(vec2 uv)`; uv.y = 1 arriba.
// Uniformes comunes: uTex (entrada), uOrig (original), uPrev (historial), uRes, uTime, uAspect,
//   uAmt (intensidad 0..1), uSpd (velocidad), uProg (progreso de transición: 1 = visible), uA..uD (parámetros), uCol.
export const PRELUDE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uPrev;
uniform sampler2D uOrig;
uniform vec2 uRes;
uniform float uTime, uAspect, uAmt, uSpd, uProg, uA, uB, uC, uD;
uniform vec3 uCol;
#define PI 3.14159265
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float hash1(float n){ return fract(sin(n*127.1)*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.02; a*=.5; } return s; }
mat2 rot2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float lum(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
vec4 S(vec2 uv){ return texture2D(uTex, uv); }
vec2 mirrorUv(vec2 uv){ vec2 m=mod(uv,2.); return mix(m, 2.-m, step(1.,m)); }
vec4 Sm(vec2 uv){ return texture2D(uTex, mirrorUv(uv)); }
vec3 unp(vec4 c){ return c.a>0.001 ? c.rgb/c.a : vec3(0.); }
vec4 pm(vec3 c, float a){ return vec4(c*a, a); }
`;

export const KERNELS = {
  copy: `vec4 fx(vec2 uv){ return S(uv); }`,

  // ------------------------------------------------------------------ desenfoques
  blur: `vec4 fx(vec2 uv){
    float r = uAmt*uA; if (r < 0.0004) return S(uv);
    vec4 s = vec4(0.);
    for (int i=0;i<28;i++){ float fi=float(i); float rr=r*sqrt((fi+.5)/28.); float th=fi*2.39996;
      s += S(uv + vec2(cos(th)/uAspect, sin(th))*rr); }
    return s/28.; }`,

  dirblur: `vec4 fx(vec2 uv){
    float L = uAmt*uA; float a = radians(uB + uC*uTime*uSpd);
    vec2 d = vec2(cos(a)/uAspect, sin(a))*L; vec4 s = vec4(0.);
    for (int i=0;i<24;i++){ float f = float(i)/23.-.5; s += S(uv + d*f); }
    return s/24.; }`,

  zoomblur: `uniform float uThr;
    vec4 fx(vec2 uv){
    vec2 c = vec2(uC,uD); vec2 d = (c-uv)*uAmt*uA; vec4 s = vec4(0.);
    for (int i=0;i<24;i++){ float f=float(i)/23.; vec4 t = S(uv + d*f);
      if (uB > .5){ float l = lum(unp(t)); t *= smoothstep(uThr, uThr+.25, l); } s += t; }
    s /= 24.;
    if (uB > .5){ vec4 o = S(uv); return vec4(o.rgb + s.rgb*1.6*uCol*uAmt, max(o.a, min(1., s.a*uAmt))); }
    return s; }`,

  spinblur: `vec4 fx(vec2 uv){
    vec2 c = vec2(.5); vec2 d = (uv-c)*vec2(uAspect,1.); vec4 s = vec4(0.); float a = uAmt*uA;
    for (int i=0;i<20;i++){ float f=float(i)/19.-.5; vec2 q = rot2(a*f)*d; s += S(q/vec2(uAspect,1.)+c); }
    return s/20.; }`,

  // ------------------------------------------------------------------ color / canales
  rgb: `vec4 fx(vec2 uv){
    vec2 d;
    if (uC > .5) d = (uv-.5)*uAmt*uA*2.;
    else { float a = radians(uB + 30.*sin(uTime*uSpd*2.)*step(.5,uD)); d = vec2(cos(a)/uAspect, sin(a))*uAmt*uA; }
    vec4 r = S(uv+d), g = S(uv), b = S(uv-d);
    return vec4(r.r, g.g, b.b, max(max(r.a,g.a),b.a)); }`,

  invert: `vec4 fx(vec2 uv){ vec4 s=S(uv); vec3 c=unp(s); return pm(mix(c,1.-c,uAmt), s.a); }`,

  posterize: `vec4 fx(vec2 uv){ vec4 s=S(uv); vec3 c=unp(s); float L=mix(32.,uA,clamp(uAmt,0.,1.)); return pm(floor(c*L+.5)/L, s.a); }`,

  grade: `uniform float uSat,uCon,uBri,uTemp,uTint,uFade,uGam,uSoft; uniform vec3 uSh,uHi;
    vec4 fx(vec2 uv){
    vec4 s = S(uv);
    if (uSoft > 0.){ // brillo suave: mezcla con una versión desenfocada
      vec4 b = vec4(0.); for (int i=0;i<12;i++){ float fi=float(i); float th=fi*2.39996; float r=.012*sqrt((fi+.5)/12.);
        b += S(uv+vec2(cos(th)/uAspect,sin(th))*r*(1.+uSoft*3.)); } b/=12.;
      s = mix(s, max(s,b), uSoft*.6); }
    vec3 o = unp(s); vec3 c = o;
    c += uBri; c = (c-.5)*uCon + .5;
    float l = lum(c); c = mix(vec3(l), c, uSat);
    c += vec3(uTemp*.10, uTint*-.05, -uTemp*.10) + vec3(0., uTint*.08, 0.);
    c = pow(max(c,0.), vec3(1./max(uGam,.1)));
    l = lum(c);
    c += uSh*(1.-smoothstep(0.,.55,l)) + uHi*smoothstep(.45,1.,l);
    c = c*(1.-uFade*.6) + uFade*.12;
    c = mix(o, c, uAmt);
    return pm(clamp(c,0.,1.), s.a); }`,

  // ------------------------------------------------------------------ digital / glitch
  glitch: `vec4 fx(vec2 uv){
    float tq = floor(uTime*uSpd*10.); float amt = uAmt; vec2 p = uv;
    float bands = mix(8., 40., hash1(tq+3.)); float by = floor(uv.y*bands);
    float act = step(1.-amt*.9, hash(vec2(by,tq)));
    p.x += (hash(vec2(by,tq+9.))-.5)*.35*amt*act*uA;
    vec2 bl = floor(uv*vec2(12.,8.)); float ba = step(1.-amt*.25, hash(bl+tq));
    float sh = (hash(bl+tq*1.7)-.5)*.08*ba*amt + .012*amt*uB;
    vec4 r = S(p+vec2(sh,0.)), g = S(p), b = S(p-vec2(sh,0.));
    vec4 c = vec4(r.r, g.g, b.b, max(max(r.a,g.a),b.a));
    c.rgb += ba*amt*.15*vec3(hash(bl),hash(bl+1.),hash(bl+2.))*c.a;
    return c; }`,

  tear: `vec4 fx(vec2 uv){
    float tq = floor(uTime*uSpd*8.); float k = uA; float y = floor(uv.y*k)/k;
    float act = step(.82-uAmt*.3, hash(vec2(y*13.,tq)));
    float off = (hash(vec2(y,tq+4.))-.5)*.5*uAmt*act;
    vec4 c = S(vec2(uv.x+off, uv.y));
    float edge = act*smoothstep(.01,0.,abs(fract(uv.y*k)-.02))*uAmt;
    c.rgb += edge*.5*c.a; return c; }`,

  // ------------------------------------------------------------------ distorsiones
  wave: `vec4 fx(vec2 uv){
    float t = uTime*uSpd*3.; vec2 p = uv; float amp = uAmt*uB;
    if (uC < .5 || uC > 1.5) p.x += sin(uv.y*uA + t)*amp/uAspect;
    if (uC > .5) p.y += sin(uv.x*uA*uAspect*.6 + t*1.1)*amp;
    return Sm(p); }`,

  ripple: `vec4 fx(vec2 uv){
    vec2 d = (uv-vec2(uC,uD))*vec2(uAspect,1.); float r = length(d);
    float w = sin(r*uA - uTime*uSpd*4.)*uAmt*uB*exp(-r*1.5);
    vec2 dir = d/(r+1e-4); return Sm(uv + dir*w*vec2(1./uAspect,1.)); }`,

  heat: `vec4 fx(vec2 uv){
    float t = uTime*uSpd;
    vec2 n = vec2(fbm(vec2(uv.x*uA, uv.y*uA*.7 - t*1.5)), fbm(vec2(uv.x*uA+7., uv.y*uA*.7 - t*1.2))) - .5;
    float g = mix(1., smoothstep(1.,0.,uv.y)*1.5, uC);
    return Sm(uv + n*uAmt*uB*g*vec2(1./uAspect,1.)); }`,

  swirl: `vec4 fx(vec2 uv){
    vec2 c = vec2(uC,uD); vec2 d = (uv-c)*vec2(uAspect,1.); float r = length(d);
    float k = clamp(1.-r/uA, 0., 1.); float a = uAmt*uB*k*k + uSpd*0.*uTime;
    d = rot2(a)*d; return Sm(c + d/vec2(uAspect,1.)); }`,

  lens: `vec4 fx(vec2 uv){
    vec2 c = vec2(.5); vec2 d = (uv-c)*vec2(uAspect,1.); float r = length(d); vec2 o = d; float s = uAmt*uA;
    if (uB < .5){ float k = s*1.2; o = d*(1.+k*r*r); o *= 1./(1.+k*.35); }
    else if (uB < 1.5){ float R=.5; float q=clamp(r/R,0.,1.); float f=1.-s*(1.-q*q)*.9; o = d*mix(1.,f,step(r,R)); }
    else if (uB < 2.5){ float R=.5; float q=clamp(r/R,0.,1.); float f=1.+s*(1.-q*q)*1.2; o = d*mix(1.,f,step(r,R)); }
    else if (uB < 3.5){ float g=exp(-dot(d,d)*4.); o = vec2(d.x*(1.-s*.6*g), d.y); }
    else { float g=exp(-dot(d,d)*4.); o = vec2(d.x, d.y*(1.-s*.6*g)); }
    return Sm(c + o/vec2(uAspect,1.)); }`,

  mirror: `vec4 fx(vec2 uv){
    vec2 p = uv; float m = uA;
    if (m < .5){ if (p.x > .5) p.x = 1.-p.x; }
    else if (m < 1.5){ if (p.x < .5) p.x = 1.-p.x; }
    else if (m < 2.5){ if (p.y > .5) p.y = 1.-p.y; }
    else if (m < 3.5){ if (p.y < .5) p.y = 1.-p.y; }
    else p = .5-abs(p-.5);
    return mix(S(uv), S(p), min(1., uAmt*2.)); }`,

  kaleido: `vec4 fx(vec2 uv){
    vec2 d = (uv-.5)*vec2(uAspect,1.); float r = length(d);
    float a = atan(d.y,d.x) + uTime*uSpd*.2; float seg = PI/uA;
    a = mod(a, 2.*seg); a = abs(a-seg);
    vec2 p = r*vec2(cos(a),sin(a))*uB; p = p/vec2(uAspect,1.)+.5;
    return mix(S(uv), Sm(p), min(1., uAmt*1.5)); }`,

  tunnel: `vec4 fx(vec2 uv){
    vec2 d = (uv-.5)*vec2(uAspect,1.); float r = length(d)+1e-3; float a = atan(d.y,d.x)/(2.*PI);
    vec2 p = vec2(fract(a*uA), fract(.25/r*uB + uTime*uSpd*.3));
    vec4 t = S(p)*smoothstep(.0,.18,r);
    return mix(S(uv), t, min(1., uAmt*1.5)); }`,

  tile: `vec4 fx(vec2 uv){
    vec2 p = uv*uA; vec2 f = fract(p);
    if (uB > .5){ vec2 i = floor(p); f = mix(f, 1.-f, mod(i,2.)); }
    return mix(S(uv), S(f), min(1., uAmt*2.)); }`,

  pixel: `vec4 fx(vec2 uv){
    if (uAmt < .02) return S(uv);
    float n = mix(400., uA, clamp(uAmt,0.,1.)); vec2 g = vec2(n, n/uAspect);
    vec2 cell = (floor(uv*g)+.5)/g; vec4 c = S(cell);
    if (uB > 0.){ vec2 f = fract(uv*g); float gap = step(f.x, .08)+step(f.y,.08); c.rgb *= 1.-uB*min(gap,1.)*.6; }
    return c; }`,

  edges: `vec4 fx(vec2 uv){
    vec2 px = uA/uRes;
    float tl=lum(unp(S(uv+vec2(-px.x, px.y)))), t=lum(unp(S(uv+vec2(0., px.y)))), tr=lum(unp(S(uv+vec2(px.x, px.y))));
    float l=lum(unp(S(uv+vec2(-px.x,0.)))), r=lum(unp(S(uv+vec2(px.x,0.))));
    float bl=lum(unp(S(uv+vec2(-px.x,-px.y)))), b=lum(unp(S(uv+vec2(0.,-px.y)))), br=lum(unp(S(uv+vec2(px.x,-px.y))));
    float gx = -tl-2.*l-bl+tr+2.*r+br, gy = -tl-2.*t-tr+bl+2.*b+br;
    float e = clamp(sqrt(gx*gx+gy*gy)*uB, 0., 1.); vec4 s = S(uv);
    if (uC < .5) return vec4(vec3(e)*mix(vec3(1.),uCol,.0), 1.);
    if (uC < 1.5) return vec4(unp(s)*(1.-.75*uAmt)*s.a + e*uCol*2.*s.a, s.a);
    return vec4(s.rgb + e*uCol*uAmt*1.5*s.a, s.a); }`,

  // ------------------------------------------------------------------ retro
  retro: `uniform float uScan,uJit,uBleed,uNoise,uTrack,uCurve,uVig,uTone,uFlick;
    vec4 fx(vec2 uv0){
    vec2 uv = uv0; float t = uTime*uSpd;
    if (uCurve > 0.){ vec2 d = uv-.5; uv = .5+d*(1.+uCurve*dot(d,d)*2.); if (uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.) return vec4(0.,0.,0.,1.); }
    float line = floor(uv.y*uRes.y/3.);
    float wob = (hash(vec2(line,floor(t*24.)))-.5)*uJit*.01*uAmt + sin(uv.y*40.+t*6.)*uJit*.0015*uAmt;
    float tb = fract(t*.15); float inBar = smoothstep(.05,0.,abs(uv.y-(1.-tb)));
    wob += inBar*uTrack*.03*uAmt*(hash(vec2(floor(t*30.),line))-.5)*3.;
    uv.x += wob;
    float bl = uBleed*.004*uAmt;
    vec4 r = S(uv+vec2(bl,0.)), g = S(uv), b = S(uv-vec2(bl,0.));
    float a = max(max(r.a,g.a),b.a); vec3 c = unp(vec4(r.r,g.g,b.b,a));
    float l = lum(c); c = mix(vec3(l), c, mix(1., uTone, uAmt));
    float sc = .5+.5*sin(uv.y*uRes.y*3.14159); c *= 1.-uScan*uAmt*(1.-sc)*.6;
    c += (hash(uv*uRes+floor(t*30.))-.5)*uNoise*uAmt*.35;
    float dr = step(.9985-uTrack*.004*uAmt, hash(vec2(line*3.1,floor(t*30.)))); c = mix(c, vec3(.9), dr*.5);
    c *= 1.-uVig*uAmt*smoothstep(.4,1.2,length((uv0-.5)*vec2(1.2,1.)));
    c *= 1.+uFlick*uAmt*(hash1(floor(t*20.))-.5)*.2;
    return pm(clamp(c,0.,1.), a); }`,

  film: `uniform float uGrain,uScratch,uDust,uFlick,uSepia,uVigf,uWeave;
    vec4 fx(vec2 uv0){
    float t = uTime*uSpd; float fr = floor(t*18.);
    vec2 uv = uv0 + vec2(hash1(fr)-.5, hash1(fr+7.)-.5)*uWeave*.004*uAmt;
    vec4 s = S(uv); vec3 c = unp(s);
    float l = lum(c); c = mix(c, vec3(l)*vec3(1.1,.92,.72), uSepia*uAmt);
    c += (hash(uv*uRes+fr)-.5)*uGrain*.3*uAmt;
    float sc = 0.;
    for (int i=0;i<3;i++){ float fi=float(i); float x = hash1(fr*7.+fi*13.); float w = abs(uv.x-x);
      sc += smoothstep(.0015,0.,w)*step(.5,hash1(fr*11.+fi))*smoothstep(0.,.1,fract(uv.y*3.+hash1(fr+fi))); }
    c += sc*uScratch*.6*uAmt;
    vec2 g = vec2(40.*uAspect, 40.); vec2 cell = floor(uv*g); float dd = step(.992, hash(cell+fr));
    float rad = length(fract(uv*g)-.5); c *= 1.-dd*smoothstep(.25,.0,rad)*uDust*uAmt*.9;
    c *= 1.+(hash1(fr+99.)-.5)*uFlick*.25*uAmt;
    c *= 1.-uVigf*uAmt*smoothstep(.3,1.,length((uv0-.5)*vec2(uAspect*.8,1.)));
    return pm(clamp(c,0.,1.), s.a); }`,

  // ------------------------------------------------------------------ luz
  leak: `vec4 fx(vec2 uv){
    vec4 s = S(uv); float t = uTime*uSpd*.4; vec3 add = vec3(0.);
    for (int i=0;i<3;i++){ float fi=float(i);
      vec2 c = vec2(.5+.55*sin(t*(.7+fi*.3)+fi*2.1), .5+.5*cos(t*(.5+fi*.2)+fi*1.3));
      float d = length((uv-c)*vec2(uAspect,1.)); float g = exp(-d*d*uA*3.);
      vec3 col = i==0 ? vec3(1.,.45,.1) : (i==1 ? vec3(1.,.15,.35) : vec3(1.,.8,.3)); add += col*g; }
    add *= uAmt*uB; vec3 o = unp(s); o = 1.-(1.-o)*(1.-clamp(add,0.,1.)); return pm(o, s.a); }`,

  flare: `vec4 fx(vec2 uv){
    vec4 s = S(uv); float t = uTime*uSpd;
    vec2 L = vec2(uC+.15*sin(t*.5), uD+.1*cos(t*.4)); vec2 dv = vec2(.5)-L; vec3 add = vec3(0.);
    vec2 a = (uv-L)*vec2(uAspect,1.); float d = length(a);
    add += vec3(1.,.9,.7)*exp(-d*6.)*1.2 + vec3(.9,.95,1.)*exp(-d*d*80.)*2.;
    add += vec3(.6,.8,1.)*exp(-abs(a.y)*60.)*exp(-abs(a.x)*2.5)*.6;
    for (int i=1;i<5;i++){ float fi=float(i); vec2 gp = L+dv*fi*.45; float gd = length((uv-gp)*vec2(uAspect,1.)); float r = .03+.02*fi;
      add += mix(vec3(1.,.4,.2), vec3(.3,.6,1.), fi/4.)*smoothstep(r, r*.6, gd)*.15; }
    add *= uAmt*uA; vec3 o = unp(s); o = 1.-(1.-o)*(1.-clamp(add,0.,1.)); return pm(o, s.a); }`,

  sweep: `vec4 fx(vec2 uv){
    vec4 s = S(uv); float t = fract(uTime*uSpd*.35); vec2 dir = vec2(cos(radians(uB)), sin(radians(uB)));
    float k = dot(uv-.5, dir) + .5; float band = exp(-pow((k-(t*1.6-.3))*uA, 2.));
    vec3 o = unp(s) + band*uAmt*uCol*.9; return pm(clamp(o,0.,1.), s.a); }`,

  flash: `vec4 fx(vec2 uv){
    vec4 s = S(uv); float f = uAmt;
    if (uA > .01){ float ph = fract(uTime*uSpd*uA); f *= pow(1.-ph, 3.); }
    vec3 o = mix(unp(s), uCol, clamp(f,0.,1.)); return pm(o, s.a); }`,

  flicker: `vec4 fx(vec2 uv){
    vec4 s = S(uv); float k = 1.+(hash1(floor(uTime*uSpd*uA))-.5)*uAmt*uB*2.; return vec4(s.rgb*k, s.a); }`,

  vignette: `vec4 fx(vec2 uv){
    vec4 s = S(uv); float d = length((uv-.5)*vec2(uAspect*.75,1.)); float v = smoothstep(uA, uA+uB, d)*uAmt;
    return pm(mix(unp(s), uCol, clamp(v,0.,1.)), s.a); }`,

  shade: `vec4 fx(vec2 uv){
    vec4 s = S(uv); float g = 0.;
    if (uB < .5) g = smoothstep(.0,1.,1.-uv.y*uA);
    else if (uB < 1.5) g = smoothstep(.0,1.,uv.y*uA);
    else g = max(smoothstep(0.,1.,1.-uv.y*uA), smoothstep(0.,1.,uv.y*uA));
    return pm(unp(s)*(1.-clamp(g,0.,1.)*uAmt*.9), s.a); }`,

  bright: `uniform float uThr;
    vec4 fx(vec2 uv){ vec4 s = S(uv); float l = lum(unp(s)); return s*smoothstep(uThr, uThr+.3, l); }`,
  blurh: `vec4 fx(vec2 uv){ vec2 st = vec2(uA/uRes.x, 0.); vec4 s = S(uv)*.227027;
    s += (S(uv+st*1.384615)+S(uv-st*1.384615))*.316216; s += (S(uv+st*3.230769)+S(uv-st*3.230769))*.070270; return s; }`,
  blurv: `vec4 fx(vec2 uv){ vec2 st = vec2(0., uA/uRes.y); vec4 s = S(uv)*.227027;
    s += (S(uv+st*1.384615)+S(uv-st*1.384615))*.316216; s += (S(uv+st*3.230769)+S(uv-st*3.230769))*.070270; return s; }`,
  addglow: `uniform float uGain;
    vec4 fx(vec2 uv){ vec4 o = texture2D(uOrig, uv); vec4 g = S(uv);
      return vec4(o.rgb + g.rgb*uGain*uCol, max(o.a, min(1., g.a*uGain))); }`,

  speedlines: `vec4 fx(vec2 uv){
    vec4 s = S(uv); vec2 d = (uv-.5)*vec2(uAspect,1.); float r = length(d); float a = atan(d.y,d.x);
    float tq = floor(uTime*uSpd*14.); float ang = a/(2.*PI)*uA; float id = floor(ang); float f = fract(ang);
    float w = hash(vec2(id,tq)); float th = .06+.2*hash(vec2(id,tq+3.));
    float m = smoothstep(th, th*.5, abs(f-.5))*step(.45,w); float rad = smoothstep(.18+.2*uB, .75, r);
    return pm(mix(unp(s), uCol, m*rad*uAmt), s.a); }`,

  fog: `vec4 fx(vec2 uv){
    vec4 s = S(uv); float t = uTime*uSpd*.1;
    float n = fbm(vec2(uv.x*uA*uAspect+t, uv.y*uA)+vec2(0., t*.5)); n = fbm(vec2(uv.x*uA*uAspect+t+n, uv.y*uA)+n);
    float f = smoothstep(.2,.9,n)*uAmt*uB; return pm(mix(unp(s), uCol, clamp(f,0.,1.)), s.a); }`,

  caustics: `vec4 fx(vec2 uv){
    float t = uTime*uSpd*.5; vec2 p = uv*vec2(uAspect,1.)*uA; vec2 q = p; float c = 0.;
    for (int i=0;i<3;i++){ float fi=float(i)+1.; q += vec2(sin(q.y*1.7*fi+t), cos(q.x*1.5*fi+t*1.1))*.35; c += abs(sin(q.x+q.y))/fi; }
    c = pow(clamp(c/1.6,0.,1.), 3.);
    vec2 disp = vec2(sin(q.y*2.), cos(q.x*2.))*.004*uAmt*uB; vec4 s = S(uv+disp);
    vec3 o = unp(s)*mix(vec3(1.), vec3(.85,.95,1.05), uAmt) + vec3(.4,.8,1.)*c*uAmt*.5; return pm(clamp(o,0.,1.), s.a); }`,

  // ------------------------------------------------------------------ cámara y copias
  camera: `vec4 fx(vec2 uv){
    float t = uTime*uSpd; vec2 off = vec2(0.); float rot = 0.; float zoom = 1.; float a = uAmt*uA;
    if (uB < .5){ off = (vec2(vnoise(vec2(t*14.,1.)), vnoise(vec2(t*14.,9.)))-.5)*.06*a; rot = (vnoise(vec2(t*12.,5.))-.5)*.05*a; zoom = 1.+.03*a; }
    else if (uB < 1.5){ off = (vec2(vnoise(vec2(t*1.8,1.)), vnoise(vec2(t*1.8,9.)))-.5)*.05*a; rot = (vnoise(vec2(t*1.4,5.))-.5)*.03*a; zoom = 1.+.04*a; }
    else if (uB < 2.5){ off = vec2(sin(t*90.), cos(t*83.))*.004*a; zoom = 1.+.01*a; }
    else if (uB < 3.5){ zoom = 1.+.12*a*pow(.5+.5*sin(t*6.), 2.); }
    else if (uB < 4.5){ rot = sin(t*3.)*.08*a; zoom = 1.+.06*a; }
    else { zoom = 1.+.25*a*(.5-.5*cos(t*1.2)); }
    vec2 d = (uv-.5)*vec2(uAspect,1.); d = rot2(rot)*d/zoom; return Sm(d/vec2(uAspect,1.)+.5+off); }`,

  double: `vec4 fx(vec2 uv){
    vec4 s = S(uv); float t = uTime*uSpd;
    if (uB < .5){
      vec2 p = (uv-.5)*1.35; p = rot2(sin(t*.4)*.2)*p; p = vec2(1.-(p.x+.5+sin(t*.3)*.05), p.y+.5);
      vec3 o = unp(s); vec3 b = unp(Sm(p)); vec3 r = 1.-(1.-o)*(1.-b*.8); return pm(mix(o,r,uAmt), s.a); }
    vec2 d = vec2(cos(radians(uC))/uAspect, sin(radians(uC)))*.04*uA; vec4 c = s; float ws = 1.;
    for (int i=1;i<4;i++){ float f = float(i); float w = .5*uAmt/f; c += S(uv+d*f*(1.+.3*sin(t*2.)))*w; ws += w; }
    return c/ws; }`,

  trails: `vec4 fx(vec2 uv){
    vec4 cur = S(uv); vec2 p = uv-.5; p = rot2(uC*.01)*p/uB + .5;
    vec4 pv = texture2D(uPrev, p)*uA;
    vec4 o = vec4(max(cur.rgb, pv.rgb), max(cur.a, pv.a)); return mix(cur, o, min(1., uAmt*1.5)); }`,

  // ------------------------------------------------------------------ transiciones
  dissolve: `uniform vec3 uEdge;
    vec4 fx(vec2 uv){
    float p = uProg; float n;
    if (uB < .5) n = hash(uv*uRes*.5+floor(uTime*20.));
    else if (uB < 1.5){ n = fbm(uv*vec2(uAspect,1.)*3.+vec2(0.,uTime*.3)); n = fbm(uv*vec2(uAspect,1.)*4.+n*1.5); }
    else if (uB < 2.5) n = fbm(uv*vec2(uAspect,1.)*6.);
    else n = hash(floor(uv*vec2(24.*uAspect,24.)));
    float x = p*1.1 - n; float a = smoothstep(0., .08, x); float edge = a*(1.-smoothstep(.08,.22,x));
    vec2 q = uv;
    if (uB > 1.5 && uB < 2.5) q = uv + vec2((n-.5)*.1, -(1.-a)*.25*(n+.3))*(1.-p);
    vec4 s = S(q);
    return vec4(s.rgb*a + uEdge*edge*uAmt*s.a, s.a*a); }`,

  mask: `uniform vec3 uEdge; uniform float uSoft;
    vec4 fx(vec2 uv){
    float p = uProg; vec2 d = (uv-.5)*vec2(uAspect,1.); float f = 0.; float m = uB;
    float rmax = length(vec2(uAspect,1.))*.5;
    if (m < .5){ vec2 dir = vec2(cos(radians(uC)), sin(radians(uC))); f = dot(uv-.5, dir)/(abs(dir.x)+abs(dir.y)) + .5; }
    else if (m < 1.5){ f = length(d)/rmax; if (uD > .5) f = 1.-f; }
    else if (m < 2.5){ f = (abs(d.x)+abs(d.y))/(.5*uAspect+.5); if (uD > .5) f = 1.-f; }
    else if (m < 3.5){ float a = atan(d.y,d.x); float R = .30+.70*pow(.5+.5*cos(5.*a), 3.); f = length(d)/(R*rmax*1.7); if (uD > .5) f = 1.-f; }
    else if (m < 4.5){ float a = atan(d.x,-d.y); float sn = sin(a); float R = 2.-2.*sn+sn*sqrt(abs(cos(a)))/(sn+1.4); R = max(R, .6);
      f = length(d)*3.2/(R*rmax*1.2); if (uD > .5) f = 1.-f; }
    else if (m < 5.5){ f = abs(uv.x-.5)*2.; }
    else if (m < 6.5){ f = abs(uv.y-.5)*2.; }
    else if (m < 7.5){ f = fract(uv.y*uA); }
    else if (m < 8.5){ f = atan(d.x,-d.y)/(2.*PI)+.5; }
    else if (m < 9.5){ f = hash(floor(uv*vec2(8.*uAspect,8.))); }
    else { f = fract((uv.x+uv.y)*uA); }
    float soft = max(.004, uSoft);
    float x = p*(1.+soft) - f; float a = smoothstep(0., soft, x);
    if (m > 2.5 && m < 4.5) a = max(a, smoothstep(.85,1.,p));
    float edge = a*(1.-smoothstep(soft,soft*3.,x));
    vec4 s = S(uv); return vec4(s.rgb*a + uEdge*edge*s.a*uAmt, s.a*a); }`,

  persp: `uniform float uAng, uPiv, uDist;
    vec4 fx(vec2 uv){
    float th = radians(uAng); float c = cos(th), s = sin(th);
    vec2 sc = (uv-.5)*vec2(uAspect,1.); float piv = uPiv*uAspect*.5; vec2 u2;
    if (uB < .5 || uB > 2.5){ // giro alrededor de un eje vertical
      float sx = sc.x - piv; float den = c - sx*s/uDist; if (den < .05) return vec4(0.);
      float u = sx/den; float v = sc.y*(1.+u*s/uDist); u2 = vec2(u+piv, v);
    } else { // giro alrededor de un eje horizontal
      float sy = sc.y - piv; float den = c - sy*s/uDist; if (den < .05) return vec4(0.);
      float v = sy/den; float u = sc.x*(1.+v*s/uDist); u2 = vec2(u, v+piv);
    }
    vec2 src = vec2(u2.x/uAspect + .5, u2.y + .5);
    if (src.x < 0. || src.x > 1. || src.y < 0. || src.y > 1.) return vec4(0.);
    vec4 t = S(src); float shade = 1.-abs(sin(th))*.55; return vec4(t.rgb*shade, t.a); }`,

  edgemix: `vec4 fx(vec2 uv){ vec4 o = texture2D(uOrig, uv); vec4 b = S(uv); float d = length((uv-.5)*vec2(uAspect*.7,1.)); return mix(o, b, smoothstep(uA, uA+.35, d)*uAmt); }`,

  curl: `vec4 fx(vec2 uv){
    float p = uProg; float xf = p*1.15-.12; float R = .11; vec2 q = uv;
    if (uv.x <= xf){ return S(uv); }
    float d = uv.x - xf;
    if (d < 3.14159*R){ float a = d/R; float srcx = xf - R*sin(a)*.0 - d; srcx = xf - d*.9;
      vec4 b = S(vec2(srcx, uv.y)); float sh = .55+.45*cos(a); return vec4(b.rgb*sh*.9+vec3(.07)*b.a*(1.-sh), b.a); }
    return vec4(0.); }`,
};
