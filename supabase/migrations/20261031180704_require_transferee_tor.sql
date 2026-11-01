-- TOR is mandatory for transferee applications; other optional documents
-- can still be submitted later through the normal Continue action.
update public.admission_requirement_rules as rule
set is_optional = false
from public.admission_student_statuses as status,
     public.admission_requirement_types as requirement
where rule.student_status_id = status.id
  and rule.requirement_type_id = requirement.id
  and status.label = 'Transferee'
  and requirement.code = 'transcript_of_records';
