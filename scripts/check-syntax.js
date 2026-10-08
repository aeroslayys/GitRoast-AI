// Zero-dependency source syntax verification.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const ignored=new Set(['.git','node_modules','test-results','coverage','dist','.playwright']);
const files=[];
function visit(path){
  for(const item of readdirSync(path,{withFileTypes:true})){
    if(item.isDirectory()){
      if(!ignored.has(item.name))visit(join(path,item.name));
    }else if(item.isFile()&&/\.(?:[cm]?js)$/.test(item.name)){
      files.push(join(path,item.name));
    }
  }
}
visit(root);
files.sort();
for(const path of files){
  try{execFileSync(process.execPath,['--check',path],{stdio:'pipe'});}
  catch(error){
    process.stderr.write('Syntax error in '+path+'\n'+String(error.stderr||error.message));
    process.exitCode=1;
  }
}
if(process.exitCode)process.exit(process.exitCode);
console.log('Syntax verified for '+files.length+' JavaScript source and test files.');
