// Pure, exact explanations for the existing 100-point GitRoast heuristic.
// This describes the score; it never awards new points.
const entry=(id,title,earned,max,evidence)=>({id,title,earned,max,evidence});
const fraction=(n,d,max)=>d?Math.round(max*n/d):0;
const thorough=p=>p.hasReadme===true&&p.readmeLength>=350&&
  /install|setup|usage|how to|getting started|run|demo|feature/i.test((p.sections||[]).join(' '));
export const SCORE_POLICY=[
  'Scores measure public portfolio presentation, not coding skill, personal worth or hiring probability.',
  'Stars, followers, account age and programming-language count do not award points.',
  'Repository push dates show visible activity, not code quality or effort.',
  'README evidence is sampled. Unavailable data is not proof that a README is missing.'
];
export function explainScore(data,categories,now=new Date()){
  const {user,repos,projects}=data,n=repos.length;
  const descriptions=repos.filter(r=>(r.description||'').trim().length>=15).length;
  const topics=repos.filter(r=>r.topics?.length).length;
  const demos=repos.filter(r=>/^https?:\/\//i.test(r.homepage||'')).length;
  const age=r=>(now-new Date(r.pushedAt||0))/86400000;
  const within180=repos.filter(r=>age(r)>=0&&age(r)<=180).length;
  const within365=repos.filter(r=>age(r)>=0&&age(r)<=365).length;
  const inspected=projects.filter(p=>p.hasReadme!==null);
  const present=inspected.filter(p=>p.hasReadme===true);
  const substantial=present.filter(thorough);
  const definitions={
    'Profile basics':[
      entry('bio','Profile bio',user.bio?.trim()?10:0,10,user.bio?.trim()?'Public bio is present.':'No public bio found.'),
      entry('name','Display name',user.name?.trim()?5:0,5,user.name?.trim()?'Display name is present.':'No display name found.'),
      entry('website','Profile website',user.blog?.trim()?5:0,5,user.blog?.trim()?'Website link is present.':'No website link found.')
    ],
    'Project clarity':[
      entry('originals','Original projects',n>=3?7:n?3:0,7,n+' original, unarchived public repositories evaluated.'),
      entry('descriptions','Descriptive project summaries',fraction(descriptions,n,12),12,descriptions+' of '+n+' original repos have 15+ character descriptions.'),
      entry('breadth','Portfolio breadth',n>=2?6:n?3:0,6,n+' original public repositories.')
    ],
    Documentation:[
      entry('readme','README availability',fraction(present.length,inspected.length,18),18,present.length+' README files found in '+inspected.length+' checked projects; '+(projects.length-inspected.length)+' unknown.'),
      entry('depth','README depth',fraction(substantial.length,inspected.length,12),12,substantial.length+' sampled READMEs have sufficient length and a setup/usage heading.')
    ],
    'Recent work':[
      entry('recency','Public updates in 180 days',within180?9:0,9,within180+' repos have a recent public push.'),
      entry('maintained','Three updated projects',within365>=3?6:0,6,within365+' original repos have public pushes within 365 days.')
    ],
    Discoverability:[
      entry('topics','Topics',topics>=2?5:topics?2:0,5,topics+' original repositories have discoverability topics.'),
      entry('demos','Demo links',demos?5:0,5,demos+' original repos specify homepage URLs; their availability was not checked.')
    ]
  };
  return categories.map(c=>{
    const signals=definitions[c.name]||[];
    if(signals.reduce((s,r)=>s+r.earned,0)!==c.score||
       signals.reduce((s,r)=>s+r.max,0)!==c.max)
      throw new Error('Scoring rubric mismatch: '+c.name);
    return {name:c.name,score:c.score,max:c.max,signals,
      limitation:c.name==='Documentation'&&!inspected.length?
        'README verification unavailable: zero rubric points does NOT prove missing documentation.':
        'Only public profile metadata and sampled documentation are evaluated.'};
  });
}
