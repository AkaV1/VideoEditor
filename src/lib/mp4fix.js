// MediaRecorder entrega MP4 «fragmentado»: la cabecera no trae la duración total y muchos reproductores
// (galería de Samsung, etc.) muestran solo la del primer fragmento. Aquí se calcula la duración real
// sumando los fragmentos y se escribe en las cabeceras (mvhd / tkhd / mdhd) sin tocar el resto del archivo.

const tag = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));

function children(dv, start, end) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = dv.getUint32(o);
    let hdr = 8;
    if (size === 1) {
      size = Number(dv.getBigUint64(o + 8));
      hdr = 16;
    } else if (size === 0) size = end - o;
    if (size < hdr || o + size > end) break;
    out.push({ type: tag(dv, o + 4), start: o, body: o + hdr, end: o + size });
    o += size;
  }
  return out;
}
const find = (dv, box, type) => children(dv, box.body, box.end).find((b) => b.type === type);
const findAll = (dv, box, type) => children(dv, box.body, box.end).filter((b) => b.type === type);

function setDuration(dv, box, layout, value) {
  // layout: posición del campo duración según la versión (v0: 4 bytes, v1: 8 bytes)
  const ver = dv.getUint8(box.body);
  const off = box.body + layout[ver];
  if (ver === 1) dv.setBigUint64(off, BigInt(Math.max(0, Math.round(value))));
  else dv.setUint32(off, Math.min(0xffffffff, Math.max(0, Math.round(value))));
}
const MVHD = { 0: 16, 1: 24 }; // ver/flags(4)+ctime+mtime+timescale → duración
const TKHD = { 0: 20, 1: 28 };
const MDHD = { 0: 16, 1: 24 };
const timescaleOf = (dv, box) => dv.getUint32(box.body + (dv.getUint8(box.body) === 1 ? 20 : 12));

async function readTopLevel(blob) {
  const top = [];
  let off = 0;
  while (off + 8 <= blob.size) {
    const head = new DataView(await blob.slice(off, off + 16).arrayBuffer());
    let size = head.getUint32(0);
    if (size === 1) size = Number(head.getBigUint64(8));
    else if (size === 0) size = blob.size - off;
    if (size < 8 || off + size > blob.size) break;
    top.push({ type: tag(head, 4), off, size });
    off += size;
  }
  return top;
}

/** Devuelve un Blob con la duración corregida (o el mismo blob si no es un MP4 fragmentado válido). */
export async function fixMp4Duration(blob) {
  try {
    const top = await readTopLevel(blob);
    const moovInfo = top.find((b) => b.type === 'moov');
    if (!moovInfo || !top.some((b) => b.type === 'moof')) return blob;

    const moovBytes = new Uint8Array(await blob.slice(moovInfo.off, moovInfo.off + moovInfo.size).arrayBuffer());
    const mdv = new DataView(moovBytes.buffer);
    const moov = { body: 8, end: moovBytes.length };
    const mvhd = find(mdv, moov, 'mvhd');
    if (!mvhd) return blob;
    const movieScale = timescaleOf(mdv, mvhd);

    const tracks = new Map(); // id → { tkhd, mdhd, scale, defDur, end }
    for (const trak of findAll(mdv, moov, 'trak')) {
      const tkhd = find(mdv, trak, 'tkhd');
      const mdia = find(mdv, trak, 'mdia');
      const mdhd = mdia && find(mdv, mdia, 'mdhd');
      if (!tkhd || !mdhd) continue;
      const id = mdv.getUint32(tkhd.body + (mdv.getUint8(tkhd.body) === 1 ? 20 : 12));
      tracks.set(id, { tkhd, mdhd, scale: timescaleOf(mdv, mdhd), defDur: 0, end: 0 });
    }
    const mvex = find(mdv, moov, 'mvex');
    if (mvex) {
      for (const trex of findAll(mdv, mvex, 'trex')) {
        const t = tracks.get(mdv.getUint32(trex.body + 4));
        if (t) t.defDur = mdv.getUint32(trex.body + 12);
      }
    }

    // recorre los fragmentos y calcula hasta dónde llega cada pista
    const running = new Map();
    for (const m of top.filter((b) => b.type === 'moof')) {
      const buf = await blob.slice(m.off, m.off + m.size).arrayBuffer();
      const dv = new DataView(buf);
      const moof = { body: 8, end: buf.byteLength };
      for (const traf of findAll(dv, moof, 'traf')) {
        const tfhd = find(dv, traf, 'tfhd');
        if (!tfhd) continue;
        const flags = dv.getUint32(tfhd.body) & 0xffffff;
        const id = dv.getUint32(tfhd.body + 4);
        const t = tracks.get(id);
        if (!t) continue;
        let p = tfhd.body + 8;
        if (flags & 1) p += 8;
        if (flags & 2) p += 4;
        const defDur = flags & 8 ? dv.getUint32(p) : t.defDur;
        const tfdt = find(dv, traf, 'tfdt');
        let t0 = running.get(id) ?? 0;
        if (tfdt) t0 = dv.getUint8(tfdt.body) === 1 ? Number(dv.getBigUint64(tfdt.body + 4)) : dv.getUint32(tfdt.body + 4);
        let cur = t0;
        for (const trun of findAll(dv, traf, 'trun')) {
          const f = dv.getUint32(trun.body) & 0xffffff;
          const n = dv.getUint32(trun.body + 4);
          let q = trun.body + 8;
          if (f & 1) q += 4;
          if (f & 4) q += 4;
          const per = (f & 0x100 ? 4 : 0) + (f & 0x200 ? 4 : 0) + (f & 0x400 ? 4 : 0) + (f & 0x800 ? 4 : 0);
          for (let i = 0; i < n; i++) {
            cur += f & 0x100 ? dv.getUint32(q) : defDur;
            q += per;
          }
        }
        running.set(id, cur);
        t.end = Math.max(t.end, cur);
      }
    }

    let seconds = 0;
    for (const t of tracks.values()) seconds = Math.max(seconds, t.end / t.scale);
    if (!(seconds > 0)) return blob;

    setDuration(mdv, mvhd, MVHD, seconds * movieScale);
    for (const t of tracks.values()) {
      setDuration(mdv, t.tkhd, TKHD, (t.end / t.scale) * movieScale);
      setDuration(mdv, t.mdhd, MDHD, t.end);
    }
    return new Blob(
      [blob.slice(0, moovInfo.off), moovBytes, blob.slice(moovInfo.off + moovInfo.size)],
      { type: blob.type },
    );
  } catch {
    return blob;
  }
}
