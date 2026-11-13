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
    // the remaining hours are the registration system's own figure when the PDF prints it (plan hours less passed hours)
    const sumNow = groups.filter(g => COUNTS(g.kind)).reduce((a, g) => a + Math.max(0, g.req - g.gotPassed), 0);
    const sumAfter = groups.filter(g => COUNTS(g.kind)).reduce((a, g) => a + Math.max(0, g.req - g.gotDone), 0);
    const remainingNow = st.remainingHours != null ? st.remainingHours : sumNow;
    const remaining = Math.max(0, remainingNow - (sumNow - sumAfter));
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
      let parts = partsOf(sections, c.code, studyType);
      if (!parts.length && o.alts) for (const x of o.alts(c.code)) { parts = partsOf(sections, x, studyType); if (parts.length) { c.via = x; break; } }
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
      if (!left.length && !take.some(x => x.code !== '—')) {   // only elective hours remain and no listed course is open for them: the group's hours, to choose
        Object.entries(budget).forEach(([gname, v]) => { if (v > 0 && h + v <= cap) { take.push({ code: '—', name: `${v} س يختارها من «${gname}»`, hours: v, el: gname }); h += v; budget[gname] = 0; } });
      }
      if (!take.length) { terms.push({ term: t, summer, take, hours: 0, stuck: true }); break; }
      if (!h && terms.length) { terms[terms.length - 1].take.push(...take); take.forEach(x => { done.add(x.code); const i = left.findIndex(c => c.code === x.code); if (i >= 0) left.splice(i, 1); }); continue; }
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
  const st = { view: P.get('view') || 'board', q: P.get('q') || '', mode: 'next', summer: null, cap: null, force: new Set(), drop: new Set(), fresh: { prog: '', fac: '', name: '', id: '', ar: false, en: false, pc: false } };
  let TT, S = [], SP, AP, MAN = {}, NAMES = {}, OFFER = {}, STUD = null, BOARD = [], EQ = [], DESC = null;
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/';
  const EQ_KEY = 'adv-equivalents-v1';
  try { EQ = JSON.parse(localStorage.getItem(EQ_KEY) || '[]'); } catch (e) { EQ = []; }
  const saveEq = () => { try { localStorage.setItem(EQ_KEY, JSON.stringify(EQ)); } catch (e) { /* storage unavailable */ } };
  const ttTerm = () => termCode(TT && TT.term);
  const nm = c => NAMES[c] || '';
  // names read from old plan files sometimes carry broken letters (\uFFFD): repair each word from the words of the official course names
  let VOCAB = null;
  const fixAr = t => {
    if (!t || !/\uFFFD/.test(t)) return t;
    if (!VOCAB) { VOCAB = new Set(['إجباري', 'اختياري', 'كلية', 'جامعة', 'متطلب', 'متطلبات', 'قسم', 'تخصص', 'حرة', 'مساندة']); Object.values(NAMES).forEach(n => String(n).split(/\s+/).forEach(w => /^[\u0600-\u06ff]{2,}$/.test(w) && VOCAB.add(w))); }
    return t.split(/(\s+)/).map(w => { if (!/\uFFFD/.test(w)) return w;
      const A = x => x.replace(/[أإآ]/g, 'ا');
      const re = new RegExp('^' + A(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\uFFFD+/g, '[\u0600-\u06ff]{1,3}') + '$');
      const hit = [...VOCAB].filter(v => re.test(A(v))); return hit.length === 1 ? hit[0] : hit.length ? hit.sort((a, b) => a.length - b.length)[0] : w.replace(/\uFFFD+/g, '…'); }).join('');
  };
  const cleanName = (code, name) => { const o = /^\d{6,7}$/.test(code || '') ? nm(code) : ''; return (o && !/\uFFFD/.test(o) ? o : '') || fixAr(name || o); };
  const ruleLink = (art, label) => `<a href="${BACH_URL}" target="_blank" rel="noopener" class="adv-rule" title="تعليمات منح درجة البكالوريوس في جامعة البترا (رقم 17 لسنة 2023)"><i class="bi bi-bookmark-check"></i> ${label || 'م ' + art}</a>`;
  const hrsWord = n => n === 1 ? 'ساعة' : n === 2 ? 'ساعتان' : n <= 10 ? `${n} ساعات` : `${n} ساعة`;

  const css = `
  .adv-tabs { display:flex; flex-wrap:wrap; gap:4px; margin:14px 0 14px; border-bottom: 2px solid #e6e1d3; align-items: flex-end; }
  .adv-tabs button { border:0; border-bottom:3px solid transparent; margin-bottom:-2px; background:none; color:#3b4048; padding:9px 14px; font-weight:700; font-size:1rem; }
  .adv-tabs button:hover { color:#901d23; } .adv-tabs button.on { color:#901d23; border-bottom-color:#901d23; }
  .adv-tabs button em { font-style:normal; font-size:.78rem; background:#f3f1ea; color:#3b4048; border-radius:99px; padding:1px 8px; margin-inline-start:4px; } .adv-tabs button.on em { background:#901d23; color:#fff; }
  .adv-tabs .adv-add { margin-inline-start:auto; background:#901d23; color:#fff; border-radius:10px 10px 0 0; } .adv-tabs .adv-add:hover { color:#fff; background:#7a171d; } .adv-tabs .adv-add.on { border-bottom-color:#5b0f14; }
  .adv-tabs .adv-ref { padding:9px 10px; color:#3b4048; }
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
  .adv-t { width:100%; font-size:.93rem; border-collapse:separate; border-spacing:0; color:#111; }
  .adv-t thead th { background:#0b4a66; color:#fff; font-weight:800; padding:9px 10px; text-align:start; white-space:nowrap; }
  .adv-t thead th:first-child { border-start-start-radius:10px; } .adv-t thead th:last-child { border-start-end-radius:10px; }
  .adv-t tbody tr:nth-child(even) > td { background:#fbfaf6; } .adv-t tbody tr:hover > td { background:#eef6fb; }
  .adv-t td { padding:9px 10px; border-bottom:1px solid #e9e4d6; vertical-align:middle; color:#111; }
  .adv-t code, .adv-code { display:inline-block; font-family:ui-monospace,Consolas,monospace; font-weight:800; background:#e8f1f7; color:#0b4a66; border:1px solid #b9d3e4; border-radius:6px; padding:1px 7px; font-size:.86rem; }
  .adv-x td { opacity:.75; }
  .adv-sec { display:flex; flex-direction:column; gap:4px; }
  .adv-sec + .adv-sec { margin-top:6px; padding-top:6px; border-top:1px dashed #ddd5c2; }
  .adv-sec-h { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
  .adv-sn { background:#901d23; color:#fff; font-weight:800; border-radius:6px; padding:1px 9px; font-size:.85rem; } .adv-sn.lab { background:#6d28d9; }
  .adv-mt { display:inline-flex; gap:4px; align-items:center; background:#fff7e6; border:1px solid #f5d38a; color:#5b3d00; border-radius:6px; padding:1px 8px; font-size:.84rem; font-weight:700; white-space:nowrap; }
  .adv-mt.async { background:#f1f5f9; border-color:#cbd5e1; color:#111; }
  .adv-who { font-size:.84rem; color:#111; } .adv-who i { color:#0b4a66; }
  .adv-seat { display:inline-flex; gap:4px; align-items:center; border-radius:99px; padding:1px 9px; font-size:.8rem; font-weight:800; }
  .adv-seat.ok { background:#dcfce7; color:#14532d; border:1px solid #86efac; } .adv-seat.no { background:#fee2e2; color:#7f1d1d; border:1px solid #fca5a5; }
  .adv-hrs { display:inline-block; min-width:26px; text-align:center; background:#0b4a66; color:#fff; font-weight:800; border-radius:6px; padding:1px 6px; }
  .wk-ev b, .wk-ev .wk-l2, .wk-ev span, .wk-ev small { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block; }
  .wk-ev { color:#111 !important; }
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
  .adv-pickst { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }
  .adv-pickst button { display: grid; grid-template-columns: 1fr auto; text-align: start; background: #fff; border: 1px solid #e6e1d3; border-radius: 12px; padding: 10px 12px; color: #1f2328; }
  .adv-pickst button:hover { border-color: #901d23; background: #fbf2f3; } .adv-pickst b { grid-column: 1; } .adv-pickst small { grid-column: 1; color: #3b4048; font-size: .78rem; } .adv-pickst span { grid-column: 2; grid-row: 1 / span 2; align-self: center; font-weight: 800; color: #0b4a66; }
  .dm { color: #111; } .dm-h { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } .dm-h h3 { margin: 0; color: #111; } .dm-h h3 i { color: #901d23; } .dm-h .btn { margin-inline-start: auto; }
  .dm-sub { color: #111; font-size: .92rem; margin: 6px 0 10px; }
  .dm-f { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .dm-chip { border:1px solid #e3ddcf; border-radius:99px; padding:5px 14px; font-weight:600; font-size:.9rem; background:#fff; color:#111; }
  .dm-chip i { color:#901d23; } .dm-chip b { margin-inline-start:4px; font-weight:800; }
  .dm-chip.on { border-color:#901d23; background:#fbf2f3; color:#901d23; }
  .dm-t { width: 100%; border-collapse: separate; border-spacing: 0; font-size: .95rem; color: #111; }
  .dm-t thead th { background: #0b4a66; color: #fff; font-weight: 800; padding: 10px 10px; white-space: nowrap; text-align: start; }
  .dm-t thead th:first-child { border-start-start-radius: 10px; } .dm-t thead th:last-child { border-start-end-radius: 10px; }
  .dm-t td { padding: 9px 10px; border-bottom: 1px solid #e9e4d6; vertical-align: middle; color: #111; }
  .dm-t tbody tr:nth-child(even) td { background: #fbfaf6; } .dm-t tbody tr:hover td { background: #eef6fb; }
  .dm-t tr.no td { background: #fff5f4; } .dm-t tr.no:nth-child(even) td { background: #fdeeec; }
  .dm-t td.n { color: #111; font-weight: 700; width: 36px; } .dm-t td.nm { font-weight: 700; }
  .dm-code { display: inline-block; font-family: ui-monospace, Consolas, monospace; font-weight: 800; background: #e8f1f7; color: #0b4a66; border: 1px solid #b9d3e4; border-radius: 6px; padding: 1px 8px; }
  .dm-bar { position: relative; min-width: 120px; height: 24px; background: #edf3ee; border-radius: 6px; overflow: hidden; } .dm-bar i { position: absolute; inset-block: 0; inset-inline-start: 0; background: linear-gradient(90deg,#86efac,#4ade80); }
  .dm-bar b { position: relative; z-index: 1; padding: 0 8px; line-height: 24px; color: #111; font-weight: 800; }
  .dm-b { display: inline-flex; align-items: center; gap: 4px; border-radius: 99px; padding: 2px 10px; font-weight: 800; font-size: .85rem; }
  .dm-b.g { background: #dcfce7; color: #14532d; border: 1px solid #86efac; } .dm-b.m { background: #fde8e8; color: #7a1414; border: 1px solid #f3b4b4; } .dm-b.el { background: #ede9fe; color: #4c1d95; border: 1px solid #c4b5fd; }
  .dm-z { color: #111; }
  .dm-s { display: inline-flex; align-items: center; gap: 5px; border-radius: 8px; padding: 3px 10px; font-weight: 700; font-size: .85rem; text-decoration: none; white-space: nowrap; }
  .dm-s.open { background: #dcfce7; color: #14532d; border: 1px solid #86efac; } .dm-s.closed { background: #ffedd5; color: #7c2d12; border: 1px solid #fdba74; } .dm-s.no { background: #fee2e2; color: #7f1d1d; border: 1px solid #fca5a5; }
  .dm-s small { font-weight: 600; } .dm-empty { text-align: center; padding: 16px; }

  /* official table style: white everywhere, black text, thin grey lines; colour only as text in the status column */
  .adv-t thead th, .dm-t thead th { background:#fff !important; color:#111 !important; font-weight:800; border-bottom:2px solid #1f2328; border-radius:0 !important; padding:11px 10px; }
  .adv-t thead th i, .dm-t thead th i { color:#111 !important; }
  .adv-t tbody tr > td, .dm-t tbody tr > td, .dm-t tr.no td, .adv-t tbody tr:nth-child(even) > td, .dm-t tbody tr:nth-child(even) td { background:#fff !important; border-bottom:1px solid #e5e5e5; padding:12px 10px; color:#111; }
  .adv-t tbody tr:hover > td, .dm-t tbody tr:hover td { background:#fafafa !important; }
  .adv-row.open td, .adv-row.sel td, .adv-det td { background:#fafafa !important; }
  .adv-t code, .adv-code, .dm-code { background:none !important; border:0 !important; color:#111 !important; padding:0 !important; font-weight:700; }
  .adv-hrs { background:none !important; color:#111 !important; padding:0 !important; font-weight:700; min-width:0 !important; }
  .dm-bar { background:none !important; min-width:0 !important; height:auto !important; overflow:visible !important; } .dm-bar i { display:none !important; } .dm-bar b { padding:0 !important; line-height:inherit !important; font-weight:700; }
  .adv-t .adv-chip, .dm-b, .dm-s, .adv-seat { background:none !important; border:0 !important; padding:0 !important; margin:0 !important; border-radius:0 !important; font-size:.88rem !important; font-weight:600 !important; color:#111 !important; }
  .dm-b i, .dm-s i, .adv-seat i { display:none; }
  .adv-t .adv-chip + .adv-chip::before { content:'، '; color:#111; }
  .adv-t .adv-chip.retake, .adv-t .adv-chip.closed, .dm-s.no, .adv-seat.no { color:#b42318 !important; }
  .adv-t .adv-chip.unlock, .dm-s.open, .adv-seat.ok { color:#15803d !important; }
  .dm-s.closed { color:#b45309 !important; }
  .adv-pct { background:#e5e5e5 !important; height:5px !important; } .adv-pct i { background:#1f2328 !important; }
  .adv-sn { background:none !important; color:#111 !important; padding:0 !important; }
  .adv-mt { background:none !important; border:0 !important; padding:0 !important; color:#111 !important; font-weight:600; }
  .adv-t thead th.adv-sort, .adv-t thead th.adv-sort.on { color:#111 !important; } .adv-sort-i { font-size:.7rem; color:#111; margin-inline-start:4px; }
  .adv-t thead th input { accent-color:#901d23; }
  .adv-card h3 { color:#111 !important; }
  .adv-fv { display:flex; gap:0; border-bottom:1px solid #d9d9d9; margin:6px 0 10px; flex-wrap:wrap; }
  .adv-fv button { background:none; border:0; border-bottom:2px solid transparent; margin-bottom:-1px; padding:8px 14px; font-weight:700; color:#3b4048; }
  .adv-fv button.on { color:#111; border-bottom-color:#901d23; } .adv-fv button i { margin-inline-end:4px; }
  .adv-dayc { vertical-align:top !important; border-inline-end:1px solid #e5e5e5; }
  .adv-cc { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
  .adv-cci { border:1px solid #e0e0e0; border-radius:10px; padding:12px 14px; background:#fff; color:#111; }
  .adv-cci-h { display:flex; justify-content:space-between; font-weight:700; } .adv-cci-n { display:block; font-size:1.02rem; margin:4px 0 6px; }
  .adv-cci dl { display:grid; grid-template-columns:auto 1fr; gap:3px 10px; margin:6px 0 0; padding-top:6px; border-top:1px solid #eee; font-size:.9rem; } .adv-cci dt { color:#3b4048; font-weight:600; } .adv-cci dd { margin:0; }
  #adv-app .wk-head b { font-size:1rem; color:#111; } #adv-app .wk-hours span { font-size:.85rem; color:#111; }
  #adv-app .wk-ev { font-size:.95rem; line-height:1.45; padding:6px 10px; color:#111; }
  #adv-app .wk-ev b { font-size:1.02rem; font-weight:800; } #adv-app .wk-ev span { white-space:normal; font-weight:700; font-size:.92rem; line-height:1.3; }
  #adv-app .wk-ev small { font-size:.88rem; opacity:1; font-weight:700; direction:ltr; text-align:right; }
  /* no bold inside tables, cards or the week grid */
  .adv-t tbody, .adv-t tbody *, .dm-t tbody, .dm-t tbody *, #adv-app .wk-ev, #adv-app .wk-ev *, .adv-cc, .adv-cc * { font-weight:400 !important; }
  .adv-t thead th, .dm-t thead th { font-weight:600 !important; }
  /* colour: soft badges and coloured icons (rows stay white) */
  .fb { display:inline-flex; align-items:center; gap:4px; border-radius:99px; padding:2px 10px; font-size:.85rem; border:1px solid; white-space:nowrap; line-height:1.5; }
  .fb.code { font-family:ui-monospace,Consolas,monospace; background:#e8f1f7; color:#0b4a66; border-color:#b9d3e4; border-radius:6px; }
  .fb.sec { background:#f3e8ff; color:#5b21b6; border-color:#d8b4fe; } .fb.hrs { background:#fff7e6; color:#7c4a03; border-color:#f5d38a; }
  .fb.ok { background:#dcfce7; color:#14532d; border-color:#86efac; } .fb.no { background:#fee2e2; color:#7f1d1d; border-color:#fca5a5; }
  .fb.day { background:#fbf2f3; color:#901d23; border-color:#ecc7ca; } .fb.lab { background:#ede9fe; color:#4c1d95; border-color:#c4b5fd; }
  .ic-b { color:#0b4a66; } .ic-o { color:#d97706; } .ic-p { color:#7c3aed; } .ic-g { color:#15803d; } .ic-r { color:#901d23; } .ic-t { color:#0f766e; }
  .adv-fv button i { font-size:1.05rem; } .adv-fv button:nth-child(1) i { color:#0b4a66; } .adv-fv button:nth-child(2) i { color:#d97706; } .adv-fv button:nth-child(3) i { color:#0f766e; } .adv-fv button:nth-child(4) i { color:#7c3aed; }
  .adv-cci { border-top:4px solid var(--cc, #901d23); }
  .adv-cci dt i { margin-inline-end:4px; }
  .adv-kpis { grid-template-columns:repeat(auto-fill,minmax(165px,1fr)) !important; }
  .adv-kpi span { font-size:.95rem !important; color:#111 !important; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .adv-kpi b { font-size:1.6rem !important; }
  .adv-t td small, .adv-t td .adv-src, .adv-t td .text-muted, .adv-t td .text-secondary, .adv-t td .small, .adv-tools, .adv-tools small, .adv-cci dt, .adv-dayc .adv-src { color:#111 !important; opacity:1 !important; }
  /* student details panel */
  .adv-det > td { padding:14px 12px 16px !important; background:#f7f5f0 !important; }
  .dt { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
  @media (max-width: 1100px) { .dt { grid-template-columns:1fr; } }
  .dt-c { background:#fff; border:1px solid #e3ddcf; border-radius:12px; padding:12px 14px; }
  .dt-c h4 { display:flex; align-items:center; gap:8px; font-size:1rem !important; font-weight:700 !important; color:#111; margin:0 0 10px !important; padding-bottom:8px; border-bottom:1px solid #eee; }
  .dt-c h4 .fb { font-weight:400 !important; }
  .dt-g { display:grid; grid-template-columns:minmax(0,1fr) 90px 48px; gap:10px; align-items:center; padding:4px 0; font-size:.92rem; color:#111; }
  .dt-gn { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .dt-gv { text-align:end; font-variant-numeric:tabular-nums; } .dt-gv small { color:#111 !important; }
  .dt-bar { height:8px; background:#eee9dc; border-radius:99px; overflow:hidden; } .dt-bar i { display:block; height:100%; border-radius:99px; }
  .dt-bar i.ok { background:#16a34a; } .dt-bar i.mid { background:#f59e0b; } .dt-bar i.low { background:#dc2626; }
  .dt-i { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:8px; align-items:center; padding:5px 0; border-bottom:1px dashed #eee; font-size:.92rem; color:#111; }
  .dt-in { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dt-e { color:#111; font-size:.9rem; padding:4px 0; }
  .dt-al { margin-top:10px; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; padding:8px 10px; color:#7f1d1d; font-size:.9rem; display:grid; gap:4px; }
  .dt-al b { font-weight:700 !important; }
  .dt-tl { list-style:none; margin:0; padding:0 18px 0 0; position:relative; } .dt-tl::before { content:''; position:absolute; inset-block:6px; right:5px; width:2px; background:#d9d3c3; }
  .dt-tl li { position:relative; display:flex; justify-content:space-between; align-items:center; padding:5px 0; font-size:.92rem; color:#111; }
  .dt-tl li::before { content:''; position:absolute; right:-17px; width:10px; height:10px; border-radius:50%; background:#fff; border:2px solid #0f766e; }
  .dt-tl li.end::before { background:#16a34a; border-color:#16a34a; } .dt-tl li.end span:first-child { color:#15803d; }
  .dt-act { grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .dt-src { margin-inline-start:auto; font-size:.88rem; color:#111; }
  .adv-dash th, .adv-dash td, .adv-dash td * { white-space:nowrap; } .adv-dash .adv-det td, .adv-dash .adv-det td * { white-space:normal; } .adv-dash .adv-det .dt-gn, .adv-dash .adv-det .dt-in, .adv-dash .adv-det .fb { white-space:nowrap; }
  .fb.reg { background:#e8f1f7; color:#0b4a66; border-color:#b9d3e4; border-radius:6px; }
  .adv-dayc { white-space:nowrap; } .bd-nm { white-space:nowrap; } .bd-nm b { color:#111; } .bd-id { font-family:ui-monospace,Consolas,monospace; }
  .bd-st { white-space:nowrap; } .bd-st .fb + .fb { margin-inline-start:4px; }
  .bd-gpa { display:inline-block; min-width:48px; text-align:center; border-radius:6px; padding:1px 8px; border:1px solid; font-variant-numeric:tabular-nums; }
  .bd-gpa.g { background:#dcfce7; color:#14532d; border-color:#86efac; } .bd-gpa.b { background:#e8f1f7; color:#0b4a66; border-color:#b9d3e4; }
  .bd-gpa.y { background:#fff7e6; color:#7c4a03; border-color:#f5d38a; } .bd-gpa.r { background:#fee2e2; color:#7f1d1d; border-color:#fca5a5; }
  .adv-pct.bd-p { height:8px !important; width:80px; background:#eee9dc !important; } .adv-pct.bd-p i.g { background:#16a34a !important; } .adv-pct.bd-p i.b { background:#0b4a66 !important; } .adv-pct.bd-p i.y { background:#f59e0b !important; }
  .adv-sl { padding:3px 0; white-space:nowrap; } .adv-sl + .adv-sl { border-top:1px dashed #e5e5e5; } .adv-sl small { color:#3b4048; }
  .adv-cb { width: 34px; text-align: center; } .adv-cb input { width: 17px; height: 17px; accent-color: #901d23; cursor: pointer; }
  .adv-row.sel td { background: #fbf2f3; }
  .adv-bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; background: #fbf2f3; border-bottom: 1px solid #ecd4d6; }
  .adv-toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 2000; background: #1f2328; color: #fff; border-radius: 12px; padding: 10px 14px; display: flex; gap: 12px; align-items: center; box-shadow: 0 10px 30px rgba(0,0,0,.3); max-width: calc(100vw - 32px); }
  .adv-toast button { background: #fff; color: #901d23; border: 0; border-radius: 8px; padding: 4px 12px; font-weight: 700; } .adv-toast i { cursor: pointer; opacity: .7; }
  .adv-mine { display: flex; align-items: flex-end; gap: 24px; border-bottom: 2px solid #e6e1d3; margin: 6px 0 14px; flex-wrap: wrap; }
  .adv-mine h2 { font-size: 1.7rem; font-weight: 800; margin: 0 0 6px; color: #1f2328; }
  .adv-mine nav { display: flex; gap: 4px; flex: 1; flex-wrap: wrap; } .adv-mine nav button { background: none; border: 0; padding: 10px 14px; font-weight: 700; font-size: 1.02rem; color: #3b4048; border-bottom: 3px solid transparent; margin-bottom: -2px; }
  .adv-mine nav button.on { color: #901d23; border-bottom-color: #901d23; } .adv-mine nav button.add { margin-inline-start: auto; color: #901d23; }
  .adv-panel { background: #fff; border: 1px solid #e6e1d3; border-radius: 16px; padding: 18px 20px; }
  .adv-step { display: flex; align-items: center; gap: 10px; font-size: 1.12rem; font-weight: 800; margin: 0 0 14px; color: #1f2328; } .adv-step > span { width: 30px; height: 30px; border-radius: 50%; background: #1f2328; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: .95rem; }
  .adv-step small { font-weight: 500; margin-inline-start: 6px; }
  .adv-ways { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
  .adv-way { display: flex; align-items: center; gap: 12px; text-align: start; background: #fff; border: 2px solid #e6e1d3; border-radius: 14px; padding: 14px 16px; color: #1f2328; transition: border-color .15s, background .15s; }
  .adv-way:hover { border-color: #c9a9ad; } .adv-way.on { border-color: #901d23; background: #fbf2f3; }
  .adv-way-i { width: 46px; height: 46px; border-radius: 12px; background: #f3f1ea; display: inline-flex; align-items: center; justify-content: center; font-size: 1.3rem; color: #3b4048; flex: none; }
  .adv-way.on .adv-way-i { background: #901d23; color: #fff; }
  .adv-way-t { flex: 1; } .adv-way-t b { display: block; font-size: 1.05rem; } .adv-way-t small { color: #3b4048; } .adv-way-t em { font-style: normal; font-size: .75rem; background: #15803d; color: #fff; border-radius: 99px; padding: 1px 8px; margin-inline-start: 4px; vertical-align: middle; }
  .adv-radio { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #b9b3a3; flex: none; } .adv-way.on .adv-radio { border: 7px solid #901d23; }
  .adv-hr { border: 0; border-top: 1px dashed #e0d9c8; margin: 18px 0; }
  .adv-steps2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
  .adv-steps2 > div { border: 1px solid #e6e1d3; border-radius: 14px; padding: 14px; background: #fffdf8; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .adv-steps2 > div > span { width: 28px; height: 28px; border-radius: 50%; background: #901d23; color: #fff; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
  .adv-steps2 b { font-size: 1rem; } .adv-steps2 p { margin: 0; font-size: .9rem; color: #2b3036; } .adv-steps2 small { color: #3b4048; font-size: .78rem; }
  .adv-live { border: 2px solid #0f766e; border-radius: 14px; padding: 12px 14px; margin-bottom: 14px; background: #f6fbfa; }
  .adv-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px 16px; } .adv-form label > span { display: block; font-weight: 700; margin-bottom: 6px; font-size: .95rem; }
  .adv-form .form-control, .adv-form .form-select { border-radius: 10px; padding: .6rem .8rem; }
  .adv-pick-g { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; } .adv-pick-g fieldset { border: 1px solid #e6e1d3; border-radius: 12px; padding: 8px 12px; }
  .adv-pick-g legend { font-size: .95rem; font-weight: 800; float: none; width: auto; padding: 0 6px; margin: 0; } .adv-pick-g .adv-pick { display: block; padding: 3px 0; font-size: .88rem; } .adv-pick-g code { color: #1f2328; font-weight: 700; }
  .adv-hero { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between; background: #fff; border: 1px solid #e3ddcf; border-inline-start: 5px solid #901d23; border-radius: 12px; padding: 14px 18px; margin-bottom: 12px; }
  .adv-hero h2 { font-size: 1.3rem; font-weight: 800; margin: 0 0 4px; color: #1f2328; } .adv-hero p { margin: 0; color: #3b4048; font-size: .92rem; }
  .adv-hero-k { text-align: center; min-width: 140px; } .adv-hero-k b { display: block; font-size: 2rem; font-weight: 800; color: #901d23; line-height: 1; } .adv-hero-k span { font-size: .85rem; } .adv-hero-k small { display: block; color: #3b4048; font-size: .75rem; }
  .adv-opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; margin-bottom: 12px; }
  .adv-opt { background: #fff; border: 1px solid #e3ddcf; border-radius: 14px; padding: 16px 18px; } .adv-opt.rec { border: 2px solid #0f766e; box-shadow: 0 6px 18px rgba(15,118,110,.08); }
  .adv-opt-h { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; } .adv-opt-h > i { font-size: 1.8rem; color: #0f766e; } .adv-opt:not(.rec) .adv-opt-h > i { color: #901d23; }
  .adv-opt-h b { display: block; font-size: 1.1rem; } .adv-opt-h small { color: #3b4048; }
  .adv-live { border: 2px solid #0f766e; } .adv-live h3 { font-size: 1.05rem; }
  .adv-pbar.big { height: 16px; margin: 10px 0; } .adv-live-n { display: flex; gap: 16px; flex-wrap: wrap; font-size: .92rem; } .adv-live-n b { font-size: 1.15rem; color: #15803d; } .adv-live-n .r b { color: #b42318; } .adv-live-n .w b { color: #92400e; }
  .adv-empty { text-align: center; background: #fff; border: 2px dashed #d9d3c3; border-radius: 14px; padding: 40px 16px; } .adv-empty > i { font-size: 3rem; color: #901d23; } .adv-empty h3 { font-weight: 800; margin: 8px 0; }
  .adv-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-bottom: 12px; }
  .adv-kpi { background: #fff; border: 1px solid #e3ddcf; border-radius: 12px; padding: 10px 12px; text-align: start; display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: center; color: #1f2328; }
  .adv-kpi i { grid-row: span 2; font-size: 1.4rem; color: #0b4a66; } .adv-kpi b { font-size: 1.5rem; font-weight: 800; line-height: 1; } .adv-kpi span { font-size: .78rem; color: #3b4048; }
  .adv-kpi.on { border: 2px solid #901d23; background: #fff8f6; } .adv-kpi.g i { color: #15803d; } .adv-kpi.r i { color: #b42318; } .adv-kpi.y i { color: #b45309; } .adv-kpi.static { cursor: default; }
  .adv-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 12px; border-bottom: 1px solid #eee9dc; } .adv-tools input { max-width: 280px; } .adv-tools select { max-width: 260px; }
  .adv-dash td { vertical-align: middle; } .adv-row { cursor: pointer; } .adv-row:hover td { background: #fbf8f1; } .adv-row.open td { background: #f7efe0; }
  .adv-sort { cursor: pointer; user-select: none; } .adv-sort.on { color: #901d23; }
  .adv-pct { width: 70px; height: 7px; background: #eee9dc; border-radius: 99px; overflow: hidden; display: inline-block; vertical-align: middle; margin-inline-end: 4px; } .adv-pct i { display: block; height: 100%; background: #0f766e; }
  .adv-det td { background: #fffdf8; } .adv-det-g { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; padding: 6px 4px; } .adv-det h4 { font-size: .88rem; font-weight: 800; margin: 0 0 6px; }
  .adv-mini { display: grid; grid-template-columns: 1fr 80px auto; gap: 6px; align-items: center; font-size: .78rem; margin-bottom: 3px; } .adv-mini i { height: 6px; background: #eee9dc; border-radius: 99px; overflow: hidden; } .adv-mini i b { display: block; height: 100%; background: #0f766e; } .adv-mini em { font-style: normal; color: #3b4048; }
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
    Object.values(READS()).forEach(r => (r.years || []).forEach(y => y.terms.forEach(t => t.courses.forEach(c => { if (/^\d{6,7}$/.test(c.code) && /[\u0600-\u06ff]{3}/.test(c.name || '')) NAMES[c.code] ||= clean(c.name).replace(/\s*\(متطلب.*$|\s+\d$/, ''); }))));
  }
  const offered = code => (OFFER[code] || []);
  // the same course under another number: an uploaded equivalent, or the same name in the published plans (a renumbered course)
  const altCodes = code => [...new Set([...eqOf(code).map(x => x.code), ...((sameName()[code] || []).map(x => x.code))])];
  const offeredAs = code => offered(code).length ? code : altCodes(code).find(x => offered(x).length) || '';
    const DAYN = d => (TT && TT.days || {})[d] || d;
  const secCell = x => `<div class="adv-sec"><div class="adv-sec-h"><span class="adv-sn ${x.activity === 'عملي' ? 'lab' : ''}">ش ${esc(x.section)}${x.activity === 'عملي' ? ' · عملي' : ''}</span>
      ${x.meetings.map(m => live(m) ? `<span class="adv-mt"><i class="bi bi-clock"></i> ${esc(DAYN(m.day))} من ${m.start} إلى ${m.end}</span>` : `<span class="adv-mt async"><i class="bi bi-laptop"></i> ${esc(DAYN(m.day))} غير متزامن</span>`).join('')}</div>
      <div class="adv-who"><i class="bi bi-person-fill"></i> ${esc(U.shortName(x.instructor || '—'))} &nbsp; <i class="bi bi-door-open-fill"></i> ${esc(x.room && x.room !== '0' ? x.room : 'افتراضية')} &nbsp;
        ${isOpen(x) ? `<span class="adv-seat ok"><i class="bi bi-check-circle-fill"></i> ${seats(x)} مقعد شاغر</span>` : '<span class="adv-seat no"><i class="bi bi-x-circle-fill"></i> مغلقة/ممتلئة</span>'}</div></div>`;
  // a section split into readable columns: section | days and times | instructor | room | seats (one line per section inside each cell)
  const SEC_TH = '<th>الشعبة</th><th>الأيام والوقت</th><th>المدرس</th><th>القاعة</th><th>المقاعد</th>';
  const secTds = mine => {
    const col = f => `<td>${mine.map(x => `<div class="adv-sl">${f(x)}</div>`).join('')}</td>`;
    return col(x => `<span class="fb ${x.activity === 'عملي' ? 'lab' : 'sec'}">ش ${esc(x.section)}${x.activity === 'عملي' ? ' · عملي' : ''}</span>`)
      + col(x => { const g = {}; x.meetings.forEach(m => { const k = live(m) ? `<bdi dir="ltr">${m.start} – ${m.end}</bdi>` : 'غير متزامن'; (g[k] ||= []).push(DAYN(m.day)); });
          return Object.entries(g).map(([k, d]) => `<div><i class="bi ${k === 'غير متزامن' ? 'bi-laptop ic-t' : 'bi-clock ic-o'}"></i> ${esc(d.join(' و'))} ${k}</div>`).join(''); })
      + col(x => `<i class="bi bi-person-fill ic-b"></i> ${esc(U.shortName(x.instructor || '—'))}`)
      + col(x => `<i class="bi bi-door-open-fill ic-p"></i> ${esc(x.room && x.room !== '0' ? x.room : 'افتراضية')}`)
      + col(x => isOpen(x) ? `<span class="fb ok"><i class="bi bi-check-circle-fill"></i> ${seats(x)} شاغر</span>` : '<span class="fb no"><i class="bi bi-x-circle-fill"></i> مغلقة</span>');
  };
  const sectionsLine = code => { const L = offered(code); if (!L.length) { const x = offeredAs(code); return x ? `<a class="adv-chip unlock" href="timetable.html?q=${x}" target="_blank" rel="noopener" title="الاسم نفسه برمز آخر في الجدول الدراسي">مطروحة برمز ${x}</a>` : '<span class="adv-chip off">غير مطروحة</span>'; }
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
    // each course number's own name is the one most sources give it (the timetable and the study plans weigh most); numbers
    // that share that name are the same course under another number. A slip in one guidance plan (a wrong name beside a
    // number) does not tie unrelated courses, and only numbers of the same department (same first three digits) are tied:
    // «تدريب ميداني» or «مشروع تخرج» of two departments are different courses.
    const votes = {}, where = {};
    const add = (code, name, w, weight) => { if (!/^\d{6,7}$/.test(code) || !name) return; const k = norm(clean(name)).replace(/[()\s]|\d$/g, ''); if (k.length < 4) return;
      const v = votes[code] ||= {}; v[k] = (v[k] || 0) + weight; ((where[code] ||= {})[k] ||= { name: clean(name), where: new Set() }).where.add(w); };
    (SP ? SP.plans : []).forEach(p => p.groups.forEach(g => g.courses.forEach(c => add(c.code, c.name, `${p.major} (خطة ${p.version})`, 5))));
    Object.entries(READS()).forEach(([sha, r]) => (r.years || []).forEach(y => y.terms.forEach(t => t.courses.forEach(c => add(c.code, c.name, (PROG_OF[sha] || 'خطة استرشادية') + (r.academic_year ? ' ' + r.academic_year : ''), 1)))));
    S.forEach(s2 => add(s2.code, s2.name.replace(/\s*-\s*(نظري|عملي)$/, ''), 'الجدول الدراسي', 5));
    const by = {};
    Object.entries(votes).forEach(([code, v]) => { const k = Object.entries(v).sort((a, b) => b[1] - a[1])[0][0] + '|' + code.slice(0, 3); (by[k] ||= []).push({ code, name: where[code][k.split('|')[0]].name, where: where[code][k.split('|')[0]].where }); });
    SAME = {};
    Object.values(by).forEach(L => { if (L.length > 1) L.forEach(x => { SAME[x.code] = L.filter(y => y.code !== x.code); }); });
    return SAME;
  }
  let PROG_OF = {};
  const READS = () => Object.assign({}, (AP && AP.reads) || {}, MAN);

  // ---------------------------------------------------------------- view: one student
  function studentView() {
    if (!STUD) {   // choose one of the saved students
      if (!BOARD.length) return `<div class="adv-empty"><i class="bi bi-person-vcard"></i><h3>اختر طالباً لتحليل خطته</h3><p>لا طلبة محفوظين بعد. أضف طلبتك أولاً (من البوابة، أو بملف «تحليل خطة الطالب»، أو يدوياً)، ثم اختر أحدهم هنا.</p><button type="button" class="btn btn-maroon" data-view="import"><i class="bi bi-plus-lg"></i> إضافة طلاب</button></div>`;
      const q = norm(st.pq || '');
      const L = BOARD.filter(x => !q || norm(x.head.name + ' ' + x.head.id + ' ' + (x.head.major || '')).includes(q));
      return `<div class="adv-panel"><h3 class="adv-step"><span><i class="bi bi-search"></i></span> اختر طالباً لتحليل خطته</h3>
        <p class="adv-src">التحليل: موقع الطالب في كل مجموعة، المواد التي يحق له تسجيلها بأولويتها، جدول مقترح بلا تعارض ضمن الحد الأعلى للساعات، مسارات التخرج، ونموذج إرشاد للطباعة.</p>
        <input type="search" class="form-control mb-3" id="adv-pq" placeholder="ابحث باسم الطالب أو رقمه أو تخصصه…" value="${esc(st.pq || '')}" style="max-width:420px">
        <div class="adv-pickst">${L.slice(0, 120).map(x => `<button type="button" data-open="${esc(x.head.id)}"><b>${esc(x.head.name || '')}</b><small>${esc(x.head.id)} · ${esc(x.head.major || '')}</small><span>${x.gpa != null ? x.gpa.toFixed(2) : '—'}</span></button>`).join('') || '<p class="adv-src">لا نتائج.</p>'}</div></div>`;
    }
    const s = STUD, h = s.head;
    const pdfTerm = s.term, tt = ttTerm();
    const later = tt > pdfTerm;
    const assume = st.mode === 'next';
    const a = analyse(s, { assumeCurrent: assume });
    const summer = st.summer != null ? st.summer : (later ? tt % 10 === 3 : nextTerm(pdfTerm) % 10 === 3 && false);
    const lim = limits(a, summer);
    const cap = st.cap || lim.max;
    const sug = suggest(a, S, { max: cap, force: st.force, drop: st.drop, alts: altCodes });
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
    sug.take.forEach((t, i) => { colour[t.c.via || t.c.code] = U.PALETTE[i % U.PALETTE.length]; });
    const grid = sel.length ? U.weekGrid(sel.flatMap(x => x.meetings.map(m => ({ day: m.day, start: live(m) ? m.start : '', end: m.end, title: x.code, line: nm(x.code), sub: `ش ${x.section}${x.activity === 'عملي' ? ' عملي' : ''}`,
      style: `background:${colour[x.code][1]};border-inline-start-color:${colour[x.code][0]}`, cls: isOpen(x) ? '' : 'clash' }))), { compact: true, px: 135 }) : '';
    const secRows = sug.take.map(t => {
      const mine = sel.filter(x => x.code === (t.c.via || t.c.code));
      return `<tr><td><code>${t.c.code}</code>${t.c.via ? `<div class="adv-src">تُسجَّل برمز <code>${t.c.via}</code></div>` : ''}</td><td>${esc(t.c.name || nm(t.c.code))}<div>${t.c.why.map(([k, l]) => `<span class="adv-chip ${k}">${esc(l)}</span>`).join('')}</div></td><td><span class="adv-hrs">${t.c.hours}</span></td>
        ${secTds(mine)}
        <td class="no-print"><button type="button" class="btn btn-sm btn-light" data-drop="${t.c.code}" title="أخرجها من المقترح"><i class="bi bi-x-lg"></i></button></td></tr>`;
    }).join('');
    const notOff = a.open.filter(c => c.ready && !offeredAs(c.code));
    const altFor = c => {
      const same = (sameName()[c.code] || []).filter(x => offered(x.code).length);
      const eq = eqOf(c.code).filter(x => offered(x.code).length);
      const el = c.g.fixed ? a.groups.filter(g => !g.fixed && g.kind === 'elective' && g.needHours >= 0).flatMap(g => g.courses).filter(x => !a.done.has(x.code) && offered(x.code).length && (x.hours || 0) === (c.hours || 0) && x.prereq.every(p => a.done.has(p))) : [];
      return { same, eq, el };
    };
    const lawWarn = a.warned ? `<div class="alert alert-danger py-2 mb-2"><b><i class="bi bi-exclamation-octagon-fill"></i> المعدل التراكمي ${s.gpa.toFixed(2)} أقل من 2.00:</b> الطالب على قائمة الإنذار ${ruleLink('12', 'م 12/أ')} — عليه رفع معدله إلى 2.00 خلال فصلين اعتياديين ${ruleLink('12', 'م 12/ب')}${(s.passedHours || 0) >= 99 ? '، ولا يُفصل لأنه أتمّ 99 ساعة بنجاح (م 12/ج)' : ''}. الأولوية في المقترح لإعادة المواد الإجبارية التي رسب فيها، فتُحسب له أعلى علامة ${ruleLink('11', 'م 11/ب')}.</div>`
      : s.gpa != null && s.gpa < 2.2 ? `<div class="alert alert-warning py-2 mb-2"><b><i class="bi bi-exclamation-triangle-fill"></i> المعدل التراكمي ${s.gpa.toFixed(2)} قريب من حد الإنذار (2.00)</b> ${ruleLink('12', 'م 12/أ')}: يحسن تخفيف العبء وإعادة المواد ذات العلامات المتدنية.</div>` : '';
    return `<div class="adv-card"><h3><i class="bi bi-person-vcard"></i> ${esc(h.name || '')} <span class="badge text-bg-light border">${esc(h.id || '')}</span>
        <span class="ms-auto d-flex gap-2 no-print">${BOARD.length ? '<button type="button" class="btn btn-sm btn-light border" id="adv-back"><i class="bi bi-arrow-right"></i> الطلاب</button>' : ''}<button type="button" class="btn btn-sm btn-outline-secondary" id="adv-other"><i class="bi bi-people"></i> اختر طالباً آخر</button>
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
        ${sug.take.length ? `<div class="table-responsive"><table class="adv-t"><thead><tr><th>الرمز</th><th>المادة ولماذا</th><th>س</th>${SEC_TH}<th class="no-print"></th></tr></thead><tbody>${secRows}</tbody></table></div>
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
    a.groups.forEach(g => { if (g.printedPassed != null && COUNTS(g.kind)) checks.push([g.name, g.gotPassed, g.printedPassed]); });
    const bad = checks.filter(c => c[1] !== c[2]);
    return bad.length ? `<div class="adv-check no"><i class="bi bi-exclamation-triangle"></i> اختلاف عن أرقام الكشف: ${bad.map(b => `${esc(b[0])}: الصفحة ${b[1]}، الكشف ${b[2]}`).join(' · ')} — المعتمد ما في الكشف.</div>`
      : `<div class="adv-check ok"><i class="bi bi-check2-all"></i> مطابق لكشف الجامعة: الساعات المجتازة في كل مجموعة (${checks.length} رقماً) كما هي مطبوعة في الكشف، والساعات المتبقية منقولة من الكشف.</div>`;
  }

  // ---------------------------------------------------------------- the advising form for printing
  function printForm() {
    const s = STUD, h = s.head, a = analyse(s, { assumeCurrent: st.mode === 'next' }), a0 = analyse(s, { assumeCurrent: false });
    const summer = st.summer != null ? st.summer : (ttTerm() > s.term ? ttTerm() % 10 === 3 : false);
    const lim = limits(a, summer), cap = st.cap || lim.max;
    const sug = suggest(a, S, { max: cap, force: st.force, drop: st.drop, alts: altCodes });
    const sel = sug.best.combo;
    const link = new URL('planner.html?plan=' + sel.map(x => encodeURIComponent(U.sectionKey(x))).join('~'), location.href).href;
    const waiting = a.open.filter(c => !c.ready && !c.inProgress);
    let path = null; try { path = paths(s, { load: 18, summer: false }); } catch (e) { /* none */ }
    const when = x => x.meetings.filter(live).map(m => `${(TT.days || {})[m.day] || m.day} ${m.start}–${m.end}`).join('، ') || 'غير متزامن';
    printReport({ title: 'نموذج الإرشاد الأكاديمي', subtitle: `${h.name || ''} · ${h.id || ''}`, orientation: 'portrait', fit: false, url: link, qrLabel: 'الجدول المقترح للطالب',
      filters: [['الكلية', h.faculty || ''], ['التخصص', `${h.major || ''} (إصدار ${s.version})`], ['المستوى', s.level || '—'], ['المرشد', h.advisor || '—'], ['الفصل', TT.term]],
      stats: [['المعدل التراكمي', s.gpa != null ? s.gpa.toFixed(2) + (a.warned ? ' (منذر)' : '') : '—'], ['الساعات المجتازة', s.passedHours ?? '—'], ['المتبقية', `${a0.remainingNow} من ${s.planHours ?? '—'}`],
        ['ساعات الجدول المقترح', `${sug.hours} (الحد ${lim.max})`], ['التخرج المتوقع', path && path.end ? termName(path.end) : '—']],
      sections: [
        { title: `الجدول المقترح (${sug.hours} ساعة؛ الحد الأعلى ${lim.max} وفق المادة ${lim.rule} من تعليمات منح درجة البكالوريوس 2023)`, columns: ['الرمز', 'المادة', 'س', 'الشعبة والموعد', 'سبب الأولوية'], widths: ['10%', '27%', '5%', '33%', '25%'],
          rows: sug.take.map(t => { const mine = sel.filter(x => x.code === (t.c.via || t.c.code)); return [t.c.code + (t.c.via ? ` (برمز ${t.c.via})` : ''), t.c.name || nm(t.c.code), t.c.hours, mine.map(x => `ش ${x.section}${x.activity === 'عملي' ? ' (عملي)' : ''}: ${when(x)}`).join(' | '), t.c.why.map(w => w[1]).join('، ')]; }) },
        ...(sug.skipped.length ? [{ title: 'بدائل إن تعذّر التسجيل', columns: ['الرمز', 'المادة', 'س', 'لماذا لم تدخل المقترح'], widths: ['12%', '43%', '6%', '39%'], rows: sug.skipped.slice(0, 10).map(x => [x.c.code, x.c.name || nm(x.c.code), x.c.hours, x.why]) }] : []),
        ...(waiting.length ? [{ title: 'مواد متبقية بانتظار متطلب سابق', columns: ['الرمز', 'المادة', 'س', 'تنتظر'], widths: ['12%', '50%', '6%', '32%'], rows: waiting.map(c => [c.code, c.name || nm(c.code), c.hours, c.missing.join(c.preOr ? ' أو ' : ' و ')]) }] : []),
        ...(path && path.terms.length ? [{ title: 'مسار التخرج المنتظم (18 ساعة في الفصل الاعتيادي)', columns: ['الفصل', 'الساعات', 'المواد'], widths: ['16%', '8%', '76%'], rows: path.terms.map(t => [termName(t.term), t.hours, t.take.map(x => `${x.code} ${x.name || nm(x.code)}`).join('، ')]) }] : [])],
      raw: `<h3 class="sec">ملاحظات المرشد</h3><div style="height:80px;border:1px solid #c9c1ae;border-radius:6px"></div>` + SIGN(['الطالب', 'المرشد الأكاديمي', 'رئيس القسم']),
      note: 'المواد والعلامات والمتطلبات من «تحليل خطة الطالب» كما تطبعه بوابة الجامعة، والشعب من الجدول الدراسي المنشور. المقترح للإرشاد؛ التسجيل الفعلي على بوابة الجامعة. رمز QR يفتح الجدول المقترح في «مخطط جدولي».' });
  }

  // ---------------------------------------------------------------- plans kept on this device (IndexedDB), and the import from the portal
  const PV = 3;   // the reader's version: plans kept by an older reader are read again from their PDF
  const PORTAL = 'https://edugate.uop.edu.jo';
  const IMP = { on: P.get('from') === 'edugate', got: 0, ok: 0, warn: 0, bad: 0, last: '', done: null, list: [] };
  function idb() {
    return new Promise((res, rej) => { const r = indexedDB.open('uop-advising', 2);
      r.onupgradeneeded = () => { ['plans', 'trash'].forEach(n => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: 'id' }); }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function store(rec) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('plans', 'readwrite'); t.objectStore('plans').put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function storedAll() { try { const db = await idb(); return await new Promise((res, rej) => { const r = db.transaction('plans').objectStore('plans').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch (e) { return []; } }
  async function dbAll(store) { try { const db = await idb(); return await new Promise((res, rej) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch (e) { return []; } }
  async function dbDo(f) { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(['plans', 'trash'], 'readwrite'); f(t.objectStore('plans'), t.objectStore('trash')); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  // deleting moves a student to «المحذوفون» on this device; from there they come back, or go for good
  async function removeStudents(ids) {
    const recs = (await storedAll()).filter(r => ids.includes(r.id));
    await dbDo((P, T) => recs.forEach(r => { T.put({ ...r, deletedAt: new Date().toISOString() }); P.delete(r.id); }));
    BOARD = BOARD.filter(s => !ids.includes(String(s.head.id))); ROWS = null; SAVED = BOARD.length; SEL.clear();
    toast(`حُذف ${recs.length === 1 ? esc(recs[0].meta && recs[0].meta.name || recs[0].id) : recs.length + ' طلبة'} — في «المحذوفون» إن احتجته.`, 'تراجع', () => restoreStudents(ids));
    TRASH = (await dbAll('trash')).length; render();
  }
  async function restoreStudents(ids) {
    const recs = (await dbAll('trash')).filter(r => ids.includes(r.id));
    await dbDo((P, T) => recs.forEach(r => { const x = { ...r }; delete x.deletedAt; P.put(x); T.delete(r.id); }));
    for (const r of recs) { const s2 = r.parsed; if (s2 && s2.ok) { s2.stored = r.importedAt; s2.src = r.src; s2.warn = r.warn; addBoard(s2); } }
    SAVED = BOARD.length; TRASH = (await dbAll('trash')).length; render();
  }
  async function purge(ids) { await dbDo((P, T) => ids.forEach(id => T.delete(id))); TRASH = (await dbAll('trash')).length; }
  // a backup file of the chosen students (their plans and the original PDFs), to keep or to move to another device
  const b64 = buf => { const u = new Uint8Array(buf); let s2 = ''; for (let i = 0; i < u.length; i += 32768) s2 += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s2); };
  const unb64 = t => { const s2 = atob(t), u = new Uint8Array(s2.length); for (let i = 0; i < s2.length; i++) u[i] = s2.charCodeAt(i); return u.buffer; };
  async function backup(ids) {
    const recs = (await storedAll()).filter(r => !ids || ids.includes(r.id));
    const out = { app: 'uopstaff-advising', v: 1, saved: new Date().toISOString(), students: recs.map(r => ({ ...r, pdf: r.pdf ? b64(r.pdf) : null, parsed: undefined, parsedManual: r.pdf ? undefined : r.parsed })) };
    U.download(`طلابي-${new Date().toISOString().slice(0, 10)}-${recs.length}.json`, JSON.stringify(out), 'application/json');
  }
  async function restoreFile(file) {
    let n = 0, bad = 0;
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== 'uopstaff-advising') throw new Error('ليس ملف نسخة من «مكتب الإرشاد»');
      for (const r of d.students || []) {
        try {
          const rec = { ...r, pdf: r.pdf ? unb64(r.pdf) : null };
          let s2 = r.src === 'manual' ? r.parsedManual || null : null;
          if (rec.pdf) s2 = parsePlan(await pdfItems(rec.pdf.slice(0)), knownCodes(), planHours);
          if (!s2 && r.parsedManual) s2 = r.parsedManual;
          if (!s2 || !s2.ok) { bad++; continue; }
          rec.parsed = s2; rec.pv = PV; rec.warn = rec.pdf ? mismatches(s2) : [];
          delete rec.parsedManual;
          await store(rec); s2.stored = rec.importedAt; s2.src = rec.src; s2.warn = rec.warn; addBoard(s2); n++;
        } catch (e) { bad++; }
      }
      SAVED = BOARD.length; render();
      toast(`استُعيد ${n} طالباً${bad ? ` · تعذّر ${bad}` : ''}.`, 'عرض الطلاب', () => { st.view = 'board'; render(); });
    } catch (e) { toast('تعذّرت قراءة النسخة: ' + esc(e.message)); }
  }
  function toast(html, act, fn) {
    document.querySelectorAll('.adv-toast').forEach(t => t.remove());
    document.body.insertAdjacentHTML('beforeend', `<div class="adv-toast" role="status"><span>${html}</span>${act ? `<button type="button">${esc(act)}</button>` : ''}<i class="bi bi-x-lg" title="إغلاق"></i></div>`);
    const t = document.querySelector('.adv-toast');
    if (act) t.querySelector('button').onclick = () => { t.remove(); fn(); };
    t.querySelector('.bi-x-lg').onclick = () => t.remove();
    setTimeout(() => t.remove(), 12000);
  }
  async function trashModal() {
    const L = (await dbAll('trash')).sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
    U.modal('<i class="bi bi-trash"></i> المحذوفون', L.length ? `<p class="small">طلبة حذفتهم من القائمة، محفوظون على هذا الجهاز إلى أن تحذفهم نهائياً.</p>
      <table class="table table-sm align-middle"><thead><tr><th>الطالب</th><th>حُذف</th><th></th></tr></thead><tbody>${L.map(r => `<tr><td><b>${esc(r.meta && r.meta.name || '')}</b><div class="small text-muted">${esc(r.id)}</div></td><td><small>${U.numDate(r.deletedAt)}</small></td>
        <td class="text-end"><button type="button" class="btn btn-sm btn-maroon" data-back="${esc(r.id)}">استعادة</button> <button type="button" class="btn btn-sm btn-outline-danger" data-purge="${esc(r.id)}">حذف نهائي</button></td></tr>`).join('')}</tbody></table>
      <div class="d-flex gap-2"><button type="button" class="btn btn-sm btn-light border" data-back="*">استعادة الكل</button><button type="button" class="btn btn-sm btn-outline-danger" data-purge="*">إفراغ المحذوفين نهائياً</button></div>` : '<p class="mb-0">لا محذوفين.</p>');
    const ids = x => x === '*' ? L.map(r => r.id) : [x];
    document.querySelectorAll('#pgModalB [data-back]').forEach(b => b.onclick = async () => { await restoreStudents(ids(b.dataset.back)); trashModal(); });
    document.querySelectorAll('#pgModalB [data-purge]').forEach(b => b.onclick = async () => { if (!confirm('حذف نهائي؟ لا يمكن التراجع.')) return; await purge(ids(b.dataset.purge)); trashModal(); render(); });
  }
  const SEL = new Set();
  let TRASH = 0;
  async function storedClear() { const db = await idb(); return new Promise(res => { const t = db.transaction('plans', 'readwrite'); t.objectStore('plans').clear(); t.oncomplete = res; }); }
  // the PDF's own figures against the page's sums: [] when everything matches
  function mismatches(s) {
    const a = analyse(s, { assumeCurrent: false }), out = [];
    a.groups.forEach(g => { if (g.printedPassed != null && COUNTS(g.kind) && g.gotPassed !== g.printedPassed) out.push(`${g.name} ${g.gotPassed}≠${g.printedPassed}`); });
    return out;
  }
  function addBoard(s) { ROWS = null; BOARD = BOARD.filter(x => x.head.id !== s.head.id); BOARD.push(s); BOARD.sort((x, y) => String(x.head.name).localeCompare(String(y.head.name), 'ar')); }
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
  const soon = () => { clearTimeout(rT); rT = setTimeout(() => { if (st.view === 'board' || st.view === 'import') render(); }, 400); };
  window.addEventListener('message', async e => {
    if (e.origin !== PORTAL || !e.data || typeof e.data !== 'object') return;
    const d = e.data, reply = m => { try { e.source.postMessage(m, PORTAL); } catch (x) { /* portal tab closed */ } };
    await DATA_READY;
    if (d.type === 'uop-hello') { IMP.on = true; IMP.total = d.total || IMP.total; if (st.view !== 'import' || st.am !== 'portal') { st.view = 'import'; st.am = 'portal'; render(); } reply({ type: 'uop-ready' }); return; }
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
  // ---------------------------------------------------------------- page: import the plans (two ways)
  function importView() {
    const m = st.am || 'portal';
    const way = (k, ic, t, d, rec) => `<button type="button" class="adv-way ${m === k ? 'on' : ''}" data-am="${k}"><span class="adv-way-i"><i class="bi ${ic}"></i></span>
      <span class="adv-way-t"><b>${t}${rec ? ' <em>موصى به</em>' : ''}</b><small>${d}</small></span><span class="adv-radio"></span></button>`;
    const live = IMP.on ? `<div class="adv-live"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2"><b>${IMP.done ? (IMP.done.stopped ? '<i class="bi bi-pause-circle"></i> أُوقف السحب' : '<i class="bi bi-check-circle-fill text-success"></i> اكتمل السحب من البوابة') : '<span class="spinner-border spinner-border-sm"></span> جارٍ السحب من البوابة…'}</b>
          ${IMP.done ? '<button type="button" class="btn btn-sm btn-maroon" data-view="board"><i class="bi bi-people"></i> عرض الطلاب</button>' : ''}</div>
        <div class="adv-pbar big"><i class="${IMP.done ? 'done' : 'run'}" style="width:${IMP.done ? 100 : Math.min(98, IMP.total ? 100 * IMP.got / IMP.total : IMP.got)}%"></i></div>
        <div class="adv-live-n"><span><b>${IMP.ok}</b> مطابقة وكاملة</span>${IMP.warn ? `<span class="w"><b>${IMP.warn}</b> بتنبيه</span>` : ''}<span class="r"><b>${IMP.bad}</b> تعذّرت</span>${IMP.total ? `<span>من <b>${IMP.total}</b></span>` : ''}</div>
        ${IMP.done ? '' : `<p class="adv-src mb-0">آخر خطة وصلت: ${esc(IMP.last)} — أبقِ تبويب البوابة مفتوحاً حتى ينتهي.</p>`}
        ${IMP.list.length ? `<details class="mt-1"><summary class="adv-note">ما تعذّر (${IMP.list.length})</summary><div class="adv-src">${IMP.list.map(esc).join('<br>')}</div></details>` : ''}</div>` : '';
    const portal = `<div class="adv-steps2">
        <div><span>أ</span><b>مرة واحدة فقط</b><p>اسحب هذا الزر بالفأرة إلى شريط المفضلة أعلى المتصفح</p><a class="adv-bm" href="${BM()}" title="اسحبه إلى شريط المفضلة"><i class="bi bi-bookmark-star"></i> سحب الخطط</a><small>لا يظهر الشريط؟ Ctrl+Shift+B</small></div>
        <div><span>ب</span><b>سجّل الدخول</b><p>افتح بوابة المدرس وسجّل الدخول كالمعتاد</p><a class="btn btn-sm btn-light border" href="${PORTAL}/staff/studentPlan" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-left"></i> بوابة المدرس</a></div>
        <div><span>ج</span><b>ابدأ السحب</b><p>اضغط «سحب الخطط» في شريط المفضلة ثم «تأكيد وابدأ السحب». تصل الخطط هنا أولاً بأول.</p>${!window.Notification || Notification.permission === 'granted' ? '<small><i class="bi bi-bell-fill"></i> سيصلك تنبيه عند الانتهاء</small>' : '<button type="button" class="btn btn-sm btn-light border" id="adv-notif"><i class="bi bi-bell"></i> نبّهني عند الانتهاء</button>'}</div></div>
      <div class="adv-note mt-3"><i class="bi bi-shield-lock"></i> تسجيل الدخول يتم في بوابة الجامعة نفسها؛ لا يرى هذا الموقع اسم المستخدم ولا كلمة المرور، ولا يحفظهما ولا يستخدمهما. تُسحب الخطة كما تطبعها البوابة، ويُتحقق من رقم الطالب ومعدله وساعات كل مجموعة، وتُحفظ على هذا الجهاز فقط.</div>`;
    const pdf = `<label class="adv-drop d-block" id="adv-drop"><i class="bi bi-files"></i><div class="fw-bold mt-1">اختر ملفاً أو أكثر، أو اسحبها إلى هنا</div>
        <div class="adv-src mt-1">ملف «تحليل خطة الطالب» الذي يطبعه زر «طباعة» في البوابة. يُقرأ في هذا المتصفح فقط.</div><input type="file" accept="application/pdf,.pdf" id="adv-file" multiple hidden></label><div id="adv-msg" class="mt-2"></div>`;
    const restoreBox = `<label class="adv-drop d-block"><i class="bi bi-file-earmark-zip"></i><div class="fw-bold mt-1">اختر ملف النسخة الاحتياطية (.json)</div>
        <div class="adv-src mt-1">الملف الذي يصدّره «طلابي ← تصدير ← نسخة احتياطية». يُعاد كل طالب فيه بخطته وملفها الأصلي، ويُقرأ من جديد.</div><input type="file" accept=".json,application/json" id="adv-restore" hidden></label>
      <p class="adv-src mt-2 mb-0">${TRASH ? `ولديك ${TRASH} في «المحذوفون»: <a href="#" id="adv-trash2">استعادتهم</a>.` : ''}</p>`;
    return `<div class="adv-panel"><h3 class="adv-step"><span>1</span> اختر طريقة الإضافة</h3>
      <div class="adv-ways">${way('portal', 'bi-arrow-repeat', 'السحب من بوابة الطلبة', 'كل طلابك دفعة واحدة', true)}${way('pdf', 'bi-file-earmark-text', 'رفع تحليل خطة الطالب', 'تقرير PDF من نظام التسجيل')}${way('manual', 'bi-pencil-fill', 'إدخال يدوي', 'الاسم والرقم والتخصص، ثم تحديد المواد')}${way('restore', 'bi-arrow-counterclockwise', 'استعادة نسخة احتياطية', 'ملف صدّرته من «طلابي» سابقاً')}</div>
      <hr class="adv-hr">
      <h3 class="adv-step"><span>2</span> ${m === 'portal' ? 'السحب من بوابة الطلبة' : m === 'pdf' ? 'رفع تحليل خطة الطالب' : m === 'restore' ? 'استعادة نسخة احتياطية' : 'إدخال يدوي'}</h3>
      ${m === 'portal' ? live + portal : m === 'pdf' ? pdf : m === 'restore' ? restoreBox : manualForm()}</div>
      ${BOARD.length ? `<div class="adv-src mt-2 d-flex flex-wrap gap-2 align-items-center"><i class="bi bi-hdd"></i> ${BOARD.length} طالباً محفوظاً على هذا الجهاز. <button type="button" class="btn btn-sm btn-link p-0" data-view="board">عرض الطلاب</button> · <button type="button" class="btn btn-sm btn-link text-danger p-0" id="adv-clear">حذف الكل من هذا الجهاز</button></div>` : ''}`;
  }

  // ---------------------------------------------------------------- manual entry: name, number, major, standing, then the passed courses
  function manualPlans() { return (SP ? SP.plans : []).filter(p => p.degree === 'البكالوريوس' && p.groups.length).sort((a, b) => (a.faculty + a.major).localeCompare(b.faculty + b.major, 'ar')); }
  function guidanceFor(pl) {   // the guidance plan with the most courses in common: its order (year, term) and its prerequisites
    const pc = new Set(pl.groups.flatMap(g => g.courses.map(c => c.code)));
    let best = null;
    guidancePrograms().forEach(x => { const L = (x.r.years || []).flatMap(y => y.terms.flatMap(t => t.courses.map(c => ({ ...c, year: y.year, term: t.term }))));
      const n = L.filter(c => pc.has(c.code)).length / Math.max(1, L.filter(c => /^\d{6,7}$/.test(c.code)).length); if (!best || n > best.n) best = { n, L }; });
    return best && best.n > 0.6 ? best.L : [];
  }
  function manualForm() {
    const M = st.man || (st.man = { name: '', id: '', plan: '', stand: '', done: {} });
    const pl = manualPlans().find(p => p.id === M.plan);
    const G = pl ? guidanceFor(pl) : [];
    const standOpts = [];
    for (let y = 1; y <= 5; y++) [['first', 'الفصل الأول'], ['second', 'الفصل الثاني']].forEach(([t, l]) => standOpts.push([`${y}-${t}`, `${['', 'السنة الأولى', 'السنة الثانية', 'السنة الثالثة', 'السنة الرابعة', 'السنة الخامسة'][y]}، ${l}`]));
    const nDone = Object.values(M.done).filter(Boolean).length;
    const hDone = pl ? pl.groups.flatMap(g => g.courses).filter(c => M.done[c.code]).reduce((a, c) => a + (c.hours || 0), 0) : 0;
    return `<div class="adv-form">
        <label><span>اسم الطالب</span><input class="form-control" id="mn-name" value="${esc(M.name)}" autocomplete="off"></label>
        <label><span>الرقم الجامعي</span><input class="form-control" id="mn-id" value="${esc(M.id)}" inputmode="numeric" autocomplete="off"></label>
        <label><span>التخصص</span><select class="form-select" id="mn-plan"><option value="">— اختر —</option>${manualPlans().map(p => `<option value="${esc(p.id)}" ${p.id === M.plan ? 'selected' : ''}>${esc(p.major)} – ${esc(p.faculty)} (خطة ${esc(p.version)})</option>`).join('')}</select></label>
        <label><span>الفصل المستهدف</span><select class="form-select" id="mn-stand"><option value="">— الفصل الذي سيدرسه الطالب —</option>${standOpts.map(([k, l]) => `<option value="${k}" ${k === M.stand ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <small class="adv-src">${G.length ? 'تُعلَّم مواد الخطة الاسترشادية قبل هذا الفصل مجتازةً، وعدّلها بعد ذلك.' : 'لا خطة استرشادية مقروءة لهذا التخصص: علّم المواد يدوياً.'}</small></label></div>
      ${pl ? `<hr class="adv-hr"><h3 class="adv-step"><span>3</span> حدّد المواد المجتازة <small class="adv-src">${nDone} مادة · ${hDone} ساعة من ${pl.total}</small></h3>
        <div class="adv-pick-g">${pl.groups.filter(g => g.courses.length).map(g => `<fieldset><legend>${esc(g.name)} <small>${g.required_hours ?? ''} س</small></legend>
          ${g.courses.map(c => `<label class="adv-pick"><input type="checkbox" data-mc="${c.code}" ${M.done[c.code] ? 'checked' : ''}><code>${c.code}</code> ${esc(c.name)} <small>${c.hours} س</small></label>`).join('')}</fieldset>`).join('')}</div>
        <div class="d-flex flex-wrap gap-2 mt-3"><button type="button" class="btn btn-maroon" id="mn-save"><i class="bi bi-check2-circle"></i> حفظ الطالب</button><span class="adv-src align-self-center">المتطلبات السابقة من الخطة الاسترشادية للقسم، والمطروح من الجدول الدراسي.</span></div>
        <div id="mn-msg" class="mt-2"></div>` : ''}`;
  }
  function prefill() {   // the guidance plan's courses before the chosen term, marked as passed
    const M = st.man, pl = manualPlans().find(p => p.id === M.plan);
    if (!pl || !M.stand) return;
    const [y, t] = M.stand.split('-'), ord = (+y) * 10 + (t === 'first' ? 1 : 2);
    const inPlan = new Set(pl.groups.flatMap(g => g.courses.map(c => c.code)));
    M.done = {};
    pl.groups.filter(g => /استدراك/.test(g.name)).forEach(g => g.courses.forEach(c => { M.done[c.code] = true; }));   // remedial: done unless the student failed a placement test
    guidanceFor(pl).forEach(c => { const o = c.year * 10 + (c.term === 'first' ? 1 : c.term === 'second' ? 2 : 3); if (o < ord && inPlan.has(c.code)) M.done[c.code] = true; });
  }
  function manualStudent() {
    const M = st.man, pl = manualPlans().find(p => p.id === M.plan);
    const G = guidanceFor(pl), pre = {};
    G.forEach(c => { pre[c.code] = (String(c.prereq || '').match(/\d{6,7}/g) || []); });
    const tc = ttTerm();
    const kind = g => g.kind === 'free' ? 'free' : g.kind === 'remedial' ? 'remedial' : /خدمة مجتمع/.test(g.name) ? 'service' : g.kind === 'elective' ? 'elective' : 'required';
    const groups = pl.groups.map(g => ({ name: g.name.replace(/\s*\((اجبارية|حرة)\)\s*$/, ''), kind: kind(g), req: g.required_hours ?? null, printedPassed: null,
      courses: g.courses.map(c => ({ code: c.code, name: c.name, hours: c.hours, prereq: pre[c.code] || [], preOr: false, grade: '', result: M.done[c.code] ? 'ناجح' : '', status: M.done[c.code] ? 'مسجلة' : '', current: false, term: 0, alt: '', group: g.name, kind: kind(g) })) }));
    const passed = groups.filter(g => g.kind !== 'remedial').flatMap(g => g.courses).filter(c => c.result).reduce((a, c) => a + (c.hours || 0), 0);
    return { head: { id: M.id.trim(), name: M.name.trim(), major: pl.major, faculty: pl.faculty, studyType: 'صباحي' }, groups, term: tc, termLabel: TT.term, level: '', grade: '', gpa: null,
      passedHours: passed, planHours: pl.total, remainingHours: null, version: String(pl.version), ok: true, manual: true };
  }

  // ---------------------------------------------------------------- page: the dashboard of every imported plan
  let ROWS = null, LAST = null;
  function dashRows() {
    if (ROWS && ROWS.n === BOARD.length) return ROWS.list;
    const list = BOARD.map(s => {
      const a = analyse(s, { assumeCurrent: true }), a0 = analyse(s, { assumeCurrent: false });
      const lim = limits(a, false);
      const reqNotOff = a.open.filter(c => c.ready && c.required && (c.hours || 0) > 0 && !offeredAs(c.code));
      const failedNow = Object.values(a.tries).filter(L => L.some(t => t.result === 'راسب') && !a.passed.has(L[0].code)).length;
      const curH = s.groups.filter(g => g.kind !== 'outside').flatMap(g => g.courses).filter(c => a0.current.has(c.code)).reduce((x, c) => x + (c.hours || 0), 0);
      let path = null; try { path = paths(s, { load: 18, summer: false }); } catch (e) { /* no path */ }
      const ready = a.open.filter(c => c.ready);
      return { s, a, a0, lim, reqNotOff, failedNow, curH, path, ready, weak: !a.warned && ((s.gpa != null && s.gpa < 2.2) || failedNow >= 2),
        pct: s.planHours ? Math.round(100 * (s.planHours - a0.remainingNow) / s.planHours) : 0 };
    });
    ROWS = { n: BOARD.length, list };
    return list;
  }
  function boardView() {
    if (!BOARD.length) return `<div class="adv-empty"><i class="bi bi-inboxes"></i><h3>لا طلبة بعد</h3><p>أضف طلبتك من بوابة الطلبة دفعة واحدة، أو برفع ملفات «تحليل خطة الطالب»، أو يدوياً.</p><button type="button" class="btn btn-maroon" data-view="import"><i class="bi bi-plus-lg"></i> إضافة طالب</button></div>`;
    const rows = dashRows();
    const f = st.bf || 'all', q = norm(st.bq || ''), mj = st.bm || '';
    const majors = [...new Set(rows.map(r => r.s.head.major).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
    const is = { all: () => true, grad: r => r.lim.grad, warn: r => r.a.warned, weak: r => r.weak, miss: r => r.lim.grad && r.reqNotOff.length, chk: r => (r.s.warn || []).length, nogpa: r => r.s.gpa == null };
    const cnt = k => rows.filter(is[k]).length;
    let show = rows.filter(is[f] || is.all).filter(r => !mj || r.s.head.major === mj).filter(r => !q || norm(r.s.head.name + ' ' + r.s.head.id).includes(q));
    const sk = st.bs || 'name', dir = st.bd || 1;
    const key = { name: r => r.s.head.name || '', gpa: r => r.s.gpa ?? -1, passed: r => r.s.passedHours ?? 0, rem: r => r.a0.remainingNow, pct: r => r.pct, grad: r => r.path && r.path.end || 99999 }[sk];
    show = show.slice().sort((x, y) => { const a = key(x), b = key(y); return (typeof a === 'string' ? a.localeCompare(b, 'ar') : a - b) * dir; });
    const th = (k, l) => `<th class="adv-sort ${sk === k ? 'on' : ''}" data-sort="${k}">${l}${sk === k ? `<i class="bi bi-caret-${dir > 0 ? 'up' : 'down'}-fill adv-sort-i"></i>` : ''}</th>`;
    const avg = (() => { const g = rows.map(r => r.s.gpa).filter(x => x != null); return g.length ? (g.reduce((a, b) => a + b, 0) / g.length).toFixed(2) : '—'; })();
    const demand = {};
    rows.forEach(r => r.ready.forEach(c => { const d = demand[c.code] ||= { code: c.code, name: c.name || nm(c.code), n: 0, grad: 0, req: 0 }; d.n++; if (r.lim.grad) d.grad++; if (c.required) d.req++; }));
    const D = Object.values(demand).sort((x, y) => y.grad - x.grad || y.n - x.n);
    const open = st.bo || '';
    const detail = r => { const s = r.s;
      const gs = r.a0.groups.filter(g => g.kind !== 'outside' && g.kind !== 'incomplete');
      const gRow = g => { const pc = g.req ? Math.min(100, Math.round(100 * g.gotPassed / g.req)) : 100, done = g.gotPassed >= g.req;
        return `<div class="dt-g"><span class="dt-gn">${done ? '<i class="bi bi-check-circle-fill ic-g"></i>' : '<i class="bi bi-circle-half ic-o"></i>'} ${esc(g.name.replace(/متطلبات?\s*/, ''))}</span>
          <span class="dt-bar"><i class="${done ? 'ok' : pc >= 50 ? 'mid' : 'low'}" style="width:${pc}%"></i></span><span class="dt-gv">${g.gotPassed}<small>/${g.req}</small></span></div>`; };
      const cStat = c => { const n = offered(c.code).length; if (n) return `<span class="fb ok">مطروحة · ${n} شعبة</span>`; const x = offeredAs(c.code);
        return x ? `<span class="fb sec">برمز ${x}</span>` : '<span class="fb no">غير مطروحة</span>'; };
      const done = gs.filter(g => g.gotPassed >= g.req).length;
      return `<tr class="adv-det"><td colspan="12"><div class="dt">
        <section class="dt-c"><h4><i class="bi bi-diagram-3-fill ic-b"></i> مجموعات المتطلبات <span class="fb ok ms-auto">${done} من ${gs.length} مكتملة</span></h4>${gs.map(gRow).join('')}</section>
        <section class="dt-c"><h4><i class="bi bi-journal-check ic-g"></i> يحق له تسجيلها الآن <span class="fb sec ms-auto">${r.ready.length} مادة</span></h4>
          ${r.ready.slice(0, 10).map(c => `<div class="dt-i"><span class="fb code">${c.code}</span><span class="dt-in">${esc(c.name || nm(c.code))}</span>${cStat(c)}</div>`).join('') || '<div class="dt-e">لا مواد متاحة الآن</div>'}
          ${r.ready.length > 10 ? `<div class="dt-e">و${r.ready.length - 10} مادة أخرى في «التحليل الكامل»</div>` : ''}
          ${r.reqNotOff.length ? `<div class="dt-al"><b><i class="bi bi-exclamation-triangle-fill"></i> إجبارية غير مطروحة هذا الفصل</b>${r.reqNotOff.map(c => `<div><span class="fb code">${c.code}</span> ${esc(c.name)}</div>`).join('')}</div>` : ''}</section>
        <section class="dt-c"><h4><i class="bi bi-signpost-split-fill ic-t"></i> مسار التخرج المنتظم <span class="fb hrs ms-auto">18 س للفصل</span></h4>
          ${r.path && r.path.terms.length ? `<ol class="dt-tl">${r.path.terms.map(t => `<li><span>${esc(termName(t.term))}</span><span class="fb hrs">${t.hours} س</span></li>`).join('')}<li class="end"><span><i class="bi bi-mortarboard-fill"></i> التخرج المتوقع</span><span class="fb ok">${esc(termName(r.path.end))}</span></li></ol>` : '<div class="dt-e">—</div>'}
          ${(s.warn || []).length ? `<div class="dt-al">⚠ ${esc(s.warn.join('، '))}</div>` : ''}</section>
        <div class="dt-act"><button type="button" class="btn btn-sm btn-maroon" data-open="${esc(s.head.id)}"><i class="bi bi-person-vcard"></i> التحليل الكامل والجدول المقترح</button>
          <button type="button" class="btn btn-sm btn-light border" data-pdf="${esc(s.head.id)}"><i class="bi bi-file-earmark-pdf ic-r"></i> الخطة الأصلية</button>
          <button type="button" class="btn btn-sm btn-light border" data-bak="${esc(s.head.id)}"><i class="bi bi-download ic-b"></i> نسخة</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-del="${esc(s.head.id)}"><i class="bi bi-trash"></i> حذف</button>
          <span class="dt-src"><i class="bi bi-cloud-check ic-g"></i> ${s.src === 'portal' ? 'سُحب من البوابة' : s.src === 'manual' ? 'أُدخل يدوياً' : 'من ملف مرفوع'}${s.stored ? ` · ${U.numDate(s.stored)}` : ''}</span></div>
        </div></td></tr>`; };
    LAST = { show, rows, D };
    if (st.view === 'demand') return demandHtml(D);
    return `      <div class="adv-kpis">
        ${[['all', rows.length, 'كل الطلبة', 'bi-people', ''], ['grad', cnt('grad'), 'متوقع تخرجهم', 'bi-mortarboard', 'g'], ['miss', cnt('miss'), 'إجبارية غير مطروحة', 'bi-exclamation-diamond', 'r'], ['warn', cnt('warn'), 'منذرون', 'bi-exclamation-octagon', 'r'], ['weak', cnt('weak'), 'متعثرون', 'bi-graph-down-arrow', 'y'], ['nogpa', cnt('nogpa'), 'طلبة جدد', 'bi-stars', '']]
          .map(([k, v, l, ic, c]) => `<button type="button" class="adv-kpi ${c} ${f === k ? 'on' : ''}" data-bf="${k}" title="${({all:'كل الطلبة المضافين',grad:'متبقٍ لهم 21 ساعة أو أقل (13 في الصيفي)',miss:'تنقصهم مادة إجبارية غير مطروحة هذا الفصل',warn:'المعدل التراكمي أقل من 2.00 (المادة 12/أ)',weak:'نسبة إنجاز منخفضة أو رسوب حالي',nogpa:'طلبة جدد بلا معدل بعد'})[k] || ''}"><i class="bi ${ic}"></i><b>${v}</b><span>${l}</span></button>`).join('')}
        <div class="adv-kpi static"><i class="bi bi-bar-chart"></i><b>${avg}</b><span>متوسط المعدل</span></div></div>
      <div class="adv-card p-0"><div class="adv-tools no-print"><input type="search" class="form-control form-control-sm" id="adv-bq" placeholder="ابحث باسم الطالب أو رقمه…" value="${esc(st.bq || '')}">
          <select class="form-select form-select-sm" id="adv-bm"><option value="">كل التخصصات</option>${majors.map(m => `<option ${m === mj ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
          <span class="adv-src ms-auto">${show.length} من ${rows.length}</span>
          <div class="dropdown"><button type="button" class="btn btn-sm btn-light border dropdown-toggle" data-bs-toggle="dropdown"><i class="bi bi-box-arrow-up"></i> تصدير</button>
            <ul class="dropdown-menu"><li><a class="dropdown-item" href="#" id="adv-bak-all"><i class="bi bi-file-earmark-zip"></i> نسخة احتياطية لكل الطلبة (للرجوع إليها أو نقلها لجهاز آخر)</a></li><li><a class="dropdown-item" href="#" id="adv-bcsv2"><i class="bi bi-filetype-csv"></i> جدول CSV (Excel)</a></li><li><a class="dropdown-item" href="#" id="adv-lprint"><i class="bi bi-printer"></i> تقرير رسمي للطباعة أو PDF</a></li></ul></div>
          <button type="button" class="btn btn-sm btn-light border" id="adv-lprint2"><i class="bi bi-printer"></i> طباعة</button>
          <button type="button" class="btn btn-sm btn-light border" id="adv-trash"><i class="bi bi-trash"></i> المحذوفون${TRASH ? ` (${TRASH})` : ''}</button></div>
        ${SEL.size ? `<div class="adv-bulk no-print"><b>${SEL.size} محدد</b><button type="button" class="btn btn-sm btn-light border" id="adv-sel-bak"><i class="bi bi-download"></i> نسخة احتياطية</button><button type="button" class="btn btn-sm btn-light border" id="adv-sel-csv"><i class="bi bi-filetype-csv"></i> CSV</button><button type="button" class="btn btn-sm btn-light border" id="adv-sel-print"><i class="bi bi-printer"></i> طباعة</button><button type="button" class="btn btn-sm btn-outline-danger" id="adv-sel-del"><i class="bi bi-trash"></i> حذف المحدد</button><button type="button" class="btn btn-sm btn-link" id="adv-sel-none">إلغاء التحديد</button></div>` : ''}
        <div class="table-responsive"><table class="adv-t adv-dash"><thead><tr><th class="no-print adv-cb"><input type="checkbox" id="adv-all" ${show.length && show.every(r => SEL.has(String(r.s.head.id))) ? 'checked' : ''} title="تحديد الكل"></th>${th('name', 'الطالب')}<th>التخصص</th>${th('gpa', 'المعدل')}${th('passed', 'مجتازة')}${th('rem', 'متبقية')}${th('pct', 'الإنجاز')}<th>مسجلة الآن</th>${th('grad', 'التخرج المتوقع')}<th>الحالة</th><th>إجبارية غير مطروحة</th><th class="no-print"></th></tr></thead><tbody>
        ${show.map(r => { const s = r.s; return `<tr class="adv-row ${open === s.head.id ? 'open' : ''} ${SEL.has(String(s.head.id)) ? 'sel' : ''}" data-row="${esc(s.head.id)}"><td class="no-print adv-cb"><input type="checkbox" data-sel="${esc(s.head.id)}" ${SEL.has(String(s.head.id)) ? 'checked' : ''}></td><td class="bd-nm"><b>${esc(s.head.name || '')}</b><div class="adv-src"><span class="bd-id">${esc(s.head.id || '')}</span> · ${esc(s.level || '')}</div></td>
          <td><small>${esc(s.head.major || '')}</small><div class="adv-src">إصدار ${esc(s.version)}</div></td>
          <td>${s.gpa != null ? `<span class="bd-gpa ${s.gpa < 2 ? 'r' : s.gpa >= 3 ? 'g' : s.gpa < 2.5 ? 'y' : 'b'}">${s.gpa.toFixed(2)}</span>` : '<span class="fb sec">جديد</span>'}</td><td>${s.passedHours ?? ''}</td><td>${r.a0.remainingNow}</td>
          <td style="white-space:nowrap"><div class="adv-pct bd-p"><i class="${r.pct >= 75 ? 'g' : r.pct >= 40 ? 'b' : 'y'}" style="width:${r.pct}%"></i></div><small>${r.pct}%</small></td><td>${r.a0.current.size ? `<span class="fb reg">${r.a0.current.size} مواد · ${r.curH} س</span>` : '—'}</td>
          <td style="white-space:nowrap">${r.path && r.path.end ? `<i class="bi bi-mortarboard-fill ${r.lim.grad ? 'ic-g' : 'ic-t'}"></i> ${esc(termName(r.path.end))}` : '—'}</td>
          <td class="bd-st">${r.lim.grad ? '<span class="fb ok"><i class="bi bi-mortarboard-fill"></i> متوقع تخرجه</span>' : ''}${r.a.warned ? '<span class="fb no"><i class="bi bi-exclamation-octagon-fill"></i> منذر</span>' : ''}${r.weak ? '<span class="fb hrs"><i class="bi bi-graph-down-arrow"></i> متعثر</span>' : ''}${r.failedNow ? `<span class="fb day"><i class="bi bi-x-circle"></i> ${r.failedNow} لم ينجح بها</span>` : ''}${(s.warn || []).length ? '<span class="fb no">⚠ تنبيه</span>' : ''}${!r.lim.grad && !r.a.warned && !r.weak && !r.failedNow ? '<span class="fb ok"><i class="bi bi-check-circle-fill"></i> منتظم</span>' : ''}</td>
          <td>${r.reqNotOff.map(c => `<span class="fb no" title="${esc(c.name)}">${c.code}</span>`).join(' ') || '—'}</td>
          <td class="no-print"><button type="button" class="btn btn-sm btn-maroon" data-open="${esc(s.head.id)}">التحليل</button></td></tr>${open === s.head.id ? detail(r) : ''}`; }).join('') || '<tr><td colspan="12" class="text-center adv-src py-3">لا طلبة بهذا التصفية.</td></tr>'}</tbody></table></div></div>`;
  }

  // ---------------------------------------------------------------- official reports (A4, the site's report layout)
  const SIGN = (who) => `<div style="display:flex;gap:28px;margin-top:22px;font-size:10pt">${who.map(w => `<div style="flex:1;border-top:1px solid #1f2d33;padding-top:5px;text-align:center"><b>${w}</b><div style="color:#555;font-size:8.5pt;margin-top:10px">الاسم: ......................  التوقيع: ..............  التاريخ: ....../....../......</div></div>`).join('')}</div>`;
  function advisorOf() { const c = {}; BOARD.forEach(s2 => { const a = (s2.head.advisor || '').trim(); if (a) c[a] = (c[a] || 0) + 1; }); return (Object.entries(c).sort((a, b) => b[1] - a[1])[0] || [''])[0]; }
  function printStudents(show, rows) {
    const F = { all: 'كل الطلبة', grad: 'المتوقع تخرجهم', miss: 'تنقصهم إجبارية غير مطروحة', warn: 'المنذرون', weak: 'المتعثرون', nogpa: 'الجدد بلا معدل' };
    // the advisor's faculty is the one most students belong to; a student from another faculty (e.g. a business-analytics student) is named with the count, not mixed into the title
    const fc = {}; show.forEach(r => { const f = r.s.head.faculty; if (f) fc[f] = (fc[f] || 0) + 1; });
    const fl = Object.entries(fc).sort((a, b) => b[1] - a[1]);
    const fac = fl.length ? 'كلية ' + fl[0][0].replace(/^كلية\s*/, '') + (fl.length > 1 ? ` (و${fl.slice(1).map(([f, n]) => `${n} من ${f.replace(/^كلية\s*/, '')}`).join('، ')})` : '') : '';
    const chips = r => [r.lim.grad ? 'متوقع تخرجه' : '', r.a.warned ? 'منذر' : '', r.weak ? 'متعثر' : '', r.failedNow ? `${r.failedNow} لم ينجح بها` : ''].filter(Boolean).join('، ') || '—';
    printReport({ title: 'تقرير الإرشاد الأكاديمي: قائمة الطلبة', subtitle: [advisorOf() && 'المرشد: ' + advisorOf(), fac].filter(Boolean).join(' · '), orientation: 'landscape', fit: false, qr: false,
      filters: [['الفصل', TT.term], ['الطلبة', F[st.bf || 'all']], ...(st.bm ? [['التخصص', st.bm]] : []), ...(st.bq ? [['بحث', st.bq]] : []), ['العدد', `${show.length} من ${rows.length}`]],
      stats: [['طالباً', show.length], ['متوقع تخرجهم', show.filter(r => r.lim.grad).length], ['منذرون (معدل أقل من 2.00)', show.filter(r => r.a.warned).length], ['متعثرون', show.filter(r => r.weak).length],
        ['متوسط المعدل', (() => { const g = show.map(r => r.s.gpa).filter(x => x != null); return g.length ? (g.reduce((a, b) => a + b, 0) / g.length).toFixed(2) : '—'; })()]],
      sections: [{ columns: ['#', 'الرقم الجامعي', 'اسم الطالب', 'التخصص', 'المستوى', 'المعدل', 'المجتازة', 'المتبقية', 'الإنجاز', 'المسجلة الآن', 'التخرج المتوقع', 'الحالة', 'إجبارية غير مطروحة'],
        widths: ['3%', '8%', '15%', '13%', '7%', '5%', '5.5%', '5.5%', '5%', '7%', '8%', '9%', '9%'], numCols: [0, 5, 6, 7, 8],
        rows: show.map((r, i) => { const s2 = r.s; return [i + 1, s2.head.id, s2.head.name, `${s2.head.major || ''} (إصدار ${s2.version})`, s2.level || '—', s2.gpa != null ? s2.gpa.toFixed(2) : '—', s2.passedHours ?? '', r.a0.remainingNow, r.pct + '%',
          r.a0.current.size ? `${r.a0.current.size} (${r.curH} س)` : '—', r.path && r.path.end ? termName(r.path.end) : '—', chips(r), r.reqNotOff.map(c => c.code).join('، ') || '—']; }) }],
      raw: SIGN(['المرشد الأكاديمي', 'رئيس القسم']),
      note: 'البيانات من «تحليل خطة الطالب» كما تطبعه بوابة الجامعة لكل طالب؛ «المتوقع تخرجه»: الساعات المتبقية بعد نجاح ما سجّله الآن لا تزيد على 21 ساعة (م 7/ب من تعليمات منح درجة البكالوريوس 2023)؛ «منذر»: معدل تراكمي أقل من 2.00 (م 12/أ)؛ التخرج المتوقع حسب المسار المنتظم 18 ساعة في الفصل الاعتيادي.' });
  }
  function printDemand(D) {
    printReport({ title: 'تقرير الإرشاد الأكاديمي: الطلب المتوقع على المواد', subtitle: [advisorOf() && 'المرشد: ' + advisorOf(), `${BOARD.length} طالباً`].filter(Boolean).join(' · '), orientation: 'portrait', fit: false, qr: false,
      filters: [['الفصل', TT.term], ['المواد', D.length]],
      stats: [['مادة يحق تسجيلها', D.length], ['منها غير مطروحة الآن', D.filter(d => !offeredAs(d.code)).length], ['يحق لهم أكثر مادة', D.length ? Math.max(...D.map(d => d.n)) : 0]],
      sections: [{ columns: ['#', 'الرمز', 'المادة', 'يحق لهم تسجيلها', 'منهم متوقع تخرجهم', 'إجبارية لـ', 'هذا الفصل'], widths: ['5%', '10%', '37%', '11%', '12%', '10%', '15%'], numCols: [0, 3, 4, 5],
        rows: D.map((d, i) => { const x = offeredAs(d.code), L = offered(x || d.code); return [i + 1, d.code, d.name, d.n, d.grad || '', d.req || '', x ? `${L.length} شعبة${x !== d.code ? ` (برمز ${x})` : ''}` : 'غير مطروحة']; }) }],
      raw: SIGN(['المرشد الأكاديمي', 'رئيس القسم']),
      note: `عدد طلبة المرشد الذين اجتازوا متطلبات كل مادة (أو سجّلوها الآن)؛ «هذا الفصل» من الجدول الدراسي المنشور (${TT.term}).` });
  }
  function demandHtml(D) {
    const f = st.df || 'all', max = Math.max(1, ...D.map(d => d.n));
    const stat = d => { const x = offeredAs(d.code), L = offered(x || d.code), open = L.filter(isOpen).length;
      return !x ? { k: 'no', t: 'غير مطروحة', ic: 'bi-x-octagon-fill' } : !open ? { k: 'closed', t: `${L.length} شعبة · مغلقة`, ic: 'bi-lock-fill', x }
        : { k: 'open', t: `${L.length} شعبة · ${open} مفتوحة`, ic: 'bi-check-circle-fill', x }; };
    const R = D.map(d => ({ ...d, st: stat(d) }));
    const is = { all: () => true, no: d => d.st.k === 'no', grad: d => d.grad > 0, req: d => d.req > 0 };
    const show = R.filter(is[f] || is.all);
    const cnt = k => R.filter(is[k]).length;
    return `<div class="adv-card dm"><div class="dm-h"><h3><i class="bi bi-bar-chart-line-fill"></i> الطلب المتوقع على المواد في الفصل القادم</h3>
        <button type="button" class="btn btn-sm btn-maroon no-print" id="adv-dprint"><i class="bi bi-printer"></i> طباعة التقرير</button></div>
      <p class="dm-sub">كم طالباً من طلبتك يحق له تسجيل كل مادة (اجتاز متطلباتها أو سجّلها الآن)، ومنهم المتوقع تخرجهم — لتخطيط الشعب مع القسم.</p>
      <div class="dm-f no-print">${[['all', 'كل المواد', 'bi-grid-3x3-gap-fill', 'b'], ['no', 'غير مطروحة الآن', 'bi-x-octagon-fill', 'r'], ['grad', 'يحتاجها متوقع تخرجهم', 'bi-mortarboard-fill', 'g'], ['req', 'إجبارية', 'bi-lock-fill', 'm']]
        .map(([k, l, ic, c]) => `<button type="button" class="dm-chip ${c} ${f === k ? 'on' : ''}" data-df="${k}"><i class="bi ${ic}"></i> ${l} <b>${cnt(k)}</b></button>`).join('')}</div>
      <div class="table-responsive"><table class="dm-t"><thead><tr><th>#</th><th>الرمز</th><th>المادة</th><th><i class="bi bi-people-fill"></i> يحق لهم</th><th><i class="bi bi-mortarboard-fill"></i> متوقع تخرجهم</th><th><i class="bi bi-lock-fill"></i> إجبارية لـ</th><th><i class="bi bi-calendar-week-fill"></i> هذا الفصل</th></tr></thead><tbody>
      ${show.map((d, i) => `<tr class="${d.st.k === 'no' ? 'no' : ''}"><td class="n">${i + 1}</td><td><span class="dm-code">${d.code}</span></td><td class="nm">${esc(d.name)}</td>
        <td><div class="dm-bar"><i style="width:${Math.round(100 * d.n / max)}%"></i><b>${d.n}</b></div></td>
        <td>${d.grad ? `<span class="dm-b g"><i class="bi bi-mortarboard-fill"></i> ${d.grad}</span>` : '<span class="dm-z">—</span>'}</td>
        <td>${d.req ? `<span class="dm-b m"><i class="bi bi-lock-fill"></i> ${d.req}</span>` : '<span class="dm-b el">اختيارية</span>'}</td>
        <td><a class="dm-s ${d.st.k}" ${d.st.x ? `href="timetable.html?q=${d.st.x}" target="_blank" rel="noopener"` : ''}><i class="bi ${d.st.ic}"></i> ${d.st.t}${d.st.x && d.st.x !== d.code ? ` <small>برمز ${d.st.x}</small>` : ''}</a></td></tr>`).join('') || '<tr><td colspan="7" class="dm-empty">لا مواد بهذا التصفية.</td></tr>'}</tbody></table></div></div>`;
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
      let courses = list.map(c => ({ code: c.code, name: cleanName(c.code, c.name), hours: c.hours || 3, prereq: [], g: { fixed: true, name: 'الخطة الاسترشادية' }, why: [['req', `${['', 'الفصل الأول', 'الفصل الثاني'][termNo === 'first' ? 1 : 2]} من الخطة الاسترشادية`]], ready: true, required: true, level: 1, score: 0 }));
      REM.forEach(([k, rem, real, label]) => {
        if (!st.fresh[k]) return;
        const i = courses.findIndex(c => c.code === real || (k === 'pc' && /^9600/.test(c.code)));
        const rc = { code: rem, name: nm(rem) || `${label} – استدراكية`, hours: 3, prereq: [], g: { fixed: true, name: 'استدراكية' }, why: [['retake', `لم ينجح في امتحان مستوى ${label}`]], ready: true, required: true, level: 0, score: 0 };
        if (i >= 0) courses.splice(i, 1, rc); else courses.unshift(rc);
      });
      courses = courses.filter(c => /^\d{6,7}$/.test(c.code));
      const slots = list.filter(c => !/^\d{6,7}$/.test(c.code)).map(c => ({ ...c, code: /^\d{6,7}$/.test(c.code || '') ? c.code : '', name: fixAr(c.name) }));
      const a = { st: { head: { studyType: 'صباحي' } }, groups: [], open: courses };
      const sug = suggest(a, S, { max: 18, alts: altCodes });
      const sel = sug.best.combo;
      const colour = {}; sug.take.forEach((x, i) => { colour[x.c.via || x.c.code] = U.PALETTE[i % U.PALETTE.length]; });
      const planner = 'planner.html?plan=' + sel.map(x => encodeURIComponent(U.sectionKey(x))).join('~');
      FRESH = { p, courses, slots, sug, sel, planner, termNo };
      body = `<div class="adv-card"><h3><i class="bi bi-backpack"></i> حزمة الفصل الأول: ${esc(p.label)} <span class="badge text-bg-light border">${sug.hours} ساعة</span></h3>
        <p class="adv-src">من الخطة الاسترشادية المنشورة للقسم${p.r.academic_year || p.r.edition ? ` (${[p.r.academic_year, p.r.edition ? 'إصدار ' + p.r.edition : ''].filter(Boolean).join(' · ')})` : ''}، السنة الأولى – ${termNo === 'first' ? 'الفصل الأول' : 'الفصل الثاني'}، مع شعب الجدول الدراسي ${esc(TT.term)}.
          <a href="advisory.html?p=${encodeURIComponent(p.prog.id)}" target="_blank" rel="noopener">الخطة كاملة</a></p>
        <div class="adv-ctl mb-2">${REM.map(([k, , , l]) => `<label class="adv-pick"><input type="checkbox" data-rem="${k}" ${st.fresh[k] ? 'checked' : ''}>لم ينجح في امتحان مستوى ${l}</label>`).join('')}</div>
        ${(() => {
          const fv = st.fresh.fv || 'course';
          const tabs = [['course', 'bi-list-ul', 'حسب المادة'], ['day', 'bi-calendar-day', 'حسب اليوم'], ['week', 'bi-calendar3-week', 'جدول الأسبوع'], ['cards', 'bi-grid-3x2-gap', 'بطاقات المواد']];
          const nav = `<div class="adv-fv no-print">${tabs.map(([k, ic, l]) => `<button type="button" class="${fv === k ? 'on' : ''}" data-fv="${k}"><i class="bi ${ic}"></i> ${l}</button>`).join('')}</div>`;
          const room = x => x.room && x.room !== '0' ? x.room : 'افتراضية';
          const days = ['ح', 'ن', 'ث', 'ر', 'خ', 'س'], meet = [];
          sel.forEach(x => x.meetings.forEach(m => { if (live(m)) meet.push({ d: m.day, a: m.start, b: m.end, x }); }));
          const byDay = days.map(d => ({ d, L: meet.filter(m => m.d === d).sort((u, v) => u.a.localeCompare(v.a)) })).filter(r => r.L.length);
          const asyncL = sel.flatMap(x => x.meetings.filter(m => !live(m)).map(m => ({ d: m.day, x })));
          let view;
          if (fv === 'day') view = `<div class="table-responsive"><table class="adv-t"><thead><tr><th>اليوم</th><th>الوقت</th><th>الرمز</th><th>المادة</th><th>الشعبة</th><th>المدرس</th><th>القاعة</th></tr></thead><tbody>
              ${byDay.map(r => r.L.map((m, k) => `<tr>${k ? '' : `<td rowspan="${r.L.length}" class="adv-dayc"><span class="fb day"><i class="bi bi-calendar-event"></i> ${esc(DAYN(r.d))}</span> <small>${r.L.length} محاضرة</small></td>`}<td><i class="bi bi-clock ic-o"></i> <bdi dir="ltr">${m.a} – ${m.b}</bdi></td><td><span class="fb code">${m.x.code}</span></td><td>${esc(nm(m.x.code))}</td><td><span class="fb ${m.x.activity === 'عملي' ? 'lab' : 'sec'}">ش ${esc(m.x.section)}${m.x.activity === 'عملي' ? ' · عملي' : ''}</span></td><td><i class="bi bi-person-fill ic-b"></i> ${esc(U.shortName(m.x.instructor || '—'))}</td><td><i class="bi bi-door-open-fill ic-p"></i> ${esc(room(m.x))}</td></tr>`).join('')).join('')}
              ${asyncL.map(m => `<tr><td><span class="fb day"><i class="bi bi-calendar-event"></i> ${esc(DAYN(m.d))}</span></td><td><i class="bi bi-laptop ic-t"></i> غير متزامن</td><td><span class="fb code">${m.x.code}</span></td><td>${esc(nm(m.x.code))}</td><td><span class="fb sec">ش ${esc(m.x.section)}</span></td><td><i class="bi bi-person-fill ic-b"></i> ${esc(U.shortName(m.x.instructor || '—'))}</td><td><i class="bi bi-door-open-fill ic-p"></i> افتراضية</td></tr>`).join('')}</tbody></table></div>`;
          else if (fv === 'week') view = sel.length ? `<div class="mt-1">${U.weekGrid(sel.flatMap(x => x.meetings.map(m => ({ day: m.day, start: live(m) ? m.start : '', end: m.end, title: x.code, line: nm(x.code), sub: `ش ${x.section}`, style: `background:${colour[x.code][1]};border-inline-start-color:${colour[x.code][0]}` }))), { compact: true, px: 135 })}</div>` : '';
          else if (fv === 'cards') view = `<div class="adv-cc">${courses.map(c => { const mine = sel.filter(x => x.code === (c.via || c.code));
              return `<div class="adv-cci" style="--cc:${(colour[c.via || c.code] || ['#9ca3af'])[0]}"><div class="adv-cci-h"><span class="fb code">${c.code}</span><span class="fb hrs">${c.hours} س</span></div><b class="adv-cci-n">${esc(c.name)}</b>
                ${mine.length ? mine.map(x => `<dl><dt><i class="bi bi-hash ic-p"></i>الشعبة</dt><dd><span class="fb ${x.activity === 'عملي' ? 'lab' : 'sec'}">ش ${esc(x.section)}${x.activity === 'عملي' ? ' · عملي' : ''}</span></dd><dt><i class="bi bi-clock ic-o"></i>المواعيد</dt><dd>${x.meetings.map(m => live(m) ? `${esc(DAYN(m.day))} <bdi dir="ltr">${m.start} – ${m.end}</bdi>` : `${esc(DAYN(m.day))} غير متزامن`).join('<br>')}</dd><dt><i class="bi bi-person-fill ic-b"></i>المدرس</dt><dd>${esc(U.shortName(x.instructor || '—'))}</dd><dt><i class="bi bi-door-open-fill ic-p"></i>القاعة</dt><dd>${esc(room(x))}</dd><dt><i class="bi bi-people-fill ic-g"></i>المقاعد</dt><dd>${isOpen(x) ? `<span class="fb ok"><i class="bi bi-check-circle-fill"></i> ${seats(x)} شاغر</span>` : '<span class="fb no"><i class="bi bi-x-circle-fill"></i> مغلقة</span>'}</dd></dl>`).join('')
                  : `<div class="mt-2"><span class="fb no"><i class="bi bi-x-octagon-fill"></i> ${offeredAs(c.code) ? 'تتعارض شعبها أو تتجاوز الساعات' : 'غير مطروحة هذا الفصل'}</span></div>`}</div>`; }).join('')}
              ${slots.map(c => `<div class="adv-cci" style="--cc:#9ca3af"><div class="adv-cci-h">${c.code ? `<span class="fb code">${esc(c.code)}</span>` : '<span class="fb sec">اختيار</span>'}<span class="fb hrs">${c.hours || ''} س</span></div><b class="adv-cci-n">${esc(c.name)}</b><div class="adv-src mt-2">يختارها الطالب من المجموعة</div></div>`).join('')}</div>`;
          else view = `<div class="table-responsive"><table class="adv-t"><thead><tr><th>الرمز</th><th>المادة</th><th>س</th>${SEC_TH}</tr></thead><tbody>
        ${courses.map(c => { const mine = sel.filter(x => x.code === (c.via || c.code));
          return `<tr class="${mine.length ? '' : 'adv-x'}"><td><span class="fb code">${c.code}</span>${c.via ? `<div class="adv-src">برمز ${c.via}</div>` : ''}</td><td><b>${esc(c.name)}</b>${c.why[0][0] === 'retake' ? ' <span class="adv-chip retake">استدراكية</span>' : ''}</td><td><span class="fb hrs">${c.hours} س</span></td>${mine.length ? secTds(mine)
            : `<td colspan="5">${offeredAs(c.code) ? '<span class="fb no"><i class="bi bi-exclamation-triangle-fill"></i> تتعارض شعبها أو تتجاوز الساعات</span>' : '<span class="fb no"><i class="bi bi-x-octagon-fill"></i> غير مطروحة هذا الفصل</span>'}</td>`}</tr>`; }).join('')}
        ${slots.map(c => `<tr><td>${c.code ? `<span class="fb code">${esc(c.code)}</span>` : '<span class="fb sec">اختيار</span>'}</td><td><b>${esc(c.name)}</b><div class="adv-src">يختارها الطالب من المجموعة</div></td><td><span class="fb hrs">${c.hours || ''} س</span></td><td colspan="5"><i class="bi bi-info-circle ic-b"></i> انظر المطروح منها في <a href="plans.html" target="_blank" rel="noopener">الخطط الدراسية</a></td></tr>`).join('')}</tbody></table></div>`;
          return nav + view;
        })()}
        ${sel.length ? `<a class="btn btn-sm btn-light border mt-2 no-print" href="${planner}" target="_blank" rel="noopener"><i class="bi bi-calendar2-week"></i> افتح في «مخطط جدولي»</a>` : ''}</div>`;
    }
    const facs = [...new Set(progs.map(x => x.prog.faculty))].sort((a, b) => a.localeCompare(b, 'ar'));
    const F = st.fresh, inFac = progs.filter(x => !F.fac || x.prog.faculty === F.fac);
    if (!p) FRESH = null;
    return `<div class="adv-panel"><h3 class="adv-step"><span>1</span> بيانات الطالب الجديد</h3>
      <div class="adv-form">
        <label><span>اسم الطالب</span><input class="form-control" id="fr-name" value="${esc(F.name)}" placeholder="اختياري" autocomplete="off"></label>
        <label><span>الرقم الجامعي</span><input class="form-control" id="fr-id" value="${esc(F.id)}" inputmode="numeric" placeholder="اختياري" autocomplete="off"></label>
        <label><span>الكلية</span><select class="form-select" id="fr-fac"><option value="">— كل الكليات —</option>${facs.map(f => `<option ${f === F.fac ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
        <label><span>التخصص</span><select class="form-select" id="adv-prog"><option value="">— اختر التخصص —</option>${inFac.map(x => `<option value="${esc(x.key)}" ${x.key === F.prog ? 'selected' : ''}>${esc(x.prog.ar)}${F.fac ? '' : ` – ${esc(x.prog.faculty)}`}</option>`).join('')}</select></label></div>
      <p class="adv-src mt-2 mb-0"><i class="bi bi-info-circle"></i> التخصصات التي قُرئت خطتها الاسترشادية المنشورة بمطابقة كاملة (${progs.length}). لغيرها انظر <a href="advisory.html" target="_blank" rel="noopener">الخطط الاسترشادية</a>. الاسم والرقم يظهران في التقرير فقط ولا يُحفظان.</p>
      ${p ? `<hr class="adv-hr"><div class="d-flex flex-wrap align-items-center gap-2"><h3 class="adv-step m-0"><span>2</span> الجدول المقترح للفصل الأول</h3>
        <button type="button" class="btn btn-maroon ms-auto" id="fr-print"><i class="bi bi-printer"></i> تصدير التقرير (طباعة أو PDF)</button></div>` : ''}</div>${body}`;
  }
  let FRESH = null;
  function printFresh() {
    if (!FRESH) return;
    const { p, courses, slots, sug, sel, planner, termNo } = FRESH, F = st.fresh;
    const link = new URL(planner, location.href).href;
    const days = ['ح', 'ن', 'ث', 'ر', 'خ', 'س'];
    const meet = [];
    sel.forEach(x => x.meetings.forEach(m => { if (live(m)) meet.push({ d: m.day, a: m.start, b: m.end, x }); }));
    const byDay = days.map(d => ({ d, L: meet.filter(m => m.d === d).sort((u, v) => u.a.localeCompare(v.a)) })).filter(r => r.L.length);
    const rem = [['ar', 'اللغة العربية'], ['en', 'اللغة الإنجليزية'], ['pc', 'المهارات الحاسوبية']].filter(([k]) => F[k]).map(([, l]) => l);
    printReport({ title: 'الجدول المقترح لطالب جديد', subtitle: [F.name, F.id].filter(Boolean).join(' · ') || p.prog.ar, orientation: 'portrait', fit: false, url: link, qrLabel: 'الجدول في «مخطط جدولي»',
      filters: [['الكلية', p.prog.faculty], ['التخصص', p.prog.ar], ['الفصل', TT.term], ...(F.name ? [['الطالب', F.name]] : []), ...(F.id ? [['الرقم الجامعي', F.id]] : []), ['امتحانات المستوى', rem.length ? 'لم ينجح في: ' + rem.join('، ') : 'ناجح فيها جميعها']],
      stats: [['الساعات المعتمدة', sug.hours], ['المواد', sug.take.length], ['أيام الدوام', byDay.length], ['شعب فيها مقاعد', sel.filter(isOpen).length + ' من ' + sel.length]],
      sections: [
        { title: `المواد والشعب (السنة الأولى – ${termNo === 'first' ? 'الفصل الأول' : 'الفصل الثاني'} من الخطة الاسترشادية)`, columns: ['#', 'الرمز', 'المادة', 'س', 'الشعبة', 'المواعيد', 'المدرس', 'القاعة', 'المقاعد'],
          widths: ['4%', '9%', '22%', '4%', '7%', '24%', '15%', '7%', '8%'], numCols: [0, 3],
          rows: [...courses.map((c, i) => { const mine = sel.filter(x => x.code === (c.via || c.code));
            if (!mine.length) return [i + 1, c.code, c.name, c.hours, '—', offeredAs(c.code) ? 'تتعارض أو تتجاوز الساعات' : 'غير مطروحة هذا الفصل', '—', '—', '—'];
            return [i + 1, c.code + (c.via ? ` (برمز ${c.via})` : ''), c.name, c.hours, mine.map(x => x.section + (x.activity === 'عملي' ? ' عملي' : '')).join(' / '),
              mine.map(x => x.meetings.map(m => live(m) ? `${DAYN(m.day)} ${m.start} – ${m.end}` : `${DAYN(m.day)} غير متزامن`).join('، ')).join(' / '),
              mine.map(x => U.shortName(x.instructor || '—')).join(' / '), mine.map(x => x.room && x.room !== '0' ? x.room : 'افتراضية').join(' / '), mine.map(x => isOpen(x) ? `${seats(x)} شاغر` : 'مغلقة').join(' / ')]; }),
            ...slots.map(c => ['', c.code, c.name, c.hours || '', '—', 'يختارها الطالب من المجموعة', '—', '—', '—'])] },
        { title: 'برنامج الأسبوع', columns: ['اليوم', 'الوقت', 'الرمز', 'المادة', 'الشعبة', 'القاعة'], widths: ['12%', '16%', '11%', '39%', '9%', '13%'],
          rows: byDay.flatMap(r => r.L.map((m, k) => [k ? '' : DAYN(r.d), `${m.a} – ${m.b}`, m.x.code, nm(m.x.code), m.x.section + (m.x.activity === 'عملي' ? ' عملي' : ''), m.x.room && m.x.room !== '0' ? m.x.room : 'افتراضية'])) }],
      raw: SIGN(['الطالب', 'المرشد الأكاديمي', 'رئيس القسم']),
      note: `المواد من الخطة الاسترشادية المنشورة للقسم${p.r.academic_year ? ' (' + p.r.academic_year + ')' : ''}، والشعب من الجدول الدراسي المنشور على بوابة الجامعة (${TT.term}) بلا تعارض، الأفضلية للشعب التي فيها مقاعد. المقترح للإرشاد؛ التسجيل الفعلي على بوابة الجامعة. رمز QR يفتح الجدول في «مخطط جدولي».` });
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
    if (st.view === 'student' && !STUD) st.view = 'board';   // a student's analysis opens from the students list
    const nDemand = BOARD.length ? new Set(dashRows().flatMap(r => r.ready.map(c => c.code))).size : 0;
    const tabs = [['board', 'bi-people', `الطلاب${BOARD.length ? ` <em>${BOARD.length}</em>` : ''}`], ['demand', 'bi-bar-chart-line', `المواد المطلوبة${nDemand ? ` <em>${nDemand}</em>` : ''}`],
      ['fresh', 'bi-stars', 'طالب جديد'], ['dict', 'bi-book-half', 'قاموس المواد'], ['rules', 'bi-bank', 'القواعد الرسمية']];
    const sub = '';
    const body = sub + (st.view === 'import' ? importView() : st.view === 'board' || st.view === 'demand' ? boardView() : st.view === 'fresh' ? freshView() : st.view === 'dict' ? dictView() : st.view === 'rules' ? rulesView() : studentView());
    $('#adv-app').innerHTML = `<div class="adv-tabs">${tabs.map(([k, ic, l]) => `<button type="button" class="${st.view === k || (k === 'board' && st.view === 'student') ? 'on' : ''}" data-view="${k}"><i class="bi ${ic}"></i> ${l}</button>`).join('')}
      <button type="button" class="adv-add ${st.view === 'import' ? 'on' : ''}" data-view="import"><i class="bi bi-plus-lg"></i> إضافة طلاب</button>
      <button type="button" class="adv-ref" id="adv-refresh" title="أعد قراءة الجدول الدراسي المنشور الآن (يتحدّث كل ساعة)"><i class="bi bi-arrow-clockwise"></i></button></div>${body}`;
    const url = new URL(location.href);
    url.searchParams.delete('view'); url.searchParams.delete('q');
    if (st.view !== 'board') url.searchParams.set('view', st.view);
    if (st.view === 'dict' && st.q) url.searchParams.set('q', st.q);
    history.replaceState(null, '', url);
    bind();
  }
  function bind() {
    const on = (id, ev, f) => { const el = $(id); if (el) el.addEventListener(ev, f); };
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.view; render(); scrollTo(0, 0); }));
    document.querySelectorAll('[data-row]').forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('button,a,input,.adv-cb')) return; st.bo = st.bo === tr.dataset.row ? '' : tr.dataset.row; render(); }));
    document.querySelectorAll('[data-sort]').forEach(t => t.addEventListener('click', () => { if (st.bs === t.dataset.sort) st.bd = -(st.bd || 1); else { st.bs = t.dataset.sort; st.bd = 1; } render(); }));
    document.querySelectorAll('[data-pdf]').forEach(b => b.addEventListener('click', async () => { const r = (await storedAll()).find(x => x.id === b.dataset.pdf); if (r && r.pdf) window.open(URL.createObjectURL(new Blob([r.pdf], { type: 'application/pdf' })), '_blank'); else U.modal('الخطة الأصلية', 'هذا الطالب أُدخل يدوياً، فلا ملف أصلي له.'); }));
    const bq = $('#adv-bq'); if (bq) { let t; bq.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.bq = bq.value; const pos = bq.selectionStart; render(); const n = $('#adv-bq'); n.focus(); n.setSelectionRange(pos, pos); }, 250); }); }
    const pq = $('#adv-pq'); if (pq) { let t; pq.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.pq = pq.value; const pos = pq.selectionStart; render(); const n = $('#adv-pq'); n.focus(); n.setSelectionRange(pos, pos); }, 200); }); }
    const bm = $('#adv-bm'); if (bm) bm.addEventListener('change', () => { st.bm = bm.value; render(); });
    document.querySelectorAll('[data-am]').forEach(b => b.addEventListener('click', () => { st.am = b.dataset.am; render(); }));
    const mset = (id, k) => { const el = $(id); if (el) el.addEventListener('input', () => { st.man[k] = el.value; }); };
    mset('#mn-name', 'name'); mset('#mn-id', 'id');
    on('#mn-plan', 'change', e => { st.man.plan = e.target.value; st.man.done = {}; prefill(); render(); });
    on('#mn-stand', 'change', e => { st.man.stand = e.target.value; prefill(); render(); });
    document.querySelectorAll('[data-mc]').forEach(b => b.addEventListener('change', () => { st.man.done[b.dataset.mc] = b.checked; const y = scrollY; render(); scrollTo(0, y); }));
    on('#mn-save', 'click', async () => {
      const M = st.man, msg = $('#mn-msg');
      if (!M.name.trim() || !/^\d{5,12}$/.test(M.id.trim())) { msg.innerHTML = '<div class="alert alert-warning py-2 mb-0">أدخل اسم الطالب ورقمه الجامعي (أرقام فقط).</div>'; return; }
      const s2 = manualStudent();
      try { await store({ id: s2.head.id, meta: { name: s2.head.name }, pdf: null, parsed: s2, pv: PV, importedAt: new Date().toISOString(), src: 'manual', warn: [] }); } catch (e) { /* storage unavailable */ }
      s2.stored = new Date().toISOString(); s2.src = 'manual'; addBoard(s2); SAVED = BOARD.length;
      st.man = null; render();
      const m2 = $('#mn-msg') || $('#adv-app'); m2.insertAdjacentHTML('afterbegin', `<div class="alert alert-success py-2">حُفظ ${esc(s2.head.name)}. <a href="#" data-view="board">عرض الطلاب</a></div>`); bind();
    });
    $('#adv-refresh').addEventListener('click', async () => { const b = $('#adv-refresh'); b.disabled = true; try { TT = await U.getJSON('data/timetable.json', true); indexData(); SAME = null; U.updatedLine(TT.updated, 'الشعب من الجدول الدراسي المنشور'); } catch (e) { /* keep the copy in hand */ } render(); });
    const drop = $('#adv-drop'), file = $('#adv-file');
    if (drop) {
      ['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', ev => takeFiles([...ev.dataTransfer.files]));
      file.addEventListener('change', () => takeFiles([...file.files]));
    }
    on('#adv-back', 'click', () => { st.view = 'board'; render(); scrollTo(0, 0); });
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
    document.querySelectorAll('[data-df]').forEach(b => b.addEventListener('click', () => { st.df = b.dataset.df; render(); }));
    document.querySelectorAll('[data-bf]').forEach(b => b.addEventListener('click', () => { st.boardFilter = b.dataset.bf; render(); }));
    document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => { STUD = BOARD.find(s => s.head.id === b.dataset.open) || STUD; st.view = 'student'; st.force.clear(); st.drop.clear(); st.cap = null; render(); scrollTo(0, 0); }));
    on('#adv-bcsv', 'click', () => boardCsv());
    on('#adv-bcsv2', 'click', e => { e.preventDefault(); boardCsv(); });
    on('#adv-bak-all', 'click', e => { e.preventDefault(); backup(); });
    on('#adv-trash', 'click', trashModal);
    on('#adv-lprint', 'click', e => { e.preventDefault(); if (LAST) printStudents(LAST.show, LAST.rows); });
    on('#adv-lprint2', 'click', () => { if (LAST) printStudents(LAST.show, LAST.rows); });
    on('#adv-dprint', 'click', () => { if (LAST) printDemand(LAST.D); });
    on('#adv-trash2', 'click', e => { e.preventDefault(); trashModal(); });
    on('#adv-all', 'change', e => { document.querySelectorAll('[data-sel]').forEach(b => { if (e.target.checked) SEL.add(b.dataset.sel); else SEL.delete(b.dataset.sel); }); render(); });
    document.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('change', () => { if (b.checked) SEL.add(b.dataset.sel); else SEL.delete(b.dataset.sel); const y = scrollY; render(); scrollTo(0, y); }));
    on('#adv-sel-bak', 'click', () => backup([...SEL]));
    on('#adv-sel-csv', 'click', () => boardCsv([...SEL]));
    on('#adv-sel-print', 'click', () => { if (LAST) printStudents(LAST.rows.filter(r => SEL.has(String(r.s.head.id))), LAST.rows); });
    on('#adv-sel-del', 'click', () => { if (confirm(`نقل ${SEL.size} طالباً إلى «المحذوفون»؟`)) removeStudents([...SEL]); });
    on('#adv-sel-none', 'click', () => { SEL.clear(); render(); });
    document.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => removeStudents([b.dataset.del])));
    document.querySelectorAll('[data-bak]').forEach(b => b.addEventListener('click', () => backup([b.dataset.bak])));
    on('#adv-restore', 'change', e => { if (e.target.files[0]) restoreFile(e.target.files[0]); });
    on('#adv-clear', 'click', async () => { if (!confirm('نقل كل الطلبة إلى «المحذوفون»؟ يمكنك استعادتهم من هناك.')) return; await removeStudents(BOARD.map(s => String(s.head.id))); });
    on('#adv-notif', 'click', async () => { try { await Notification.requestPermission(); } catch (e) { /* not supported */ } render(); });
    document.querySelectorAll('.adv-bm').forEach(a => a.addEventListener('click', ev => { ev.preventDefault(); U.modal('اسحب الزر، لا تضغطه', '<p>هذا الزر يعمل من شريط المفضلة وهو في صفحة بوابة المدرس. اسحبه بالفأرة (اضغط عليه مطولاً ثم حرّكه) إلى شريط المفضلة أعلى المتصفح، ثم افتح البوابة وسجّل الدخول واضغطه هناك.</p>'); }));
    on('#adv-prog', 'change', e => { st.fresh.prog = e.target.value; const g = guidancePrograms().find(x => x.key === st.fresh.prog); if (g) st.fresh.fac = g.prog.faculty; render(); });
    on('#fr-fac', 'change', e => { st.fresh.fac = e.target.value; const g = guidancePrograms().find(x => x.key === st.fresh.prog); if (g && st.fresh.fac && g.prog.faculty !== st.fresh.fac) st.fresh.prog = ''; render(); });
    on('#fr-name', 'input', e => { st.fresh.name = e.target.value; });
    on('#fr-id', 'input', e => { st.fresh.id = e.target.value; });
    on('#fr-print', 'click', printFresh);
    document.querySelectorAll('[data-fv]').forEach(b => b.addEventListener('click', () => { st.fresh.fv = b.dataset.fv; render(); }));
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
        if (st.view === 'board' || st.view === 'import') addBoard(s); else { STUD = s; st.force.clear(); st.drop.clear(); st.cap = null; st.summer = null; st.mode = 'next'; }
      } catch (e) { bad.push(`${f.name} (${e.message})`); }
    }
    render();
    if (st.view === 'import' && files.length) { const m = $('#adv-msg'); if (m && !bad.length) m.innerHTML = `<div class="alert alert-success py-2 mb-0">أُضيف ${files.length - bad.length} خطة. <a href="#" data-view="board">عرض الطلاب</a></div>`; m && m.querySelectorAll('[data-view]').forEach(a => a.onclick = e => { e.preventDefault(); st.view = 'board'; render(); }); }
    if (bad.length) { const m = $('#adv-msg'); if (m) m.innerHTML = `<div class="alert alert-warning py-2">لم يُقرأ: ${bad.map(esc).join('، ')} — هل هو ملف «تحليل خطة الطالب» من نظام التسجيل؟</div>`; }
  }
  function boardCsv(ids) {
    const q = v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    const lines = [['رقم الطالب', 'الاسم', 'التخصص', 'الإصدار', 'المعدل', 'المجتازة', 'المتبقية', 'متوقع تخرجه', 'منذر', 'إجبارية غير مطروحة'].join(',')];
    BOARD.filter(s => !ids || ids.includes(String(s.head.id))).forEach(s => { const a = analyse(s, { assumeCurrent: true }), a0 = analyse(s, { assumeCurrent: false }), lim = limits(a, false);
      lines.push([s.head.id, s.head.name, s.head.major, s.version, s.gpa, s.passedHours, a0.remainingNow, lim.grad ? 'نعم' : '', a.warned ? 'نعم' : '', a.open.filter(c => c.ready && c.required && (c.hours || 0) > 0 && !offeredAs(c.code)).map(c => c.code).join(' ')].map(q).join(',')); });
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
      if (IMP.on) { st.view = 'import'; try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* not supported */ } }
      render();
      dataReady();
      loadStored().then(async n => { SAVED = n; TRASH = (await dbAll('trash')).length; if (n || TRASH) render(); });
      const top = $('#pg-q');
      if (top) top.addEventListener('keydown', e => { if (e.key === 'Enter') { st.view = 'dict'; st.q = top.value; render(); } });
    }).catch(e => { $('#adv-app').innerHTML = `<div class="alert alert-danger mt-3">تعذّر التحميل (${esc(e.message)}).</div>`; });
})(typeof window !== 'undefined' ? window : globalThis);
