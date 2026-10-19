begin;

-- Prior terms are display-only until a real grade is recorded. Attribution is
-- saved in the existing grade payload and never creates instructor assignments.
create function public.save_imported_student_historical_grades(p_branch text, p_student_number text, p_records jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_student record;
  v_row jsonb;
  v_subject record;
  v_teacher record;
  v_level integer;
  v_current_level integer;
  v_start integer;
  v_semester text;
  v_period text;
  v_id text;
  v_grade text;
  v_percentage numeric;
  v_numeric numeric;
  v_normalized text;
  v_evaluation text;
  v_existing jsonb;
  v_payload jsonb;
  v_seen text[] := array[]::text[];
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' then raise exception 'Grades must be a list.'; end if;
  if jsonb_array_length(p_records) not between 1 and 2 then raise exception 'Save one subject at a time.'; end if;
  select student.*, imported.academic_year as imported_year, imported.semester as imported_semester,
    program.name as program_name, track.name as track_name into v_student
  from public.student_profiles student
  join public.student_import_details imported on imported.student_id = student.id
  join public.admission_branches branch on branch.id = student.branch_id and branch.is_active
  join public.program_offerings offering on offering.id = student.program_offering_id
  join public.academic_programs program on program.id = offering.program_id
  join public.program_tracks track on track.id = student.track_id
  where upper(student.student_number) = upper(trim(p_student_number))
    and (lower(branch.name) = lower(trim(p_branch)) or lower(branch.code) = lower(trim(p_branch)))
  for update of student;
  if not found then raise exception 'An imported student in this active branch is required.'; end if;
  v_current_level := case v_student.year_level when '1st Year' then 1 when '2nd Year' then 2 when '3rd Year' then 3 when '4th Year' then 4 when 'Grade 11' then 1 when 'Grade 12' then 2 end;
  if v_current_level is null then raise exception 'The student year level is not supported.'; end if;
  for v_row in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(v_row) <> 'object' then raise exception 'Each grade must contain named fields.'; end if;
    v_level := case v_row->>'yearLevel' when '1st Year' then 1 when '2nd Year' then 2 when '3rd Year' then 3 when '4th Year' then 4 when 'Grade 11' then 1 when 'Grade 12' then 2 end;
    v_semester := v_row->>'semester'; v_period := v_row->>'gradingPeriod';
    if v_level is null or v_level > v_current_level or v_semester not in ('1st Semester','2nd Semester') or v_semester is null then raise exception 'Choose a prior year and semester.'; end if;
    v_start := split_part(v_student.imported_year,'-',1)::integer - v_current_level + v_level;
    if (v_row->>'academicYear') is distinct from (v_start::text || '-' || (v_start+1)::text)
      or (v_level = v_current_level and array_position(array['1st Semester','2nd Semester','Summer'],v_semester) >= array_position(array['1st Semester','2nd Semester','Summer'],v_student.imported_semester)) then
      raise exception 'Historical grades must precede the imported term.';
    end if;
    select * into v_subject from public.branch_academic_subjects subject
    where subject.branch_id = v_student.branch_id and subject.is_active
      and upper(subject.code) = upper(trim(v_row->>'subjectCode'))
      and subject.program = case when v_student.program_name = 'College' then 'College' else 'SHS' end
      and subject.year_level = v_row->>'yearLevel' and subject.semester = v_semester
      and (coalesce(trim(subject.strand),'') = '' or lower(subject.strand) in ('all','all strands','all courses')
        or lower(split_part(subject.strand,' - ',1)) = lower(split_part(v_student.track_name,' - ',1)))
    limit 1;
    if not found then raise exception 'This subject is not configured for the student course, year and semester in this branch.'; end if;
    select * into v_teacher from public.branch_academic_instructors instructor
      where instructor.branch_id = v_student.branch_id and instructor.is_active and instructor.external_id = v_row->>'instructorId';
    if not found then raise exception 'Choose an active instructor from this branch.'; end if;
    if (v_subject.program = 'College' and v_period is distinct from v_semester)
      or (v_subject.program = 'SHS' and (v_period is null or not (v_period = any(case when v_semester = '1st Semester' then array['1st Quarter','2nd Quarter'] else array['3rd Quarter','4th Quarter'] end)))) then raise exception 'Invalid grading period.'; end if;
    v_grade := upper(trim(coalesce(v_row->>'grade','')));
    v_numeric := null;
    if v_subject.program = 'College' and v_grade in ('INC','INCOMPLETE','FAILED','FAIL','DRP','DROPPED','DROPPED SUBJECT') then
      v_normalized := case when v_grade in ('INC','INCOMPLETE') then 'INC' when v_grade in ('FAILED','FAIL') then '5.00' else 'DRP' end;
      v_evaluation := case when v_normalized = 'INC' then 'Incomplete' else 'Failed' end;
    else
      if v_grade !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'Enter a valid numeric grade or supported College mark.'; end if;
      v_percentage := v_grade::numeric;
      if v_subject.program = 'College' then
        if v_percentage not between 50 and 100 then raise exception 'College grades must be percentage grades from 50 to 100.'; end if;
        v_percentage := round(v_percentage,1);
        v_numeric := case when v_percentage >= 96.7 then 1 when v_percentage >= 93.4 then 1.25 when v_percentage >= 90.1 then 1.5 when v_percentage >= 86.7 then 1.75 when v_percentage >= 83.4 then 2 when v_percentage >= 80.1 then 2.25 when v_percentage >= 76.7 then 2.5 when v_percentage >= 73.4 then 2.75 when v_percentage >= 70 then 3 else 4 end;
        v_normalized := to_char(v_numeric,'FM0.00');
        v_evaluation := case when v_numeric <= 3 then 'Passed' else 'Failed' end;
      else
        if v_percentage not between 60 and 100 then raise exception 'SHS grades must be from 60 to 100.'; end if;
        v_numeric := v_percentage; v_normalized := trim(v_row->>'grade');
        v_evaluation := case when v_percentage >= 75 then 'Passed' else 'Failed' end;
      end if;
    end if;
    v_id := upper(v_student.student_number || '::' || v_subject.code || '::' || (v_row->>'academicYear') || '::' || v_semester || '::' || v_period);
    if v_id = any(v_seen) then raise exception 'Duplicate grade period.'; end if;
    v_seen := array_append(v_seen,v_id);
    select grade.payload into v_existing from public.branch_student_grade_records grade
      where grade.branch_id = v_student.branch_id and upper(grade.student_number) = upper(v_student.student_number)
        and upper(grade.subject_code) = upper(v_subject.code) and grade.academic_year = v_row->>'academicYear' and grade.semester = v_semester and grade.grading_period = v_period;
    if found and (coalesce(v_existing->>'source','') <> 'historical' or v_existing->>'id' <> v_id) then raise exception 'An uploaded grade already exists for this subject and period. Use the existing grade controls.'; end if;
    v_payload := jsonb_build_object('id',v_id,'studentId',v_student.student_number,
      'fullName',concat_ws(' ',v_student.first_name,nullif(v_student.middle_name,''),v_student.last_name),
      'subjectCode',v_subject.code,'subjectTitle',v_subject.name,'units',v_subject.units,
      'programType',v_subject.program,'yearLevel',v_subject.year_level,'academicYear',v_row->>'academicYear',
      'semester',v_semester,'gradingPeriod',v_period,'grade',trim(v_row->>'grade'),
      'normalizedGrade',v_normalized,'numericGrade',v_numeric,'evaluation',v_evaluation,
      'source','historical','instructorId',v_teacher.external_id,'instructorName',v_teacher.name,'instructorEmployeeId',v_teacher.employee_id,
      'recordedBy',left(coalesce(v_row->>'recordedBy','Staff'),160),'updatedAt',now());
    perform public.upsert_student_grade_record(p_branch,v_payload);
  end loop;
end;
$$;
revoke all on function public.save_imported_student_historical_grades(text,text,jsonb) from public;
grant execute on function public.save_imported_student_historical_grades(text,text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
