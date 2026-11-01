import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const cache=new Map(),remote=new Map();
let failSave=false,failLoad=false;
const uploads=[],removed=[];
globalThis.window={localStorage:{getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value)},dispatchEvent:()=>{}};
const supabase={rpc:async(name,args)=>{
  const key=args.p_branch+'|'+args.p_scope;
  if(name==='get_branch_local_storage_record') return {data:remote.get(key)??null,error:failLoad?{message:'Load failed'}:null};
  assert.equal(name,'upsert_branch_local_storage_record');
  if(failSave)return {error:{message:'Save failed'}};
  remote.set(key,args.p_payload);return {error:null};
},storage:{from:()=>({upload:async(path)=>{uploads.push(path);return {error:null}},remove:async paths=>{removed.push(...paths);return {error:null}},createSignedUrl:async path=>({data:{signedUrl:'https://files.example/'+path},error:null})})}};
function load(file,imports={}){
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};new Function('exports','require',code)(exports,name=>imports[name]??{});return exports;
}
const admission=load('../src/services/admission.ts',{'../lib/supabase':{supabase}});
const api=load('../src/services/adminStorage.ts',{
 '../lib/supabase':{supabase},'./admission':admission,
 './branchDirectory':{findRegisteredBranch:()=>undefined},
 './legacyMockData':load('../src/services/legacyMockData.ts'),
 '../utils/textFormatting':load('../src/utils/textFormatting.ts'),
});
const base={id:'GMA-123456',branch:'GMA',name:'Imported Student',program:'SHS',yearLevel:'Grade 11',status:'Incomplete',studentStatus:'Existing Student',importAcademicYear:'2026-2027',importSemester:'1st Semester',lastSchoolAttended:'Previous School',yearCompletion:'2024',contact:'',email:'sample@example.com',address:''};
cache.set('aics-students',JSON.stringify([base,{...base,id:'GMA-123457',name:'College Student',email:'college@example.com',program:'College',yearLevel:'2nd Year'}]));
const snapshot=()=>api.getStudentRequirementSnapshot({branch:'GMA',studentNumber:base.id});
assert.equal(snapshot().summary.total,4);assert.equal(snapshot().summary.submitted,0);
assert.equal(snapshot().applicantRecord.personalInfo.lastSchoolAttended,'Previous School');
assert.equal(snapshot().applicantRecord.personalInfo.yearCompletion,'2024');
assert.equal(api.getStudentRequirementSnapshot({branch:'GMA',studentNumber:'GMA-123457'}).pendingRequirements.some(item=>item.code==='diploma_certificate_of_graduation'),true);
assert.equal(api.getStudentRequirementSnapshot({branch:'Taytay',studentNumber:base.id}),null);
// A cached admission record must not hide an imported student's checklist or files.
api.writeBranchScopedData('enrollees','GMA',[{...snapshot().applicantRecord,trackingNumber:'LINKED-IMPORT',studentStatus:'Existing Student',attachments:[],documentsSubmitted:0}],{skipSupabaseSync:true});
assert.equal(snapshot().summary.total,4);
assert.equal(snapshot().applicantRecord.trackingNumber,'');
assert.equal(api.isImportedStudent({studentStatus:' existing student '}),true);
assert.equal(api.isImportedStudent({studentStatus:'Senior High Graduate'}),false);
// Regular students must still use their linked admission requirements and files.
const regularRecord={...snapshot().applicantRecord,studentNumber:'GMA-REGULAR',trackingNumber:'REGULAR-ADMISSION',studentStatus:'Transferee'};
api.writeBranchScopedData('enrollees','GMA',[...api.readBranchScopedData('enrollees','GMA'),regularRecord],{skipSupabaseSync:true});
const regularSnapshot=api.getStudentRequirementSnapshot({branch:'GMA',studentNumber:'GMA-REGULAR',trackingNumber:'REGULAR-ADMISSION'});
assert.equal(regularSnapshot.applicantRecord.trackingNumber,'REGULAR-ADMISSION');
assert.equal(regularSnapshot.summary.total,admission.getAdmissionRequirements('Transferee','Senior High School','No Honor').length);
const file={name:'PSA.pdf',type:'application/pdf'};
await api.uploadImportedStudentCredential({branch:'GMA',studentNumber:base.id,requirementCode:'birth_certificate_psa',file});
assert.equal(snapshot().summary.approved,1);assert.equal(snapshot().summary.pending,3);
assert.equal(api.getStudentCredentialOverview({branch:'GMA',studentNumber:base.id}).items.find(item=>item.code==='birth_certificate_psa').statusLabel,'Approved');
// A fresh browser must recover files from the database, not a signed-URL cache.
for(const key of cache.keys())if(key.includes('imported-student-credential'))cache.delete(key);
assert.equal(snapshot().summary.submitted,0);
await api.fetchImportedStudentCredentials('GMA',base.id);
assert.equal(snapshot().summary.approved,1);
await api.removeImportedStudentCredential('GMA',base.id,'birth_certificate_psa');
await api.fetchImportedStudentCredentials('GMA',base.id);
assert.equal(snapshot().summary.submitted,0);
await assert.rejects(api.uploadImportedStudentCredential({branch:'GMA',studentNumber:base.id,requirementCode:'invalid',file}),/not required/);
failSave=true;
await assert.rejects(api.uploadImportedStudentCredential({branch:'GMA',studentNumber:base.id,requirementCode:'birth_certificate_psa',file}),/Save failed/);
assert.equal(snapshot().summary.submitted,0);assert.equal(removed.length,1);
failLoad=true;await assert.rejects(api.fetchImportedStudentCredentials('GMA',base.id),/Load failed/);
console.log('Imported credential checks passed: SHS/College checklists, school-history display data, branch/student isolation, upload, fresh-browser reload, portal status, removal, and save/load failures.');
