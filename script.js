(function () {
  'use strict';
  const IMG = 'https://res.cloudinary.com/dqqyvozdw/image/upload/v1794829406/lxzzqilpwcoxhypl940a.jpg';
  const NAME = 'Hill AI', KEY = 'hillai.chats.v1', TK = 'hillai.theme';
  const $ = (s) => document.querySelector(s);
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  const ico = (n) => el('i', 'fa-solid ' + n);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
  };
  const fmt = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  let chats = [], cur = null, busy = false, ctrl = null, err = null, stopped = false;
  try { chats = JSON.parse(store.get(KEY) || '[]'); if (!Array.isArray(chats)) chats = []; } catch { chats = []; }
  const save = () => store.set(KEY, JSON.stringify(chats.slice(0, 50)));
  const active = () => chats.find((c) => c.id === cur) || null;

  const inp = $('#inp'), sendBtn = $('#send'), scrollBox = $('#scroll');

  function avatar(size, cls) {
    const w = el('span', 'av ' + (cls || ''));
    w.style.width = w.style.height = size + 'px';
    const img = new Image();
    img.alt = NAME;
    img.onerror = () => { w.textContent = NAME[0]; w.style.fontSize = size * 0.45 + 'px'; };
    img.src = IMG;
    w.appendChild(img);
    return w;
  }

  function theme(t) {
    document.documentElement.dataset.theme = t;
    store.set(TK, t);
    $('#theme').replaceChildren(ico(t === 'dark' ? 'fa-sun' : 'fa-moon'));
  }

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const a = el('textarea'); a.value = text; document.body.appendChild(a); a.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      a.remove();
    }
    const old = [...btn.childNodes];
    btn.replaceChildren(ico('fa-check'), ' Copied');
    setTimeout(() => btn.replaceChildren(...old), 1400);
  }

  /* ---------- Safe text formatting (DOM nodes only, never raw HTML) ---------- */
  function inline(p, t) {
    t.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).forEach((s) => {
      if (!s) return;
      if (s.length > 2 && s[0] === '`' && s.endsWith('`')) p.appendChild(el('code', '', s.slice(1, -1)));
      else if (s.length > 4 && s.startsWith('**') && s.endsWith('**')) p.appendChild(el('strong', '', s.slice(2, -2)));
      else p.appendChild(document.createTextNode(s));
    });
  }

  function blocks(frag, text) {
    let list = null, lt = '', para = [];
    const flush = () => {
      if (!para.length) return;
      const p = el('p');
      para.forEach((l, i) => { if (i) p.appendChild(el('br')); inline(p, l); });
      frag.appendChild(p); para = [];
    };
    const item = (type, txt) => {
      flush();
      if (!list || lt !== type) { list = el(type); lt = type; frag.appendChild(list); }
      const li = el('li'); inline(li, txt); list.appendChild(li);
    };
    text.split('\n').forEach((line) => {
      let m;
      if ((m = line.match(/^(#{1,4})\s+(.*)/))) {
        flush(); list = null; lt = '';
        const h = el('h' + (m[1].length + 2)); inline(h, m[2]); frag.appendChild(h);
      } else if ((m = line.match(/^\s*[-*]\s+(.*)/))) item('ul', m[1]);
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) item('ol', m[1]);
      else if (!line.trim()) { flush(); list = null; lt = ''; }
      else { list = null; lt = ''; para.push(line); }
    });
    flush();
  }

  function codeBlock(lang, code) {
    const w = el('div', 'code'), h = el('div', 'ch');
    h.appendChild(el('span', '', lang));
    const b = el('button', 'cb');
    b.append(ico('fa-copy'), ' Copy code');
    b.onclick = () => copy(code, b);
    h.appendChild(b);
    const pre = el('pre');
    pre.appendChild(el('code', '', code));
    w.append(h, pre);
    return w;
  }

  function render(text) {
    const f = document.createDocumentFragment();
    const re = /```([\w+#.-]*)[^\n]*\n?([\s\S]*?)```/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      blocks(f, text.slice(last, m.index));
      f.appendChild(codeBlock(m[1] || 'code', m[2].replace(/\n$/, '')));
      last = re.lastIndex;
    }
    blocks(f, text.slice(last));
    return f;
  }

  /* ---------- Message rendering ---------- */
  function fbBtn(m, k, icon) {
    const b = el('button', 'ab' + (m.fb === k ? ' on' : ''));
    b.title = k === 'up' ? 'Good response' : 'Bad response';
    b.dataset.k = k;
    b.appendChild(ico(icon));
    b.onclick = () => {
      m.fb = m.fb === k ? null : k; save();
      b.parentNode.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x.dataset.k === m.fb));
    };
    return b;
  }

  function msgEl(m, last) {
    if (m.role === 'user') {
      const r = el('div', 'row user');
      r.appendChild(el('div', 'bub', m.content));
      return r;
    }
    const r = el('div', 'row ai'), col = el('div', 'col'), b = el('div', 'bub');
    r.appendChild(avatar(34));
    b.appendChild(render(m.content));
    const bar = el('div', 'bar');
    const cp = el('button', 'ab'); cp.title = 'Copy response'; cp.appendChild(ico('fa-copy'));
    cp.onclick = () => copy(m.content, cp);
    bar.append(cp, el('span', 'time', fmt(m.ts)), fbBtn(m, 'up', 'fa-thumbs-up'), fbBtn(m, 'down', 'fa-thumbs-down'));
    if (last) {
      const rg = el('button', 'ab'); rg.title = 'Regenerate response'; rg.appendChild(ico('fa-rotate-right'));
      rg.onclick = regen; bar.appendChild(rg);
    }
    col.append(b, bar); r.appendChild(col);
    return r;
  }

  function aiRow(content, cls) {
    const r = el('div', 'row ai'), col = el('div', 'col'), b = el('div', 'bub ' + (cls || ''));
    b.appendChild(content); col.appendChild(b); r.append(avatar(34), col);
    return r;
  }

  function welcome() {
    const w = el('div', 'welcome');
    w.append(avatar(110), el('h2', '', 'Hi, I’m Hill AI 👋'),
      el('p', '', 'I help students with coding and debugging. Ask me about programming, fix an error together, or start learning to code.'));
    const g = el('div', 'cards');
    [
      ['fa-code', 'Learn programming', 'Explain how loops work in programming, with simple examples.'],
      ['fa-bug', 'Debug an error', 'How do I debug "TypeError: Cannot read properties of undefined" in JavaScript?'],
      ['fa-brands fa-js', 'JavaScript help', 'Explain JavaScript promises and async/await in simple terms.'],
      ['fa-graduation-cap', 'Start coding', 'I’m a complete beginner. What’s the best roadmap to learn coding?']
    ].forEach(([ic, title, prompt]) => {
      const c = el('button', 'card');
      const i = el('i', ic.includes('fa-brands') ? ic : 'fa-solid ' + ic);
      c.append(i, el('b', '', title), el('span', '', prompt));
      c.onclick = () => send(prompt);
      g.appendChild(c);
    });
    w.appendChild(g);
    return w;
  }

  function renderChat() {
    const box = $('#msgs'), c = active();
    box.replaceChildren();
    if (!c || !c.msgs.length) box.appendChild(welcome());
    else {
      c.msgs.forEach((m, i) => box.appendChild(msgEl(m, i === c.msgs.length - 1 && !busy && !err)));
      if (busy) {
        const d = el('div', 'dots'); d.append(el('span'), el('span'), el('span'));
        box.appendChild(aiRow(d));
      }
      if (err) {
        const s = el('span', '', err), rt = el('button', 'retry', 'Retry');
        rt.onclick = ask;
        const wrap = el('span'); wrap.append(s, rt);
        box.appendChild(aiRow(wrap, 'err'));
      }
    }
    scrollBox.scrollTop = scrollBox.scrollHeight;
  }

  /* ---------- Sidebar ---------- */
  function renderList() {
    const q = $('#search').value.toLowerCase(), ul = $('#list');
    ul.replaceChildren();
    const f = chats.filter((c) => c.title.toLowerCase().includes(q));
    if (!f.length) ul.appendChild(el('li', 'empty', q ? 'No chats found' : 'No chats yet'));
    f.forEach((c) => {
      const li = el('li', c.id === cur ? 'act' : ''), t = el('button', 't', c.title);
      t.onclick = () => openChat(c.id);
      const rn = el('button', 'mini'); rn.title = 'Rename'; rn.appendChild(ico('fa-pen'));
      rn.onclick = () => {
        const n = prompt('Rename chat', c.title);
        if (n && n.trim()) { c.title = n.trim().slice(0, 60); save(); renderList(); }
      };
      const dl = el('button', 'mini'); dl.title = 'Delete'; dl.appendChild(ico('fa-trash'));
      dl.onclick = () => {
        if (!confirm('Delete this chat permanently? This cannot be undone.')) return;
        if (c.id === cur) { abort(); cur = null; err = null; }
        chats = chats.filter((x) => x !== c); save(); renderList(); renderChat();
      };
      li.append(t, rn, dl); ul.appendChild(li);
    });
  }

  const closeSide = () => $('#side').classList.remove('open');
  function abort() { if (ctrl) { ctrl.abort(); ctrl = null; busy = false; ui(); } }
  function openChat(id) { abort(); cur = id; err = null; closeSide(); renderList(); renderChat(); }
  function newChat() { abort(); cur = null; err = null; closeSide(); renderList(); renderChat(); inp.focus(); }

  /* ---------- Sending ---------- */
  function ui() {
    sendBtn.classList.toggle('stop', busy);
    sendBtn.replaceChildren(ico(busy ? 'fa-stop' : 'fa-arrow-up'));
    sendBtn.disabled = !busy && !inp.value.trim();
    sendBtn.setAttribute('aria-label', busy ? 'Stop generating' : 'Send');
  }
  function grow() { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 160) + 'px'; }
  function touch(c) {
    c.upd = Date.now();
    chats = [c, ...chats.filter((x) => x !== c)];
    save(); renderList();
  }

  function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    let c = active();
    if (!c) {
      c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: text.slice(0, 40), msgs: [], upd: Date.now() };
      chats.unshift(c); cur = c.id;
    }
    c.msgs.push({ role: 'user', content: text, ts: Date.now() });
    touch(c); inp.value = ''; grow(); ask();
  }

  async function ask() {
    const c = active();
    if (!c || busy) return;
    busy = true; err = null; stopped = false;
    const my = ctrl = new AbortController();
    ui(); renderChat();
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: c.msgs.map(({ role, content }) => ({ role, content })) }),
        signal: my.signal
      });
      let d = {};
      try { d = await r.json(); } catch { /* non-JSON response */ }
      if (ctrl !== my) return;
      if (!r.ok || !d.reply) throw new Error(d.error || 'Something went wrong. Please try again.');
      c.msgs.push({ role: 'assistant', content: d.reply, ts: Date.now(), fb: null });
      touch(c);
    } catch (e) {
      if (ctrl !== my) return;
      if (e.name === 'AbortError') err = stopped ? 'Response stopped.' : null;
      else err = e.message && e.message !== 'Failed to fetch' ? e.message : 'I couldn’t reach the server. Check your connection and try again.';
    } finally {
      if (ctrl === my) { busy = false; ctrl = null; stopped = false; ui(); renderChat(); }
    }
  }

  function regen() {
    const c = active();
    if (busy || !c) return;
    if (c.msgs.length && c.msgs[c.msgs.length - 1].role === 'assistant') c.msgs.pop();
    save(); ask();
  }

  /* ---------- Events ---------- */
  sendBtn.onclick = () => { if (busy) { stopped = true; ctrl && ctrl.abort(); } else send(inp.value); };
  inp.addEventListener('input', () => { grow(); ui(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); send(inp.value); }
  });
  $('#newChat').onclick = newChat;
  $('#search').oninput = renderList;
  $('#menu').onclick = () => $('#side').classList.add('open');
  $('#ov').onclick = closeSide;
  $('#theme').onclick = () => theme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

  /* ---------- Init ---------- */
  theme(store.get(TK) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('#sideAv').appendChild(avatar(32));
  $('#topAv').appendChild(avatar(40));
  ui(); renderList(); renderChat();
})();
