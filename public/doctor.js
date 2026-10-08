'use strict';
// README Doctor: on-demand public Markdown signal checks, not AI or code inspection.
(() => {
  const byId=id=>document.getElementById(id);
  const picker=byId('doctor-repo');
  const checkButton=byId('doctor-check');
  const results=byId('doctor-results');
  const checklist=byId('doctor-checklist');
  const message=byId('doctor-message');
  const reportLink=byId('doctor-repo-link');
  let profile=null;
  let currentResult=null;
  let requestId=0;
  let loading=false;
  const make=(tag,cls='',label='')=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    el.textContent=label;
    return el;
  };
  const notice=(s,level='info')=>{message.textContent=s;message.dataset.state=level;};
  const busy=v=>{loading=v;checkButton.disabled=v||!profile||!profile.projects.length;
    checkButton.textContent=v?'⌕ Checking documentation…':'⌕ Examine README';};
  const reset=()=>{
    ++requestId;
    profile=null;currentResult=null;
    picker.replaceChildren(new Option('Run an audit first',''));
    picker.disabled=true;
    results.hidden=true;
    busy(false);
    notice('Analyze a public GitHub profile to unlock README Doctor.');
  };
  window.addEventListener('gitroast:report',event=>{
    ++requestId;
    const detail=event.detail||{};
    profile={username:detail.username,projects:Array.isArray(detail.projects)?detail.projects:[]};
    results.hidden=true;currentResult=null;
    picker.replaceChildren();
    if(!profile.projects.length){
      picker.append(new Option('No featured repositories to check',''));
      picker.disabled=true;
      notice('No original public repositories were featured. Publish a project to get a README checkup.');
    }else{
      for(const project of profile.projects)picker.append(new Option(project.name,project.name));
      picker.disabled=false;
      const priority=profile.projects.find(p=>p.hasReadme===false)||
        profile.projects.find(p=>p.hasReadme===null || (p.readmeLength||0)<350);
      picker.value=priority?.name||profile.projects[0].name;
      notice('Choose a repository and click Examine README to get practical documentation fixes.');
    }
    busy(false);
  });
  window.addEventListener('gitroast:reset',reset);
  picker.addEventListener('change',()=>{
    ++requestId;currentResult=null;results.hidden=true;busy(false);
    notice('Repository changed. Run a fresh README check for this project.');
  });
  const styles={found:['✓','FOUND'],improve:['!','NEEDS DETAIL'],missing:['×','NOT DETECTED'],unknown:['?','NOT CHECKED']};
  function render(data){
    currentResult=data;
    results.hidden=false;
    byId('doctor-score').textContent=String(data.signalsFound);
    byId('doctor-meter').setAttribute('aria-valuenow',String(data.signalsFound));
    byId('doctor-meter-fill').style.width=Math.round((data.signalsFound/data.signalsTotal)*100)+'%';
    byId('doctor-state').dataset.state=data.status;
    byId('doctor-state').textContent=data.status==='missing'?'NO PUBLIC README':
      data.status==='unavailable'?'README UNAVAILABLE':'README INSPECTED';
    byId('doctor-subtitle').textContent=data.status==='found'?
      'Public README signals':'Documentation needs attention';
    byId('doctor-limitation').textContent=data.limitation+
      (data.truncated?' The README was long, so only its first 50 KB was checked.':'');
    checklist.replaceChildren();
    for(const item of data.checks){
      const row=make('div','doctor-item');
      row.dataset.state=item.state;
      const mark=make('span','doctor-item-mark',styles[item.state]?.[0]||'?');
      mark.setAttribute('aria-hidden','true');
      const content=make('div','doctor-item-text');
      const name=make('strong','',item.title);
      const details=make('p','',item.evidence);
      const fix=make('p','doctor-item-fix',item.fix);
      const tag=make('span','doctor-item-tag',styles[item.state]?.[1]||'UNKNOWN');
      content.append(name,details,fix);
      row.append(mark,content,tag);
      checklist.append(row);
    }
    byId('doctor-next').textContent=data.nextFix;
    const link=data.repositoryUrl||'';
    if(/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/?$/.test(link)){
      reportLink.href=link;reportLink.hidden=false;
    }else reportLink.hidden=true;
    notice(data.status==='found'?'Documentation check complete.':
      data.status==='missing'?'No public README was found. Use the first fix below to start one.':
      'GitHub could not provide README text. The checks are marked unknown.',data.status==='found'?'success':'info');
  }
  checkButton.addEventListener('click',async()=>{
    if(!profile||loading||picker.disabled)return;
    const username=profile.username,repo=picker.value,sequence=++requestId;
    currentResult=null;results.hidden=true;busy(true);
    notice('Fetching and reviewing the selected public README…');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const query=new URLSearchParams({username,repo});
      const response=await fetch('/api/readme-doctor?'+query.toString(),{signal:controller.signal});
      const body=await response.json();
      if(sequence!==requestId)return;
      if(!response.ok)throw new Error(body.error||'Could not inspect README.');
      if(!Array.isArray(body.checks)||body.checks.length!==7)throw new Error('Unexpected README check response.');
      render(body);
      results.scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(error){
      if(sequence===requestId)notice(error.name==='AbortError'?'README check timed out. Try again.':
        error.message||'Could not inspect the README.','error');
    }finally{
      clearTimeout(timer);
      if(sequence===requestId)busy(false);
    }
  });
  byId('doctor-copy').addEventListener('click',async()=>{
    if(!currentResult)return;
    const lines=[
      'GitRoast AI — README Doctor',
      'Repository: '+currentResult.repositoryUrl,
      'Signals: '+currentResult.signalsFound+' / '+currentResult.signalsTotal,
      '',
      ...currentResult.checks.map(c=>'['+c.state.toUpperCase()+'] '+c.title+
        '\nObserved: '+c.evidence+'\nSuggestion: '+c.fix),
      '',
      'First fix: '+currentResult.nextFix,
      currentResult.limitation
    ];
    try{await navigator.clipboard.writeText(lines.join('\n'));
      notice('README improvement plan copied.','success');}
    catch{notice('Clipboard unavailable. You can select the findings manually.','error');}
  });
  byId('doctor-fixit-link').addEventListener('click',event=>{
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('gitroast:workshop-tool',{detail:{tool:'write'}}));
    if(!profile)return;
    const target=byId('fixit-repo');
    if(!target||target.disabled)return;
    target.value=picker.value;
    target.dispatchEvent(new Event('change'));
  });
  reset();
})();
