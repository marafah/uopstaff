/* «جدولنا معاً»: the weekly timetables of a group — students (each from a «مخطط جدولي» link or the plan saved in this
   browser) and instructors — on one week, with the times when everyone is free. For project teams, study groups and
   meetings with a supervisor. The group lives in the link: ?p=<name>*<section key>~<section key>&i=<instructor id> */
(function () {
  'use strict';
  const U = window.UOP, { $, esc, norm, toMin, toTime, live } = U;
  let TT, IDX, BYKEY;
  const st = { members: [], from: 8 * 60, to: 18 * 60, min: 60, off: new Set() };
  const COLORS = U.PALETTE.map(p => p[0]);
  const STEP = 30;

  function read() {
    const p = new URLSearchParams(location.search);
    p.getAll('p').forEach(v => { const i = v.indexOf('*'); if (i < 1) return; add({ kind: 'student', name: v.slice(0, i), keys: v.slice(i + 1).split('~').filter(k => BYKEY[k]) }, true); });
    p.getAll('i').forEach(id => { const I = IDX.instructors.find(x => x.id === id); if (I) add({ kind: 'instructor', name: I.name, id }, true); });
    if (p.get('h')) { const [a, b] = p.get('h').split('-').map(Number); if (a >= 0 && b > a) { st.from = a * 60; st.to = b * 60; } }
  }
  function write() {
    const p = new URLSearchParams();
    st.members.forEach(m => m.kind === 'student' ? p.append('p', m.name + '*' + m.keys.join('~')) : p.append('i', m.id));
    if (st.from !== 480 || st.to !== 1080) p.set('h', `${st.from / 60}-${st.to / 60}`);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }
  function add(m, quiet) {
    if (st.members.some(x => x.kind === m.kind && (m.kind === 'instructor' ? x.id === m.id : x.name === m.name))) return toastMsg('موجود في المجموعة', quiet);
    m.color = COLORS[st.members.length % COLORS.length];
    st.members.push(m);
    if (!quiet) { write(); render(); }
  }
  function toastMsg(t, quiet) { if (!quiet) { const e = $('#tg-msg'); if (e) { e.textContent = t; setTimeout(() => { e.textContent = ''; }, 2500); } } }
  // the busy blocks of one member: lectures with a time (online ones too: the student is in class); asynchronous ones have none
  function busy(m) {
    const secs = m.kind === 'student' ? m.keys.map(k => BYKEY[k]) : TT.sections.filter(s => s.instructor === m.name);
    const out = [];
    secs.forEach(s => s.meetings.filter(x => live(x) && x.start).forEach(x => out.push({ day: x.day, a: toMin(x.start), b: toMin(x.end), s })));
    return out;
  }
  const days = () => U.WEEK.filter(d => d !== 'ج' && (d !== 'س' || st.members.some(m => busy(m).some(b => b.day === 'س'))));

  function render() {
    const on = st.members.filter(m => !st.off.has(m));
    const B = new Map(on.map(m => [m, busy(m)]));
    const ds = days();
    const cells = [];
    for (let t = st.from; t < st.to; t += STEP) cells.push(t);
    const who = (d, t) => on.filter(m => B.get(m).some(x => x.day === d && x.a < t + STEP && t < x.b));
    // free for everyone: runs of empty cells, at least st.min long
    const free = {};
    ds.forEach(d => {
      const runs = []; let s = null;
      cells.concat(st.to).forEach(t => { const empty = t < st.to && !who(d, t).length; if (empty && s == null) s = t; if (!empty && s != null) { runs.push([s, t]); s = null; } });
      free[d] = runs.filter(([a, b]) => b - a >= st.min);
    });
    const nFree = Object.values(free).reduce((a, r) => a + r.length, 0);
    const mySaved = (() => { try { return JSON.parse(localStorage.getItem('uopstaff-planner') || 'null'); } catch (e) { return null; } })();
    const myKeys = mySaved ? Object.values(mySaved.pick || {}).filter(k => BYKEY[k]) : [];
    $('#tg-app').innerHTML = `
      <div class="row g-3">
        <div class="col-xl-4"><section class="card mb-3"><div class="card-header"><i class="bi bi-people-fill"></i> المجموعة <small class="text-muted">${st.members.length}</small></div>
          <div class="card-body">
            <div class="tg-members">${st.members.map((m, i) => `<div class="tg-m ${st.off.has(m) ? 'off' : ''}" style="--c:${m.color}">
              <input type="checkbox" class="form-check-input" data-on="${i}" ${st.off.has(m) ? '' : 'checked'} title="إظهار في الجدول">
              <span><b>${esc(m.kind === 'instructor' ? U.shortName(m.name) : m.name)}</b><small>${m.kind === 'instructor' ? 'مدرس' : 'طالب'} · ${U.count(busy(m).length, 'محاضرة', 'محاضرتان', 'محاضرات', 'محاضرة')} أسبوعياً</small></span>
              <button type="button" class="btn btn-sm btn-link text-danger" data-rm="${i}" aria-label="إزالة"><i class="bi bi-x-lg"></i></button></div>`).join('')
              || '<p class="text-muted small mb-2">أضف أعضاء المجموعة: كل طالب يرسل رابط خطته من «مخطط جدولي»، ويمكن إضافة المدرس المشرف.</p>'}</div>
            <hr>
            <label class="small fw-bold" for="tg-name">طالب</label>
            <input class="form-control form-control-sm mb-1" id="tg-name" placeholder="الاسم (مثلاً: أحمد)">
            <input class="form-control form-control-sm mb-1" id="tg-link" placeholder="الصق رابط خطته من «مخطط جدولي»" dir="ltr">
            <div class="d-flex flex-wrap gap-2 mb-2"><button type="button" class="btn btn-sm btn-maroon" id="tg-add"><i class="bi bi-person-plus"></i> إضافة</button>
              ${myKeys.length ? `<button type="button" class="btn btn-sm btn-outline-secondary" id="tg-me"><i class="bi bi-person-check"></i> خطتي المحفوظة هنا (${myKeys.length} شعبة)</button>` : ''}
              <a class="btn btn-sm btn-link" href="planner.html" target="_blank"><i class="bi bi-box-arrow-up-left"></i> مخطط جدولي</a></div>
            <label class="small fw-bold" for="tg-ins">مدرس</label>
            <input class="form-control form-control-sm" id="tg-ins" list="tg-inslist" placeholder="اكتب اسم المدرس…">
            <datalist id="tg-inslist">${IDX.instructors.filter(i => i.sections).map(i => `<option value="${esc(i.name)}">${esc(i.department || '')}</option>`).join('')}</datalist>
            <small class="d-block text-danger mt-1" id="tg-msg"></small>
          </div></section>
          ${st.members.length ? `<section class="card mb-3"><div class="card-header"><i class="bi bi-check2-circle"></i> أوقات فراغ الجميع <small class="text-muted">${nFree}</small></div>
            <div class="card-body tg-free">${ds.map(d => free[d].length ? `<div><b>${U.DAYS[d]}</b>${free[d].map(([a, b]) => `<span><bdi dir="ltr">${toTime(a)}–${toTime(b)}</bdi> <small>${U.mins(b - a)}</small></span>`).join('')}</div>` : '').join('')
              || '<p class="text-muted small mb-0">لا وقت فراغ مشترك بهذه المدة ضمن الساعات المختارة.</p>'}</div></section>` : ''}
        </div>
        <div class="col-xl-8"><section class="card"><div class="card-header d-flex flex-wrap gap-2 align-items-center"><span><i class="bi bi-calendar-week"></i> الأسبوع</span>
            <span class="ms-auto d-flex flex-wrap gap-2 align-items-center small no-print">
              <label>من <select class="form-select form-select-sm d-inline-block w-auto" id="tg-from">${[7, 8, 9, 10, 11, 12].map(h => `<option value="${h}" ${st.from === h * 60 ? 'selected' : ''}>${h}:00</option>`).join('')}</select></label>
              <label>إلى <select class="form-select form-select-sm d-inline-block w-auto" id="tg-to">${[14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map(h => `<option value="${h}" ${st.to === h * 60 ? 'selected' : ''}>${h}:00</option>`).join('')}</select></label>
              <label>أقل مدة <select class="form-select form-select-sm d-inline-block w-auto" id="tg-min">${[30, 60, 90, 120].map(m => `<option value="${m}" ${st.min === m ? 'selected' : ''}>${U.mins(m)}</option>`).join('')}</select></label>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="tg-share" ${st.members.length ? '' : 'disabled'}><i class="bi bi-link-45deg"></i> نسخ رابط المجموعة</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="tg-print" ${st.members.length ? '' : 'disabled'}><i class="bi bi-printer"></i> طباعة</button></span></div>
          <div class="table-responsive"><table class="tg-grid"><thead><tr><th></th>${ds.map(d => `<th>${U.DAYS[d]}</th>`).join('')}</tr></thead><tbody>
            ${cells.map(t => `<tr class="${t % 60 ? 'half' : ''}"><th>${t % 60 ? '' : toTime(t)}</th>${ds.map(d => { const w = who(d, t);
              return `<td class="${on.length && !w.length ? 'free' : ''}" title="${w.length ? esc(w.map(m => U.shortName(m.name)).join('، ')) : on.length ? 'الجميع متفرغ' : ''}">${w.map(m => `<i style="background:${m.color}"></i>`).join('')}</td>`; }).join('')}</tr>`).join('')}
          </tbody></table></div>
          <p class="small text-muted px-3 py-2 mb-0"><span class="tg-key free"></span> الجميع متفرغ · كل لون عضو مشغول في ذلك الوقت. المحاضرات الإلكترونية المتزامنة تُعدّ انشغالاً، وغير المتزامنة لا موعد لها.</p></section></div>
      </div>`;
    document.querySelectorAll('[data-on]').forEach(c => c.addEventListener('change', () => { const m = st.members[+c.dataset.on]; c.checked ? st.off.delete(m) : st.off.add(m); render(); }));
    document.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { st.members.splice(+b.dataset.rm, 1); st.members.forEach((m, i) => { m.color = COLORS[i % COLORS.length]; }); write(); render(); }));
    $('#tg-add').addEventListener('click', () => {
      const name = $('#tg-name').value.trim(), link = $('#tg-link').value.trim();
      let keys = [];
      try { keys = (new URL(link, location.href).searchParams.get('plan') || '').split('~').filter(k => BYKEY[k]); } catch (e) { /* not a link */ }
      if (!keys.length) return toastMsg('الرابط لا يحتوي خطة من «مخطط جدولي» (اختر الشعب ثم «نسخ رابط الخطة»)');
      add({ kind: 'student', name: name || `طالب ${st.members.filter(m => m.kind === 'student').length + 1}`, keys });
    });
    const me = $('#tg-me'); if (me) me.addEventListener('click', () => add({ kind: 'student', name: $('#tg-name').value.trim() || 'أنا', keys: myKeys }));
    $('#tg-ins').addEventListener('change', e => { const I = IDX.instructors.find(i => i.name === e.target.value.trim()); if (I) add({ kind: 'instructor', name: I.name, id: I.id }); });
    $('#tg-from').addEventListener('change', e => { st.from = +e.target.value * 60; write(); render(); });
    $('#tg-to').addEventListener('change', e => { st.to = +e.target.value * 60; write(); render(); });
    $('#tg-min').addEventListener('change', e => { st.min = +e.target.value; render(); });
    $('#tg-share').addEventListener('click', e => navigator.clipboard.writeText(location.href).then(() => { e.currentTarget.innerHTML = '<i class="bi bi-check2"></i> نُسخ الرابط'; }));
    $('#tg-print').addEventListener('click', () => printReport({
      title: 'جدولنا معاً', subtitle: on.map(m => m.kind === 'instructor' ? U.shortName(m.name) : m.name).join('، '), orientation: 'portrait', fit: true,
      stats: [['أعضاء', on.length], ['أوقات فراغ مشتركة', nFree], ['أقل مدة', U.mins(st.min)]],
      sections: [{ title: 'أوقات فراغ الجميع', columns: ['اليوم', 'الأوقات'], widths: ['20%', '80%'],
        rows: ds.filter(d => free[d].length).map(d => [U.DAYS[d], free[d].map(([a, b]) => `${toTime(a)}–${toTime(b)}`).join('   ·   ')]) },
        { title: 'الأعضاء', columns: ['العضو', 'المحاضرات'], widths: ['22%', '78%'],
          rows: on.map(m => [m.kind === 'instructor' ? U.shortName(m.name) : m.name, B.get(m).sort((x, y) => U.WEEK.indexOf(x.day) - U.WEEK.indexOf(y.day) || x.a - y.a)
            .map(x => `${U.DAYS[x.day]} ${toTime(x.a)}–${toTime(x.b)}`).join('، ')]) }],
    }));
  }

  Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/instructors.json')]).then(([tt, idx]) => {
    TT = tt; IDX = idx;
    if (tt.days) U.setDays(tt.days);
    BYKEY = {};
    tt.sections.forEach(s => { BYKEY[U.sectionKey(s)] = s; });
    U.updatedLine(tt.updated, tt.term);
    read();
    render();
  }).catch(() => { $('#tg-app').innerHTML = '<div class="alert alert-warning">تعذّر تحميل الجدول الدراسي. أعد المحاولة بعد قليل.</div>'; });
})();
