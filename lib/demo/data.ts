import type { Fact, Job, Requirement } from "@/lib/domain";
import type { YearMonth } from "@/lib/dates/parse";
import type { ResumeContent } from "@/lib/render/model";

// Sample data for a made-up person. Read-only, no AI calls. Statuses shown in
// the demo are computed from this data by the same code the app uses.

/** Fixed "today" so the demo's numbers never drift. */
export const DEMO_AS_OF: YearMonth = { year: 2026, month: 9 };

export const demoProfile = {
  full_name: "Jordan Rivera",
  email: "jordan.rivera@example.com",
  phone: "(555) 014-2290",
  location: "Columbus, OH",
  headline: "Lead Custodian · Infection control and staff training",
};

export const demoJobs: Job[] = [
  {
    id: "job-riverside",
    code: "j1",
    employer: "Riverside Regional Medical Center",
    title: "Lead Custodian",
    location: "Columbus, OH",
    start_date: "2019-06",
    end_date: "present",
    dates_uncertain: false,
    status: "confirmed",
  },
  {
    id: "job-franklin",
    code: "j2",
    employer: "Franklin County Schools",
    title: "Custodian",
    location: "Columbus, OH",
    start_date: "2016-03",
    end_date: "2019-08",
    dates_uncertain: false,
    status: "confirmed",
  },
];

type DemoFactInput = Omit<Fact, "id" | "origin" | "status" | "note" | "job_id" | "source_passage"> &
  Partial<Pick<Fact, "origin" | "status" | "note" | "job_id" | "source_passage">>;

function fact(input: DemoFactInput): Fact {
  return {
    id: `fact-${input.code}`,
    origin: "resume",
    status: "confirmed",
    note: null,
    job_id: null,
    source_passage: null,
    ...input,
  };
}

export const demoFacts: Fact[] = [
  fact({
    code: "E1",
    type: "duty",
    job_id: "job-riverside",
    text: "Cleaned and disinfected patient rooms, operating suites, and common areas following hospital infection-control procedures.",
    source_passage: "Clean and disinfect patient rooms, OR suites and common areas per infection control procedures",
  }),
  fact({
    code: "E2",
    type: "duty",
    job_id: "job-riverside",
    text: "Assigned daily cleaning tasks to a crew of 5 custodians on the evening shift.",
    source_passage: "Assign daily tasks to 5-person evening crew",
  }),
  fact({
    code: "E3",
    type: "accomplishment",
    job_id: "job-riverside",
    text: "Trained 12 new custodial staff on safe chemical handling and isolation-room cleaning.",
    source_passage: "Trained 12 new hires on chemical safety and isolation room cleaning",
  }),
  fact({
    code: "E4",
    type: "duty",
    job_id: "job-riverside",
    text: "Completed the hospital's LMS training modules and helped coworkers log in and access their assigned courses.",
    source_passage: "Completed LMS modules; helped coworkers log in and find assigned courses",
  }),
  fact({
    code: "E5",
    type: "accomplishment",
    job_id: "job-riverside",
    text: "Kept terminal-clean turnaround for discharged patient rooms under 45 minutes.",
    source_passage: "Kept terminal clean turnaround under 45 minutes",
  }),
  fact({
    code: "E6",
    type: "duty",
    job_id: "job-riverside",
    text: "Recorded cleaning logs and supply counts in the department's tracking spreadsheet.",
    source_passage: "Record cleaning logs and supply counts in department spreadsheet",
  }),
  fact({
    code: "E7",
    type: "duty",
    job_id: "job-franklin",
    text: "Cleaned classrooms, restrooms, and gym floors for a 900-student elementary school.",
    source_passage: "Cleaned classrooms, restrooms and gym floors (900-student elementary)",
  }),
  fact({
    code: "E8",
    type: "duty",
    job_id: "job-franklin",
    text: "Set up and took down tables and chairs for school events.",
    source_passage: "Set up / take down tables and chairs for events",
  }),
  fact({
    code: "E9",
    type: "duty",
    job_id: "job-franklin",
    text: "Reported maintenance issues to the facilities office through the work-order system.",
    source_passage: "Reported maintenance issues via work order system",
  }),
  fact({ code: "E10", type: "skill", text: "Infection control procedures", source_passage: "Skills: Infection control" }),
  fact({ code: "E11", type: "skill", text: "Microsoft Excel", source_passage: "Skills: … Microsoft Excel" }),
  fact({
    code: "E12",
    type: "skill",
    text: "Microsoft Teams",
    status: "pending",
    source_passage: "Skills: … MS Teams",
  }),
  fact({
    code: "E13",
    type: "skill",
    text: "Floor care equipment (auto-scrubbers, burnishers)",
    source_passage: "Skills: … floor machines (auto scrubber, burnisher)",
  }),
  fact({ code: "E14", type: "skill", text: "Bilingual: English and Spanish", source_passage: "Bilingual English/Spanish" }),
  fact({
    code: "E15",
    type: "education",
    text: "Associate of Applied Science (A.A.S.) in Facilities Management, Columbus State Community College. Completed 2021.",
    source_passage: "A.A.S. Facilities Management, Columbus State CC, 2021",
  }),
  fact({
    code: "E16",
    type: "education",
    text: "Bachelor of Science (B.S.) in Health Services Administration, Franklin University. In progress, expected 2027.",
    source_passage: "B.S. Health Services Administration, Franklin University (expected 2027)",
  }),
  fact({
    code: "E17",
    type: "certification",
    text: "OSHA 10-Hour General Industry certification",
    source_passage: "OSHA 10",
  }),
  fact({
    code: "E18",
    type: "certification",
    text: "Certified Healthcare Environmental Services Technician (CHEST), AHE",
    source_passage: "CHEST certified (AHE)",
  }),
  fact({
    code: "E19",
    type: "training",
    text: "Annual bloodborne pathogens training",
    source_passage: "Bloodborne pathogens training (annual)",
  }),
  fact({
    code: "E20",
    type: "summary_claim",
    text: "8+ years of experience in custodial and environmental services.",
    source_passage: "8+ years of experience in custodial and environmental services",
  }),
  fact({
    code: "E21",
    type: "answer",
    origin: "answer",
    job_id: "job-riverside",
    text: "Tracked completion of required annual safety trainings for the 5-person evening crew in a shared spreadsheet.",
    note: "From your answer on a previous application.",
  }),
];

const byCode = (code: string) => {
  const found = demoFacts.find((f) => f.code === code);
  if (!found) throw new Error(`Demo fact ${code} missing`);
  return found.id;
};

export const demoApplication = {
  id: "demo-app",
  title: "Training & Compliance Coordinator",
  employer: "Mercy Valley Health",
  status: "draft" as const,
  created_at: "2026-09-14T15:00:00.000Z",
  ignored_note:
    "Pay ($52,000–$61,000), benefits, the hybrid schedule, location, company background, and the equal-opportunity statement.",
  posting_text: `Training & Compliance Coordinator
Mercy Valley Health · Environmental Services Department · Columbus, OH (hybrid)

About us
Mercy Valley Health is a 420-bed regional health system serving central Ohio. We believe a clean, safe environment is the foundation of patient care.

What you'll do
- Coordinate onboarding and ongoing training for 140 environmental services staff across three shifts.
- Track and report training completion and compliance records for the department.
- Maintain the department's courses and user accounts in our learning management system (LMS).
- Partner with Infection Prevention to keep training aligned with OSHA and infection-control standards.
- Prepare the department for Joint Commission surveys.

What you'll need (required)
- At least 3 years of experience in a healthcare or facilities environment.
- Experience training or onboarding staff.
- Experience tracking and reporting training completion or compliance records.
- Working knowledge of OSHA and infection-control standards.
- Proficiency with Microsoft Office and Microsoft Teams.
- Experience administering a learning management system (LMS).

Nice to have (preferred)
- Bachelor's degree in health administration, education, or a related field.
- Bilingual in English and Spanish.
- Experience with Joint Commission survey readiness.

Pay and benefits
$52,000–$61,000 per year. Medical, dental and vision from day one, 403(b) with match, tuition assistance, and paid time off.

Schedule
Monday–Friday, 8:00–4:30, with two remote days per week after training.

Mercy Valley Health is an equal opportunity employer. All qualified applicants will receive consideration without regard to race, color, religion, sex, sexual orientation, gender identity, national origin, disability, or veteran status.

To apply, submit your resume and cover letter through our careers site.`,
};

function requirement(
  input: Omit<Requirement, "id" | "parts" | "logic" | "user_gap" | "answered" | "years_required" | "relevant_job_ids" | "question"> &
    Partial<Requirement>,
): Requirement {
  return {
    id: `req-${input.code}`,
    parts: [],
    logic: "all",
    user_gap: false,
    answered: false,
    years_required: null,
    relevant_job_ids: [],
    question: null,
    ...input,
  };
}

export const demoRequirements: Requirement[] = [
  requirement({
    code: "R1",
    position: 1,
    kind: "required",
    text: "At least 3 years of experience in a healthcare or facilities environment",
    ai_status: "strong",
    years_required: 3,
    relevant_job_ids: ["job-riverside", "job-franklin"],
    evidence_fact_ids: [byCode("E1"), byCode("E7")],
    explanation: "Both of your jobs were in hospital or school facilities, and together they cover well over 3 years.",
  }),
  requirement({
    code: "R2",
    position: 2,
    kind: "required",
    text: "Experience training or onboarding staff",
    ai_status: "strong",
    evidence_fact_ids: [byCode("E3")],
    explanation: "You trained 12 new custodial staff on chemical safety and isolation-room cleaning.",
  }),
  requirement({
    code: "R3",
    position: 3,
    kind: "required",
    text: "Experience tracking and reporting training completion or compliance records",
    ai_status: "partial",
    evidence_fact_ids: [byCode("E21"), byCode("E6")],
    explanation:
      "You tracked safety-training completion for your crew. Your record doesn't say whether you reported it to anyone.",
    question:
      "You tracked annual safety-training completion for your 5-person crew in a spreadsheet. Did you also share or report those records to a manager, Infection Prevention, or an auditor? If so, who received them and how often?",
  }),
  requirement({
    code: "R4",
    position: 4,
    kind: "required",
    text: "Working knowledge of OSHA and infection-control standards",
    ai_status: "strong",
    evidence_fact_ids: [byCode("E17"), byCode("E10"), byCode("E19"), byCode("E1")],
    explanation: "You hold OSHA 10 and do infection-control cleaning daily, backed by annual bloodborne pathogens training.",
  }),
  requirement({
    code: "R5",
    position: 5,
    kind: "required",
    text: "Proficiency with Microsoft Office and Microsoft Teams",
    logic: "all",
    parts: ["Microsoft Office", "Microsoft Teams"],
    ai_status: "strong",
    evidence_fact_ids: [byCode("E11"), byCode("E12")],
    explanation: "Your resume lists Excel and Teams. Teams hasn't been confirmed yet.",
  }),
  requirement({
    code: "R6",
    position: 6,
    kind: "required",
    text: "Experience administering a learning management system (LMS)",
    ai_status: "unknown",
    evidence_fact_ids: [byCode("E4")],
    explanation:
      "You've used the hospital's LMS as a learner and helped coworkers log in. That isn't the same as running it, and nothing in your record says you managed courses or users.",
    question:
      "You've helped coworkers log in and find courses in the hospital's LMS. Have you ever had admin access, for example adding users, assigning courses, or pulling completion reports? If so, which system was it?",
  }),
  requirement({
    code: "R7",
    position: 7,
    kind: "preferred",
    text: "Bachelor's degree in health administration, education, or a related field",
    logic: "any",
    parts: ["Health administration", "Education", "Related field"],
    ai_status: "partial",
    evidence_fact_ids: [byCode("E16"), byCode("E15")],
    explanation:
      "Your B.S. in Health Services Administration is in progress (expected 2027). An in-progress degree isn't a completed one, so this is only partly met.",
  }),
  requirement({
    code: "R8",
    position: 8,
    kind: "preferred",
    text: "Bilingual in English and Spanish",
    ai_status: "strong",
    evidence_fact_ids: [byCode("E14")],
    explanation: "Your resume says you're bilingual in English and Spanish.",
  }),
  requirement({
    code: "R9",
    position: 9,
    kind: "preferred",
    text: "Experience with Joint Commission survey readiness",
    ai_status: "unknown",
    user_gap: true,
    evidence_fact_ids: [],
    explanation: "Nothing in your record mentions Joint Commission surveys, and you told us you don't have this.",
  }),
];

export const demoResume: ResumeContent = {
  summary: {
    text: "Environmental services professional with 8+ years in hospital and school settings, focused on infection-control cleaning and training new staff.",
    fact_ids: [byCode("E20"), byCode("E1"), byCode("E3")],
    reviewed: false,
    ai_check: { ok: true, issue: null },
  },
  jobs: [
    {
      job_id: "job-riverside",
      bullets: [
        {
          id: "b1",
          text: "Trained 12 new custodial staff on safe chemical handling and isolation-room cleaning.",
          fact_ids: [byCode("E3")],
          requirement_codes: ["R2"],
          relevance: 3,
          included: true,
          reviewed: false,
          ai_check: { ok: true, issue: null },
        },
        {
          id: "b2",
          text: "Managed LMS training compliance for the evening custodial team.",
          fact_ids: [byCode("E4")],
          requirement_codes: ["R6", "R3"],
          relevance: 3,
          included: true,
          reviewed: false,
          ai_check: {
            ok: false,
            issue:
              "The cited fact says you completed LMS training and helped coworkers access courses. It doesn't say you managed anyone's compliance.",
          },
        },
        {
          id: "b3",
          text: "Tracked annual safety-training completion for a 5-person evening crew in a shared spreadsheet.",
          fact_ids: [byCode("E21"), byCode("E6")],
          requirement_codes: ["R3"],
          relevance: 3,
          included: true,
          reviewed: false,
          ai_check: { ok: true, issue: null },
        },
        {
          id: "b4",
          text: "Cleaned and disinfected patient rooms, operating suites, and common areas following infection-control procedures.",
          fact_ids: [byCode("E1")],
          requirement_codes: ["R4"],
          relevance: 3,
          included: true,
          reviewed: false,
          ai_check: { ok: true, issue: null },
        },
        {
          id: "b5",
          text: "Kept terminal-clean turnaround for discharged patient rooms under 45 minutes.",
          fact_ids: [byCode("E5")],
          requirement_codes: [],
          relevance: 2,
          included: true,
          reviewed: false,
          ai_check: { ok: true, issue: null },
        },
        {
          id: "b6",
          text: "Assigned daily cleaning tasks to a 5-person evening crew.",
          fact_ids: [byCode("E2")],
          requirement_codes: [],
          relevance: 2,
          included: true,
          reviewed: false,
          ai_check: { ok: true, issue: null },
        },
      ],
    },
    {
      job_id: "job-franklin",
      bullets: [
        {
          id: "b7",
          text: "Cleaned classrooms, restrooms, and gym floors for a 900-student elementary school.",
          fact_ids: [byCode("E7")],
          requirement_codes: ["R1"],
          relevance: 1,
          included: true,
          reviewed: false,
          ai_check: { ok: true, issue: null },
        },
        {
          id: "b8",
          text: "Reported maintenance issues to the facilities office through the work-order system.",
          fact_ids: [byCode("E9")],
          requirement_codes: [],
          relevance: 1,
          included: true,
          reviewed: false,
          ai_check: { ok: true, issue: null },
        },
      ],
    },
  ],
  skills: [
    { text: "Infection control procedures", fact_ids: [byCode("E10")], included: true },
    { text: "Microsoft Excel", fact_ids: [byCode("E11")], included: true },
    { text: "Floor care equipment", fact_ids: [byCode("E13")], included: true },
    { text: "Bilingual: English and Spanish", fact_ids: [byCode("E14")], included: true },
  ],
};

export const demoCoverLetter = `Dear Hiring Manager,

I'm applying for the Training & Compliance Coordinator role at Mercy Valley Health. For the last seven years I've worked as a Lead Custodian at Riverside Regional Medical Center, where training people to clean safely has become the part of the job I care about most.

At Riverside I've trained 12 new custodial staff on safe chemical handling and isolation-room cleaning. I teach the way I'd want to be taught: on the floor, one step at a time, until the new person can show me they've got it. Infection control isn't abstract for me. I clean and disinfect patient rooms and operating suites every shift, and I hold an OSHA 10 certification and a CHEST certification.

I've also kept the records side organized. I track completion of the required annual safety trainings for my evening crew in a shared spreadsheet, so nobody falls behind on what they need to stay current. I'd welcome the chance to do that work for a full department.

I'm finishing a B.S. in Health Services Administration at Franklin University, expected in 2027, and I'm bilingual in English and Spanish, which helps when explaining procedures to coworkers who are more comfortable in Spanish.

Thank you for considering my application. I'd be glad to talk about how I could support your training and compliance work.

Sincerely,
Jordan Rivera`;
