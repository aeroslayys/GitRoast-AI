'use strict';
// Three report stages, with one visible project picker for both improvement tools.
(() => {
  const el=id=>document.getElementById(id);
  const stages=['review','improve','track'],tools=['check','write'];
  const picker=el('workshop-repo');
  let username=null;
  function stage(name){
    if(!stages.includes(name))return;
    for(const id of stages){
      const active=id===name;
      el('audit-'+id).hidden=!active;
      el('audit-tab-'+id).setAttribute('aria-selected',String(active));
      el('audit-tab-'+id).tabIndex=active?0:-1;
    }
  }
  function tool(name){
    if(!tools.includes(name)||(name==='check'&&picker.disabled))return;
    for(const id of tools){
      const active=id===name;
      el('workshop-tab-'+id).setAttribute('aria-selected',String(active));
      el('workshop-tab-'+id).tabIndex=active?0:-1;
    }
    el('readme-doctor').hidden=name!=='check';
    el('fixit-studio').hidden=name!=='write';
  }
  function sync(){
    if(picker.disabled)return;
    for(const id of ['doctor-repo','fixit-repo']){
      const select=el(id);
      if(select.disabled||select.value===picker.value)continue;
      select.value=picker.value;
      select.dispatchEvent(new Event('change'));
    }
  }
  window.addEventListener('gitroast:report',event=>{
    const detail=event.detail||{},projects=Array.isArray(detail.projects)?detail.projects:[];
    username=detail.username;
    picker.replaceChildren();
    for(const project of projects)picker.append(new Option(project.name,project.name));
    if(!projects.length){
      picker.append(new Option('No public repositories yet',''));
      picker.disabled=true;
      el('workshop-tab-check').disabled=true;
      tool('write');
    }else{
      picker.disabled=false;
      el('workshop-tab-check').disabled=false;
      const selected=projects.find(p=>p.hasReadme===false||!p.description?.trim())||projects[0];
      picker.value=selected.name;
      sync();
      tool('check');
    }
    stage('review');
  });
  window.addEventListener('gitroast:reset',()=>{
    username=null;
    picker.replaceChildren(new Option('Run an audit first',''));
    picker.disabled=true;
    el('workshop-tab-check').disabled=true;
    tool('write');
    stage('review');
  });
  picker.addEventListener('change',sync);
  for(const id of stages)el('audit-tab-'+id).addEventListener('click',()=>stage(id));
  for(const id of tools)el('workshop-tab-'+id).addEventListener('click',()=>tool(id));
  for(const [list,prefix,activate] of [[stages,'audit-tab-',stage],[tools,'workshop-tab-',tool]]){
    list.forEach((id,i)=>{
      el(prefix+id).addEventListener('keydown',e=>{
        const n=e.key==='ArrowRight'?(i+1)%list.length:e.key==='ArrowLeft'?
          (i+list.length-1)%list.length:e.key==='Home'?0:e.key==='End'?list.length-1:-1;
        if(n<0)return;
        e.preventDefault();
        if(!el(prefix+list[n]).disabled){activate(list[n]);el(prefix+list[n]).focus();}
      });
    });
  }
  window.addEventListener('gitroast:workshop-tool',event=>{
    stage('improve');
    tool(event.detail?.tool||'write');
    el('improve-workspace').scrollIntoView({behavior:'smooth',block:'start'});
  });
  window.addEventListener('hashchange',()=>{
    if(!username)return;
    if(window.location.hash==='#progress-tracker')stage('track');
    else if(['#readme-doctor','#fixit-studio','#improve-workspace'].includes(window.location.hash)){
      stage('improve');
      if(window.location.hash==='#fixit-studio')tool('write');
    }
  });
  stage('review');
  tool('write');
})();
