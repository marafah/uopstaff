# Scopus export (optional)

Put CSV files exported from Scopus here; the next run of **Update research data** merges them
(documents are matched to researchers by Scopus Author ID, and to publications by DOI or title).

1. Open the University of Petra organization page: https://www.scopus.com/pages/organization/60040839
2. Open the documents list → select all → **Export → CSV**, with at least: Authors, Author(s) ID, Title, Year,
   Source title, Cited by, DOI, Document Type, Open Access, EID.
3. Save the file here (any name ending in `.csv`) and commit. Pushing a file here starts the update automatically.
