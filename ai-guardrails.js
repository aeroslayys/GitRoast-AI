// Validate Gemini response structure and reject common unsupported claims.
// Validation is a safety net, not proof every statement is factual.
const limits={headline:65,verdict:250,roast:170,kind:170,nextStep:170};
const unsupported=[
  /\b(?:guaranteed|certain|definitely)\s+(?:to\s+)?(?:get\s+)?hired\b/i,
  /\b(?:will|should|must)\s+(?:get\s+)?(?:be\s+)?hired\b/i,
  /\b(?:not hireable|unemployable|weak developer|bad programmer|poor coder)\b/i,
  /\b(?:i|we)\s+(?:ran|executed|tested|compiled|reviewed)\s+(?:your\s+)?(?:code|repository code|tests|application)\b/i,
  /\b(?:verified|proven)\s+(?:code quality|technical skill|security|employment|identity)\b/i,
  /\b(?:you are|you're)\s+(?:lazy|stupid|incompetent|talentless)\b/i
];
export function validateFeedback(output){
  if(!output||typeof output!=='object'||Array.isArray(output))return false;
  for(const [key,max] of Object.entries(limits)){
    const text=output[key];
    if(typeof text!=='string'||!text.trim()||text.length>max||
       /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)||
       unsupported.some(rule=>rule.test(text)))return false;
  }
  return true;
}
