# Scope: fixed-rombel intrakurikuler timetabling under Kurikulum Merdeka

Status: accepted (2026-06-21)

atur-kelas generates the weekly _jadwal pelajaran_ for the **intrakurikuler** portion of
Kurikulum Merdeka only, for **fixed-rombel** jenjang (**SD, SMP, SMA kelas X**). We
deliberately exclude three parts of Kurikulum Merdeka's struktur kurikulum, because each
would break the model that makes generation guaranteed-fast and feasibility checkable up
front (a bipartite edge-coloring — see `docs/timetabling-design.md` §5, §10).

## The three deliberate exclusions

- **SMA kelas XI–XII _mata pelajaran pilihan_ (moving-class).** Students each pick 4–5 of
  7 subjects, so same-grade students take different subject sets. This turns placement
  into list edge-coloring (NP-hard for bipartite graphs) and removes the up-front
  feasibility guarantee. SD / SMP / SMA-X all keep the fixed-rombel model and are
  unaffected.
- **Kokurikuler / P5 (_Projek Penguatan Profil Pelajar Pancasila_).** ~20–30% of annual
  JP, run by facilitator teams, scheduled _outside_ the routine week (typically
  block-weeks). It is not a single-teacher/single-subject weekly cell, so it does not fit
  the grid. Schools run it off the weekly jadwal. P5 is kept out of the schedule by
  excluding it from the **bell schedule** — the feasibility target `T` is derived from the
  bell schedule, so a fixed weekly P5 block must not be entered as a teaching slot, or
  feasibility will wrongly demand intrakurikuler subjects fill it.
- **Ekstrakurikuler.** Voluntary, outside _jam pelajaran reguler_. Not part of the
  jadwal.

## Why this is safe under Kurikulum Merdeka

Kurikulum Merdeka defines beban belajar **annually** (not weekly) to allow semester /
catur wulan / sistem blok flexibility. We model **one constant weekly pattern per term**,
where a term = one semester. For intrakurikuler this is sufficient: schools convert annual
JP into integer weekly counts themselves, and a new semester is a new (or cloned) term.
Within a semester the intrakurikuler weekly pattern is constant — the block flexibility
Kurikulum Merdeka grants is used mainly by P5, which is out of scope.

## Consequences

- Solver, feasibility pre-check, and the per-class grid are **unchanged** by Kurikulum
  Merdeka alignment.
- If we ever add SMA XI–XII pilihan or on-grid P5, this ADR must be revisited — both
  break the König guarantee and require softening §1/§4/§10 of the design doc.
- Muatan lokal is supported only **as a standalone subject** (it is then just another
  `subject`); muatan lokal integrated into other subjects or into P5 is out of scope.
