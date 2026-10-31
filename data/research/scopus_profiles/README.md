# Scopus export of the researchers' whole author profiles (optional)

The researcher pages show two Scopus figures: the documents with a **University of Petra** affiliation
(from `../scopus_export`), and the researcher's **whole Scopus author profile** (every affiliation, the whole
career) — the numbers on the author's page on scopus.com (Documents, Citations, h-index).

The whole profiles come from the Scopus API every week. To make them match scopus.com exactly at any time:

1. In Scopus → Advanced document search, paste the query in `query.txt` (one `AU-ID(...)` per researcher).
2. Select all results → **Export → CSV**, with at least: Author(s) ID, Title, Year, Cited by, EID.
3. Save the file here (any name ending in `.csv`) and commit, then save `../overrides.json` (or wait for the
   weekly run) to rebuild. The newest file wins when a document appears in several.
