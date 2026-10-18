/* Integration checks use real Edge and local fixture responses, never a paid API. */
const { chromium } = require('./test-runtime/node_modules/playwright');
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const root = path.resolve(__dirname, '..'), output = path.join(__dirname, 'test-output');
fs.mkdirSync(output, { recursive: true });
const pdfBase = path.join(__dirname, 'test-runtime/node_modules/pdfjs-dist/build');
let mode = 'normal', solved = [], captured = [], failOnce = false, activeContext, activeProfile;
const fixtureQ = [{ id: '1', text: 'Solve the equation $\\frac{x-1}{3}=2$.', pages: [1], needsImage: false }];
const fixtureM = [{ id: '1', text: '$x-1=6$ M1; $x=7$ A1 oe.', pages: [1], needsImage: false }];
const response = data => JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }], usage: { prompt_tokens: 150, completion_tokens: 200 } });
const server = http.createServer((req, res) => {
  const name = req.url.split('?')[0];
  const file = name === '/pdf.min.js' || name === '/pdf.worker.min.js' ? path.join(pdfBase, name.slice(1)) : path.join(root, 'revision-studio.html');
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'application/javascript' : 'text/html' }); res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${server.address().port}`;
  const profile=activeProfile=fs.mkdtempSync(path.join(output,'browser-profile-'));
  const context = activeContext = await chromium.launchPersistentContext(profile, { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--disable-gpu'], viewport: { width: 1440, height: 1000 }, acceptDownloads: true, downloadsPath: path.join(output,'downloads') });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.error(e.stack); });
  page.on('dialog', d => d.accept());
  await page.route('**/chat/completions', async route => {
    const b = route.request().postDataJSON(); captured.push(b);
    const sys = b.messages[0].content, parts = b.messages[1].content;
    if (mode === '401') { await route.fulfill({ status: 401, body: 'invalid test key' }); return; }
    let result;
    if (sys.includes('transcribe')) {
      const text = typeof parts === 'string' ? parts : parts[0].text;
      if (text.startsWith('QUESTION')) {
        result = { items: fixtureQ, warnings: [], glossary: [] };
      } else {
        if (mode === 'stop-extract' && !failOnce) { failOnce = true; await new Promise(ok => setTimeout(ok, 1800)); }
        result = { items: fixtureM, warnings: [], glossary: [{ code: 'oe', meaning: 'or equivalent' }] };
      }
    } else {
      const user = JSON.parse(typeof parts === 'string' ? parts : parts[0].text), id = user.question.id; solved.push(id);
      if (mode === 'stop-solve' && id === '2') { await new Promise(ok => setTimeout(ok, 1800)); }
      result = { items: [{ id, answer: '$x=7$', origin: 'scheme', steps: [{ work: '$x-1=6$', why: '等式两侧乘以 3，消去分母。' }, { work: '$x=7$', why: '两侧加 1，解出未知数。' }], marking: [{ code: 'M1', meaning: '1 分方法分', condition: '正确消去分母。' }, { code: 'A1', meaning: '1 分准确分', condition: '给出正确结果，依赖 M1。' }, { code: 'oe', meaning: '或等价形式', condition: '接受等价表达。' }], knowledge: [{ name: '解线性方程', itemId: user.candidates[0]?.id || 'invented', why: '通过等式性质求未知数。' }], pitfalls: ['运算必须作用于等号两侧。'], uncertainty: '' }] };
    }
    if (!sys.includes('transcribe')) {
      const user=JSON.parse(typeof parts==='string'?parts:parts[0].text);
      const a=result.items[0];
      a.title='线性方程求解'; a.answerLanguage='en'; a.answerLines=[{text:'Multiply both sides by 3',codes:['M1']},{text:'$x=7$',codes:['A1']}];
      a.highlights=['Multiply both sides','消去分母','两侧加 1'];
      if(user.subquestions?.length){
        a.parts=user.subquestions.map((q,i)=>({...a,id:q.id,answer:'Answer to '+q.id,answerLines:[{text:'Multiply both sides — '+q.id,codes:['M1']}],steps:[{work:'方法 '+q.id,why:'消去分母'}],knowledge:[{name:'知识 '+q.id,itemId:user.candidates[0]?.id||'',why:'对应 '+q.id}]}));
        if(mode==='missing-part')a.parts.pop();
      }
      if (user.question.text.includes('A drone') && user.syllabus.includes('Computer Science')) {
        a.title='机器人特征与传感器'; a.answer='Robot characteristics, sensor selection and microprocessor definition.';
        a.parts=user.subquestions.map((q,i)=>({id:q.id,answer:['A mechanical structure and programmable behaviour.','A proximity sensor.','An integrated circuit containing the CPU on a single chip.'][i],origin:'scheme',answerLines:[],steps:[{work:['机器人有机械结构并且可编程。','接近传感器检测附近物体。','微处理器把 CPU 集成在单芯片上。'][i],why:'根据定义回答这道小题。'}],marking:[],knowledge:[{name:['Robot characteristics','Proximity sensor','Microprocessor'][i],itemId:['6.2.2','3.2.3','3.1.1'][i],why:'对应本小题考查的定义或用途。'}],highlights:[],pitfalls:[],uncertainty:''}));
        if(mode==='chinese-answer')a.parts[0].answer='机械结构和可编程';
        if(mode==='missing-part')a.parts.pop();
      }
      if (mode==='math-display') {
        Object.assign(a,{title:'定积分与对数法则',answer:'$a=42$',answerLines:[],parts:[],steps:[{work:String.raw`\int \frac{1}{3x+2}\,dx = **\frac13\ln(3x+2)**+C`,why:'内函数导数为 3，积分系数需除以 3。'},{work:String.raw`**\frac13\left[\ln(3a+2)-\ln 2\right]**`,why:'根据对数相减法则合并对数。'},{work:String.raw`\frac{3a+2}{2}=64 \Rightarrow 3a+2=128 \Rightarrow a=42`,why:'将对数等式转为指数等式。'}],marking:[],knowledge:[{name:'Integration of reciprocal linear functions',itemId:'18.1',why:String.raw`原函数为 $\frac13\ln|3x+2|+C$。`},{name:'Logarithm laws',itemId:'18.2',why:'应用对数相减法则。'}],highlights:[String.raw`\frac13`,'方程','内函数导数','对数相减法则'],pitfalls:['不要漏掉内函数导数带来的系数。'],uncertainty:''});
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: response(result) });
  });
  await page.goto(url);
  await page.evaluate(()=>localStorage.clear()); await page.reload();
  await page.evaluate(() => { S.cfg = { kind: 'custom', model: 'fixture-vision', base: 'http://fixture.test/v1', key: 'fixture-only' }; save(); });
  await page.locator('[data-hm="paper"]').click();
  assert.equal(await page.evaluate(() => V), 'home');
  assert.equal(await page.locator('#bPaper').isVisible(), true);
  assert.deepEqual(await page.locator('.sb-imports button').allTextContents(), ['导入考纲', '导入题目']);
  await page.locator('#paperQText').fill('draft retained');
  await page.locator('#paperClose').click();
  await page.locator('#syllabusNav').click();
  assert.equal(await page.locator('#bNew').isVisible(), true);
  assert.equal(await page.locator('#bPaper').isVisible(), false);
  await page.locator('#mClose').click();
  await page.locator('#paperNav').click();
  assert.equal(await page.locator('#paperQText').inputValue(), 'draft retained');
  await page.locator('#paperClose').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'paperNext');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'paperClose');
  console.log('PASS: unified top navigation, exclusive import dialogs, retained draft and underlying view');
  await page.screenshot({ path: path.join(output, 'paper-desktop.png'), fullPage: true });
  await page.locator('#paperQText').fill('Solve the equation (x-1)/3=2.');
  await page.locator('#paperMText').fill('x-1=6 M1; x=7 A1 oe.');
  await page.locator('#paperNext').click(); await page.locator('#paperNext').click();
  await page.waitForFunction(() => PAPER.extracted && !PAPER.ctl);
  assert.equal(await page.locator('[data-pqid]').inputValue(), '1');
  await page.locator('#paperNext').click();
  await page.waitForFunction(() => S.papers.length === 1 && !PAPER.ctl);
  await page.locator('.paper-answer').waitFor();
  assert((await page.locator('.paper-card').innerText()).includes('解析'));
  await page.locator('.paper-mark-details summary').first().click();
  assert((await page.locator('.paper-card').innerText()).includes('或等价形式'));
  assert.equal(await page.locator('.paper-answer-row').count(),2);
  assert((await page.locator('.paper-score').first().innerText()).includes('M1'));
  assert(await page.locator('.paper-card .exam-hl').count()>0);
  assert.equal(await page.evaluate(() => S.papers[0].answers['1'].knowledge[0].itemId), '');
  assert.equal(await page.locator('#modal').evaluate(e => e.classList.contains('on')), false);
  const cards = await page.evaluate(() => {
    const q = document.querySelector('.paper-question-card').getBoundingClientRect();
    const a = document.querySelector('.paper-explanation').getBoundingClientRect();
    return { left: q.right <= a.left, aligned: Math.abs(q.top-a.top)<2 };
  });
  assert(cards.left && cards.aligned);
  assert.equal(await page.locator('.paper-dots .d.c').count(), 1);
  assert.equal(await page.locator('[data-pmove="-1"]').isDisabled(), true);
  assert.equal(await page.locator('[data-pmove="1"]').isDisabled(), true);
  await page.screenshot({path:path.join(output,'paper-reader-desktop.png'),fullPage:true});
  console.log('PASS: text import, MS decoding, reasoning, invalid links rejected, saved card');

  await page.evaluate(() => {
    S.subs.push({ id: 'math0606', title: 'Additional Mathematics', code: '0606', accent: '#3366CC', sections: [{ id: '1', title: 'Equations' }], items: [{ id: '1.1', section: '1', text: 'Solve linear equations', notes: [] }] }); save(); paperRender();
  });
  await page.locator('#paperRelink').selectOption('math0606');
  await page.locator('details').filter({ hasText: '调整知识点' }).locator('summary').click();
  await page.locator('[data-pmap]').selectOption('1.1');
  await page.locator('[data-plink]').click();
  assert.equal(await page.evaluate(() => V), 'subject');
  assert.equal(await page.evaluate(() => S.cur), 'math0606');
  await page.reload();
  await page.locator('[data-pfolder="math0606"]').click();
  assert.equal(await page.evaluate(() => V), 'home');
  assert.equal(await page.locator('[data-pfolder="math0606"]').getAttribute('aria-expanded'), 'true');
  await page.locator('[data-pfolder="math0606"]').click();
  assert.equal(await page.locator('.paper-folder-items').count(), 0);
  await page.locator('[data-pfolder="math0606"]').click();
  await page.locator('[data-psaved]').click();
  assert.equal(await page.locator('[data-plink]').count(), 1);
  console.log('PASS: syllabus folder, mapping, jump and reload persistence');

  await page.evaluate(()=>{window.testOriginalDL=dl;dl=function(name,data){window.testExport=data;};});
  await page.locator('.paper-saved-row').filter({has:page.locator('[aria-current="page"]')}).locator('summary').click();
  await page.locator('[data-psaveexport]').click();
  const exported=await page.evaluate(()=>{dl=window.testOriginalDL;return window.testExport;});
  fs.writeFileSync(path.join(output,'exam-fixture.json'),JSON.stringify(exported));
  assert(!JSON.stringify(exported).includes('fixture-only'));
  await page.evaluate(o => { S.papers=[]; importData(o); }, exported);
  assert.equal(await page.locator('[data-popen]').count(), 1);
  await page.evaluate(() => { const backup={app:'revstudio-backup',subs:S.subs,prog:S.prog,papers:S.papers}; S.papers=[]; importData(backup); });
  assert.equal(await page.evaluate(() => S.papers.length), 1);
  console.log('PASS: export/import and backup restore omit API key');

  await page.evaluate(()=>showPaper(S.papers[0].id));
  await page.locator('#paperNew').click();
  const previousPaper = await page.evaluate(()=>PAPER.selected);
  await page.locator('#paperClose').click();
  assert.equal(await page.evaluate(()=>PAPER.selected),previousPaper);
  await page.locator('.paper-saved-row').filter({has:page.locator('[aria-current="page"]')}).locator('summary').click();
  await page.locator('[data-psaveexport]').click();
  await page.locator('#paperNew').click();
  await page.evaluate(() => { const c=document.createElement('canvas'); c.width=600;c.height=160; const x=c.getContext('2d'); x.fillStyle='white';x.fillRect(0,0,600,160);x.fillStyle='black';x.font='28px sans-serif';x.fillText('Solve (x - 1) / 3 = 2',30,80); PAPER.testImage=c.toDataURL('image/png'); });
  const imageBuffer=Buffer.from((await page.evaluate(()=>PAPER.testImage)).split(',')[1],'base64');
  await page.locator('#paperQFile').setInputFiles({name:'question.png',mimeType:'image/png',buffer:imageBuffer});
  await page.waitForFunction(()=>!PAPER.reading && PAPER.q.length===1);
  await page.locator('#paperMFile').setInputFiles({name:'markscheme.png',mimeType:'image/png',buffer:imageBuffer});
  await page.waitForFunction(()=>!PAPER.reading && PAPER.m.length===1);
  mode='stop-extract'; failOnce=false; const before=captured.length;
  await page.locator('#paperNext').click(); await page.locator('#paperNext').click();
  await page.waitForFunction(()=>Object.keys(PAPER.cache).length===1);
  await page.locator('#paperStop').click(); await page.waitForFunction(()=>!PAPER.ctl);
  mode='normal'; await page.locator('#paperNext').click();
  await page.waitForFunction(()=>PAPER.extracted&&!PAPER.ctl);
  assert.equal(captured.slice(before).filter(b=>b.messages[1].content[0].text.startsWith('QUESTION')).length,1);
  assert(captured.slice(before).some(b=>b.messages[1].content.some?.(p=>p.type==='image_url'&&p.image_url.url.startsWith('data:image/'))));
  console.log('PASS: image upload, multimodal requests, stopped recognition reuses completed pages');

  await page.evaluate(()=>{ PAPER.questions.push({id:'2',text:'Solve (x-1)/3=2.',pages:[],needsImage:false});paperConfirmRender(); });
  mode='stop-solve'; solved=[];
  await page.locator('#paperNext').click();
  await page.waitForFunction(()=>PAPER.ctl&&S.papers.at(-1).answers['1']);
  await page.locator('#paperStop').click(); await page.waitForFunction(()=>!PAPER.ctl);
  assert.equal(await page.evaluate(()=>Object.keys(S.papers.at(-1).answers).length),1);
  mode='normal'; await page.locator('[data-presume]').click(); await page.waitForFunction(()=>!PAPER.ctl);
  assert.equal(await page.evaluate(()=>Object.keys(S.papers.at(-1).answers).length),2);
  assert.equal(solved.filter(id=>id==='1').length,1);
  await page.locator('[data-pmove="1"]').click();
  assert.equal(await page.evaluate(()=>PAPER.index),1);
  assert((await page.locator('.paper-question-card .ref').innerText()).includes('第 2 题'));
  assert.equal(await page.locator('[data-pmove="1"]').isDisabled(),true);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(()=>PAPER.index),0);
  await page.locator('[data-pindex="1"]').click();
  assert.equal(await page.locator('.paper-dots .d.c').getAttribute('data-pindex'),'1');
  await page.evaluate(()=>{
    const q=document.querySelector('.paper-question-card'),a=document.querySelector('.paper-explanation');
    a.scrollTop=100;window.fixtureScroll=a.scrollTop;paperRender();
    if(document.querySelector('.paper-explanation').scrollTop!==window.fixtureScroll)throw Error('same question scroll reset');
    paperGo(0);if(document.querySelector('.paper-explanation').scrollTop!==0)throw Error('new question not at top');
  });
  console.log('PASS: question cards, next/previous boundaries, keyboard and progress dots');
  console.log('PASS: stop/save/resume skips completed question');

  await page.evaluate(async()=>{
    const question={id:'3',text:'A graph is given. Find the turning point.',pages:[1],needsImage:true};
    const p={id:paperId(),title:'Graph fixture',subjectId:'',date:new Date().toISOString(),questions:[question],marks:[],answers:{},errors:{},glossary:[],focus:'',mode:'single'};
    paperStore(p); PAPER.session=p.id; PAPER.selected=p.id; await paperRun(p,C());
  });
  assert.equal(await page.evaluate(()=>!!S.papers.at(-1).answers['3']),true);
  assert(captured.at(-1).messages[1].content.some(p=>p.type==='image_url'));
  await page.reload();
  await page.evaluate(async()=>{
    const p=S.papers.at(-1); delete p.answers['3']; showPaper(p.id); await paperRun(p,C());
    if(!p.errors['3']?.includes('原图'))throw Error('Lost diagram must not be guessed');
  });
  console.log('PASS: diagram included in solving; missing original on reload never guessed');

  await page.evaluate(async()=>{
    await post([{role:'system',content:PAPER_SOLVE},{role:'user',content:JSON.stringify({question:{id:'1',text:'test'},candidates:[]})}],4500,undefined,{cfg:{kind:'ds',base:'http://fixture.test/v1',model:'deepseek-flash',key:'test',think:true},reasoningCap:true});
  });
  assert.equal(captured.at(-1).max_tokens,4500);assert.deepEqual(captured.at(-1).thinking,{type:'enabled'});
  await page.evaluate(()=>{try{paperCheckCfg({kind:'ds',base:'https://api.deepseek.com',model:'deepseek-v4-pro',key:'test'},true);throw Error('pro allowed');}catch(e){if(e.message==='pro allowed')throw e;} });
  console.log('PASS: official vision guard and bounded thinking request');

  await page.evaluate(()=>openPaperImport());
  await page.evaluate(()=>paperReset());
  await page.locator('#paperQText').fill('Solve (x-1)/3=2.');
  await page.locator('#paperNext').click(); mode='401'; await page.locator('#paperNext').click();
  await page.waitForFunction(()=>!PAPER.ctl&&$('paperStatus').textContent.includes('401'));
  assert.equal(await page.locator('#paperNext').isEnabled(),true);
  mode='normal'; await page.locator('#paperNext').click();await page.waitForFunction(()=>PAPER.extracted&&!PAPER.ctl);
  await page.locator('[data-pqtext]').fill('Solve [unclear]');await page.locator('#paperNext').click();
  assert((await page.locator('#paperStatus').innerText()).includes('[unclear]'));
  await page.locator('[data-pqtext]').fill('Solve (x-1)/3=2.');
  const storageOK=await page.evaluate(()=>{
    const previous=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('quota');};
    const p={id:paperId(),title:'quota fixture',subjectId:'',date:'',questions:[{id:'1',text:'test',pages:[]}],marks:[],answers:{},errors:{},glossary:[],focus:'',mode:'single'};
    const saved=paperStore(p);Storage.prototype.setItem=previous;S.papers=S.papers.filter(x=>x.id!==p.id);save();return saved;
  });assert.equal(storageOK,false);
  console.log('PASS: 401 unlock/retry, unclear formula blocks solving, quota failure detected');

  await page.evaluate(()=>{const p=S.papers[0];showPaper(p.id);openSubject(BUILTIN.id,0);toggle();if(!rev(BUILTIN,BUILTIN.items[0].id))throw Error('old progress failed');goHome();openM();if(!$('modal').classList.contains('on'))throw Error('old wizard failed');closeM();openPaperImport();});
  console.log('PASS: existing CS review/progress and syllabus wizard');

  await page.evaluate(()=>paperReset());
  await page.addScriptTag({url:url+'/pdf.min.js'});
  await page.evaluate(url=>{ pdfjsLib.GlobalWorkerOptions.workerSrc=url+'/pdf.worker.min.js'; },url);
  const qp='C:/Users/EricGuo/Desktop/0606_s26_qp_11.pdf', ms='C:/Users/EricGuo/Desktop/0606_s26_ms_11.pdf';
  if(fs.existsSync(qp)&&fs.existsSync(ms)) {
    await page.locator('#paperQFile').setInputFiles(qp);
    await page.waitForFunction(()=>!PAPER.reading&&PAPER.q.length===1);
    await page.locator('#paperMFile').setInputFiles(ms);
    await page.waitForFunction(()=>!PAPER.reading&&PAPER.m.length===1);
    assert.deepEqual(await page.evaluate(()=>[PAPER.q[0].count,PAPER.m[0].count]),[16,19]);
    const images=await page.evaluate(async()=>[await paperPdfImage(PAPER.q[0].doc,3),await paperPdfImage(PAPER.m[0].doc,9),await paperPdfImage(PAPER.m[0].doc,7)]);
    images.forEach((data,i)=>fs.writeFileSync(path.join(output,['reference-question.jpg','reference-answer.jpg','reference-glossary.jpg'][i]),Buffer.from(data.split(',')[1],'base64')));
    await page.locator('[name="paperMode"][value="full"]').check();
    await page.locator('[data-prange="q:0:start"]').fill('3'); await page.locator('[data-prange="q:0:start"]').dispatchEvent('change');
    await page.locator('[data-prange="q:0:end"]').fill('4'); await page.locator('[data-prange="q:0:end"]').dispatchEvent('change');
    await page.locator('[data-prange="m:0:start"]').fill('9'); await page.locator('[data-prange="m:0:start"]').dispatchEvent('change');
    await page.locator('[data-prange="m:0:end"]').fill('9'); await page.locator('[data-prange="m:0:end"]').dispatchEvent('change');
    await page.locator('#paperNext').click(); await page.locator('#paperNext').click();
    await page.waitForFunction(()=>PAPER.extracted&&!PAPER.ctl);
    console.log('PASS: reference QP 16 pages and MS 19 pages rendered, range/full-paper recognition');
  }
  await page.evaluate(()=>{PAPER.ctl=null;closeM();});
  const multipartId = await page.evaluate(()=>{
    const text='A drone searches for lost animals.\n(a) Give two characteristics of a robot.\n..............................\n(b) The drone uses sensors and a microprocessor.\n(i) Identify a sensor.\n[1]\n(ii) State what a microprocessor is.\n[1]';
    const q={id:'3',text,pages:[1],needsImage:false};
    const split=paperSplitQuestion(q);
    if(JSON.stringify(split.map(q=>q.id))!==JSON.stringify(['3(a)','3(b)(i)','3(b)(ii)']))throw Error('nested split');
    if(split[0].text.includes('....')||split[1].text.includes('microprocessor'))throw Error('question leakage');
    if(!split[1].context.includes('sensors and a microprocessor'))throw Error('lost common context');
    const plain=paperSplitQuestion({id:'1',text:'Solve $f(x)=(a+b)(x+2)$.',pages:[]});if(plain.length!==1)throw Error('math parentheses split');
    const legacy={id:'3',answer:'(a) mechanical structure. (b)(i) proximity sensor. (b)(ii) integrated circuit.',origin:'scheme',steps:[{work:'(a) Robot characteristics.',why:'Use the definition.'}],marking:[],knowledge:[],pitfalls:[]};
    const p={id:paperId(),title:'Drone · subquestion fixture',subjectId:'math0606',date:'2026-10-11',questions:[q],marks:[{id:'3',text:'(a) B1 B1; (b)(i) B1; (b)(ii) B1. M1 A1',pages:[1]}],answers:{'3':paperCleanAnswer(legacy,q,byId('math0606'))},errors:{},glossary:[],focus:'',mode:'single'};
    paperStore(p);showPaper(p.id);
    const pages=paperReaderPages(p);
    if(!pages[1].a.answer.includes('proximity sensor')||pages[1].a.answer.includes('integrated circuit'))throw Error('legacy answer mismatched');
    return p.id;
  });
  assert.equal(await page.locator('.paper-dots .d').count(),3);
  await page.locator('[data-pmove="1"]').click();
  assert((await page.locator('.paper-question').first().innerText()).includes('Identify a sensor'));
  assert((await page.locator('.paper-answer').innerText()).includes('proximity sensor'));
  mode='missing-part';
  await page.locator('[data-prefresh]').click();
  await page.waitForFunction(()=>!PAPER.ctl);
  assert((await page.evaluate(id=>S.papers.find(p=>p.id===id).errors['3'],multipartId)).includes('不完整'));
  mode='normal';
  await page.locator('[data-prefresh]').click();await page.waitForFunction(()=>!PAPER.ctl);
  assert.equal(await page.evaluate(id=>S.papers.find(p=>p.id===id).answers['3'].parts.length,multipartId),3);
  assert((await page.locator('.paper-answer').innerText()).includes('3(b)(i)'));
  assert(!(await page.locator('.paper-answer').innerText()).includes('3(b)(ii)'));
  assert.equal(await page.locator('.paper-links').innerText(),'知识 3(b)(i) · 1.1');
  assert(await page.locator('.paper-answer .exam-hl').count()>0);
  assert.equal(await page.evaluate(id=>cleanPapers([S.papers.find(p=>p.id===id)])[0].answers['3'].parts.length,multipartId),3);
  console.log('PASS: nested subquestions, inherited context, legacy alignment, missing-part rejection, structured answers/highlights round trip');
  await page.evaluate(async id=>{
    const c=document.createElement('canvas');c.width=800;c.height=220;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,220);ctx.fillStyle='black';ctx.font='22px sans-serif';ctx.fillText('3 (a) Robot characteristics. (b) Sensors and microprocessor.',20,100);
    await paperOriginalData(id,{1:c.toDataURL('image/jpeg')});paperRender();
  },multipartId);
  await page.locator('.paper-original-thumbs img').waitFor();
  await page.locator('.paper-original-thumbs button').click();
  assert.equal(await page.locator('#paperOriginalDialog').evaluate(d=>d.open),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#paperOriginalDialog').evaluate(d=>d.open),false);
  await page.waitForTimeout(3200);
  await page.setViewportSize({width:1109,height:790});
  await page.screenshot({path:path.join(output,'paper-subparts-desktop.png'),fullPage:true});
  await page.reload();
  await page.evaluate(id=>showPaper(id),multipartId);
  await page.locator('.paper-original-thumbs img').waitFor();
  await page.evaluate(async id=>{
    const p=S.papers.find(p=>p.id===id),q=p.questions[0];q.needsImage=true;
    await paperRun(p,C(),'3');q.needsImage=false;paperStore(p);
    if(p.errors['3'])throw Error('stored diagram not used: '+p.errors['3']);
  },multipartId);
  assert(captured.at(-1).messages[1].content.some(p=>p.type==='image_url'));
  await page.locator('[data-poriginal="1"]').first().click();
  assert.equal(await page.locator('#paperOriginalBody img').count(),1);
  await page.locator('#paperOriginalClose').click();
  await page.locator('[data-pindex="2"]').click();
  assert((await page.locator('.paper-answer').innerText()).includes('3(b)(ii)'));
  assert.equal(await page.locator('.paper-dots .d').count(),3);
  console.log('PASS: persisted original thumbnail, native image viewer, Escape, reload and subquestion answer isolation');
  // Reopening the rendered document as a file also supports the local original image store.
  const filePage=await context.newPage();
  await filePage.goto('file:///'+path.join(root,'revision-studio.html').replace(/\\/g,'/'));
  assert.equal(await filePage.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=20;c.height=20;
    await paperOriginalData('pfilefixture',{1:c.toDataURL('image/jpeg')});delete PAPER_ORIGINALS.pfilefixture;
    const read=await paperOriginalData('pfilefixture');return !!read[1];
  }),true);
  await filePage.close();
  console.log('PASS: saved original reused for diagram requests after reload and file URL IndexedDB');
  await page.evaluate(()=>{PAPER.step=2;openPaperImport();});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(350);
  await page.locator('#paperBack').click();
  assert.equal(await page.locator('#paperSteps li.cur [data-pstep]').getAttribute('data-pstep'),'1');
  assert.equal(await page.locator('#paperSteps li.done').count(),0);
  await page.evaluate(()=>{$('paperView').scrollTop=0;});
  await page.screenshot({path:path.join(output,'paper-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.evaluate(()=>$('sidebar').getBoundingClientRect().right<=1));
  assert(await page.locator('#paperImport').evaluate(e=>e.getBoundingClientRect().right<=innerWidth));
  assert(await page.locator('.paper-upload-grid').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length===1));
  await page.locator('#paperClose').click();
  await page.evaluate(()=>showPaper(S.papers.find(p=>p.questions.length===2).id));
  await page.screenshot({path:path.join(output,'paper-reader-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.locator('.paper-dots').isVisible());
  await page.locator('[data-pmove="1"]').click();
  assert.equal(await page.evaluate(()=>PAPER.index),1);
  await page.evaluate(()=>{
    const layout=document.querySelector('.paper-review-layout');layout.scrollTop=180;const top=layout.scrollTop;
    paperRender();if(document.querySelector('.paper-review-layout').scrollTop!==top)throw Error('mobile scroll reset');
  });
  await page.locator('#paperDrawer').click(); await page.waitForTimeout(300);
  assert(await page.evaluate(()=>$('sidebar').getBoundingClientRect().left===0));
  await page.locator('#scrim').click({position:{x:380,y:200}});await page.waitForTimeout(300);
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({colorScheme:'dark'});
  await page.screenshot({path:path.join(output,'paper-reader-dark.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS: mobile layout no horizontal overflow');
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(id=>showPaper(id),multipartId);
  await page.locator('.paper-original-thumbs img').waitFor();
  await page.locator('[data-pindex="1"]').click();
  await page.waitForTimeout(350);
  await page.screenshot({path:path.join(output,'paper-subparts-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.evaluate(()=>$('sidebar').getBoundingClientRect().right<=1));
  await page.locator('.paper-original-thumbs button').click();
  assert(await page.locator('#paperOriginalDialog').evaluate(d=>d.getBoundingClientRect().right<=innerWidth));
  await page.locator('#paperOriginalClose').click();
  await page.setViewportSize({width:1114,height:790});
  await page.emulateMedia({colorScheme:'light'});
  const droneId=await page.evaluate(()=>{
    const q={id:'3',text:'A drone searches for lost animals.\n(a) The drone is a robot. Give two characteristics of a robot.\n(b) The drone uses sensors and a microprocessor.\n(i) Identify one sensor that detects when the drone is near an object.\n(ii) State what is meant by a microprocessor.',pages:[1],needsImage:false};
    const legacy={id:'3',answer:'(a) 有机械结构/框架；可编程。 (b)(i) 接近传感器。 (b)(ii) 集成电路，单芯片。',origin:'scheme',steps:[{work:'(a) 从机器人定义出发。 (b)(i) 检测物体。 (b)(ii) CPU 集成在单芯片。',why:'使用定义。'}],knowledge:[]};
    const p={id:paperId(),title:'屏幕截图 2026-10-10 234139',subjectId:BUILTIN.id,date:'2026-10-11',questions:[q],marks:[{id:'3',text:'(a) mechanical structure; programmable. B1 B1\n(b)(i) proximity sensor. B1\n(b)(ii) CPU on a single chip. B1',pages:[1]}],answers:{'3':paperCleanAnswer(legacy,q,BUILTIN)},errors:{},glossary:[],focus:'',mode:'single'};
    paperStore(p);showPaper(p.id);
    const ids=paperReaderPages(p).map(page=>page.a.knowledge[0]?.itemId);
    if(JSON.stringify(ids)!==JSON.stringify(['6.2.2','3.2.3','3.1.1']))throw Error('legacy semantic links '+JSON.stringify(ids));
    const refs=paperSyllabusRefs(q,BUILTIN,'');
    if(refs.length!==BUILTIN.items.length||!refs.every((r,i)=>r.id===BUILTIN.items[i].id&&r.objective===BUILTIN.items[i].text))throw Error('incomplete syllabus catalogue');
    return p.id;
  });
  assert(await page.locator('.paper-card .exam-hl').count()>0);
  assert.equal(await page.locator('.sb-imports .import-plus').count(),2);
  assert.equal(await page.locator('.paper-run-status, .paper-reader-head [data-pexport]').count(),0);
  assert.equal(await page.locator('.paper-question-card .paper-original-marks').count(),0);
  assert.equal(await page.locator('.paper-explanation .paper-original-marks').count(),1);
  assert(await page.evaluate(()=>document.querySelector('.paper-question').compareDocumentPosition(document.querySelector('.paper-original'))&Node.DOCUMENT_POSITION_FOLLOWING));
  mode='chinese-answer';
  await page.locator('[data-prefresh]').click();await page.waitForFunction(()=>!PAPER.ctl);
  assert((await page.locator('.paper-warning').first().innerText()).includes('英文'));
  assert((await page.locator('.paper-answer').innerText()).includes('机械结构'));
  mode='normal';await page.locator('[data-prefresh]').click();await page.waitForFunction(()=>!PAPER.ctl);
  assert(!(await page.locator('.paper-answer').innerText()).match(/[\u4e00-\u9fff]/));
  assert.equal(await page.locator('.paper-reader-head h1').innerText(),'机器人特征与传感器');
  assert.equal(await page.locator('[data-plink]').getAttribute('data-pitem'),'6.2.2');
  assert(await page.locator('.paper-card .exam-hl').count()>0);
  await page.locator('details').filter({hasText:'调整知识点'}).locator('summary').click();
  await page.locator('[data-pmap]').selectOption('');
  await page.waitForFunction(()=>!document.querySelector('[data-plink]'));
  assert.equal(await page.locator('[data-plink]').count(),0);
  await page.reload();await page.evaluate(id=>showPaper(id),droneId);
  assert.equal(await page.locator('[data-plink]').count(),0);
  await page.evaluate(id=>{const p=S.papers.find(p=>p.id===id);p.answers['3'].parts[0].knowledge[0].itemId='6.2.2';paperStore(p);paperRender();},droneId);
  await page.screenshot({path:path.join(output,'paper-refinements-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(350);
  await page.screenshot({path:path.join(output,'paper-refinements-mobile.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.evaluate(()=>$('sidebar').getBoundingClientRect().right<=1));
  await page.setViewportSize({width:1114,height:790});
  await page.evaluate(async id=>{const c=document.createElement('canvas');c.width=20;c.height=20;await paperOriginalData(id,{1:c.toDataURL('image/jpeg')});},droneId);
  await page.locator('.paper-saved-row').filter({has:page.locator('[aria-current="page"]')}).locator('summary').click();
  await page.locator('[data-psavedelete="'+droneId+'"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'paper-record-menu.png'),fullPage:true});
  await page.locator('[data-psavedelete="'+droneId+'"]').click();
  assert.equal(await page.evaluate(id=>S.papers.some(p=>p.id===id),droneId),false);
  assert.equal(await page.evaluate(async id=>Object.keys(await paperOriginalData(id)).length,droneId),0);
  console.log('PASS: English answers, legacy highlights, per-part semantic links, complete syllabus, meaningful title, manual mapping persistence, sidebar delete/images and card placement');
  const mathId=await page.evaluate(()=>{
    const items=Array.from({length:178},(_,i)=>({id:'u'+i,section:'1',text:'Understand functions, domain and range '+i,notes:['Do not send generated notes']}));
    items.push({id:'18.1',section:'1',text:'Integrate reciprocal linear functions and evaluate definite integrals. '+('Full objective wording. '.repeat(25))+'END OF OBJECTIVE',notes:[]},{id:'18.2',section:'1',text:'Use laws of logarithms.',notes:[]});
    const subject={id:'full-math',title:'Additional Mathematics complete fixture',sections:[{id:'1',title:'Calculus'}],items};S.subs.push(subject);
    const q={id:'4',text:String.raw`Given $\int_0^a\frac{1}{3x+2}\,dx=\ln4$, find $a$.`,pages:[],needsImage:false};
    const answer=paperCleanAnswer({id:'4',answer:'$a=42$',steps:[{work:String.raw`\int \frac{1}{3x+2}\,dx = **\frac13\ln(3x+2)**+C`,why:'内函数导数为 3，积分系数需除以 3。'},{work:String.raw`**\frac13\left[\ln(3a+2)-\ln 2\right]**`,why:'根据对数相减法则合并对数。'},{work:String.raw`\frac{3a+2}{2}=64 \Rightarrow 3a+2=128 \Rightarrow a=42`,why:'转为指数等式，解出常数。'}],highlights:[String.raw`\frac13`,'方程','内函数导数','对数相减法则'],knowledge:[{name:'Integration of reciprocal linear functions',itemId:'18.1',why:String.raw`原函数为 $\frac13\ln|3x+2|+C$。`}],pitfalls:['不要漏掉内函数导数带来的系数。']},q,subject);
    const p={id:paperId(),title:'定积分与对数法则',subjectId:subject.id,date:'2026-10-11',questions:[q,{id:'5',text:'A second question.',pages:[],needsImage:false}],marks:[],answers:{'4':answer},errors:{},glossary:[],focus:'',mode:'single'};
    paperStore(p);showPaper(p.id);window.mathRawBefore=JSON.stringify(p.answers);
    if(!paperMathText(String.raw`Use \frac{x}{3} to solve.`).includes(String.raw`$\frac{x}{3}$ to solve`))throw Error('mixed prose formula');
    if(paperMathText(String.raw`$\ln x$ and \ln 4`).includes('$$'))throw Error('double wrapping');
    if(!paperMd(String.raw`code: \`literal\``).includes('code'))throw Error('markdown code');
    if(paperHighlight(String.raw`$\frac{x}{3}$ 内函数导数`,[String.raw`\frac`,'内函数导数']).includes('<mark class="exam-hl">\\'))throw Error('math highlighted');
    return p.id;
  });
  assert.equal(await page.locator('.paper-step .tex').count(),3);
  await page.waitForFunction(()=>!!window.katex?.render,{},{timeout:15000});
  await page.evaluate(()=>typeset($('paperResults')));
  await page.waitForFunction(()=>document.querySelectorAll('.paper-step .tex.ok .katex').length===3);
  assert.equal(await page.locator('.paper-step .katex-error,.paper-step .tex.bad').count(),0);
  assert.equal(await page.locator('.paper-step .tex mark').count(),0);
  assert.deepEqual(await page.locator('.paper-step .exam-hl').allTextContents(),['内函数导数','对数相减法则']);
  assert(await page.evaluate(()=>document.querySelector('.paper-pitfalls').compareDocumentPosition(document.querySelector('.paper-links'))&Node.DOCUMENT_POSITION_FOLLOWING));
  assert.equal(await page.evaluate(id=>JSON.stringify(S.papers.find(p=>p.id===id).answers)===window.mathRawBefore,mathId),true);
  mode='math-display';
  await page.evaluate(async id=>{await paperRun(S.papers.find(p=>p.id===id),C(),'4');},mathId);
  const fullPayload=JSON.parse(captured.at(-1).messages[1].content);
  assert.equal(fullPayload.candidates.length,180);
  assert(fullPayload.candidates[178].objective.endsWith('END OF OBJECTIVE'));
  assert(!JSON.stringify(fullPayload).includes('Do not send generated notes'));
  assert.equal(await page.locator('[data-plink][data-pitem="18.1"]').count(),1);
  const splitter=page.locator('.paper-splitter');
  const splitBox=await splitter.boundingBox();
  const beforeWidth=await page.locator('.paper-question-card').evaluate(e=>e.clientWidth);
  await page.mouse.move(splitBox.x+splitBox.width/2,splitBox.y+splitBox.height/2);await page.mouse.down();await page.mouse.move(splitBox.x+splitBox.width/2+55,splitBox.y+splitBox.height/2,{steps:8});await page.mouse.up();
  assert(await page.locator('.paper-question-card').evaluate(e=>e.clientWidth)>beforeWidth+20);
  const draggedRatio=await page.evaluate(()=>S.paperSplit);assert(draggedRatio>.56);
  await splitter.focus();await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(()=>PAPER.index),0);assert(await page.evaluate(()=>S.paperSplit)<draggedRatio);
  const savedRatio=await page.evaluate(()=>S.paperSplit);
  await page.evaluate(()=>paperGo(1));await page.evaluate(()=>paperGo(0));
  assert.equal(await page.evaluate(()=>S.paperSplit),savedRatio);
  await page.reload();await page.evaluate(id=>showPaper(id),mathId);
  assert.equal(await page.evaluate(()=>S.paperSplit),savedRatio);
  await page.waitForFunction(()=>document.querySelectorAll('.paper-step .tex.ok .katex').length===3);
  await page.screenshot({path:path.join(output,'paper-math-resize-desktop.png'),fullPage:true});
  await page.locator('.paper-splitter').dblclick();assert(Math.abs(await page.evaluate(()=>S.paperSplit)-.56)<.001);
  await page.setViewportSize({width:835,height:790});await page.waitForTimeout(350);
  assert.equal(await page.locator('.paper-splitter').isVisible(),false);
  await page.locator('.paper-explanation').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'paper-math-tablet.png'),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
  assert.equal(await page.locator('.paper-splitter').isVisible(),false);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS: bare/bold TeX repair, real KaTeX rendering, precise prose highlights, complete untruncated 180-objective request, pitfalls order, drag/keyboard/reset/reload and responsive splitter');
  await page.evaluate(()=>{ const r=paperCleanItems([{id:'__proto__',text:'unsafe'}]); if(r.length)throw Error('unsafe ID');const a=paperCleanAnswer({id:'1',answer:'<img src=x onerror=alert(1)>',steps:[{work:'<script>bad</script>',why:'why'}]}, {id:'1'},null);if(md(a.answer).includes('<img'))throw Error('unsafe HTML'); });
  assert.deepEqual(errors,[]);
  console.log('PASS: untrusted IDs/HTML and browser runtime errors');
  await context.close(); server.close();
  for(const p of [profile,path.join(output,'downloads')]){assert(p.startsWith(root+path.sep));fs.rmSync(p,{recursive:true,force:true});}
})().catch(async e=>{ console.error(e);await activeContext?.close();server.close();if(activeProfile){assert(activeProfile.startsWith(output+path.sep+'browser-profile-'));fs.rmSync(activeProfile,{recursive:true,force:true});}process.exit(1); });
