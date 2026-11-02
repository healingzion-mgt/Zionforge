/* Zionforge by Healingzion Management Ventures
   Plain JavaScript, no build step. All text from the AI is inserted with textContent (never innerHTML). */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var STORE_KEY = 'zionforge_projects_v2';
  var mode = 'guided';
  var current = null;      // { name, result, demo }
  var projects = loadProjects();

  /* ---------- small helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function showNotice(msg, kind) {
    var n = $('notice');
    n.textContent = msg;
    n.className = 'notice' + (kind ? ' ' + kind : '');
  }
  function hideNotice() { $('notice').className = 'notice hidden'; }
  function slug(s) {
    return String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
  }
  function bytes(n) { return n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'; }

  function loadProjects() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveProjects() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(projects.slice(0, 12)));
      return true;
    } catch (e) { return false; }
  }

  /* ---------- navigation ---------- */
  function showView(name) {
    ['studio', 'projects', 'guides'].forEach(function (v) {
      $('view-' + v).classList.toggle('active', v === name);
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-view') === name);
    });
    if (name === 'projects') renderProjects();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); showView(b.getAttribute('data-view')); });
  });

  /* ---------- form controls ---------- */
  var promptBox = $('prompt');
  function updateCount() { $('charCount').textContent = promptBox.value.length + ' / 5000'; }
  promptBox.addEventListener('input', updateCount);

  var modeText = {
    guided: 'Guided: clear explanations of what each file does.',
    auto: 'Auto: the leanest working project, with less explanation.'
  };
  document.querySelectorAll('.mode').forEach(function (b) {
    b.addEventListener('click', function () {
      mode = b.getAttribute('data-mode');
      document.querySelectorAll('.mode').forEach(function (x) {
        var on = x === b;
        x.classList.toggle('active', on);
        x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      $('modeHelp').textContent = modeText[mode];
    });
  });

  document.querySelectorAll('.idea').forEach(function (b) {
    b.addEventListener('click', function () {
      $('projectName').value = b.getAttribute('data-name') || '';
      promptBox.value = b.getAttribute('data-idea') || '';
      updateCount();
      promptBox.focus();
      promptBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Idea added. Edit it, then tap Generate.');
    });
  });

  /* ---------- ZIP (no libraries; "stored" method) ---------- */
  var crcTable = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function makeZip(files, folder) {
    var enc = new TextEncoder();
    var d = new Date();
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var parts = [], central = [], offset = 0;

    files.forEach(function (f) {
      var name = enc.encode(folder + '/' + f.path);
      var data = enc.encode(f.content);
      var crc = crc32(data);

      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);          // UTF-8 names
      lh.setUint16(8, 0, true);               // stored
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);

      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true);
      ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);

      offset += 30 + name.length + data.length;
    });

    var centralSize = 0;
    central.forEach(function (c) { centralSize += c.length; });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    end.setUint16(20, 0, true);

    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }
  function downloadZip(name, files) {
    if (!files || !files.length) { toast('There are no files to download.'); return; }
    var folder = slug(name);
    var blob = makeZip(files, folder);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = folder + '.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('Downloading ' + folder + '.zip');
  }

  /* ---------- live preview (sandboxed, no access to your account) ---------- */
  function buildPreview(files) {
    var map = {};
    files.forEach(function (f) { map[f.path] = f.content; });
    var html = map['index.html'];
    if (typeof html !== 'string') return null;
    function safe(s) { return s.replace(/<\/(script|style)/gi, '<\\/$1'); }
    html = html.replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, function (tag) {
      var m = tag.match(/href=["']?([^"'\s>]+)/i);
      var p = m && m[1].replace(/^\.\//, '');
      return p && map[p] !== undefined ? '<style>' + safe(map[p]) + '</style>' : tag;
    });
    html = html.replace(/<script\b([^>]*)src=["']?([^"'\s>]+)["']?([^>]*)>\s*<\/script>/gi, function (tag, a, src) {
      var p = src.replace(/^\.\//, '');
      return map[p] !== undefined ? '<script>' + safe(map[p]) + '</scr' + 'ipt>' : tag;
    });
    return html;
  }

  /* ---------- rendering ---------- */
  function listFrom(items, tag) {
    var list = el(tag || 'ul');
    (items || []).forEach(function (t) { list.appendChild(el('li', null, String(t))); });
    return list;
  }

  function renderResult(name, result, demo) {
    current = { name: name, result: result, demo: !!demo };
    var box = $('result'), body = $('resultBody');
    body.textContent = '';
    box.classList.remove('hidden');
    $('resultName').textContent = result.project_name || name || 'Your project';
    $('resultTag').textContent = demo ? 'SAMPLE PLAN' : 'YOUR PROJECT';
    var pill = $('resultPill');
    pill.textContent = demo ? 'Demo' : 'Ready';
    pill.className = 'pill' + (demo ? ' demo' : '');

    if (demo) {
      body.appendChild(el('p', 'demo-note', 'This is a sample plan only. The AI is not connected yet, so no real project files were written. Once the AI key is added, the same button writes the complete files.'));
    }
    if (result.summary) body.appendChild(el('p', null, result.summary));

    var files = result.files || [];
    if (files.length) {
      var actions = el('div', 'actions');
      var dl = el('button', 'btn primary', 'Download all files (.zip)');
      dl.type = 'button';
      dl.addEventListener('click', function () { downloadZip(result.project_name || name, files); });
      actions.appendChild(dl);
      var hasIndex = files.some(function (f) { return f.path === 'index.html'; });
      if (hasIndex) {
        var pv = el('button', 'btn', 'Preview it here');
        pv.type = 'button';
        pv.addEventListener('click', function () { togglePreview(files); });
        actions.appendChild(pv);
      }
      body.appendChild(actions);
      var holder = el('div');
      holder.id = 'previewHolder';
      body.appendChild(holder);
    }

    if (result.architecture && result.architecture.length) {
      body.appendChild(el('h3', null, 'How it is built'));
      body.appendChild(listFrom(result.architecture));
    }

    if (files.length) {
      body.appendChild(el('h3', null, 'Project files (' + files.length + ')'));
      files.forEach(function (f) {
        var d = el('details', 'file');
        var s = el('summary');
        s.appendChild(el('span', null, f.path));
        s.appendChild(el('small', null, bytes(new TextEncoder().encode(f.content).length)));
        d.appendChild(s);
        var bar = el('div', 'filebar');
        var cp = el('button', 'btn small', 'Copy');
        cp.type = 'button';
        cp.addEventListener('click', function () {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(f.content).then(function () { toast('Copied ' + f.path); }, function () { toast('Could not copy. Select the text instead.'); });
          } else { toast('Could not copy. Select the text instead.'); }
        });
        bar.appendChild(cp);
        d.appendChild(bar);
        var pre = el('pre', 'code');
        pre.appendChild(el('code', null, f.content));
        d.appendChild(pre);
        body.appendChild(d);
      });
    } else if (result.files && result.files.length === 0 && !demo) {
      body.appendChild(el('p', null, 'No files were returned.'));
    }

    if (result.next_steps && result.next_steps.length) {
      body.appendChild(el('h3', null, 'Next steps'));
      body.appendChild(listFrom(result.next_steps, 'ol'));
    }
    if (result.notes) {
      body.appendChild(el('h3', null, 'Good to know'));
      body.appendChild(el('p', null, result.notes));
    }
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function togglePreview(files) {
    var holder = $('previewHolder');
    if (!holder) return;
    if (holder.firstChild) { holder.textContent = ''; return; }
    var html = buildPreview(files);
    if (!html) { toast('This project has no index.html to preview.'); return; }
    var wrap = el('div', 'preview-box');
    var bar = el('div', 'preview-bar');
    bar.appendChild(el('span', null, 'Live preview'));
    var close = el('button', 'btn small', 'Close');
    close.type = 'button';
    close.addEventListener('click', function () { holder.textContent = ''; });
    bar.appendChild(close);
    var frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    frame.setAttribute('title', 'Project preview');
    frame.srcdoc = html;
    wrap.appendChild(bar);
    wrap.appendChild(frame);
    holder.appendChild(wrap);
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function demoPlan(prompt, name) {
    return {
      project_name: name || 'My new project',
      summary: prompt,
      architecture: [
        'A simple web page for the main screen',
        'Styles so it looks good on a phone',
        'Code for the buttons and features',
        'A place to keep data, if the idea needs one',
        'Publishing on Cloudflare Pages'
      ],
      files: [],
      next_steps: [
        'Connect the AI key (see the note above)',
        'Tap Generate again to get the real project files',
        'Download the zip and test it on your phone',
        'Upload to GitHub and publish on Cloudflare Pages'
      ]
    };
  }

  /* ---------- generate ---------- */
  var busy = false;
  $('generateBtn').addEventListener('click', function () {
    if (busy) return;
    var prompt = promptBox.value.trim();
    var name = $('projectName').value.trim();
    if (!prompt) { showNotice('Please describe what you want to build first.', 'err'); promptBox.focus(); return; }
    if (prompt.length > 5000) { showNotice('Please keep your description under 5,000 characters.', 'err'); return; }

    var btn = $('generateBtn');
    busy = true;
    btn.disabled = true;
    btn.classList.add('busy');
    btn.querySelector('.go-label').textContent = 'Building your project, please wait';
    showNotice('This can take up to a minute. Keep this page open.');

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 110000);

    fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, projectName: name, mode: mode }),
      signal: ctrl.signal
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { res: res, data: data }; });
    }).then(function (o) {
      if (o.res.ok && o.data && Array.isArray(o.data.files)) {
        hideNotice();
        renderResult(name, o.data, false);
        remember(name || o.data.project_name, prompt, o.data);
        toast('Your project is ready.');
      } else if (o.res.status === 503 || o.res.status === 404) {
        showNotice('The AI is not connected yet. Add the OPENAI_API_KEY secret in Cloudflare and redeploy. A sample plan is shown below.', '');
        renderResult(name, demoPlan(prompt, name), true);
      } else if (o.res.status === 401 || o.res.status === 403) {
        showNotice('Please sign in again. Refresh this page and log in with your email.', 'err');
      } else {
        showNotice((o.data && o.data.error) || 'The AI could not finish this request. Please try again.', 'err');
      }
    }).catch(function (err) {
      if (err && err.name === 'AbortError') {
        showNotice('That took too long. Try a smaller idea, or tap Generate again.', 'err');
      } else {
        showNotice('Could not reach the AI. Check your internet and try again.', 'err');
      }
    }).then(function () {
      clearTimeout(timer);
      busy = false;
      btn.disabled = false;
      btn.classList.remove('busy');
      btn.querySelector('.go-label').textContent = 'Generate my project';
    });
  });

  function remember(name, prompt, result) {
    projects.unshift({
      id: String(Date.now()),
      name: name || 'Untitled project',
      date: new Date().toLocaleDateString(),
      prompt: prompt,
      result: result
    });
    projects = projects.slice(0, 12);
    if (!saveProjects()) {
      // storage full: keep only the newest and drop file contents of older ones
      projects = projects.slice(0, 1);
      saveProjects();
    }
  }

  /* ---------- projects list ---------- */
  function renderProjects() {
    var list = $('projectList');
    list.textContent = '';
    if (!projects.length) {
      list.appendChild(el('div', 'empty', 'No projects yet. Go to the Studio and tap Generate.'));
      return;
    }
    projects.forEach(function (p) {
      var row = el('div', 'proj');
      var info = el('div');
      info.appendChild(el('b', null, p.name));
      info.appendChild(el('br'));
      var count = p.result && p.result.files ? p.result.files.length : 0;
      info.appendChild(el('small', null, p.date + ' · ' + count + ' file' + (count === 1 ? '' : 's')));
      row.appendChild(info);
      var acts = el('div', 'proj-actions');
      var open = el('button', 'btn small primary', 'Open');
      open.type = 'button';
      open.addEventListener('click', function () {
        showView('studio');
        $('projectName').value = p.name;
        promptBox.value = p.prompt || '';
        updateCount();
        renderResult(p.name, p.result, false);
      });
      var zip = el('button', 'btn small', 'Download zip');
      zip.type = 'button';
      zip.addEventListener('click', function () { downloadZip(p.name, p.result && p.result.files); });
      var del = el('button', 'btn small danger', 'Delete');
      del.type = 'button';
      del.addEventListener('click', function () {
        if (!confirm('Delete "' + p.name + '" from this browser?')) return;
        projects = projects.filter(function (x) { return x.id !== p.id; });
        saveProjects();
        renderProjects();
      });
      acts.appendChild(open);
      if (count) acts.appendChild(zip);
      acts.appendChild(del);
      row.appendChild(acts);
      list.appendChild(row);
    });
  }

  updateCount();
})();
