# atur-kelas

Domain glossary for an automated weekly-timetable (_jadwal pelajaran_) generator for
Indonesian schools under **Kurikulum Merdeka**. This file is a glossary only — no
implementation details. See `docs/timetabling-design.md` for design and `docs/adr/` for
decisions.

## Language

### Curriculum structure (Kurikulum Merdeka)

**Struktur Kurikulum**:
Kurikulum Merdeka's full curriculum structure = **Intrakurikuler** + **Kokurikuler** +
**Ekstrakurikuler**. The app covers **Intrakurikuler only**.

**Intrakurikuler**:
The routine, scheduled weekly teaching of mata pelajaran. This is the _only_ thing the
app schedules.

**Kokurikuler / P5** (_Projek Penguatan Profil Pelajar Pancasila_):
Cross-disciplinary, project-based learning run by facilitator teams, taking ~20–30% of
annual JP, scheduled _outside_ the routine timetable (typically block-weeks/days).
**Out of scope** — schools run it off the weekly jadwal.

**Ekstrakurikuler**:
Voluntary activities outside _jam pelajaran reguler_. **Out of scope.**

**Muatan lokal** (mulok):
Locally-defined content. Supported _only_ when run as a standalone subject (then it is
just another **Mata pelajaran**); muatan lokal integrated into other subjects or into P5
is out of scope.

**Capaian Pembelajaran (CP)**:
Learning-outcome competency, defined per **Fase** (not per grade). The app does _not_
model CP.
_Avoid_: using "curriculum" to mean CP.

### Time & scope

**Fase**:
Kurikulum Merdeka developmental phase (A–F) spanning multiple grades; the unit CP is
written against. Distinct from grade.

**Kelas / Tingkat** (grade level):
A school year, e.g. "Kelas 7". **Hour allocation (alokasi waktu) is per grade**, even
though competency is per fase.

**Jenjang**:
Education level — SD / SMP / SMA. In-scope jenjang: SD, SMP, and **SMA kelas X only**
(all fixed-rombel). SMA kelas XI–XII _mata pelajaran pilihan_ (moving-class) is out of
scope.

**Term**:
One semester. The top scoping unit for setup; one active term per organization. A new
semester is a new (or cloned) term.

**Alokasi waktu / Beban belajar**:
JP allocation per subject. Kurikulum Merdeka defines it **annually**; the app uses
**per-grade weekly counts, constant across the term** (schools convert annual JP to
integer weekly counts themselves). P5 hours are kept out by excluding them from the
**bell schedule** (see below), not by adjusting these counts.

**JP** (_jam pelajaran_):
One lesson period — the unit a teaching slot holds.

### Core entities

**Rombel** (_rombongan belajar_; the app's `classGroup`):
The fixed group of students that stays in one room; teachers rotate to it. e.g. "7A".
_Avoid_: bare "class" when "grade" is meant — a Rombel is a single section, a Kelas is a
whole grade.

**Mata pelajaran** (subject; the app's `subject`):
A taught subject, e.g. Matematika.

**Penugasan** (teaching load; the app's `assignment`):
Binds a **Mata pelajaran** + **Teacher** to a **Rombel** with a weekly count.

**Bell schedule**:
Per-term definition of the daily teaching window + breaks per weekday; teaching **slots**
are derived from it, and the feasibility target **T** is the slot count. Must represent
the _intrakurikuler_ routine week **only** — a fixed weekly P5 day/block must be excluded
from it, otherwise feasibility wrongly demands intrakurikuler subjects fill that time.

## Relationships

- A **Rombel** belongs to one **Kelas (grade)** within one **Term**.
- The **intrakurikuler alokasi waktu** is defined per **Kelas (grade)** and inherited by
  every **Rombel** in that grade.
- A **Penugasan** binds **Mata pelajaran** + **Teacher** → **Rombel** (with a weekly count).
- Per Rombel: Σ Penugasan weekly counts == number of teaching **slots** in the week
  (the feasibility invariant — intrakurikuler only).
- **Kokurikuler (P5)** and **Ekstrakurikuler** are part of the **Struktur Kurikulum** but
  are **out of scope**; the app schedules **Intrakurikuler** only.

## Example dialogue

> **Dev:** "A school reserves 25% of its annual hours for P5 — do those slots show up on
> the generated jadwal?"
> **Domain expert:** "No. P5 is Kokurikuler — it runs outside the routine week, usually
> as block-weeks. The bell schedule covers only intrakurikuler time, so the jadwal we
> generate is pure Intrakurikuler; P5 never enters the grid."
> **Dev:** "And the per-grade hour table — that's their Capaian Pembelajaran?"
> **Domain expert:** "No. CP is competency, defined per Fase. That table is just the
> _alokasi waktu_ — weekly JP per subject per grade."

## Flagged ambiguities

- The app's `curriculum` / `curriculumEntry` table was named "curriculum" but holds the
  **intrakurikuler alokasi waktu** (per-grade weekly JP) — _not_ Kurikulum Merdeka's full
  **Struktur Kurikulum**, and _not_ **Capaian Pembelajaran**. Resolved: renamed to
  **`subjectHours`** (`subject_hours`) in code/DB; the user-facing label stays the familiar
  "Kurikulum / Alokasi Waktu".
- "Class" is overloaded: **Rombel** (one section, "7A") vs **Kelas/grade** ("Kelas 7").
  Resolved: these are distinct; prefer "rombel" and "grade".
