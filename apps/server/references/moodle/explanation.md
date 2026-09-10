Read whole file. Break into 4 layer.

**1. Quiz core (`quiz` table + config)**

- `Quiz` — settings: timing, attempts allowed, grading method, review options, password/subnet security.
- `QuizSections` — heading groups of slots, shuffle per section.
- `QuizSlots` — question order in quiz, page, maxmark. One row per question-in-quiz.
- `QuizOverrides` — per-user/per-group override of timeopen/close/attempts/password.
- `QuizFeedback` — text shown per grade band.
- `QuizaccessSebQuizsettings` / `QuizaccessSebTemplate` — Safe Exam Browser lockdown config.

**2. Question bank (versioned, shared across quizzes)**

- `Question` — core row: qtype, text, mark, penalty. Self-relation `parent` for cloze/random subquestions.
- `QuestionBankEntries` — stable identity of question (category, owner).
- `QuestionVersions` — links entry → actual `Question` row per version (draft/ready/hidden).
- `QuestionCategories` — tree (self-relation) grouping bank entries by context.
- `QuestionReferences` / `QuestionSetReferences` — where a question (or question set, e.g. random) is used by a quiz slot — decouples quiz from question via `itemid`/`component`/`questionarea` (polymorphic-ish, no FK to quiz_slots itself).

**3. Qtype-specific option tables (1:1 or 1:N off `Question.id`)**
Each qtype has own table(s): `QuestionAnswers` (generic answer+fraction+feedback, used by shortanswer/multichoice/etc.), `QuestionTruefalse`, `QuestionNumerical(+Options/Units)`, `QuestionCalculated(+Options)`, `QuestionMultianswer` (cloze), `QuestionMultichoiceOptions`, `QuestionMatchOptions/Subquestions`, `QuestionDatasets/DatasetDefinitions/DatasetItems` (calculated random vals), `QuestionDdwtos`/`QtypeDdimageortext*`/`QtypeDdmarker*` (drag-drop variants), `QuestionGapselect`, `QtypeEssayOptions`, `QtypeShortanswerOptions`, `QtypeRandomsamatchOptions`, `QuestionHints`. Pattern same everywhere: FK `questionid`/`question` → `Question.id`.

**4. Attempts (runtime, uses Question Engine "usage" abstraction)**

- `QuizAttempts` — student's attempt at a quiz. FK `uniqueid` → `QuestionUsages.id` (indirection: quiz doesn't hold answers directly).
- `QuestionUsages` — generic container, tagged by `component` (mod_quiz here), holds N `QuestionAttempts`.
- `QuestionAttempts` — one row per question-slot within a usage. `slot` matches `QuizSlots.slot`. Holds maxmark, current summary.
- `QuestionAttemptSteps` — history of states (each interaction = step), sequenced.
- `QuestionAttemptStepData` — key/value blob per step (raw submitted data).
- `QuizGrades` — final quiz grade per user (post-aggregation of attempts per `grademethod`).
- `QuizOverviewRegrades` — regrade audit trail, old/new fraction per slot.

**Stats/reporting**: `QuizStatistics`, `QuestionStatistics`, `QuestionResponseAnalysis`+`QuestionResponseCount` — cached analytics, no live FK back into attempt flow besides `questionid`.

Core chain: `Quiz` →(`QuizSlots`)→ `QuestionReferences`/`QuestionVersions` →`Question` →qtype tables. Runtime: `QuizAttempts`→`QuestionUsages`→`QuestionAttempts`→`QuestionAttemptSteps`→`QuestionAttemptStepData`. Two axes stay decoupled — question bank design-time vs quiz attempt runtime — join only through `slot` numbers and `QuestionReferences`.
