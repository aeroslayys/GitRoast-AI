'use strict';
// Optional public file-path inspection. Independent of the portfolio health score.
(()=>{
  const el=id=>document.getElementById(id);
  const node=(tag,cls='',text='')=>{const item=document.createElement(tag);if(cls)item.className=cls;
    item.textContent=text;return item;};
  const button=el('evidence-inspect'),status=el('evidence-status'),results=el('evidence-results');
  const rolePicker=el('evidence-role'),roles=el('evidence-role-result');
  let username='',sequence=0,controller=null,active=null;
  const allowed=url=>/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/?$/.test(url);
  const stop=()=>{sequence++;controller?.abort();controller=null;button.disabled=!username||el('workshop-repo').disabled;};
  const clear=()=>{stop();active=null;results.hidden=true;rolePicker.replaceChildren(new Option('Choose a target role',''));
    roles.replaceChildren();status.textContent=username?'Select a featured repository, then inspect its public file paths.':'Run an audit to enable file-path inspection.';};
  const link=(username,repo,text)=>{
    const a=node('a','evidence-source',text);
    const url='https://github.com/'+username+'/'+repo;
    if(!allowed(url))return node('span','',text);
    a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
  };
  function renderRoles(){
    roles.replaceChildren();
    if(!active)return;
    const selected=active.roles.find(item=>item.id===rolePicker.value);
    if(!selected)return;
    const summary=node('p','evidence-role-summary',
      'File-path alignment: '+(selected.score===null?'not assessable':selected.score+'/100')+
      ' · Coverage: '+selected.coverage+'% · Confidence: '+selected.confidence+
      '. This is not a hiring prediction.');
    roles.append(summary);
    const list=node('ul','evidence-criteria');
    for(const c of selected.criteria){
      const row=node('li','',c.label+' ('+c.weight+' pts): '+c.status.replace('_',' '));
      if(c.paths.length)row.append(node('small','',' · '+c.paths.join(', ')));
      list.append(row);
    }
    roles.append(list);
  }
  function render(body){
    active=body;results.hidden=false;
    const container=el('evidence-findings');container.replaceChildren();
    el('evidence-summary').textContent='Checked '+body.scannedPaths+' public file paths in '+body.repository+
      (body.truncated?' (partial listing; missing signals are unknown).':'.');
    for(const signal of body.findings){
      const row=node('li','evidence-finding');
      const copy=node('div');
      copy.append(node('strong','',signal.label),node('small','',signal.status.replace('_',' ')+' · '+signal.confidence+' confidence'));
      if(signal.paths.length)copy.append(node('p','',signal.paths.join(' · ')));
      row.append(copy,link(username,body.repository,'↗ Repository'));container.append(row);
    }
    rolePicker.replaceChildren(new Option('Choose a target role',''));
    for(const role of body.roles)rolePicker.append(new Option(role.label,role.id));
    rolePicker.value='';roles.replaceChildren();
    el('evidence-limitation').textContent=body.limitation;
  }
  window.addEventListener('gitroast:report',ev=>{
    username=ev.detail?.username||'';clear();
  });
  window.addEventListener('gitroast:reset',()=>{username='';clear();});
  el('workshop-repo').addEventListener('change',clear);
  rolePicker.addEventListener('change',renderRoles);
  button.addEventListener('click',async()=>{
    const repo=el('workshop-repo').value;
    if(!username||!repo||button.disabled)return;
    stop();const request=sequence;controller=new AbortController();button.disabled=true;
    status.textContent='Reading public file paths from GitHub…';results.hidden=true;
    const timeout=setTimeout(()=>controller?.abort(),16000);
    try{
      const query=new URLSearchParams({username,repo});
      const response=await fetch('/api/repo-evidence?'+query,{signal:controller.signal});
      const body=await response.json();
      if(request!==sequence)return;
      if(!response.ok)throw new Error(body.error||'Unable to inspect public paths.');
      if(!Array.isArray(body.findings)||!Array.isArray(body.roles))throw new Error('Malformed evidence response.');
      render(body);
      status.textContent='Inspection complete. Select a target role to see file-path alignment.';
    }catch(error){
      if(request!==sequence)return;
      status.textContent=error.name==='AbortError'?'Inspection timed out; retry later.':error.message;
    }finally{
      clearTimeout(timeout);
      if(request===sequence){controller=null;button.disabled=!username||el('workshop-repo').disabled;}
    }
  });
  clear();
})();
