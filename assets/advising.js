/* «مكتب الإرشاد»: academic advising from the student's own «تحليل خطة الطالب» (the PDF printed by the university's
   registration system). Everything is read in this browser: the PDF never leaves the device.
     student  – one student: where they stand in each requirement group, what they may register next (prerequisites from
                the PDF itself), a priority for each course, and a clash-free suggested schedule built from the sections
                published in the timetable now (refreshed hourly from the portal), within the official load limits
     board    – many students' PDFs at once: expected graduates, students on warning, demand for each course, required
                courses not offered this term
     fresh    – a new student: the first term of the department's guidance plan, with the remedial courses of the
                placement tests, as a clash-free schedule
     dict     – the course dictionary: every code and name across the plans, the same name under another code (old and
                new codes), and a list of equivalent courses that anyone can upload (kept on this device, exportable)
     rules    – the official rules the page applies, quoted with their article numbers and a link to the instructions
   Deep links: ?view=student|board|fresh|dict|rules&q=<code or name> */
(function (root) {
  'use strict';

  // ================================================================ core (no page needed: also run by the tests)
  const norm = s => String(s || '').toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const live = m => m.mode !== 'غير متزامن';
  const AR = /[؀-ۿ]/;
  const clean = s => String(s || '').normalize('NFKC').replace(/[ـُْ]/g, '').replace(/\s+/g, ' ').trim();
  const bare = s => norm(clean(s)).replace(/[\s:]/g, '');

  // the official instructions the page applies (تعليمات منح درجة البكالوريوس في جامعة البترا، رقم 17 لسنة 2023)
  const BACH_URL = 'https://www.uop.edu.jo/Ar/MoreAbout/Documents/%D8%AA%D8%B9%D9%84%D9%8A%D9%85%D8%A7%D8%AA%20%D9%85%D9%8E%D9%86%D9%92%D8%AD%20%D8%AF%D8%B1%D8%AC%D8%A9%20%D8%A7%D9%84%D8%A8%D9%83%D8%A7%D9%84%D9%88%D8%B1%D9%8A%D9%88%D8%B3%20%D9%81%D9%8A%20%D8%AC%D8%A7%D9%85%D8%B9%D8%A9%20%D8%A7%D9%84%D8%A8%D8%AA%D8%B1%D8%A7.pdf';
  const REGS_PAGE = 'https://www.uop.edu.jo/Ar/MoreAbout/Pages/GuideLawsRegulationsInstructions.aspx';
  const LOAD = { regular: 18, summer: 10, gradRegular: 21, gradSummer: 13, min: 12 };
  const RULES = [
    { id: '7', title: 'المادة (7): العبء الدراسي', page: 7, uses: 'الحد الأعلى والأدنى للساعات في المقترح',
      text: ['(ما لم تصدر قرارات لاحقة من قبل مجلس التعليم العالي بهذا الخصوص) تكون أعباء الطلبة على النحو التالي:',
        'أ. الحد الأعلى للعبء الدراسي هو (18) ساعة معتمدة للفصل الاعتيادي الواحد و(10) ساعات معتمدة للفصل الصيفي.',
        'ب. الحد الأعلى لعبء الطالب المتوقع تخرجه هو (21) ساعة في الفصل الاعتيادي و(13) ساعة في الفصل الصيفي.',
        'ج. الحد الأدنى للعبء الدراسي للطالب هو (12) ساعة معتمدة للفصل الاعتيادي، ويجوز إنقاص الحد الأدنى في حالات مسوغة، يوافق عليها عميد الكلية، ويُعلم عميد القبول والتسجيل بذلك خطياً.',
        'د. يجوز للطالب في فصل التخرج أن لا يتقيد بالحد الأدنى المشار إليه في الفقرة (ج) من هذه المادة.'] },
    { id: '5h', title: 'المادة (5/هـ): المتطلبات السابقة', page: 6, uses: 'لا تُقترح مادة قبل النجاح في متطلباتها السابقة',
      text: ['1. على الطالب أن يدرس المواد ذات المتطلبات السابقة، بعد النجاح في تلك المتطلبات.',
        '2. يجوز لعميد الكلية المعني أن يسمح للطالب بدراسة مواد، دون اجتياز المتطلب السابق، في الحالات التي تتطلب ذلك، ويُعلم عميد القبول والتسجيل خطياً بذلك.'] },
    { id: '11', title: 'المادة (11): إعادة دراسة المواد – المواد البديلة', page: 12, uses: 'أولوية إعادة المادة الإجبارية، والمواد البديلة للمتوقع تخرجه',
      text: ['أ. يتوجب على الطالب إعادة دراسة المواد الإجبارية إذا رسب فيها، أما في حال رسوبه في مادة اختيارية، فيحق له إعادة دراسة المادة نفسها، أو اختيار غيرها، حسب ما هو متوفر في خطة القسم المختص.',
        'ب. إذا أعاد الطالب دراسة مادة ما، تُحسب له أعلى علامة حصل عليها، وتُثبت في سجله العلامات جميعها التي حصل عليها.',
        'ج. لا تدخل الساعات المعتمدة - في حال إعادة دراسة المادة - سوى مرة واحدة في حساب عدد الساعات المطلوبة للتخرج.',
        'د. إذا توقف تخرج الطالب على دراسة مادتين إجباريتين على الأكثر، ولم تطرحا في فصل التخرج، أو تعارضت أي منهما مع مواد إجبارية أخرى، فيجوز للعميد – بعد تنسيب من رئيس القسم المختص – أن يوافق على أن يدرس الطالب مادتين بديلتين عنهما حداً أقصى، على أن تكون المادة البديلة مكافئة للمادة الأصيلة من حيث المستوى، وعدد الساعات المعتمدة، وتكون المادة البديلة ضمن المواد الاختيارية للتخصص، وفي حال عدم توافرها فبالإمكان منحها من أقسام أخرى في الكلية (وفي حالات استثنائية من خارج الكلية) شريطة أن يتم التنسيب إلى عميد الكلية بهذه المادة البديلة من قبل لجنة مكونة من رئيس القسم المختص وعضوي هيئة تدريس من القسم بحيث يتم تحقيق مخرجات المادة الأصيلة، ما أمكن، مع إعلام عميد القبول والتسجيل خطياً بذلك.'] },
    { id: '12', title: 'المادة (12): وضع الطالب على قائمة الإنذار', page: 13, uses: 'تنبيه الطالب المنذر، والطلبة المتعثرون في لوحة المرشد',
      text: ['أ. يُنذر كل طالب يحصل على معدل تراكمي يقل عن (2.00) نقطتين.',
        'ب. على الطالب إزالة الإنذار في مدة أقصاها فصلان دراسيان اعتياديان، لاحقان للفصل الذي أُنذر فيه، ويزيل الطالب الإنذار بأن يرفع معدله التراكمي إلى (2.00) نقطتين أو أكثر.',
        'ج. يُفصل الطالب من تخصصه إذا لم يتمكن من إزالة اسمه من قائمة الإنذار، ويستثنى من ذلك كل طالب أتمّ دراسة (99) ساعة معتمدة بنجاح.',
        'د. لا يوضع الطالب على قائمة الإنذار في نهاية الفصل الدراسي الأول لالتحاقه بالجامعة، أو في نهاية الفصل الدراسي الأول لتغيير تخصصه. ويقوم المرشد الأكاديمي بتنبيهه إذا كان معدله متدنياً.',
        'هـ. لا يدخل الفصل الصيفي ضمن الفصول التي يوضع فيها الطالب على قائمة الإنذار.'] },
  ];

  // a term code as the registration system writes it: year of the start, then 1 first, 2 second, 3 summer (20261)
  function termCode(label) {
    const s = clean(label), ys = (s.match(/20\d\d/g) || []).map(Number);
    if (!ys.length) return 0;
    const n = /صيف/.test(s) ? 3 : /الثاني/.test(s) ? 2 : /الأول|الاول/.test(s) ? 1 : 0;
    return n ? Math.min(...ys) * 10 + n : 0;
  }
  const termName = c => c ? `${['', 'الأول', 'الثاني', 'الصيفي'][c % 10]} ${Math.floor(c / 10)}/${Math.floor(c / 10) + 1}` : '';
  const nextTerm = c => c % 10 === 3 ? (Math.floor(c / 10) + 1) * 10 + 1 : c + 1;

  // ---------------------------------------------------------------- «تحليل خطة الطالب»: text items → student record
  // items: [{s, x, y, w, page}] in PDF units; rows are read right to left
  function rowsOf(items) {
    const rows = [];
    items.filter(i => i.s && i.s.trim()).sort((a, b) => a.page - b.page || b.y - a.y).forEach(i => {
      let r = rows.find(r => r.page === i.page && Math.abs(r.y - i.y) <= 2.5);
      if (!r) rows.push(r = { page: i.page, y: i.y, items: [] });
      r.items.push({ ...i, s: clean(i.s) });
    });
    rows.forEach(r => r.items.sort((a, b) => b.x - a.x));
    return rows.sort((a, b) => a.page - b.page || b.y - a.y);
  }
  const HEAD_LABELS = { 'رقمالطالب': 'id', 'اسمالطالب': 'name', 'فصلالالتحاق': 'entry', 'الجنسيه': 'nationality', 'الكليه': 'faculty', 'التخصص': 'major',
    'الدرجه': 'degree', 'الممول': 'sponsor', 'الحاله': 'status', 'نوعالخطه': 'planType', 'الاصدار': 'version', 'نوعالدراسه': 'studyType',
    'الساعاتالمعادله': 'equivHours', 'المسار': 'track', 'المرشد': 'advisor', 'الساعاتالمسجله': 'regHours', 'الساعاتالتراكميه': 'cumHours',
    'الساعاتالمجتازه': 'passedHours', 'المعدلالتراكمي': 'gpa', 'ساعاتالخطه': 'planHours', 'الساعاتالمتبقيه': 'remainingHours', 'تاريخالطباعه': 'printed' };
  // pairs «label : value» read along a row
  function labelled(row, into) {
    const it = row.items;
    for (let i = 0; i < it.length; i++) {
      const key = HEAD_LABELS[bare(it[i].s)];
      if (!key) continue;
      const vals = [];
      for (let j = i + 1; j < it.length && !HEAD_LABELS[bare(it[j].s)]; j++) if (it[j].s !== ':') vals.push(it[j].s.replace(/^:\s*|\s*:$/g, ''));
      if (vals.length) into[key] = vals.join(' ').trim();
    }
  }
  const GRADE = /^(?:[A-F][+-]?|[+-][A-F]|FA|NP|P|I|W|WF|AU|TR|EX)$/;
  const fixGrade = g => /^[+-]/.test(g) ? g.slice(1) + g[0] : g;
  const fixParens = s => AR.test(s) ? s.replace(/[()]/g, c => c === '(' ? ')' : '(').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')') : s;
  function groupOf(text, passedText) {
    const name = fixParens(clean(text.split(':')[0])).replace(/\(\s*/g, '(').replace(/\s*\)/g, ')');
    const req = (text.match(/\)\s*(\d*)\s*\(/) || [])[1];
    const got = ((passedText || '').match(/\)\s*(\d*)\s*\(/) || [])[1];
    const kind = /غير محتسبة/.test(name) ? 'outside' : /استدراك/.test(name) ? 'remedial' : /حرة/.test(name) ? 'free' : /خدمة مجتمع/.test(name) ? 'service'
      : /[إا]ختيارية/.test(name) ? 'elective' : 'required';
    return { name, kind, req: req === '' || req == null ? null : +req, printedPassed: got == null || got === '' ? null : +got, courses: [] };
  }

  function parsePlan(items, known, hoursOf) {
    const rows = rowsOf(items);
    const st = { head: {}, groups: [], term: 0, termLabel: '', level: '', grade: '', pages: Math.max(0, ...items.map(i => i.page)) };
    let g = null, last = null, page = 0;
    const groupBy = {};
    rows.forEach(r => {
      const txt = r.items.map(i => i.s).join(' ');
      if (r.page !== page) { page = r.page; last = null; }   // a new page never continues the course above
      if (/^الفصل\s/.test(txt) && /20\d\d/.test(txt) && r.items.length <= 2) { if (!st.termLabel) { st.termLabel = txt; st.term = termCode(txt); } return; }
      if (/ساعة\s*\/\s*ساعات/.test(txt)) {
        const parts = r.items.filter(i => /ساعة\s*\/\s*ساعات/.test(i.s));
        const main = parts.find(i => !/^المجتازة/.test(i.s)) || parts[0], got = parts.find(i => /^المجتازة/.test(i.s));
        const ng = groupOf(main.s, got && got.s);
        g = groupBy[ng.name] || (groupBy[ng.name] = ng, st.groups.push(ng), ng);
        last = null; return;
      }
      if (/المقررات\s*الغير\s*مكتملة|المقررات غير المكتملة/.test(txt)) { g = groupBy._inc = { name: 'مقررات غير مكتملة', kind: 'incomplete', req: null, courses: [] }; st.groups.push(g); last = null; return; }
      if (/رمز المقرر|^البديل|الإبدال$/.test(txt) && !/^\d/.test(r.items[0].s)) return;
      if (/إسم المستخدم|اسم المستخدم|University of Petra|تحليل خطة الطالب/.test(txt)) { labelled(r, st.head); return; }
      if (/التقدير\s*:/.test(txt)) st.grade = clean((txt.match(/التقدير\s*:\s*(\S+)/) || [])[1] || '');
      if (/مستوى\s*السنة/.test(txt)) { st.level = clean(txt.replace(/^.*?(السنة\s*\S+).*$/, '$1')); return; }
      if (/تسجيل مواد الفصل الحالي/.test(txt)) return;
      const first = r.items[0];
      if (/^\d{6,7}$/.test(first.s) && first.x > 480 && g) {
        const c = { code: first.s, name: '', pre: '', hours: null, grade: '', result: '', status: '', current: false, term: 0, alt: '', move: '', group: g.name, kind: g.kind };
        const name = [];
        r.items.slice(1).forEach(i => {
          const s = i.s;
          if (s === 'X') c.current = true;
          else if (/^20\d{3}$/.test(s)) c.term = +s;
          else if (GRADE.test(s) && i.x < 275 && i.x > 235) c.grade = fixGrade(s);
          else if (/^(ناجح|راسب)$/.test(s)) c.result = s;
          else if (/^\d{6,7}$/.test(s) && i.x < 110) c.alt = s;
          else if (/^\d{1,2}$/.test(s) && c.hours == null && i.x > 265 && i.x < 300) c.hours = +s;
          else if ((s.match(/\d/g) || []).length >= 3 && i.x < 400) c.pre += s;
          else if (AR.test(s) && i.x < 60) c.move = s;
          else if (AR.test(s) && i.x < 215 && i.x > 150) c.status = s;
          else name.push(fixParens(s));
        });
        c.name = name.join(' ');
        g.courses.push(c); last = c;
        labelled(r, st.head);
        return;
      }
      // a row with no course number continues the course above: more of its name, or more of its prerequisites
      if (last && r.items.every(i => !HEAD_LABELS[bare(i.s)])) {
        r.items.forEach(i => { if ((i.s.match(/\d/g) || []).length >= 3) last.pre += '|' + i.s; else last.name += ' ' + fixParens(i.s); });
        return;
      }
      labelled(r, st.head);
    });
    // prerequisite numbers: the PDF runs them together («(601104103250و)»), so they are cut at the course numbers known
    // from the plan itself; a number broken over two lines is joined again
    const K = new Set([...(known || []), ...st.groups.flatMap(x => x.courses.map(c => c.code))]);
    // a course passed through a substitute shows the substitute's hours on its row; the plan counts the course's own hours
    const ownHours = {};
    st.groups.forEach(x => x.courses.forEach(c => { if (!c.alt && c.hours != null) ownHours[c.code] = c.hours; }));
    st.groups.forEach(x => x.courses.forEach(c => { if (c.alt) { const h = ownHours[c.code] ?? (hoursOf && hoursOf(c.code)); if (h != null && h !== c.hours) c.planHours = h; } }));
    st.groups.forEach(x => x.courses.forEach(c => { const p = splitPre(c.pre, K); c.prereq = p.codes; c.preOr = p.or; c.name = clean(c.name).replace(/\(\s*/g, '(').replace(/\s*\)/g, ')'); }));
    const h = st.head;
    st.gpa = h.gpa != null ? parseFloat(h.gpa) : null;
    ['regHours', 'cumHours', 'passedHours', 'planHours', 'remainingHours', 'equivHours'].forEach(k => { if (h[k] != null && /^\d+$/.test(h[k])) st[k] = +h[k]; });
    st.version = (h.version || '').replace(/\D/g, '');
    st.ok = !!(h.id && st.groups.length && st.groups.some(x => x.courses.length));
    return st;
  }
  function splitPre(text, K) {
    if (!text) return { codes: [], or: false };
    const or = /أو|او/.test(text);
    const runs = text.split('|').flatMap(p => p.match(/\d+/g) || []);
    const seg = run => {   // run → known codes, with a fragment possibly left at either end
      for (let a = 0; a <= 6; a++) for (let b = 0; b <= 6; b++) {
        const mid = run.slice(a, run.length - b);
        if (!mid) continue;
        const out = [];
        const go = i => { if (i === mid.length) return true; for (const L of [7, 6]) { const c = mid.slice(i, i + L); if (c.length === L && K.has(c)) { out.push(c); if (go(i + L)) return true; out.pop(); } } return false; };
        if (go(0)) return { codes: out, pre: run.slice(0, a), post: run.slice(run.length - b) };
      }
      return { codes: [], pre: run, post: '' };
    };
    const codes = [], frags = [];
    runs.forEach(r => { const s = seg(r); codes.push(...s.codes); if (s.pre) frags.push(s.pre); if (s.post) frags.push(s.post); });
    // join leftover fragments into known numbers (a number cut by a line break)
    const used = new Set();
    frags.forEach((a, i) => frags.forEach((b, j) => { if (i === j || used.has(i) || used.has(j)) return; if (K.has(a + b)) { codes.push(a + b); used.add(i); used.add(j); } else if (K.has(b + a)) { codes.push(b + a); used.add(i); used.add(j); } }));
    frags.forEach((f, i) => { if (!used.has(i) && /^\d{6,7}$/.test(f)) codes.push(f); });
    return { codes: [...new Set(codes)], or };
  }

  // ---------------------------------------------------------------- where the student stands, and what comes next
  const COUNTS = k => k !== 'remedial' && k !== 'outside' && k !== 'incomplete';   // groups that make up the plan's hours
  function analyse(st, opt) {
    opt = opt || {};
    const plan = st.groups.filter(g => g.kind !== 'outside' && g.kind !== 'incomplete');
    const all = plan.flatMap(g => g.courses);
    const passed = new Set(all.filter(c => c.result === 'ناجح').map(c => c.code));
    const current = new Set(all.filter(c => c.current && c.result !== 'ناجح').map(c => c.code));
    const done = new Set([...passed, ...(opt.assumeCurrent ? current : [])]);
    // attempts outside the plan: failed tries and repeats
    const tries = {};
    st.groups.filter(g => g.kind === 'outside').forEach(g => g.courses.forEach(c => (tries[c.code] ||= []).push(c)));
    const failedBefore = code => (tries[code] || []).some(t => t.result === 'راسب');
    const groups = plan.map(g => {
      const hrs = cs => cs.reduce((a, c) => a + (c.planHours ?? c.hours ?? 0), 0);
      // hours count where the PDF records the grade: a course listed in two groups (an elective also taken as a free course) counts once
      const passC = g.courses.filter(c => c.result === 'ناجح'), doneC = g.courses.filter(c => c.result === 'ناجح' || (opt.assumeCurrent && c.current));
      const fixed = g.kind === 'required' || g.kind === 'remedial' || g.kind === 'service';
      const req = g.req == null ? hrs(g.courses) : g.req;
      const gotDone = Math.min(req, hrs(doneC)), gotPassed = Math.min(req, hrs(passC));
      const need = fixed ? g.courses.filter(c => !done.has(c.code)) : [];
      return { ...g, req, fixed, gotDone, gotPassed, needHours: fixed ? hrs(need) : Math.max(0, req - hrs(doneC)), need,
        open: fixed ? need : (req - hrs(doneC) > 0 ? g.courses.filter(c => !done.has(c.code)) : []) };
    });
    const remainingNow = groups.filter(g => COUNTS(g.kind)).reduce((a, g) => a + Math.max(0, g.req - g.gotPassed), 0);
    const remaining = groups.filter(g => COUNTS(g.kind)).reduce((a, g) => a + (g.fixed ? g.needHours : g.needHours), 0);
    // the prerequisite graph inside the plan
    const byCode = {};
    all.forEach(c => { byCode[c.code] ||= c; });
    const open = groups.flatMap(g => g.open.map(c => ({ ...c, g })));
    const openSet = new Set(open.map(c => c.code));
    const dependents = {};
    all.forEach(c => (c.prereq || []).forEach(p => (dependents[p] ||= new Set()).add(c.code)));
    const chainMemo = {};
    const chain = (code, seen = new Set()) => {   // longest run of still-needed courses that waits on this one
      if (code in chainMemo) return chainMemo[code];
      if (seen.has(code)) return 0;
      seen.add(code);
      let best = 0;
      (dependents[code] || []).forEach(d => { if (openSet.has(d)) best = Math.max(best, 1 + chain(d, seen)); });
      return (chainMemo[code] = best);
    };
    const unlocks = code => [...(dependents[code] || [])].filter(d => openSet.has(d));
    const level = code => { const d = code.length === 6 ? +code[3] : +code[4]; return d >= 1 && d <= 5 ? d : 3; };
    const missing = c => (c.prereq || []).filter(p => !done.has(p));
    const ready = c => c.preOr ? (!(c.prereq || []).length || (c.prereq || []).some(p => done.has(p))) : !missing(c).length;
    open.forEach(c => {
      c.missing = c.preOr && ready(c) ? [] : missing(c);
      c.ready = ready(c) && !(current.has(c.code) && !opt.assumeCurrent);
      c.inProgress = current.has(c.code) && !opt.assumeCurrent;
      c.chain = chain(c.code); c.unlocks = unlocks(c.code); c.level = level(c.code);
      c.retake = failedBefore(c.code);
      c.required = c.g.fixed;
      const why = [];
      if (c.retake && c.required) why.push(['retake', 'إعادة مادة إجبارية راسب فيها (م 11/أ)']);
      else if (c.retake) why.push(['retake', 'رسب فيها سابقاً']);
      if (c.chain) why.push(['chain', `تفتح سلسلة من ${c.chain} ${c.chain === 1 ? 'مادة' : c.chain === 2 ? 'مادتين' : 'مواد'} بعدها`]);
      if (c.unlocks.length) why.push(['unlock', `متطلب سابق لـ ${c.unlocks.length}`]);
      if (c.required) why.push(['req', 'إجبارية']); else why.push(['el', 'اختيارية']);
      c.why = why;
      c.score = c.chain * 12 + c.unlocks.length * 5 + (c.required ? 10 : 0) + (c.retake && c.required ? 9 : c.retake ? 3 : 0) + (6 - c.level) * 2 + (c.g.kind === 'remedial' ? 20 : 0);
    });
    open.sort((a, b) => b.score - a.score || a.level - b.level || a.code.localeCompare(b.code));
    const longest = open.length ? Math.max(...open.filter(c => !c.missing.length || true).map(c => c.chain)) + 1 : 0;
    return { st, groups, passed, current, done, open, tries, remaining, remainingNow, longest, byCode,
      warned: st.gpa != null && st.gpa < 2, gpa: st.gpa };
  }

  // the load limits of article 7 for the coming term
  function limits(a, summer) {
    const grad = a.remaining > 0 && a.remaining <= (summer ? LOAD.gradSummer : LOAD.gradRegular);
    const max = summer ? (grad ? LOAD.gradSummer : LOAD.summer) : (grad ? LOAD.gradRegular : LOAD.regular);
    return { max, min: summer || grad ? 0 : LOAD.min, grad, summer, rule: grad ? '7/ب' : '7/أ' };
  }

  // ---------------------------------------------------------------- sections and a clash-free schedule
  function clash(a, b) {
    return a.meetings.filter(live).some(x => b.meetings.filter(live).some(y => x.day === y.day && toMin(x.start) < toMin(y.end) && toMin(y.start) < toMin(x.end)));
  }
  const seats = s => (s.capacity || 0) - (s.registered || 0);
  const isOpen = s => s.status !== 'مغلقة' && seats(s) > 0;
  // sections of a course, one list per activity (theory / lab); the student's study type first
  function partsOf(sections, code, studyType) {
    let L = sections.filter(s => s.code === code && s.degree === 'البكالوريوس');
    const mine = L.filter(s => s.study_type === studyType);
    if (studyType && mine.length) L = mine;
    const m = {};
    L.forEach(s => (m[s.activity] ||= []).push(s));
    return Object.entries(m).map(([act, list]) => ({ act, list: list.slice().sort((a, b) => (isOpen(b) - isOpen(a)) || seats(b) - seats(a)) }));
  }
  // every way to pick one section per part without a clash (up to a limit); the best first
  function combos(parts, limit, nodes) {
    const order = parts.slice().sort((a, b) => a.list.length - b.list.length);
    const out = [];
    let n = 0;
    (function walk(i, acc) {
      if (out.length >= limit || ++n > nodes) return;
      if (i === order.length) { out.push(acc.slice()); return; }
      for (const s of order[i].list) { if (acc.some(x => clash(x, s))) continue; acc.push(s); walk(i + 1, acc); acc.pop(); if (out.length >= limit || n > nodes) return; }
    })(0, []);
    return out;
  }
  function rank(combo) {
    const live_ = combo.flatMap(s => s.meetings.filter(live));
    const days = new Set(live_.map(m => m.day)).size;
    const byDay = {};
    live_.forEach(m => (byDay[m.day] ||= []).push([toMin(m.start), toMin(m.end)]));
    const gaps = Object.values(byDay).reduce((g, iv) => { iv.sort((a, b) => a[0] - b[0]); for (let k = 1; k < iv.length; k++) g += Math.max(0, iv[k][0] - iv[k - 1][1]); return g; }, 0);
    const closed = combo.filter(s => !isOpen(s)).length;
    return { combo, days, gaps, closed, score: closed * 1000 + days * 100 + gaps / 30 };
  }
  // courses in priority order are added while the hours allow and a clash-free choice of sections still exists
  function suggest(a, sections, o) {
    const cap = o.max, studyType = a.st.head.studyType || '';
    const budget = {};
    a.groups.forEach(g => { if (!g.fixed) budget[g.name] = g.needHours; });
    const take = [], skipped = [], notOffered = [];
    let hours = 0;
    const ready = a.open.filter(c => c.ready && (o.only ? o.only.has(c.code) : true) && !(o.drop && o.drop.has(c.code)));
    const forced = ready.filter(c => o.force && o.force.has(c.code));
    const order = forced.concat(ready.filter(c => !forced.includes(c)));
    order.forEach(c => {
      const parts = partsOf(sections, c.code, studyType);
      if (!parts.length) { notOffered.push(c); return; }
      const h = c.hours || 0;
      if (!c.g.fixed && (budget[c.g.name] || 0) < h) { skipped.push({ c, why: c.g.kind === 'free' ? 'اكتملت ساعات المواد الحرة' : 'اكتمل المطلوب من مجموعتها' }); return; }
      if (hours + h > cap) { skipped.push({ c, why: `تتجاوز الحد الأعلى (${cap} ساعة)` }); return; }
      const trial = take.flatMap(t => t.parts).concat(parts);
      if (!combos(trial, 1, 60000).length) { skipped.push({ c, why: 'تتعارض كل شعبها مع المواد المختارة' }); return; }
      take.push({ c, parts }); hours += h;
      if (!c.g.fixed) budget[c.g.name] -= h;
    });
    const all = take.flatMap(t => t.parts);
    const found = all.length ? combos(all, 1500, 250000).map(rank).sort((x, y) => x.score - y.score) : [];
    const best = found[0] || { combo: [], days: 0, gaps: 0, closed: 0 };
    return { take, hours, skipped, notOffered, best, options: found.slice(0, 5), cap };
  }

  // ---------------------------------------------------------------- paths to graduation, term by term
  // from the term after the PDF's (what is registered now counted as passed): each term takes the courses whose
  // prerequisites were passed in an earlier term, in priority order, up to the term's load; the expected graduate's
  // limit (article 7/ب) applies once the rest fits in one term. The future timetables are not known yet, so a path
  // shows the order the prerequisites allow, not guaranteed sections.
  function paths(st, o) {
    const a = analyse(st, { assumeCurrent: true });
    const done = new Set(a.done);
    const left = a.open.filter(c => c.g.fixed).map(c => c);
    const budget = {}, pool = {};
    a.groups.forEach(g => { if (!g.fixed && g.needHours > 0) { budget[g.name] = g.needHours; pool[g.name] = g.open.slice().sort((x, y) => (a.open.find(z => z.code === y.code)?.score || 0) - (a.open.find(z => z.code === x.code)?.score || 0)); } });
    const free = a.groups.find(g => g.kind === 'free' && g.needHours > 0);
    const terms = [];
    let t = nextTerm(st.term || 0), guard = 0, freeLeft = free ? free.needHours : 0;
    const leftHours = () => left.reduce((x, c) => x + (c.hours || 0), 0) + Object.values(budget).reduce((x, v) => x + v, 0) + freeLeft;
    while (leftHours() > 0 || left.some(c => !c.hours)) {
      if (++guard > 24) break;
      const summer = t % 10 === 3;
      if (summer && !o.summer) { t = nextTerm(t); continue; }
      const rest = leftHours();
      const grad = rest <= (summer ? LOAD.gradSummer : LOAD.gradRegular);
      const cap = grad ? (summer ? LOAD.gradSummer : LOAD.gradRegular) : summer ? Math.min(o.summerLoad || LOAD.summer, LOAD.summer) : Math.min(o.load, LOAD.regular);
      const ok = c => (c.prereq || []).every(p => done.has(p)) || (c.preOr && (c.prereq || []).some(p => done.has(p)));
      const cand = left.filter(ok).map(c => ({ c, el: null }));
      Object.entries(pool).forEach(([gname, L]) => L.filter(c => !done.has(c.code) && ok(c)).forEach(c => cand.push({ c: { ...c, score: (a.open.find(z => z.code === c.code) || {}).score || 0 }, el: gname })));
      cand.sort((x, y) => (y.c.score || 0) - (x.c.score || 0) || (x.el ? 1 : 0) - (y.el ? 1 : 0));
      const take = [];
      let h = 0;
      cand.forEach(({ c, el }) => {
        const ch = c.hours || 0;
        if (h + ch > cap || take.some(x => x.code === c.code)) return;
        if (el && (budget[el] || 0) < ch) return;
        take.push({ code: c.code, name: c.name, hours: ch, el, required: !el, offered: false }); h += ch;
        if (el) budget[el] -= ch;
      });
      if (freeLeft && h + freeLeft <= cap && (grad || h + freeLeft <= cap - 3 || !cand.length)) { take.push({ code: '—', name: 'مادة حرة يختارها الطالب', hours: freeLeft, el: 'free' }); h += freeLeft; freeLeft = 0; }
      if (!take.length) { terms.push({ term: t, summer, take, hours: 0, stuck: true }); break; }
      take.forEach(x => { done.add(x.code); const i = left.findIndex(c => c.code === x.code); if (i >= 0) left.splice(i, 1); });
      terms.push({ term: t, summer, take, hours: h, grad, cap });
      t = nextTerm(t);
    }
    const end = terms.length && !terms[terms.length - 1].stuck ? terms[terms.length - 1].term : 0;
    return { terms, end, regular: terms.filter(x => !x.summer).length, summers: terms.filter(x => x.summer).length, stuck: terms.some(x => x.stuck) };
  }

  const CORE = { parsePlan, analyse, limits, suggest, paths, splitPre, termCode, termName, nextTerm, partsOf, combos, rank, clash, RULES, LOAD, BACH_URL, REGS_PAGE, clean, norm };
  root.ADVCORE = CORE;
  if (!root.document || !root.UOP) return;

  // ================================================================ the page
  const U = root.UOP, { $, esc } = U;
  const P = new URLSearchParams(location.search);
  const st = { view: P.get('view') || 'student', q: P.get('q') || '', mode: 'next', summer: null, cap: null, force: new Set(), drop: new Set(), fresh: { prog: '', ar: false, en: false, pc: false } };
  let TT, S = [], SP, AP, MAN = {}, NAMES = {}, OFFER = {}, STUD = null, BOARD = [], EQ = [], DESC = null;
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/';
  const EQ_KEY = 'adv-equivalents-v1';
  try { EQ = JSON.parse(localStorage.getItem(EQ_KEY) || '[]'); } catch (e) { EQ = []; }
  const saveEq = () => { try { localStorage.setItem(EQ_KEY, JSON.stringify(EQ)); } catch (e) { /* storage unavailable */ } };
  const ttTerm = () => termCode(TT && TT.term);
  const nm = c => NAMES[c] || '';
  const ruleLink = (art, label) => `<a href="${BACH_URL}" target="_blank" rel="noopener" class="adv-rule" title="تعليمات منح درجة البكالوريوس في جامعة البترا (رقم 17 لسنة 2023)"><i class="bi bi-bookmark-check"></i> ${label || 'م ' + art}</a>`;
  const hrsWord = n => n === 1 ? 'ساعة' : n === 2 ? 'ساعتان' : n <= 10 ? `${n} ساعات` : `${n} ساعة`;

  const css = `
  .adv-tabs { display:flex; flex-wrap:wrap; gap:6px; margin:14px 0 12px; }
  .adv-tabs button { border:1px solid #d9d3c3; background:#fff; color:#1f2328; border-radius:10px; padding:7px 14px; font-weight:700; font-size:.95rem; }
  .adv-tabs button.on { background:#901d23; border-color:#901d23; color:#fff; }
  .adv-drop { border:2px dashed #c9bfa6; border-radius:14px; background:#fffdf7; padding:26px 16px; text-align:center; cursor:pointer; color:#1f2328; }
  .adv-drop.over { background:#f7efe0; border-color:#901d23; }
  .adv-drop i { font-size:2rem; color:#901d23; }
  .adv-card { background:#fff; border:1px solid #e3ddcf; border-radius:12px; padding:14px 16px; margin-bottom:12px; color:#1f2328; }
  .adv-card h3 { font-size:1.05rem; font-weight:800; margin:0 0 10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .adv-card h3 .badge { font-size:.78rem; }
  .adv-kv { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:6px 14px; font-size:.92rem; }
  .adv-kv div b { display:block; font-size:.78rem; color:#4a4f57; font-weight:600; }
  .adv-stats { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:8px; }
  .adv-stat { border:1px solid #e3ddcf; border-radius:10px; padding:8px 10px; background:#fbfaf6; }
  .adv-stat .v { font-size:1.35rem; font-weight:800; line-height:1.1; }
  .adv-stat .l { font-size:.8rem; color:#3b4048; }
  .adv-stat.bad { border-color:#e9a2a2; background:#fdf0f0; } .adv-stat.good { border-color:#a7d7b5; background:#effaf2; }
  .adv-g { display:grid; grid-template-columns:minmax(150px,1.3fr) 2fr auto; gap:8px; align-items:center; padding:5px 0; border-bottom:1px solid #f0ece2; font-size:.9rem; }
  .adv-bar { height:10px; background:#eee9dc; border-radius:6px; overflow:hidden; } .adv-bar i { display:block; height:100%; background:#0f766e; }
  .adv-bar i.cur { background:#8fc9c2; display:inline-block; }
  .adv-t { width:100%; font-size:.9rem; border-collapse:collapse; } .adv-t th { background:#f3f1ea; font-weight:700; padding:6px 8px; text-align:start; white-space:nowrap; }
  .adv-t td { padding:6px 8px; border-bottom:1px solid #eee9dc; vertical-align:top; } .adv-t code { color:#1f2328; font-weight:700; }
  .adv-chip { display:inline-block; font-size:.74rem; border-radius:6px; padding:1px 6px; margin:1px 2px; border:1px solid #d9d3c3; background:#fff; white-space:nowrap; }
  .adv-chip.retake { background:#fdecec; border-color:#e9a2a2; color:#7a1414; } .adv-chip.chain { background:#e9f3fb; border-color:#9cc2e3; color:#0b3a5a; }
  .adv-chip.unlock { background:#eef6ee; border-color:#a7d7b5; color:#14532d; } .adv-chip.req { background:#f7efe0; border-color:#dcc49a; color:#5b3d00; }
  .adv-chip.el { background:#f2eefb; border-color:#c9b8ea; color:#3d2370; } .adv-chip.off { background:#f1f1f1; color:#3b4048; } .adv-chip.closed { background:#fde8e8; border-color:#e9a2a2; color:#7a1414; }
  .adv-rule { font-size:.8rem; text-decoration:none; white-space:nowrap; }
  .adv-note { font-size:.86rem; color:#2b3036; } .adv-src { font-size:.8rem; color:#3b4048; }
  .adv-ctl { display:flex; flex-wrap:wrap; gap:10px; align-items:center; font-size:.9rem; }
  .adv-ctl select, .adv-ctl input[type=number] { width:auto; display:inline-block; }
  .adv-pick { cursor:pointer; } .adv-pick input { margin-inline-end:4px; }
  .adv-x td { color:#4a4f57; } .adv-ok { color:#0f766e; } .adv-bad { color:#b42318; }
  .adv-check { font-size:.85rem; border-radius:8px; padding:6px 10px; margin-top:8px; }
  .adv-check.ok { background:#effaf2; border:1px solid #a7d7b5; } .adv-check.no { background:#fff6e5; border:1px solid #e6c37a; }
  .adv-terms { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:10px; }
  .adv-term { border:1px solid #e3ddcf; border-radius:10px; padding:8px 10px; background:#fbfaf6; }
  .adv-term.sum { background:#fffaf0; border-style:dashed; } .adv-term.stuck { border-color:#e9a2a2; background:#fdf0f0; }
  .adv-term-h { display:flex; gap:6px; align-items:center; border-bottom:1px solid #e3ddcf; padding-bottom:4px; margin-bottom:4px; font-size:.92rem; }
  .adv-term-c { font-size:.85rem; line-height:1.6; } .adv-term-c code, .adv-t code, .adv-card code { color:#1f2328; } .adv-term-h b { white-space:nowrap; } .adv-term-c small { color:#3b4048; font-weight:700; }
  .adv-imp { border-color: #d9c9a3; background: linear-gradient(180deg,#fffdf7,#fff); }
  .adv-steps { list-style: none; padding: 0; margin: 0 0 10px; display: grid; gap: 8px; }
  .adv-steps li { display: flex; gap: 10px; align-items: flex-start; font-size: .95rem; }
  .adv-steps li > span { flex: none; width: 28px; height: 28px; border-radius: 50%; background: #901d23; color: #fff; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .adv-bm { display: inline-flex; align-items: center; gap: 4px; background: #0f766e; color: #fff !important; text-decoration: none; padding: 4px 12px; border-radius: 99px; font-weight: 700; cursor: grab; margin: 0 4px; border: 2px dashed #8fd1c6; }
  .adv-prog { border: 1px solid #e3ddcf; border-radius: 10px; padding: 8px 12px; margin-bottom: 10px; background: #fff; }
  .adv-pbar { height: 12px; border-radius: 99px; background: #eee9dc; overflow: hidden; margin: 6px 0; } .adv-pbar i { display: block; height: 100%; background: linear-gradient(90deg,#0f766e,#15803d); transition: width .4s; }
  .adv-pbar i.run { background-image: repeating-linear-gradient(45deg,#0f766e 0 12px,#15803d 12px 24px); }
  .adv-law { border-inline-start:4px solid #901d23; padding:4px 12px; margin:6px 0; background:#fffdf7; font-size:.95rem; line-height:1.9; }
  @media (max-width: 640px) { .adv-g { grid-template-columns:1fr auto; } .adv-g .adv-bar { grid-column:1 / -1; order:3; } }
  @media print { .adv-tabs, .adv-ctl, .no-print { display:none !important; } }`;

  // ---------------------------------------------------------------- reading PDFs in the browser
  let pdfjs = null;
  async function loadPdfjs() {
    if (pdfjs) return pdfjs;
    pdfjs = await import(PDFJS + 'pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
    return pdfjs;
  }
  async function pdfItems(buf) {
    const lib = await loadPdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const items = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      tc.items.forEach(i => { if (i.str && i.str.trim()) items.push({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, page: p }); });
    }
    return items;
  }
  const knownCodes = () => Object.keys(NAMES);
  let HOURS = null;
  const planHours = code => { if (!HOURS) { HOURS = {}; (SP ? SP.plans : []).forEach(p => p.groups.forEach(g => g.courses.forEach(c => { HOURS[c.code] ??= c.hours; }))); } return HOURS[code]; };
  async function readStudent(file) {
    const buf = await file.arrayBuffer();
    const items = await pdfItems(buf.slice(0));
    const s = parsePlan(items, knownCodes(), planHours);
    s._buf = buf;
    s.file = file.name;
    return s;
  }

  // ---------------------------------------------------------------- data from the site: timetable, plans, guidance plans
  function indexData() {
    S = TT.sections || [];
    OFFER = {};
    S.forEach(s => { if (s.degree === 'البكالوريوس') (OFFER[s.code] ||= []).push(s); if (s.name) NAMES[s.code] ||= s.name.replace(/\s*-\s*(نظري|عملي)$/, ''); });
    (SP ? SP.plans : []).forEach(p => p.groups.forEach(g => g.courses.forEach(c => { NAMES[c.code] ||= c.name; })));
  }
  const offered = code => (OFFER[code] || []);
  const sectionsLine = code => { const L = offered(code); if (!L.length) return '<span class="adv-chip off">غير مطروحة</span>';
    const open = L.filter(isOpen).length; return `<a class="adv-chip" href="timetable.html?q=${code}" target="_blank" rel="noopener">${L.length} شعبة${open < L.length ? ` · ${open} مفتوحة` : ''}</a>`; };

  // equivalents uploaded by the user, both ways
  function eqOf(code) {
    const out = [];
    EQ.forEach(e => { if (e.a === code) out.push({ code: e.b, note: e.note, src: e.src }); else if (e.b === code) out.push({ code: e.a, note: e.note, src: e.src }); });
    return out;
  }
  // the same course name under another number in the published plans (an old or a new code)
  let SAME = null;
  function sameName() {
    if (SAME) return SAME;
    const by = {};
    const add = (code, name, where) => { if (!/^\d{6,7}$/.test(code) || !name) return; const k = norm(clean(name)).replace(/[()\s]/g, ''); if (k.length < 4) return;
      ((by[k] ||= {})[code] ||= { code, name: clean(name), where: new Set() }).where.add(where); };
    (SP ? SP.plans : []).forEach(p => p.groups.forEach(g => g.courses.forEach(c => add(c.code, c.name, `${p.major} (خطة ${p.version})`))));
    Object.entries(READS()).forEach(([sha, r]) => (r.years || []).forEach(y => y.terms.forEach(t => t.courses.forEach(c => add(c.code, c.name, (PROG_OF[sha] || 'خطة استرشادية') + (r.academic_year ? ' ' + r.academic_year : ''))))));
    S.forEach(s => add(s.code, s.name.replace(/\s*-\s*(نظري|عملي)$/, ''), 'الجدول الدراسي'));
    SAME = {};
    Object.values(by).forEach(m => { const L = Object.values(m); if (L.length > 1) L.forEach(x => { SAME[x.code] = L.filter(y => y.code !== x.code); }); });
    return SAME;
  }
  let PROG_OF = {};
  const READS = () => Object.assign({}, (AP && AP.reads) || {}, MAN);

  // ---------------------------------------------------------------- view: one student
  function studentView() {
    if (!STUD) return `<div class="adv-card"><h3><i class="bi bi-person-vcard"></i> تحليل خطة طالب</h3>
      <label class="adv-drop d-block" id="adv-drop"><i class="bi bi-file-earmark-pdf"></i><div class="fw-bold mt-1">اختر ملف «تحليل خطة الطالب» (PDF) أو اسحبه إلى هنا</div>
        <div class="adv-note mt-1">الملف الذي يطبعه نظام التسجيل للمرشد أو الطالب. يُقرأ في هذا المتصفح فقط ولا يُرفع إلى أي مكان.</div>
        <input type="file" accept="application/pdf,.pdf" id="adv-file" hidden></label>
      <div id="adv-msg" class="mt-2"></div></div>
      <div class="adv-card"><h3><i class="bi bi-info-circle"></i> ماذا تحصل عليه</h3><ul class="adv-note mb-0">
        <li>موقع الطالب في كل مجموعة متطلبات، مطابقاً لأرقام كشف الجامعة نفسه (ويُبيَّن إن اختلف شيء).</li>
        <li>المواد التي يحق له تسجيلها (المتطلبات السابقة من الكشف نفسه)، مرتبة حسب أولويتها مع سبب كل أولوية.</li>
        <li>جدول مقترح بلا تعارض من شعب الجدول الدراسي المنشور الآن (يتحدّث كل ساعة)، ضمن الحد الأعلى الرسمي للساعات ${ruleLink('7', 'م 7')}.</li>
        <li>المواد غير المطروحة وبدائلها، ونموذج إرشاد للطباعة مع رمز QR يفتح المقترح للطالب في «مخطط جدولي».</li></ul></div>`;
    const s = STUD, h = s.head;
    const pdfTerm = s.term, tt = ttTerm();
    const later = tt > pdfTerm;
    const assume = st.mode === 'next';
    const a = analyse(s, { assumeCurrent: assume });
    const summer = st.summer != null ? st.summer : (later ? tt % 10 === 3 : nextTerm(pdfTerm) % 10 === 3 && false);
    const lim = limits(a, summer);
    const cap = st.cap || lim.max;
    const sug = suggest(a, S, { max: cap, force: st.force, drop: st.drop });
    const chk = consistency(s);
    const curHrs = s.groups.filter(g => g.kind !== 'outside').flatMap(g => g.courses).filter(c => a.current.has(c.code)).reduce((x, c) => x + (c.hours || 0), 0);
    const planner = 'planner.html?plan=' + sug.best.combo.map(x => encodeURIComponent(U.sectionKey(x))).join('~');
    const ttNote = later ? `الشعب من الجدول الدراسي للفصل ${esc(TT.term)} المنشور على بوابة الجامعة.`
      : `جدول الفصل القادم لم يُنشر بعد على بوابة الجامعة: الشعب أدناه من جدول الفصل الحالي (${esc(TT.term)}) تقديراً لما يُطرح، وتتحدّث تلقائياً حين يُنشر الجدول الجديد.`;
    const gRows = a.groups.map(g => {
      const pct = g.req ? Math.round(100 * g.gotPassed / g.req) : 100, pcur = g.req ? Math.round(100 * (g.gotDone - g.gotPassed) / g.req) : 0;
      return `<div class="adv-g"><div><b>${esc(g.name)}</b>${g.kind === 'remedial' ? ' <span class="adv-chip off">لا تُحسب في ساعات الخطة</span>' : ''}</div>
        <div class="adv-bar" title="${pct}%"><i style="width:${pct}%;display:inline-block"></i><i class="cur" style="width:${pcur}%"></i></div>
        <div class="text-nowrap"><b>${g.gotPassed}</b> / ${g.req}${g.gotDone > g.gotPassed ? ` <small class="adv-ok">+${g.gotDone - g.gotPassed} مسجلة الآن</small>` : ''}</div></div>`;
    }).join('');
    const ready = a.open.filter(c => c.ready), waiting = a.open.filter(c => !c.ready && !c.inProgress);
    const inSug = new Set(sug.take.map(t => t.c.code));
    const sel = sug.best.combo;
    const colour = {};
    sug.take.forEach((t, i) => { colour[t.c.code] = U.PALETTE[i % U.PALETTE.length]; });
    const grid = sel.length ? U.weekGrid(sel.flatMap(x => x.meetings.map(m => ({ day: m.day, start: live(m) ? m.start : '', end: m.end, title: x.code, line: nm(x.code), sub: `ش ${x.section}${x.activity === 'عملي' ? ' عملي' : ''}`,
      style: `background:${colour[x.code][1]};border-inline-start-color:${colour[x.code][0]}`, cls: isOpen(x) ? '' : 'clash' }))), { compact: true }) : '';
    const secRows = sug.take.map(t => {
      const mine = sel.filter(x => x.code === t.c.code);
      return `<tr><td><code>${t.c.code}</code></td><td>${esc(t.c.name || nm(t.c.code))}<div>${t.c.why.map(([k, l]) => `<span class="adv-chip ${k}">${esc(l)}</span>`).join('')}</div></td><td>${t.c.hours}</td>
        <td>${mine.map(x => `<div><b>ش ${esc(x.section)}</b>${x.activity === 'عملي' ? ' (عملي)' : ''} · ${x.meetings.map(m => `${(TT.days || {})[m.day] || m.day} ${live(m) ? `<span dir="ltr">${m.start}–${m.end}</span>` : '(غير متزامن)'}`).join('، ')}
          <div class="adv-src">${esc(U.shortName(x.instructor || ''))} · ${esc(x.room || '')} · ${isOpen(x) ? `<span class="adv-ok">${seats(x)} مقعد شاغر</span>` : '<span class="adv-bad">مغلقة/ممتلئة</span>'}</div></div>`).join('')}</td>
        <td class="no-print"><button type="button" class="btn btn-sm btn-light" data-drop="${t.c.code}" title="أخرجها من المقترح"><i class="bi bi-x-lg"></i></button></td></tr>`;
    }).join('');
    const notOff = a.open.filter(c => c.ready && !offered(c.code).length);
    const altFor = c => {
      const same = (sameName()[c.code] || []).filter(x => offered(x.code).length);
      const eq = eqOf(c.code).filter(x => offered(x.code).length);
      const el = c.g.fixed ? a.groups.filter(g => !g.fixed && g.kind === 'elective' && g.needHours >= 0).flatMap(g => g.courses).filter(x => !a.done.has(x.code) && offered(x.code).length && (x.hours || 0) === (c.hours || 0) && x.prereq.every(p => a.done.has(p))) : [];
      return { same, eq, el };
    };
    const lawWarn = a.warned ? `<div class="alert alert-danger py-2 mb-2"><b><i class="bi bi-exclamation-octagon-fill"></i> المعدل التراكمي ${s.gpa.toFixed(2)} أقل من 2.00:</b> الطالب على قائمة الإنذار ${ruleLink('12', 'م 12/أ')} — عليه رفع معدله إلى 2.00 خلال فصلين اعتياديين ${ruleLink('12', 'م 12/ب')}${(s.passedHours || 0) >= 99 ? '، ولا يُفصل لأنه أتمّ 99 ساعة بنجاح (م 12/ج)' : ''}. الأولوية في المقترح لإعادة المواد الإجبارية التي رسب فيها، فتُحسب له أعلى علامة ${ruleLink('11', 'م 11/ب')}.</div>`
      : s.gpa != null && s.gpa < 2.2 ? `<div class="alert alert-warning py-2 mb-2"><b><i class="bi bi-exclamation-triangle-fill"></i> المعدل التراكمي ${s.gpa.toFixed(2)} قريب من حد الإنذار (2.00)</b> ${ruleLink('12', 'م 12/أ')}: يحسن تخفيف العبء وإعادة المواد ذات العلامات المتدنية.</div>` : '';
    return `<div class="adv-card"><h3><i class="bi bi-person-vcard"></i> ${esc(h.name || '')} <span class="badge text-bg-light border">${esc(h.id || '')}</span>
        <span class="ms-auto d-flex gap-2 no-print"><button type="button" class="btn btn-sm btn-outline-secondary" id="adv-other"><i class="bi bi-arrow-repeat"></i> طالب آخر</button>
        <button type="button" class="btn btn-sm btn-maroon" id="adv-print"><i class="bi bi-printer"></i> نموذج الإرشاد</button></span></h3>
      <div class="adv-kv"><div><b>التخصص</b>${esc(h.major || '')}</div><div><b>الكلية</b>${esc(h.faculty || '')}</div><div><b>إصدار الخطة</b>${esc(s.version || '')}</div>
        <div><b>فصل الالتحاق</b>${esc(termName(+h.entry) || h.entry || '')}</div><div><b>نوع الدراسة</b>${esc(h.studyType || '')}</div><div><b>المرشد</b>${esc(h.advisor || '')}</div>
        <div><b>المستوى</b>${esc(s.level || '')}</div><div><b>كشف الفصل</b>${esc(s.termLabel || '')}${h.printed ? ` · طُبع ${esc(h.printed)}` : ''}</div></div>
      <div class="adv-stats mt-3">
        <div class="adv-stat ${a.warned ? 'bad' : ''}"><div class="v">${s.gpa != null ? s.gpa.toFixed(2) : '—'}</div><div class="l">المعدل التراكمي${s.grade ? ` · ${esc(s.grade)}` : ''}</div></div>
        <div class="adv-stat"><div class="v">${s.passedHours ?? '—'}</div><div class="l">ساعة مجتازة</div></div>
        <div class="adv-stat"><div class="v">${a.remainingNow}</div><div class="l">ساعة متبقية من ${s.planHours ?? '—'}</div></div>
        <div class="adv-stat"><div class="v">${a.current.size}</div><div class="l">مواد مسجلة الآن (${curHrs} س)</div></div>
        <div class="adv-stat ${lim.grad ? 'good' : ''}"><div class="v">${a.remaining}</div><div class="l">${assume ? 'متبقية بعد نجاح المسجلة' : 'متبقية'}${lim.grad ? ' · متوقع تخرجه' : ''}</div></div>
        <div class="adv-stat"><div class="v">${a.longest > 0 ? a.longest : 0}</div><div class="l">أطول سلسلة متطلبات متبقية (فصول على الأقل)</div></div></div>
      ${chk}</div>
      ${lawWarn}
      <div class="adv-card"><h3><i class="bi bi-diagram-3"></i> مجموعات المتطلبات</h3>${gRows}</div>
      <div class="adv-card"><h3><i class="bi bi-magic"></i> الجدول المقترح <span class="badge text-bg-${sug.hours > lim.max ? 'danger' : 'success'}">${sug.hours} من ${cap} ساعة</span></h3>
        <div class="adv-ctl no-print mb-2">
          <label>الخطة لـ <select class="form-select form-select-sm" id="adv-mode"><option value="next" ${assume ? 'selected' : ''}>الفصل القادم (المواد المسجلة الآن تُعدّ ناجحة)</option><option value="now" ${!assume ? 'selected' : ''}>هذا الفصل: سحب وإضافة</option></select></label>
          <label>نوع الفصل <select class="form-select form-select-sm" id="adv-summer"><option value="0" ${!summer ? 'selected' : ''}>اعتيادي</option><option value="1" ${summer ? 'selected' : ''}>صيفي</option></select></label>
          <label>الساعات <select class="form-select form-select-sm" id="adv-cap">${Array.from({ length: 22 }, (_, i) => i + 3).filter(n => n <= 24).map(n => `<option value="${n}" ${n === cap ? 'selected' : ''}>${n}${n === lim.max ? ' (الحد الأعلى)' : n > lim.max ? ' — فوق الحد' : ''}</option>`).join('')}</select></label>
          ${st.force.size || st.drop.size ? '<button type="button" class="btn btn-sm btn-light" id="adv-reset"><i class="bi bi-arrow-counterclockwise"></i> المقترح الأصلي</button>' : ''}</div>
        <p class="adv-note mb-2"><i class="bi bi-bookmark-check"></i> الحد الأعلى ${hrsWord(lim.max)} ${ruleLink(lim.rule, 'م ' + lim.rule)}${lim.grad ? ' لأن ساعاته المتبقية لا تزيد على ' + (summer ? 13 : 21) + ' ساعة، فيمكنه إنهاؤها في هذا الفصل (الطالب المتوقع تخرجه)' : ''}${!summer && !lim.grad ? `، والحد الأدنى 12 ساعة ${ruleLink('7', 'م 7/ج')}` : lim.grad ? ' — ولا يتقيد بالحد الأدنى في فصل التخرج (م 7/د)' : ''}.
          ${cap > lim.max ? '<b class="adv-bad">العدد المختار فوق الحد الأعلى في التعليمات.</b>' : ''} ${sug.hours && sug.hours < lim.min ? `<b class="adv-bad">المقترح أقل من الحد الأدنى (12) لأن المتاح محدود؛ يلزم موافقة العميد (م 7/ج).</b>` : ''}</p>
        <p class="adv-src">${ttNote} المواد مرتبة حسب أولويتها؛ تُضاف ما دامت الساعات تسمح ولها شعب بلا تعارض، والأفضلية للشعب التي فيها مقاعد ثم أقل أيام دوام وفراغات.</p>
        ${sug.take.length ? `<div class="table-responsive"><table class="adv-t"><thead><tr><th>الرمز</th><th>المادة ولماذا</th><th>س</th><th>الشعبة والموعد</th><th class="no-print"></th></tr></thead><tbody>${secRows}</tbody></table></div>
          <div class="mt-3">${grid}</div>
          <div class="d-flex flex-wrap gap-2 mt-2 no-print"><a class="btn btn-sm btn-maroon" href="${planner}" target="_blank" rel="noopener"><i class="bi bi-calendar2-week"></i> افتح المقترح في «مخطط جدولي» (للطالب)</a>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="adv-copy"><i class="bi bi-link-45deg"></i> انسخ رابط المقترح للطالب</button>
            ${sug.options.length > 1 ? `<span class="adv-src align-self-center">${sug.options.length >= 5 ? 'ومن ' : ''}بدائل الشعب: انقر «افتح» ثم «اقترح توزيعاً» في المخطط.</span>` : ''}</div>` : '<p class="adv-note">لا توجد مادة يمكن اقتراحها الآن.</p>'}
        ${sug.skipped.length ? `<details class="mt-2"><summary class="adv-note fw-bold">لم تدخل المقترح (${sug.skipped.length})</summary><table class="adv-t mt-1"><tbody>${sug.skipped.map(x => `<tr><td><code>${x.c.code}</code></td><td>${esc(x.c.name || nm(x.c.code))}</td><td>${x.c.hours}</td><td>${esc(x.why)}</td><td class="no-print"><button type="button" class="btn btn-sm btn-light" data-force="${x.c.code}"><i class="bi bi-plus-lg"></i> قدّمها</button></td></tr>`).join('')}</tbody></table></details>` : ''}
        ${st.drop.size ? `<p class="adv-src mt-2">أُخرجت يدوياً: ${[...st.drop].map(c => `<code>${c}</code> <a href="#" data-undrop="${c}">إرجاع</a>`).join('، ')}</p>` : ''}</div>
      ${pathsCard(s)}
      <div class="adv-card"><h3><i class="bi bi-list-ol"></i> المواد التي يحق له تسجيلها، حسب الأولوية <span class="badge text-bg-light border">${ready.length}</span></h3>
        <div class="table-responsive"><table class="adv-t"><thead><tr><th>#</th><th>الرمز</th><th>المادة</th><th>س</th><th>المجموعة</th><th>لماذا</th><th>هذا الفصل</th></tr></thead><tbody>
        ${ready.map((c, i) => `<tr class="${inSug.has(c.code) ? '' : 'adv-x'}"><td>${i + 1}</td><td><code>${c.code}</code></td><td>${esc(c.name || nm(c.code))}${inSug.has(c.code) ? ' <i class="bi bi-check2-circle adv-ok" title="في المقترح"></i>' : ''}</td><td>${c.hours}</td><td><small>${esc(c.g.name)}</small></td>
          <td>${c.why.map(([k, l]) => `<span class="adv-chip ${k}">${esc(l)}</span>`).join('')}${c.unlocks.length ? `<div class="adv-src">تفتح: ${c.unlocks.map(u => `<code>${u}</code>`).join(' ')}</div>` : ''}</td><td>${sectionsLine(c.code)}</td></tr>`).join('') || '<tr><td colspan="7">—</td></tr>'}</tbody></table></div></div>
      ${notOff.length ? `<div class="adv-card"><h3><i class="bi bi-slash-circle"></i> يحق له تسجيلها ولكنها غير مطروحة <span class="badge text-bg-light border">${notOff.length}</span></h3>
        ${lim.grad && notOff.some(c => c.required) ? `<div class="alert alert-warning py-2">الطالب متوقع تخرجه وفي المتبقي مواد إجبارية غير مطروحة: يجوز للعميد بتنسيب من رئيس القسم الموافقة على مادتين بديلتين حداً أقصى، مكافئتين في المستوى والساعات ومن اختياريات التخصص ${ruleLink('11', 'م 11/د')}.</div>` : ''}
        <table class="adv-t"><thead><tr><th>الرمز</th><th>المادة</th><th>س</th><th>بدائل مطروحة</th></tr></thead><tbody>${notOff.map(c => { const x = altFor(c);
          return `<tr><td><code>${c.code}</code></td><td>${esc(c.name || nm(c.code))}<div>${c.why.filter(w => w[0] !== 'el').map(([k, l]) => `<span class="adv-chip ${k}">${esc(l)}</span>`).join('')}</div></td><td>${c.hours}</td><td>
            ${x.eq.map(e => `<div><span class="adv-chip unlock">مكافئة</span> <code>${e.code}</code> ${esc(nm(e.code))} ${sectionsLine(e.code)}${e.src ? ` <small class="adv-src">(${esc(e.src)})</small>` : ''}</div>`).join('')}
            ${x.same.map(e => `<div><span class="adv-chip chain">الاسم نفسه برمز آخر</span> <code>${e.code}</code> ${esc(e.name)} ${sectionsLine(e.code)}</div>`).join('')}
            ${x.el.slice(0, 6).map(e => `<div><span class="adv-chip el">اختيارية بالساعات نفسها</span> <code>${e.code}</code> ${esc(e.name || nm(e.code))} ${sectionsLine(e.code)}</div>`).join('')}
            ${!x.eq.length && !x.same.length && !x.el.length ? '<span class="adv-src">لا بديل مطروح معروف. يمكن رفع قائمة المواد المكافئة من «قاموس المواد».</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
      <div class="adv-card"><h3><i class="bi bi-hourglass-split"></i> متبقية بانتظار متطلب سابق <span class="badge text-bg-light border">${waiting.length}</span></h3>
        <table class="adv-t"><thead><tr><th>الرمز</th><th>المادة</th><th>س</th><th>ينتظر</th></tr></thead><tbody>
        ${waiting.map(c => `<tr><td><code>${c.code}</code></td><td>${esc(c.name || nm(c.code))}</td><td>${c.hours}</td><td>${c.missing.map(m => `<code title="${esc(nm(m) || a.byCode[m]?.name || '')}">${m}</code>${a.current.has(m) ? ' <small class="adv-ok">(مسجلة الآن)</small>' : ''}`).join(c.preOr ? ' أو ' : ' و ')}</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>'}</tbody></table>
        ${a.open.filter(c => c.inProgress).length ? `<p class="adv-src mt-2">مسجلة هذا الفصل: ${a.open.filter(c => c.inProgress).map(c => `<code>${c.code}</code> ${esc(c.name)}`).join('، ')}</p>` : ''}</div>
      ${Object.keys(a.tries).length ? `<div class="adv-card"><h3><i class="bi bi-arrow-counterclockwise"></i> محاولات سابقة (مواد غير محتسبة خارج الخطة)</h3><table class="adv-t"><thead><tr><th>الرمز</th><th>المادة</th><th>المحاولات</th><th>الآن</th></tr></thead><tbody>
        ${Object.entries(a.tries).map(([code, L]) => `<tr><td><code>${code}</code></td><td>${esc(L[0].name)}</td><td>${L.map(t => `<span class="adv-chip ${t.result === 'راسب' ? 'retake' : ''}">${esc(t.grade || '—')} · ${esc(termName(t.term))}</span>`).join('')}</td><td>${a.passed.has(code) ? '<span class="adv-ok">ناجح</span>' : a.current.has(code) ? 'مسجلة الآن' : '<span class="adv-bad">لم ينجح بعد</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="adv-src"><i class="bi bi-shield-lock"></i> كل ما في هذه الصفحة من ملف الطالب نفسه، قُرئ في هذا المتصفح ولم يُرسل إلى أي مكان. المواد والمتطلبات والعلامات من الكشف كما هو، والشعب من الجدول الدراسي المنشور (${esc(TT.term)}، آخر تحديث ${U.ago(TT.updated)})، والقواعد من ${ruleLink('', 'تعليمات منح درجة البكالوريوس لسنة 2023')}. المقترح للإرشاد؛ التسجيل الفعلي على بوابة الجامعة.</p>`;
  }
  // ---------------------------------------------------------------- paths to graduation
  const PATHS = [
    ['fast', 'الأسرع', 'bi-lightning-charge', { load: 18, summer: true }, 'الحد الأعلى في كل فصل اعتيادي (18) ومعها الفصول الصيفية (10)'],
    ['regular', 'منتظم', 'bi-signpost-2', { load: 18, summer: false }, 'الحد الأعلى في الفصول الاعتيادية، بلا صيفي'],
    ['light', 'مخفف', 'bi-feather', { load: 15, summer: false }, '15 ساعة في الفصل الاعتيادي — لمن يعمل أو يحتاج رفع معدله'],
  ];
  function pathsCard(s) {
    const a = analyse(s, { assumeCurrent: true });
    const res = PATHS.map(([k, l, ic, o, d]) => {
      const opt = k === 'light' && a.warned ? { load: 12, summer: false } : o;
      return { k, l, ic, d: k === 'light' && a.warned ? '12 ساعة (الحد الأدنى) لأن الطالب منذر — للتركيز على رفع المعدل' : d, p: paths(s, opt) };
    });
    const pick = res.find(r => r.k === (st.path || 'regular')) || res[1];
    const box = (tm, i, L) => `<div class="adv-term ${tm.summer ? 'sum' : ''} ${tm.stuck ? 'stuck' : ''}"><div class="adv-term-h"><b>${esc(termName(tm.term))}</b>${tm.summer ? ' <span class="adv-chip">صيفي</span>' : ''}
        <span class="ms-auto text-nowrap">${tm.hours} س${i === L.length - 1 && !tm.stuck ? ' · <span class="adv-ok">التخرج</span>' : ''}</span></div>
      ${tm.stuck ? '<div class="adv-bad small">لا مادة متاحة: متطلب سابق خارج الخطة أو يحتاج قراراً (م 5/هـ/2)</div>' : tm.take.map(x => `<div class="adv-term-c"><code>${esc(x.code)}</code> ${esc(x.name || nm(x.code))} <small>${x.hours}</small>${x.code !== '—' && offered(x.code).length ? '<i class="bi bi-dot adv-ok" title="مطروحة هذا الفصل"></i>' : ''}${x.el && x.el !== 'free' ? ' <span class="adv-chip el">اختيارية</span>' : ''}</div>`).join('')}</div>`;
    return `<div class="adv-card"><h3><i class="bi bi-signpost-split"></i> مسارات التخرج</h3>
      <p class="adv-src">من الفصل الذي يلي كشف الطالب، على اعتبار نجاحه فيما سجّله الآن: كل فصل يأخذ المواد التي اجتاز متطلباتها في فصل سابق، حسب أولويتها، ضمن الحمل المختار والحد الأعلى ${ruleLink('7', 'م 7')} (ويرتفع إلى 21 في فصل التخرج، م 7/ب). جداول الفصول القادمة لم تُنشر بعد، فالمسار ترتيب تسمح به المتطلبات وليس شعباً مضمونة.</p>
      <div class="adv-ctl mb-3 no-print">${res.map(r => `<button type="button" class="btn btn-sm ${r === pick ? 'btn-maroon' : 'btn-light border'}" data-path="${r.k}"><i class="bi ${r.ic}"></i> ${r.l}: ${r.p.stuck ? 'يتوقف' : `التخرج ${esc(termName(r.p.end))}`} <small>(${r.p.regular} اعتيادي${r.p.summers ? ` + ${r.p.summers} صيفي` : ''})</small></button>`).join('')}</div>
      <p class="adv-note mb-2"><b>${esc(pick.l)}:</b> ${esc(pick.d)}.</p>
      <div class="adv-terms">${pick.p.terms.map(box).join('')}</div></div>`;
  }

  // the page's own sums against the figures printed on the PDF
  function consistency(s) {
    const a = analyse(s, { assumeCurrent: false });
    const checks = [];
    if (s.remainingHours != null) checks.push(['الساعات المتبقية', a.remainingNow, s.remainingHours]);
    a.groups.forEach(g => { if (g.printedPassed != null && COUNTS(g.kind)) checks.push([g.name, g.gotPassed, g.printedPassed]); });
    const bad = checks.filter(c => c[1] !== c[2]);
    return bad.length ? `<div class="adv-check no"><i class="bi bi-exclamation-triangle"></i> اختلاف عن أرقام الكشف: ${bad.map(b => `${esc(b[0])}: الصفحة ${b[1]}، الكشف ${b[2]}`).join(' · ')} — المعتمد ما في الكشف.</div>`
      : `<div class="adv-check ok"><i class="bi bi-check2-all"></i> مطابق لكشف الجامعة: الساعات المتبقية وساعات كل مجموعة (${checks.length} رقماً) كما هي مطبوعة في الكشف.</div>`;
  }

  // ---------------------------------------------------------------- the advising form for printing
  function printForm() {
    const s = STUD, h = s.head, a = analyse(s, { assumeCurrent: st.mode === 'next' });
    const summer = st.summer != null ? st.summer : (ttTerm() > s.term ? ttTerm() % 10 === 3 : false);
    const lim = limits(a, summer), cap = st.cap || lim.max;
    const sug = suggest(a, S, { max: cap, force: st.force, drop: st.drop });
    const sel = sug.best.combo;
    const link = new URL('planner.html?plan=' + sel.map(x => encodeURIComponent(U.sectionKey(x))).join('~'), location.href).href;
    let qr = '';
    try { const q = root.qrcode(0, 'M'); q.addData(link); q.make(); qr = q.createSvgTag({ cellSize: 3, margin: 0, scalable: true }); } catch (e) { qr = ''; }
    const rows = sug.take.map(t => { const mine = sel.filter(x => x.code === t.c.code);
      return `<tr><td>${t.c.code}</td><td>${esc(t.c.name || nm(t.c.code))}</td><td>${t.c.hours}</td><td>${mine.map(x => `ش ${esc(x.section)}${x.activity === 'عملي' ? ' (عملي)' : ''}: ${x.meetings.filter(live).map(m => `${(TT.days || {})[m.day] || m.day} ${m.start}–${m.end}`).join('، ') || 'غير متزامن'}`).join('<br>')}</td><td>${esc(t.c.why.map(w => w[1]).join('، '))}</td></tr>`; }).join('');
    const waiting = a.open.filter(c => !c.ready && !c.inProgress).slice(0, 12);
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>نموذج إرشاد – ${esc(h.name || '')}</title>
      <style>@page{size:A4;margin:12mm} body{font-family:Tajawal,Arial,sans-serif;color:#000;font-size:12px} h1{font-size:18px;margin:0} h2{font-size:14px;margin:12px 0 6px;border-bottom:2px solid #901d23;padding-bottom:2px}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #555;padding:4px 6px;text-align:right;vertical-align:top} th{background:#eee} .kv{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 12px}
      .kv b{font-weight:700} .top{display:flex;justify-content:space-between;align-items:center;gap:12px} .qr{width:92px;text-align:center;font-size:10px} .qr svg{width:92px;height:92px}
      .sig{display:flex;gap:30px;margin-top:26px} .sig div{flex:1;border-top:1px solid #000;padding-top:4px;text-align:center} .small{font-size:10.5px}</style></head><body>
      <div class="top"><div><h1>نموذج الإرشاد الأكاديمي</h1><div>جامعة البترا · ${esc(h.faculty || '')} · ${esc(h.major || '')} (إصدار ${esc(s.version || '')})</div></div>
        <div class="qr">${qr}<div>المقترح في «مخطط جدولي»</div></div></div>
      <h2>الطالب</h2><div class="kv"><div><b>الاسم:</b> ${esc(h.name || '')}</div><div><b>الرقم:</b> ${esc(h.id || '')}</div><div><b>المستوى:</b> ${esc(s.level || '')}</div>
        <div><b>المعدل التراكمي:</b> ${s.gpa != null ? s.gpa.toFixed(2) : '—'}${a.warned ? ' (منذر)' : ''}</div><div><b>الساعات المجتازة:</b> ${s.passedHours ?? '—'}</div><div><b>المتبقية:</b> ${a.remainingNow} من ${s.planHours ?? '—'}</div>
        <div><b>المرشد:</b> ${esc(h.advisor || '')}</div><div><b>كشف:</b> ${esc(s.termLabel || '')}</div><div><b>تاريخ الإرشاد:</b> ${U.numDate(new Date().toISOString())}</div></div>
      <h2>الجدول المقترح (${sug.hours} ساعة؛ الحد الأعلى ${lim.max} وفق المادة ${lim.rule} من تعليمات منح درجة البكالوريوس 2023)</h2>
      <table><thead><tr><th>الرمز</th><th>المادة</th><th>س</th><th>الشعبة والموعد</th><th>سبب الأولوية</th></tr></thead><tbody>${rows || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
      ${sug.skipped.length ? `<p class="small"><b>بدائل إن تعذّر التسجيل:</b> ${sug.skipped.slice(0, 8).map(x => `${x.c.code} ${esc(x.c.name || '')}`).join('، ')}</p>` : ''}
      ${waiting.length ? `<h2>مواد متبقية بانتظار متطلب سابق</h2><p class="small">${waiting.map(c => `${c.code} ${esc(c.name || '')} ← ${c.missing.join(' و ')}`).join(' · ')}</p>` : ''}
      ${(() => { const pp = paths(s, { load: 18, summer: false }); return pp.terms.length ? `<h2>مسار التخرج المنتظم (18 ساعة، بلا صيفي): التخرج المتوقع ${esc(termName(pp.end))}</h2><table><tbody>${pp.terms.map(tm => `<tr><td style="white-space:nowrap"><b>${esc(termName(tm.term))}</b><br>${tm.hours} س</td><td class="small">${tm.take.map(x => `${x.code} ${esc(x.name || '')}`).join('، ')}</td></tr>`).join('')}</tbody></table>` : ''; })()}
      <h2>ملاحظات المرشد</h2><div style="height:70px;border:1px solid #555"></div>
      <div class="sig"><div>توقيع الطالب</div><div>توقيع المرشد الأكاديمي</div><div>رئيس القسم</div></div>
      <p class="small" style="margin-top:14px">الشعب من الجدول الدراسي المنشور على بوابة الجامعة (${esc(TT.term)})؛ المواد والمتطلبات من «تحليل خطة الطالب». المقترح للإرشاد، والتسجيل الفعلي على بوابة الجامعة. بوصلة البترا · مكتب الإرشاد</p>
      <script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { U.modal('نموذج الإرشاد', 'اسمح بالنوافذ المنبثقة لهذه الصفحة لطباعة النموذج.'); return; }
    w.document.write(html); w.document.close();
  }

  // ---------------------------------------------------------------- plans kept on this device (IndexedDB), and the import from the portal
  const PV = 2;   // the reader's version: plans kept by an older reader are read again from their PDF
  const PORTAL = 'https://edugate.uop.edu.jo';
  const IMP = { on: P.get('from') === 'edugate', got: 0, ok: 0, warn: 0, bad: 0, last: '', done: null, list: [] };
  function idb() {
    return new Promise((res, rej) => { const r = indexedDB.open('uop-advising', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('plans', { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function store(rec) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('plans', 'readwrite'); t.objectStore('plans').put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function storedAll() { try { const db = await idb(); return await new Promise((res, rej) => { const r = db.transaction('plans').objectStore('plans').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch (e) { return []; } }
  async function storedClear() { const db = await idb(); return new Promise(res => { const t = db.transaction('plans', 'readwrite'); t.objectStore('plans').clear(); t.oncomplete = res; }); }
  // the PDF's own figures against the page's sums: [] when everything matches
  function mismatches(s) {
    const a = analyse(s, { assumeCurrent: false }), out = [];
    if (s.remainingHours != null && a.remainingNow !== s.remainingHours) out.push(`المتبقية ${a.remainingNow}≠${s.remainingHours}`);
    a.groups.forEach(g => { if (g.printedPassed != null && COUNTS(g.kind) && g.gotPassed !== g.printedPassed) out.push(`${g.name} ${g.gotPassed}≠${g.printedPassed}`); });
    return out;
  }
  function addBoard(s) { BOARD = BOARD.filter(x => x.head.id !== s.head.id); BOARD.push(s); BOARD.sort((x, y) => String(x.head.name).localeCompare(String(y.head.name), 'ar')); }
  async function loadStored() {
    const recs = await storedAll();
    for (const r of recs) {
      let s = r.pv === PV && r.parsed ? r.parsed : null;
      if (!s && r.pdf) { try { s = parsePlan(await pdfItems(r.pdf.slice(0)), knownCodes(), planHours); r.parsed = s; r.pv = PV; r.warn = mismatches(s); await store(r); } catch (e) { continue; } }
      if (s && s.ok) { s.stored = r.importedAt; s.src = r.src; s.warn = r.warn; addBoard(s); }
    }
    return recs.length;
  }
  let dataReady; const DATA_READY = new Promise(r => { dataReady = r; });
  let rT = 0;
  const soon = () => { clearTimeout(rT); rT = setTimeout(() => { if (st.view === 'board') render(); }, 400); };
  window.addEventListener('message', async e => {
    if (e.origin !== PORTAL || !e.data || typeof e.data !== 'object') return;
    const d = e.data, reply = m => { try { e.source.postMessage(m, PORTAL); } catch (x) { /* portal tab closed */ } };
    await DATA_READY;
    if (d.type === 'uop-hello') { IMP.on = true; if (st.view !== 'board') { st.view = 'board'; render(); } reply({ type: 'uop-ready' }); return; }
    if (d.type === 'uop-plan') {
      IMP.got++; IMP.last = d.meta && d.meta.name || '';
      try {
        const s = parsePlan(await pdfItems(d.pdf.slice(0)), knownCodes(), planHours);
        if (!s.ok) throw new Error('الملف ليس «تحليل خطة الطالب»');
        if (String(s.head.id) !== String(d.id)) throw new Error(`رقم الطالب في الملف ${s.head.id} لا يطابق ${d.id}`);
        const g = parseFloat(d.meta && d.meta.gpa);
        if (!isNaN(g) && s.gpa != null && Math.abs(g - s.gpa) > 0.005) throw new Error(`المعدل في الملف ${s.gpa} لا يطابق القائمة ${g}`);
        const warn = mismatches(s);
        const rec = { id: String(d.id), meta: d.meta, pdf: d.pdf, parsed: s, pv: PV, importedAt: new Date().toISOString(), src: 'portal', warn };
        await store(rec);
        s.stored = rec.importedAt; s.src = 'portal'; s.warn = warn; addBoard(s);
        IMP.ok++; if (warn.length) IMP.warn++;
        reply({ type: 'uop-ack', id: d.id, ok: true, warn: warn.join('، ') });
      } catch (err) {
        IMP.bad++; IMP.list.push(`${d.meta && d.meta.name || d.id}: ${err.message}`);
        reply({ type: 'uop-ack', id: d.id, ok: false, reason: err.message });
      }
      soon(); return;
    }
    if (d.type === 'uop-done') {
      IMP.done = d; soon();
      const body = `${BOARD.length} خطة محفوظة على هذا الجهاز${d.bad ? ` · تعذّرت ${d.bad}` : ''}`;
      document.title = '✓ اكتمل سحب الخطط – مكتب الإرشاد';
      try { if (window.Notification && Notification.permission === 'granted') new Notification('اكتمل سحب خطط الطلبة', { body, icon: 'assets/icons/icon-192.png' }); } catch (x) { /* no notifications */ }
    }
  });
  const BM = () => `javascript:(function(){var s=document.createElement('script');s.src='${new URL('assets/edugate-import.js', location.href).href.split('?')[0]}?t='+Date.now();document.body.appendChild(s);})();`;
  function importCard(saved) {
    const run = IMP.on && !IMP.done;
    const pct = IMP.done ? 100 : IMP.done === null && IMP.got ? Math.min(99, 100 * IMP.got / Math.max(IMP.got, (IMP.total || IMP.got))) : 0;
    return `<div class="adv-card adv-imp"><h3><i class="bi bi-cloud-arrow-down"></i> سحب خطط طلابي من بوابة الجامعة ${saved ? `<span class="badge text-bg-light border">${saved} خطة محفوظة على هذا الجهاز</span>` : ''}</h3>
      ${IMP.on ? `<div class="adv-prog"><div class="d-flex justify-content-between"><b>${IMP.done ? (IMP.done.stopped ? 'أُوقف السحب' : '✓ اكتمل السحب') : 'جارٍ السحب من البوابة…'}</b><span>${IMP.ok} مطابقة${IMP.warn ? ` · ${IMP.warn} بتنبيه` : ''}${IMP.bad ? ` · ${IMP.bad} تعذّرت` : ''}${IMP.done ? ` من ${IMP.done.total}` : ''}</span></div>
        <div class="adv-pbar"><i style="width:${IMP.done ? 100 : Math.min(98, IMP.got * 1.2)}%" class="${IMP.done ? 'done' : 'run'}"></i></div>
        <div class="adv-src">${run ? `آخر خطة: ${esc(IMP.last)} — تابع التقدم التفصيلي في تبويب البوابة.` : ''}${IMP.list.length ? `<details><summary>ما تعذّر (${IMP.list.length})</summary>${IMP.list.map(esc).join('<br>')}</details>` : ''}</div></div>` : ''}
      <ol class="adv-steps">
        <li><span>1</span><div><b>مرة واحدة فقط:</b> اسحب هذا الزر بالفأرة إلى شريط المفضلة في متصفحك <a class="adv-bm" href="${BM()}" title="اسحبه إلى شريط المفضلة"><i class="bi bi-bookmark-star"></i> سحب الخطط</a>
          <div class="adv-src">لا يظهر شريط المفضلة؟ اضغط Ctrl+Shift+B (أو ⌘+Shift+B على Mac).</div></div></li>
        <li><span>2</span><div>افتح <a href="${PORTAL}/staff/studentPlan" target="_blank" rel="noopener"><b>بوابة المدرس</b></a> وسجّل الدخول كالمعتاد باسم المستخدم وكلمة المرور.</div></li>
        <li><span>3</span><div>اضغط «سحب الخطط» في شريط المفضلة، ثم <b>«تأكيد وابدأ السحب»</b>. تُسحب خطة كل طالب مسند إليك كما تطبعها البوابة، وتظهر هنا أولاً بأول مع شريط التقدم، ويصلك تنبيه عند الانتهاء.</div></li></ol>
      <div class="adv-note"><i class="bi bi-shield-lock"></i> تسجيل الدخول يتم في بوابة الجامعة نفسها؛ لا يرى هذا الموقع اسم المستخدم ولا كلمة المرور ولا يحفظهما ولا يستخدمهما. تُنقل الخطط من صفحة البوابة إلى هذه الصفحة داخل متصفحك مباشرة، وتُحفظ على هذا الجهاز فقط فلا تحتاج إلى سحبها مرة أخرى. يُتحقق من كل خطة: رقم الطالب ومعدله يطابقان قائمة البوابة، وساعات كل مجموعة تطابق المطبوع في الخطة.</div>
      ${saved ? `<div class="d-flex flex-wrap gap-2 mt-2 no-print"><button type="button" class="btn btn-sm btn-outline-danger" id="adv-clear"><i class="bi bi-trash"></i> حذف الخطط المحفوظة من هذا الجهاز</button>${!window.Notification || Notification.permission === 'granted' ? '' : '<button type="button" class="btn btn-sm btn-light border" id="adv-notif"><i class="bi bi-bell"></i> نبّهني عند انتهاء السحب</button>'}</div>`
        : (!window.Notification || Notification.permission === 'granted' ? '' : '<button type="button" class="btn btn-sm btn-light border mt-2 no-print" id="adv-notif"><i class="bi bi-bell"></i> نبّهني عند انتهاء السحب</button>')}</div>`;
  }
  let SAVED = 0;

  // ---------------------------------------------------------------- view: the advisor's board (many students)
  function boardView() {
    const rows = BOARD.map(s => {
      const a = analyse(s, { assumeCurrent: true }), a0 = analyse(s, { assumeCurrent: false });
      const lim = limits(a, false);
      const reqNotOff = a.open.filter(c => c.ready && c.required && !offered(c.code).length);
      const failedNow = Object.values(a.tries).filter(L => L.some(t => t.result === 'راسب') && !a.passed.has(L[0].code)).length;
      return { s, a, a0, lim, reqNotOff, failedNow, weak: !a.warned && ((s.gpa != null && s.gpa < 2.2) || failedNow >= 2) };
    });
    const grad = rows.filter(r => r.lim.grad), warned = rows.filter(r => r.a.warned), weak = rows.filter(r => !r.a.warned && ((r.s.gpa != null && r.s.gpa < 2.2) || r.failedNow >= 2));
    // demand: how many of these students may register each course next term
    const demand = {};
    rows.forEach(r => r.a.open.filter(c => c.ready).forEach(c => { const d = demand[c.code] ||= { code: c.code, name: c.name || nm(c.code), n: 0, grad: 0, req: 0 }; d.n++; if (r.lim.grad) d.grad++; if (c.required) d.req++; }));
    const D = Object.values(demand).sort((x, y) => y.grad - x.grad || y.n - x.n);
    const filt = st.boardFilter || 'all';
    const show = filt === 'grad' ? grad : filt === 'warn' ? warned : filt === 'weak' ? weak : rows;
    return `${importCard(SAVED || BOARD.filter(s => s.stored).length)}<div class="adv-card"><h3><i class="bi bi-people"></i> أو ارفع ملفات الخطط يدوياً</h3>
      <label class="adv-drop d-block" id="adv-drop"><i class="bi bi-files"></i><div class="fw-bold mt-1">اختر ملفات «تحليل خطة الطالب» لطلبتك (PDF، أكثر من ملف) أو اسحبها إلى هنا</div>
        <div class="adv-note mt-1">تُقرأ في هذا المتصفح فقط وتُحفظ على هذا الجهاز.</div><input type="file" accept="application/pdf,.pdf" id="adv-file" multiple hidden></label><div id="adv-msg" class="mt-2"></div></div>
      ${rows.length ? `<div class="adv-stats mb-3">
        <div class="adv-stat"><div class="v">${rows.length}</div><div class="l">طالباً</div></div>
        <div class="adv-stat good"><div class="v">${grad.length}</div><div class="l">متوقع تخرجهم (≤ 21 ساعة)</div></div>
        <div class="adv-stat bad"><div class="v">${warned.length}</div><div class="l">منذرون (معدل &lt; 2.00) م 12</div></div>
        <div class="adv-stat"><div class="v">${weak.length}</div><div class="l">متعثرون (قرب الإنذار أو رسوب متكرر)</div></div>
        <div class="adv-stat ${rows.some(r => r.lim.grad && r.reqNotOff.length) ? 'bad' : ''}"><div class="v">${rows.filter(r => r.lim.grad && r.reqNotOff.length).length}</div><div class="l">متوقع تخرجهم وتنقصهم مواد غير مطروحة</div></div></div>
      <div class="adv-card"><h3><i class="bi bi-table"></i> الطلبة
        <span class="adv-ctl ms-auto no-print">${[['all', 'الكل'], ['grad', 'متوقع تخرجهم'], ['warn', 'المنذرون'], ['weak', 'المتعثرون']].map(([k, l]) => `<button type="button" class="btn btn-sm ${filt === k ? 'btn-maroon' : 'btn-light'}" data-bf="${k}">${l}</button>`).join('')}
        <button type="button" class="btn btn-sm btn-outline-secondary" id="adv-bcsv"><i class="bi bi-filetype-csv"></i> CSV</button><button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.print()"><i class="bi bi-printer"></i> طباعة</button></span></h3>
        <div class="table-responsive"><table class="adv-t"><thead><tr><th>الطالب</th><th>التخصص</th><th>المعدل</th><th>مجتازة</th><th>متبقية</th><th>مسجلة الآن</th><th>الحالة</th><th>إجبارية غير مطروحة</th><th class="no-print"></th></tr></thead><tbody>
        ${show.map(r => `<tr><td><b>${esc(r.s.head.name || '')}</b><div class="adv-src">${esc(r.s.head.id || '')}</div></td><td><small>${esc(r.s.head.major || '')} (${esc(r.s.version)})</small></td>
          <td class="${r.a.warned ? 'adv-bad fw-bold' : ''}">${r.s.gpa != null ? r.s.gpa.toFixed(2) : '—'}</td><td>${r.s.passedHours ?? ''}</td><td>${r.a0.remainingNow}</td><td>${r.a.current.size}</td>
          <td>${r.lim.grad ? '<span class="adv-chip unlock">متوقع تخرجه</span>' : ''}${r.a.warned ? '<span class="adv-chip retake">منذر</span>' : ''}${r.weak ? '<span class="adv-chip req">متعثر</span>' : ''}${(r.s.warn || []).length ? `<span class="adv-chip closed" title="${esc(r.s.warn.join('، '))}">⚠ رقم لا يطابق الكشف</span>` : ''}${r.failedNow ? `<span class="adv-chip closed">${r.failedNow} مادة لم ينجح بها بعد</span>` : ''}</td>
          <td>${r.reqNotOff.map(c => `<code title="${esc(c.name)}">${c.code}</code>`).join(' ') || '—'}</td>
          <td class="no-print"><button type="button" class="btn btn-sm btn-light" data-open="${esc(r.s.head.id)}">افتح</button></td></tr>`).join('')}</tbody></table></div></div>
      <div class="adv-card"><h3><i class="bi bi-bar-chart-line"></i> الطلب المتوقع على المواد في الفصل القادم <span class="badge text-bg-light border">${D.length}</span></h3>
        <p class="adv-src">عدد طلبة هذه اللوحة الذين يحق لهم تسجيل كل مادة (متطلباتها مجتازة أو مسجلة الآن)، ومنهم المتوقع تخرجهم — لتخطيط الشعب. المواد غير المطروحة الآن مميزة.</p>
        <div class="table-responsive"><table class="adv-t"><thead><tr><th>الرمز</th><th>المادة</th><th>يحق لهم</th><th>متوقع تخرجهم</th><th>إجبارية لـ</th><th>هذا الفصل</th></tr></thead><tbody>
        ${D.map(d => `<tr class="${offered(d.code).length ? '' : 'table-warning'}"><td><code>${d.code}</code></td><td>${esc(d.name)}</td><td><b>${d.n}</b></td><td>${d.grad || ''}</td><td>${d.req || ''}</td><td>${sectionsLine(d.code)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  }

  // ---------------------------------------------------------------- view: a new student
  function freshView() {
    const progs = guidancePrograms();
    const p = progs.find(x => x.key === st.fresh.prog);
    const tt = ttTerm(), termNo = tt % 10 === 2 ? 'second' : 'first';
    let body = '';
    if (p) {
      const y1 = (p.r.years || []).find(y => y.year === 1);
      const t = y1 && (y1.terms.find(x => x.term === termNo) || y1.terms[0]);
      const list = t ? t.courses.slice() : [];
      // placement tests: a student who did not pass studies the remedial course first (instructions, article 5/ب)
      const REM = [['ar', '9401099', '9400113', 'اللغة العربية'], ['en', '9402099', '9400123', 'اللغة الإنجليزية'], ['pc', '9601099', '9600104', 'المهارات الحاسوبية']];
      let courses = list.map(c => ({ code: c.code, name: c.name || nm(c.code), hours: c.hours || 3, prereq: [], g: { fixed: true, name: 'الخطة الاسترشادية' }, why: [['req', `${['', 'الفصل الأول', 'الفصل الثاني'][termNo === 'first' ? 1 : 2]} من الخطة الاسترشادية`]], ready: true, required: true, level: 1, score: 0 }));
      REM.forEach(([k, rem, real, label]) => {
        if (!st.fresh[k]) return;
        const i = courses.findIndex(c => c.code === real || (k === 'pc' && /^9600/.test(c.code)));
        const rc = { code: rem, name: nm(rem) || `${label} – استدراكية`, hours: 3, prereq: [], g: { fixed: true, name: 'استدراكية' }, why: [['retake', `لم ينجح في امتحان مستوى ${label}`]], ready: true, required: true, level: 0, score: 0 };
        if (i >= 0) courses.splice(i, 1, rc); else courses.unshift(rc);
      });
      courses = courses.filter(c => /^\d{6,7}$/.test(c.code));
      const slots = list.filter(c => !/^\d{6,7}$/.test(c.code));
      const a = { st: { head: { studyType: 'صباحي' } }, groups: [], open: courses };
      const sug = suggest(a, S, { max: 18 });
      const sel = sug.best.combo;
      const colour = {}; sug.take.forEach((x, i) => { colour[x.c.code] = U.PALETTE[i % U.PALETTE.length]; });
      const planner = 'planner.html?plan=' + sel.map(x => encodeURIComponent(U.sectionKey(x))).join('~');
      body = `<div class="adv-card"><h3><i class="bi bi-backpack"></i> حزمة الفصل الأول: ${esc(p.label)} <span class="badge text-bg-light border">${sug.hours} ساعة</span></h3>
        <p class="adv-src">من الخطة الاسترشادية المنشورة للقسم (${esc(p.r.academic_year || '')}${p.r.edition ? ` · إصدار ${p.r.edition}` : ''})، السنة الأولى – ${termNo === 'first' ? 'الفصل الأول' : 'الفصل الثاني'}، مع شعب الجدول الدراسي ${esc(TT.term)}.
          <a href="advisory.html?p=${encodeURIComponent(p.prog.id)}" target="_blank" rel="noopener">الخطة كاملة</a></p>
        <div class="adv-ctl mb-2">${REM.map(([k, , , l]) => `<label class="adv-pick"><input type="checkbox" data-rem="${k}" ${st.fresh[k] ? 'checked' : ''}>لم ينجح في امتحان مستوى ${l}</label>`).join('')}</div>
        <table class="adv-t"><thead><tr><th>الرمز</th><th>المادة</th><th>س</th><th>الشعبة والموعد</th></tr></thead><tbody>
        ${courses.map(c => { const mine = sel.filter(x => x.code === c.code);
          return `<tr class="${mine.length ? '' : 'adv-x'}"><td><code>${c.code}</code></td><td>${esc(c.name)}${c.why[0][0] === 'retake' ? ' <span class="adv-chip retake">استدراكية</span>' : ''}</td><td>${c.hours}</td><td>${mine.length ? mine.map(x => `ش ${esc(x.section)}${x.activity === 'عملي' ? ' (عملي)' : ''}: ${x.meetings.filter(live).map(m => `${(TT.days || {})[m.day] || m.day} <span dir="ltr">${m.start}–${m.end}</span>`).join('، ') || 'غير متزامن'}`).join('<br>')
            : offered(c.code).length ? '<span class="adv-bad">تتعارض أو تتجاوز الساعات</span>' : '<span class="adv-chip off">غير مطروحة هذا الفصل</span>'}</td></tr>`; }).join('')}
        ${slots.map(c => `<tr><td>—</td><td>${esc(c.name)} <span class="adv-src">(يختارها الطالب: ${esc(c.code)})</span></td><td>${c.hours || ''}</td><td>انظر المطروح من متطلبات الجامعة الاختيارية في <a href="plans.html" target="_blank" rel="noopener">الخطط الدراسية</a></td></tr>`).join('')}</tbody></table>
        ${sel.length ? `<div class="mt-3">${U.weekGrid(sel.flatMap(x => x.meetings.map(m => ({ day: m.day, start: live(m) ? m.start : '', end: m.end, title: x.code, line: nm(x.code), sub: `ش ${x.section}`, style: `background:${colour[x.code][1]};border-inline-start-color:${colour[x.code][0]}` }))), { compact: true })}</div>
          <a class="btn btn-sm btn-maroon mt-2" href="${planner}" target="_blank" rel="noopener"><i class="bi bi-calendar2-week"></i> افتح في «مخطط جدولي»</a>` : ''}</div>`;
    }
    return `<div class="adv-card"><h3><i class="bi bi-stars"></i> طالب جديد</h3>
      <div class="adv-ctl"><label>البرنامج <select class="form-select form-select-sm" id="adv-prog"><option value="">— اختر —</option>
        ${progs.map(x => `<option value="${esc(x.key)}" ${x.key === st.fresh.prog ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label></div>
      <p class="adv-src mt-2 mb-0">البرامج التي قُرئت خطتها الاسترشادية المنشورة بمطابقة كاملة (${progs.length}). لغيرها انظر <a href="advisory.html" target="_blank" rel="noopener">الخطط الاسترشادية</a>.</p></div>${body}`;
  }
  function guidancePrograms() {
    if (!AP) return [];
    const reads = READS(), out = [];
    AP.programs.filter(p => p.type === 'bachelor').forEach(p => {
      let best = null;
      p.docs.map(id => AP.docs[id]).filter(d => d && d.kind === 'advisory').forEach(d => d.versions.slice().reverse().forEach(v => {
        const r = reads[v.sha];
        if (!best && r && r.ok && !r.bycat && (r.years || []).some(y => y.year === 1)) best = { r, d, v };
      }));
      if (best) out.push({ key: p.id, prog: p, r: best.r, label: `${p.ar} – ${p.faculty}` });
    });
    return out.sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }

  // ---------------------------------------------------------------- view: the course dictionary
  function dictView() {
    const q = clean(st.q);
    const same = sameName();
    let hits = [];
    if (q) {
      const nq = norm(q);
      hits = Object.keys(NAMES).filter(c => c.includes(q) || norm(NAMES[c]).includes(nq)).slice(0, 60);
    }
    const plansOf = code => (SP ? SP.plans : []).filter(p => p.groups.some(g => g.courses.some(c => c.code === code))).map(p => `${p.major} (${p.version})`);
    return `<div class="adv-card"><h3><i class="bi bi-book-half"></i> قاموس المواد</h3>
      <div class="adv-ctl"><input type="search" class="form-control" id="adv-dq" placeholder="رمز أو اسم مادة…" value="${esc(st.q)}" style="max-width:360px"></div>
      <p class="adv-src mt-2 mb-0">لكل مادة: وصفها كما في ملف «وصف المواد» للقسم، اسمها، الخطط الدراسية التي تضمها، شعبها هذا الفصل، الرموز الأخرى بالاسم نفسه في الخطط والخطط الاسترشادية المنشورة (رمز قديم أو جديد — للتحقق لا للمعادلة التلقائية)، والمواد المكافئة من القائمة المرفوعة.</p></div>
      ${hits.map(c => { const sm = same[c] || [], eq = eqOf(c), pl = plansOf(c);
        return `<div class="adv-card"><h3><code>${c}</code> ${esc(NAMES[c])} ${sectionsLine(c)}</h3>
          ${(DESC && DESC.courses && DESC.courses[c] || []).slice().sort((x, y) => (pfxOf(y.url) === c.slice(0, 3)) - (pfxOf(x.url) === c.slice(0, 3))).slice(0, 1).map(e => `<div class="adv-law mb-2">${e.clean || e.ocr || e.ai || !(e.img || []).length ? esc(e.text) : e.img.map(n => `<img src="data/coursedesc/${esc(n)}" alt="وصف المادة كما في الملف المنشور" loading="lazy" style="width:100%;max-width:820px;display:block;border:1px solid #ece6d6;border-radius:6px;margin-bottom:2px">`).join('')}<div class="adv-src mt-1"><i class="bi bi-file-earmark-pdf"></i> من <a href="${esc(e.url)}#page=${e.page || 1}" target="_blank" rel="noopener">«وصف المواد» – ${esc((DESC.docs[e.url] || {}).program || '')}</a>، صفحة ${e.page || 1}${e.pre ? ` · ${esc(e.pre)}` : ''}${DESC.courses[c].length > 1 ? ` · ووصفها كذلك ${DESC.courses[c].length - 1} ملف آخر` : ''}</div></div>`).join('')}
          ${pl.length ? `<div class="adv-note"><b>في الخطط الدراسية:</b> ${pl.slice(0, 12).map(esc).join('، ')}${pl.length > 12 ? ` و${pl.length - 12} غيرها` : ''}</div>` : ''}
          ${sm.length ? `<div class="adv-note mt-1"><b>الاسم نفسه برمز آخر:</b> ${sm.map(x => `<code>${x.code}</code> <small>(${[...x.where].slice(0, 3).map(esc).join('، ')})</small> ${sectionsLine(x.code)}`).join(' · ')}</div>` : ''}
          ${eq.length ? `<div class="adv-note mt-1"><b>مكافئة لها:</b> ${eq.map(x => `<code>${x.code}</code> ${esc(nm(x.code))} ${x.note ? `<small>(${esc(x.note)})</small>` : ''} ${sectionsLine(x.code)}`).join(' · ')}</div>` : ''}</div>`; }).join('') || (q ? '<p class="adv-note">لا نتائج.</p>' : '')}
      <div class="adv-card"><h3><i class="bi bi-arrow-left-right"></i> قائمة المواد المكافئة <span class="badge text-bg-light border">${EQ.length}</span>
        <span class="ms-auto d-flex flex-wrap gap-2 no-print"><label class="btn btn-sm btn-maroon mb-0"><i class="bi bi-upload"></i> رفع قائمة (Excel أو CSV)<input type="file" id="adv-eqf" accept=".csv,.xlsx,.xls,text/csv" hidden></label>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="adv-eqt"><i class="bi bi-file-earmark-arrow-down"></i> نموذج فارغ</button>
        ${EQ.length ? '<button type="button" class="btn btn-sm btn-outline-secondary" id="adv-eqx"><i class="bi bi-download"></i> تصدير</button><button type="button" class="btn btn-sm btn-outline-danger" id="adv-eqc"><i class="bi bi-trash"></i> مسح</button>' : ''}</span></h3>
        <p class="adv-src">يرفعها أي مستخدم (قسم، مرشد، لجنة خطط): عمود لرمز المادة وعمود لرمز المكافئة لها، واختيارياً ملاحظة ومصدر (قرار أو خطة). تُحفظ على هذا الجهاز فقط وتُستخدم في البدائل عند تحليل الطلبة؛ وتصدّرها لمشاركتها مع زملائك.</p>
        <form class="adv-ctl no-print mb-2" id="adv-eqadd"><input class="form-control form-control-sm" style="max-width:130px" name="a" placeholder="رمز المادة" required pattern="\\d{6,7}"><input class="form-control form-control-sm" style="max-width:130px" name="b" placeholder="المكافئة لها" required pattern="\\d{6,7}">
          <input class="form-control form-control-sm" style="max-width:240px" name="note" placeholder="ملاحظة أو مصدر (اختياري)"><button class="btn btn-sm btn-light"><i class="bi bi-plus-lg"></i> أضف</button></form>
        ${EQ.length ? `<div class="table-responsive"><table class="adv-t"><thead><tr><th>المادة</th><th>المكافئة لها</th><th>ملاحظة / مصدر</th><th class="no-print"></th></tr></thead><tbody>
          ${EQ.map((e, i) => `<tr><td><code>${e.a}</code> ${esc(nm(e.a))}</td><td><code>${e.b}</code> ${esc(nm(e.b))}</td><td><small>${esc([e.note, e.src].filter(Boolean).join(' · '))}</small></td><td class="no-print"><button type="button" class="btn btn-sm btn-light" data-eqdel="${i}"><i class="bi bi-x-lg"></i></button></td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
  }

  const PFX = {};
  function pfxOf(url) {   // the department of a description file: the number prefix most of its courses share
    if (!(url in PFX)) { const n = {}; Object.entries(DESC.courses).forEach(([c, L]) => L.forEach(e => { if (e.url === url) n[c.slice(0, 3)] = (n[c.slice(0, 3)] || 0) + 1; }));
      PFX[url] = (Object.entries(n).sort((a, b) => b[1] - a[1])[0] || [''])[0]; }
    return PFX[url];
  }
  function rulesView() {
    return `<div class="adv-card"><h3><i class="bi bi-bank"></i> القواعد الرسمية التي تطبقها الصفحة</h3>
      <p class="adv-note">منقولة بنصها من <a href="${BACH_URL}" target="_blank" rel="noopener"><b>تعليمات منح درجة البكالوريوس في جامعة البترا</b> (تعليمات رقم 17 لسنة 2023)</a> المنشورة في
        <a href="${REGS_PAGE}" target="_blank" rel="noopener">دليل القوانين والأنظمة والتعليمات</a> على موقع الجامعة. إن تعارض شيء هنا مع الوثيقة الرسمية فالمعتمد الوثيقة.</p></div>
      ${RULES.map(r => `<div class="adv-card"><h3>${esc(r.title)} <a class="adv-rule ms-auto" href="${BACH_URL}#page=${r.page}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf"></i> الوثيقة، صفحة ${r.page}</a></h3>
        ${r.text.map(t => `<div class="adv-law">${esc(t)}</div>`).join('')}<p class="adv-src mt-2 mb-0"><i class="bi bi-gear"></i> في الصفحة: ${esc(r.uses)}</p></div>`).join('')}
      <div class="adv-card"><h3><i class="bi bi-info-circle"></i> ما لا تحدده التعليمات</h3><p class="adv-note mb-0">لا تعرّف التعليمات «الطالب المتوقع تخرجه» بعدد ساعات؛ تعدّه الصفحة كذلك إذا كانت ساعاته المتبقية (بعد نجاح ما سجّله الآن) لا تزيد على الحد الأعلى للمتوقع تخرجه (21 في الفصل الاعتيادي، 13 في الصيفي)، أي يمكنه إنهاؤها في الفصل نفسه. ترتيب الأولويات اجتهاد إرشادي معلن السبب بجانب كل مادة.</p></div>`;
  }

  // ---------------------------------------------------------------- page frame and events
  function render() {
    const tabs = [['student', 'bi-person-vcard', 'تحليل طالب'], ['board', 'bi-people', 'لوحة المرشد'], ['fresh', 'bi-stars', 'طالب جديد'], ['dict', 'bi-book-half', 'قاموس المواد'], ['rules', 'bi-bank', 'القواعد الرسمية']];
    const body = st.view === 'board' ? boardView() : st.view === 'fresh' ? freshView() : st.view === 'dict' ? dictView() : st.view === 'rules' ? rulesView() : studentView();
    $('#adv-app').innerHTML = `<div class="adv-tabs">${tabs.map(([k, ic, l]) => `<button type="button" class="${st.view === k ? 'on' : ''}" data-view="${k}"><i class="bi ${ic}"></i> ${l}</button>`).join('')}
      <button type="button" class="btn btn-sm btn-light ms-auto" id="adv-refresh" title="أعد قراءة الجدول الدراسي المنشور الآن"><i class="bi bi-arrow-clockwise"></i> تحديث الشعب</button></div>${body}`;
    const url = new URL(location.href);
    url.searchParams.delete('view'); url.searchParams.delete('q');
    if (st.view !== 'student') url.searchParams.set('view', st.view);
    if (st.view === 'dict' && st.q) url.searchParams.set('q', st.q);
    history.replaceState(null, '', url);
    bind();
  }
  function bind() {
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.view; render(); }));
    $('#adv-refresh').addEventListener('click', async () => { const b = $('#adv-refresh'); b.disabled = true; try { TT = await U.getJSON('data/timetable.json', true); indexData(); SAME = null; U.updatedLine(TT.updated, 'الشعب من الجدول الدراسي المنشور'); } catch (e) { /* keep the copy in hand */ } render(); });
    const drop = $('#adv-drop'), file = $('#adv-file');
    if (drop) {
      ['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', ev => takeFiles([...ev.dataTransfer.files]));
      file.addEventListener('change', () => takeFiles([...file.files]));
    }
    const on = (id, ev, f) => { const el = $(id); if (el) el.addEventListener(ev, f); };
    on('#adv-other', 'click', () => { STUD = null; st.force.clear(); st.drop.clear(); st.cap = null; render(); });
    on('#adv-print', 'click', printForm);
    on('#adv-mode', 'change', e => { st.mode = e.target.value; st.cap = null; render(); });
    on('#adv-summer', 'change', e => { st.summer = e.target.value === '1'; st.cap = null; render(); });
    on('#adv-cap', 'change', e => { st.cap = +e.target.value; render(); });
    on('#adv-reset', 'click', () => { st.force.clear(); st.drop.clear(); render(); });
    on('#adv-copy', 'click', e => { const a = document.querySelector('a[href^="planner.html?plan="]'); if (a && navigator.clipboard) navigator.clipboard.writeText(a.href); e.currentTarget.innerHTML = '<i class="bi bi-check2"></i> نُسخ الرابط'; });
    document.querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => { st.drop.add(b.dataset.drop); st.force.delete(b.dataset.drop); render(); }));
    document.querySelectorAll('[data-undrop]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); st.drop.delete(b.dataset.undrop); render(); }));
    document.querySelectorAll('[data-force]').forEach(b => b.addEventListener('click', () => { st.force.add(b.dataset.force); st.drop.delete(b.dataset.force); render(); }));
    document.querySelectorAll('[data-path]').forEach(b => b.addEventListener('click', () => { st.path = b.dataset.path; render(); }));
    document.querySelectorAll('[data-bf]').forEach(b => b.addEventListener('click', () => { st.boardFilter = b.dataset.bf; render(); }));
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { STUD = BOARD.find(s => s.head.id === b.dataset.open) || STUD; st.view = 'student'; st.force.clear(); st.drop.clear(); st.cap = null; render(); scrollTo(0, 0); }));
    on('#adv-bcsv', 'click', boardCsv);
    on('#adv-clear', 'click', async () => { if (!confirm('حذف كل الخطط المحفوظة على هذا الجهاز؟')) return; await storedClear(); BOARD = []; SAVED = 0; render(); });
    on('#adv-notif', 'click', async () => { try { await Notification.requestPermission(); } catch (e) { /* not supported */ } render(); });
    document.querySelectorAll('.adv-bm').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); U.modal('اسحب الزر، لا تضغطه', '<p>هذا الزر يعمل من شريط المفضلة وهو في صفحة بوابة المدرس. اسحبه بالفأرة (اضغط عليه مطولاً ثم حرّكه) إلى شريط المفضلة أعلى المتصفح، ثم افتح البوابة وسجّل الدخول واضغطه هناك.</p>'); }));
    on('#adv-prog', 'change', e => { st.fresh.prog = e.target.value; render(); });
    document.querySelectorAll('[data-rem]').forEach(b => b.addEventListener('change', () => { st.fresh[b.dataset.rem] = b.checked; render(); }));
    const dq = $('#adv-dq');
    if (dq) { let t; dq.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = dq.value; const pos = dq.selectionStart; render(); const n = $('#adv-dq'); n.focus(); n.setSelectionRange(pos, pos); }, 250); }); }
    on('#adv-eqf', 'change', e => readEq(e.target.files[0]));
    on('#adv-eqt', 'click', () => U.download('مواد_مكافئة_نموذج.csv', '﻿رمز المادة,رمز المادة المكافئة,ملاحظة,المصدر\n606361,606461,مثال: رمز قديم,قرار مجلس القسم\n', 'text/csv'));
    on('#adv-eqx', 'click', () => U.download('مواد_مكافئة.csv', '﻿رمز المادة,رمز المادة المكافئة,ملاحظة,المصدر\n' + EQ.map(e => [e.a, e.b, e.note || '', e.src || ''].map(v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n') + '\n', 'text/csv'));
    on('#adv-eqc', 'click', () => { if (confirm('مسح قائمة المواد المكافئة من هذا الجهاز؟')) { EQ = []; saveEq(); render(); } });
    on('#adv-eqadd', 'submit', e => { e.preventDefault(); const f = new FormData(e.target); addEq([[f.get('a'), f.get('b'), f.get('note'), '']]); render(); });
    document.querySelectorAll('[data-eqdel]').forEach(b => b.addEventListener('click', () => { EQ.splice(+b.dataset.eqdel, 1); saveEq(); render(); }));
  }
  async function takeFiles(files) {
    files = files.filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    const msg = $('#adv-msg');
    if (!files.length) { if (msg) msg.innerHTML = '<div class="alert alert-warning py-2">اختر ملف PDF.</div>'; return; }
    if (msg) msg.innerHTML = '<div class="adv-note"><span class="spinner-border spinner-border-sm"></span> جارٍ قراءة الملف…</div>';
    const bad = [];
    for (const f of files) {
      try {
        const s = await readStudent(f);
        if (!s.ok) { bad.push(f.name); continue; }
        try { await store({ id: String(s.head.id), meta: { name: s.head.name }, pdf: s._buf, parsed: { ...s, _buf: undefined }, pv: PV, importedAt: new Date().toISOString(), src: 'file', warn: mismatches(s) }); } catch (e) { /* storage unavailable */ }
        delete s._buf; s.stored = new Date().toISOString(); SAVED = (await storedAll()).length;
        if (st.view === 'board') addBoard(s); else { STUD = s; st.force.clear(); st.drop.clear(); st.cap = null; st.summer = null; st.mode = 'next'; }
      } catch (e) { bad.push(`${f.name} (${e.message})`); }
    }
    render();
    if (bad.length) { const m = $('#adv-msg'); if (m) m.innerHTML = `<div class="alert alert-warning py-2">لم يُقرأ: ${bad.map(esc).join('، ')} — هل هو ملف «تحليل خطة الطالب» من نظام التسجيل؟</div>`; }
  }
  function boardCsv() {
    const q = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const lines = [['رقم الطالب', 'الاسم', 'التخصص', 'الإصدار', 'المعدل', 'المجتازة', 'المتبقية', 'متوقع تخرجه', 'منذر', 'إجبارية غير مطروحة'].join(',')];
    BOARD.forEach(s => { const a = analyse(s, { assumeCurrent: true }), a0 = analyse(s, { assumeCurrent: false }), lim = limits(a, false);
      lines.push([s.head.id, s.head.name, s.head.major, s.version, s.gpa, s.passedHours, a0.remainingNow, lim.grad ? 'نعم' : '', a.warned ? 'نعم' : '', a.open.filter(c => c.ready && c.required && !offered(c.code).length).map(c => c.code).join(' ')].map(q).join(',')); });
    U.download('لوحة_المرشد.csv', '﻿' + lines.join('\n') + '\n', 'text/csv');
  }
  // equivalents: a CSV or an Excel sheet; the first two columns holding course numbers are the pair
  function addEq(rows) {
    let n = 0;
    rows.forEach(r => {
      const cells = r.map(v => clean(v == null ? '' : String(v)));
      const codes = cells.map((v, i) => [v.replace(/\D/g, ''), i]).filter(([v]) => /^\d{6,7}$/.test(v));
      if (codes.length < 2) return;
      const [a, ia] = codes[0], [b, ib] = codes[1];
      if (a === b || EQ.some(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))) return;
      const rest = cells.filter((_, i) => i !== ia && i !== ib && cells[i]);
      EQ.push({ a, b, note: rest[0] || '', src: rest.slice(1).join(' · ') }); n++;
    });
    saveEq();
    return n;
  }
  async function readEq(file) {
    if (!file) return;
    let rows = [];
    try {
      if (/\.xlsx?$/i.test(file.name)) {
        if (!root.XLSX) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; sc.onload = ok; sc.onerror = () => no(new Error('تعذّر تحميل قارئ Excel')); document.head.appendChild(sc); });
        const wb = root.XLSX.read(await file.arrayBuffer(), { type: 'array' });
        wb.SheetNames.forEach(n => { rows = rows.concat(root.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false })); });
      } else {
        const text = (await file.text()).replace(/^﻿/, '');
        rows = text.split(/\r?\n/).map(l => { const out = []; let cur = '', qd = false; for (const ch of l) { if (ch === '"') qd = !qd; else if ((ch === ',' || ch === ';' || ch === '\t') && !qd) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; });
      }
      const n = addEq(rows);
      render();
      U.modal('قائمة المواد المكافئة', n ? `أُضيف ${n} زوجاً من «${esc(file.name)}».` : 'لم أجد في الملف صفوفاً فيها رمزا مادتين (6 أو 7 أرقام).');
    } catch (e) { U.modal('قائمة المواد المكافئة', 'تعذّرت قراءة الملف: ' + esc(e.message)); }
  }

  // ---------------------------------------------------------------- start
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
  Promise.all([U.getJSON('data/timetable.json'), U.getJSON('data/study_plans.json').catch(() => null), U.getJSON('data/advisory_plans.json').catch(() => null), U.getJSON('data/advisory_manual.json').catch(() => ({})), U.getJSON('data/course_descriptions.json').catch(() => null)])
    .then(([tt, sp, ap, man, desc]) => {
      DESC = desc; TT = tt; SP = sp; AP = ap; MAN = {};
      Object.entries(man || {}).forEach(([k, r]) => { if ((r.years || []).length) MAN[k] = r; });
      if (AP) AP.programs.forEach(p => p.docs.forEach(id => { const d = AP.docs[id]; if (d) d.versions.forEach(v => { if (v.sha) PROG_OF[v.sha] = p.ar; }); }));
      Object.keys(MAN).forEach(k => { const b = k.split('__')[0]; if (PROG_OF[b]) PROG_OF[k] = PROG_OF[b]; });
      U.setDays && U.setDays(tt.days);
      indexData();
      $('#foot-count').textContent = `${S.length} شعبة · ${tt.term}`;
      U.updatedLine(tt.updated, 'الشعب من الجدول الدراسي المنشور، تتحدّث كل ساعة');
      if (IMP.on) { st.view = 'board'; try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* not supported */ } }
      render();
      dataReady();
      loadStored().then(n => { SAVED = n; if (n) render(); });
      const top = $('#pg-q');
      if (top) top.addEventListener('keydown', e => { if (e.key === 'Enter') { st.view = 'dict'; st.q = top.value; render(); } });
    }).catch(e => { $('#adv-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})(typeof window !== 'undefined' ? window : globalThis);
