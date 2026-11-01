import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the real portal row builder, including the selection between final
// and interim grades, without mounting the surrounding student context.
const source=readFileSync(new URL('../src/pages/student/StudentGrades.tsx',import.meta.url),'utf8');
const file=ts.createSourceFile('StudentGrades.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const needed=new Set(['placeholderGrade','shsQuarterOrder','getShsQuarterLabelsForSemester','getShsQuarterValueForLabel','parseGradeNumber','getShsSemesterFinalGrade','buildShsRows','buildSubjectKey','buildSubjectCodeKey','createBaseRow','sortDisplayRows','getCollegeDisplayedGradePriority','isCollegeFinalLikeRecord','getCollegeFinalRecordPriority','buildCollegeRows']);
const declarations=file.statements.filter(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>ts.isIdentifier(declaration.name)&&needed.has(declaration.name.text))).map(node=>node.getText(file)).join('\n');
const code=ts.transpileModule(declarations+'\nmodule.exports={buildCollegeRows,buildShsRows};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};Function('module','getRequiredShsQuarterLabelsForSemester',code)(module,semester=>semester==='1st Semester'?['1st Quarter','2nd Quarter']:['3rd Quarter','4th Quarter']);const {buildCollegeRows,buildShsRows}=module.exports;
const record={id:'historical-grade',studentId:'LEGACY-2022-A',subjectCode:'ENT1',subjectTitle:'Entrepreneurial Behavior',units:3,gradingPeriod:'1st Semester',semester:'1st Semester',academicYear:'2023-2024',programType:'College',grade:'78',normalizedGrade:'2.50',numericGrade:2.5,evaluation:'Passed',source:'historical',instructorName:'Original Instructor'};
let rows=buildCollegeRows([], [record]);
assert.equal(rows[0].instructor,'Original Instructor','A historical grade without a scheduled assignment must retain its original instructor');
assert.equal(rows[0].grade,'2.50');assert.equal(rows[0].remarks,'Passed');
const subject={id:'scheduled',code:'ENT1',title:'Entrepreneurial Behavior',units:3,professor:'Current Instructor'};
assert.equal(buildCollegeRows([subject],[record])[0].instructor,'Original Instructor','Saved grade attribution takes precedence over a current teaching assignment');
assert.equal(buildCollegeRows([subject],[{...record,instructorName:undefined}])[0].instructor,'Current Instructor');
assert.equal(buildCollegeRows([],[{...record,instructorName:undefined}])[0].instructor,'TBA');
assert.equal(buildCollegeRows([],[{...record,instructorName:'  '}])[0].instructor,'TBA');
assert.equal(buildCollegeRows([subject],[])[0].instructor,'Current Instructor');
const midterm={...record,id:'midterm',gradingPeriod:'Midterm',normalizedGrade:'1.00',instructorName:'Midterm Instructor'};
for(const records of [[midterm,record],[record,midterm]]) {
 rows=buildCollegeRows([],records);assert.equal(rows[0].grade,'2.50');assert.equal(rows[0].instructor,'Original Instructor','Instructor must follow the grade selected for display');
}
const differentTitle={...record,subjectTitle:'Previous Curriculum Title'};
assert.equal(buildCollegeRows([subject],[differentTitle])[0].instructor,'Original Instructor','Code-only subject matching must preserve attribution');
console.log('Portal instructor checks passed: historical grades without assignments, saved-name priority, schedule/TBA fallbacks, code matching, and displayed-grade selection.');

const quarter={...record,source:undefined,programType:'SHS',gradingPeriod:'1st Quarter',normalizedGrade:'88'};
assert.equal(buildShsRows([],[quarter],'1st Semester')[0].instructor,'Original Instructor');
assert.equal(buildShsRows([subject],[quarter],'1st Semester')[0].instructor,'Original Instructor');
assert.equal(buildShsRows([],[{...quarter,instructorName:undefined}],'1st Semester')[0].instructor,'TBA');
assert.equal(buildShsRows([subject],[{...quarter,instructorName:undefined}],'1st Semester')[0].instructor,'Current Instructor');
rows=buildShsRows([],[quarter,{...quarter,id:'quarter-two',gradingPeriod:'2nd Quarter',instructorName:'Second Instructor',normalizedGrade:'90'}],'1st Semester');
assert.equal(rows[0].instructor,'Original Instructor, Second Instructor');
assert.equal(rows[0].firstQuarter,'88');assert.equal(rows[0].secondQuarter,'90');
assert.equal(rows[0].semesterFinalGrade,'89');
console.log('SHS instructor checks passed: removed/replaced assignment, original quarter authors, preserved grades, and missing-name fallbacks.');
