// TalentFlow V2 — Tiny SVG chart helpers (sparkline, bar, line)

window.TF_CHARTS = (() => {
  function sparkline(data, opts={}){
    const w = opts.w || 100, h = opts.h || 30, pad = 1;
    const max = Math.max(...data), min = Math.min(...data);
    const range = max - min || 1;
    const step = (w - pad*2) / (data.length - 1);
    const pts = data.map((v,i) => [pad + i*step, h - pad - ((v-min)/range)*(h - pad*2)]);
    const d = 'M ' + pts.map(p => p.join(' ')).join(' L ');
    const area = d + ` L ${pts[pts.length-1][0]} ${h} L ${pts[0][0]} ${h} Z`;
    const color = opts.color || 'var(--accent)';
    const gid = 'sg' + Math.floor(Math.random()*1e9);
    return `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="100%">
        <defs>
          <linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity=".25"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="${area}" fill="url(#${gid})"/>
        <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
  }

  function barsImport(data, opts={}){
    const w = 640, h = 220;
    const padL = 36, padR = 10, padT = 10, padB = 28;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const max = Math.max(...data.map(d => d.v)) * 1.15;
    const bw = plotW / data.length;
    const innerBW = bw * 0.55;
    const yTicks = 4;
    let grid = '';
    for (let i=0; i<=yTicks; i++){
      const y = padT + (plotH/yTicks)*i;
      const val = Math.round(max - (max/yTicks)*i);
      grid += `<line x1="${padL}" x2="${w-padR}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-dasharray="2 3" />`;
      grid += `<text x="${padL-8}" y="${y+3}" text-anchor="end" font-size="10" fill="var(--text-3)" font-family="var(--font-mono)">${val}</text>`;
    }
    let bars = '';
    data.forEach((d, i) => {
      const bh = (d.v / max) * plotH;
      const bx = padL + bw*i + (bw - innerBW)/2;
      const by = padT + plotH - bh;
      const isLast = i === data.length - 1;
      bars += `
        <g class="bar" style="animation: barGrow .6s var(--ease-out) ${i*0.05}s backwards; transform-origin: ${bx+innerBW/2}px ${padT+plotH}px">
          <rect x="${bx}" y="${by}" width="${innerBW}" height="${bh}" rx="4"
            fill="${isLast ? 'var(--accent)' : 'var(--accent-soft-2)'}"
            stroke="${isLast ? 'var(--accent)' : 'transparent'}" />
          <text x="${bx+innerBW/2}" y="${by-6}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--text-2)" font-family="var(--font-mono)">${d.v}</text>
          <text x="${padL + bw*i + bw/2}" y="${h-10}" text-anchor="middle" font-size="11" fill="var(--text-3)">${d.m}</text>
        </g>`;
    });
    return `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
        <style>@keyframes barGrow { from { transform: scaleY(0);} to { transform: scaleY(1);} } .bar rect{ transition: fill .2s } .bar:hover rect{ fill: var(--accent); }</style>
        ${grid}
        ${bars}
      </svg>`;
  }

  return { sparkline, barsImport };
})();
