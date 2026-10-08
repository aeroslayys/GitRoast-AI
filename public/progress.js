'use strict';
// Progress Tracker stores an explicit baseline in localStorage and refreshes score-only GitHub data.
// This is not a hiring score, code audit, or shared cloud profile history.
(() => {
  const el=id=>document.getElementById(id);
  const save=el('progress-save'),recheck=el('progress-refresh'),clear=el('progress-clear');
  const results=el('progress-results'),comparison=el('progress-comparison');
  const empty=el('progress-empty'),message=el('progress-message');
  const categories=el('progress-category-list'),facts=el('progress-facts');
  const BASE='gitroast-progress-v1-';
  const FACTS=[
    ['originalRepos','Original repositories'],['described','Repos with helpful descriptions'],
    ['tagged','Repos with topics'],['demos','Repos with demos'],
    ['readmes','Sampled READMEs found'],['thoroughReadmes','Detailed sampled READMEs'],
    ['recent365','Recently active repositories']
  ];
  let current=null,baseline=null,latest=null,busy=false,sequence=0;
  const node=(tag,cls,text)=>{
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(text!==undefined)e.textContent=String(text);
    return e;
  };
  const validScore=n=>Number.isInteger(n)&&n>=0&&n<=100;
  const stamp=v=>{
    const d=new Date(v);
    return Number.isFinite(d.getTime()) ? d.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'Unknown date';
  };
  const signed=n=>n>0?'+'+n:String(n);
  const record=data=>{
    if(!data || !validScore(data.analysis?.score) || !Array.isArray(data.analysis?.categories))return null;
    const rows=data.analysis.categories.map(c=>({
      name:String(c.name).slice(0,60),score:Number(c.score),max:Number(c.max)
    })).filter(c=>Number.isInteger(c.score)&&Number.isInteger(c.max)&&c.max>0&&c.score>=0&&c.score<=c.max);
    if(rows.length!==5)return null;
    const values=Object.fromEntries(FACTS.map(([id])=>[
      id, Math.max(0,Math.min(100000,Math.trunc(Number(data.analysis?.facts?.[id])||0)))
    ]));
    return {version:1,score:data.analysis.score,categories:rows,
      facts:values,auditedAt:String(data.analyzedAt||new Date().toISOString()),
      capturedAt:new Date().toISOString()};
  };
  const safeRecord=d=>{
    if(!d || d.version!==1 || !validScore(d.score) || !Array.isArray(d.categories)||d.categories.length!==5)return null;
    if(!d.categories.every(c=>typeof c.name==='string'&&validScore(c.score)&&
      Number.isInteger(c.max)&&c.max>0&&c.score<=c.max))return null;
    return d;
  };
  const storageKey=()=>BASE+current.username.toLowerCase();
  const load=()=>{
    try{
      const payload=JSON.parse(localStorage.getItem(storageKey())||'null');
      if(payload?.version!==1)return {};
      return {baseline:safeRecord(payload.baseline),latest:safeRecord(payload.latest)};
    }catch{return {};}
  };
  const persist=()=>{
    try {
      localStorage.setItem(storageKey(),JSON.stringify({version:1,baseline,latest}));
      return true;
    }catch{return false;}
  };
  const notice=(str,state='info')=>{
    message.textContent=str;
    message.dataset.state=state;
  };
  const buttonState=()=>{
    save.disabled=!current||busy;
    recheck.disabled=!current||!baseline||busy;
    clear.disabled=!current||!baseline||busy;
    save.textContent=baseline?'◈ Replace baseline':'◈ Save today’s baseline';
    recheck.textContent=busy?'↻ Checking public GitHub…':'↻ Recheck GitHub now';
  };
  const row=(title,left,right,delta=Number(right)-Number(left))=>{
    const box=node('div','progress-category-row');
    const label=node('span','progress-category-name',title);
    const before=node('span','progress-category-before',String(left));
    const arrow=node('span','progress-category-arrow','→');
    const after=node('span','progress-category-after',String(right));
    const change=node('strong','progress-category-change',signed(delta));
    change.dataset.trend=delta>0?'up':delta<0?'down':'neutral';
    box.append(label,before,arrow,after,change);
    return box;
  };
  function paint(){
    buttonState();
    if(!baseline){
      results.hidden=true;
      return;
    }
    results.hidden=false;
    el('progress-before-score').textContent=baseline.score+' / 100';
    el('progress-before-date').textContent=stamp(baseline.auditedAt);
    if(!latest){
      el('progress-after-score').textContent='— / 100';
      el('progress-after-date').textContent='Not rechecked yet';
      el('progress-delta').textContent='—';
      el('progress-delta').dataset.trend='neutral';
      empty.hidden=false;comparison.hidden=true;
      return;
    }
    empty.hidden=true;comparison.hidden=false;
    el('progress-after-score').textContent=latest.score+' / 100';
    el('progress-after-date').textContent=stamp(latest.auditedAt);
    const change=latest.score-baseline.score;
    el('progress-delta').textContent=signed(change)+' pts';
    el('progress-delta').dataset.trend=change>0?'up':change<0?'down':'neutral';
    categories.replaceChildren();
    const map=new Map(latest.categories.map(c=>[c.name,c]));
    for(const item of baseline.categories){
      const next=map.get(item.name);
      if(!next || next.max!==item.max)continue;
      categories.append(row(item.name,item.score+'/'+item.max,next.score+'/'+next.max,
        next.score-item.score));
    }
    facts.replaceChildren();
    for(const [key,label] of FACTS){
      facts.append(row(label,baseline.facts[key]||0,latest.facts[key]||0));
    }
    el('progress-disclaimer').textContent='A presentation heuristic, not a hiring prediction. Public data and up to eight sampled READMEs; GitHub API visibility and scoring rules can affect comparisons.';
  }
  function activate(detail){
    sequence++;
    // Invalidates an in-flight recheck when the user audits a different profile.
    busy=false;
    const username=detail?.username;
    if(typeof username!=='string'||!/^[a-zA-Z0-9-]{1,39}$/.test(username))return reset();
    current={username,initial:record(detail)};
    const previous=load();
    baseline=previous.baseline||null;
    latest=previous.latest||null;
    results.hidden=!baseline;
    paint();
    notice(baseline?'Saved baseline found for @'+username+'. Recheck after making GitHub changes.':
      'Save this audit as your starting point, then update GitHub and recheck.');
  }
  function reset(){
    sequence++;
    current=null;baseline=null;latest=null;busy=false;
    results.hidden=true;buttonState();
    notice('Run a profile audit to unlock progress tracking.');
  }
  window.addEventListener('gitroast:report',event=>activate(event.detail));
  window.addEventListener('gitroast:reset',reset);
  save.addEventListener('click',()=>{
    if(!current||busy||!current.initial)return;
    if(baseline && !window.confirm('Replace your saved baseline for @'+current.username+'? This resets the existing comparison.'))return;
    baseline={...current.initial,capturedAt:new Date().toISOString()};
    latest=null;
    const saved=persist();
    paint();
    notice(saved?'Baseline saved for @'+current.username+'. Update GitHub, then recheck.':
      'Storage is unavailable. Baseline is kept only until this page is closed.',saved?'success':'warning');
  });
  recheck.addEventListener('click',async()=>{
    if(!current||!baseline||busy)return;
    const username=current.username,id=++sequence;
    busy=true;buttonState();
    notice('Requesting a fresh public-profile score from GitHub (without Gemini)…');
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),45000);
    try {
      const response=await fetch('/api/progress?username='+encodeURIComponent(username),
        {signal:controller.signal,cache:'no-store'});
      const payload=await response.json();
      if(id!==sequence)return;
      if(!response.ok)throw new Error(payload.error||'Could not recheck GitHub.');
      if(payload.username?.toLowerCase()!==username.toLowerCase()||payload.scoreVersion!==1)
        throw new Error('Could not verify the refreshed profile.');
      const snapshot=record(payload);
      if(!snapshot)throw new Error('Invalid fresh-score data. Please retry.');
      latest=snapshot;
      const stored=persist();
      paint();
      notice('Fresh GitHub profile rechecked. '+(latest.score-baseline.score>=0?'+':'')+
        (latest.score-baseline.score)+' points from your baseline.'+
        (stored?'':' This comparison could not be saved in browser storage.'),'success');
    }catch(error){
      if(id===sequence)notice(error.name==='AbortError'?'Progress recheck timed out. Please retry.':
        error.message||'Could not recheck GitHub.','error');
    }finally{
      clearTimeout(timeout);
      if(id===sequence){busy=false;buttonState();}
    }
  });
  clear.addEventListener('click',()=>{
    if(!current||!baseline||busy)return;
    if(!window.confirm('Clear saved baseline and rechecks for @'+current.username+' on this browser?'))return;
    try{localStorage.removeItem(storageKey());}catch{}
    baseline=null;latest=null;paint();
    notice('Saved progress cleared for this username. Other profiles are unchanged.','success');
  });
  el('progress-copy').addEventListener('click',async()=>{
    if(!baseline)return;
    const changes=latest?baseline.categories.map(b=>{
      const a=latest.categories.find(c=>c.name===b.name);
      return '- '+b.name+': '+b.score+'/'+b.max+' → '+(a?.score??'?')+'/'+b.max+
        ' ('+signed((a?.score??b.score)-b.score)+')';
    }):[];
    const content=[
      'GitRoast AI — Before & After',
      'GitHub: https://github.com/'+current.username,
      'Baseline: '+stamp(baseline.auditedAt)+' — '+baseline.score+'/100',
      'Latest: '+(latest?stamp(latest.auditedAt)+' — '+latest.score+'/100':'No recheck yet'),
      ...(latest?['Change: '+signed(latest.score-baseline.score)+' points','',...changes]:[]),
      '', 'Public-profile presentation only; not a hiring prediction.'
    ].join('\n');
    try{await navigator.clipboard.writeText(content);notice('Progress comparison copied.','success');}
    catch{notice('Clipboard unavailable. You can select the metrics manually.','error');}
  });
  reset();
})();
