(() => {
  'use strict';

  // ---------- Storage ----------
  const STORAGE_KEY = 'fiber-billing-v1';

  function defaultState() {
    return {
      settings: {
        yourName: '',
        business: '',
        address: '',
        phone: '',
        email: '',
        contractorName: 'Community Fiber Solutions',
        contractorAddress: '',
        paymentTerms: 'Due upon receipt',
        nextInvoiceNumber: 1001,
      },
      rates: window.DEFAULT_RATES.map((r) => ({ ...r })),
      projects: [],
    };
  }

  // Keep a task's billing codes in code order, whatever order they were added in.
  const byCode = (a, b) => String(a.code).localeCompare(String(b.code), 'en', { numeric: true });
  function sortItems(t) {
    if (Array.isArray(t.items)) t.items.sort(byCode);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      const base = defaultState();
      return {
        settings: { ...base.settings, ...(data.settings || {}) },
        rates: Array.isArray(data.rates) ? data.rates : base.rates,
        projects: (Array.isArray(data.projects) ? data.projects : []).map((p) => {
          (p.tasks || []).forEach(sortItems);
          return p;
        }),
      };
    } catch (e) {
      console.error('Could not load saved data', e);
      return defaultState();
    }
  }

  let state = load();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      alert('Could not save data on this device: ' + e.message);
    }
  }

  // ---------- Helpers ----------
  const $app = document.getElementById('app');
  const $dialog = document.getElementById('dialog');

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const money = (n) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const round2 = (n) => Math.round(n * 100) / 100;
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${m}/${d}/${y}`;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

  const itemTotal = (it) => round2(it.qty * it.price);
  const taskTotal = (t) => round2(t.items.reduce((s, it) => s + itemTotal(it), 0));
  const projectTotal = (p) => round2(p.tasks.reduce((s, t) => s + taskTotal(t), 0));
  const findProject = (id) => state.projects.find((p) => p.id === id);
  const findRate = (code) => state.rates.find((r) => r.code === code);

  const STATUS_LABEL = { active: 'Active', complete: 'Complete', invoiced: 'Invoiced', paid: 'Paid' };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function codeSummary(p) {
    const map = new Map();
    for (const t of p.tasks) {
      for (const it of t.items) {
        const key = it.code + '|' + it.price;
        const row = map.get(key) || { code: it.code, desc: it.desc, price: it.price, qty: 0 };
        row.qty += it.qty;
        map.set(key, row);
      }
    }
    return [...map.values()].sort(byCode);
  }

  // Dialog with a title bar, scrolling body and a fixed button row.
  // A close event can arrive late (after the next dialog has already opened),
  // so only run the handler once the dialog is really closed.
  let onDialogClose = null;
  $dialog.addEventListener('close', () => {
    if ($dialog.open || !onDialogClose) return;
    const cb = onDialogClose;
    onDialogClose = null;
    cb();
  });

  function openDialog({ title, sub = '', body, foot, form = true, flush = false, onClose = null }, onMount) {
    onDialogClose = onClose;
    const tag = form ? 'form method="dialog"' : 'div';
    $dialog.innerHTML = `
      <${tag} class="sheet">
        <div class="sheet-head"><h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ''}</div>
        <div class="sheet-body form${flush ? ' flush' : ''}">${body}</div>
        <div class="sheet-foot">${foot}</div>
      </${form ? 'form' : 'div'}>`;
    $dialog.showModal();
    $dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => $dialog.close()));
    if (onMount) onMount($dialog);
  }

  // ---------- Router ----------
  // route() runs on navigation (and resets scroll); render() redraws in place.
  function route() {
    window.scrollTo(0, 0);
    render();
  }

  function render() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const tab = parts[0] === 'settings' ? 'settings' : 'projects';
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === tab));
    $app.classList.remove('has-bar');
    if (parts[0] === 'project' && parts[1]) {
      const p = findProject(parts[1]);
      if (!p) return renderNotFound();
      if (parts[2] === 'invoice') return renderInvoice(p);
      return renderProject(p);
    }
    if (parts[0] === 'settings') return renderSettings();
    return renderProjects();
  }

  function renderNotFound() {
    $app.innerHTML = `<div class="empty">Project not found.</div><a class="btn" href="#/">Back to projects</a>`;
  }

  // ---------- Projects list ----------
  function renderProjects() {
    const projects = [...state.projects].sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    const setupNeeded = !state.settings.yourName && !state.settings.business;
    const sum = (statuses) => round2(projects.filter((p) => statuses.includes(p.status)).reduce((s, p) => s + projectTotal(p), 0));
    $app.innerHTML = `
      <div class="page-head">
        <h1 class="grow">Projects</h1>
        <button class="btn primary" id="addProject">+ New project</button>
      </div>
      ${setupNeeded ? `<div class="notice">Add your name and contact info in <a href="#/settings">Settings</a> so it shows on invoices.</div>` : ''}
      ${projects.length === 0 ? `<div class="empty">No projects yet. Tap <b>+ New project</b> to start.</div>` : `
      <div class="stats">
        <div><div class="k">Unbilled</div><div class="v">${money(sum(['active', 'complete']))}</div></div>
        <div><div class="k">Invoiced</div><div class="v">${money(sum(['invoiced']))}</div></div>
        <div><div class="k">Paid</div><div class="v">${money(sum(['paid']))}</div></div>
      </div>
      <div class="plist">
        ${projects.map((p) => `
          <a class="prow" href="#/project/${p.id}">
            <span class="grow">
              <span class="prow-name">${esc(p.name)}</span>
              <span class="prow-meta sub">${p.location ? esc(p.location) + ' · ' : ''}${plural(p.tasks.length, 'task')} · ${fmtDate(p.created)}</span>
            </span>
            <span class="prow-side">
              <span class="amount">${money(projectTotal(p))}</span>
              <span class="badge ${p.status}">${STATUS_LABEL[p.status] || p.status}</span>
            </span>
          </a>`).join('')}
      </div>`}
    `;
    document.getElementById('addProject').addEventListener('click', () => projectDialog());
  }

  function projectDialog(existing) {
    const p = existing || { name: '', location: '', notes: '' };
    openDialog({
      title: existing ? 'Edit project' : 'New project',
      body: `
        <label>Project name<input name="name" required value="${esc(p.name)}" placeholder="e.g. Scarborough St"></label>
        <div class="grid2">
          <label>Location / city<input name="location" value="${esc(p.location)}" placeholder="e.g. Columbus, OH"></label>
          <label>Job / PO # (optional)<input name="po" value="${esc(p.po || '')}"></label>
        </div>
        <label>Notes<textarea name="notes" rows="2">${esc(p.notes)}</textarea></label>`,
      foot: `
        ${existing ? `<button type="button" class="btn danger" id="deleteProject">Delete</button><span class="grow"></span>` : ''}
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">${existing ? 'Save' : 'Create'}</button>`,
    }, (d) => {
      const f = d.querySelector('form');
      f.name.focus();
      if (existing) {
        d.querySelector('#deleteProject').addEventListener('click', () => {
          if (!confirm(`Delete project "${existing.name}" and all its tasks? This cannot be undone.`)) return;
          state.projects = state.projects.filter((x) => x !== existing);
          save();
          d.close();
          location.hash = '#/';
        });
      }
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = f.name.value.trim();
        if (!name) return;
        const fields = { name, location: f.location.value.trim(), po: f.po.value.trim(), notes: f.notes.value.trim() };
        if (existing) {
          Object.assign(existing, fields);
          save();
          d.close();
          render();
        } else {
          const np = { id: uid(), ...fields, status: 'active', created: today(), tasks: [] };
          state.projects.push(np);
          save();
          d.close();
          location.hash = `#/project/${np.id}`;
        }
      });
    });
  }

  // ---------- Project detail ----------
  function renderProject(p) {
    const locked = p.status === 'invoiced' || p.status === 'paid';
    const meta = [p.location && esc(p.location), p.po && 'PO ' + esc(p.po), 'Started ' + fmtDate(p.created)].filter(Boolean).join(' · ');
    $app.classList.add('has-bar');
    $app.innerHTML = `
      <div class="page-head">
        <a href="#/" class="back" aria-label="All projects">&lsaquo;</a>
        <div class="grow">
          <h1>${esc(p.name)}</h1>
          <div class="sub">${meta}</div>
        </div>
        <button class="btn sm" id="editProject">Edit</button>
      </div>
      ${p.notes ? `<div class="sub phead-notes">${nl2br(p.notes)}</div>` : ''}
      <div class="seg" role="radiogroup" aria-label="Project status">
        ${Object.entries(STATUS_LABEL).map(([k, v]) => `<button type="button" role="radio" class="${k}" data-status="${k}" aria-checked="${p.status === k}">${v}</button>`).join('')}
      </div>

      <div class="sec-head"><h2>Tasks · ${p.tasks.length}</h2>${locked ? `<span class="sub">Locked – set Active or Complete to edit</span>` : ''}</div>
      ${p.tasks.length === 0 ? `<div class="empty">No tasks yet. Add one for each splice case or terminal.</div>` : ''}
      ${p.tasks.map((t, i) => renderTask(t, i, locked)).join('')}

      <div class="bar no-print">
        <div class="bar-in">
          <div class="grow"><div class="k">Project total</div><div class="v">${money(projectTotal(p))}</div></div>
          ${locked ? '' : `<button class="btn primary" id="addTask">+ Task</button>`}
          <a class="btn${locked ? ' primary' : ''}" href="#/project/${p.id}/invoice">Invoice</a>
        </div>
      </div>
    `;

    $app.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => {
      p.status = b.dataset.status;
      save();
      render();
    }));
    document.getElementById('editProject').addEventListener('click', () => projectDialog(p));
    if (!locked) document.getElementById('addTask').addEventListener('click', () => taskDialog(p));

    $app.querySelectorAll('[data-task]').forEach((el) => {
      const t = p.tasks.find((x) => x.id === el.dataset.task);
      if (!t || locked) return;
      el.querySelector('[data-act="add-code"]').addEventListener('click', () => codePicker(p, t));
      el.querySelector('[data-act="edit-task"]').addEventListener('click', () => taskDialog(p, t));
      el.querySelector('[data-act="dup-task"]').addEventListener('click', () => {
        const copy = { ...t, id: uid(), name: t.name + ' (copy)', items: t.items.map((it) => ({ ...it, id: uid() })) };
        p.tasks.splice(p.tasks.indexOf(t) + 1, 0, copy);
        save();
        render();
      });
      el.querySelectorAll('[data-item]').forEach((row) => {
        const it = t.items.find((x) => x.id === row.dataset.item);
        const setQty = (q) => {
          q = Math.max(0, Math.round(q * 100) / 100);
          if (q === 0) {
            if (!confirm(`Remove ${it.code} from this task?`)) return render();
            t.items = t.items.filter((x) => x !== it);
          } else {
            it.qty = q;
          }
          save();
          render();
        };
        row.querySelector('[data-act="minus"]').addEventListener('click', () => setQty(it.qty - 1));
        row.querySelector('[data-act="plus"]').addEventListener('click', () => setQty(it.qty + 1));
        const input = row.querySelector('input');
        input.addEventListener('focus', () => input.select());
        input.addEventListener('change', (e) => setQty(parseFloat(e.target.value) || 0));
      });
    });
  }

  function renderTask(t, i, locked) {
    return `
      <section class="task" data-task="${t.id}">
        <header class="task-head">
          <span class="task-n">${i + 1}</span>
          <span class="task-name">${esc(t.name)}</span>
          <span class="task-amt">${money(taskTotal(t))}</span>
        </header>
        ${t.notes ? `<div class="task-notes sub">${nl2br(t.notes)}</div>` : ''}
        ${t.items.length ? t.items.map((it) => `
          <div class="item" data-item="${it.id}">
            <div>
              <div><span class="code">${esc(it.code)}</span> <span class="each">@ ${money(it.price)}</span></div>
              <div class="item-desc sub" title="${esc(it.desc)}">${esc(it.desc)}</div>
            </div>
            ${locked ? `<span class="item-qty">× ${it.qty}</span>` : `
            <div class="stepper">
              <button type="button" data-act="minus" aria-label="Decrease ${esc(it.code)}">&minus;</button>
              <input type="number" inputmode="decimal" min="0" step="1" value="${it.qty}" aria-label="${esc(it.code)} quantity">
              <button type="button" data-act="plus" aria-label="Increase ${esc(it.code)}">+</button>
            </div>`}
            <div class="item-line">${money(itemTotal(it))}</div>
          </div>`).join('') : `<div class="none sub">No billing codes yet.</div>`}
        ${locked ? '' : `
        <footer class="task-foot">
          <button class="btn primary sm" data-act="add-code">+ Add code</button>
          <button class="btn sm" data-act="edit-task">Edit</button>
          <button class="btn sm" data-act="dup-task">Copy</button>
        </footer>`}
      </section>`;
  }

  function taskDialog(p, existing) {
    const t = existing || { name: '', notes: '' };
    openDialog({
      title: existing ? 'Edit task' : 'New task',
      body: `
        <label>Task name<input name="name" required value="${esc(t.name)}" placeholder="e.g. Splice case @ 123 Scarborough St"></label>
        <div class="chips">
          ${['Splice Case', 'Terminal', 'Pedestal', 'Ring Cut'].map((s) => `<button type="button" class="chip" data-suggest="${s}">${s}</button>`).join('')}
        </div>
        <label>Notes (address, pole #, fiber count…)<textarea name="notes" rows="2">${esc(t.notes)}</textarea></label>`,
      foot: `
        ${existing ? `<button type="button" class="btn danger" id="deleteTask">Delete</button><span class="grow"></span>` : ''}
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">${existing ? 'Save' : 'Add task'}</button>`,
    }, (d) => {
      const f = d.querySelector('form');
      f.name.focus();
      d.querySelectorAll('[data-suggest]').forEach((b) => b.addEventListener('click', () => {
        const n = p.tasks.filter((x) => x.name.startsWith(b.dataset.suggest)).length + 1;
        f.name.value = `${b.dataset.suggest} ${n}`;
        f.name.focus();
      }));
      if (existing) {
        d.querySelector('#deleteTask').addEventListener('click', () => {
          if (!confirm(`Delete task "${existing.name}"?`)) return;
          p.tasks = p.tasks.filter((x) => x !== existing);
          save();
          d.close();
          render();
        });
      }
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = f.name.value.trim();
        if (!name) return;
        if (existing) {
          existing.name = name;
          existing.notes = f.notes.value.trim();
          save();
          d.close();
          render();
        } else {
          const nt = { id: uid(), name, notes: f.notes.value.trim(), items: [] };
          p.tasks.push(nt);
          save();
          d.close();
          render();
          window.scrollTo(0, document.body.scrollHeight);
          codePicker(p, nt);
        }
      });
    });
  }

  function codePicker(p, t) {
    openDialog({
      title: 'Add codes',
      sub: esc(t.name) + ' — tap to add 1',
      form: false,
      flush: true,
      onClose: render,
      body: state.rates.map((r) => {
        const cur = t.items.find((x) => x.code === r.code);
        return `
          <button type="button" class="code-btn" data-code="${esc(r.code)}">
            <span class="code">${esc(r.code)}</span>
            <span class="desc">${esc(r.desc)}</span>
            <span class="price">${money(r.price)}</span>
            <span class="count">${cur ? cur.qty : ''}</span>
          </button>`;
      }).join(''),
      foot: `<span class="grow amount" id="pickTotal" style="align-self:center"></span><button type="button" class="btn primary" data-close>Done</button>`,
    }, (d) => {
      const total = d.querySelector('#pickTotal');
      const showTotal = () => { total.textContent = 'Task ' + money(taskTotal(t)); };
      showTotal();
      d.querySelectorAll('[data-code]').forEach((b) => b.addEventListener('click', () => {
        const r = findRate(b.dataset.code);
        let it = t.items.find((x) => x.code === r.code);
        if (it) it.qty += 1;
        else {
          it = { id: uid(), code: r.code, desc: r.desc, price: r.price, qty: 1 };
          t.items.push(it);
          sortItems(t);
        }
        save();
        b.querySelector('.count').textContent = it.qty;
        showTotal();
        b.classList.remove('flash');
        void b.offsetWidth;
        b.classList.add('flash');
      }));
    });
  }

  // ---------- Invoice ----------
  function renderInvoice(p) {
    const s = state.settings;
    if (!p.invoice) {
      p.invoice = { number: String(s.nextInvoiceNumber), date: today() };
      s.nextInvoiceNumber = (parseInt(s.nextInvoiceNumber, 10) || 1000) + 1;
      save();
    }
    const summary = codeSummary(p);
    const total = projectTotal(p);
    const showDetail = p.invoice.showDetail !== false;
    const from = [s.business, s.yourName].filter(Boolean);
    const billed = p.status === 'invoiced' || p.status === 'paid';

    $app.innerHTML = `
      <div class="no-print">
        <div class="page-head">
          <a href="#/project/${p.id}" class="back" aria-label="Back to ${esc(p.name)}">&lsaquo;</a>
          <div class="grow"><h1>Invoice</h1><div class="sub">${esc(p.name)}</div></div>
          <span class="badge ${p.status}">${STATUS_LABEL[p.status] || p.status}</span>
        </div>
        <div class="grid2">
          <label class="f">Invoice #<input id="invNum" value="${esc(p.invoice.number)}"></label>
          <label class="f">Date<input id="invDate" type="date" value="${esc(p.invoice.date)}"></label>
        </div>
        <label class="check"><input type="checkbox" id="invDetail" ${showDetail ? 'checked' : ''}> Include task-by-task breakdown</label>
        <div class="btn-row" style="margin:0.25rem 0 0.375rem">
          <button class="btn primary grow" id="print">Print / PDF</button>
          <button class="btn" id="csv">CSV</button>
          ${billed ? '' : `<button class="btn" id="markInvoiced">Mark invoiced</button>`}
        </div>
        <div class="sub" style="margin-bottom:0.5rem">Phone: tap Print, then “Save as PDF” (Android) or Share (iPhone).</div>
      </div>

      <article class="invoice">
        <header class="inv-head">
          <div>
            ${from.length ? `<div class="inv-from-name">${esc(from[0])}</div>` : `<div class="inv-from-name">Your name (set in Settings)</div>`}
            ${from[1] ? `<div>${esc(from[1])}</div>` : ''}
            ${s.address ? `<div>${nl2br(s.address)}</div>` : ''}
            ${s.phone ? `<div>${esc(s.phone)}</div>` : ''}
            ${s.email ? `<div>${esc(s.email)}</div>` : ''}
          </div>
          <div class="right">
            <div class="inv-title">INVOICE</div>
            <table class="meta">
              <tr><td>No.</td><td>${esc(p.invoice.number)}</td></tr>
              <tr><td>Date</td><td>${fmtDate(p.invoice.date)}</td></tr>
              ${s.paymentTerms ? `<tr><td>Terms</td><td>${esc(s.paymentTerms)}</td></tr>` : ''}
            </table>
          </div>
        </header>

        <section class="inv-parties">
          <div>
            <div class="label">Bill To</div>
            <div><b>${esc(s.contractorName)}</b></div>
            ${s.contractorAddress ? `<div>${nl2br(s.contractorAddress)}</div>` : ''}
          </div>
          <div>
            <div class="label">Project</div>
            <div><b>${esc(p.name)}</b></div>
            ${p.location ? `<div>${esc(p.location)}</div>` : ''}
            ${p.po ? `<div>Job/PO: ${esc(p.po)}</div>` : ''}
            <div>${plural(p.tasks.length, 'task')}</div>
          </div>
        </section>

        <table class="inv-table">
          <thead><tr><th>Code</th><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${summary.length ? summary.map((r) => `
              <tr><td>${esc(r.code)}</td><td>${esc(r.desc)}</td><td class="num">${r.qty}</td><td class="num">${money(r.price)}</td><td class="num">${money(r.qty * r.price)}</td></tr>`).join('')
              : `<tr><td colspan="5">No billing codes added yet.</td></tr>`}
          </tbody>
          <tfoot><tr><td colspan="4" class="num">Total Due</td><td class="num">${money(total)}</td></tr></tfoot>
        </table>

        ${showDetail && p.tasks.length ? `
        <h3>Detail by Task</h3>
        ${p.tasks.map((t, i) => `
          <div class="inv-task">
            <div class="inv-task-head"><span>${i + 1}. ${esc(t.name)}</span><span class="num">${money(taskTotal(t))}</span></div>
            ${t.notes ? `<div class="sub">${nl2br(t.notes)}</div>` : ''}
            <table class="inv-table compact">
              <tbody>
                ${t.items.map((it) => `<tr><td>${esc(it.code)}</td><td>${esc(it.desc)}</td><td class="num">${it.qty} × ${money(it.price)}</td><td class="num">${money(itemTotal(it))}</td></tr>`).join('') || `<tr><td colspan="4">No codes</td></tr>`}
              </tbody>
            </table>
          </div>`).join('')}` : ''}

        <footer class="inv-foot">Thank you!</footer>
      </article>
    `;

    const num = document.getElementById('invNum');
    const date = document.getElementById('invDate');
    num.addEventListener('change', () => { p.invoice.number = num.value.trim(); save(); render(); });
    date.addEventListener('change', () => { p.invoice.date = date.value || today(); save(); render(); });
    document.getElementById('invDetail').addEventListener('change', (e) => { p.invoice.showDetail = e.target.checked; save(); render(); });
    document.getElementById('print').addEventListener('click', () => {
      const prev = document.title;
      document.title = `Invoice ${p.invoice.number} - ${p.name}`;
      window.print();
      setTimeout(() => { document.title = prev; }, 1000);
    });
    document.getElementById('csv').addEventListener('click', () => downloadCsv(p));
    const mark = document.getElementById('markInvoiced');
    if (mark) mark.addEventListener('click', () => { p.status = 'invoiced'; save(); render(); });
  }

  function downloadCsv(p) {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Invoice #', 'Date', 'Project', 'Task', 'Code', 'Description', 'Qty', 'Rate', 'Amount']];
    for (const t of p.tasks) {
      for (const it of t.items) {
        rows.push([p.invoice.number, fmtDate(p.invoice.date), p.name, t.name, it.code, it.desc, it.qty, it.price.toFixed(2), itemTotal(it).toFixed(2)]);
      }
    }
    rows.push(['', '', '', '', '', 'TOTAL', '', '', projectTotal(p).toFixed(2)]);
    const csv = rows.map((r) => r.map(q).join(',')).join('\r\n');
    download(`Invoice-${p.invoice.number}-${p.name.replace(/[^\w-]+/g, '_')}.csv`, csv, 'text/csv');
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- Settings ----------
  function renderSettings() {
    const s = state.settings;
    $app.innerHTML = `
      <div class="page-head"><h1>Settings</h1></div>
      <form class="panel form" id="settingsForm">
        <div class="panel-head"><h2>Your info · on invoices</h2></div>
        <div class="panel-body">
          <div class="grid2">
            <label>Your name<input name="yourName" value="${esc(s.yourName)}"></label>
            <label>Business (optional)<input name="business" value="${esc(s.business)}"></label>
            <label>Phone<input name="phone" type="tel" value="${esc(s.phone)}"></label>
            <label>Email<input name="email" type="email" value="${esc(s.email)}"></label>
          </div>
          <label>Address<textarea name="address" rows="2">${esc(s.address)}</textarea></label>
        </div>
        <div class="panel-head"><h2>Contractor · bill to</h2></div>
        <div class="panel-body">
          <label>Contractor name<input name="contractorName" value="${esc(s.contractorName)}"></label>
          <label>Contractor address<textarea name="contractorAddress" rows="2">${esc(s.contractorAddress)}</textarea></label>
          <div class="grid2">
            <label>Payment terms<input name="paymentTerms" value="${esc(s.paymentTerms)}"></label>
            <label>Next invoice #<input name="nextInvoiceNumber" inputmode="numeric" value="${esc(s.nextInvoiceNumber)}"></label>
          </div>
          <button class="btn primary full" type="submit">Save info</button>
        </div>
      </form>

      <div class="panel">
        <div class="panel-head"><h2>Billing codes</h2></div>
        <div class="panel-body">
          <p class="sub">New rates apply to codes added from now on. Codes already on tasks keep their price.</p>
          <table class="rates">
            <thead><tr><th>Code</th><th>Description</th><th>Rate $</th><th></th></tr></thead>
            <tbody>
              ${state.rates.map((r, i) => `
                <tr data-rate="${i}">
                  <td><input name="code" value="${esc(r.code)}" aria-label="Code"></td>
                  <td><input name="desc" value="${esc(r.desc)}" aria-label="Description"></td>
                  <td><input name="price" type="number" step="0.01" inputmode="decimal" value="${r.price}" aria-label="Rate"></td>
                  <td><button class="btn sm danger" data-act="del-rate" aria-label="Delete ${esc(r.code)}">✕</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
          <div class="btn-row" style="margin-top:0.375rem">
            <button class="btn primary grow" id="saveRates">Save codes</button>
            <button class="btn" id="addRate">+ Code</button>
            <button class="btn" id="resetRates">Reset</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Backup</h2></div>
        <div class="panel-body">
          <p class="sub">Data is saved on this device only. Download a backup now and then; restore it to move to another phone or computer.</p>
          <div class="btn-row">
            <button class="btn grow" id="exportData">Download backup</button>
            <label class="btn grow">Restore backup<input type="file" id="importData" accept="application/json,.json" hidden></label>
          </div>
        </div>
      </div>
    `;

    const f = document.getElementById('settingsForm');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      for (const k of Object.keys(s)) if (f[k]) s[k] = f[k].value.trim();
      s.nextInvoiceNumber = parseInt(s.nextInvoiceNumber, 10) || 1001;
      save();
      flash('Settings saved');
    });

    const readRates = () => [...$app.querySelectorAll('[data-rate]')].map((row) => ({
      code: row.querySelector('[name=code]').value.trim(),
      desc: row.querySelector('[name=desc]').value.trim(),
      price: round2(parseFloat(row.querySelector('[name=price]').value) || 0),
    })).filter((r) => r.code);

    document.getElementById('addRate').addEventListener('click', () => {
      state.rates = readRates();
      state.rates.push({ code: '', desc: '', price: 0 });
      renderSettings();
      const inputs = $app.querySelectorAll('[data-rate] [name=code]');
      inputs[inputs.length - 1].focus();
    });
    $app.querySelectorAll('[data-act="del-rate"]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.closest('[data-rate]').dataset.rate;
      state.rates = readRates().filter((_, j) => j !== i);
      save();
      renderSettings();
    }));
    document.getElementById('saveRates').addEventListener('click', () => {
      const rates = readRates();
      const codes = rates.map((r) => r.code);
      if (new Set(codes).size !== codes.length) return alert('Each code must be unique.');
      state.rates = rates;
      save();
      flash('Billing codes saved');
    });
    document.getElementById('resetRates').addEventListener('click', () => {
      if (!confirm('Replace your billing codes with the original rate sheet?')) return;
      state.rates = window.DEFAULT_RATES.map((r) => ({ ...r }));
      save();
      renderSettings();
    });
    document.getElementById('exportData').addEventListener('click', () => {
      download(`fiber-billing-backup-${today()}.json`, JSON.stringify(state, null, 2), 'application/json');
    });
    document.getElementById('importData').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.projects)) throw new Error('Not a Fiber Billing backup file');
        if (!confirm('Replace ALL data on this device with this backup?')) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        state = load();
        flash('Backup restored');
        renderSettings();
      } catch (err) {
        alert('Could not restore backup: ' + err.message);
      }
    });
  }

  function flash(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  // ---------- Boot ----------
  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    // When an updated version takes over, reload once so it shows right away.
    const hadWorker = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadWorker || reloaded) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch(() => {});
  }
})();
